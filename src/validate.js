export const PLATFORMS = ['twitter', 'instagram', 'threads', 'tiktok', 'youtube', 'discord']

const MAX_LINKS = 100
const MAX_POSTS = 200

export class ValidationError extends Error {}

const fail = (msg) => {
  throw new ValidationError(msg)
}

const str = (v, max, field) => {
  if (v === undefined || v === null) return ''
  if (typeof v !== 'string') fail(`${field} must be text`)
  const s = v.trim()
  if (s.length > max) fail(`${field} is longer than ${max} characters`)
  return s
}

// Only plain http(s) links. Blocks javascript:, data: and the like.
export const httpUrl = (v, field, { optional = false } = {}) => {
  const s = str(v, 2000, field)
  if (!s) {
    if (optional) return ''
    fail(`${field} needs a link`)
  }
  let url
  try {
    url = new URL(s)
  } catch {
    fail(`${field} is not a valid link`)
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    fail(`${field} must start with https://`)
  }
  if (url.username || url.password) fail(`${field} cannot contain a login`)
  return url.toString()
}

const bool = (v) => v === true

const ID_RE = /^[a-z0-9-]{1,80}$/
const IMAGE_RE = /^\/links\/(posts\/[0-9a-z-]{1,80}\.jpg|media\/[a-z0-9-]{1,80})$/
const IG_ID_RE = /^[0-9]{1,30}$/

const link = (l, field) => ({
  title: str(l?.title, 120, `${field} title`) || fail(`${field} needs a title`),
  url: httpUrl(l?.url, field),
  ...(bool(l?.hidden) && { hidden: true })
})

const post = (p, i) => {
  const field = `Tile ${i + 1}`
  const id = str(p?.id, 80, `${field} id`)
  if (!ID_RE.test(id)) fail(`${field} has an invalid id`)
  const image = str(p?.image, 200, `${field} image`)
  if (!IMAGE_RE.test(image)) fail(`${field} has an invalid image`)
  const out = {
    id,
    image,
    url: httpUrl(p?.url, field, { optional: true }),
    alt: str(p?.alt, 300, `${field} description`)
  }
  if (p?.igId !== undefined) {
    const igId = String(p.igId)
    if (!IG_ID_RE.test(igId)) fail(`${field} has an invalid Instagram id`)
    out.igId = igId
  }
  if (p?.permalink) {
    const permalink = httpUrl(p.permalink, `${field} Instagram link`)
    if (new URL(permalink).hostname !== 'www.instagram.com') {
      fail(`${field} Instagram link must be on instagram.com`)
    }
    out.permalink = permalink
  }
  if (Number.isFinite(p?.timestamp)) out.timestamp = Math.floor(p.timestamp)
  if (bool(p?.hidden)) out.hidden = true
  return out
}

// Returns a clean copy of the page config or throws ValidationError.
export const normalizeConfig = (input) => {
  if (!input || typeof input !== 'object') fail('Missing page content')

  const socials = Array.isArray(input.socials) ? input.socials : []
  const links = Array.isArray(input.links) ? input.links : []
  const posts = Array.isArray(input.posts) ? input.posts : []
  if (socials.length > PLATFORMS.length) fail('Too many social links')
  if (links.length > MAX_LINKS) fail(`At most ${MAX_LINKS} buttons`)
  if (posts.length > MAX_POSTS) fail(`At most ${MAX_POSTS} tiles`)

  const ids = new Set()
  const cleanPosts = posts.map((p, i) => {
    const out = post(p, i)
    if (ids.has(out.id)) fail(`Tile ${i + 1} is a duplicate`)
    ids.add(out.id)
    return out
  })

  return {
    title: str(input.title, 60, 'Title') || 'Audius',
    tagline: str(input.tagline, 200, 'Tagline'),
    socials: socials.map((s, i) => {
      const platform = str(s?.platform, 20, `Social ${i + 1}`)
      if (!PLATFORMS.includes(platform)) fail(`Social ${i + 1} has an unknown platform`)
      return { platform, url: httpUrl(s?.url, `Social ${i + 1}`) }
    }),
    links: links.map((item, i) => {
      if (item && 'group' in item) {
        const group = str(item.group, 80, `Group ${i + 1}`)
        if (!group) fail(`Group ${i + 1} needs a title`)
        const groupLinks = Array.isArray(item.links) ? item.links : []
        if (groupLinks.length > MAX_LINKS) fail(`Group ${group} has too many links`)
        return {
          group,
          links: groupLinks.map((l, j) => link(l, `${group} link ${j + 1}`)),
          ...(bool(item.hidden) && { hidden: true })
        }
      }
      return link(item, `Button ${i + 1}`)
    }),
    posts: cleanPosts
  }
}
