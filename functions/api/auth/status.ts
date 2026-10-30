/**
 * GET /api/auth/status
 * 前端启动时探一下：后端在不在、要不要密码、当前 token 还有效吗。
 * 静态托管（比如 Render 纯静态）上这个请求会 404，前端据此自动退回「纯本地模式」。
 */

import { bearerFrom, verifyToken } from '../../../shared/auth'
import { authSecret, type Env, isConfigured, publicRead } from '../../../shared/env'
import { json } from '../../../shared/http'

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const secret = authSecret(env)
  const token = bearerFrom(request)
  return json({
    backend: 'cloudflare-d1',
    configured: isConfigured(env),
    hasDatabase: !!env.DB,
    hasPassword: !!env.APP_PASSWORD?.trim(),
    publicRead: publicRead(env),
    authenticated: secret ? await verifyToken(secret, token) : false,
  })
}
