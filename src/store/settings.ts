/**
 * 界面偏好。
 *
 * 刻意存 localStorage 而不是 IndexedDB，也刻意不参与云端同步：
 *  - 主题/布局这类东西是「每台设备自己的习惯」，手机想用紧凑布局、台式机想用大卡片，强行同步反而难受；
 *  - localStorage 是同步 API，首屏渲染前就能读到，不会出现「先白屏再变深色」的闪烁。
 */

import { reactive, watch } from 'vue'

export type ThemeMode = 'auto' | 'light' | 'dark'
export type LayoutMode = 'card' | 'compact' | 'list'
export type BackgroundMode = 'aurora' | 'plain' | 'image'
export type IconSourceMode = 'proxy' | 'direct'

export interface Settings {
  theme: ThemeMode
  accentHue: number
  layout: LayoutMode
  background: BackgroundMode
  backgroundImage: string
  /** 卡片是否显示描述文字 */
  showDesc: boolean
  showTags: boolean
  /** 在新标签页打开 */
  openInNewTab: boolean
  /** 搜索框默认搜索引擎 id */
  searchEngine: string
  /** 顶部问候语 + 时钟 */
  showHero: boolean
  heroTitle: string
  /** 图标获取方式：proxy 走后端代理（国内更稳），direct 浏览器直连 */
  iconSource: IconSourceMode
  /** 自动同步 */
  autoSync: boolean
  /** 降低动画，照顾低性能设备 */
  reduceMotion: boolean
}

const STORAGE_KEY = 'nav-bookmarks:settings:v1'

const DEFAULTS: Settings = {
  theme: 'auto',
  accentHue: 265,
  layout: 'card',
  background: 'aurora',
  backgroundImage: '',
  showDesc: true,
  showTags: true,
  openInNewTab: true,
  searchEngine: 'bing',
  showHero: true,
  heroTitle: '',
  iconSource: 'proxy',
  autoSync: true,
  reduceMotion: false,
}

function load(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULTS }
    const parsed = JSON.parse(raw) as Partial<Settings>
    return { ...DEFAULTS, ...parsed }
  } catch {
    return { ...DEFAULTS }
  }
}

export const settings = reactive<Settings>(load())

watch(
  settings,
  (value) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
    } catch {
      /* 隐私模式下写不进去就算了，不影响使用 */
    }
  },
  { deep: true },
)

export function resetSettings(): void {
  Object.assign(settings, DEFAULTS)
}

/** 把当前主题真正应用到 <html> 上 */
export function applyTheme(): void {
  const root = document.documentElement
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const dark = settings.theme === 'dark' || (settings.theme === 'auto' && prefersDark)

  root.dataset.theme = dark ? 'dark' : 'light'
  root.style.setProperty('--accent-h', String(settings.accentHue))
  root.dataset.motion = settings.reduceMotion ? 'reduce' : 'full'

  // 让浏览器 UI（手机地址栏）跟着主题走
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', dark ? '#0b0c12' : '#f6f7fb')
}

export function initTheme(): void {
  applyTheme()
  watch(
    () => [settings.theme, settings.accentHue, settings.reduceMotion],
    () => applyTheme(),
  )
  window
    .matchMedia('(prefers-color-scheme: dark)')
    .addEventListener('change', () => settings.theme === 'auto' && applyTheme())
}

export function isDark(): boolean {
  return document.documentElement.dataset.theme === 'dark'
}
