<script setup lang="ts">
/**
 * 书签卡片。三种布局共用一个组件，用 CSS 控制差异：
 *   card    —— 大卡片，图标 + 标题 + 描述
 *   compact —— 紧凑，图标 + 标题
 *   list    —— 列表行，图标 + 标题 + 描述 + 地址
 */
import { computed } from 'vue'
import type { Bookmark } from '~shared/model'
import { openBookmark, removeBookmark, togglePin } from '@/store/actions'
import { settings } from '@/store/settings'
import { toggleSelect, toggleTag, view } from '@/store/data'
import { notify, openBookmarkEditor, openContextMenu } from '@/store/ui'
import { prettyUrl } from '@/utils/url'
import BaseIcon from './BaseIcon.vue'
import FaviconImage from './FaviconImage.vue'

const props = defineProps<{ bookmark: Bookmark; index: number; categoryId: string }>()

const emit = defineEmits<{
  dragstart: [event: DragEvent, bookmark: Bookmark]
  dragend: []
}>()

const selected = computed(() => view.selection.includes(props.bookmark.id))
const layout = computed(() => settings.layout)
const iconSize = computed(() =>
  layout.value === 'card' ? 36 : layout.value === 'list' ? 30 : 28,
)

function activate(e: MouseEvent): void {
  if (view.selectMode) {
    e.preventDefault()
    toggleSelect(props.bookmark.id)
    return
  }
  // 按住 Ctrl/Cmd 或中键 → 交给浏览器原生行为（新标签打开）
  if (e.metaKey || e.ctrlKey || e.button === 1) return
  e.preventDefault()
  void openBookmark(props.bookmark)
}

async function copyUrl(): Promise<void> {
  try {
    await navigator.clipboard.writeText(props.bookmark.url)
    notify('链接已复制', 'success')
  } catch {
    notify('复制失败，请手动复制', 'error')
  }
}

function onContextMenu(e: MouseEvent): void {
  openContextMenu(e, [
    {
      label: '在新标签页打开',
      icon: 'external',
      action: () => void openBookmark(props.bookmark, true),
    },
    { label: '复制链接', icon: 'copy', action: copyUrl },
    { divider: true, label: '' },
    { label: '编辑', icon: 'edit', action: () => openBookmarkEditor(props.bookmark) },
    {
      label: props.bookmark.pinned ? '取消置顶' : '置顶',
      icon: 'pin',
      action: () => void togglePin(props.bookmark.id),
    },
    {
      label: selected.value ? '取消选择' : '选择',
      icon: 'check',
      action: () => {
        view.selectMode = true
        toggleSelect(props.bookmark.id)
      },
    },
    { divider: true, label: '' },
    {
      label: '删除',
      icon: 'trash',
      danger: true,
      action: () => void removeBookmark(props.bookmark.id),
    },
  ])
}

const visitLabel = computed(() =>
  props.bookmark.visits > 0 ? `访问 ${props.bookmark.visits} 次` : '尚未访问',
)
</script>

<template>
  <a
    class="card"
    :class="[
      `card--${layout}`,
      { 'card--selected': selected, 'card--select-mode': view.selectMode },
    ]"
    :href="bookmark.url"
    :target="settings.openInNewTab ? '_blank' : '_self'"
    rel="noopener noreferrer"
    :title="`${bookmark.title}\n${bookmark.url}\n${visitLabel}`"
    draggable="true"
    @click="activate"
    @auxclick="activate"
    @contextmenu="onContextMenu"
    @dragstart="emit('dragstart', $event, bookmark)"
    @dragend="emit('dragend')"
  >
    <span v-if="view.selectMode" class="card__check" :class="{ 'card__check--on': selected }">
      <BaseIcon v-if="selected" name="check" :size="12" />
    </span>

    <FaviconImage :bookmark="bookmark" :size="iconSize" class="card__icon" />

    <span class="card__body">
      <span class="card__title truncate">{{ bookmark.title }}</span>

      <span v-if="layout === 'list'" class="card__url truncate">{{ prettyUrl(bookmark.url, 60) }}</span>

      <span
        v-if="settings.showDesc && bookmark.desc && layout !== 'compact'"
        class="card__desc"
        :class="layout === 'card' ? 'clamp-2' : 'truncate'"
        >{{ bookmark.desc }}</span
      >

      <span v-if="settings.showTags && bookmark.tags.length && layout === 'card'" class="card__tags">
        <button
          v-for="tag in bookmark.tags.slice(0, 3)"
          :key="tag"
          class="card__tag"
          @click.prevent.stop="toggleTag(tag)"
        >
          {{ tag }}
        </button>
      </span>
    </span>

    <span v-if="bookmark.pinned" class="card__pin" aria-label="已置顶">
      <BaseIcon name="pin" :size="12" />
    </span>

    <span class="card__actions" @click.prevent.stop>
      <button class="card__action" title="编辑" @click="openBookmarkEditor(bookmark)">
        <BaseIcon name="edit" :size="13.5" />
      </button>
      <button
        class="card__action"
        :title="bookmark.pinned ? '取消置顶' : '置顶'"
        @click="togglePin(bookmark.id)"
      >
        <BaseIcon name="pin" :size="13.5" />
      </button>
      <button class="card__action card__action--danger" title="删除" @click="removeBookmark(bookmark.id)">
        <BaseIcon name="trash" :size="13.5" />
      </button>
    </span>
  </a>
</template>

<style scoped>
.card {
  position: relative;
  display: flex;
  gap: 11px;
  padding: 12px;
  border-radius: var(--radius);
  background: var(--surface);
  border: 1px solid var(--border);
  transition:
    transform 0.18s var(--ease),
    border-color 0.18s var(--ease),
    background 0.18s var(--ease),
    box-shadow 0.18s var(--ease);
  cursor: pointer;
  overflow: hidden;
  isolation: isolate;
}

[data-theme='dark'] .card {
  backdrop-filter: blur(var(--glass-blur)) saturate(140%);
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(140%);
}

/* hover 时顶部透出一道强调色辉光 */
.card::before {
  content: '';
  position: absolute;
  inset: -1px -1px auto;
  height: 42%;
  background: radial-gradient(70% 100% at 50% 0%, var(--accent-soft), transparent 75%);
  opacity: 0;
  transition: opacity 0.22s var(--ease);
  pointer-events: none;
  z-index: -1;
}

.card:hover {
  transform: translateY(-2px);
  border-color: var(--accent-ring);
  background: var(--surface-hover);
  box-shadow: var(--shadow);
}

.card:hover::before {
  opacity: 1;
}

.card:active {
  transform: translateY(0) scale(0.99);
}

.card--selected {
  border-color: var(--accent);
  background: var(--accent-soft);
}

.card__icon {
  transition: transform 0.22s var(--ease);
}

.card:hover .card__icon {
  transform: scale(1.06);
}

.card__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
  justify-content: center;
}

.card__title {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text);
  letter-spacing: -0.005em;
}

.card__desc {
  font-size: 12px;
  line-height: 1.45;
  color: var(--text-muted);
}

.card__url {
  font-size: 11.5px;
  color: var(--text-dim);
  font-family: var(--font-mono);
}

.card__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
}

.card__tag {
  padding: 1px 7px;
  font-size: 10.5px;
  font-weight: 500;
  color: var(--text-dim);
  background: var(--surface-hover);
  border: 1px solid var(--border);
  border-radius: 99px;
  transition: all 0.15s;
}

.card__tag:hover {
  color: var(--accent);
  border-color: var(--accent-ring);
  background: var(--accent-soft);
}

.card__pin {
  position: absolute;
  top: 7px;
  right: 8px;
  display: grid;
  place-items: center;
  width: 17px;
  height: 17px;
  color: var(--accent);
  opacity: 0.85;
  transition: opacity 0.18s;
}

.card:hover .card__pin {
  opacity: 0;
}

.card__check {
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 2;
  display: grid;
  place-items: center;
  width: 17px;
  height: 17px;
  border: 1.5px solid var(--border-strong);
  border-radius: 5px;
  background: var(--bg-elevated);
  color: var(--accent-contrast);
}

.card__check--on {
  background: var(--accent);
  border-color: var(--accent);
}

.card--select-mode {
  padding-left: 30px;
}

/* 悬浮操作按钮 */
.card__actions {
  position: absolute;
  top: 6px;
  right: 6px;
  display: flex;
  gap: 2px;
  padding: 2px;
  border-radius: 9px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-sm);
  opacity: 0;
  transform: translateY(-4px);
  transition: all 0.18s var(--ease);
  pointer-events: none;
}

.card:hover .card__actions,
.card:focus-within .card__actions {
  opacity: 1;
  transform: translateY(0);
  pointer-events: auto;
}

.card__action {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  color: var(--text-dim);
  transition: all 0.14s;
}

.card__action:hover {
  background: var(--surface-hover);
  color: var(--text);
}

.card__action--danger:hover {
  background: rgb(248 113 113 / 0.14);
  color: #f87171;
}

/* ---- 布局差异 ---- */
.card--card {
  flex-direction: row;
  align-items: flex-start;
  min-height: 62px;
}

.card--compact {
  align-items: center;
  padding: 9px 11px;
  gap: 9px;
}

.card--compact .card__title {
  font-size: 13px;
}

.card--list {
  align-items: center;
  padding: 9px 12px;
  border-radius: var(--radius-sm);
}

.card--list:hover {
  transform: none;
}

/* 拖拽中 */
.card[data-dragging='true'] {
  opacity: 0.4;
}

@media (hover: none) {
  /* 触屏没有 hover，操作按钮常驻显示 */
  .card__actions {
    opacity: 1;
    transform: none;
    pointer-events: auto;
  }
}
</style>
