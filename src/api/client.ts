/**
 * 后端 API 客户端。
 *
 * 设计要点：后端是「可选」的。
 * 纯静态托管（例如 Render 静态站点）上 /api/* 会 404，
 * 这里会把它识别成「无后端」，应用自动退回纯本地模式，不弹错误。
 */

import type { PullResponse, SyncPayload } from '~shared/model'

export interface AuthStatus {
  backend: string
  configured: boolean
  hasDatabase: boolean
  hasPassword: boolean
  publicRead: boolean
  authenticated: boolean
}

export interface SiteMetaResponse {
  url: string
  title: string
  desc: string
  icon: string
  siteName: string
}

export class ApiError extends Error {
  code: string
  status: number
  constructor(status: number, code: string, message?: string) {
    super(message || code)
    this.name = 'ApiError'
    this.code = code
    this.status = status
  }
}

/** 后端不存在（纯静态部署）时抛这个，调用方据此静默降级 */
export const NO_BACKEND = 'NO_BACKEND'

let apiBase = '/api'
let token: string | null = null

export function configureApi(options: { base?: string; token?: string | null }): void {
  if (options.base !== undefined) apiBase = options.base.replace(/\/$/, '') || '/api'
  if (options.token !== undefined) token = options.token
}

export function getApiBase(): string {
  return apiBase
}

function headers(json = false): Record<string, string> {
  const h: Record<string, string> = {}
  if (json) h['content-type'] = 'application/json'
  if (token) h.authorization = `Bearer ${token}`
  return h
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${apiBase}${path}`, init)
  } catch (err) {
    throw new ApiError(0, NO_BACKEND, err instanceof Error ? err.message : '网络不可用')
  }

  // 静态托管会把未知路径交给 SPA fallback，于是返回 200 + HTML。
  // 这不是我们的 API，当作「没有后端」处理。
  const contentType = res.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) {
    throw new ApiError(res.status, NO_BACKEND, '该部署环境没有后端 API')
  }

  const body = (await res.json()) as T & { error?: string; message?: string }
  if (!res.ok) {
    throw new ApiError(res.status, body.error ?? `HTTP_${res.status}`, body.message)
  }
  return body
}

export function fetchStatus(): Promise<AuthStatus> {
  return request<AuthStatus>('/auth/status', { headers: headers() })
}

export function login(password: string): Promise<{ token: string; expiresAt: number }> {
  return request('/auth/login', {
    method: 'POST',
    headers: headers(true),
    body: JSON.stringify({ password }),
  })
}

export function pull(since: number): Promise<PullResponse> {
  return request<PullResponse>(`/sync?since=${since}`, { headers: headers() })
}

export function push(since: number, payload: SyncPayload): Promise<PullResponse & { applied: number }> {
  return request(`/sync`, {
    method: 'POST',
    headers: headers(true),
    body: JSON.stringify({ since, ...payload }),
  })
}

export function fetchSiteMeta(url: string): Promise<SiteMetaResponse> {
  return request<SiteMetaResponse>(`/meta?url=${encodeURIComponent(url)}`, { headers: headers() })
}

/** 同域图标代理地址；后端不可用时前端会自动改用直连图标源 */
export function iconProxyUrl(domain: string): string {
  return `${apiBase}/icon?domain=${encodeURIComponent(domain)}`
}
