import bundled from '../links.json'

import { normalizeConfig, ValidationError } from './validate.js'

// Previews share the namespace with production but use their own key prefix,
// so edits on a preview never touch the live page.
const key = (env, k) => `${env.KV_PREFIX || ''}${k}`

export const hasStore = (env) => Boolean(env.LINKS_KV)

export const MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp']
export const MAX_MEDIA_BYTES = 5 * 1024 * 1024

// Returns { config, version }. Falls back to links.json until the first save.
export const getConfig = async (env) => {
  if (hasStore(env)) {
    const stored = await env.LINKS_KV.get(key(env, 'config'), 'json')
    if (stored?.config) return { config: stored.config, version: stored.version }
  }
  return { config: normalizeConfig(bundled), version: 0 }
}

export class ConflictError extends Error {}

export const putConfig = async (env, config, expectedVersion) => {
  const current = await getConfig(env)
  if (current.version !== expectedVersion) {
    throw new ConflictError('The page changed since you opened it')
  }
  const clean = normalizeConfig(config)
  const version = current.version + 1
  await env.LINKS_KV.put(key(env, 'config'), JSON.stringify({ config: clean, version }))

  // Drop uploaded images that are no longer used.
  const used = new Set(clean.posts.map((p) => p.image))
  await Promise.all(
    current.config.posts
      .map((p) => p.image)
      .filter((img) => img.startsWith('/links/media/') && !used.has(img))
      .map((img) => env.LINKS_KV.delete(key(env, `media:${img.slice('/links/media/'.length)}`)))
  )
  return { config: clean, version }
}

// Sniff the first bytes so a renamed file can't pass as an image.
const sniff = (bytes) => {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png'
  if (
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return 'image/webp'
  }
  return null
}

export const putMedia = async (env, id, buffer) => {
  if (buffer.byteLength === 0 || buffer.byteLength > MAX_MEDIA_BYTES) {
    throw new ValidationError('Image must be under 5 MB')
  }
  const contentType = sniff(new Uint8Array(buffer, 0, Math.min(12, buffer.byteLength)))
  if (!contentType) throw new ValidationError('Only JPEG, PNG or WebP images')
  await env.LINKS_KV.put(key(env, `media:${id}`), buffer, { metadata: { contentType } })
  return `/links/media/${id}`
}

export const getMedia = async (env, id) => {
  if (!hasStore(env) || !/^[a-z0-9-]{1,80}$/.test(id)) return null
  const { value, metadata } = await env.LINKS_KV.getWithMetadata(
    key(env, `media:${id}`),
    'arrayBuffer'
  )
  if (!value || !MEDIA_TYPES.includes(metadata?.contentType)) return null
  return { body: value, contentType: metadata.contentType }
}

export const kvGet = (env, k, type = 'json') => env.LINKS_KV.get(key(env, k), type)
export const kvPut = (env, k, v, opts) =>
  env.LINKS_KV.put(key(env, k), typeof v === 'string' ? v : JSON.stringify(v), opts)
export const kvDelete = (env, k) => env.LINKS_KV.delete(key(env, k))
