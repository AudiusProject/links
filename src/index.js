import { renderAdmin } from './admin-page.js'
import { getAdmin, isSameOriginWrite } from './auth.js'
import * as instagram from './instagram.js'
import { renderPage } from './render.js'
import { ConflictError, getConfig, getMedia, hasStore, putConfig, putMedia } from './store.js'
import { ValidationError } from './validate.js'

const PUBLIC_CSP = [
  "default-src 'none'",
  "img-src 'self'",
  "style-src 'unsafe-inline' https://fonts.googleapis.com",
  'font-src https://fonts.gstatic.com',
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'"
].join('; ')

const adminCsp = (nonce) =>
  [
    "default-src 'none'",
    `script-src 'nonce-${nonce}'`,
    "style-src 'unsafe-inline'",
    "img-src 'self' blob:",
    "connect-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'"
  ].join('; ')

const securityHeaders = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin'
}

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...securityHeaders }
  })

const redirect = (location) =>
  new Response(null, { status: 302, headers: { location, 'cache-control': 'no-store' } })

const handleAdmin = async (request, env, url) => {
  const email = await getAdmin(request, env)
  if (!email) {
    return new Response('Not authorized', {
      status: 401,
      headers: { 'content-type': 'text/plain', 'cache-control': 'no-store', ...securityHeaders }
    })
  }
  const path = url.pathname.replace(/\/+$/, '')
  const method = request.method

  if (path === '/links/admin' && method === 'GET') {
    const nonce = crypto.randomUUID().replaceAll('-', '')
    return new Response(renderAdmin(nonce), {
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'content-security-policy': adminCsp(nonce),
        ...securityHeaders
      }
    })
  }

  // Instagram OAuth (browser navigations, so no custom header here; the state
  // param ties the callback to the admin who started it).
  if (path === '/links/admin/instagram/connect' && method === 'GET') {
    if (!hasStore(env) || !instagram.isConfigured(env)) return redirect('/links/admin?ig=error&msg=Not+set+up')
    return redirect(await instagram.startConnect(env, url.origin, email))
  }
  if (path === '/links/admin/instagram/callback' && method === 'GET') {
    try {
      await instagram.finishConnect(env, url.origin, url.searchParams, email)
      await instagram.sync(env).catch(() => {})
      return redirect('/links/admin?ig=connected')
    } catch (e) {
      return redirect(`/links/admin?ig=error&msg=${encodeURIComponent(String(e.message).slice(0, 200))}`)
    }
  }

  if (!path.startsWith('/links/admin/api/')) return json({ error: 'Not found' }, 404)
  if (method !== 'GET' && !isSameOriginWrite(request)) return json({ error: 'Forbidden' }, 403)
  const writable = hasStore(env)

  try {
    if (path === '/links/admin/api/config' && method === 'GET') {
      const { config, version } = await getConfig(env)
      const ig = writable ? await instagram.getStatus(env) : { configured: false }
      return json({ config, version, writable, email, instagram: ig })
    }
    if (!writable) return json({ error: "Storage isn't connected here" }, 503)

    if (path === '/links/admin/api/config' && method === 'PUT') {
      const body = await request.json()
      const saved = await putConfig(env, body.config, body.version)
      return json(saved)
    }
    if (path === '/links/admin/api/media' && method === 'POST') {
      const length = Number(request.headers.get('content-length') || 0)
      if (length > 5 * 1024 * 1024) return json({ error: 'Image must be under 5 MB' }, 413)
      const id = `u-${crypto.randomUUID()}`
      const imageUrl = await putMedia(env, id, await request.arrayBuffer())
      return json({ id, url: imageUrl })
    }
    if (path === '/links/admin/api/instagram/sync' && method === 'POST') {
      return json({ added: await instagram.sync(env) })
    }
    if (path === '/links/admin/api/instagram/disconnect' && method === 'POST') {
      await instagram.disconnect(env)
      return json({ ok: true })
    }
    return json({ error: 'Not found' }, 404)
  } catch (e) {
    if (e instanceof ConflictError) return json({ error: `${e.message}. Reload to get the latest.` }, 409)
    if (e instanceof ValidationError) return json({ error: e.message }, 400)
    if (e instanceof SyntaxError) return json({ error: 'Bad request' }, 400)
    console.error('admin error', e?.message)
    return json({ error: e?.message || 'Something went wrong' }, 500)
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const path = url.pathname

    if (path === '/links/admin' || path.startsWith('/links/admin/')) {
      return handleAdmin(request, env, url)
    }

    if (path === '/links' || path === '/links/') {
      const { config } = await getConfig(env)
      return new Response(renderPage(config), {
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'public, max-age=60',
          'content-security-policy': PUBLIC_CSP,
          ...securityHeaders
        }
      })
    }

    if (path.startsWith('/links/media/')) {
      const media = await getMedia(env, path.slice('/links/media/'.length))
      if (!media) return new Response('Not found', { status: 404 })
      return new Response(media.body, {
        headers: {
          'content-type': media.contentType,
          'cache-control': 'public, max-age=31536000, immutable',
          'content-security-policy': "default-src 'none'",
          ...securityHeaders
        }
      })
    }

    if (path.startsWith('/links/')) return env.ASSETS.fetch(request)
    return redirect(new URL('/links', url).toString())
  },

  // Pulls new Instagram posts. Production only: previews have their own prefix.
  async scheduled(_event, env, ctx) {
    if (!hasStore(env) || env.KV_PREFIX || !instagram.isConfigured(env)) return
    ctx.waitUntil(instagram.sync(env).catch((e) => console.error('instagram sync failed', e?.message)))
  }
}
