/** 全局快捷键。在输入框里打字时自动让路，不会误触发。 */

import { onBeforeUnmount, onMounted } from 'vue'
import { clearFilters, clearSelection, view } from '@/store/data'
import { settings } from '@/store/settings'
import {
  anyModalOpen,
  closeAllModals,
  closeContextMenu,
  modals,
  openBookmarkEditor,
  openCategoryEditor,
} from '@/store/ui'

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  const tag = el.tagName
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    el.isContentEditable
  )
}

export function useHotkeys(focusSearch: () => void): void {
  function onKeydown(e: KeyboardEvent): void {
    const mod = e.metaKey || e.ctrlKey

    // Ctrl/Cmd+K 在任何地方都生效，包括输入框里
    if (mod && e.key.toLowerCase() === 'k') {
      e.preventDefault()
      modals.commandPalette = !modals.commandPalette
      return
    }

    if (e.key === 'Escape') {
      closeContextMenu()
      if (anyModalOpen()) {
        closeAllModals()
        return
      }
      if (view.selectMode) {
        clearSelection()
        return
      }
      if (view.query || view.activeTags.length) clearFilters()
      return
    }

    // 以下单键快捷键只在「没在打字 + 没开弹窗 + 没按修饰键」时生效
    if (isTyping(e.target) || anyModalOpen() || mod || e.altKey) return

    switch (e.key) {
      case '/':
        e.preventDefault()
        focusSearch()
        break
      case 'n':
        e.preventDefault()
        openBookmarkEditor(null, view.active.startsWith('__') || view.active === 'all' ? '' : view.active)
        break
      case 'N':
        e.preventDefault()
        openCategoryEditor(null)
        break
      case 'b':
        e.preventDefault()
        modals.bulkAdd = true
        break
      case 't':
        e.preventDefault()
        settings.theme = settings.theme === 'dark' ? 'light' : 'dark'
        break
      case 'v': {
        e.preventDefault()
        const order = ['card', 'compact', 'list'] as const
        settings.layout = order[(order.indexOf(settings.layout) + 1) % order.length]
        break
      }
      case '?':
        e.preventDefault()
        modals.shortcuts = true
        break
      default:
        break
    }
  }

  onMounted(() => window.addEventListener('keydown', onKeydown))
  onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
}
