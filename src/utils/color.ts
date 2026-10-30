/** 根据字符串稳定地生成颜色——同一个域名永远得到同一套配色 */

function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h)
}

/** 返回 0-359 的色相 */
export function hueFrom(seed: string): number {
  return hashString(seed) % 360
}

/** 没有图标时用的双色渐变底 */
export function gradientFrom(seed: string): string {
  const h = hueFrom(seed)
  const h2 = (h + 38) % 360
  return `linear-gradient(135deg, hsl(${h} 70% 58%), hsl(${h2} 72% 46%))`
}

/** 首字母：中文取第一个字，英文取首字母，域名取主域首字母 */
export function initialsFrom(text: string, fallback = '#'): string {
  const t = text.trim()
  if (!t) return fallback
  const cjk = /[\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]/
  if (cjk.test(t[0])) return t[0]
  const words = t.split(/[\s._/-]+/).filter(Boolean)
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase()
  return t.slice(0, 2).toUpperCase()
}

/** 主题强调色预设 —— 只存色相，其余由 CSS 变量派生 */
export interface AccentPreset {
  id: string
  name: string
  hue: number
}

export const ACCENTS: AccentPreset[] = [
  { id: 'violet', name: '星云紫', hue: 265 },
  { id: 'blue', name: '深海蓝', hue: 212 },
  { id: 'cyan', name: '极光青', hue: 187 },
  { id: 'green', name: '苔原绿', hue: 150 },
  { id: 'amber', name: '落日橙', hue: 32 },
  { id: 'rose', name: '绯樱粉', hue: 342 },
]
