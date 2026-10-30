<script setup lang="ts">
/** 批量添加：一行一个链接，支持 "标题 | url"、markdown 链接、纯 url */
import { computed, ref, watch } from 'vue'
import { parseBulkText } from '@/db/io'
import { activeBookmarks, createBookmark } from '@/db/repo'
import { categories } from '@/store/data'
import { scheduleSync } from '@/store/sync'
import { modals, notify } from '@/store/ui'
import { prettyUrl } from '@/utils/url'
import BaseModal from './BaseModal.vue'

const text = ref('')
const categoryId = ref('')
const skipDuplicates = ref(true)
const busy = ref(false)

const parsed = computed(() => parseBulkText(text.value))

watch(
  () => modals.bulkAdd,
  (open) => {
    if (!open) return
    text.value = ''
    categoryId.value = categories.value[0]?.id ?? ''
  },
)

async function submit(): Promise<void> {
  if (!parsed.value.length || !categoryId.value || busy.value) return
  busy.value = true
  let added = 0
  let skipped = 0
  try {
    // 一次性把现有 URL 读成集合，避免每条都做一次全表扫描
    const normalize = (u: string) => u.replace(/\/$/, '').toLowerCase()
    const existing = skipDuplicates.value
      ? new Set((await activeBookmarks()).map((b) => normalize(b.url)))
      : new Set<string>()

    for (const item of parsed.value) {
      const key = normalize(item.url)
      if (skipDuplicates.value && existing.has(key)) {
        skipped++
        continue
      }
      existing.add(key)
      await createBookmark({ url: item.url, title: item.title, categoryId: categoryId.value })
      added++
    }
    scheduleSync()
    notify(`已添加 ${added} 个书签${skipped ? `，跳过 ${skipped} 个重复` : ''}`, 'success')
    modals.bulkAdd = false
  } catch (err) {
    notify(err instanceof Error ? err.message : '批量添加失败', 'error')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <BaseModal
    :open="modals.bulkAdd"
    title="批量添加书签"
    subtitle="每行一个链接，会自动识别标题"
    :width="560"
    @close="modals.bulkAdd = false"
  >
    <div class="form">
      <div class="field">
        <label class="field__label" for="bulk-text">
          <span>链接列表</span>
          <span class="count">已识别 {{ parsed.length }} 个</span>
        </label>
        <textarea
          id="bulk-text"
          v-model="text"
          data-autofocus
          class="textarea"
          rows="9"
          spellcheck="false"
          placeholder="https://github.com&#10;Vue 官网 | https://cn.vuejs.org&#10;[MDN](https://developer.mozilla.org)"
        />
      </div>

      <div class="field">
        <label class="field__label" for="bulk-cat">加入分类</label>
        <select id="bulk-cat" v-model="categoryId" class="select">
          <option v-for="c in categories" :key="c.id" :value="c.id">
            {{ c.icon }} {{ c.name }}
          </option>
        </select>
      </div>

      <label class="toggle">
        <input v-model="skipDuplicates" type="checkbox" />
        <span>跳过已经收藏过的链接</span>
      </label>

      <ul v-if="parsed.length" class="preview scroll-area">
        <li v-for="(item, i) in parsed.slice(0, 20)" :key="i">
          <strong class="truncate">{{ item.title }}</strong>
          <span class="truncate">{{ prettyUrl(item.url, 44) }}</span>
        </li>
        <li v-if="parsed.length > 20" class="preview__more">还有 {{ parsed.length - 20 }} 个…</li>
      </ul>
    </div>

    <template #footer>
      <button class="btn btn--ghost" @click="modals.bulkAdd = false">取消</button>
      <button
        class="btn btn--primary"
        :disabled="!parsed.length || !categoryId || busy"
        @click="submit"
      >
        {{ busy ? '添加中…' : `添加 ${parsed.length} 个` }}
      </button>
    </template>
  </BaseModal>
</template>

<style scoped>
.form {
  display: flex;
  flex-direction: column;
  gap: 13px;
}

.count {
  font-size: 11px;
  color: var(--accent);
}

.toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
  color: var(--text-muted);
  cursor: pointer;
}

.toggle input {
  accent-color: var(--accent);
  width: 15px;
  height: 15px;
}

.preview {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 150px;
  padding: 7px;
  background: var(--surface-hover);
  border-radius: var(--radius-sm);
}

.preview li {
  display: flex;
  align-items: baseline;
  gap: 9px;
  padding: 3px 5px;
  font-size: 11.5px;
}

.preview strong {
  flex: none;
  max-width: 45%;
  font-weight: 600;
  color: var(--text);
}

.preview span {
  flex: 1;
  min-width: 0;
  font-family: var(--font-mono);
  color: var(--text-dim);
}

.preview__more {
  color: var(--text-dim);
  font-style: italic;
}
</style>
