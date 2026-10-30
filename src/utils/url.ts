/** URL 相关的小工具：补协议、取域名、从域名猜标题等 */

/** 用户往往只输入 "github.com"，这里补成完整 URL */
export function normalizeUrl(input: string): string {
  const raw = input.trim()
  if (!raw) return ''
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return raw // 已经带 http:/https:/chrome:/mailto: 等协议
  if (raw.startsWith('//')) return `https:${raw}`
  return `https://${raw}`
}

export function parseUrl(input: string): URL | null {
  try {
    return new URL(normalizeUrl(input))
  } catch {
    return null
  }
}

export function isValidUrl(input: string): boolean {
  const u = parseUrl(input)
  return !!u && (u.protocol === 'http:' || u.protocol === 'https:') && u.hostname.includes('.')
}

/** 取主机名，去掉 www. 前缀 */
export function getDomain(input: string): string {
  return parseUrl(input)?.hostname.replace(/^www\./i, '') ?? ''
}

export function getOrigin(input: string): string {
  return parseUrl(input)?.origin ?? ''
}

/** 展示用的短地址：github.com/vuejs/core */
export function prettyUrl(input: string, maxLength = 42): string {
  const u = parseUrl(input)
  if (!u) return input
  let text = u.hostname.replace(/^www\./i, '') + (u.pathname === '/' ? '' : u.pathname)
  text = text.replace(/\/$/, '')
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text
}

/**
 * 没抓到标题时，从 URL 里猜一个像样的名字：
 *   https://vuejs.org            -> Vuejs
 *   https://github.com/vuejs/core -> Core
 */
export function guessTitleFromUrl(input: string): string {
  const u = parseUrl(input)
  if (!u) return input.trim()
  const segments = u.pathname.split('/').filter(Boolean)
  const last = segments.at(-1)
  if (last && !/^index(\.\w+)?$/i.test(last)) {
    const cleaned = decodeURIComponent(last)
      .replace(/\.(html?|php|aspx?|jsp)$/i, '')
      .replace(/[-_+]/g, ' ')
      .trim()
    if (cleaned && cleaned.length <= 60) return titleCase(cleaned)
  }
  const host = u.hostname.replace(/^www\./i, '')
  const main = host.split('.')[0]
  return titleCase(main || host)
}

function titleCase(s: string): string {
  return s.replace(/\b[a-z]/g, (c) => c.toUpperCase())
}

/** 搜索引擎（国内可用优先） */
export interface SearchEngine {
  id: string
  name: string
  icon: string
  template: string
}

export const SEARCH_ENGINES: SearchEngine[] = [
  { id: 'bing', name: '必应', icon: '🔎', template: 'https://www.bing.com/search?q=%s' },
  { id: 'baidu', name: '百度', icon: '🐻', template: 'https://www.baidu.com/s?wd=%s' },
  { id: 'google', name: 'Google', icon: '🌐', template: 'https://www.google.com/search?q=%s' },
  { id: 'github', name: 'GitHub', icon: '🐙', template: 'https://github.com/search?q=%s' },
  { id: 'zhihu', name: '知乎', icon: '📘', template: 'https://www.zhihu.com/search?q=%s' },
  { id: 'mdn', name: 'MDN', icon: '📖', template: 'https://developer.mozilla.org/search?q=%s' },
  { id: 'npm', name: 'npm', icon: '📦', template: 'https://www.npmjs.com/search?q=%s' },
  { id: 'douban', name: '豆瓣', icon: '🎬', template: 'https://www.douban.com/search?q=%s' },
]

export function buildSearchUrl(engine: SearchEngine, query: string): string {
  return engine.template.replace('%s', encodeURIComponent(query))
}
