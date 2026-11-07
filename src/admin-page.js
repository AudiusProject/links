// Admin UI. All user content is set with textContent/value, never innerHTML.

export const renderAdmin = (nonce) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Links admin</title>
<link rel="icon" type="image/png" href="/links/favicon-32x32.png">
<style>
:root{--bg:#0f0f10;--surface:#1a1a1d;--surface2:#232328;--border:#2c2c31;--text:#f6f6f8;--muted:#9a9aa3;--accent:#7f6ad6;--danger:#e5484d;--ok:#3fb950}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:15px/1.45 system-ui,-apple-system,sans-serif}
header{position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:12px;padding:12px 16px;background:rgba(15,15,16,.92);backdrop-filter:blur(8px);border-bottom:1px solid var(--border)}
header h1{margin:0;font-size:16px;font-weight:600;flex:1}
header .who{color:var(--muted);font-size:13px}
main{max-width:760px;margin:0 auto;padding:16px 16px 80px}
section{margin:20px 0;padding:16px;background:var(--surface);border:1px solid var(--border);border-radius:12px}
h2{margin:0 0 4px;font-size:15px}
.hint{margin:0 0 12px;color:var(--muted);font-size:13px}
.row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:8px 0;border-top:1px solid var(--border)}
.row:first-of-type{border-top:0}
.group{margin:8px 0;padding:10px;border:1px dashed var(--border);border-radius:10px}
input[type=text],input[type=url],select{flex:1 1 180px;min-width:0;padding:8px 10px;border-radius:8px;border:1px solid var(--border);background:var(--bg);color:var(--text);font:inherit}
input:focus,select:focus{outline:2px solid var(--accent);outline-offset:0;border-color:transparent}
button,.btnlink{padding:8px 12px;border-radius:8px;border:1px solid var(--border);background:var(--surface2);color:var(--text);font:inherit;cursor:pointer;text-decoration:none;white-space:nowrap}
button:hover,.btnlink:hover{border-color:var(--accent)}
button.primary{background:var(--accent);border-color:var(--accent);color:#fff;font-weight:600}
button.icon{padding:6px 9px}
button.danger:hover{border-color:var(--danger);color:var(--danger)}
button:disabled{opacity:.5;cursor:default}
label.check{display:flex;align-items:center;gap:6px;color:var(--muted);font-size:13px}
.tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px}
.tile{display:flex;flex-direction:column;gap:6px;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:10px}
.tile.hidden{opacity:.5}
.tile img{width:100%;aspect-ratio:4/5;object-fit:cover;border-radius:6px;background:var(--surface2)}
.tile .actions{display:flex;gap:4px;flex-wrap:wrap}
.badge{align-self:flex-start;padding:2px 6px;border-radius:6px;background:var(--surface2);color:var(--muted);font-size:11px}
.status{font-size:13px;color:var(--muted)}
.status.err{color:var(--danger)}
.status.ok{color:var(--ok)}
.banner{padding:10px 12px;border-radius:10px;background:#2a2316;border:1px solid #5c4a1f;color:#f0d9a8;font-size:13px}
@media (max-width:520px){header .who{display:none}}
</style>
</head>
<body>
<header>
<h1>audius.co/links</h1>
<span class="who" id="who"></span>
<a class="btnlink" href="/links" target="_blank" rel="noopener">View page</a>
<button class="primary" id="save" disabled>Save</button>
</header>
<main>
<p class="status" id="status">Loading…</p>
<div id="app" hidden>
<div class="banner" id="readonly" hidden>Storage isn't connected in this environment, so changes can't be saved here.</div>
<section>
<h2>Header</h2>
<p class="hint">Optional line under the logo.</p>
<div class="row"><input type="text" id="tagline" maxlength="200" placeholder="Tagline"></div>
</section>
<section>
<h2>Social icons</h2>
<div id="socials"></div>
<button id="addSocial">Add social</button>
</section>
<section>
<h2>Buttons</h2>
<p class="hint">Top to bottom, as on the page. Groups show a small heading above their links.</p>
<div id="links"></div>
<button id="addLink">Add button</button>
<button id="addGroup">Add group</button>
</section>
<section>
<h2>Tiles</h2>
<p class="hint">The post grid. Tiles without a link open the Instagram post.</p>
<div class="row">
<input type="file" id="tileFile" accept="image/jpeg,image/png,image/webp">
<input type="url" id="tileUrl" placeholder="Link for the new tile (optional)">
<button id="addTile">Add tile</button>
</div>
<div class="tiles" id="tiles"></div>
</section>
<section>
<h2>Instagram</h2>
<div id="ig"></div>
</section>
</div>
</main>
<script nonce="${nonce}">
(() => {
const PLATFORMS = ['twitter','instagram','threads','tiktok','youtube','discord']
const API = '/links/admin/api'
const $ = (id) => document.getElementById(id)
let state = null
let version = 0
let writable = false
let dirty = false

const el = (tag, props = {}, ...kids) => {
  const n = document.createElement(tag)
  for (const [k, v] of Object.entries(props)) {
    if (k === 'on') for (const [ev, fn] of Object.entries(v)) n.addEventListener(ev, fn)
    else if (k in n) n[k] = v
    else n.setAttribute(k, v)
  }
  for (const k of kids) if (k != null) n.append(k)
  return n
}

const setStatus = (msg, kind = '') => { const s = $('status'); s.textContent = msg; s.className = 'status ' + kind }
const markDirty = () => { dirty = true; $('save').disabled = !writable; setStatus('Unsaved changes') }

const api = async (path, opts = {}) => {
  const res = await fetch(API + path, {
    ...opts,
    headers: { 'x-links-admin': '1', ...(opts.headers || {}) },
    credentials: 'same-origin'
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || 'Request failed (' + res.status + ')')
  return body
}

const move = (arr, i, d) => { const j = i + d; if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; markDirty(); render() }
const remove = (arr, i) => { arr.splice(i, 1); markDirty(); render() }
const bind = (obj, key) => ({ value: obj[key] || '', on: { input: (e) => { obj[key] = e.target.value; markDirty() } } })
const hideToggle = (obj) => el('label', { className: 'check' },
  el('input', { type: 'checkbox', checked: !!obj.hidden, on: { change: (e) => { if (e.target.checked) obj.hidden = true; else delete obj.hidden; markDirty(); render() } } }), 'Hidden')
const controls = (arr, i) => [
  el('button', { className: 'icon', title: 'Move up', textContent: '↑', on: { click: () => move(arr, i, -1) } }),
  el('button', { className: 'icon', title: 'Move down', textContent: '↓', on: { click: () => move(arr, i, 1) } }),
  el('button', { className: 'icon danger', title: 'Remove', textContent: '✕', on: { click: () => remove(arr, i) } })
]

const linkRow = (arr, i) => {
  const l = arr[i]
  return el('div', { className: 'row' },
    el('input', { type: 'text', placeholder: 'Title', maxLength: 120, ...bind(l, 'title') }),
    el('input', { type: 'url', placeholder: 'https://', ...bind(l, 'url') }),
    hideToggle(l), ...controls(arr, i))
}

const renderSocials = () => {
  const box = $('socials'); box.replaceChildren()
  state.socials.forEach((s, i) => {
    const sel = el('select', { on: { change: (e) => { s.platform = e.target.value; markDirty() } } },
      ...PLATFORMS.map((p) => el('option', { value: p, textContent: p, selected: p === s.platform })))
    box.append(el('div', { className: 'row' }, sel,
      el('input', { type: 'url', placeholder: 'https://', ...bind(s, 'url') }), ...controls(state.socials, i)))
  })
}

const renderLinks = () => {
  const box = $('links'); box.replaceChildren()
  state.links.forEach((item, i) => {
    if ('group' in item) {
      const g = el('div', { className: 'group' },
        el('div', { className: 'row' },
          el('input', { type: 'text', placeholder: 'Group heading', maxLength: 80, ...bind(item, 'group') }),
          hideToggle(item), ...controls(state.links, i)))
      item.links.forEach((_, j) => g.append(linkRow(item.links, j)))
      g.append(el('button', { textContent: 'Add link to group', on: { click: () => { item.links.push({ title: '', url: '' }); markDirty(); render() } } }))
      box.append(g)
    } else {
      box.append(linkRow(state.links, i))
    }
  })
}

const renderTiles = () => {
  const box = $('tiles'); box.replaceChildren()
  state.posts.forEach((p, i) => {
    const arr = state.posts
    box.append(el('div', { className: 'tile' + (p.hidden ? ' hidden' : '') },
      el('img', { src: p.image, alt: p.alt || '', loading: 'lazy' }),
      p.igId ? el('span', { className: 'badge', textContent: 'Instagram' }) : null,
      el('input', { type: 'url', placeholder: p.permalink ? 'Opens the IG post' : 'https://', ...bind(p, 'url') }),
      hideToggle(p),
      el('div', { className: 'actions' },
        el('button', { className: 'icon', title: 'Move earlier', textContent: '←', on: { click: () => move(arr, i, -1) } }),
        el('button', { className: 'icon', title: 'Move later', textContent: '→', on: { click: () => move(arr, i, 1) } }),
        el('button', { className: 'icon danger', title: 'Remove', textContent: '✕', on: { click: () => { if (confirm('Remove this tile?')) remove(arr, i) } } }))))
  })
}

const renderIg = (ig) => {
  const box = $('ig'); box.replaceChildren()
  if (!ig.configured) {
    box.append(el('p', { className: 'hint', textContent: "The Instagram app isn't set up yet, so new posts aren't pulled in automatically. Tiles can still be added by hand above." }))
    return
  }
  if (!ig.connected) {
    box.append(el('p', { className: 'hint', textContent: 'Connect the @audius account once. New posts then show up as tiles automatically (checked every 30 minutes).' }),
      el('a', { className: 'btnlink', href: '/links/admin/instagram/connect', textContent: 'Connect Instagram' }))
    return
  }
  const last = ig.lastSync ? new Date(ig.lastSync).toLocaleString() : 'never'
  box.append(
    el('p', { className: 'hint', textContent: 'Connected as @' + ig.username + (ig.connectedBy ? ' by ' + ig.connectedBy : '') + '. Last checked ' + last + '.' }),
    ig.lastError ? el('p', { className: 'status err', textContent: 'Last sync failed: ' + ig.lastError }) : null,
    el('div', { className: 'row' },
      el('button', { textContent: 'Check for new posts', on: { click: syncNow } }),
      el('button', { className: 'danger', textContent: 'Disconnect', on: { click: disconnect } })))
}

const render = () => { renderSocials(); renderLinks(); renderTiles() }

const load = async () => {
  const data = await api('/config')
  state = data.config; version = data.version; writable = data.writable
  $('who').textContent = data.email
  $('tagline').value = state.tagline || ''
  $('readonly').hidden = writable
  for (const id of ['addSocial','addLink','addGroup','addTile']) $(id).disabled = !writable
  render(); renderIg(data.instagram)
  $('app').hidden = false
  dirty = false; $('save').disabled = true
  const q = new URLSearchParams(location.search)
  if (q.get('ig') === 'connected') setStatus('Instagram connected', 'ok')
  else if (q.get('ig') === 'error') setStatus('Instagram: ' + (q.get('msg') || 'connection failed'), 'err')
  else setStatus(writable ? 'Up to date' : 'Read only')
  if (q.has('ig')) history.replaceState(null, '', location.pathname)
}

const save = async () => {
  $('save').disabled = true; setStatus('Saving…')
  try {
    const data = await api('/config', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ version, config: state }) })
    state = data.config; version = data.version; dirty = false
    render(); setStatus('Saved. Live within a minute.', 'ok')
  } catch (e) {
    $('save').disabled = false; setStatus(e.message, 'err')
  }
}

// Shrink to 1080px JPEG in the browser before uploading.
const toJpeg = (file) => new Promise((resolve, reject) => {
  const img = new Image()
  img.onload = () => {
    const scale = Math.min(1, 1080 / Math.max(img.width, img.height))
    const c = document.createElement('canvas')
    c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale)
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
    URL.revokeObjectURL(img.src)
    c.toBlob((b) => b ? resolve(b) : reject(new Error('Could not read image')), 'image/jpeg', 0.85)
  }
  img.onerror = () => reject(new Error('Could not read image'))
  img.src = URL.createObjectURL(file)
})

const addTile = async () => {
  const file = $('tileFile').files[0]
  if (!file) return setStatus('Pick an image first', 'err')
  setStatus('Uploading…')
  try {
    const blob = await toJpeg(file)
    const { id, url } = await api('/media', { method: 'POST', headers: { 'content-type': 'image/jpeg' }, body: blob })
    state.posts.unshift({ id, image: url, url: $('tileUrl').value.trim(), alt: '' })
    $('tileFile').value = ''; $('tileUrl').value = ''
    markDirty(); render(); setStatus('Tile added. Save to publish.')
  } catch (e) { setStatus(e.message, 'err') }
}

const syncNow = async () => {
  if (dirty && !confirm('You have unsaved changes. Check for new posts anyway? Unsaved changes will be lost.')) return
  setStatus('Checking Instagram…')
  try { const { added } = await api('/instagram/sync', { method: 'POST' }); await load(); setStatus(added ? added + ' new tile(s) added' : 'No new posts', 'ok') }
  catch (e) { setStatus(e.message, 'err') }
}

const disconnect = async () => {
  if (!confirm('Disconnect Instagram? New posts will stop showing up automatically.')) return
  try { await api('/instagram/disconnect', { method: 'POST' }); await load() } catch (e) { setStatus(e.message, 'err') }
}

$('tagline').addEventListener('input', (e) => { state.tagline = e.target.value; markDirty() })
$('addSocial').addEventListener('click', () => { const used = new Set(state.socials.map((s) => s.platform)); state.socials.push({ platform: PLATFORMS.find((p) => !used.has(p)) || 'twitter', url: '' }); markDirty(); render() })
$('addLink').addEventListener('click', () => { state.links.push({ title: '', url: '' }); markDirty(); render() })
$('addGroup').addEventListener('click', () => { state.links.push({ group: '', links: [{ title: '', url: '' }] }); markDirty(); render() })
$('addTile').addEventListener('click', addTile)
$('save').addEventListener('click', save)
window.addEventListener('beforeunload', (e) => { if (dirty) e.preventDefault() })

load().catch((e) => setStatus(e.message, 'err'))
})()
</script>
</body>
</html>`
