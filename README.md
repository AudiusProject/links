# audius.co/links

Link-in-bio page for the Audius Instagram/TikTok bios. Replaces the Later linkin.bio page.

A Cloudflare Worker (`audius-links`) that renders one page from content stored in Workers KV, with an admin page for editing it and an Instagram sync that turns new posts into tiles.

## Editing (admin)

`/links/admin` lets anyone with an `@audius.co` email:

- edit the tagline, social icons and buttons (including grouped buttons), reorder or hide them
- add tiles (upload an image + link), reorder, hide or remove them
- connect Instagram once, after which new posts show up as tiles every 30 minutes. Tiles without a link open the Instagram post.

Saves go live within a minute. No deploy needed.

`links.json` is the starting content. It is used until the first admin save, and in previews.

## Security

- **Login**: Cloudflare Access (email one-time code, `@audius.co` only) protects `/links/admin*`. The Worker also verifies the Access JWT itself (signature, `aud`, `iss`, expiry, email domain), so the admin stays locked if Access is missing or misconfigured. With `ACCESS_AUD` empty, nobody can get in.
- **Writes**: admin API calls need the `x-links-admin` header and a same-origin `Origin`, so other sites can't make them.
- **Content**: links must be `http(s)`; text is escaped; images are sniffed and only JPEG/PNG/WebP are stored (no SVG); the public page and admin send a strict CSP.
- **Instagram**: the app secret is a Worker secret (dashboard only, never in this repo). The access token lives in KV, is never sent to the browser, and is refreshed weekly by the cron.
- **Previews**: branch previews use `KV_PREFIX=preview:` and have no KV binding yet, so they can't read or write production data.

## Setup checklist

1. Cloudflare Access: self-hosted application covering `audius.co/links/admin` and `audius-links.audius.workers.dev/links/admin`, policy "emails ending in @audius.co". Put its AUD tag in `ACCESS_AUD` in `wrangler.toml`.
2. Instagram: a Meta app with "Instagram API with Instagram Login", in development mode, with the @audius account added as an Instagram tester. Redirect URI `https://audius.co/links/admin/instagram/callback`. Put the app id in `IG_APP_ID` (wrangler.toml) and the app secret as the `IG_APP_SECRET` Worker secret in the dashboard.
3. Route: uncomment `routes` in `wrangler.toml` to serve `audius.co/links`.

`[vars]` in `wrangler.toml` overwrite dashboard vars on every deploy, so change them here, not in the dashboard. Secrets are kept.

## Run / deploy

```bash
npm install
echo 'DEV_ADMIN_EMAIL=dev@audius.co' > .dev.vars   # local admin login, localhost only
npm run dev      # http://localhost:8787/links and /links/admin
```

Deploys go through Cloudflare Workers Builds: merging to `main` deploys production; every branch gets a preview URL posted on its PR. Don't deploy from a laptop.

The initial content was imported from the Later page (api-prod.linkin.bio, page 462362) on 2026-11-06.
