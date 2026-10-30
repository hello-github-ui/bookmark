/**
 * 组件统一调用的动作层：在 repo 的纯数据操作之上补齐「提示 + 撤销 + 触发同步」。
 * 组件因此不用关心 Dexie，也不用关心同步时机。
 */

import type { Bookmark } from '~shared/model'
import { db } from '@/db/index'
import * as repo from '@/db/repo'
import { notify } from './ui'
import { scheduleSync } from './sync'
import { settings } from './settings'
import { clearSelection, view } from './data'

/** 包一层：操作成功后自动排一次同步 */
async function withSync<T>(run: () => Promise<T>): Promise<T> {
  const result = await run()
  scheduleSync()
  return result
}

/* --------------------------------------------------------------- 书签 */

export async function addBookmark(input: repo.BookmarkInput): Promise<Bookmark> {
  const created = await withSync(() => repo.createBookmark(input))
  notify(`已添加「${created.title}」`, 'success')
  return created
}

export async function saveBookmark(
  id: string,
  patch: Partial<repo.BookmarkInput>,
): Promise<void> {
  await withSync(() => repo.updateBookmark(id, patch))
  notify('已保存', 'success')
}

export async function removeBookmark(id: string): Promise<void> {
  const snapshot = await db.bookmarks.get(id)
  await withSync(() => repo.deleteBookmark(id))
  notify(`已删除「${snapshot?.title ?? '书签'}」`, 'info', async () => {
    await withSync(() => repo.restoreBookmark(id))
    notify('已恢复', 'success')
  })
}

export async function removeSelected(): Promise<void> {
  const ids = [...view.selection]
  if (!ids.length) return
  await withSync(() => repo.deleteBookmarks(ids))
  clearSelection()
  notify(`已删除 ${ids.length} 个书签`, 'info', async () => {
    await withSync(async () => {
      for (const id of ids) await repo.restoreBookmark(id)
    })
    notify('已恢复', 'success')
  })
}

export async function moveSelected(categoryId: string): Promise<void> {
  const ids = [...view.selection]
  if (!ids.length) return
  await withSync(() => repo.moveBookmarks(ids, categoryId))
  clearSelection()
  notify(`已移动 ${ids.length} 个书签`, 'success')
}

export async function togglePin(id: string): Promise<void> {
  await withSync(() => repo.togglePinned(id))
}

export async function openBookmark(bookmark: Bookmark, forceNewTab?: boolean): Promise<void> {
  const newTab = forceNewTab ?? settings.openInNewTab

  if (newTab) {
    // 新标签页：先跳转，计数慢一点无所谓，别卡住点击响应
    window.open(bookmark.url, '_blank', 'noopener,noreferrer')
    void repo.recordVisit(bookmark.id).then(scheduleSync).catch(() => undefined)
    return
  }

  // 同标签页：页面马上就要卸载了，必须先把计数落盘
  try {
    await repo.recordVisit(bookmark.id)
  } catch {
    /* 统计失败无所谓 */
  }
  window.location.href = bookmark.url
}

export async function reorder(dragId: string, categoryId: string, index: number): Promise<void> {
  await withSync(() => repo.reorderBookmark(dragId, categoryId, index))
}

/* --------------------------------------------------------------- 分类 */

export async function addCategory(input: repo.CategoryInput): Promise<string> {
  const cat = await withSync(() => repo.createCategory(input))
  notify(`已创建分类「${cat.name}」`, 'success')
  return cat.id
}

export async function saveCategory(id: string, patch: repo.CategoryInput): Promise<void> {
  await withSync(() => repo.updateCategory(id, patch))
  notify('分类已更新', 'success')
}

export async function removeCategory(id: string, moveTo?: string): Promise<void> {
  const cat = await db.categories.get(id)
  const moved = await withSync(() => repo.deleteCategory(id, moveTo))
  if (view.active === id) view.active = 'all'
  notify(
    moveTo
      ? `已删除「${cat?.name}」，${moved} 个书签已移动`
      : `已删除「${cat?.name}」及其中 ${moved} 个书签`,
    'info',
  )
}

export async function reorderCategories(ids: string[]): Promise<void> {
  await withSync(() => repo.reorderCategories(ids))
}
