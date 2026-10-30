<script setup lang="ts">
/**
 * 智能整理：把导入进来的一堆文件夹目录，按网站功能重新归类。
 *
 * 刻意做成「先预览再执行」—— 一次动几百条书签，没有预览就是在赌。
 * 每条都能单独改目标分类，改完再应用。
 */
import { computed, ref, watch } from 'vue'
import type { Bookmark } from '~shared/model'
import { applyOrganize, type OrganizeAssignment } from '@/db/repo'
import { bookmarks, categories, categoryMap } from '@/store/data'
import { scheduleSync } from '@/store/sync'
import { modals, notify } from '@/store/ui'
import {
  CATEGORY_PRESETS,
  PRESET_BY_KEY,
  classify,
  folderToTags,
  isImportedCategory,
  type CategoryKey,
} from '@/utils/classify'
import { prettyUrl } from '@/utils/url'
import BaseIcon from './BaseIcon.vue'
import BaseModal from './BaseModal.vue'
import FaviconImage from './FaviconImage.vue'

type Scope = 'imported' | 'all'

const scope = ref<Scope>('imported')
const toTags = ref(true)
const cleanEmpty = ref(true)
const busy = ref(false)
const expanded = ref<Set<CategoryKey>>(new Set())
/** 用户手动改过的目标分类，key 为书签 id */
const overrides = ref<Map<string, CategoryKey>>(new Map())

watch(
  () => modals.organize,
  (open) => {
    if (!open) return
    overrides.value = new Map()
    expanded.value = new Set()
    busy.value = false
  },
)

/* ------------------------------------------------------------- 计算方案 */

interface PlanItem {
  bookmark: Bookmark
  fromName: string
  key: CategoryKey
  autoKey: CategoryKey
  score: number
  reasons: string[]
  tags: string[]
}

/** 参与整理的书签：默认只动导入目录和未分类，用户手建的分类不碰 */
const candidates = computed<Bookmark[]>(() => {
  const all = bookmarks.value.filter((b) => b.deletedAt === 0)
  if (scope.value === 'all') return all
  return all.filter((b) => {
    const cat = categoryMap.value.get(b.categoryId)
    return !cat || isImportedCategory(cat.name)
  })
})

const plan = computed<PlanItem[]>(() =>
  candidates.value.map((b) => {
    const cat = categoryMap.value.get(b.categoryId)
    const fromName = cat?.name ?? '（无分类）'
    const folderPath = cat && isImportedCategory(cat.name) ? cat.name : ''
    const r = classify({
      title: b.title,
      url: b.url,
      desc: b.desc,
      tags: b.tags,
      folderPath,
    })
    return {
      bookmark: b,
      fromName,
      autoKey: r.key,
      key: overrides.value.get(b.id) ?? r.key,
      score: r.score,
      reasons: r.reasons,
      tags: toTags.value ? folderToTags(folderPath) : [],
    }
  }),
)

const grouped = computed(() => {
  const map = new Map<CategoryKey, PlanItem[]>()
  for (const p of CATEGORY_PRESETS) map.set(p.key, [])
  for (const item of plan.value) map.get(item.key)?.push(item)
  return CATEGORY_PRESETS.map((p) => ({ preset: p, items: map.get(p.key) ?? [] })).filter(
    (g) => g.items.length > 0,
  )
})

/** 真正会发生移动的条数（目标分类和现在所在分类不同名才算） */
const movingCount = computed(
  () => plan.value.filter((p) => PRESET_BY_KEY[p.key].name !== p.fromName).length,
)

const unmatchedCount = computed(() => plan.value.filter((p) => p.key === 'other').length)

/** 整理后会变空、且属于导入目录的分类 —— 这些才允许清理 */
const emptyAfter = computed(() => {
  if (!cleanEmpty.value) return []
  const movingIds = new Set(plan.value.map((p) => p.bookmark.id))
  const remain = new Map<string, number>()
  for (const b of bookmarks.value) {
    if (b.deletedAt !== 0 || movingIds.has(b.id)) continue
    remain.set(b.categoryId, (remain.get(b.categoryId) ?? 0) + 1)
  }
  const targetNames = new Set(plan.value.map((p) => PRESET_BY_KEY[p.key].name))
  return categories.value.filter(
    (c) =>
      isImportedCategory(c.name) && !remain.get(c.id) && !targetNames.has(c.name.trim()),
  )
})

function toggle(key: CategoryKey): void {
  const next = new Set(expanded.value)
  next.has(key) ? next.delete(key) : next.add(key)
  expanded.value = next
}

function override(id: string, key: CategoryKey): void {
  const next = new Map(overrides.value)
  next.set(id, key)
  overrides.value = next
}

function resetOverrides(): void {
  overrides.value = new Map()
}

/* ------------------------------------------------------------------ 执行 */

async function run(): Promise<void> {
  if (busy.value || !plan.value.length) return
  busy.value = true
  try {
    const assignments: OrganizeAssignment[] = plan.value.map((p) => {
      const preset = PRESET_BY_KEY[p.key]
      return {
        bookmarkId: p.bookmark.id,
        target: { name: preset.name, icon: preset.icon, color: preset.color },
        tags: p.tags,
      }
    })
    const result = await applyOrganize(
      assignments,
      emptyAfter.value.map((c) => c.id),
    )
    notify(
      `整理完成：移动 ${result.moved} 条` +
        (result.createdCategories ? `，新建 ${result.createdCategories} 个分类` : '') +
        (result.removedCategories ? `，清理 ${result.removedCategories} 个空目录` : ''),
      'success',
    )
    scheduleSync()
    modals.organize = false
  } catch (err) {
    notify(err instanceof Error ? err.message : '整理失败', 'error')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <BaseModal
    :open="modals.organize"
    title="智能整理"
    subtitle="按网站功能重新归类，原文件夹层级会转成标签保留"
    :width="760"
    @close="modals.organize = false"
  >
    <div class="organize">
      <!-- 选项 -->
      <div class="opts">
        <label class="opt">
          <span>范围</span>
          <select v-model="scope" class="select select--auto">
            <option value="imported">仅导入目录与未分类</option>
            <option value="all">全部书签</option>
          </select>
        </label>
        <label class="opt opt--check">
          <input v-model="toTags" type="checkbox" />
          <span>文件夹转为标签</span>
        </label>
        <label class="opt opt--check">
          <input v-model="cleanEmpty" type="checkbox" />
          <span>清理空目录</span>
        </label>
      </div>

      <!-- 概览 -->
      <div class="summary">
        <div class="stat">
          <strong>{{ plan.length }}</strong>
          <span>待整理</span>
        </div>
        <div class="stat">
          <strong>{{ movingCount }}</strong>
          <span>会移动</span>
        </div>
        <div class="stat">
          <strong>{{ grouped.length }}</strong>
          <span>目标分类</span>
        </div>
        <div class="stat" :class="{ 'stat--warn': unmatchedCount > 0 }">
          <strong>{{ unmatchedCount }}</strong>
          <span>没认出来</span>
        </div>
        <div v-if="emptyAfter.length" class="stat">
          <strong>{{ emptyAfter.length }}</strong>
          <span>空目录待清</span>
        </div>
      </div>

      <p v-if="scope === 'imported'" class="hint">
        「常用」「开发」这类你自己建的分类不会被动。想全部重排就把范围改成「全部书签」。
      </p>

      <!-- 预览 -->
      <div v-if="!plan.length" class="empty">
        <BaseIcon name="check" :size="28" />
        <p>没有需要整理的书签</p>
      </div>

      <div v-else class="groups scroll-area">
        <section v-for="g in grouped" :key="g.preset.key" class="group">
          <button class="group__head" type="button" @click="toggle(g.preset.key)">
            <BaseIcon
              name="chevron-down"
              :size="14"
              class="group__chev"
              :class="{ 'group__chev--open': expanded.has(g.preset.key) }"
            />
            <span class="group__icon">{{ g.preset.icon }}</span>
            <span class="group__name">{{ g.preset.name }}</span>
            <span class="group__count">{{ g.items.length }}</span>
          </button>

          <ul v-if="expanded.has(g.preset.key)" class="items">
            <li v-for="item in g.items" :key="item.bookmark.id" class="item">
              <FaviconImage :bookmark="item.bookmark" :size="18" />
              <div class="item__text">
                <span class="item__title truncate">{{ item.bookmark.title }}</span>
                <span class="item__meta truncate">
                  {{ item.fromName }} · {{ prettyUrl(item.bookmark.url) }}
                  <template v-if="item.reasons.length"> · {{ item.reasons[0] }}</template>
                </span>
              </div>
              <select
                class="select select--mini"
                :value="item.key"
                @change="override(item.bookmark.id, ($event.target as HTMLSelectElement).value as CategoryKey)"
              >
                <option v-for="p in CATEGORY_PRESETS" :key="p.key" :value="p.key">
                  {{ p.icon }} {{ p.name }}
                </option>
              </select>
            </li>
          </ul>
        </section>
      </div>
    </div>

    <template #footer>
      <button v-if="overrides.size" class="btn btn--ghost btn--sm" @click="resetOverrides">
        撤销 {{ overrides.size }} 处手动调整
      </button>
      <span class="spacer" />
      <button class="btn btn--ghost" @click="modals.organize = false">取消</button>
      <button class="btn btn--primary" :disabled="busy || !plan.length" @click="run">
        {{ busy ? '整理中…' : `应用（${plan.length} 条）` }}
      </button>
    </template>
  </BaseModal>
</template>

<style scoped>
.organize {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 0;
}

.opts {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 16px;
}
.opt {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-2);
}
.opt--check {
  cursor: pointer;
  user-select: none;
}
.opt--check input {
  accent-color: var(--accent);
  width: 15px;
  height: 15px;
  cursor: pointer;
}

.summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(84px, 1fr));
  gap: 8px;
}
.stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 10px 6px;
  border-radius: 14px;
  background: var(--surface-2);
  border: 1px solid var(--border);
}
.stat strong {
  font-size: 19px;
  font-variant-numeric: tabular-nums;
  color: var(--text-1);
}
.stat span {
  font-size: 11px;
  color: var(--text-3);
}
.stat--warn strong {
  color: var(--warn, #f59e0b);
}

.hint {
  margin: 0;
  font-size: 12px;
  color: var(--text-3);
  line-height: 1.6;
}

.groups {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 46vh;
  overflow-y: auto;
  padding-right: 4px;
}

.group__head {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 9px 12px;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: var(--surface-2);
  color: var(--text-1);
  font-size: 13px;
  cursor: pointer;
  transition: background var(--dur) var(--ease);
}
.group__head:hover {
  background: var(--surface-3);
}
.group__chev {
  color: var(--text-3);
  transition: transform var(--dur) var(--ease);
  transform: rotate(-90deg);
}
.group__chev--open {
  transform: rotate(0deg);
}
.group__icon {
  font-size: 15px;
}
.group__name {
  flex: 1;
  text-align: left;
  font-weight: 500;
}
.group__count {
  font-variant-numeric: tabular-nums;
  font-size: 12px;
  color: var(--text-3);
  background: var(--surface-1);
  border-radius: 999px;
  padding: 1px 9px;
}

.items {
  list-style: none;
  margin: 4px 0 8px;
  padding: 0 0 0 10px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 10px;
  border-radius: 10px;
}
.item:hover {
  background: var(--surface-2);
}
.item__text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.item__title {
  font-size: 13px;
  color: var(--text-1);
}
.item__meta {
  font-size: 11px;
  color: var(--text-3);
}

.select--mini {
  flex: 0 0 auto;
  width: 124px;
  font-size: 12px;
  padding: 4px 8px;
}

.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 28px 0;
  color: var(--text-3);
}
.empty p {
  margin: 0;
  font-size: 13px;
}

.spacer {
  flex: 1;
}
</style>
