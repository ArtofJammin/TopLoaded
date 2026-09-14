# Top Loaded Trading Cards — website

The production storefront for Top Loaded Trading Cards in Crescent Springs, KY:
TCGplayer inventory, play nights, the Hilton card show and vendor floor plan,
collection buying, live stream claims, and a clearly labeled virtual pack game.
Built as a static GitHub Pages site with an optional Cloudflare Worker backend.

This repository is an independent copy of the original site, preserving its history.
The original demo repository and website are not changed by releases here.

Production mode never grants demo staff access or creates mock purchases. Card
purchases go through TCGplayer; customer forms offer phone/email contact until the
API is connected. Customer credit sign-in requires the real account service. Live
claims checkout remains separately gated by the verified Square integration.
Browser storage is isolated from the demo using the `toploaded-production-` prefix.

Home and Play Nights show independent countdowns to each scheduled game's next event.
Facebook is the default stream destination. In Admin, select Facebook or TikTok and
paste the live video/profile URL: customers watch and chat on that platform while
confirmed claims stay on the website. Native platform comments are not mirrored into
the site's separate chat. YouTube and Twitch video embeds remain supported.

Live: https://artofjammin.github.io/TopLoaded/

## Run it

```bash
node tools/dev-server.mjs
```

http://localhost:8787 — builds the page, watches `src/`, serves the API at `/api`
with an in-memory KV (persisted to `tools/.dev-kv.json`). Dev passcodes:
`staff` / `admin`. Node 18+ only, no install.

## Edit it

| What | Where |
|---|---|
| Page markup, per view | `src/html/*.html` (files concatenate in name order; views are `<section class="view" id="view-…">`) |
| Styles | `src/css/*.css` (tokens in `00-tokens.css`; three themes: `tl`, `light`, `dark`) |
| Behaviour | `src/js/*.js` — one shared closure, files run in name order; contracts and events are documented in `src/js/00-core.js` |
| Shop facts the owner can change | `config.default.json` (hours, play nights, card show, live, links, buy rates, ticker, testimonials) — also editable in the Admin page |
| API | `api/` (see `api/README.md` for every endpoint) |
| Inventory | `inventory.json` + `inventory-summary.json`, refreshed by `tools/update-inventory.py` |

Build: `node tools/build.mjs` → `index.html` (commit it) and `tools/artifact.html`.
Check: `node tools/check.mjs` (build + syntax + ids + API tests). CI runs the same.

## Deploy

- **Site**: push `main`; `pages.yml` validates and publishes only the public site assets.
  Pages publishing source must be **GitHub Actions**, not the legacy branch builder.
  A successful inventory workflow also triggers publication (bot commits alone do not).
- **Inventory**: `.github/workflows/inventory.yml` runs at 02:17, 10:17 and 18:17 UTC and on
  demand (Actions → Refresh inventory → Run workflow, or the admin "Sync now" button
  once the API has a `GITHUB_TOKEN`). `tools/update-inventory.ps1` is the local fallback.
  In summer this is approximately 6:17 AM, 2:17 PM and 10:17 PM Eastern; winter is an hour earlier.
  Scheduled runs can be delayed by GitHub. An empty, failed or incomplete pull is not published.
  Without the API, Admin opens the authenticated GitHub workflow page for a manual run.
- **After-sale checks**: implemented but not active until the Worker, signed Square
  payment webhooks and the optional delayed queue are connected. See `api/README.md`.
- **API**: `api/README.md` — `wrangler deploy`, set the secrets, then put the worker URL in
  `src/head.html` (`<meta name="tl-api">`), rebuild, commit.
- **Passcodes**: production passcodes are Worker secrets (`STAFF_PIN_HASH`, `ADMIN_PIN_HASH`).
  Production mode refuses all client-side demo passcodes, even with the API offline.
