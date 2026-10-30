/**
 * 极简单用户鉴权：不做账号体系，只有一个「访问密码」。
 *
 * 流程：
 *   1. 前端 POST /api/auth/login { password }
 *   2. 服务端用环境变量里的密码比对（恒定时间比较，防时序攻击）
 *   3. 通过则签发一个 HMAC-SHA256 签名的 token： v1.<过期时间戳>.<签名>
 *   4. 之后所有写操作带 Authorization: Bearer <token>
 *
 * token 只是签名字符串，服务端不存 session，天然适配 Serverless。
 */

const TOKEN_VERSION = 'v1'
/** token 有效期 30 天 */
export const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000

const enc = new TextEncoder()

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  return toHex(await crypto.subtle.sign('HMAC', key, enc.encode(message)))
}

/** 恒定时间字符串比较 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // 长度不同也走一遍循环，避免因为提前返回而泄漏长度信息
    let dummy = 0
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      dummy |= (a.charCodeAt(i % (a.length || 1)) ^ b.charCodeAt(i % (b.length || 1))) | 0
    }
    return dummy === -1 // 永远 false
  }
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export async function issueToken(secret: string, now = Date.now()): Promise<{
  token: string
  expiresAt: number
}> {
  const expiresAt = now + TOKEN_TTL_MS
  const payload = `${TOKEN_VERSION}.${expiresAt}`
  const sig = await hmac(secret, payload)
  return { token: `${payload}.${sig}`, expiresAt }
}

export async function verifyToken(
  secret: string,
  token: string | null | undefined,
  now = Date.now(),
): Promise<boolean> {
  if (!token) return false
  const parts = token.split('.')
  if (parts.length !== 3) return false
  const [version, expRaw, sig] = parts
  if (version !== TOKEN_VERSION) return false
  const exp = Number(expRaw)
  if (!Number.isFinite(exp) || exp < now) return false
  const expected = await hmac(secret, `${version}.${exp}`)
  return timingSafeEqual(sig, expected)
}

export function bearerFrom(request: { headers: { get(name: string): string | null } }): string | null {
  const raw = request.headers.get('authorization') ?? request.headers.get('Authorization')
  if (!raw) return null
  const m = /^Bearer\s+(.+)$/i.exec(raw.trim())
  return m ? m[1] : null
}
