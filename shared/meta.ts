/**
 * 服务端抓取目标网页的标题 / 描述 / 图标。
 * 浏览器端受同源策略限制没法直接抓，所以放到 Cloudflare Function（和本地开发 API）里做。
 * 用正则而不是 DOM 解析，是为了在 Workers 的 10ms CPU 限额里跑完。
 */

export interface SiteMeta {
  url: string
  title: string
  desc: string
  icon: string
  siteName: string
}

/** 只读前 N 字节，<head> 通常远小于这个值 */
const MAX_BYTES = 96 * 1024
const FETCH_TIMEOUT_MS = 8000

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36'

function decodeEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

/** 从一堆 <meta> 里按属性名取 content */
function metaContent(html: string, names: string[]): string {
  for (const name of names) {
    const re = new RegExp(
      `<meta[^>]+(?:name|property|itemprop)\\s*=\\s*["']${name}["'][^>]*>`,
      'i',
    )
    const tag = re.exec(html)?.[0]
    if (!tag) continue
    const content = /content\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1]
    if (content) return decodeEntities(content)
  }
  return ''
}

/** 从 <link rel="icon"> 系列里挑一个最大的 */
function linkIcon(html: string): string {
  const links = html.match(/<link[^>]+>/gi) ?? []
  let best = ''
  let bestSize = -1
  for (const tag of links) {
    const rel = /rel\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1]?.toLowerCase() ?? ''
    if (!/\bicon\b|\bapple-touch-icon\b|\bshortcut\b|\bmask-icon\b/.test(rel)) continue
    const href = /href\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1]
    if (!href) continue
    const sizes = /sizes\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1] ?? ''
    const parsed = /(\d+)x(\d+)/i.exec(sizes)
    // apple-touch-icon 通常是高清大图，给个保底权重
    let size = parsed ? Number(parsed[1]) : rel.includes('apple-touch-icon') ? 180 : 32
    if (/\.svg($|\?)/i.test(href)) size = 512 // SVG 任意缩放，优先
    if (size > bestSize) {
      bestSize = size
      best = decodeEntities(href)
    }
  }
  return best
}

export async function fetchSiteMeta(rawUrl: string): Promise<SiteMeta> {
  let target: URL
  try {
    target = new URL(rawUrl)
  } catch {
    throw new Error('INVALID_URL')
  }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    throw new Error('UNSUPPORTED_PROTOCOL')
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  let html = ''
  let finalUrl = target.toString()
  try {
    const res = await fetch(target.toString(), {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'user-agent': UA,
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
    })
    finalUrl = res.url || finalUrl
    const type = res.headers.get('content-type') ?? ''
    if (res.ok && /html|xml|text\/plain/i.test(type)) {
      const reader = res.body?.getReader()
      if (reader) {
        const chunks: Uint8Array[] = []
        let total = 0
        // 边读边数，够了就断开，避免把整站下载下来
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          if (value) {
            chunks.push(value)
            total += value.length
          }
          if (total >= MAX_BYTES) {
            void reader.cancel()
            break
          }
        }
        const buf = new Uint8Array(total)
        let offset = 0
        for (const c of chunks) {
          buf.set(c, offset)
          offset += c.length
        }
        const charset =
          /charset\s*=\s*["']?([\w-]+)/i.exec(type)?.[1] ??
          /<meta[^>]+charset\s*=\s*["']?([\w-]+)/i.exec(
            new TextDecoder('utf-8', { fatal: false, ignoreBOM: false }).decode(buf.slice(0, 2048)),
          )?.[1] ??
          'utf-8'
        try {
          html = new TextDecoder(charset.toLowerCase(), { fatal: false, ignoreBOM: false }).decode(buf)
        } catch {
          html = new TextDecoder('utf-8', { fatal: false, ignoreBOM: false }).decode(buf)
        }
      }
    }
  } catch {
    // 抓不到就退化成「只靠域名猜」，不要让整个请求失败
  } finally {
    clearTimeout(timer)
  }

  const base = new URL(finalUrl)
  const head = html.slice(0, MAX_BYTES)

  const title =
    metaContent(head, ['og:title', 'twitter:title']) ||
    decodeEntities(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1] ?? '') ||
    base.hostname.replace(/^www\./, '')

  const desc = metaContent(head, [
    'description',
    'og:description',
    'twitter:description',
    'Description',
  ])

  const siteName = metaContent(head, ['og:site_name', 'application-name'])

  let icon = ''
  const href = linkIcon(head) || metaContent(head, ['og:image'])
  if (href) {
    try {
      icon = new URL(href, base).toString()
    } catch {
      icon = ''
    }
  }
  if (!icon) icon = new URL('/favicon.ico', base).toString()

  return {
    url: finalUrl,
    title: title.slice(0, 200),
    desc: desc.slice(0, 300),
    icon,
    siteName: siteName.slice(0, 100),
  }
}
