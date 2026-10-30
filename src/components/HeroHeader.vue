<script setup lang="ts">
/** 顶部问候区：时钟 + 问候语 + 一句统计。导航站的经典元素，让首屏不那么干。 */
import { computed, onBeforeUnmount, ref } from 'vue'
import { bookmarks, categories } from '@/store/data'
import { settings } from '@/store/settings'

const now = ref(new Date())
const timer = window.setInterval(() => (now.value = new Date()), 1000)
onBeforeUnmount(() => window.clearInterval(timer))

const time = computed(() =>
  now.value.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }),
)

const dateLabel = computed(() =>
  now.value.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }),
)

const greeting = computed(() => {
  if (settings.heroTitle.trim()) return settings.heroTitle.trim()
  const h = now.value.getHours()
  if (h < 5) return '夜深了'
  if (h < 11) return '早上好'
  if (h < 13) return '中午好'
  if (h < 18) return '下午好'
  if (h < 23) return '晚上好'
  return '夜深了'
})

const summary = computed(
  () => `共 ${bookmarks.value.length} 个书签 · ${categories.value.length} 个分类`,
)
</script>

<template>
  <header class="hero">
    <div class="hero__left">
      <h1 class="hero__greeting">{{ greeting }}</h1>
      <p class="hero__summary">{{ summary }}</p>
    </div>
    <div class="hero__clock">
      <span class="hero__time">{{ time }}</span>
      <span class="hero__date">{{ dateLabel }}</span>
    </div>
  </header>
</template>

<style scoped>
.hero {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 22px;
  animation: slide-up 0.5s var(--ease) both;
}

.hero__greeting {
  font-size: clamp(22px, 3vw, 30px);
  font-weight: 700;
  letter-spacing: -0.03em;
  line-height: 1.15;
  background: linear-gradient(
    135deg,
    var(--text) 15%,
    hsl(var(--accent-h) 80% 62%) 130%
  );
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}

.hero__summary {
  margin-top: 5px;
  font-size: 12.5px;
  color: var(--text-dim);
}

.hero__clock {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  flex: none;
}

.hero__time {
  font-size: clamp(22px, 3vw, 30px);
  font-weight: 300;
  line-height: 1.15;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
  color: var(--text);
}

.hero__date {
  margin-top: 5px;
  font-size: 12px;
  color: var(--text-dim);
}

@media (max-width: 640px) {
  .hero {
    margin-bottom: 16px;
  }

  .hero__clock {
    display: none;
  }
}
</style>
