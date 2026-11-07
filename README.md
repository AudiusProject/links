# audius.co/links

Link-in-bio page for the Audius Instagram/TikTok bios. Replaces the Later linkin.bio page.

A Cloudflare Worker that renders `links.json` into one static HTML page. No database, no server.

## Edit links

Everything is in `links.json`:

- `socials`: icon row (`twitter`, `threads`, `tiktok`, `youtube`)
- `links`: buttons, top to bottom. A `{ "group": "...", "links": [...] }` entry renders a labelled section.
- `posts`: the post grid, newest first. Put the image in `public/links/posts/` and point `image` at `/links/posts/<file>`.

Add `"hidden": true` to any link, group or post to hide it without deleting it.

Outbound links get `utm_campaign=linkinbio&utm_medium=referral&utm_source=audius-links` unless they already set those keys.

## Run / deploy

```bash
npm install
npm run dev      # http://localhost:8787/links
npm run deploy   # needs wrangler login on the Audius Cloudflare account
```

The `audius.co/links` route is in `wrangler.toml` (commented out until approved). It takes precedence over the main web worker for that path only.

The initial content was imported from the Later page (api-prod.linkin.bio, page 462362) on 2026-11-06.
