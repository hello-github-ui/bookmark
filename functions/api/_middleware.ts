/**
 * 只挂在 /api/* 上（而不是 functions/_middleware.ts）——
 * 这样静态资源请求完全不经过 Function，不占用 Workers 免费额度的 10 万次/天。
 */

import { corsHeaders } from '../../shared/http'
import type { Env } from '../../shared/env'

export const onRequest: PagesFunction<Env> = async (ctx) => {
  const origin = ctx.request.headers.get('Origin')
  const allowed = ctx.env.CORS_ORIGINS?.trim() ?? ''

  if (ctx.request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin, allowed) })
  }

  let res: Response
  try {
    res = await ctx.next()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    res = new Response(JSON.stringify({ error: 'INTERNAL', message }), {
      status: 500,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    })
  }

  if (allowed) {
    const headers = new Headers(res.headers)
    for (const [k, v] of Object.entries(corsHeaders(origin, allowed))) headers.set(k, v)
    res = new Response(res.body, { status: res.status, statusText: res.statusText, headers })
  }
  return res
}
