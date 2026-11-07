import config from '../links.json'
import icons from './icons.js'

const UTM = {
  utm_campaign: 'linkinbio',
  utm_medium: 'referral',
  utm_source: 'audius-links'
}

const escape = (s = '') =>
  String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')

const withUtm = (raw) => {
  try {
    const url = new URL(raw)
    for (const [k, v] of Object.entries(UTM)) {
      if (!url.searchParams.has(k)) url.searchParams.set(k, v)
    }
    return url.toString()
  } catch {
    return raw
  }
}

const button = ({ title, url }) =>
  `<a class="btn" href="${escape(withUtm(url))}">${escape(title)}</a>`

const linkItem = (item) => {
  if (item.hidden) return ''
  if (item.group) {
    const links = item.links.filter((l) => !l.hidden)
    if (!links.length) return ''
    return `<section class="group"><h2>${escape(item.group)}</h2>${links
      .map(button)
      .join('')}</section>`
  }
  return button(item)
}

const social = ({ platform, url }) =>
  icons[platform]
    ? `<a class="social" href="${escape(url)}" aria-label="${escape(platform)}">${icons[platform]}</a>`
    : ''

const post = ({ image, url, alt }) =>
  `<a class="post" href="${escape(withUtm(url))}"><img src="${escape(image)}" alt="${escape(alt)}" loading="lazy" decoding="async"></a>`

const render = () => {
  const posts = (config.posts || []).filter((p) => !p.hidden)
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(config.title)} | Links</title>
<meta name="description" content="Links from Audius">
<meta property="og:title" content="${escape(config.title)}">
<meta property="og:url" content="https://audius.co/links">
<meta property="og:image" content="https://audius.co/ogImage.jpg">
<meta name="theme-color" content="#0f0f10">
<link rel="icon" type="image/png" href="/links/favicon-32x32.png">
<link rel="apple-touch-icon" href="/links/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Urbanist:wght@500;600;700&display=swap" rel="stylesheet">
<style>
:root{--bg:#0f0f10;--surface:#1a1a1d;--border:#2c2c31;--text:#f6f6f8;--muted:#9a9aa3;--accent:#7f6ad6}
*{box-sizing:border-box}
html{background:var(--bg)}
body{margin:0;min-height:100vh;color:var(--text);font-family:Urbanist,system-ui,-apple-system,sans-serif;background:radial-gradient(120% 60% at 50% 0%,#211a3a 0%,var(--bg) 60%) no-repeat,var(--bg);-webkit-font-smoothing:antialiased}
main{max-width:480px;margin:0 auto;padding:40px 16px 48px}
header{display:flex;flex-direction:column;align-items:center;gap:16px;margin-bottom:28px}
.logo{display:block;width:150px;height:auto}
.tagline{margin:0;color:var(--muted);font-size:15px;text-align:center}
.socials{display:flex;gap:8px}
.social{display:grid;place-items:center;width:40px;height:40px;border-radius:50%;color:var(--text);background:var(--surface);border:1px solid var(--border);transition:border-color .15s,color .15s}
.social svg{width:18px;height:18px}
.social:hover,.social:focus-visible{border-color:var(--accent);color:#fff}
.links{display:flex;flex-direction:column;gap:10px}
.btn{display:flex;align-items:center;justify-content:center;min-height:54px;padding:14px 20px;border-radius:12px;background:var(--surface);border:1px solid var(--border);color:var(--text);font-size:16px;font-weight:600;line-height:1.25;text-align:center;text-decoration:none;transition:border-color .15s,background .15s,transform .15s}
.btn:hover,.btn:focus-visible{border-color:var(--accent);background:#221f2e}
.btn:active{transform:scale(.98)}
.group{display:flex;flex-direction:column;gap:10px;margin:8px 0}
h2{margin:6px 0 0;color:var(--muted);font-size:13px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;text-align:center}
.posts{display:grid;grid-template-columns:repeat(3,1fr);gap:3px;margin-top:32px;border-radius:12px;overflow:hidden}
.post{display:block;aspect-ratio:4/5;background:var(--surface)}
.post img{display:block;width:100%;height:100%;object-fit:cover;transition:opacity .15s}
.post:hover img{opacity:.85}
a:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
footer{margin-top:32px;text-align:center}
footer a{color:var(--muted);font-size:13px;text-decoration:none}
</style>
</head>
<body>
<main>
<header>
<a href="${escape(withUtm('https://audius.co/'))}" aria-label="Audius"><img class="logo" src="/links/logo.svg" alt="Audius" width="150" height="31"></a>
${config.tagline ? `<p class="tagline">${escape(config.tagline)}</p>` : ''}
<nav class="socials">${(config.socials || []).map(social).join('')}</nav>
</header>
<div class="links">${(config.links || []).map(linkItem).join('')}</div>
${posts.length ? `<div class="posts">${posts.map(post).join('')}</div>` : ''}
<footer><a href="${escape(withUtm('https://audius.co/'))}">audius.co</a></footer>
</main>
</body>
</html>`
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (url.pathname === '/links' || url.pathname === '/links/') {
      return new Response(render(), {
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'public, max-age=300'
        }
      })
    }
    if (url.pathname.startsWith('/links/')) {
      return env.ASSETS.fetch(request)
    }
    return Response.redirect(new URL('/links', url).toString(), 302)
  }
}
