/**
 * 双向同步引擎。
 *
 * 模型：Last-Write-Wins + 墓碑删除 + 增量游标。
 *
 *   本地每条记录有 updatedAt；syncState 里记一个 lastPulledAt 游标。
 *   一次同步 = 把「本地 updatedAt > lastPushedAt 的记录」推上去，
 *             同时把「服务端 updatedAt > lastPulledAt 的记录」拉下来按 LWW 合并。
 *
 * 为什么够用：这是单人多设备场景，真正的并发冲突极少；
 * LWW 的语义（最后改的赢）对人来说也最符合直觉。
 * 访问次数 visits 特殊处理成「取最大值」，避免多设备互相把计数改小。
 */

import type { Bookmark, Category, SyncPayload } from '~shared/model'
import { shouldOverwrite } from '~shared/model'
import * as api from '@/api/client'
import { db, getSyncState, setSyncState } from '@/db/index'

const KEY_LAST_PULLED = 'lastPulledAt'
const KEY_LAST_PUSHED = 'lastPushedAt'

/**
 * 单批最多推多少条记录。服务端硬限 2000（TOO_MANY_RECORDS / 413），
 * 这里留足余量 —— 从 Chrome 导入的书签可能带 dataURL 图标，单条就有好几 KB，
 * 再叠加 Workers 免费版 10ms CPU 的 JSON 解析开销，分小批反而更稳。
 */
const PUSH_MAX_RECORDS = 250
/** 单批估算体积上限，防止少量「大记录」把请求撑爆 */
const PUSH_MAX_BYTES = 512 * 1024

export type SyncPhase = 'idle' | 'syncing' | 'ok' | 'error' | 'offline' | 'unauthorized'

export interface SyncOutcome {
  phase: SyncPhase
  pushed: number
  pulled: number
  at: number
  message?: string
}

let inFlight: Promise<SyncOutcome> | null = null

/**
 * 跑一次完整同步。并发调用会复用同一个 Promise，
 * 避免「页面可见 + 定时器 + 手动点击」同时触发导致重复推送。
 */
export function runSync(options: { force?: boolean; canPush?: boolean } = {}): Promise<SyncOutcome> {
  if (inFlight) return inFlight
  inFlight = doSync(options).finally(() => {
    inFlight = null
  })
  return inFlight
}

async function doSync(options: { force?: boolean; canPush?: boolean }): Promise<SyncOutcome> {
  const at = Date.now()
  const lastPulledAt = await getSyncState(KEY_LAST_PULLED, 0)
  const lastPushedAt = await getSyncState(KEY_LAST_PUSHED, 0)

  // 只挑本地在上次推送之后变过的记录，数据量大时这一步很关键
  const [allCats, allMarks] = await Promise.all([db.categories.toArray(), db.bookmarks.toArray()])
  const dirtyCats = options.force ? allCats : allCats.filter((c) => c.updatedAt > lastPushedAt)
  const dirtyMarks = options.force ? allMarks : allMarks.filter((b) => b.updatedAt > lastPushedAt)

  // 没解锁就只读不写：推送必然 401，白跑一趟还会把状态刷成「同步失败」
  const shouldPush = options.canPush !== false && (dirtyCats.length > 0 || dirtyMarks.length > 0)

  try {
    let cursor = lastPulledAt
    let pulled = 0
    let pushed = 0

    if (shouldPush) {
      // 大批量导入（比如一次性导进几千条 Chrome 书签）必须分批，
      // 否则单个请求会被服务端以 413 拒掉，而且会一直卡在那儿重试。
      for (const chunk of buildPushChunks(dirtyCats, dirtyMarks)) {
        const result = await api.push(cursor, chunk)
        pulled += await mergeIncoming(result.categories, result.bookmarks)
        // 游标跟着往前走，后面几批就不会把前面刚推上去的再拉回来
        cursor = result.now
        pushed += chunk.categories.length + chunk.bookmarks.length
      }
    } else {
      const result = await api.pull(cursor)
      pulled += await mergeIncoming(result.categories, result.bookmarks)
      cursor = result.now
    }

    await setSyncState(KEY_LAST_PULLED, cursor)
    // 只有真推成功了才推进「已推送」游标，否则下次会漏掉这些改动。
    // 中途某一批失败时整个游标都不动：重推是幂等的（LWW + 主键 upsert），
    // 宁可多推一遍，也不能留下永远传不上去的记录。
    if (shouldPush) await setSyncState(KEY_LAST_PUSHED, at)

    return { phase: 'ok', pushed, pulled, at: Date.now() }
  } catch (err) {
    const e = err as api.ApiError
    const phase: SyncPhase =
      e.code === api.NO_BACKEND || e.status === 0
        ? 'offline'
        : e.status === 401
          ? 'unauthorized'
          : 'error'
    return { phase, pushed: 0, pulled: 0, at: Date.now(), message: e.message }
  }
}

/**
 * 把待推送的记录切成若干批，同时受「条数」和「估算体积」两个上限约束。
 *
 * 分类排在书签前面：书签靠 categoryId 引用分类，先建分类后建书签，
 * 就算中途断了，服务端也不会出现指向不存在分类的孤儿书签。
 */
function buildPushChunks(categories: Category[], bookmarks: Bookmark[]): SyncPayload[] {
  const chunks: SyncPayload[] = []
  let current: SyncPayload = { categories: [], bookmarks: [] }
  let count = 0
  let bytes = 0

  const flush = (): void => {
    if (count > 0) chunks.push(current)
    current = { categories: [], bookmarks: [] }
    count = 0
    bytes = 0
  }

  const fits = (size: number): boolean =>
    count === 0 || (count + 1 <= PUSH_MAX_RECORDS && bytes + size <= PUSH_MAX_BYTES)

  for (const c of categories) {
    const size = estimateSize(c)
    if (!fits(size)) flush()
    current.categories.push(c)
    count++
    bytes += size
  }
  for (const b of bookmarks) {
    const size = estimateSize(b)
    if (!fits(size)) flush()
    current.bookmarks.push(b)
    count++
    bytes += size
  }
  flush()

  return chunks
}

function estimateSize(record: unknown): number {
  try {
    return JSON.stringify(record).length
  } catch {
    return 1024
  }
}

/** 把服务端记录按 LWW 合并进本地库 */
async function mergeIncoming(categories: Category[], bookmarks: Bookmark[]): Promise<number> {
  if (!categories.length && !bookmarks.length) return 0

  return db.transaction('rw', db.categories, db.bookmarks, async () => {
    let applied = 0

    if (categories.length) {
      const locals = await db.categories.bulkGet(categories.map((c) => c.id))
      const localMap = new Map(locals.filter((c): c is Category => !!c).map((c) => [c.id, c]))
      const writes = categories.filter((c) => shouldOverwrite(c, localMap.get(c.id)))
      if (writes.length) {
        await db.categories.bulkPut(writes)
        applied += writes.length
      }
    }

    if (bookmarks.length) {
      const locals = await db.bookmarks.bulkGet(bookmarks.map((b) => b.id))
      const localMap = new Map(locals.filter((b): b is Bookmark => !!b).map((b) => [b.id, b]))
      const writes: Bookmark[] = []
      for (const incoming of bookmarks) {
        const local = localMap.get(incoming.id)
        if (!shouldOverwrite(incoming, local)) continue
        writes.push(
          local
            ? {
                ...incoming,
                // 计数类字段不做覆盖，取两边最大，否则在 A 机器点击的次数会被 B 机器抹掉
                visits: Math.max(incoming.visits, local.visits),
                lastVisitAt: Math.max(incoming.lastVisitAt, local.lastVisitAt),
              }
            : incoming,
        )
      }
      if (writes.length) {
        await db.bookmarks.bulkPut(writes)
        applied += writes.length
      }
    }

    return applied
  })
}

/** 换账号 / 换后端时，把游标清零，下次会做一次全量同步 */
export async function resetSyncCursor(): Promise<void> {
  await setSyncState(KEY_LAST_PULLED, 0)
  await setSyncState(KEY_LAST_PUSHED, 0)
}

export async function getCursor(): Promise<{ pulledAt: number; pushedAt: number }> {
  return {
    pulledAt: await getSyncState(KEY_LAST_PULLED, 0),
    pushedAt: await getSyncState(KEY_LAST_PUSHED, 0),
  }
}
