/** 弹窗、提示条这类纯界面状态 */

import { reactive, ref } from 'vue'
import type { Bookmark, Category } from '~shared/model'

export type ToastKind = 'info' | 'success' | 'error'

export interface Toast {
  id: number
  message: string
  kind: ToastKind
  /** 可选的撤销操作 */
  undo?: () => void | Promise<void>
}

export const toasts = ref<Toast[]>([])
let toastSeq = 0

export function notify(message: string, kind: ToastKind = 'info', undo?: Toast['undo']): number {
  const id = ++toastSeq
  toasts.value = [...toasts.value, { id, message, kind, undo }]
  const ttl = undo ? 6000 : kind === 'error' ? 5000 : 2800
  window.setTimeout(() => dismissToast(id), ttl)
  return id
}

export function dismissToast(id: number): void {
  toasts.value = toasts.value.filter((t) => t.id !== id)
}

/* ------------------------------------------------------------- 弹窗状态 */

export interface ModalState {
  bookmarkEditor: boolean
  categoryEditor: boolean
  settings: boolean
  commandPalette: boolean
  shortcuts: boolean
  bulkAdd: boolean
  organize: boolean
}

export const modals = reactive<ModalState>({
  bookmarkEditor: false,
  categoryEditor: false,
  settings: false,
  commandPalette: false,
  shortcuts: false,
  bulkAdd: false,
  organize: false,
})

/** 正在编辑的对象；为 null 表示「新建」 */
export const editingBookmark = ref<Bookmark | null>(null)
export const editingCategory = ref<Category | null>(null)
/** 新建书签时预选的分类 */
export const presetCategoryId = ref<string>('')

export function openBookmarkEditor(bookmark: Bookmark | null, categoryId = ''): void {
  editingBookmark.value = bookmark
  presetCategoryId.value = categoryId
  modals.bookmarkEditor = true
}

export function openCategoryEditor(category: Category | null): void {
  editingCategory.value = category
  modals.categoryEditor = true
}

export function closeAllModals(): void {
  for (const key of Object.keys(modals) as (keyof ModalState)[]) modals[key] = false
}

export function anyModalOpen(): boolean {
  return Object.values(modals).some(Boolean)
}

/* ------------------------------------------------------------ 右键菜单 */

export interface ContextMenuItem {
  label: string
  icon?: string
  danger?: boolean
  divider?: boolean
  action?: () => void | Promise<void>
}

export interface ContextMenuState {
  open: boolean
  x: number
  y: number
  items: ContextMenuItem[]
}

export const contextMenu = reactive<ContextMenuState>({ open: false, x: 0, y: 0, items: [] })

export function openContextMenu(event: MouseEvent, items: ContextMenuItem[]): void {
  event.preventDefault()
  contextMenu.open = true
  contextMenu.x = event.clientX
  contextMenu.y = event.clientY
  contextMenu.items = items
}

export function closeContextMenu(): void {
  contextMenu.open = false
  contextMenu.items = []
}
