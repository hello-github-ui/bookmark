<script setup lang="ts">
import { modals } from '@/store/ui'
import BaseModal from './BaseModal.vue'

const GROUPS: { title: string; items: [keys: string[], desc: string][] }[] = [
  {
    title: '全局',
    items: [
      [['Ctrl', 'K'], '打开命令面板（搜索书签 / 执行操作）'],
      [['/'], '聚焦搜索框'],
      [['N'], '添加书签'],
      [['Shift', 'N'], '新建分类'],
      [['B'], '批量添加'],
      [['T'], '切换深色 / 浅色主题'],
      [['V'], '切换卡片 / 紧凑 / 列表布局'],
      [['?'], '显示本帮助'],
      [['Esc'], '关闭弹窗 / 清空搜索'],
    ],
  },
  {
    title: '列表与卡片',
    items: [
      [['点击'], '打开书签'],
      [['Ctrl', '点击'], '在新标签页打开'],
      [['右键'], '打开上下文菜单'],
      [['拖拽'], '排序，或拖到左侧分类上移动'],
    ],
  },
  {
    title: '搜索框',
    items: [
      [['Enter'], '本地无结果时用搜索引擎搜索'],
      [['Shift', 'Enter'], '强制用搜索引擎搜索'],
      [['Esc'], '清空搜索与标签筛选'],
    ],
  },
]
</script>

<template>
  <BaseModal
    :open="modals.shortcuts"
    title="键盘快捷键"
    :width="500"
    @close="modals.shortcuts = false"
  >
    <div class="groups">
      <section v-for="g in GROUPS" :key="g.title">
        <h3>{{ g.title }}</h3>
        <ul>
          <li v-for="([keys, desc], i) in g.items" :key="i">
            <span class="keys">
              <kbd v-for="k in keys" :key="k" class="kbd">{{ k }}</kbd>
            </span>
            <span class="desc">{{ desc }}</span>
          </li>
        </ul>
      </section>
    </div>
  </BaseModal>
</template>

<style scoped>
.groups {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

h3 {
  margin-bottom: 8px;
  font-size: 10.5px;
  font-weight: 650;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--text-dim);
}

ul {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

li {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 5px 8px;
  border-radius: 7px;
  transition: background 0.12s;
}

li:hover {
  background: var(--surface-hover);
}

.keys {
  display: flex;
  gap: 3px;
  flex: none;
  width: 104px;
}

.desc {
  flex: 1;
  min-width: 0;
  font-size: 12.5px;
  color: var(--text-muted);
}
</style>
