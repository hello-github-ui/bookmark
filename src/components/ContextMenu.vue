<script setup lang="ts">
/** 右键菜单。会自动避让屏幕边缘，不会被切掉。 */
import { computed, nextTick, ref, watch } from 'vue'
import { closeContextMenu, contextMenu, type ContextMenuItem } from '@/store/ui'
import BaseIcon from './BaseIcon.vue'

const el = ref<HTMLElement | null>(null)
const pos = ref({ x: 0, y: 0 })

watch(
  () => contextMenu.open,
  async (open) => {
    if (!open) return
    pos.value = { x: contextMenu.x, y: contextMenu.y }
    await nextTick()
    const rect = el.value?.getBoundingClientRect()
    if (!rect) return
    const pad = 8
    let { x, y } = pos.value
    if (x + rect.width + pad > window.innerWidth) x = window.innerWidth - rect.width - pad
    if (y + rect.height + pad > window.innerHeight) y = window.innerHeight - rect.height - pad
    pos.value = { x: Math.max(pad, x), y: Math.max(pad, y) }
  },
)

async function run(item: ContextMenuItem): Promise<void> {
  if (!item.action) return
  closeContextMenu()
  await item.action()
}

const style = computed(() => ({ left: `${pos.value.x}px`, top: `${pos.value.y}px` }))
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="contextMenu.open" class="ctx-layer" @pointerdown.self="closeContextMenu" @contextmenu.prevent="closeContextMenu">
        <div ref="el" class="ctx glass" :style="style" role="menu">
          <template v-for="(item, i) in contextMenu.items" :key="i">
            <div v-if="item.divider" class="ctx__divider" />
            <button
              v-else
              class="ctx__item"
              :class="{ 'ctx__item--danger': item.danger }"
              role="menuitem"
              @click="run(item)"
            >
              <BaseIcon v-if="item.icon" :name="item.icon" :size="14.5" />
              <span>{{ item.label }}</span>
            </button>
          </template>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.ctx-layer {
  position: fixed;
  inset: 0;
  z-index: 300;
}

.ctx {
  position: absolute;
  min-width: 182px;
  padding: 5px;
  background: var(--bg-elevated);
  border-radius: var(--radius);
  box-shadow: var(--shadow-lg);
  animation: pop-in 0.14s var(--ease);
}

.ctx__item {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 7px 10px;
  font-size: 13px;
  color: var(--text-muted);
  border-radius: 7px;
  text-align: left;
  transition: background 0.12s, color 0.12s;
}

.ctx__item:hover {
  background: var(--surface-hover);
  color: var(--text);
}

.ctx__item--danger {
  color: #f87171;
}

.ctx__item--danger:hover {
  background: rgb(248 113 113 / 0.12);
  color: #f87171;
}

.ctx__divider {
  height: 1px;
  margin: 4px 6px;
  background: var(--border);
}
</style>
