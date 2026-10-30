/**
 * 同步状态 + 登录态。
 *
 * token 存在 localStorage：它只是个有过期时间的签名串，不是密码本身，
 * 丢了最多重新输一次密码，不会泄漏原始口令。
 */

import { computed, reactive } from 'vue'
import * as api from '@/api/client'
import { settings } from './settings'
import { getCursor, resetSyncCursor, runSync, type SyncPhase } from '@/sync/engine'

const TOKEN_KEY = 'nav-bookmarks:token'

export interface SyncStore {
  /** 后端是否存在且配置完整 */
  available: boolean
  /** 探测过没有 */
  probed: boolean
  authenticated: boolean
  publicRead: boolean
  backend: string
  phase: SyncPhase
  lastSyncedAt: number
  lastMessage: string
  pendingPush: number
}

export const syncStore = reactive<SyncStore>({
  available: false,
  probed: false,
  authenticated: false,
  publicRead: true,
  backend: '',
  phase: 'idle',
  lastSyncedAt: 0,
  lastMessage: '',
  pendingPush: 0,
})

export const canEditRemotely = computed(() => syncStore.available && syncStore.authenticated)

function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

function writeToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* ignore */
  }
}

/** 启动时探测后端。失败不报错，直接进入纯本地模式。 */
export async function probeBackend(): Promise<void> {
  api.configureApi({ token: readToken() })
  try {
    const status = await api.fetchStatus()
    syncStore.available = status.configured
    syncStore.authenticated = status.authenticated
    syncStore.publicRead = status.publicRead
    syncStore.backend = status.backend
    if (!status.authenticated) writeToken(null)
    if (!status.configured) {
      syncStore.lastMessage = status.hasDatabase
        ? '后端未设置访问密码'
        : '后端未绑定 D1 数据库'
    }
  } catch {
    syncStore.available = false
    syncStore.authenticated = false
    syncStore.backend = 'local'
  } finally {
    syncStore.probed = true
  }
}

export async function signIn(password: string): Promise<void> {
  const { token } = await api.login(password)
  writeToken(token)
  api.configureApi({ token })
  syncStore.authenticated = true
  await resetSyncCursor() // 首次登录做一次全量，确保两边都齐
  await sync({ force: true })
}

export async function signOut(): Promise<void> {
  writeToken(null)
  api.configureApi({ token: null })
  syncStore.authenticated = false
  syncStore.phase = 'idle'
}

export async function sync(options: { force?: boolean; silent?: boolean } = {}): Promise<void> {
  if (!syncStore.available) return
  if (!options.silent) syncStore.phase = 'syncing'

  const result = await runSync({ force: options.force, canPush: syncStore.authenticated })
  syncStore.phase = result.phase
  syncStore.lastMessage = result.message ?? ''

  if (result.phase === 'ok') {
    syncStore.lastSyncedAt = result.at
    syncStore.pendingPush = 0
  } else if (result.phase === 'unauthorized') {
    syncStore.authenticated = false
    writeToken(null)
  }
}

let timer: number | undefined
let debounce: number | undefined

/**
 * 自动同步的三个触发点：
 *  - 本地数据变化后 3 秒（防抖，连续编辑只同步一次）
 *  - 每 5 分钟一次兜底
 *  - 标签页重新可见时（从别的设备改完切回来能立刻看到）
 */
export function startAutoSync(): void {
  const tick = () => {
    if (settings.autoSync && syncStore.available) void sync({ silent: true })
  }

  timer = window.setInterval(tick, 5 * 60 * 1000)

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') tick()
  })
  window.addEventListener('online', tick)

  // 关页面前尽量把最后的改动推上去
  window.addEventListener('pagehide', () => {
    if (settings.autoSync && syncStore.available && syncStore.pendingPush > 0) {
      void sync({ silent: true })
    }
  })
}

export function stopAutoSync(): void {
  if (timer) window.clearInterval(timer)
}

/** 任何本地写操作后调用，触发一次防抖同步 */
export function scheduleSync(): void {
  if (!settings.autoSync || !syncStore.available || !syncStore.authenticated) return
  syncStore.pendingPush++
  if (debounce) window.clearTimeout(debounce)
  debounce = window.setTimeout(() => void sync({ silent: true }), 3000)
}

export async function syncDebugInfo(): Promise<{ pulledAt: number; pushedAt: number }> {
  return getCursor()
}
