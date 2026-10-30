/**
 * 共享数据模型 —— 前端(Dexie/IndexedDB)、Cloudflare Functions(D1)、本地开发 API 三端共用。
 *
 * 同步策略：每条记录带 updatedAt 时间戳 + deletedAt 墓碑标记，
 * 合并时按「谁的 updatedAt 更大谁赢」(Last-Write-Wins)。
 * 删除不是物理删除，而是写 deletedAt，这样删除也能同步到其它设备。
 */

export type ID = string

/** 图标来源模式 */
export type IconMode =
  | 'auto' // 自动抓取网站 favicon
  | 'custom' // 用户指定图片 URL / 上传的 dataURL
  | 'emoji' // 用 emoji 当图标
  | 'letter' // 纯文字色块

export interface Category {
  id: ID
  name: string
  icon: string // emoji，例如 "🚀"
  color: string // 强调色 hex，例如 "#8b5cf6"
  sort: number
  createdAt: number
  updatedAt: number
  /** 0 表示存在；非 0 表示已删除（墓碑），值为删除时间戳 */
  deletedAt: number
}

export interface Bookmark {
  id: ID
  categoryId: ID
  title: string
  url: string
  desc: string
  tags: string[]
  /** iconMode 为 custom 时是图片地址/dataURL；为 emoji 时是 emoji 字符 */
  icon: string
  iconMode: IconMode
  /** 0 / 1 —— 用数字而不是 boolean，方便 IndexedDB 与 SQLite 建索引 */
  pinned: number
  visits: number
  lastVisitAt: number
  sort: number
  createdAt: number
  updatedAt: number
  deletedAt: number
}

export interface SyncPayload {
  categories: Category[]
  bookmarks: Bookmark[]
}

export interface PullResponse extends SyncPayload {
  /** 服务端当前时间，客户端下次用它当 since */
  now: number
}

export const CATEGORY_FIELDS = [
  'id',
  'name',
  'icon',
  'color',
  'sort',
  'createdAt',
  'updatedAt',
  'deletedAt',
] as const

export const BOOKMARK_FIELDS = [
  'id',
  'categoryId',
  'title',
  'url',
  'desc',
  'tags',
  'icon',
  'iconMode',
  'pinned',
  'visits',
  'lastVisitAt',
  'sort',
  'createdAt',
  'updatedAt',
  'deletedAt',
] as const

const num = (v: unknown, fallback = 0): number => {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : fallback
}

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback)

/** 把任意输入清洗成合法 Category，防止脏数据写库 */
export function sanitizeCategory(input: unknown): Category | null {
  if (!input || typeof input !== 'object') return null
  const r = input as Record<string, unknown>
  const id = str(r.id).trim()
  if (!id) return null
  return {
    id,
    name: str(r.name).slice(0, 120),
    icon: str(r.icon).slice(0, 16),
    color: str(r.color).slice(0, 32),
    sort: num(r.sort),
    createdAt: num(r.createdAt, Date.now()),
    updatedAt: num(r.updatedAt, Date.now()),
    deletedAt: num(r.deletedAt),
  }
}

const ICON_MODES: IconMode[] = ['auto', 'custom', 'emoji', 'letter']

/** 把任意输入清洗成合法 Bookmark */
export function sanitizeBookmark(input: unknown): Bookmark | null {
  if (!input || typeof input !== 'object') return null
  const r = input as Record<string, unknown>
  const id = str(r.id).trim()
  if (!id) return null
  let tags: string[] = []
  if (Array.isArray(r.tags)) {
    tags = r.tags.filter((t): t is string => typeof t === 'string').map((t) => t.slice(0, 40))
  } else if (typeof r.tags === 'string') {
    try {
      const parsed: unknown = JSON.parse(r.tags)
      if (Array.isArray(parsed)) tags = parsed.filter((t): t is string => typeof t === 'string')
    } catch {
      tags = r.tags ? r.tags.split(',').map((t) => t.trim()).filter(Boolean) : []
    }
  }
  const mode = str(r.iconMode, 'auto') as IconMode
  return {
    id,
    categoryId: str(r.categoryId),
    title: str(r.title).slice(0, 200),
    url: str(r.url).slice(0, 2048),
    desc: str(r.desc).slice(0, 500),
    tags: tags.slice(0, 20),
    // dataURL 图标可能很长，留出 512KB 余量
    icon: str(r.icon).slice(0, 512 * 1024),
    iconMode: ICON_MODES.includes(mode) ? mode : 'auto',
    pinned: num(r.pinned) ? 1 : 0,
    visits: Math.max(0, Math.round(num(r.visits))),
    lastVisitAt: num(r.lastVisitAt),
    sort: num(r.sort),
    createdAt: num(r.createdAt, Date.now()),
    updatedAt: num(r.updatedAt, Date.now()),
    deletedAt: num(r.deletedAt),
  }
}

/** Last-Write-Wins：incoming 比 existing 新才覆盖 */
export function shouldOverwrite(
  incoming: { updatedAt: number },
  existing: { updatedAt: number } | undefined | null,
): boolean {
  if (!existing) return true
  return incoming.updatedAt > existing.updatedAt
}
