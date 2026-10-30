<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AppSidebar from './components/AppSidebar.vue'
import AuroraBackground from './components/AuroraBackground.vue'
import BaseIcon from './components/BaseIcon.vue'
import BookmarkEditor from './components/BookmarkEditor.vue'
import BulkAddDialog from './components/BulkAddDialog.vue'
import CategoryEditor from './components/CategoryEditor.vue'
import CategorySection from './components/CategorySection.vue'
import CommandPalette from './components/CommandPalette.vue'
import OrganizeDialog from './components/OrganizeDialog.vue'
import ContextMenu from './components/ContextMenu.vue'
import HeroHeader from './components/HeroHeader.vue'
import SearchBar from './components/SearchBar.vue'
import SettingsPanel from './components/SettingsPanel.vue'
import ShortcutsDialog from './components/ShortcutsDialog.vue'
import ToastHost from './components/ToastHost.vue'

import { useHotkeys } from './composables/useHotkeys'
import { requestPersistence } from './db/index'
import { seedIfEmpty } from './db/seed'
import { moveSelected, removeSelected } from './store/actions'
import {
  categories,
  clearFilters,
  clearSelection,
  dataLoading,
  isSearching,
  sections,
  selectAllVisible,
  totalVisible,
  view,
  visibleSectionId,
} from './store/data'
import { initTheme, settings } from './store/settings'
import { probeBackend, startAutoSync, sync, syncStore } from './store/sync'
import { modals, openBookmarkEditor, openCategoryEditor } from './store/ui'

const searchBar = ref<InstanceType<typeof SearchBar> | null>(null)
const main = ref<HTMLElement | null>(null)
const mobileMenu = ref(false)
/** 启动流程（探测后端 → 拉云端 → 灌示例）跑完前别急着渲染空状态，否则会闪一下 */
const booting = ref(true)

useHotkeys(() => searchBar.value?.focus())

/* ------------------------------------------------------------ 启动流程 */

onMounted(async () => {
  initTheme()
  void requestPersistence()

  // 顺序很关键：先探测后端并拉一次云端数据，再决定要不要灌示例书签。
  // 反过来的话，换一台新设备打开时会先塞一堆示例，再和云端数据混在一起。
  await probeBackend()
  if (syncStore.available) {
    await sync({ silent: true })
    startAutoSync()
  }
  await seedIfEmpty()

  booting.value = false
  setupScrollSpy()
})

/* ------------------------------------------- 滚动高亮当前分类（scroll spy） */

let observer: IntersectionObserver | null = null

function setupScrollSpy(): void {
  observer?.disconnect()
  if (!main.value) return
  observer = new IntersectionObserver(
    (entries) => {
      // 取最靠近顶部的那个可见区块
      const visible = entries
        .filter((e) => e.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
      if (visible.length) {
        visibleSectionId.value =
          (visible[0].target as HTMLElement).dataset.sectionId ?? ''
      }
    },
    { root: main.value, rootMargin: '-72px 0px -62% 0px', threshold: 0 },
  )
  main.value.querySelectorAll('[data-section-id]').forEach((el) => observer?.observe(el))
}

// 区块列表变化后要重新挂观察器
watch(sections, () => nextTick(setupScrollSpy))

// 换视图 / 改筛选后滚回顶部，否则会停在上一个长列表的半空中
watch(
  () => [view.active, view.query, view.activeTags.length],
  () => main.value?.scrollTo({ top: 0, behavior: 'auto' }),
)

onBeforeUnmount(() => observer?.disconnect())

/* ------------------------------------------------------------- 工具栏 */

const LAYOUT_ICON = { card: 'grid', compact: 'rows', list: 'list' } as const

function cycleLayout(): void {
  const order = ['card', 'compact', 'list'] as const
  settings.layout = order[(order.indexOf(settings.layout) + 1) % order.length]
}

const headline = computed(() => {
  if (isSearching.value) return '搜索结果'
  switch (view.active) {
    case 'all':
      return '全部书签'
    case 'pinned':
      return '置顶'
    case 'recent':
      return '最近添加'
    case 'frequent':
      return '最常访问'
    default:
      return categories.value.find((c) => c.id === view.active)?.name ?? '书签'
  }
})

const isBusy = computed(() => booting.value || dataLoading.value)
const isEmpty = computed(() => !isBusy.value && totalVisible.value === 0)
const moveTarget = ref('')

watch(
  () => view.selection.length,
  (n) => {
    if (!n) moveTarget.value = ''
  },
)

async function onMove(): Promise<void> {
  if (!moveTarget.value) return
  await moveSelected(moveTarget.value)
  moveTarget.value = ''
}
</script>

<template>
  <AuroraBackground />

  <div class="app">
    <AppSidebar :mobile-open="mobileMenu" @close="mobileMenu = false" />

    <Transition name="fade">
      <div v-if="mobileMenu" class="app__scrim" @click="mobileMenu = false" />
    </Transition>

    <div class="app__main">
      <!-- ---------------------------------------------------- 顶栏 -->
      <header class="topbar">
        <button class="topbar__menu" aria-label="菜单" @click="mobileMenu = true">
          <BaseIcon name="menu" :size="18" />
        </button>

        <SearchBar ref="searchBar" />

        <div class="topbar__tools">
          <button class="btn btn--icon" title="命令面板 (Ctrl+K)" @click="modals.commandPalette = true">
            <BaseIcon name="sparkles" :size="16" />
          </button>
          <button
            class="btn btn--icon"
            :title="`布局：${{ card: '卡片', compact: '紧凑', list: '列表' }[settings.layout]} (V)`"
            @click="cycleLayout"
          >
            <BaseIcon :name="LAYOUT_ICON[settings.layout]" :size="16" />
          </button>
          <button
            class="btn btn--icon topbar__hideSm"
            :title="view.selectMode ? '退出多选' : '多选'"
            :class="{ 'btn--active': view.selectMode }"
            @click="view.selectMode ? clearSelection() : (view.selectMode = true)"
          >
            <BaseIcon name="check" :size="16" />
          </button>
          <button class="btn btn--primary" title="添加书签 (N)" @click="openBookmarkEditor(null)">
            <BaseIcon name="plus" :size="15" />
            <span class="topbar__addText">添加</span>
          </button>
        </div>
      </header>

      <!-- ------------------------------------------------ 多选工具条 -->
      <Transition name="fade">
        <div v-if="view.selectMode && view.selection.length" class="bulkbar">
          <span class="bulkbar__count">已选 {{ view.selection.length }} 项</span>
          <button class="btn btn--sm" @click="selectAllVisible">全选</button>
          <select v-model="moveTarget" class="select select--sm" @change="onMove">
            <option value="">移动到…</option>
            <option v-for="c in categories" :key="c.id" :value="c.id">
              {{ c.icon }} {{ c.name }}
            </option>
          </select>
          <button class="btn btn--sm btn--danger" @click="removeSelected">删除</button>
          <button class="btn btn--sm" @click="clearSelection">取消</button>
        </div>
      </Transition>

      <!-- ---------------------------------------------------- 内容区 -->
      <main ref="main" class="content scroll-area">
        <div class="content__inner">
          <HeroHeader v-if="settings.showHero && !isSearching && view.active === 'all'" />

          <div v-if="isSearching || view.active !== 'all'" class="content__head">
            <h2>{{ headline }}</h2>
            <span class="content__count">{{ totalVisible }}</span>
            <button v-if="isSearching" class="btn btn--sm btn--ghost" @click="clearFilters">
              <BaseIcon name="close" :size="13" /> 清除筛选
            </button>
          </div>

          <!-- 骨架屏 -->
          <div v-if="isBusy" class="skeletons">
            <div v-for="i in 8" :key="i" class="skeleton" />
          </div>

          <!-- 空状态 -->
          <div v-else-if="isEmpty" class="empty">
            <span class="empty__icon">
              <BaseIcon :name="isSearching ? 'search' : 'inbox'" :size="26" />
            </span>
            <h3>{{ isSearching ? '没有找到匹配的书签' : '这里还什么都没有' }}</h3>
            <p v-if="isSearching">换个关键词，或者直接用上面的搜索引擎搜一下</p>
            <p v-else>添加第一个书签，开始搭建你自己的导航页</p>
            <div class="empty__actions">
              <button v-if="isSearching" class="btn btn--ghost" @click="clearFilters">清除筛选</button>
              <template v-else>
                <button
                  v-if="!categories.length"
                  class="btn btn--primary"
                  @click="openCategoryEditor(null)"
                >
                  <BaseIcon name="folder" :size="15" /> 新建分类
                </button>
                <button v-else class="btn btn--primary" @click="openBookmarkEditor(null)">
                  <BaseIcon name="plus" :size="15" /> 添加书签
                </button>
                <button class="btn btn--ghost" @click="modals.settings = true">
                  <BaseIcon name="upload" :size="15" /> 导入浏览器书签
                </button>
              </template>
            </div>
          </div>

          <!-- 正文 -->
          <template v-else>
            <CategorySection
              v-for="section in sections"
              :key="section.id"
              :section="section"
              :collapsible="view.active === 'all' && !isSearching"
            />
          </template>

          <footer class="foot">
            <span>本地优先 · 数据存在你自己的浏览器与云端</span>
            <button class="foot__link" @click="modals.shortcuts = true">
              <BaseIcon name="keyboard" :size="13" /> 快捷键
            </button>
          </footer>
        </div>
      </main>
    </div>
  </div>

  <!-- 弹层 -->
  <BookmarkEditor />
  <CategoryEditor />
  <SettingsPanel />
  <BulkAddDialog />
  <ShortcutsDialog />
  <CommandPalette />
  <OrganizeDialog />
  <ContextMenu />
  <ToastHost />
</template>

<style scoped>
.app {
  position: relative;
  z-index: 1;
  display: flex;
  height: 100%;
}

.app__scrim {
  position: fixed;
  inset: 0;
  z-index: 140;
  background: rgb(6 8 16 / 0.5);
  backdrop-filter: blur(2px);
}

.app__main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  height: 100%;
}

/* ------------------------------------------------------------- 顶栏 */
.topbar {
  display: flex;
  align-items: center;
  gap: 10px;
  height: var(--header-h);
  padding: 0 18px;
  flex: none;
  border-bottom: 1px solid var(--border);
  background: color-mix(in srgb, var(--bg) 72%, transparent);
  backdrop-filter: blur(var(--glass-blur)) saturate(140%);
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(140%);
  z-index: 20;
}

.topbar__menu {
  display: none;
  place-items: center;
  width: 34px;
  height: 34px;
  flex: none;
  border-radius: 9px;
  color: var(--text-muted);
}

.topbar__menu:hover {
  background: var(--surface-hover);
}

.topbar__tools {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-left: auto;
  flex: none;
}

.btn--active {
  background: var(--accent-soft);
  color: var(--accent);
}

/* ---------------------------------------------------------- 多选条 */
.bulkbar {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 9px 18px;
  border-bottom: 1px solid var(--border);
  background: var(--accent-soft);
  flex: none;
  flex-wrap: wrap;
}

.bulkbar__count {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--accent);
  margin-right: 4px;
}

.select--sm {
  width: auto;
  height: 30px;
  padding: 0 28px 0 10px;
  font-size: 12px;
}

/* ---------------------------------------------------------- 内容区 */
.content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  scroll-padding-top: 20px;
}

.content__inner {
  max-width: 1360px;
  margin: 0 auto;
  padding: 24px 24px 60px;
}

.content__head {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-bottom: 18px;
}

.content__head h2 {
  font-size: 19px;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.content__count {
  display: grid;
  place-items: center;
  min-width: 22px;
  height: 22px;
  padding: 0 7px;
  font-size: 11.5px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--accent);
  background: var(--accent-soft);
  border-radius: 99px;
}

/* 骨架屏 */
.skeletons {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(232px, 1fr));
  gap: 10px;
}

.skeleton {
  height: 62px;
  border-radius: var(--radius);
  background: linear-gradient(
    90deg,
    var(--surface) 25%,
    var(--surface-hover) 50%,
    var(--surface) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.4s linear infinite;
}

@keyframes shimmer {
  to {
    background-position: -200% 0;
  }
}

/* 空状态 */
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 7px;
  padding: 72px 20px;
  text-align: center;
  animation: slide-up 0.4s var(--ease) both;
}

.empty__icon {
  display: grid;
  place-items: center;
  width: 60px;
  height: 60px;
  margin-bottom: 7px;
  border-radius: 20px;
  color: var(--accent);
  background: var(--accent-soft);
}

.empty h3 {
  font-size: 15.5px;
  font-weight: 650;
}

.empty p {
  font-size: 13px;
  color: var(--text-dim);
  max-width: 340px;
}

.empty__actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
  flex-wrap: wrap;
  justify-content: center;
}

/* 页脚 */
.foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  margin-top: 48px;
  padding-top: 18px;
  border-top: 1px solid var(--border);
  font-size: 11.5px;
  color: var(--text-dim);
}

.foot__link {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--text-dim);
  transition: color 0.15s;
}

.foot__link:hover {
  color: var(--accent);
}

/* --------------------------------------------------------- 响应式 */
@media (max-width: 860px) {
  .topbar__menu {
    display: grid;
  }

  .topbar {
    padding: 0 12px;
  }

  .content__inner {
    padding: 18px 14px 48px;
  }
}

@media (max-width: 640px) {
  .topbar__addText,
  .topbar__hideSm {
    display: none;
  }

  .topbar__tools {
    gap: 3px;
  }
}
</style>
