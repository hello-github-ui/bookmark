<script setup lang="ts">
/**
 * Ctrl/Cmd + K 命令面板。
 * 一个框里同时搜「书签」和「操作」，上下键选择，Enter 执行 —— 熟手几乎可以不碰鼠标。
 */
import { computed, nextTick, ref, watch } from 'vue'
import type { Bookmark } from '~shared/model'
import { bookmarks, categories, setView } from '@/store/data'
import { openBookmark } from '@/store/actions'
import { modals, openBookmarkEditor, openCategoryEditor } from '@/store/ui'
import { settings } from '@/store/settings'
import { sync } from '@/store/sync'
import { exportJSON } from '@/db/io'
import { searchItems } from '@/utils/search'
import { getDomain, prettyUrl } from '@/utils/url'
import BaseIcon from './BaseIcon.vue'
import FaviconImage from './FaviconImage.vue'

interface Command {
  id: string
  label: string
  hint?: string
  icon: string
  run: () => void | Promise<void>
}

const query = ref('')
const activeIndex = ref(0)
const inputEl = ref<HTMLInputElement | null>(null)
const listEl = ref<HTMLElement | null>(null)

const COMMANDS = computed<Command[]>(() => [
  {
    id: 'add',
    label: '添加书签',
    hint: 'N',
    icon: 'plus',
    run: () => openBookmarkEditor(null),
  },
  {
    id: 'bulk',
    label: '批量添加书签',
    icon: 'inbox',
    run: () => (modals.bulkAdd = true),
  },
  {
    id: 'cat',
    label: '新建分类',
    icon: 'folder',
    run: () => openCategoryEditor(null),
  },
  {
    id: 'theme',
    label: settings.theme === 'dark' ? '切换到浅色主题' : '切换到深色主题',
    icon: settings.theme === 'dark' ? 'sun' : 'moon',
    run: () => (settings.theme = settings.theme === 'dark' ? 'light' : 'dark'),
  },
  {
    id: 'layout',
    label: `切换布局（当前：${{ card: '卡片', compact: '紧凑', list: '列表' }[settings.layout]}）`,
    icon: 'grid',
    run: () => {
      const order = ['card', 'compact', 'list'] as const
      settings.layout = order[(order.indexOf(settings.layout) + 1) % order.length]
    },
  },
  { id: 'sync', label: '立即同步', icon: 'refresh', run: () => sync({ force: false }) },
  { id: 'export', label: '导出备份 (JSON)', icon: 'download', run: () => exportJSON() },
  { id: 'settings', label: '打开设置', icon: 'settings', run: () => (modals.settings = true) },
  { id: 'help', label: '键盘快捷键', hint: '?', icon: 'keyboard', run: () => (modals.shortcuts = true) },
  ...categories.value.map((c) => ({
    id: `cat-${c.id}`,
    label: `跳转到「${c.name}」`,
    icon: 'folder',
    run: () => setView(c.id),
  })),
])

const matchedCommands = computed(() => {
  const q = query.value.trim()
  if (!q) return COMMANDS.value.slice(0, 6)
  return searchItems(COMMANDS.value, q, (c) => [{ text: c.label, weight: 1 }])
    .slice(0, 6)
    .map((m) => m.item)
})

const matchedBookmarks = computed(() => {
  const q = query.value.trim()
  if (!q) {
    return [...bookmarks.value]
      .sort((a, b) => b.visits - a.visits || b.createdAt - a.createdAt)
      .slice(0, 7)
  }
  return searchItems(bookmarks.value, q, (b) => [
    { text: b.title, weight: 1 },
    { text: getDomain(b.url), weight: 0.9 },
    { text: b.url, weight: 0.5 },
    { text: b.tags.join(' '), weight: 0.6 },
  ])
    .slice(0, 9)
    .map((m) => m.item)
})

/** 两组结果拼成一个扁平数组，方便上下键统一导航 */
type Row = { kind: 'command'; item: Command } | { kind: 'bookmark'; item: Bookmark }

const rows = computed<Row[]>(() => [
  ...matchedBookmarks.value.map((item) => ({ kind: 'bookmark' as const, item })),
  ...matchedCommands.value.map((item) => ({ kind: 'command' as const, item })),
])

watch(rows, () => (activeIndex.value = 0))

watch(
  () => modals.commandPalette,
  async (open) => {
    if (!open) return
    query.value = ''
    activeIndex.value = 0
    await nextTick()
    inputEl.value?.focus()
  },
)

function move(delta: number): void {
  const n = rows.value.length
  if (!n) return
  activeIndex.value = (activeIndex.value + delta + n) % n
  nextTick(() => {
    listEl.value
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ block: 'nearest' })
  })
}

async function runRow(row: Row | undefined): Promise<void> {
  if (!row) return
  modals.commandPalette = false
  if (row.kind === 'bookmark') await openBookmark(row.item)
  else await row.item.run()
}

async function onEnter(): Promise<void> {
  await runRow(rows.value[activeIndex.value])
}

const bookmarkOffset = computed(() => matchedBookmarks.value.length)
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="modals.commandPalette"
        class="palette-layer"
        @click.self="modals.commandPalette = false"
      >
        <div class="palette modal__panel" role="dialog" aria-modal="true" aria-label="命令面板">
          <div class="palette__head">
            <BaseIcon name="search" :size="17" class="palette__searchIcon" />
            <input
              ref="inputEl"
              v-model="query"
              class="palette__input"
              type="text"
              placeholder="搜索书签，或输入命令…"
              autocomplete="off"
              spellcheck="false"
              @keydown.down.prevent="move(1)"
              @keydown.up.prevent="move(-1)"
              @keydown.enter.prevent="onEnter"
              @keydown.esc="modals.commandPalette = false"
            />
            <kbd class="kbd">Esc</kbd>
          </div>

          <div ref="listEl" class="palette__list scroll-area">
            <template v-if="matchedBookmarks.length">
              <p class="palette__group">{{ query.trim() ? '书签' : '常用书签' }}</p>
              <button
                v-for="(b, i) in matchedBookmarks"
                :key="b.id"
                class="palette__row"
                :data-active="activeIndex === i"
                @click="runRow({ kind: 'bookmark', item: b })"
                @mousemove="activeIndex = i"
              >
                <FaviconImage :bookmark="b" :size="24" />
                <span class="palette__label truncate">{{ b.title }}</span>
                <span class="palette__meta truncate">{{ prettyUrl(b.url, 34) }}</span>
                <BaseIcon name="chevronRight" :size="13" class="palette__go" />
              </button>
            </template>

            <template v-if="matchedCommands.length">
              <p class="palette__group">操作</p>
              <button
                v-for="(c, i) in matchedCommands"
                :key="c.id"
                class="palette__row"
                :data-active="activeIndex === bookmarkOffset + i"
                @click="runRow({ kind: 'command', item: c })"
                @mousemove="activeIndex = bookmarkOffset + i"
              >
                <span class="palette__cmdIcon"><BaseIcon :name="c.icon" :size="14" /></span>
                <span class="palette__label truncate">{{ c.label }}</span>
                <kbd v-if="c.hint" class="kbd">{{ c.hint }}</kbd>
              </button>
            </template>

            <p v-if="!rows.length" class="palette__empty">
              没有匹配的书签或命令
            </p>
          </div>

          <footer class="palette__foot">
            <span><kbd class="kbd">↑</kbd><kbd class="kbd">↓</kbd> 选择</span>
            <span><kbd class="kbd">↵</kbd> 打开</span>
            <span><kbd class="kbd">Esc</kbd> 关闭</span>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.palette-layer {
  position: fixed;
  inset: 0;
  z-index: 250;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: clamp(12px, 12vh, 140px) 16px 32px;
  background: rgb(6 8 16 / 0.55);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}

.palette {
  width: 100%;
  max-width: 580px;
  display: flex;
  flex-direction: column;
  max-height: min(520px, 72vh);
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}

.palette__head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 13px 14px;
  border-bottom: 1px solid var(--border);
  flex: none;
}

.palette__searchIcon {
  color: var(--text-dim);
}

.palette__input {
  flex: 1;
  min-width: 0;
  font-size: 15px;
  background: none;
}

.palette__input::placeholder {
  color: var(--text-dim);
}

.palette__list {
  flex: 1;
  padding: 6px;
  overflow-y: auto;
  min-height: 0;
}

.palette__group {
  padding: 8px 9px 4px;
  font-size: 10.5px;
  font-weight: 650;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-dim);
}

.palette__row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 7px 9px;
  border-radius: 9px;
  text-align: left;
  color: var(--text-muted);
  transition: background 0.1s;
}

.palette__row[data-active='true'] {
  background: var(--accent-soft);
  color: var(--text);
}

.palette__cmdIcon {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  flex: none;
  border-radius: 7px;
  background: var(--surface-hover);
  color: var(--text-muted);
}

.palette__row[data-active='true'] .palette__cmdIcon {
  background: var(--accent);
  color: var(--accent-contrast);
}

.palette__label {
  flex: 1;
  min-width: 0;
  font-size: 13.5px;
  font-weight: 500;
  color: var(--text);
}

.palette__meta {
  flex: none;
  max-width: 40%;
  font-size: 11.5px;
  font-family: var(--font-mono);
  color: var(--text-dim);
}

.palette__go {
  opacity: 0;
  color: var(--accent);
}

.palette__row[data-active='true'] .palette__go {
  opacity: 1;
}

.palette__empty {
  padding: 36px 0;
  text-align: center;
  font-size: 13px;
  color: var(--text-dim);
}

.palette__foot {
  display: flex;
  gap: 14px;
  padding: 9px 14px;
  border-top: 1px solid var(--border);
  background: var(--surface);
  font-size: 11px;
  color: var(--text-dim);
  flex: none;
}

.palette__foot span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
</style>
