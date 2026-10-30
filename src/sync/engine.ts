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

import type { Bookmark, Category } from '~shared/model'
import { shouldOverwrite } from '~shared/model'
import * as api from '@/api/client'
import { db, getSyncState, setSyncState } from '@/db/index'

const KEY_LAST_PULLED = 'lastPulledAt'
const KEY_LAST_PUSHED = 'lastPushedAt'

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
    const result = shouldPush
      ? await api.push(lastPulledAt, { categories: dirtyCats, bookmarks: dirtyMarks })
      : await api.pull(lastPulledAt)

    const pulled = await mergeIncoming(result.categories, result.bookmarks)

    await setSyncState(KEY_LAST_PULLED, result.now)
    // 只有真推成功了才推进「已推送」游标，否则下次会漏掉这些改动
    if (shouldPush) await setSyncState(KEY_LAST_PUSHED, at)

    return {
      phase: 'ok',
      pushed: shouldPush ? dirtyCats.length + dirtyMarks.length : 0,
      pulled,
      at: Date.now(),
    }
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
