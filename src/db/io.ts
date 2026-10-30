/**
 * 导入 / 导出。
 *
 * - JSON：本项目自己的备份格式，完整保留分类、标签、图标、访问次数
 * - HTML：浏览器通用的 Netscape 书签格式，Chrome / Edge / Firefox 导出的文件都能直接吃
 * - 导出 HTML：方便再导回浏览器
 */

import type { Bookmark, Category } from '~shared/model'
import { sanitizeBookmark, sanitizeCategory } from '~shared/model'
import { db } from './index'
import { SORT_STEP, uid } from '@/utils/id'
import { getDomain, guessTitleFromUrl, normalizeUrl } from '@/utils/url'

export const BACKUP_FORMAT = 'nav-bookmarks'
export const BACKUP_VERSION = 1

export interface BackupFile {
  format: string
  version: number
  exportedAt: number
  categories: Category[]
  bookmarks: Bookmark[]
}

/* ------------------------------------------------------------------ 导出 */

export async function buildBackup(includeTrash = false): Promise<BackupFile> {
  const [categories, bookmarks] = await Promise.all([
    db.categories.toArray(),
    db.bookmarks.toArray(),
  ])
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: Date.now(),
    categories: includeTrash ? categories : categories.filter((c) => c.deletedAt === 0),
    bookmarks: includeTrash ? bookmarks : bookmarks.filter((b) => b.deletedAt === 0),
  }
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // 立刻 revoke 在部分浏览器会打断下载，延迟一点
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

function stamp(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`
}

export async function exportJSON(): Promise<string> {
  const backup = await buildBackup()
  const filename = `bookmarks-${stamp()}.json`
  downloadBlob(
    new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json;charset=utf-8' }),
    filename,
  )
  return filename
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export async function exportHTML(): Promise<string> {
  const { categories, bookmarks } = await buildBackup()
  const sorted = [...categories].sort((a, b) => a.sort - b.sort)

  const lines = [
    '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
    '<!-- This is an automatically generated file. -->',
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    '<TITLE>Bookmarks</TITLE>',
    '<H1>Bookmarks</H1>',
    '<DL><p>',
  ]
  for (const cat of sorted) {
    const items = bookmarks
      .filter((b) => b.categoryId === cat.id)
      .sort((a, b) => a.sort - b.sort)
    if (!items.length) continue
    const sec = Math.floor(cat.createdAt / 1000)
    lines.push(`    <DT><H3 ADD_DATE="${sec}">${escapeHtml(cat.name)}</H3>`)
    lines.push('    <DL><p>')
    for (const b of items) {
      const attrs = [
        `HREF="${escapeHtml(b.url)}"`,
        `ADD_DATE="${Math.floor(b.createdAt / 1000)}"`,
      ]
      if (b.iconMode === 'custom' && b.icon) attrs.push(`ICON="${escapeHtml(b.icon)}"`)
      if (b.tags.length) attrs.push(`TAGS="${escapeHtml(b.tags.join(','))}"`)
      lines.push(`        <DT><A ${attrs.join(' ')}>${escapeHtml(b.title)}</A>`)
      if (b.desc) lines.push(`        <DD>${escapeHtml(b.desc)}`)
    }
    lines.push('    </DL><p>')
  }
  lines.push('</DL><p>')

  const filename = `bookmarks-${stamp()}.html`
  downloadBlob(new Blob([lines.join('\n')], { type: 'text/html;charset=utf-8' }), filename)
  return filename
}

/* ------------------------------------------------------------------ 导入 */

export interface ImportResult {
  categories: number
  bookmarks: number
  skipped: number
}

export interface ImportOptions {
  /** replace = 清空现有数据后导入；merge = 合并，URL 重复的跳过 */
  mode: 'replace' | 'merge'
}

export async function importFile(file: File, options: ImportOptions): Promise<ImportResult> {
  const text = await file.text()
  const isHtml =
    /\.html?$/i.test(file.name) || /<!DOCTYPE NETSCAPE-Bookmark-file-1>|<DL>/i.test(text.slice(0, 2000))
  const parsed = isHtml ? parseNetscapeHTML(text) : parseBackupJSON(text)
  return applyImport(parsed, options)
}

interface ParsedData {
  categories: Category[]
  bookmarks: Bookmark[]
}

function parseBackupJSON(text: string): ParsedData {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('不是合法的 JSON 文件')
  }
  const obj = raw as Record<string, unknown>

  // 本项目的备份格式
  if (Array.isArray(obj.categories) || Array.isArray(obj.bookmarks)) {
    const categories = (Array.isArray(obj.categories) ? obj.categories : [])
      .map(sanitizeCategory)
      .filter((c): c is Category => !!c)
    const bookmarks = (Array.isArray(obj.bookmarks) ? obj.bookmarks : [])
      .map(sanitizeBookmark)
      .filter((b): b is Bookmark => !!b)
    if (!categories.length && !bookmarks.length) throw new Error('文件里没有可导入的数据')
    return { categories, bookmarks }
  }

  // 容错：直接是一个书签数组 [{title, url}, ...]
  if (Array.isArray(raw)) {
    const ts = Date.now()
    const category: Category = {
      id: uid('cat'),
      name: '导入',
      icon: '📥',
      color: '',
      sort: SORT_STEP,
      createdAt: ts,
      updatedAt: ts,
      deletedAt: 0,
    }
    const bookmarks = raw
      .map((item, i) => {
        const r = item as Record<string, unknown>
        const url = typeof r.url === 'string' ? r.url : ''
        if (!url) return null
        return sanitizeBookmark({
          id: uid('bm'),
          categoryId: category.id,
          title: r.title ?? r.name ?? guessTitleFromUrl(url),
          url: normalizeUrl(url),
          desc: r.desc ?? r.description ?? '',
          sort: (i + 1) * SORT_STEP,
          createdAt: ts,
          updatedAt: ts,
        })
      })
      .filter((b): b is Bookmark => !!b)
    if (!bookmarks.length) throw new Error('文件里没有可导入的数据')
    return { categories: [category], bookmarks }
  }

  throw new Error('无法识别的文件格式')
}

/**
 * 解析浏览器导出的书签 HTML。
 * 用 DOMParser 而不是正则 —— 这种文件嵌套层级深且标签常常不闭合，正则很容易出错。
 */
function parseNetscapeHTML(text: string): ParsedData {
  const doc = new DOMParser().parseFromString(text, 'text/html')
  const ts = Date.now()
  const categories: Category[] = []
  const bookmarks: Bookmark[] = []

  const ensureCategory = (name: string): Category => {
    const key = name.trim() || '未分类'
    const existing = categories.find((c) => c.name === key)
    if (existing) return existing
    const cat: Category = {
      id: uid('cat'),
      name: key,
      icon: '📁',
      color: '',
      sort: (categories.length + 1) * SORT_STEP,
      createdAt: ts,
      updatedAt: ts,
      deletedAt: 0,
    }
    categories.push(cat)
    return cat
  }

  /** 递归遍历 <DL>，用「最近的 H3 文本」当分类名；多层目录用 / 连接 */
  const walk = (dl: Element, path: string[]): void => {
    for (const dt of Array.from(dl.children)) {
      if (dt.tagName !== 'DT') continue
      const h3 = dt.querySelector(':scope > h3')
      const anchor = dt.querySelector(':scope > a')

      if (h3) {
        const nested = dt.querySelector(':scope > dl')
        const nextPath = [...path, h3.textContent?.trim() || '未命名']
        if (nested) walk(nested, nextPath)
        continue
      }

      if (anchor) {
        const href = anchor.getAttribute('href') ?? ''
        if (!/^https?:/i.test(href)) continue // 跳过 javascript: 书签小工具和 place: 等内部地址
        const cat = ensureCategory(path.length ? path.join(' / ') : '未分类')
        const addDate = Number(anchor.getAttribute('add_date') ?? 0) * 1000
        const icon = anchor.getAttribute('icon') ?? ''
        const tagsAttr = anchor.getAttribute('tags') ?? ''
        // 说明文字在同级的下一个 <DD> 里
        const dd = dt.nextElementSibling?.tagName === 'DD' ? dt.nextElementSibling : null

        bookmarks.push({
          id: uid('bm'),
          categoryId: cat.id,
          title: anchor.textContent?.trim() || guessTitleFromUrl(href),
          url: href,
          desc: dd?.textContent?.trim().slice(0, 300) ?? '',
          tags: tagsAttr ? tagsAttr.split(',').map((t) => t.trim()).filter(Boolean) : [],
          icon: icon.startsWith('data:') ? icon : '',
          iconMode: icon.startsWith('data:') ? 'custom' : 'auto',
          pinned: 0,
          visits: 0,
          lastVisitAt: 0,
          sort: (bookmarks.length + 1) * SORT_STEP,
          createdAt: addDate || ts,
          updatedAt: ts,
          deletedAt: 0,
        })
      }
    }
  }

  const root = doc.querySelector('dl')
  if (root) walk(root, [])

  if (!bookmarks.length) throw new Error('没有从该 HTML 中解析出任何书签')
  return { categories, bookmarks }
}

async function applyImport(data: ParsedData, options: ImportOptions): Promise<ImportResult> {
  const ts = Date.now()
  return db.transaction('rw', db.categories, db.bookmarks, async () => {
    if (options.mode === 'replace') {
      await db.categories.clear()
      await db.bookmarks.clear()
      await db.categories.bulkPut(data.categories)
      await db.bookmarks.bulkPut(data.bookmarks)
      return {
        categories: data.categories.length,
        bookmarks: data.bookmarks.length,
        skipped: 0,
      }
    }

    // ---- merge ----
    const existingCats = await db.categories.toArray()
    const existingMarks = await db.bookmarks.toArray()
    const urlSet = new Set(
      existingMarks.filter((b) => b.deletedAt === 0).map((b) => b.url.replace(/\/$/, '').toLowerCase()),
    )
    const catByName = new Map(existingCats.filter((c) => c.deletedAt === 0).map((c) => [c.name, c]))
    let maxSort = Math.max(0, ...existingCats.map((c) => c.sort))

    const idRemap = new Map<string, string>()
    const newCats: Category[] = []
    for (const cat of data.categories) {
      const hit = catByName.get(cat.name)
      if (hit) {
        idRemap.set(cat.id, hit.id)
      } else {
        maxSort += SORT_STEP
        const fresh: Category = { ...cat, id: uid('cat'), sort: maxSort, updatedAt: ts }
        idRemap.set(cat.id, fresh.id)
        newCats.push(fresh)
        catByName.set(fresh.name, fresh)
      }
    }

    let skipped = 0
    const newMarks: Bookmark[] = []
    for (const b of data.bookmarks) {
      const key = b.url.replace(/\/$/, '').toLowerCase()
      if (urlSet.has(key)) {
        skipped++
        continue
      }
      urlSet.add(key)
      newMarks.push({
        ...b,
        id: uid('bm'),
        categoryId: idRemap.get(b.categoryId) ?? newCats[0]?.id ?? b.categoryId,
        updatedAt: ts,
      })
    }

    if (newCats.length) await db.categories.bulkPut(newCats)
    if (newMarks.length) await db.bookmarks.bulkPut(newMarks)
    return { categories: newCats.length, bookmarks: newMarks.length, skipped }
  })
}

/** 危险操作：清空本地所有数据（含设置） */
export async function wipeLocal(): Promise<void> {
  await db.transaction('rw', db.categories, db.bookmarks, db.settings, db.iconCache, db.syncState, async () => {
    await Promise.all([
      db.categories.clear(),
      db.bookmarks.clear(),
      db.iconCache.clear(),
      db.syncState.clear(),
    ])
  })
}

/** 快速添加：从剪贴板/输入框里一行一个 URL 批量导入 */
export function parseBulkText(text: string): { title: string; url: string }[] {
  const out: { title: string; url: string }[] = []
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    // 支持 "标题 | https://..." 和 "https://..." 和 markdown "[标题](url)"
    const md = /^\[([^\]]*)\]\((https?:\/\/[^)]+)\)$/.exec(trimmed)
    if (md) {
      out.push({ title: md[1].trim(), url: md[2] })
      continue
    }
    const piped = trimmed.split(/\s*[|｜]\s*/)
    if (piped.length === 2 && /^(https?:\/\/|www\.)/i.test(piped[1])) {
      out.push({ title: piped[0], url: normalizeUrl(piped[1]) })
      continue
    }
    const urlMatch = /(https?:\/\/\S+|\bwww\.\S+)/i.exec(trimmed)
    if (urlMatch) {
      const url = normalizeUrl(urlMatch[1])
      const title = trimmed.replace(urlMatch[1], '').trim().replace(/^[-–—:|]+\s*/, '')
      if (getDomain(url)) out.push({ title: title || guessTitleFromUrl(url), url })
    }
  }
  return out
}
