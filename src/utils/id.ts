/** 生成本地唯一 ID。用 crypto.randomUUID，老浏览器退回时间戳 + 随机数。 */
export function uid(prefix = ''): string {
  const raw =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  return prefix ? `${prefix}_${raw}` : raw
}

/**
 * 排序值采用「取中点」策略：在 a 和 b 之间插入时取 (a+b)/2。
 * 好处是拖拽排序只需要改动一条记录的 sort，而不是整列重排，
 * 这对增量同步非常友好（改 1 条 vs 改 100 条）。
 */
export const SORT_STEP = 1024

export function sortBetween(before: number | null, after: number | null): number {
  if (before === null && after === null) return SORT_STEP
  if (before === null) return (after as number) - SORT_STEP
  if (after === null) return before + SORT_STEP
  return (before + after) / 2
}

/** 浮点数反复取中点会耗尽精度，差值太小的时候需要整列重排 */
export function needsResort(before: number | null, after: number | null): boolean {
  if (before === null || after === null) return false
  return Math.abs(after - before) < 1e-6
}
