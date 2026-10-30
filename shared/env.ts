/** Cloudflare Pages 环境变量/绑定。放在 shared/ 而不是 functions/ 里，避免被当成路由文件。 */

import type { D1Database } from '@cloudflare/workers-types'

export interface Env {
  /** D1 数据库绑定，在 wrangler.toml 或 Cloudflare 后台配置 */
  DB?: D1Database
  /** 访问密码。没设置则后端处于「未配置」状态，同步功能关闭 */
  APP_PASSWORD?: string
  /** 可选：用来签 token 的密钥。不填就用 APP_PASSWORD 派生 */
  AUTH_SECRET?: string
  /** "0" = 不登录连读都不给；默认 "1" = 游客可浏览，但改不了 */
  PUBLIC_READ?: string
  /** 允许跨域的来源，逗号分隔；填 "*" 全放开。同域部署留空即可 */
  CORS_ORIGINS?: string
}

export function authSecret(env: Env): string {
  return env.AUTH_SECRET?.trim() || env.APP_PASSWORD?.trim() || ''
}

export function isConfigured(env: Env): boolean {
  return !!env.APP_PASSWORD?.trim() && !!env.DB
}

export function publicRead(env: Env): boolean {
  return (env.PUBLIC_READ ?? '1').trim() !== '0'
}
