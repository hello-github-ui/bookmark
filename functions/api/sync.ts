/**
 * GET  /api/sync?since=<ts>   拉取服务端在 since 之后变化的记录
 * POST /api/sync              推送本地变更，同时把服务端变更带回来（一次往返完成双向同步）
 */

import { bearerFrom, verifyToken } from '../../shared/auth'
import { countAll, pullSince, pushRecords, purgeTombstones } from '../../shared/d1'
import { authSecret, type Env, isConfigured, publicRead } from '../../shared/env'
import { fail, json } from '../../shared/http'
import {
  type Bookmark,
  type Category,
  sanitizeBookmark,
  sanitizeCategory,
} from '../../shared/model'

/** 墓碑保留 90 天后物理清除 */
const TOMBSTONE_TTL_MS = 90 * 24 * 60 * 60 * 1000
/** 单次推送最多 2000 条，防止被刷爆 */
const MAX_RECORDS = 2000

async function authed(request: Request, env: Env): Promise<boolean> {
  return verifyToken(authSecret(env), bearerFrom(request))
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!isConfigured(env)) return fail(503, 'NOT_CONFIGURED', '后端尚未配置 D1 绑定或访问密码')
  if (!publicRead(env) && !(await authed(request, env))) return fail(401, 'UNAUTHORIZED')

  const since = Number(new URL(request.url).searchParams.get('since') ?? 0) || 0
  const data = await pullSince(env.DB!, since)
  return json({ ...data, now: Date.now() })
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!isConfigured(env)) return fail(503, 'NOT_CONFIGURED', '后端尚未配置 D1 绑定或访问密码')
  if (!(await authed(request, env))) return fail(401, 'UNAUTHORIZED', '请先在设置里输入访问密码')

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return fail(400, 'BAD_JSON')
  }
  const payload = (body ?? {}) as Record<string, unknown>
  const since = Number(payload.since ?? 0) || 0

  const categories = (Array.isArray(payload.categories) ? payload.categories : [])
    .map(sanitizeCategory)
    .filter((c): c is Category => !!c)
  const bookmarks = (Array.isArray(payload.bookmarks) ? payload.bookmarks : [])
    .map(sanitizeBookmark)
    .filter((b): b is Bookmark => !!b)

  if (categories.length + bookmarks.length > MAX_RECORDS) {
    return fail(413, 'TOO_MANY_RECORDS', `单次最多同步 ${MAX_RECORDS} 条`)
  }

  const applied = await pushRecords(env.DB!, { categories, bookmarks })
  // 先写后读，保证本次返回的数据里包含刚写进去的内容
  const data = await pullSince(env.DB!, since)

  // 顺手做一次低频清理：随机 2% 的请求触发，避免每次都扫表
  if (Math.random() < 0.02) {
    await purgeTombstones(env.DB!, Date.now() - TOMBSTONE_TTL_MS).catch(() => undefined)
  }

  return json({ ...data, now: Date.now(), applied })
}

export const onRequestDelete: PagesFunction<Env> = async ({ request, env }) => {
  if (!isConfigured(env)) return fail(503, 'NOT_CONFIGURED')
  if (!(await authed(request, env))) return fail(401, 'UNAUTHORIZED')
  const stats = await countAll(env.DB!)
  return json({ ok: true, stats })
}
