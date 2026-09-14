# Connect the shop API

The code is prepared; this procedure still requires the shop's Cloudflare account and service credentials. Nothing here activates real payments by default. Never paste credentials into Admin, GitHub repository variables, chat, or source files.

Customer accounts do **not** require Google OAuth or the owner's Google credentials. New and returning customers verify their email with a one-time code. Deploy the Worker with private KV storage and a verified Resend sender (`RESEND_API_KEY`, `EMAIL_FROM`); the shop then links verified customer emails to existing credit records. The counter can locate records by phone or email, but a typed phone number alone never grants online balance access. SMS sign-in is not implemented. Google review credentials are an independent, optional integration.

Until hosting and the sender are connected, the production account page explicitly reports that online access is not active. The buyout form prepares an email draft (with optional photo links), not a simulated submission. Customers attach photos in their email app; the Worker accepts links only and never downloads or publicly hosts those images.

## 1. Prepare an isolated sandbox

From the repository root, install the official Wrangler CLI (`npm install -g wrangler`) and run `wrangler login` using the account that will own the shop's data. Check account limits/costs before provisioning storage or queues.

Create a KV namespace: `wrangler kv namespace create KV`. Copy its ID. Choose a unique Worker name such as `toploaded-api-sandbox` on that account's workers.dev subdomain. Use a **separate Worker, KV namespace, secrets and queues** for production; never test against a live credit ledger.

```powershell
node tools/setup-api.mjs --kv-id YOUR_32_CHARACTER_NAMESPACE_ID --api-url https://toploaded-api-sandbox.YOUR_ACCOUNT.workers.dev
```

This writes ignored `api/wrangler.local.json`, with the real namespace, exact webhook URL, strict Pages origin, Durable Object migration, and both payment switches OFF. It does not contact Cloudflare or overwrite an existing setup. Review the file. After the first setup, edit that same file to preserve resource identities/migration history.

Optional five-minute checks: include `--sale-checks` at generation time, then create **both** named queues from the generated config using `wrangler queues create QUEUE_NAME` before deploying. Queue creation is never automatic. These are read-only listing checks, not TCGplayer writes.

## 2. Add private credentials

The Windows helper below prompts invisibly, hashes passcodes, and uploads directly to Wrangler without writing a secret file. Passcodes must be distinct, unique, and at least 12 characters. TOKEN_SECRET is generated randomly. Run only when you are ready to upload to the Worker named in the local config; Wrangler may offer to create that Worker. Changing TOKEN_SECRET later signs out existing staff sessions.

```powershell
./tools/set-api-secret.ps1 -Name STAFF_PIN_HASH
./tools/set-api-secret.ps1 -Name ADMIN_PIN_HASH
./tools/set-api-secret.ps1 -Name TOKEN_SECRET
```

Optional services, using the same helper with each name:

| Feature | Secrets / settings | Outside setup still required |
| --- | --- | --- |
| Square catalog + claim payments | `SQUARE_ACCESS_TOKEN`, `SQUARE_LOCATION_ID`, `SQUARE_WEBHOOK_SIGNATURE_KEY` | Sandbox first; active USD location, exact catalog variations, stock tracking, taxes, delivery rules, and signed webhook subscription |
| Email sign-in / notifications | `RESEND_API_KEY`, `EMAIL_FROM`, `NOTIFY_EMAIL` | Verify the sender domain in Resend; confirm delivery to a consenting staff test address |
| Admin Sync now | `GITHUB_TOKEN` | Fine-grained token scoped to ArtofJammin/TopLoaded, Actions read/write; no broad account access required |
| Google reviews | `GOOGLE_PLACES_API_KEY` | Places API/billing; actual Place ID in Admin; published terms/privacy URLs in Worker vars `GOOGLE_REVIEWS_TERMS_URL` and `GOOGLE_REVIEWS_PRIVACY_URL` |

No secret value is returned by the setup report. Sender addresses and public URLs may also be set in the Cloudflare dashboard. Google’s share URL/FID is not its Places API Place ID. Do not substitute one for the other.

TCGplayer does not need partner API credentials for the prepared read-only workflow. See [INVENTORY-SYNC.md](INVENTORY-SYNC.md) for shared fifteen-minute listing checks, delayed outbound-link checks, opt-in staff email and the signed notification bridge. An existing local deployment config needs the additional `InventoryCoordinator` binding/migration; the setup generator never overwrites it automatically. No mailbox is connected by this code.

## 3. Package, deploy and test privately

```powershell
node tools/check.mjs
wrangler deploy --dry-run --config api/wrangler.local.json
wrangler deploy --config api/wrangler.local.json
```

The last command actually deploys. Use `--config api/wrangler.local.json` on **every** subsequent secret/deploy command; bare `wrangler deploy` would use the placeholder checked-in config.

On the website, open Admin → **Connect the shop API**. Test the exact HTTPS Worker base URL, then explicitly choose **Use on this browser**. This logs out old sessions and is device-only; it does not publish the connection or copy demo settings, forms or balances. Sign in with the Worker admin passcode. If the endpoint is wrong or unavailable, **Remove device-only API override** remains available in the login dialog.

Choose **Check configuration**, then **Run read-only checks**. The latter verifies Square location/catalog reads and GitHub workflow reads. It does not prove payment/Inventory permissions, email delivery, Actions write access, Google billing, or webhook/queue delivery. Download the redacted report for the remaining checklist.

Register the exact generated `/square/webhook` URL in Square, with `payment.updated`, `inventory.count.updated`, and `order.created`. Keep signature verification enabled. Set `CLAIM_CHECKOUT_ENABLED=true` in the **sandbox local config** and redeploy only when ready for [sales acceptance](SALES-CONNECTION.md). Both success and failed/cancelled payment paths need real sandbox testing; confirm the actual Square stock count after payment.

`SHOP_CHECKOUT_ENABLED=true` permits the legacy ordinary cart in **sandbox only**. Production remains blocked even if this flag is set: exact condition/printing inventory mapping is not implemented for that cart. Adding Square keys alone cannot enable it. Staff claim links use exact Square variation IDs and the separate claim switch.

## 4. Connect all visitors after acceptance

Prepare a separate production Worker and storage using `--mode production`; both payment switches still start OFF. Connect production services, validate configuration, reconcile real ledger/customer email links in store, and obtain owner sign-off before enabling production claim payments.

In GitHub → repository Settings → Secrets and variables → Actions → **Variables**, set `TL_API_URL` to the final production Worker HTTPS base URL. This is a public address, not a secret. Run **Publish site**. The deployment writes public `api-config.json`; no source/meta-tag edit or new code build is needed. Confirm the public `/api-config.json` and Admin current connection. Device-only overrides take precedence, so use **Use published connection** on test browsers.

Rollback connection: clear `TL_API_URL` and run Publish site again. This disconnects new page loads; it does not stop existing open tabs or cancel outstanding Square links. To stop new claim checkouts, turn `CLAIM_CHECKOUT_ENABLED=false` and redeploy the Worker. Keep the webhook working to settle existing payments and cancel unpaid links explicitly in Square/claim desk. Never delete the KV namespace or Durable Object to roll back a frontend release.

## Boundaries that remain

- No automatic TCGplayer inventory write connector. Reserve physical cards and remove their listings manually until authorized exact-SKU reconciliation is implemented.
- Customer accounts can read linked credit. Existing KV ledger writes/session revocation are eventually consistent; concurrent counter redemption and online credit spending need transactional storage/idempotency.
- Google credentials require billing and business-owned terms/privacy policies. Saved genuine highlights are not a live Google feed.
- Table payments, refunds-to-board reconciliation, a sales-statistics feed, and ordinary-cart production mapping are not activated by this setup.

References: [Cloudflare configuration](https://developers.cloudflare.com/workers/wrangler/configuration/), [Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/), [Square location verification](https://developer.squareup.com/docs/locations-api).
