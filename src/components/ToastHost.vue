<script setup lang="ts">
/** 右下角提示条，支持「撤销」按钮 */
import { dismissToast, toasts, type Toast } from '@/store/ui'
import BaseIcon from './BaseIcon.vue'

const ICONS: Record<Toast['kind'], string> = {
  info: 'info',
  success: 'check',
  error: 'alert',
}

async function runUndo(toast: Toast): Promise<void> {
  dismissToast(toast.id)
  await toast.undo?.()
}
</script>

<template>
  <Teleport to="body">
    <div class="toasts" role="status" aria-live="polite">
      <TransitionGroup name="toast">
        <div v-for="t in toasts" :key="t.id" class="toast" :class="`toast--${t.kind}`">
          <BaseIcon :name="ICONS[t.kind]" :size="15" class="toast__icon" />
          <span class="toast__text">{{ t.message }}</span>
          <button v-if="t.undo" class="toast__undo" @click="runUndo(t)">撤销</button>
          <button class="toast__close" aria-label="关闭" @click="dismissToast(t.id)">
            <BaseIcon name="close" :size="13" />
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toasts {
  position: fixed;
  right: 18px;
  bottom: 18px;
  z-index: 400;
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-end;
  pointer-events: none;
}

.toast {
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 9px;
  max-width: min(400px, calc(100vw - 36px));
  padding: 10px 10px 10px 13px;
  font-size: 13px;
  color: var(--text);
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow-lg);
  backdrop-filter: blur(12px);
}

.toast__icon {
  flex: none;
  color: var(--text-muted);
}

.toast--success .toast__icon {
  color: #34d399;
}

.toast--error .toast__icon {
  color: #f87171;
}

.toast__text {
  flex: 1;
  min-width: 0;
}

.toast__undo {
  flex: none;
  padding: 3px 9px;
  font-size: 12px;
  font-weight: 600;
  color: var(--accent);
  background: var(--accent-soft);
  border-radius: 6px;
}

.toast__undo:hover {
  background: var(--accent-ring);
  color: var(--accent-contrast);
}

.toast__close {
  flex: none;
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: 6px;
  color: var(--text-dim);
}

.toast__close:hover {
  background: var(--surface-hover);
  color: var(--text);
}

.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s var(--ease);
}

.toast-enter-from {
  opacity: 0;
  transform: translateX(28px) scale(0.95);
}

.toast-leave-to {
  opacity: 0;
  transform: translateX(28px) scale(0.95);
}

.toast-move {
  transition: transform 0.3s var(--ease);
}

@media (max-width: 640px) {
  .toasts {
    left: 12px;
    right: 12px;
    bottom: 12px;
    align-items: stretch;
  }
}
</style>
