// Admin auth: Cloudflare Access sits in front of /links/admin and signs a JWT.
// We verify that JWT here too, so the admin stays locked even if the Access
// app is missing or misconfigured. No Access config means no admin.

const ALLOWED_EMAIL_DOMAIN = '@audius.co'
const CERTS_TTL_MS = 60 * 60 * 1000

let certsCache = { at: 0, team: '', keys: [] }

const b64urlDecode = (s) => {
  const pad = '='.repeat((4 - (s.length % 4)) % 4)
  const bin = atob((s + pad).replaceAll('-', '+').replaceAll('_', '/'))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

const getKeys = async (team) => {
  if (certsCache.team === team && Date.now() - certsCache.at < CERTS_TTL_MS) {
    return certsCache.keys
  }
  const res = await fetch(`https://${team}/cdn-cgi/access/certs`)
  if (!res.ok) throw new Error('Could not load Access certs')
  const { keys } = await res.json()
  certsCache = { at: Date.now(), team, keys }
  return keys
}

const verifyAccessJwt = async (token, env) => {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [h, p, s] = parts
  const header = JSON.parse(new TextDecoder().decode(b64urlDecode(h)))
  if (header.alg !== 'RS256') return null

  const jwk = (await getKeys(env.ACCESS_TEAM_DOMAIN)).find((k) => k.kid === header.kid)
  if (!jwk) return null
  const key = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  )
  const ok = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    b64urlDecode(s),
    new TextEncoder().encode(`${h}.${p}`)
  )
  if (!ok) return null

  const claims = JSON.parse(new TextDecoder().decode(b64urlDecode(p)))
  const now = Math.floor(Date.now() / 1000)
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud]
  if (!aud.includes(env.ACCESS_AUD)) return null
  if (claims.iss !== `https://${env.ACCESS_TEAM_DOMAIN}`) return null
  if (typeof claims.exp !== 'number' || claims.exp < now) return null
  if (typeof claims.nbf === 'number' && claims.nbf > now + 60) return null
  return claims
}

const isLocalhost = (url) => ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)

// Returns the signed-in admin's email, or null.
export const getAdmin = async (request, env) => {
  const url = new URL(request.url)

  // Local `wrangler dev` only: DEV_ADMIN_EMAIL lives in the gitignored .dev.vars.
  if (env.DEV_ADMIN_EMAIL && isLocalhost(url)) return env.DEV_ADMIN_EMAIL

  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) return null
  const token = request.headers.get('cf-access-jwt-assertion')
  if (!token) return null
  try {
    const claims = await verifyAccessJwt(token, env)
    const email = typeof claims?.email === 'string' ? claims.email.toLowerCase() : ''
    return email.endsWith(ALLOWED_EMAIL_DOMAIN) ? email : null
  } catch {
    return null
  }
}

// Writes must come from our own admin page: a custom header forces a CORS
// preflight (which we never answer), and the Origin must match.
export const isSameOriginWrite = (request) => {
  if (request.headers.get('x-links-admin') !== '1') return false
  const origin = request.headers.get('origin')
  return !origin || origin === new URL(request.url).origin
}
