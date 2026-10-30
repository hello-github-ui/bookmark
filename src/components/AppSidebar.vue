<script setup lang="ts">
/** 左侧导航：智能视图 + 分类（可拖拽排序、可拖入书签）+ 标签云 + 底部工具 */
import { computed, ref } from 'vue'
import {
  allTags,
  categories,
  counts,
  bookmarks,
  frequentBookmarks,
  pinnedBookmarks,
  recentBookmarks,
  setView,
  toggleTag,
  view,
  visibleSectionId,
} from '@/store/data'
import { moveBookmarks } from '@/db/repo'
import { removeCategory, reorderCategories } from '@/store/actions'
import { modals, notify, openCategoryEditor, openContextMenu } from '@/store/ui'
import { settings } from '@/store/settings'
import { syncStore } from '@/store/sync'
import BaseIcon from './BaseIcon.vue'

defineProps<{ mobileOpen: boolean }>()
const emit = defineEmits<{ close: [] }>()

const SMART = [
  { id: 'all', name: '全部书签', icon: 'layers' },
  { id: 'pinned', name: '置顶', icon: 'pin' },
  { id: 'recent', name: '最近添加', icon: 'clock' },
  { id: 'frequent', name: '最常访问', icon: 'fire' },
] as const

const smartCounts = computed<Record<string, number>>(() => ({
  all: bookmarks.value.length,
  pinned: pinnedBookmarks.value.length,
  recent: recentBookmarks.value.length,
  frequent: frequentBookmarks.value.length,
}))

/** 「全部」视图下跟随滚动高亮当前分类 */
const highlighted = computed(() =>
  view.active === 'all' && visibleSectionId.value ? visibleSectionId.value : view.active,
)

function go(id: string): void {
  if (view.active === 'all' && !id.startsWith('__')) {
    const el = document.getElementById(`section-${id}`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      emit('close')
      return
    }
  }
  setView(id)
  emit('close')
}

/* ----------------------------------------------------- 分类拖拽排序 */

const draggingCat = ref<string | null>(null)
const dragOverCat = ref<string | null>(null)
/** 把书签拖到分类上 = 移动到该分类 */
const bookmarkOverCat = ref<string | null>(null)

function onCatDragStart(e: DragEvent, id: string): void {
  draggingCat.value = id
  e.dataTransfer?.setData('application/x-category-id', id)
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
}

function onCatDragOver(e: DragEvent, id: string): void {
  const types = e.dataTransfer?.types ?? []
  if (types.includes('application/x-bookmark-id')) {
    e.preventDefault()
    bookmarkOverCat.value = id
    return
  }
  if (!draggingCat.value || draggingCat.value === id) return
  e.preventDefault()
  dragOverCat.value = id
}

async function onCatDrop(e: DragEvent, id: string): Promise<void> {
  e.preventDefault()
  const bookmarkId = e.dataTransfer?.getData('application/x-bookmark-id')
  if (bookmarkId) {
    await moveBookmarks([bookmarkId], id)
    notify('已移动到该分类', 'success')
    resetDrag()
    return
  }
  const from = draggingCat.value
  resetDrag()
  if (!from || from === id) return
  const ids = categories.value.map((c) => c.id)
  const fromIndex = ids.indexOf(from)
  const toIndex = ids.indexOf(id)
  if (fromIndex < 0 || toIndex < 0) return
  ids.splice(toIndex, 0, ids.splice(fromIndex, 1)[0])
  await reorderCategories(ids)
}

function resetDrag(): void {
  draggingCat.value = null
  dragOverCat.value = null
  bookmarkOverCat.value = null
}

function onCatContextMenu(e: MouseEvent, id: string, name: string): void {
  openContextMenu(e, [
    {
      label: '编辑分类',
      icon: 'edit',
      action: () => openCategoryEditor(categories.value.find((c) => c.id === id) ?? null),
    },
    { divider: true, label: '' },
    {
      label: `删除「${name}」`,
      icon: 'trash',
      danger: true,
      action: () => void removeCategory(id),
    },
  ])
}

const tagsExpanded = ref(false)
const visibleTags = computed(() =>
  tagsExpanded.value ? allTags.value : allTags.value.slice(0, 12),
)

const syncIcon = computed(() => {
  if (!syncStore.available) return 'cloudOff'
  if (syncStore.phase === 'syncing') return 'refresh'
  if (syncStore.phase === 'error') return 'alert'
  return syncStore.authenticated ? 'cloud' : 'lock'
})

const syncLabel = computed(() => {
  if (!syncStore.probed) return '检测中…'
  if (!syncStore.available) return '本地模式'
  if (syncStore.phase === 'syncing') return '同步中…'
  if (!syncStore.authenticated) return '未解锁'
  if (syncStore.phase === 'error') return '同步失败'
  if (syncStore.lastSyncedAt) {
    const mins = Math.floor((Date.now() - syncStore.lastSyncedAt) / 60000)
    return mins < 1 ? '刚刚同步' : `${mins} 分钟前`
  }
  return '已连接'
})
</script>

<template>
  <aside class="sidebar" :class="{ 'sidebar--open': mobileOpen }">
    <div class="sidebar__brand">
      <span class="sidebar__logo" aria-hidden="true">
        <BaseIcon name="sparkles" :size="17" />
      </span>
      <span class="sidebar__name">我的导航</span>
      <button class="sidebar__closeBtn" aria-label="关闭菜单" @click="emit('close')">
        <BaseIcon name="close" :size="17" />
      </button>
    </div>

    <nav class="sidebar__scroll scroll-area">
      <ul class="nav">
        <li v-for="item in SMART" :key="item.id">
          <button
            class="nav__item"
            :class="{ 'nav__item--active': view.active === item.id }"
            @click="go(item.id)"
          >
            <BaseIcon :name="item.icon" :size="15.5" class="nav__icon" />
            <span class="nav__label truncate">{{ item.name }}</span>
            <span class="nav__count">{{ smartCounts[item.id] }}</span>
          </button>
        </li>
      </ul>

      <div class="nav__heading">
        <span>分类</span>
        <button class="nav__add" title="新建分类" @click="openCategoryEditor(null)">
          <BaseIcon name="plus" :size="14" />
        </button>
      </div>

      <ul class="nav">
        <li
          v-for="cat in categories"
          :key="cat.id"
          draggable="true"
          @dragstart="onCatDragStart($event, cat.id)"
          @dragover="onCatDragOver($event, cat.id)"
          @dragleave="dragOverCat = null; bookmarkOverCat = null"
          @drop="onCatDrop($event, cat.id)"
          @dragend="resetDrag"
        >
          <button
            class="nav__item"
            :class="{
              'nav__item--active': highlighted === cat.id,
              'nav__item--dragover': dragOverCat === cat.id,
              'nav__item--dropTarget': bookmarkOverCat === cat.id,
            }"
            @click="go(cat.id)"
            @contextmenu="onCatContextMenu($event, cat.id, cat.name)"
          >
            <span class="nav__emoji" aria-hidden="true">{{ cat.icon || '📁' }}</span>
            <span class="nav__label truncate">{{ cat.name }}</span>
            <span class="nav__count">{{ counts.get(cat.id) ?? 0 }}</span>
          </button>
        </li>

        <li v-if="!categories.length">
          <button class="nav__item nav__item--muted" @click="openCategoryEditor(null)">
            <BaseIcon name="plus" :size="15" class="nav__icon" />
            <span class="nav__label">创建第一个分类</span>
          </button>
        </li>
      </ul>

      <template v-if="allTags.length">
        <div class="nav__heading">
          <span>标签</span>
          <button
            v-if="allTags.length > 12"
            class="nav__add nav__add--text"
            @click="tagsExpanded = !tagsExpanded"
          >
            {{ tagsExpanded ? '收起' : `全部 ${allTags.length}` }}
          </button>
        </div>
        <div class="tags">
          <button
            v-for="tag in visibleTags"
            :key="tag.name"
            class="chip"
            :class="{ 'chip--active': view.activeTags.includes(tag.name) }"
            @click="toggleTag(tag.name)"
          >
            {{ tag.name }}
            <span class="tags__count">{{ tag.count }}</span>
          </button>
        </div>
      </template>
    </nav>

    <footer class="sidebar__footer">
      <button class="sync" :class="`sync--${syncStore.phase}`" @click="modals.settings = true">
        <BaseIcon
          :name="syncIcon"
          :size="14"
          :class="{ spinning: syncStore.phase === 'syncing' }"
        />
        <span class="truncate">{{ syncLabel }}</span>
      </button>

      <button class="sidebar__iconBtn" title="设置" @click="modals.settings = true">
        <BaseIcon name="settings" :size="16" />
      </button>
      <button
        class="sidebar__iconBtn"
        :title="settings.theme === 'dark' ? '切换到浅色' : '切换到深色'"
        @click="settings.theme = settings.theme === 'dark' ? 'light' : 'dark'"
      >
        <BaseIcon :name="settings.theme === 'dark' ? 'sun' : 'moon'" :size="16" />
      </button>
    </footer>
  </aside>
</template>

<style scoped>
.sidebar {
  display: flex;
  flex-direction: column;
  width: var(--sidebar-w);
  flex: none;
  height: 100%;
  border-right: 1px solid var(--border);
  background: var(--surface);
  backdrop-filter: blur(var(--glass-blur)) saturate(140%);
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(140%);
}

[data-theme='light'] .sidebar {
  background: rgb(255 255 255 / 0.7);
}

.sidebar__brand {
  display: flex;
  align-items: center;
  gap: 9px;
  height: var(--header-h);
  padding: 0 14px;
  flex: none;
}

.sidebar__logo {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 9px;
  color: #fff;
  background: linear-gradient(135deg, var(--accent), hsl(calc(var(--accent-h) + 40) 82% 54%));
  box-shadow: 0 4px 12px -3px var(--accent-ring);
}

.sidebar__name {
  font-size: 14px;
  font-weight: 650;
  letter-spacing: -0.015em;
}

.sidebar__closeBtn {
  display: none;
  margin-left: auto;
  width: 30px;
  height: 30px;
  place-items: center;
  border-radius: 7px;
  color: var(--text-muted);
}

.sidebar__scroll {
  flex: 1;
  padding: 2px 10px 16px;
  min-height: 0;
}

.nav {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.nav__item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 7px 9px;
  border-radius: 8px;
  font-size: 13px;
  color: var(--text-muted);
  text-align: left;
  transition:
    background 0.15s var(--ease),
    color 0.15s var(--ease);
}

.nav__item:hover {
  background: var(--surface-hover);
  color: var(--text);
}

.nav__item--active {
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 550;
}

.nav__item--active::before {
  content: '';
  position: absolute;
  left: -10px;
  top: 50%;
  translate: 0 -50%;
  width: 3px;
  height: 17px;
  border-radius: 0 3px 3px 0;
  background: var(--accent);
}

.nav__item--dragover {
  box-shadow: inset 0 2px 0 var(--accent);
}

.nav__item--dropTarget {
  background: var(--accent-soft);
  outline: 1.5px dashed var(--accent-ring);
  outline-offset: -2px;
}

.nav__item--muted {
  color: var(--text-dim);
  font-style: italic;
}

.nav__icon {
  flex: none;
  opacity: 0.85;
}

.nav__emoji {
  flex: none;
  width: 15.5px;
  text-align: center;
  font-size: 14px;
  line-height: 1;
}

.nav__label {
  flex: 1;
  min-width: 0;
}

.nav__count {
  flex: none;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: var(--text-dim);
  opacity: 0.8;
}

.nav__heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 16px 0 5px;
  padding: 0 9px;
  font-size: 10.5px;
  font-weight: 650;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--text-dim);
}

.nav__add {
  display: grid;
  place-items: center;
  width: 19px;
  height: 19px;
  border-radius: 5px;
  color: var(--text-dim);
}

.nav__add--text {
  width: auto;
  padding: 0 5px;
  font-size: 10px;
  letter-spacing: 0;
  text-transform: none;
}

.nav__add:hover {
  background: var(--surface-hover);
  color: var(--accent);
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 2px 9px;
}

.tags__count {
  opacity: 0.55;
  font-size: 10px;
}

.sidebar__footer {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 9px 10px;
  border-top: 1px solid var(--border);
  flex: none;
}

.sync {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
  padding: 6px 8px;
  font-size: 11.5px;
  color: var(--text-dim);
  border-radius: 7px;
  transition: all 0.15s;
}

.sync:hover {
  background: var(--surface-hover);
  color: var(--text-muted);
}

.sync--ok {
  color: #34d399;
}

.sync--error,
.sync--unauthorized {
  color: #fbbf24;
}

.sidebar__iconBtn {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  flex: none;
  border-radius: 7px;
  color: var(--text-dim);
  transition: all 0.15s;
}

.sidebar__iconBtn:hover {
  background: var(--surface-hover);
  color: var(--text);
}

.spinning {
  animation: spin 1s linear infinite;
}

/* ---- 移动端：抽屉 ---- */
@media (max-width: 860px) {
  .sidebar {
    position: fixed;
    inset: 0 auto 0 0;
    z-index: 150;
    width: min(300px, 84vw);
    transform: translateX(-102%);
    transition: transform 0.28s var(--ease);
    box-shadow: var(--shadow-lg);
    background: var(--bg-elevated);
  }

  .sidebar--open {
    transform: none;
  }

  .sidebar__closeBtn {
    display: grid;
  }
}
</style>
