/**
 * 所有对书签/分类的增删改都走这里。
 *
 * 两条铁律（同步正确性全靠它们）：
 *   1. 任何写入都要刷新 updatedAt —— 这是 Last-Write-Wins 的判定依据；
 *   2. 删除一律是软删除（写 deletedAt），否则删除动作没法同步到其它设备。
 */

import type { Bookmark, Category, IconMode } from '~shared/model'
import { db } from './index'
import { SORT_STEP, needsResort, sortBetween, uid } from '@/utils/id'
import { getDomain, guessTitleFromUrl, normalizeUrl } from '@/utils/url'

const now = () => Date.now()

/* ------------------------------------------------------------------ 查询 */

export function activeCategories(): Promise<Category[]> {
  return db.categories
    .where('deletedAt')
    .equals(0)
    .toArray()
    .then((list) => list.sort((a, b) => a.sort - b.sort))
}

export function activeBookmarks(): Promise<Bookmark[]> {
  return db.bookmarks
    .where('deletedAt')
    .equals(0)
    .toArray()
    .then((list) => list.sort((a, b) => a.sort - b.sort))
}

/* ------------------------------------------------------------- 分类 CRUD */

export interface CategoryInput {
  name: string
  icon?: string
  color?: string
}

export async function createCategory(input: CategoryInput): Promise<Category> {
  const last = await db.categories.orderBy('sort').last()
  const ts = now()
  const category: Category = {
    id: uid('cat'),
    name: input.name.trim() || '未命名分类',
    icon: input.icon ?? '📁',
    color: input.color ?? '',
    sort: (last?.sort ?? 0) + SORT_STEP,
    createdAt: ts,
    updatedAt: ts,
    deletedAt: 0,
  }
  await db.categories.add(category)
  return category
}

export async function updateCategory(id: string, patch: Partial<CategoryInput>): Promise<void> {
  const clean: Partial<Category> = { updatedAt: now() }
  if (patch.name !== undefined) clean.name = patch.name.trim() || '未命名分类'
  if (patch.icon !== undefined) clean.icon = patch.icon
  if (patch.color !== undefined) clean.color = patch.color
  await db.categories.update(id, clean)
}

/**
 * 删除分类：分类本身软删除，里面的书签要么一起软删除，要么搬到目标分类。
 * 放在一个事务里，避免中途失败产生「孤儿书签」。
 */
export async function deleteCategory(id: string, moveToCategoryId?: string): Promise<number> {
  const ts = now()
  return db.transaction('rw', db.categories, db.bookmarks, async () => {
    const children = await db.bookmarks.where('categoryId').equals(id).toArray()
    const alive = children.filter((b) => b.deletedAt === 0)
    if (moveToCategoryId) {
      await db.bookmarks.bulkPut(
        alive.map((b) => ({ ...b, categoryId: moveToCategoryId, updatedAt: ts })),
      )
    } else {
      await db.bookmarks.bulkPut(alive.map((b) => ({ ...b, deletedAt: ts, updatedAt: ts })))
    }
    await db.categories.update(id, { deletedAt: ts, updatedAt: ts })
    return alive.length
  })
}

export async function reorderCategories(orderedIds: string[]): Promise<void> {
  const ts = now()
  const rows = await db.categories.bulkGet(orderedIds)
  const updates = rows
    .filter((c): c is Category => !!c)
    .map((c, i) => ({ ...c, sort: (i + 1) * SORT_STEP, updatedAt: ts }))
  await db.categories.bulkPut(updates)
}

/* ------------------------------------------------------------- 书签 CRUD */

export interface BookmarkInput {
  title?: string
  url: string
  desc?: string
  categoryId: string
  tags?: string[]
  icon?: string
  iconMode?: IconMode
  pinned?: boolean
}

export async function createBookmark(input: BookmarkInput): Promise<Bookmark> {
  const url = normalizeUrl(input.url)
  const ts = now()
  const first = await db.bookmarks
    .where('categoryId')
    .equals(input.categoryId)
    .filter((b) => b.deletedAt === 0)
    .toArray()
  const minSort = first.length ? Math.min(...first.map((b) => b.sort)) : null

  const bookmark: Bookmark = {
    id: uid('bm'),
    categoryId: input.categoryId,
    title: (input.title ?? '').trim() || guessTitleFromUrl(url),
    url,
    desc: (input.desc ?? '').trim(),
    tags: dedupeTags(input.tags ?? []),
    icon: input.icon ?? '',
    iconMode: input.iconMode ?? (input.icon ? 'custom' : 'auto'),
    pinned: input.pinned ? 1 : 0,
    visits: 0,
    lastVisitAt: 0,
    // 新书签排在分类最前面，刚加的东西应该一眼看到
    sort: minSort === null ? SORT_STEP : minSort - SORT_STEP,
    createdAt: ts,
    updatedAt: ts,
    deletedAt: 0,
  }
  await db.bookmarks.add(bookmark)
  return bookmark
}

export async function updateBookmark(id: string, patch: Partial<BookmarkInput>): Promise<void> {
  const clean: Partial<Bookmark> = { updatedAt: now() }
  if (patch.url !== undefined) clean.url = normalizeUrl(patch.url)
  if (patch.title !== undefined) {
    clean.title = patch.title.trim() || guessTitleFromUrl(clean.url ?? patch.url ?? '')
  }
  if (patch.desc !== undefined) clean.desc = patch.desc.trim()
  if (patch.categoryId !== undefined) clean.categoryId = patch.categoryId
  if (patch.tags !== undefined) clean.tags = dedupeTags(patch.tags)
  if (patch.icon !== undefined) clean.icon = patch.icon
  if (patch.iconMode !== undefined) clean.iconMode = patch.iconMode
  if (patch.pinned !== undefined) clean.pinned = patch.pinned ? 1 : 0
  await db.bookmarks.update(id, clean)
}

export async function deleteBookmark(id: string): Promise<void> {
  const ts = now()
  await db.bookmarks.update(id, { deletedAt: ts, updatedAt: ts })
}

export async function deleteBookmarks(ids: string[]): Promise<void> {
  const ts = now()
  const rows = await db.bookmarks.bulkGet(ids)
  await db.bookmarks.bulkPut(
    rows.filter((b): b is Bookmark => !!b).map((b) => ({ ...b, deletedAt: ts, updatedAt: ts })),
  )
}

export async function restoreBookmark(id: string): Promise<void> {
  await db.bookmarks.update(id, { deletedAt: 0, updatedAt: now() })
}

export async function togglePinned(id: string): Promise<void> {
  const b = await db.bookmarks.get(id)
  if (!b) return
  await db.bookmarks.update(id, { pinned: b.pinned ? 0 : 1, updatedAt: now() })
}

export async function moveBookmarks(ids: string[], categoryId: string): Promise<void> {
  const ts = now()
  const rows = await db.bookmarks.bulkGet(ids)
  await db.bookmarks.bulkPut(
    rows.filter((b): b is Bookmark => !!b).map((b) => ({ ...b, categoryId, updatedAt: ts })),
  )
}

/**
 * 记录一次点击。
 *
 * 刻意不更新 updatedAt —— 浏览行为不应该触发整条记录的同步覆盖。
 * 否则会出现这种事故：你在电脑上改了标题还没同步，手机上点了一下这个书签，
 * 手机的 updatedAt 更新 → Last-Write-Wins 判手机赢 → 标题改动丢失。
 *
 * 代价是「访问次数 / 最常访问」属于每台设备各自的统计，不跨设备合并。
 * 这其实挺合理：工作机和家里电脑的常用站本来就不一样。
 * （强制全量同步时服务端会对 visits 取两边最大值，不会把计数改小。）
 */
export async function recordVisit(id: string): Promise<void> {
  const b = await db.bookmarks.get(id)
  if (!b) return
  await db.bookmarks.update(id, { visits: b.visits + 1, lastVisitAt: now() })
}

/**
 * 拖拽排序：把 dragId 放到 targetId 之前/之后。
 * 只写 1 条记录（取中点），除非浮点精度不够才整列重排。
 */
export async function reorderBookmark(
  dragId: string,
  categoryId: string,
  targetIndex: number,
): Promise<void> {
  const ts = now()
  await db.transaction('rw', db.bookmarks, async () => {
    const siblings = (
      await db.bookmarks.where('categoryId').equals(categoryId).toArray()
    )
      .filter((b) => b.deletedAt === 0 && b.id !== dragId)
      .sort((a, b) => a.sort - b.sort)

    const idx = Math.max(0, Math.min(targetIndex, siblings.length))
    const before = idx > 0 ? siblings[idx - 1].sort : null
    const after = idx < siblings.length ? siblings[idx].sort : null

    if (needsResort(before, after)) {
      const dragged = await db.bookmarks.get(dragId)
      if (!dragged) return
      const rebuilt = [...siblings]
      rebuilt.splice(idx, 0, dragged)
      await db.bookmarks.bulkPut(
        rebuilt.map((b, i) => ({
          ...b,
          categoryId,
          sort: (i + 1) * SORT_STEP,
          updatedAt: ts,
        })),
      )
      return
    }

    await db.bookmarks.update(dragId, {
      categoryId,
      sort: sortBetween(before, after),
      updatedAt: ts,
    })
  })
}

function dedupeTags(tags: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of tags) {
    const t = raw.trim().slice(0, 40)
    if (!t) continue
    const key = t.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(t)
  }
  return out.slice(0, 20)
}

/** 判断某个 URL 是否已经收藏过，添加时用来提示重复 */
export async function findByUrl(url: string): Promise<Bookmark | undefined> {
  const target = normalizeUrl(url).replace(/\/$/, '').toLowerCase()
  const domain = getDomain(url)
  if (!domain) return undefined
  const all = await db.bookmarks.where('deletedAt').equals(0).toArray()
  return all.find((b) => b.url.replace(/\/$/, '').toLowerCase() === target)
}

/** 回收站：列出软删除的书签 */
export async function trashedBookmarks(): Promise<Bookmark[]> {
  const all = await db.bookmarks.where('deletedAt').above(0).toArray()
  return all.sort((a, b) => b.deletedAt - a.deletedAt)
}

/** 彻底清空回收站（真删除，不可恢复，也不会再同步回来） */
export async function emptyTrash(): Promise<number> {
  const ids = (await db.bookmarks.where('deletedAt').above(0).toArray()).map((b) => b.id)
  await db.bookmarks.bulkDelete(ids)
  return ids.length
}
