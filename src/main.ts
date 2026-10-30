import { createApp } from 'vue'
import App from './App.vue'
import './styles/main.css'

/**
 * 在 Vue 挂载前就把主题写到 <html> 上，
 * 否则深色用户会先看到一帧白屏再变黑，很刺眼。
 */
function applyThemeEarly(): void {
  try {
    const raw = localStorage.getItem('nav-bookmarks:settings:v1')
    const saved = raw ? (JSON.parse(raw) as { theme?: string; accentHue?: number }) : {}
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const mode = saved.theme ?? 'auto'
    const dark = mode === 'dark' || (mode === 'auto' && prefersDark)
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    document.documentElement.style.setProperty('--accent-h', String(saved.accentHue ?? 265))
  } catch {
    document.documentElement.dataset.theme = 'dark'
  }
}

applyThemeEarly()

createApp(App).mount('#app')
