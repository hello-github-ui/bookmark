/** 统一的 JSON 响应 / 错误格式，前后端约定好同一套结构 */

export interface ApiError {
  error: string
  message?: string
}

const BASE_HEADERS: Record<string, string> = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
}

/**
 * 同域部署时其实用不到 CORS；
 * 但允许把前端部署在 Render、后端放 Cloudflare 的「分离部署」玩法，所以带上。
 */
export function corsHeaders(origin: string | null, allowed: string): Record<string, string> {
  const headers: Record<string, string> = {
    'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'access-control-allow-headers': 'content-type,authorization',
    'access-control-max-age': '86400',
  }
  if (allowed === '*') {
    headers['access-control-allow-origin'] = '*'
  } else if (origin) {
    const list = allowed.split(',').map((s) => s.trim()).filter(Boolean)
    if (list.includes(origin)) {
      headers['access-control-allow-origin'] = origin
      headers.vary = 'Origin'
    }
  }
  return headers
}

export function json(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { ...BASE_HEADERS, ...(init.headers as Record<string, string> | undefined) },
  })
}

export function fail(status: number, error: string, message?: string): Response {
  const body: ApiError = message ? { error, message } : { error }
  return json(body, { status })
}
