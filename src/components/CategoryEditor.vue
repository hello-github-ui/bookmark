<script setup lang="ts">
/** 新建 / 编辑分类：名称 + emoji 图标 + 强调色 */
import { computed, ref, watch } from 'vue'
import { addCategory, removeCategory, saveCategory } from '@/store/actions'
import { categories, counts } from '@/store/data'
import { editingCategory, modals } from '@/store/ui'
import BaseIcon from './BaseIcon.vue'
import BaseModal from './BaseModal.vue'

const EMOJIS = [
  '📁','⭐','💻','🎨','🤖','⚡','📚','🎵','🎬','🎮','🛒','💰','✈️','🍜','🏃','📷',
  '🔧','🧪','📰','💬','☁️','🔐','📊','🧠','🌏','🏠','🎯','🧩','📦','🔖','🚀','💡',
]

const COLORS = [
  '', '#8b5cf6', '#3b82f6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899',
]

const form = ref({ name: '', icon: '📁', color: '' })
const saving = ref(false)
const showEmojiGrid = ref(false)

const isEdit = computed(() => !!editingCategory.value)
const canSave = computed(() => form.value.name.trim().length > 0)
const childCount = computed(() =>
  editingCategory.value ? (counts.value.get(editingCategory.value.id) ?? 0) : 0,
)
const moveTarget = ref('')

watch(
  () => modals.categoryEditor,
  (open) => {
    if (!open) return
    showEmojiGrid.value = false
    moveTarget.value = ''
    const c = editingCategory.value
    form.value = c
      ? { name: c.name, icon: c.icon || '📁', color: c.color }
      : { name: '', icon: '📁', color: '' }
  },
)

async function submit(): Promise<void> {
  if (!canSave.value || saving.value) return
  saving.value = true
  try {
    if (editingCategory.value) await saveCategory(editingCategory.value.id, form.value)
    else await addCategory(form.value)
    close()
  } finally {
    saving.value = false
  }
}

async function onDelete(): Promise<void> {
  if (!editingCategory.value) return
  await removeCategory(editingCategory.value.id, moveTarget.value || undefined)
  close()
}

function close(): void {
  modals.categoryEditor = false
  editingCategory.value = null
}

const otherCategories = computed(() =>
  categories.value.filter((c) => c.id !== editingCategory.value?.id),
)
</script>

<template>
  <BaseModal
    :open="modals.categoryEditor"
    :title="isEdit ? '编辑分类' : '新建分类'"
    :width="460"
    @close="close"
  >
    <form class="form" @submit.prevent="submit">
      <div class="head">
        <button
          type="button"
          class="head__icon"
          :style="form.color ? { background: form.color } : undefined"
          title="选择图标"
          @click="showEmojiGrid = !showEmojiGrid"
        >
          {{ form.icon }}
        </button>
        <input
          v-model="form.name"
          data-autofocus
          class="input head__name"
          type="text"
          placeholder="分类名称"
          maxlength="40"
          @keydown.enter.prevent="submit"
        />
      </div>

      <Transition name="fade">
        <div v-if="showEmojiGrid" class="emoji-grid">
          <button
            v-for="e in EMOJIS"
            :key="e"
            type="button"
            class="emoji-grid__item"
            :class="{ 'emoji-grid__item--on': form.icon === e }"
            @click="form.icon = e; showEmojiGrid = false"
          >
            {{ e }}
          </button>
        </div>
      </Transition>

      <div class="field">
        <span class="field__label">强调色</span>
        <div class="swatches">
          <button
            v-for="c in COLORS"
            :key="c || 'none'"
            type="button"
            class="swatch"
            :class="{ 'swatch--on': form.color === c, 'swatch--none': !c }"
            :style="c ? { background: c } : undefined"
            :title="c || '跟随主题'"
            @click="form.color = c"
          >
            <BaseIcon v-if="form.color === c" name="check" :size="12" />
          </button>
        </div>
      </div>

      <div v-if="isEdit && childCount > 0" class="field">
        <label class="field__label" for="cat-move">
          删除时，把里面的 {{ childCount }} 个书签
        </label>
        <select id="cat-move" v-model="moveTarget" class="select">
          <option value="">一起删除（可从提示里撤销）</option>
          <option v-for="c in otherCategories" :key="c.id" :value="c.id">
            移动到「{{ c.icon }} {{ c.name }}」
          </option>
        </select>
      </div>

      <button type="submit" hidden />
    </form>

    <template #footer>
      <button v-if="isEdit" type="button" class="btn btn--danger" @click="onDelete">
        <BaseIcon name="trash" :size="14" /> 删除分类
      </button>
      <span style="flex: 1" />
      <button type="button" class="btn btn--ghost" @click="close">取消</button>
      <button type="button" class="btn btn--primary" :disabled="!canSave || saving" @click="submit">
        {{ isEdit ? '保存' : '创建' }}
      </button>
    </template>
  </BaseModal>
</template>

<style scoped>
.form {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.head {
  display: flex;
  align-items: center;
  gap: 10px;
}

.head__icon {
  flex: none;
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  font-size: 21px;
  line-height: 1;
  border-radius: 13px;
  background: var(--surface-hover);
  border: 1px solid var(--border);
  transition: all 0.15s;
}

.head__icon:hover {
  border-color: var(--accent-ring);
  transform: scale(1.04);
}

.head__name {
  flex: 1;
  height: 44px;
  font-size: 15px;
  font-weight: 550;
}

.emoji-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(38px, 1fr));
  gap: 3px;
  padding: 8px;
  background: var(--surface-hover);
  border-radius: var(--radius);
  max-height: 184px;
  overflow-y: auto;
}

.emoji-grid__item {
  display: grid;
  place-items: center;
  aspect-ratio: 1;
  font-size: 19px;
  border-radius: 8px;
  transition: all 0.12s;
}

.emoji-grid__item:hover {
  background: var(--bg-elevated);
  transform: scale(1.12);
}

.emoji-grid__item--on {
  background: var(--accent-soft);
  box-shadow: inset 0 0 0 1.5px var(--accent);
}

.swatches {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}

.swatch {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 9px;
  color: #fff;
  border: 1px solid var(--border);
  transition: all 0.15s;
}

.swatch:hover {
  transform: scale(1.1);
}

.swatch--none {
  background: repeating-linear-gradient(
    45deg,
    var(--surface-hover),
    var(--surface-hover) 4px,
    var(--border) 4px,
    var(--border) 8px
  );
  color: var(--text);
}

.swatch--on {
  box-shadow: 0 0 0 2px var(--bg-elevated), 0 0 0 4px var(--accent-ring);
}
</style>
