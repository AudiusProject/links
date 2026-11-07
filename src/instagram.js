// Instagram API with Instagram Login, reading our own account only.
// The token is stored in KV and never sent to the browser.

import { getConfig, kvDelete, kvGet, kvPut, putConfig, putMedia, ConflictError } from './store.js'

const GRAPH = 'https://graph.instagram.com/v23.0'
const REFRESH_AFTER_MS = 7 * 24 * 60 * 60 * 1000
const MAX_NEW_PER_SYNC = 25
const CDN_HOSTS = ['cdninstagram.com', 'fbcdn.net']

export const isConfigured = (env) => Boolean(env.IG_APP_ID && env.IG_APP_SECRET)

const redirectUri = (origin) => `${origin}/links/admin/instagram/callback`

const readJson = async (res, what) => {
  const body = await res.json().catch(() => ({}))
  if (!res.ok || body.error) {
    // Only surface Meta's message, never the request URL (it carries the token).
    const msg = body.error?.message || body.error_message || `HTTP ${res.status}`
    throw new Error(`${what}: ${msg}`)
  }
  return body
}

export const getStatus = async (env) => {
  const token = await kvGet(env, 'ig:token')
  const status = (await kvGet(env, 'ig:status')) || {}
  return {
    configured: isConfigured(env),
    connected: Boolean(token),
    username: token?.username || null,
    connectedBy: token?.connectedBy || null,
    lastSync: status.lastSync || null,
    lastAdded: status.lastAdded ?? null,
    lastError: status.lastError || null
  }
}

export const startConnect = async (env, origin, email) => {
  const state = crypto.randomUUID()
  await kvPut(env, `ig:state:${state}`, { email }, { expirationTtl: 600 })
  const url = new URL('https://www.instagram.com/oauth/authorize')
  url.searchParams.set('enable_fb_login', '0')
  url.searchParams.set('client_id', env.IG_APP_ID)
  url.searchParams.set('redirect_uri', redirectUri(origin))
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', 'instagram_business_basic')
  url.searchParams.set('state', state)
  return url.toString()
}

export const finishConnect = async (env, origin, params, email) => {
  const state = params.get('state') || ''
  const saved = /^[0-9a-f-]{36}$/.test(state) ? await kvGet(env, `ig:state:${state}`) : null
  if (!saved || saved.email !== email) throw new Error('Login expired, try connecting again')
  await kvDelete(env, `ig:state:${state}`)
  if (params.get('error')) throw new Error(params.get('error_description') || 'Instagram login was cancelled')

  const code = (params.get('code') || '').replace(/#_$/, '')
  if (!code) throw new Error('Instagram did not return a code')

  const short = await readJson(
    await fetch('https://api.instagram.com/oauth/access_token', {
      method: 'POST',
      body: new URLSearchParams({
        client_id: env.IG_APP_ID,
        client_secret: env.IG_APP_SECRET,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri(origin),
        code
      })
    }),
    'Code exchange'
  )

  const long = await readJson(
    await fetch(
      `https://graph.instagram.com/access_token?${new URLSearchParams({
        grant_type: 'ig_exchange_token',
        client_secret: env.IG_APP_SECRET,
        access_token: short.access_token
      })}`
    ),
    'Token exchange'
  )

  const me = await readJson(
    await fetch(`${GRAPH}/me?${new URLSearchParams({ fields: 'user_id,username', access_token: long.access_token })}`),
    'Profile lookup'
  )

  await kvPut(env, 'ig:token', {
    token: long.access_token,
    expiresAt: Date.now() + (long.expires_in || 0) * 1000,
    refreshedAt: Date.now(),
    userId: String(me.user_id || ''),
    username: me.username || '',
    connectedBy: email
  })
}

export const disconnect = (env) => kvDelete(env, 'ig:token')

const refreshIfDue = async (env, saved) => {
  if (Date.now() - saved.refreshedAt < REFRESH_AFTER_MS) return saved
  const res = await readJson(
    await fetch(
      `https://graph.instagram.com/refresh_access_token?${new URLSearchParams({
        grant_type: 'ig_refresh_token',
        access_token: saved.token
      })}`
    ),
    'Token refresh'
  )
  const next = {
    ...saved,
    token: res.access_token,
    expiresAt: Date.now() + (res.expires_in || 0) * 1000,
    refreshedAt: Date.now()
  }
  await kvPut(env, 'ig:token', next)
  return next
}

const isInstagramCdn = (raw) => {
  try {
    const url = new URL(raw)
    return url.protocol === 'https:' && CDN_HOSTS.some((h) => url.hostname === h || url.hostname.endsWith(`.${h}`))
  } catch {
    return false
  }
}

const firstLine = (caption = '') => caption.split('\n')[0].slice(0, 300)

// Adds tiles for new Instagram posts. Returns the number added.
export const sync = async (env) => {
  let saved = await kvGet(env, 'ig:token')
  if (!saved) return 0
  try {
    saved = await refreshIfDue(env, saved)
    const media = await readJson(
      await fetch(
        `${GRAPH}/me/media?${new URLSearchParams({
          fields: 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp',
          limit: String(MAX_NEW_PER_SYNC),
          access_token: saved.token
        })}`
      ),
      'Fetching posts'
    )

    const { config } = await getConfig(env)
    const known = new Set(config.posts.map((p) => p.igId).filter(Boolean))
    const fresh = (media.data || []).filter((m) => m.id && /^[0-9]+$/.test(m.id) && !known.has(m.id))

    const added = []
    for (const m of fresh) {
      const src = m.media_type === 'VIDEO' ? m.thumbnail_url : m.media_url
      if (!isInstagramCdn(src)) continue
      const img = await fetch(src)
      if (!img.ok) continue
      const id = `ig-${m.id}`
      const image = await putMedia(env, id, await img.arrayBuffer()).catch(() => null)
      if (!image) continue
      added.push({
        id,
        image,
        url: '',
        alt: firstLine(m.caption),
        igId: m.id,
        permalink: m.permalink,
        timestamp: Math.floor(Date.parse(m.timestamp) / 1000) || undefined
      })
    }

    if (added.length) {
      // Re-read right before writing so an admin save in between isn't lost.
      for (let attempt = 0; attempt < 3; attempt++) {
        const latest = await getConfig(env)
        const have = new Set(latest.config.posts.map((p) => p.igId).filter(Boolean))
        const toAdd = added.filter((p) => !have.has(p.igId))
        if (!toAdd.length) break
        try {
          await putConfig(env, { ...latest.config, posts: [...toAdd, ...latest.config.posts] }, latest.version)
          break
        } catch (e) {
          if (!(e instanceof ConflictError) || attempt === 2) throw e
        }
      }
    }

    await kvPut(env, 'ig:status', { lastSync: Date.now(), lastAdded: added.length, lastError: null })
    return added.length
  } catch (e) {
    await kvPut(env, 'ig:status', { lastSync: Date.now(), lastAdded: 0, lastError: String(e.message).slice(0, 300) })
    throw e
  }
}
