<script setup lang="ts">
/**
 * 顶部搜索框。
 * 两层含义：先在自己的书签里找；找不到（或按 Enter 且带修饰键）就丢给搜索引擎。
 * 这是导航站的经典交互 —— 一个框解决「找收藏」和「搜全网」两件事。
 */
import { computed, ref } from 'vue'
import { clearFilters, searchResults, view } from '@/store/data'
import { settings } from '@/store/settings'
import { buildSearchUrl, SEARCH_ENGINES } from '@/utils/url'
import BaseIcon from './BaseIcon.vue'

const input = ref<HTMLInputElement | null>(null)
const engineOpen = ref(false)

const engine = computed(
  () => SEARCH_ENGINES.find((e) => e.id === settings.searchEngine) ?? SEARCH_ENGINES[0],
)

const hits = computed(() => (view.query.trim() ? searchResults.value.length : 0))

function focus(): void {
  input.value?.focus()
  input.value?.select()
}

function onEnter(e: KeyboardEvent): void {
  const q = view.query.trim()
  if (!q) return
  // 有本地命中且不是强制外搜 → 什么都不做，结果已经列在下面了
  if (hits.value > 0 && !e.shiftKey) return
  window.open(buildSearchUrl(engine.value, q), '_blank', 'noopener,noreferrer')
}

function searchExternal(): void {
  const q = view.query.trim()
  if (!q) return
  window.open(buildSearchUrl(engine.value, q), '_blank', 'noopener,noreferrer')
}

/** 延迟关闭，否则 blur 先于 mousedown 触发会选不中 */
function closeEngineSoon(): void {
  window.setTimeout(() => (engineOpen.value = false), 150)
}

function pickEngine(id: string): void {
  settings.searchEngine = id
  engineOpen.value = false
  focus()
}

defineExpose({ focus })
</script>

<template>
  <div class="search" :class="{ 'search--filled': view.query.length > 0 }">
    <div class="search__engine">
      <button
        class="search__engineBtn"
        :title="`用${engine.name}搜索`"
        @click="engineOpen = !engineOpen"
        @blur="closeEngineSoon"
      >
        <span class="search__engineIcon">{{ engine.icon }}</span>
        <BaseIcon name="chevronDown" :size="11" />
      </button>

      <Transition name="fade">
        <ul v-if="engineOpen" class="search__engineList glass">
          <li v-for="e in SEARCH_ENGINES" :key="e.id">
            <button
              class="search__engineItem"
              :class="{ 'search__engineItem--active': e.id === engine.id }"
              @mousedown.prevent="pickEngine(e.id)"
            >
              <span>{{ e.icon }}</span>
              <span>{{ e.name }}</span>
            </button>
          </li>
        </ul>
      </Transition>
    </div>

    <BaseIcon name="search" :size="16" class="search__icon" />

    <input
      ref="input"
      v-model="view.query"
      class="search__input"
      type="search"
      placeholder="搜索书签…  按 / 聚焦，Enter 外部搜索"
      autocomplete="off"
      spellcheck="false"
      aria-label="搜索书签"
      @keydown.enter="onEnter"
      @keydown.esc="clearFilters()"
    />

    <span v-if="view.query.trim()" class="search__hits">{{ hits }} 个结果</span>

    <button
      v-if="view.query.trim()"
      class="search__action"
      :title="`用${engine.name}搜索「${view.query}」`"
      @click="searchExternal"
    >
      <BaseIcon name="external" :size="14" />
    </button>

    <button v-if="view.query || view.activeTags.length" class="search__action" title="清除" @click="clearFilters()">
      <BaseIcon name="close" :size="14" />
    </button>
  </div>
</template>

<style scoped>
.search {
  position: relative;
  display: flex;
  align-items: center;
  gap: 2px;
  flex: 1;
  max-width: 560px;
  height: 38px;
  padding: 0 6px 0 4px;
  border-radius: 99px;
  background: var(--surface);
  border: 1px solid var(--border);
  transition:
    border-color 0.2s var(--ease),
    box-shadow 0.2s var(--ease),
    background 0.2s var(--ease);
}

[data-theme='dark'] .search {
  background: rgb(0 0 0 / 0.22);
}

.search:focus-within {
  border-color: var(--accent-ring);
  box-shadow: 0 0 0 3px var(--accent-soft);
  background: var(--bg-elevated);
}

.search__engine {
  position: relative;
  flex: none;
}

.search__engineBtn {
  display: flex;
  align-items: center;
  gap: 1px;
  height: 28px;
  padding: 0 5px 0 8px;
  border-radius: 99px;
  color: var(--text-dim);
  transition: background 0.15s;
}

.search__engineBtn:hover {
  background: var(--surface-hover);
}

.search__engineIcon {
  font-size: 14px;
  line-height: 1;
}

.search__engineList {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  z-index: 60;
  min-width: 142px;
  padding: 5px;
  border-radius: var(--radius);
  background: var(--bg-elevated);
  box-shadow: var(--shadow-lg);
}

.search__engineItem {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 9px;
  font-size: 12.5px;
  color: var(--text-muted);
  border-radius: 7px;
  text-align: left;
}

.search__engineItem:hover {
  background: var(--surface-hover);
  color: var(--text);
}

.search__engineItem--active {
  color: var(--accent);
  background: var(--accent-soft);
}

.search__icon {
  flex: none;
  margin-left: 4px;
  color: var(--text-dim);
}

.search__input {
  flex: 1;
  min-width: 0;
  height: 100%;
  padding: 0 8px;
  font-size: 13.5px;
  background: none;
}

.search__input::placeholder {
  color: var(--text-dim);
}

.search__input::-webkit-search-cancel-button {
  display: none;
}

.search__hits {
  flex: none;
  padding: 0 6px;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: var(--text-dim);
  white-space: nowrap;
}

.search__action {
  flex: none;
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border-radius: 99px;
  color: var(--text-dim);
  transition: all 0.15s;
}

.search__action:hover {
  background: var(--surface-hover);
  color: var(--text);
}

@media (max-width: 640px) {
  .search__hits {
    display: none;
  }
}
</style>
