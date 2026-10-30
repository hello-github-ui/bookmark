<script setup lang="ts">
/**
 * 一个分类区块：标题栏 + 书签网格。
 * 拖拽排序用原生 HTML5 Drag & Drop 实现（不引 sortablejs，少一个依赖）：
 * dragover 时根据鼠标落点算出插入位置，画一条指示线，drop 时只更新那一条记录的 sort。
 */
import { computed, ref } from 'vue'
import type { Bookmark } from '~shared/model'
import { categoryMap, type DisplaySection } from '@/store/data'
import { removeCategory, reorder } from '@/store/actions'
import { settings } from '@/store/settings'
import { openBookmarkEditor, openCategoryEditor, openContextMenu } from '@/store/ui'
import BaseIcon from './BaseIcon.vue'
import BookmarkCard from './BookmarkCard.vue'

const props = defineProps<{ section: DisplaySection; collapsible?: boolean }>()

const dragging = ref<Bookmark | null>(null)
const dropIndex = ref<number | null>(null)
const collapsed = ref(false)

/** 智能视图/搜索结果是动态集合，不允许拖拽排序 */
const isVirtual = computed(() => props.section.id.startsWith('__'))

function onDragStart(e: DragEvent, bookmark: Bookmark): void {
  if (isVirtual.value) {
    e.preventDefault()
    return
  }
  dragging.value = bookmark
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', bookmark.id)
    e.dataTransfer.setData('application/x-bookmark-id', bookmark.id)
  }
  ;(e.currentTarget as HTMLElement).dataset.dragging = 'true'
}

function onDragEnd(): void {
  dragging.value = null
  dropIndex.value = null
  document.querySelectorAll('[data-dragging="true"]').forEach((el) => {
    delete (el as HTMLElement).dataset.dragging
  })
}

/** 用卡片中心点判断该插在它前面还是后面 */
function computeDropIndex(e: DragEvent, container: HTMLElement): number {
  const cards = Array.from(container.querySelectorAll<HTMLElement>('[data-card]'))
  if (!cards.length) return 0
  for (let i = 0; i < cards.length; i++) {
    const rect = cards[i].getBoundingClientRect()
    const horizontal = settings.layout !== 'list'
    const mid = horizontal ? rect.left + rect.width / 2 : rect.top + rect.height / 2
    const pointer = horizontal ? e.clientX : e.clientY
    // 多列网格里还要考虑行：鼠标在这一行上方就插在这张卡前面
    if (horizontal && e.clientY < rect.top) return i
    if (horizontal && e.clientY <= rect.bottom && pointer < mid) return i
    if (!horizontal && pointer < mid) return i
  }
  return cards.length
}

function onDragOver(e: DragEvent): void {
  if (isVirtual.value) return
  const id = e.dataTransfer?.types.includes('application/x-bookmark-id')
  if (!id && !dragging.value) return
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  dropIndex.value = computeDropIndex(e, e.currentTarget as HTMLElement)
}

function onDragLeave(e: DragEvent): void {
  const related = e.relatedTarget as Node | null
  if (related && (e.currentTarget as HTMLElement).contains(related)) return
  dropIndex.value = null
}

async function onDrop(e: DragEvent): Promise<void> {
  if (isVirtual.value) return
  e.preventDefault()
  const id =
    e.dataTransfer?.getData('application/x-bookmark-id') ||
    e.dataTransfer?.getData('text/plain') ||
    dragging.value?.id
  let index = dropIndex.value ?? props.section.items.length
  onDragEnd()
  if (!id) return

  // dropIndex 是「包含被拖卡片在内」的展示下标，而排序接口按「移除后」的列表定位。
  // 在同一分类里往后拖时要减 1，否则每次都会多挪一格。
  const sourceIndex = props.section.items.findIndex((b) => b.id === id)
  if (sourceIndex >= 0 && index > sourceIndex) index -= 1
  if (sourceIndex >= 0 && index === sourceIndex) return // 原地没动

  await reorder(id, props.section.id, index)
}

function onHeaderContextMenu(e: MouseEvent): void {
  if (isVirtual.value) return
  openContextMenu(e, [
    {
      label: '在此分类添加书签',
      icon: 'plus',
      action: () => openBookmarkEditor(null, props.section.id),
    },
    { label: '编辑分类', icon: 'edit', action: () => openCategoryEditor(findCategory()) },
    { divider: true, label: '' },
    {
      label: '删除分类',
      icon: 'trash',
      danger: true,
      action: () => void removeCategory(props.section.id),
    },
  ])
}

/** section 是展示用的投影，编辑时需要拿回真正的 Category 对象 */
function findCategory() {
  return categoryMap.value.get(props.section.id) ?? null
}
</script>

<template>
  <section :id="`section-${section.id}`" class="section" :data-section-id="section.id">
    <header class="section__header" @contextmenu="onHeaderContextMenu">
      <button
        v-if="collapsible"
        class="section__collapse"
        :aria-expanded="!collapsed"
        @click="collapsed = !collapsed"
      >
        <BaseIcon :name="collapsed ? 'chevronRight' : 'chevronDown'" :size="15" />
      </button>

      <span class="section__emoji" aria-hidden="true">{{ section.icon || '📁' }}</span>
      <h2 class="section__title">{{ section.name }}</h2>
      <span class="section__count">{{ section.items.length }}</span>

      <span class="section__line" />

      <div v-if="!isVirtual" class="section__tools">
        <button class="section__tool" title="添加书签" @click="openBookmarkEditor(null, section.id)">
          <BaseIcon name="plus" :size="15" />
        </button>
        <button class="section__tool" title="编辑分类" @click="openCategoryEditor(findCategory())">
          <BaseIcon name="edit" :size="14" />
        </button>
      </div>
    </header>

    <div
      v-show="!collapsed"
      class="section__grid"
      :class="[`section__grid--${settings.layout}`, { 'section__grid--dropping': dropIndex !== null }]"
      @dragover="onDragOver"
      @dragleave="onDragLeave"
      @drop="onDrop"
    >
      <template v-for="(bookmark, i) in section.items" :key="bookmark.id">
        <span v-if="dropIndex === i" class="drop-line" aria-hidden="true" />
        <div data-card class="section__cell">
          <BookmarkCard
            :bookmark="bookmark"
            :index="i"
            :category-id="section.id"
            @dragstart="onDragStart"
            @dragend="onDragEnd"
          />
        </div>
      </template>

      <span v-if="dropIndex === section.items.length" class="drop-line" aria-hidden="true" />

      <button
        v-if="!isVirtual"
        class="section__add"
        title="添加书签"
        @click="openBookmarkEditor(null, section.id)"
      >
        <BaseIcon name="plus" :size="17" />
        <span>添加</span>
      </button>

      <p v-if="!section.items.length && isVirtual" class="section__empty">这里还没有内容</p>
    </div>
  </section>
</template>

<style scoped>
.section {
  scroll-margin-top: 90px;
}

.section + .section {
  margin-top: 26px;
}

.section__header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 11px;
  padding: 0 2px;
}

.section__collapse {
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  margin-left: -4px;
  border-radius: 5px;
  color: var(--text-dim);
}

.section__collapse:hover {
  background: var(--surface-hover);
  color: var(--text);
}

.section__emoji {
  font-size: 15px;
  line-height: 1;
}

.section__title {
  font-size: 13.5px;
  font-weight: 650;
  letter-spacing: -0.01em;
  color: var(--text);
}

.section__count {
  display: grid;
  place-items: center;
  min-width: 19px;
  height: 19px;
  padding: 0 6px;
  font-size: 11px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--text-dim);
  background: var(--surface-hover);
  border-radius: 99px;
}

.section__line {
  flex: 1;
  height: 1px;
  background: linear-gradient(90deg, var(--border), transparent);
}

.section__tools {
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.18s var(--ease);
}

.section__header:hover .section__tools {
  opacity: 1;
}

.section__tool {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  color: var(--text-dim);
}

.section__tool:hover {
  background: var(--surface-hover);
  color: var(--text);
}

/* ---- 网格 ---- */
.section__grid {
  display: grid;
  gap: 10px;
  position: relative;
}

.section__grid--card {
  grid-template-columns: repeat(auto-fill, minmax(232px, 1fr));
}

.section__grid--compact {
  grid-template-columns: repeat(auto-fill, minmax(176px, 1fr));
}

.section__grid--list {
  grid-template-columns: 1fr;
  gap: 6px;
}

.section__cell {
  min-width: 0;
}

/* 拖拽插入指示线 */
.drop-line {
  position: relative;
  display: block;
  width: 3px;
  margin: 0 -6px;
  border-radius: 99px;
  background: var(--accent);
  box-shadow: 0 0 10px var(--accent-ring);
  animation: fade-in 0.12s var(--ease);
}

.section__grid--list .drop-line {
  width: auto;
  height: 3px;
  margin: -4px 0;
}

.section__add {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 62px;
  font-size: 12.5px;
  font-weight: 500;
  color: var(--text-dim);
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius);
  transition: all 0.18s var(--ease);
}

.section__grid--list .section__add,
.section__grid--compact .section__add {
  min-height: 44px;
}

.section__add:hover {
  color: var(--accent);
  border-color: var(--accent-ring);
  background: var(--accent-soft);
}

.section__empty {
  grid-column: 1 / -1;
  padding: 24px 0;
  text-align: center;
  font-size: 13px;
  color: var(--text-dim);
}
</style>
