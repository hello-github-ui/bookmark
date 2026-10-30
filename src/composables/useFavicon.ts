/**
 * 网站图标解析。
 *
 * 这是导航站最容易做砸的地方：图标源五花八门，国内外可达性还不一样。
 * 这里的做法是「候选链 + 逐级降级」，保证永远不出现破图：
 *
 *   1. 用户自定义（emoji / 图片 URL / 上传的 dataURL）—— 最高优先级；
 *   2. 后端代理 /api/icon —— 服务端挨个试多个源并在边缘缓存 30 天。
 *      国内最稳，顺带绕开防盗链、证书错误、混合内容等一堆浏览器侧的坑；
 *   3. 浏览器直连多个公开图标源（纯静态部署、或代理本身挂了时自动接手）；
 *   4. 全部失败 —— 用域名生成稳定的渐变色块 + 首字母。
 *
 * 成功的那个地址按域名缓存进 IndexedDB，30 天内直接命中，不再重跑整条链。
 */

import { computed, ref, watch, type Ref } from 'vue'
import type { Bookmark } from '~shared/model'
import { iconProxyUrl } from '@/api/client'
import { db } from '@/db/index'
import { settings } from '@/store/settings'
import { syncStore } from '@/store/sync'
import { gradientFrom, initialsFrom } from '@/utils/color'
import { getDomain } from '@/utils/url'

const CACHE_TTL = 30 * 24 * 60 * 60 * 1000

/** 浏览器直连时的候选源，按国内可达性从高到低排 */
function directSources(domain: string): string[] {
  return [
    `https://${domain}/favicon.ico`,
    `https://api.iowen.cn/favicon/${domain}.png`,
    `https://favicon.im/${domain}?larger=true`,
    `https://icon.horse/icon/${domain}`,
  ]
}

/** 内存缓存，同一域名一次会话只查一次 IndexedDB */
const memo = new Map<string, string>()

async function readCache(domain: string): Promise<string | null> {
  if (memo.has(domain)) return memo.get(domain) || null
  try {
    const row = await db.iconCache.get(domain)
    if (!row || Date.now() - row.updatedAt > CACHE_TTL) return null
    memo.set(domain, row.url)
    return row.url || null
  } catch {
    return null
  }
}

async function writeCache(domain: string, url: string): Promise<void> {
  memo.set(domain, url)
  try {
    await db.iconCache.put({ domain, url, ok: url ? 1 : 0, updatedAt: Date.now() })
  } catch {
    /* 缓存写失败不影响显示 */
  }
}

export interface FaviconState {
  src: Ref<string>
  emoji: Ref<string>
  initials: Ref<string>
  gradient: Ref<string>
  failed: Ref<boolean>
  onError: () => void
  onLoad: () => void
}

export function useFavicon(bookmark: Ref<Bookmark>): FaviconState {
  const domain = computed(() => getDomain(bookmark.value.url))
  const src = ref('')
  const failed = ref(false)

  /** 当前这条书签的候选地址链，onError 时往后走一格 */
  let chain: string[] = []
  let cursor = 0

  const emoji = computed(() => (bookmark.value.iconMode === 'emoji' ? bookmark.value.icon : ''))
  const initials = computed(() =>
    initialsFrom(
      bookmark.value.title || domain.value,
      domain.value.slice(0, 2).toUpperCase() || '#',
    ),
  )
  const gradient = computed(() => gradientFrom(domain.value || bookmark.value.title))

  /** 后端还没探测完时先不要用代理，否则纯静态部署下第一屏图标会全军覆没 */
  const proxyUsable = () =>
    settings.iconSource === 'proxy' && syncStore.probed && syncStore.available

  function buildChain(): string[] {
    const b = bookmark.value
    if (b.iconMode === 'emoji' || b.iconMode === 'letter') return []
    if (b.iconMode === 'custom') return b.icon ? [b.icon] : []
    if (!domain.value) return []

    const list: string[] = []
    if (proxyUsable()) list.push(iconProxyUrl(domain.value))
    list.push(...directSources(domain.value))
    return list
  }

  async function resolve(): Promise<void> {
    failed.value = false
    cursor = 0
    chain = buildChain()

    if (!chain.length) {
      src.value = ''
      failed.value = bookmark.value.iconMode !== 'emoji'
      return
    }

    // auto 模式先看缓存，命中就直接用，省掉整条链的试错
    if (bookmark.value.iconMode === 'auto' && domain.value) {
      const cached = await readCache(domain.value)
      if (cached) {
        // 把缓存命中的地址提到队首，失败了仍可继续走后面的候选
        chain = [cached, ...chain.filter((u) => u !== cached)]
      }
    }
    src.value = chain[0]
  }

  function onError(): void {
    cursor++
    if (cursor < chain.length) {
      src.value = chain[cursor]
      return
    }
    failed.value = true
    if (bookmark.value.iconMode === 'auto' && domain.value) void writeCache(domain.value, '')
  }

  function onLoad(): void {
    failed.value = false
    if (bookmark.value.iconMode === 'auto' && domain.value && src.value) {
      void writeCache(domain.value, src.value)
    }
  }

  watch(
    () => [
      bookmark.value.url,
      bookmark.value.icon,
      bookmark.value.iconMode,
      settings.iconSource,
      // 后端探测完成后要重算一次，让代理模式真正生效
      syncStore.probed,
      syncStore.available,
    ],
    () => void resolve(),
    { immediate: true },
  )

  return { src, emoji, initials, gradient, failed, onError, onLoad }
}

/** 清空图标缓存，设置里有个「图标不正常？点这里重试」的入口 */
export async function clearIconCache(): Promise<void> {
  memo.clear()
  await db.iconCache.clear()
}
