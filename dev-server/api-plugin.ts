/**
 * 本地开发用的 API 模拟层。
 *
 * 生产环境这些接口由 Cloudflare Pages Functions + D1 提供；
 * 本地 `npm run dev` 时没有 Workers 运行时，就用这个 Vite 插件实现同一套契约，
 * 数据落在 .dev-data/db.json（已加入 .gitignore）。
 *
 * 好处：本地开发能完整体验「多标签页同步 / 自动抓标题 / 图标代理」，
 * 不用每次都去跑 wrangler。想验真 Workers 行为就用 `npm run cf:dev`。
 */

import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import type { Connect, Plugin, ViteDevServer } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { bearerFrom, issueToken, timingSafeEqual, verifyToken } from '../shared/auth.ts'
import { fetchSiteMeta } from '../shared/meta.ts'
import {
  type Bookmark,
  type Category,
  type SyncPayload,
  sanitizeBookmark,
  sanitizeCategory,
  shouldOverwrite,
} from '../shared/model.ts'

interface DevStore {
  categories: Record<string, Category>
  bookmarks: Record<string, Bookmark>
}

const DATA_FILE = resolve(process.cwd(), '.dev-data/db.json')

function loadStore(): DevStore {
  try {
    const raw = JSON.parse(readFileSync(DATA_FILE, 'utf8')) as Partial<DevStore>
    return { categories: raw.categories ?? {}, bookmarks: raw.bookmarks ?? {} }
  } catch {
    return { categories: {}, bookmarks: {} }
  }
}

/** 先写临时文件再 rename，避免进程被中断时留下半个损坏的 JSON */
function saveStore(store: DevStore): void {
  mkdirSync(dirname(DATA_FILE), { recursive: true })
  const tmp = `${DATA_FILE}.tmp`
  writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf8')
  renameSync(tmp, DATA_FILE)
}

function readBody(req: IncomingMessage, limitBytes = 8 * 1024 * 1024): Promise<string> {
  return new Promise((resolvePromise, rejectPromise) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > limitBytes) {
        rejectPromise(new Error('PAYLOAD_TOO_LARGE'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolvePromise(Buffer.concat(chunks).toString('utf8')))
    req.on('error', rejectPromise)
  })
}

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  const body = JSON.stringify(data)
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(body)
}

/** 把 Node 的 headers 包成 shared/auth 需要的 { headers.get() } 形状 */
function asRequestLike(req: IncomingMessage) {
  return {
    headers: {
      get(name: string): string | null {
        const v = req.headers[name.toLowerCase()]
        return Array.isArray(v) ? (v[0] ?? null) : (v ?? null)
      },
    },
  }
}

const ICON_SOURCES = (domain: string): string[] => [
  `https://${domain}/favicon.ico`,
  `https://api.iowen.cn/favicon/${domain}.png`,
  `https://favicon.im/${domain}?larger=true`,
  `https://icon.horse/icon/${domain}`,
  `https://www.google.com/s2/favicons?domain=${domain}&sz=128`,
]

const BLANK_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)

export function devApiPlugin(): Plugin {
  // 本地开发默认密码 admin，可用 APP_PASSWORD 环境变量覆盖
  const password = process.env.APP_PASSWORD?.trim() || 'admin'
  const secret =
    process.env.AUTH_SECRET?.trim() || createHash('sha256').update(password).digest('hex')
  const publicRead = (process.env.PUBLIC_READ ?? '1').trim() !== '0'

  let store = loadStore()

  const isAuthed = (req: IncomingMessage) => verifyToken(secret, bearerFrom(asRequestLike(req)))

  const pullSince = (since: number): SyncPayload => ({
    categories: Object.values(store.categories).filter((c) => c.updatedAt > since),
    bookmarks: Object.values(store.bookmarks).filter((b) => b.updatedAt > since),
  })

  const handler: Connect.NextHandleFunction = (req, res, next) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const path = url.pathname
    if (!path.startsWith('/api/')) return next()

    void (async () => {
      try {
        // ---- 鉴权状态 ----
        if (path === '/api/auth/status' && req.method === 'GET') {
          return sendJson(res, 200, {
            backend: 'local-dev',
            configured: true,
            hasDatabase: true,
            hasPassword: true,
            publicRead,
            authenticated: await isAuthed(req),
          })
        }

        // ---- 登录 ----
        if (path === '/api/auth/login' && req.method === 'POST') {
          const body = JSON.parse((await readBody(req)) || '{}') as { password?: string }
          if (!timingSafeEqual(String(body.password ?? ''), password)) {
            await new Promise((r) => setTimeout(r, 300))
            return sendJson(res, 401, { error: 'WRONG_PASSWORD', message: '密码不正确' })
          }
          return sendJson(res, 200, await issueToken(secret))
        }

        // ---- 拉取 ----
        if (path === '/api/sync' && req.method === 'GET') {
          if (!publicRead && !(await isAuthed(req))) {
            return sendJson(res, 401, { error: 'UNAUTHORIZED' })
          }
          const since = Number(url.searchParams.get('since') ?? 0) || 0
          return sendJson(res, 200, { ...pullSince(since), now: Date.now() })
        }

        // ---- 推送 + 拉取 ----
        if (path === '/api/sync' && req.method === 'POST') {
          if (!(await isAuthed(req))) {
            return sendJson(res, 401, { error: 'UNAUTHORIZED', message: '请先在设置里输入访问密码' })
          }
          const body = JSON.parse((await readBody(req)) || '{}') as Record<string, unknown>
          const since = Number(body.since ?? 0) || 0

          let applied = 0
          for (const raw of Array.isArray(body.categories) ? body.categories : []) {
            const c = sanitizeCategory(raw)
            if (c && shouldOverwrite(c, store.categories[c.id])) {
              store.categories[c.id] = c
              applied++
            }
          }
          for (const raw of Array.isArray(body.bookmarks) ? body.bookmarks : []) {
            const b = sanitizeBookmark(raw)
            if (!b) continue
            const prev: Bookmark | undefined = store.bookmarks[b.id]
            if (shouldOverwrite(b, prev)) {
              // 访问次数取两边最大值，避免多设备互相把计数改小
              store.bookmarks[b.id] = prev
                ? {
                    ...b,
                    visits: Math.max(b.visits, prev.visits),
                    lastVisitAt: Math.max(b.lastVisitAt, prev.lastVisitAt),
                  }
                : b
              applied++
            }
          }
          if (applied) saveStore(store)
          return sendJson(res, 200, { ...pullSince(since), now: Date.now(), applied })
        }

        // ---- 抓取网页元信息 ----
        if (path === '/api/meta' && req.method === 'GET') {
          const raw = url.searchParams.get('url')?.trim()
          if (!raw) return sendJson(res, 400, { error: 'MISSING_URL' })
          try {
            const target = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
            return sendJson(res, 200, await fetchSiteMeta(target))
          } catch (err) {
            return sendJson(res, 502, {
              error: 'FETCH_FAILED',
              message: err instanceof Error ? err.message : '抓取失败',
            })
          }
        }

        // ---- 图标代理 ----
        if (path === '/api/icon' && req.method === 'GET') {
          const domain = url.searchParams.get('domain')?.trim().toLowerCase() ?? ''
          if (!domain) return sendJson(res, 400, { error: 'INVALID_DOMAIN' })
          for (const src of ICON_SOURCES(domain)) {
            try {
              const r = await fetch(src, {
                redirect: 'follow',
                signal: AbortSignal.timeout(5000),
                headers: { 'user-agent': 'Mozilla/5.0', accept: 'image/*,*/*;q=0.8' },
              })
              const type = r.headers.get('content-type') ?? ''
              if (!r.ok || !/^image\//i.test(type)) continue
              const buf = Buffer.from(await r.arrayBuffer())
              if (buf.byteLength < 70 || buf.byteLength > 512 * 1024) continue
              res.statusCode = 200
              res.setHeader('content-type', type)
              res.setHeader('cache-control', 'public, max-age=86400')
              res.setHeader('x-icon-source', new URL(src).hostname)
              return res.end(buf)
            } catch {
              /* 换下一个源 */
            }
          }
          res.statusCode = 200
          res.setHeader('content-type', 'image/png')
          res.setHeader('x-icon-source', 'none')
          return res.end(BLANK_PNG)
        }

        return sendJson(res, 404, { error: 'NOT_FOUND', message: `未知接口 ${path}` })
      } catch (err) {
        return sendJson(res, 500, {
          error: 'INTERNAL',
          message: err instanceof Error ? err.message : String(err),
        })
      }
    })()
  }

  return {
    name: 'bookmark-dev-api',
    configureServer(server: ViteDevServer) {
      store = loadStore()
      server.middlewares.use(handler)
      server.config.logger.info(
        `\n  \x1b[35m➜\x1b[0m  \x1b[1m本地同步 API\x1b[0m 已启用  密码: \x1b[36m${password}\x1b[0m  数据: \x1b[2m.dev-data/db.json\x1b[0m\n`,
      )
    },
    configurePreviewServer(server) {
      store = loadStore()
      server.middlewares.use(handler)
    },
  }
}
