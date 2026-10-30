/** POST /api/auth/login  { password } -> { token, expiresAt } */

import { issueToken, timingSafeEqual } from '../../../shared/auth'
import { authSecret, type Env } from '../../../shared/env'
import { fail, json } from '../../../shared/http'

/** 密码错误时统一延迟一点，削弱暴力破解的速度 */
const WRONG_PASSWORD_DELAY_MS = 400

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const expected = env.APP_PASSWORD?.trim()
  if (!expected) return fail(503, 'NOT_CONFIGURED', '服务端未设置 APP_PASSWORD 环境变量')

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return fail(400, 'BAD_JSON')
  }
  const password = String((body as Record<string, unknown>)?.password ?? '')

  if (!timingSafeEqual(password, expected)) {
    await new Promise((r) => setTimeout(r, WRONG_PASSWORD_DELAY_MS))
    return fail(401, 'WRONG_PASSWORD', '密码不正确')
  }

  const { token, expiresAt } = await issueToken(authSecret(env))
  return json({ token, expiresAt })
}
