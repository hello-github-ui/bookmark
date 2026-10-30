/**
 * GET /api/icon?domain=github.com
 * favicon 代理：服务端依次试多个图标源，把第一个成功的图片原样吐回来，并在边缘缓存 30 天。
 *
 * 为什么要代理：
 *  - Google/DuckDuckGo 的 favicon 接口在国内访问不稳定，浏览器直连经常白图；
 *  - 很多站点的 /favicon.ico 有防盗链或 HTTPS 证书问题；
 *  - 走同域代理后，前端只需要请求 /api/icon，图标必定能显示，还顺带吃到 Cloudflare 的 CDN 缓存。
 */

import { type Env } from '../../shared/env'
import { fail } from '../../shared/http'

const CACHE_SECONDS = 60 * 60 * 24 * 30
const TIMEOUT_MS = 5000

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36'

function sources(domain: string): string[] {
  return [
    `https://${domain}/favicon.ico`,
    `https://api.iowen.cn/favicon/${domain}.png`,
    `https://favicon.im/${domain}?larger=true`,
    `https://icon.horse/icon/${domain}`,
    `https://www.google.com/s2/favicons?domain=${domain}&sz=128`,
  ]
}

/** 1x1 透明 PNG，所有源都失败时返回它，前端据此切到文字色块 */
const BLANK_PNG = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='),
  (c) => c.charCodeAt(0),
)

function isValidDomain(d: string): boolean {
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(d) && d.length < 254
}

export const onRequestGet: PagesFunction<Env> = async ({ request }) => {
  const domain = new URL(request.url).searchParams.get('domain')?.trim().toLowerCase() ?? ''
  if (!domain || !isValidDomain(domain)) return fail(400, 'INVALID_DOMAIN')

  for (const src of sources(domain)) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    try {
      const res = await fetch(src, {
        redirect: 'follow',
        signal: controller.signal,
        headers: { 'user-agent': UA, accept: 'image/*,*/*;q=0.8' },
      })
      const type = res.headers.get('content-type') ?? ''
      const len = Number(res.headers.get('content-length') ?? '0')
      // 过滤掉「返回 200 但其实是 HTML 错误页」和空图
      if (!res.ok || !/^image\//i.test(type) || len === 1 || (len > 0 && len < 70)) continue

      const body = await res.arrayBuffer()
      if (body.byteLength < 70 || body.byteLength > 1024 * 512) continue

      return new Response(body, {
        headers: {
          'content-type': type,
          'cache-control': `public, max-age=${CACHE_SECONDS}, s-maxage=${CACHE_SECONDS}, immutable`,
          'x-icon-source': new URL(src).hostname,
        },
      })
    } catch {
      // 换下一个源
    } finally {
      clearTimeout(timer)
    }
  }

  return new Response(BLANK_PNG, {
    status: 200,
    headers: {
      'content-type': 'image/png',
      'cache-control': 'public, max-age=86400',
      'x-icon-source': 'none',
    },
  })
}
