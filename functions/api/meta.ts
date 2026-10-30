/**
 * GET /api/meta?url=https://example.com
 * 服务端代抓目标站的 <title> / description / favicon。
 * 浏览器跨域抓不到，放服务端做；添加书签时点一下「自动获取」就能自动填好。
 */

import { bearerFrom, verifyToken } from '../../shared/auth'
import { authSecret, type Env, publicRead } from '../../shared/env'
import { fail, json } from '../../shared/http'
import { fetchSiteMeta } from '../../shared/meta'

/** 挡住内网地址，别让这个接口变成 SSRF 跳板 */
function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase()
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.internal')) return true
  if (/^(\[::1?\]|::1?)$/.test(h)) return true
  if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h)) {
    return true
  }
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true
  if (/^0\./.test(h)) return true
  return false
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const secret = authSecret(env)
  // 没开公开读时，抓取能力也要登录后才给用
  if (secret && !publicRead(env) && !(await verifyToken(secret, bearerFrom(request)))) {
    return fail(401, 'UNAUTHORIZED')
  }

  const raw = new URL(request.url).searchParams.get('url')?.trim()
  if (!raw) return fail(400, 'MISSING_URL')

  let parsed: URL
  try {
    parsed = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
  } catch {
    return fail(400, 'INVALID_URL')
  }
  if (isBlockedHost(parsed.hostname)) return fail(403, 'BLOCKED_HOST')

  try {
    const meta = await fetchSiteMeta(parsed.toString())
    return json(meta, { headers: { 'cache-control': 'public, max-age=3600' } })
  } catch (err) {
    return fail(502, 'FETCH_FAILED', err instanceof Error ? err.message : '抓取失败')
  }
}
