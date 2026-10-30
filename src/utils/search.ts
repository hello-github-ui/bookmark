/**
 * 轻量模糊搜索。没引第三方库，因为需求很简单：
 * 在标题 / 地址 / 描述 / 标签里找子序列匹配，并按「匹配得有多好」打分排序。
 */

export interface ScoredMatch<T> {
  item: T
  score: number
}

/**
 * 子序列匹配打分。
 * 连续命中、命中开头、命中单词首字母都会加分，这样输入 "gh" 能优先匹配到 "GitHub"。
 */
export function fuzzyScore(text: string, query: string): number {
  if (!query) return 1
  const t = text.toLowerCase()
  const q = query.toLowerCase()
  if (!t) return 0

  // 完全相等 / 前缀 / 包含 —— 直接给高分，省得走下面的逐字符扫描
  if (t === q) return 1000
  if (t.startsWith(q)) return 800 - t.length * 0.1
  const idx = t.indexOf(q)
  if (idx >= 0) return 600 - idx * 2 - t.length * 0.1

  let score = 0
  let ti = 0
  let streak = 0
  for (let qi = 0; qi < q.length; qi++) {
    const ch = q[qi]
    let found = -1
    for (let i = ti; i < t.length; i++) {
      if (t[i] === ch) {
        found = i
        break
      }
    }
    if (found === -1) return 0 // 有字符没匹配上，整体判负
    const isBoundary = found === 0 || /[\s._/-]/.test(t[found - 1])
    score += 10
    if (isBoundary) score += 15
    if (found === ti) {
      streak++
      score += streak * 8
    } else {
      streak = 0
      score -= Math.min(found - ti, 10)
    }
    ti = found + 1
  }
  return Math.max(score, 1)
}

/** 多字段加权搜索 */
export function searchItems<T>(
  items: T[],
  query: string,
  fields: (item: T) => { text: string; weight: number }[],
): ScoredMatch<T>[] {
  const q = query.trim()
  if (!q) return items.map((item) => ({ item, score: 0 }))

  const out: ScoredMatch<T>[] = []
  for (const item of items) {
    let best = 0
    for (const { text, weight } of fields(item)) {
      const s = fuzzyScore(text, q) * weight
      if (s > best) best = s
    }
    if (best > 0) out.push({ item, score: best })
  }
  return out.sort((a, b) => b.score - a.score)
}

/** 把命中的片段切出来，供 UI 高亮 */
export function highlightParts(text: string, query: string): { text: string; hit: boolean }[] {
  const q = query.trim().toLowerCase()
  if (!q) return [{ text, hit: false }]
  const lower = text.toLowerCase()
  const idx = lower.indexOf(q)
  if (idx === -1) return [{ text, hit: false }]
  const parts: { text: string; hit: boolean }[] = []
  if (idx > 0) parts.push({ text: text.slice(0, idx), hit: false })
  parts.push({ text: text.slice(idx, idx + q.length), hit: true })
  if (idx + q.length < text.length) parts.push({ text: text.slice(idx + q.length), hit: false })
  return parts
}
