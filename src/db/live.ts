/**
 * 把 Dexie 的 liveQuery 接到 Vue 的响应式系统上。
 *
 * liveQuery 会监听底层表的变化，数据一变就重新跑查询函数 ——
 * 于是「改数据库」和「界面更新」之间不需要任何手动通知，
 * 甚至跨浏览器标签页的修改也能自动反映过来。
 */

import { liveQuery, type Subscription } from 'dexie'
import { getCurrentScope, onScopeDispose, ref, type Ref, shallowRef } from 'vue'

export interface LiveQueryResult<T> {
  data: Ref<T>
  loading: Ref<boolean>
  error: Ref<Error | null>
}

export function useLiveQuery<T>(
  querier: () => T | Promise<T>,
  initialValue: T,
): LiveQueryResult<T> {
  const data = shallowRef(initialValue) as Ref<T>
  const loading = ref(true)
  const error = ref<Error | null>(null)

  const sub: Subscription = liveQuery(querier).subscribe({
    next(value) {
      data.value = value
      loading.value = false
      error.value = null
    },
    error(err: unknown) {
      error.value = err instanceof Error ? err : new Error(String(err))
      loading.value = false
      console.error('[liveQuery]', err)
    },
  })

  // 在组件外调用（比如模块级单例 store）时没有 effect scope，不需要也无法自动回收
  if (getCurrentScope()) onScopeDispose(() => sub.unsubscribe())

  return { data, loading, error }
}
