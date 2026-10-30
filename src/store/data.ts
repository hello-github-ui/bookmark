/**
 * 数据与视图状态的单一来源。
 *
 * categories / bookmarks 由 Dexie 的 liveQuery 驱动：
 * 任何地方写了数据库，这里自动更新，组件完全不需要手动刷新 —— 也包括别的浏览器标签页的修改。
 */

import { computed, reactive, ref } from 'vue'
import type { Bookmark, Category } from '~shared/model'
import { useLiveQuery } from '@/db/live'
import { activeBookmarks, activeCategories } from '@/db/repo'
import { searchItems } from '@/utils/search'
import { getDomain } from '@/utils/url'

/* -------------------------------------------------------------- 原始数据 */

const categoriesQuery = useLiveQuery<Category[]>(activeCategories, [])
const bookmarksQuery = useLiveQuery<Bookmark[]>(activeBookmarks, [])

export const categories = categoriesQuery.data
export const bookmarks = bookmarksQuery.data
export const dataLoading = computed(() => categoriesQuery.loading.value || bookmarksQuery.loading.value)

/* -------------------------------------------------------------- 视图状态 */

/** 智能视图：不是真实分类，而是基于规则的动态集合 */
export const SMART_VIEWS = ['all', 'pinned', 'recent', 'frequent'] as const
export type SmartView = (typeof SMART_VIEWS)[number]

export interface ViewState {
  /** 'all' | 'pinned' | 'recent' | 'frequent' | 分类 id */
  active: string
  query: string
  activeTags: string[]
  /** 多选模式下被勾中的书签 */
  selection: string[]
  selectMode: boolean
}

export const view = reactive<ViewState>({
  active: 'all',
  query: '',
  activeTags: [],
  selection: [],
  selectMode: false,
})

export const isSmartView = computed(() => (SMART_VIEWS as readonly string[]).includes(view.active))

/* ------------------------------------------------------------ 派生数据 */

export const categoryMap = computed(() => new Map(categories.value.map((c) => [c.id, c])))

/** 每个分类下的书签（已排序），置顶的排在最前 */
export const byCategory = computed(() => {
  const map = new Map<string, Bookmark[]>()
  for (const c of categories.value) map.set(c.id, [])
  for (const b of bookmarks.value) {
    const list = map.get(b.categoryId)
    if (list) list.push(b)
    else map.set(b.categoryId, [b])
  }
  // 只按 sort 排，不把置顶的提到最前 ——
  // 展示顺序必须和 sort 字段顺序一致，否则拖拽算出来的插入位置会错位。
  // 置顶另有「置顶」视图和卡片角标体现，分类内保持所见即所得的手动顺序。
  for (const list of map.values()) list.sort((a, b) => a.sort - b.sort)
  return map
})

export const counts = computed(() => {
  const map = new Map<string, number>()
  for (const b of bookmarks.value) map.set(b.categoryId, (map.get(b.categoryId) ?? 0) + 1)
  return map
})

/** 归属分类已被删除的「孤儿」书签，界面上收进「未分类」 */
export const orphanBookmarks = computed(() =>
  bookmarks.value.filter((b) => !categoryMap.value.has(b.categoryId)),
)

export const allTags = computed(() => {
  const map = new Map<string, number>()
  for (const b of bookmarks.value) {
    for (const t of b.tags) map.set(t, (map.get(t) ?? 0) + 1)
  }
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name, count]) => ({ name, count }))
})

export const pinnedBookmarks = computed(() =>
  bookmarks.value.filter((b) => b.pinned === 1).sort((a, b) => a.sort - b.sort),
)

export const recentBookmarks = computed(() =>
  [...bookmarks.value].sort((a, b) => b.createdAt - a.createdAt).slice(0, 40),
)

export const frequentBookmarks = computed(() =>
  bookmarks.value
    .filter((b) => b.visits > 0)
    .sort((a, b) => b.visits - a.visits || b.lastVisitAt - a.lastVisitAt)
    .slice(0, 40),
)

/* --------------------------------------------------------------- 搜索 */

function matchesTags(b: Bookmark): boolean {
  if (!view.activeTags.length) return true
  return view.activeTags.every((t) => b.tags.includes(t))
}

/** 搜索命中的书签（跨分类），按相关度排序 */
export const searchResults = computed<Bookmark[]>(() => {
  const q = view.query.trim()
  const pool = bookmarks.value.filter(matchesTags)
  if (!q) return pool
  return searchItems(pool, q, (b) => [
    { text: b.title, weight: 1 },
    { text: getDomain(b.url), weight: 0.9 },
    { text: b.url, weight: 0.5 },
    { text: b.desc, weight: 0.45 },
    { text: b.tags.join(' '), weight: 0.7 },
  ]).map((m) => m.item)
})

export const isSearching = computed(() => view.query.trim().length > 0 || view.activeTags.length > 0)

/** 当前应该渲染的分组列表 */
export interface DisplaySection {
  id: string
  name: string
  icon: string
  color: string
  items: Bookmark[]
}

export const sections = computed<DisplaySection[]>(() => {
  // 1) 搜索 / 标签筛选中：所有结果平铺成一组
  if (isSearching.value) {
    const items = searchResults.value
    return items.length
      ? [{ id: '__search', name: '搜索结果', icon: '🔍', color: '', items }]
      : []
  }

  // 2) 智能视图
  if (view.active === 'pinned') {
    return [{ id: '__pinned', name: '置顶', icon: '📌', color: '', items: pinnedBookmarks.value }]
  }
  if (view.active === 'recent') {
    return [{ id: '__recent', name: '最近添加', icon: '🕒', color: '', items: recentBookmarks.value }]
  }
  if (view.active === 'frequent') {
    return [
      { id: '__frequent', name: '最常访问', icon: '🔥', color: '', items: frequentBookmarks.value },
    ]
  }

  // 3) 单个分类
  if (view.active !== 'all') {
    const cat = categoryMap.value.get(view.active)
    if (!cat) return []
    return [
      {
        id: cat.id,
        name: cat.name,
        icon: cat.icon,
        color: cat.color,
        items: byCategory.value.get(cat.id) ?? [],
      },
    ]
  }

  // 4) 全部：按分类依次铺开，空分类也保留（方便往里拖东西）
  const out: DisplaySection[] = categories.value.map((c) => ({
    id: c.id,
    name: c.name,
    icon: c.icon,
    color: c.color,
    items: byCategory.value.get(c.id) ?? [],
  }))
  if (orphanBookmarks.value.length) {
    out.push({
      id: '__orphan',
      name: '未分类',
      icon: '📦',
      color: '',
      items: orphanBookmarks.value,
    })
  }
  return out
})

export const totalVisible = computed(() =>
  sections.value.reduce((sum, s) => sum + s.items.length, 0),
)

/* --------------------------------------------------------------- 操作 */

export function setView(id: string): void {
  view.active = id
  view.query = ''
  clearSelection()
}

export function toggleTag(tag: string): void {
  const i = view.activeTags.indexOf(tag)
  if (i >= 0) view.activeTags.splice(i, 1)
  else view.activeTags.push(tag)
}

export function clearFilters(): void {
  view.query = ''
  view.activeTags = []
}

export function toggleSelect(id: string): void {
  const i = view.selection.indexOf(id)
  if (i >= 0) view.selection.splice(i, 1)
  else view.selection.push(id)
}

export function clearSelection(): void {
  view.selection = []
  view.selectMode = false
}

export function selectAllVisible(): void {
  view.selection = sections.value.flatMap((s) => s.items.map((b) => b.id))
}

/** 分类侧边栏的滚动高亮：由 IntersectionObserver 写入 */
export const visibleSectionId = ref<string>('')
