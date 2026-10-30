<script setup lang="ts">
/**
 * 网站图标。
 * 永远有东西可显示：图片 → emoji → 渐变色块 + 首字母，逐级兜底，不会出现破图。
 */
import { computed, toRef } from 'vue'
import type { Bookmark } from '~shared/model'
import { useFavicon } from '@/composables/useFavicon'

const props = withDefaults(defineProps<{ bookmark: Bookmark; size?: number }>(), { size: 34 })

const bookmarkRef = toRef(props, 'bookmark')
const { src, emoji, initials, gradient, failed, onError, onLoad } = useFavicon(bookmarkRef)

const style = computed(() => ({
  width: `${props.size}px`,
  height: `${props.size}px`,
  borderRadius: `${Math.round(props.size * 0.28)}px`,
}))

const fontSize = computed(() => `${Math.round(props.size * 0.4)}px`)
const emojiSize = computed(() => `${Math.round(props.size * 0.56)}px`)
</script>

<template>
  <div class="favicon" :style="style">
    <span v-if="emoji" class="favicon__emoji" :style="{ fontSize: emojiSize }">{{ emoji }}</span>

    <img
      v-else-if="src && !failed"
      :src="src"
      :alt="''"
      class="favicon__img"
      loading="lazy"
      decoding="async"
      referrerpolicy="no-referrer"
      @error="onError"
      @load="onLoad"
    />

    <span
      v-else
      class="favicon__initials"
      :style="{ background: gradient, fontSize }"
      aria-hidden="true"
      >{{ initials }}</span
    >
  </div>
</template>

<style scoped>
.favicon {
  position: relative;
  flex: none;
  overflow: hidden;
  display: grid;
  place-items: center;
  background: var(--surface-hover);
  box-shadow: inset 0 0 0 1px var(--border);
}

.favicon__img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  padding: 14%;
  background: #fff;
}

[data-theme='dark'] .favicon__img {
  background: rgb(255 255 255 / 0.92);
}

.favicon__initials {
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: #fff;
  text-shadow: 0 1px 2px rgb(0 0 0 / 0.25);
}

.favicon__emoji {
  line-height: 1;
}
</style>
