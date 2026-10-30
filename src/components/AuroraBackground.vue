<script setup lang="ts">
/**
 * 背景层。
 * 深色下是三团缓慢漂移的极光，浅色下是很淡的一层晕染。
 * 用 CSS 动画 + blur，不用 canvas —— GPU 合成，几乎不占 CPU。
 */
import { computed } from 'vue'
import { settings } from '@/store/settings'

const style = computed(() => {
  if (settings.background === 'image' && settings.backgroundImage) {
    return { backgroundImage: `url("${settings.backgroundImage}")` }
  }
  return undefined
})
</script>

<template>
  <div class="bg" :class="`bg--${settings.background}`" :style="style" aria-hidden="true">
    <template v-if="settings.background === 'aurora'">
      <span class="blob blob--1" />
      <span class="blob blob--2" />
      <span class="blob blob--3" />
      <span class="grain" />
    </template>
    <span v-if="settings.background === 'image'" class="scrim" />
  </div>
</template>

<style scoped>
.bg {
  position: fixed;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  pointer-events: none;
  background-color: var(--bg);
}

.bg--image {
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
}

.scrim {
  position: absolute;
  inset: 0;
  background: var(--bg);
  opacity: 0.84;
  backdrop-filter: blur(2px);
}

.blob {
  position: absolute;
  border-radius: 50%;
  filter: blur(90px);
  opacity: 0.5;
  will-change: transform;
}

[data-theme='light'] .blob {
  opacity: 0.3;
  filter: blur(110px);
}

.blob--1 {
  width: 46vw;
  height: 46vw;
  min-width: 380px;
  min-height: 380px;
  top: -14vw;
  left: -8vw;
  background: hsl(var(--accent-h) 85% 55%);
  animation: drift1 26s ease-in-out infinite alternate;
}

.blob--2 {
  width: 38vw;
  height: 38vw;
  min-width: 320px;
  min-height: 320px;
  top: 8vh;
  right: -10vw;
  background: hsl(calc(var(--accent-h) + 55) 80% 52%);
  animation: drift2 32s ease-in-out infinite alternate;
}

.blob--3 {
  width: 42vw;
  height: 42vw;
  min-width: 340px;
  min-height: 340px;
  bottom: -18vw;
  left: 28vw;
  background: hsl(calc(var(--accent-h) - 45) 78% 50%);
  animation: drift3 29s ease-in-out infinite alternate;
}

/* 一层极细的噪点，消除大面积渐变的色带 */
.grain {
  position: absolute;
  inset: -50%;
  opacity: 0.028;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
}

@keyframes drift1 {
  to {
    transform: translate3d(9vw, 7vh, 0) scale(1.14);
  }
}

@keyframes drift2 {
  to {
    transform: translate3d(-11vw, 10vh, 0) scale(0.88);
  }
}

@keyframes drift3 {
  to {
    transform: translate3d(7vw, -9vh, 0) scale(1.1);
  }
}
</style>
