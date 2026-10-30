<script setup lang="ts">
/** 通用弹窗外壳：遮罩 + 焦点管理 + Esc 关闭 + 滚动锁定 */
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import BaseIcon from './BaseIcon.vue'

const props = withDefaults(
  defineProps<{
    open: boolean
    title?: string
    subtitle?: string
    width?: number
    /** 点遮罩是否关闭 */
    dismissable?: boolean
  }>(),
  { title: '', subtitle: '', width: 520, dismissable: true },
)

const emit = defineEmits<{ close: [] }>()

const panel = ref<HTMLElement | null>(null)
let lastFocused: HTMLElement | null = null

function close(): void {
  emit('close')
}

function onOverlayClick(e: MouseEvent): void {
  if (!props.dismissable) return
  if (e.target === e.currentTarget) close()
}

/** 焦点锁在弹窗内，Tab 不会跑到背后的页面上去 */
function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    e.stopPropagation()
    close()
    return
  }
  if (e.key !== 'Tab' || !panel.value) return
  const focusables = panel.value.querySelectorAll<HTMLElement>(
    'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])',
  )
  if (!focusables.length) return
  const first = focusables[0]
  const last = focusables[focusables.length - 1]
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault()
    first.focus()
  }
}

watch(
  () => props.open,
  async (open) => {
    if (open) {
      lastFocused = document.activeElement as HTMLElement | null
      await nextTick()
      const target =
        panel.value?.querySelector<HTMLElement>('[data-autofocus]') ??
        panel.value?.querySelector<HTMLElement>('input,textarea,button')
      target?.focus()
    } else {
      lastFocused?.focus?.()
      lastFocused = null
    }
  },
)

onBeforeUnmount(() => {
  lastFocused = null
})
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="open"
        class="modal"
        role="dialog"
        aria-modal="true"
        :aria-label="title"
        @click="onOverlayClick"
        @keydown="onKeydown"
      >
        <div ref="panel" class="modal__panel" :style="{ maxWidth: `${width}px` }">
          <header v-if="title || $slots.header" class="modal__header">
            <slot name="header">
              <div class="modal__titles">
                <h2 class="modal__title">{{ title }}</h2>
                <p v-if="subtitle" class="modal__subtitle">{{ subtitle }}</p>
              </div>
            </slot>
            <button class="btn btn--icon modal__close" aria-label="关闭" @click="close">
              <BaseIcon name="close" :size="17" />
            </button>
          </header>

          <div class="modal__body scroll-area">
            <slot />
          </div>

          <footer v-if="$slots.footer" class="modal__footer">
            <slot name="footer" />
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: clamp(16px, 7vh, 80px) 16px 32px;
  background: rgb(6 8 16 / 0.55);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  overflow-y: auto;
}

.modal__panel {
  width: 100%;
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - 120px);
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}

.modal__header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 18px 18px 14px;
  border-bottom: 1px solid var(--border);
}

.modal__titles {
  flex: 1;
  min-width: 0;
}

.modal__title {
  font-size: 15.5px;
  font-weight: 650;
  letter-spacing: -0.01em;
}

.modal__subtitle {
  margin-top: 3px;
  font-size: 12.5px;
  color: var(--text-muted);
}

.modal__close {
  margin: -4px -4px 0 0;
  flex: none;
}

.modal__body {
  padding: 18px;
  overflow-y: auto;
  flex: 1;
}

.modal__footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 14px 18px;
  border-top: 1px solid var(--border);
  background: var(--surface);
}

@media (max-width: 640px) {
  .modal {
    padding: 0;
    align-items: flex-end;
  }

  .modal__panel {
    max-width: none !important;
    max-height: 92vh;
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  }
}
</style>
