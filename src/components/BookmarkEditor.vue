<script setup lang="ts">
/**
 * 新建 / 编辑书签。
 * 亮点：粘贴 URL 后自动去后端抓标题、描述、图标（浏览器跨域抓不到，所以走 /api/meta）。
 */
import { computed, nextTick, ref, watch } from 'vue'
import type { IconMode } from '~shared/model'
import * as api from '@/api/client'
import { findByUrl } from '@/db/repo'
import { addBookmark, saveBookmark, removeBookmark } from '@/store/actions'
import { categories } from '@/store/data'
import { editingBookmark, modals, notify, presetCategoryId } from '@/store/ui'
import { syncStore } from '@/store/sync'
import { getDomain, guessTitleFromUrl, isValidUrl, normalizeUrl } from '@/utils/url'
import { gradientFrom, initialsFrom } from '@/utils/color'
import BaseIcon from './BaseIcon.vue'
import BaseModal from './BaseModal.vue'

const form = ref({
  url: '',
  title: '',
  desc: '',
  categoryId: '',
  tagsText: '',
  icon: '',
  iconMode: 'auto' as IconMode,
  pinned: false,
})

const fetching = ref(false)
const saving = ref(false)
const duplicateWarning = ref('')
const urlInput = ref<HTMLInputElement | null>(null)

const isEdit = computed(() => !!editingBookmark.value)
const canSave = computed(() => isValidUrl(form.value.url) && !!form.value.categoryId)
const domain = computed(() => getDomain(form.value.url))

/** 预览用的图标 */
const previewSrc = computed(() => {
  if (form.value.iconMode === 'custom' && form.value.icon) return form.value.icon
  if (form.value.iconMode === 'auto' && domain.value) {
    return syncStore.backend !== 'local' && syncStore.available
      ? api.iconProxyUrl(domain.value)
      : `https://${domain.value}/favicon.ico`
  }
  return ''
})
const previewFailed = ref(false)

watch(
  () => modals.bookmarkEditor,
  async (open) => {
    if (!open) return
    duplicateWarning.value = ''
    previewFailed.value = false
    const b = editingBookmark.value
    if (b) {
      form.value = {
        url: b.url,
        title: b.title,
        desc: b.desc,
        categoryId: b.categoryId,
        tagsText: b.tags.join(', '),
        icon: b.icon,
        iconMode: b.iconMode,
        pinned: b.pinned === 1,
      }
    } else {
      form.value = {
        url: '',
        title: '',
        desc: '',
        categoryId: presetCategoryId.value || categories.value[0]?.id || '',
        tagsText: '',
        icon: '',
        iconMode: 'auto',
        pinned: false,
      }
      // 新建时试着读剪贴板里的链接，省一次粘贴
      await tryClipboard()
    }
    await nextTick()
    urlInput.value?.focus()
  },
)

/**
 * 新建时尝试读剪贴板里的链接，省掉一次手动粘贴。
 * 只在浏览器已经授权的情况下读 —— 否则 readText() 会弹权限框，
 * 「打开个弹窗就被要权限」的体验很差。
 */
async function tryClipboard(): Promise<void> {
  try {
    const perms = navigator.permissions
    if (!perms?.query) return
    // clipboard-read 不是所有浏览器都认，不认就直接放弃
    const status = await perms
      .query({ name: 'clipboard-read' as PermissionName })
      .catch(() => null)
    if (status?.state !== 'granted') return

    const text = (await navigator.clipboard.readText()).trim()
    if (/^https?:\/\/\S+$/i.test(text) && text.length < 2048) {
      form.value.url = text
      await onUrlSettled()
    }
  } catch {
    /* 读不到就算了，正常情况 */
  }
}

/**
 * paste 事件触发时 input.value 还没更新（浏览器是 paste → 改值 → input），
 * 所以要等一个宏任务再读，nextTick 在这里是不够的。
 */
function onPaste(): void {
  window.setTimeout(() => void onUrlSettled(), 0)
}

/** URL 输入完成（失焦或粘贴）后：查重 + 自动补标题 */
async function onUrlSettled(): Promise<void> {
  const url = form.value.url.trim()
  if (!isValidUrl(url)) return

  if (!isEdit.value) {
    const dup = await findByUrl(url)
    duplicateWarning.value = dup ? `已经收藏过了：「${dup.title}」` : ''
  }
  if (!form.value.title.trim()) {
    form.value.title = guessTitleFromUrl(url)
    void autoFetch(true)
  }
}

/** 去后端抓标题/描述/图标 */
async function autoFetch(silent = false): Promise<void> {
  const url = form.value.url.trim()
  if (!isValidUrl(url)) {
    if (!silent) notify('请先填写有效的网址', 'error')
    return
  }
  fetching.value = true
  try {
    const meta = await api.fetchSiteMeta(url)
    if (meta.title) form.value.title = meta.title
    if (meta.desc && !form.value.desc.trim()) form.value.desc = meta.desc
    if (!silent) notify('已自动填充', 'success')
  } catch (err) {
    const e = err as api.ApiError
    if (!silent) {
      notify(
        e.code === api.NO_BACKEND
          ? '当前为纯本地模式，无法自动抓取（部署到 Cloudflare 后可用）'
          : `抓取失败：${e.message}`,
        'error',
      )
    }
  } finally {
    fetching.value = false
  }
}

async function onIconFile(e: Event): Promise<void> {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  if (file.size > 256 * 1024) {
    notify('图片请控制在 256KB 以内', 'error')
    return
  }
  const reader = new FileReader()
  reader.onload = () => {
    form.value.icon = String(reader.result ?? '')
    form.value.iconMode = 'custom'
    previewFailed.value = false
  }
  reader.readAsDataURL(file)
}

async function submit(): Promise<void> {
  if (!canSave.value || saving.value) return
  saving.value = true
  const tags = form.value.tagsText
    .split(/[,，\s]+/)
    .map((t) => t.trim())
    .filter(Boolean)

  const payload = {
    url: normalizeUrl(form.value.url),
    title: form.value.title,
    desc: form.value.desc,
    categoryId: form.value.categoryId,
    tags,
    icon: form.value.icon,
    iconMode: form.value.iconMode,
    pinned: form.value.pinned,
  }

  try {
    if (editingBookmark.value) await saveBookmark(editingBookmark.value.id, payload)
    else await addBookmark(payload)
    close()
  } catch (err) {
    notify(err instanceof Error ? err.message : '保存失败', 'error')
  } finally {
    saving.value = false
  }
}

async function onDelete(): Promise<void> {
  if (!editingBookmark.value) return
  await removeBookmark(editingBookmark.value.id)
  close()
}

function close(): void {
  modals.bookmarkEditor = false
  editingBookmark.value = null
  presetCategoryId.value = ''
}

const ICON_MODES: { id: IconMode; label: string }[] = [
  { id: 'auto', label: '自动' },
  { id: 'custom', label: '图片' },
  { id: 'emoji', label: 'Emoji' },
  { id: 'letter', label: '文字' },
]
</script>

<template>
  <BaseModal
    :open="modals.bookmarkEditor"
    :title="isEdit ? '编辑书签' : '添加书签'"
    :subtitle="isEdit ? '' : '粘贴网址后会自动抓取标题和图标'"
    :width="560"
    @close="close"
  >
    <form class="form" @submit.prevent="submit">
      <!-- 网址 -->
      <div class="field">
        <label class="field__label" for="bm-url">
          <span>网址 <em>*</em></span>
          <button
            type="button"
            class="field__action"
            :disabled="fetching || !isValidUrl(form.url)"
            @click="autoFetch(false)"
          >
            <BaseIcon name="sparkles" :size="12" :class="{ spinning: fetching }" />
            {{ fetching ? '抓取中…' : '自动获取信息' }}
          </button>
        </label>
        <input
          id="bm-url"
          ref="urlInput"
          v-model="form.url"
          data-autofocus
          class="input"
          type="url"
          placeholder="https://example.com"
          autocomplete="off"
          spellcheck="false"
          @blur="onUrlSettled"
          @paste="onPaste"
        />
        <p v-if="duplicateWarning" class="hint hint--warn">
          <BaseIcon name="alert" :size="12" /> {{ duplicateWarning }}
        </p>
      </div>

      <!-- 标题 -->
      <div class="field">
        <label class="field__label" for="bm-title">名称</label>
        <input
          id="bm-title"
          v-model="form.title"
          class="input"
          type="text"
          :placeholder="form.url ? guessTitleFromUrl(form.url) : '留空则自动从网址推断'"
        />
      </div>

      <!-- 描述 -->
      <div class="field">
        <label class="field__label" for="bm-desc">描述</label>
        <textarea
          id="bm-desc"
          v-model="form.desc"
          class="textarea"
          rows="2"
          placeholder="一句话说明这个网站是干嘛的"
        />
      </div>

      <div class="form__row">
        <!-- 分类 -->
        <div class="field">
          <label class="field__label" for="bm-cat">分类 <em>*</em></label>
          <select id="bm-cat" v-model="form.categoryId" class="select">
            <option v-if="!categories.length" value="">请先创建分类</option>
            <option v-for="c in categories" :key="c.id" :value="c.id">
              {{ c.icon }} {{ c.name }}
            </option>
          </select>
        </div>

        <!-- 标签 -->
        <div class="field">
          <label class="field__label" for="bm-tags">标签</label>
          <input
            id="bm-tags"
            v-model="form.tagsText"
            class="input"
            type="text"
            placeholder="用逗号或空格分隔"
          />
        </div>
      </div>

      <!-- 图标 -->
      <div class="field">
        <span class="field__label">图标</span>
        <div class="icon-row">
          <div class="icon-preview">
            <span v-if="form.iconMode === 'emoji'" class="icon-preview__emoji">
              {{ form.icon || '🔖' }}
            </span>
            <img
              v-else-if="previewSrc && !previewFailed"
              :src="previewSrc"
              alt=""
              referrerpolicy="no-referrer"
              @error="previewFailed = true"
              @load="previewFailed = false"
            />
            <span
              v-else
              class="icon-preview__letter"
              :style="{ background: gradientFrom(domain || form.title || 'x') }"
            >
              {{ initialsFrom(form.title || domain || '?') }}
            </span>
          </div>

          <div class="icon-controls">
            <div class="seg">
              <button
                v-for="m in ICON_MODES"
                :key="m.id"
                type="button"
                class="seg__btn"
                :class="{ 'seg__btn--on': form.iconMode === m.id }"
                @click="form.iconMode = m.id; previewFailed = false"
              >
                {{ m.label }}
              </button>
            </div>

            <input
              v-if="form.iconMode === 'custom'"
              v-model="form.icon"
              class="input input--sm"
              type="text"
              placeholder="图片地址，或点右侧上传"
            />
            <input
              v-else-if="form.iconMode === 'emoji'"
              v-model="form.icon"
              class="input input--sm"
              type="text"
              maxlength="4"
              placeholder="粘贴一个 emoji，例如 🚀"
            />
            <p v-else-if="form.iconMode === 'auto'" class="hint">
              自动从 {{ domain || '目标网站' }} 获取图标，失败时显示文字色块
            </p>
            <p v-else class="hint">固定显示名称首字母色块</p>
          </div>

          <label v-if="form.iconMode === 'custom'" class="icon-upload" title="上传图片">
            <BaseIcon name="image" :size="15" />
            <input type="file" accept="image/*" hidden @change="onIconFile" />
          </label>
        </div>
      </div>

      <label class="toggle">
        <input v-model="form.pinned" type="checkbox" />
        <span class="toggle__box"><BaseIcon v-if="form.pinned" name="check" :size="11" /></span>
        <span>置顶显示</span>
      </label>

      <button type="submit" hidden />
    </form>

    <template #footer>
      <button v-if="isEdit" type="button" class="btn btn--danger" @click="onDelete">
        <BaseIcon name="trash" :size="14" /> 删除
      </button>
      <span style="flex: 1" />
      <button type="button" class="btn btn--ghost" @click="close">取消</button>
      <button type="button" class="btn btn--primary" :disabled="!canSave || saving" @click="submit">
        {{ saving ? '保存中…' : isEdit ? '保存' : '添加' }}
      </button>
    </template>
  </BaseModal>
</template>

<style scoped>
.form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.form__row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.field__label em {
  color: var(--accent);
  font-style: normal;
}

.field__action {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 7px;
  font-size: 11px;
  font-weight: 500;
  color: var(--accent);
  background: var(--accent-soft);
  border-radius: 99px;
  transition: all 0.15s;
}

.field__action:hover:not(:disabled) {
  background: var(--accent-ring);
  color: var(--accent-contrast);
}

.field__action:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.hint {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11.5px;
  color: var(--text-dim);
  line-height: 1.4;
}

.hint--warn {
  color: #fbbf24;
}

.input--sm {
  padding: 6px 10px;
  font-size: 12.5px;
}

/* ---- 图标编辑区 ---- */
.icon-row {
  display: flex;
  align-items: flex-start;
  gap: 11px;
}

.icon-preview {
  flex: none;
  display: grid;
  place-items: center;
  width: 46px;
  height: 46px;
  border-radius: 13px;
  overflow: hidden;
  background: var(--surface-hover);
  box-shadow: inset 0 0 0 1px var(--border);
}

.icon-preview img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  padding: 14%;
  background: #fff;
}

.icon-preview__letter {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  font-size: 17px;
  font-weight: 700;
  color: #fff;
}

.icon-preview__emoji {
  font-size: 26px;
  line-height: 1;
}

.icon-controls {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.icon-upload {
  flex: none;
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.15s;
}

.icon-upload:hover {
  border-color: var(--accent-ring);
  color: var(--accent);
}

.seg {
  display: inline-flex;
  padding: 2px;
  gap: 2px;
  background: var(--surface-hover);
  border-radius: 8px;
  align-self: flex-start;
}

.seg__btn {
  padding: 4px 11px;
  font-size: 11.5px;
  font-weight: 500;
  color: var(--text-dim);
  border-radius: 6px;
  transition: all 0.15s;
}

.seg__btn:hover {
  color: var(--text);
}

.seg__btn--on {
  background: var(--bg-elevated);
  color: var(--accent);
  box-shadow: var(--shadow-sm);
}

/* ---- 复选框 ---- */
.toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-muted);
  cursor: pointer;
  user-select: none;
  align-self: flex-start;
}

.toggle input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle__box {
  display: grid;
  place-items: center;
  width: 17px;
  height: 17px;
  border: 1.5px solid var(--border-strong);
  border-radius: 5px;
  color: var(--accent-contrast);
  transition: all 0.15s;
}

.toggle input:checked + .toggle__box {
  background: var(--accent);
  border-color: var(--accent);
}

.toggle input:focus-visible + .toggle__box {
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.spinning {
  animation: spin 1s linear infinite;
}

@media (max-width: 560px) {
  .form__row {
    grid-template-columns: 1fr;
  }
}
</style>
