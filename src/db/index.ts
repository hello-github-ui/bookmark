/**
 * Dexie / IndexedDB —— 本项目的「本地文件系统」。
 *
 * 整个应用是 local-first 的：所有读写都先打本地库，界面因此永远是瞬开、离线可用；
 * 云端同步是异步的旁路，挂了也不影响使用。
 */

import Dexie, { type Table } from 'dexie'
import type { Bookmark, Category } from '~shared/model'

export interface SettingRow {
  key: string
  value: unknown
}

/** 图标解析结果缓存，避免每次渲染都把所有图标源重试一遍 */
export interface IconCacheRow {
  domain: string
  url: string
  ok: number
  updatedAt: number
}

/** 同步状态（游标、token 等），和业务数据分开存 */
export interface SyncStateRow {
  key: string
  value: unknown
}

export type AppDatabase = Dexie & {
  categories: Table<Category, string>
  bookmarks: Table<Bookmark, string>
  settings: Table<SettingRow, string>
  iconCache: Table<IconCacheRow, string>
  syncState: Table<SyncStateRow, string>
}

/**
 * 用 `new Dexie(...) as AppDatabase` 而不是 `class extends Dexie`：
 * 类字段（useDefineForClassFields）会在构造后把 table 属性覆盖成 undefined，
 * 这是 Dexie + TS 的经典坑，官方推荐就是这种写法。
 */
export const db = new Dexie('nav-bookmarks') as AppDatabase

db.version(1).stores({
  // 第一个是主键，后面是索引；&=唯一，*=多值索引
  categories: 'id, sort, updatedAt, deletedAt',
  bookmarks: 'id, categoryId, sort, updatedAt, deletedAt, pinned, visits, createdAt, *tags',
  settings: 'key',
  iconCache: 'domain, updatedAt',
  syncState: 'key',
})

/** 请求持久化存储，防止浏览器在磁盘紧张时自动清掉我们的 IndexedDB */
export async function requestPersistence(): Promise<boolean> {
  if (!navigator.storage?.persist) return false
  try {
    if (await navigator.storage.persisted?.()) return true
    return await navigator.storage.persist()
  } catch {
    return false
  }
}

export interface StorageInfo {
  usage: number
  quota: number
  persisted: boolean
  categories: number
  bookmarks: number
}

export async function storageInfo(): Promise<StorageInfo> {
  let usage = 0
  let quota = 0
  let persisted = false
  try {
    const est = await navigator.storage?.estimate?.()
    usage = est?.usage ?? 0
    quota = est?.quota ?? 0
    persisted = (await navigator.storage?.persisted?.()) ?? false
  } catch {
    /* 某些隐私模式下不可用，忽略 */
  }
  const [categories, bookmarks] = await Promise.all([
    db.categories.where('deletedAt').equals(0).count(),
    db.bookmarks.where('deletedAt').equals(0).count(),
  ])
  return { usage, quota, persisted, categories, bookmarks }
}

export function formatBytes(bytes: number): string {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

/** 本地偏好设置（主题等），这些是「每台设备自己的」，不参与云端同步 */
export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db.settings.get(key)
  return row === undefined ? fallback : (row.value as T)
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await db.settings.put({ key, value })
}

export async function getSyncState<T>(key: string, fallback: T): Promise<T> {
  const row = await db.syncState.get(key)
  return row === undefined ? fallback : (row.value as T)
}

export async function setSyncState(key: string, value: unknown): Promise<void> {
  await db.syncState.put({ key, value })
}
