# TCGplayer without partner API access

Implemented September 13, 2026. This is **read-only reconciliation**, not an inventory write connector. GitHub Pages can serve the snapshot by itself; shared checks, alarms and notifications require the shop's deployed Cloudflare Worker. No TCGplayer API key is required. Public listing access is unofficial, may change or reject requests, and is never a stock lock.

## What runs when

| Trigger | Behavior | Does it change stock? |
| --- | --- | --- |
| Existing GitHub schedule | Full inventory import at 02:17, 10:17 and 18:17 UTC; publishes updated snapshot when changed | Snapshot only |
| Admin **Sync now** | Starts that same workflow; existing ten-minute cooldown | Snapshot only |
| Visitor opens a card | Reads this seller's public listing, using a shop-wide fifteen-minute observation cache | No |
| Visitor follows a product link to our TCGplayer listing | Link opens immediately; best-effort browser hint schedules a persistent check at least fifteen minutes later | No; clicking is NOT buying |
| Signed Square completed-payment event | Existing staff alert immediately; optional email digest; existing queue verifies mapped listings after at least five minutes | Square owns its catalog adjustment; staff reconcile TCGplayer |
| Trusted, signed TCGplayer order-email hint | Staff review + coalesced full-import request; optional targeted observations if exact product IDs are known | No; verify the actual order first |

The snapshot remains the displayed price/quantity source. The quick view identifies it as **at last import**, alongside the independent listing observation. A returned listing may not include every condition/printing/language. An empty result means **no active listing returned**, not proof of a sale. A timeout, rejected request or malformed response means **availability unconfirmed**; the last good snapshot is not erased. Cached observations expire even if the quick view stays open. Hidden tabs stop their timers.

## Activation

Follow [API-CONNECT.md](API-CONNECT.md) first. New generated configs include the `INVENTORY_COORDINATOR` Durable Object binding and migration `inventory-coordinator-v1`. **Existing deployments:** add those entries from `api/wrangler.toml` to the existing local config, preserving its Worker name, namespaces, queues, secrets and earlier migration. Do not recreate production storage.

- `LISTING_CHECKS_ENABLED=true` enables shared reads. It defaults on in deployment templates, off in the lightweight Node dev server unless explicitly configured. No TCGplayer credential is requested.
- The existing `SALE_CHECK_QUEUE` plus dead-letter queue is still needed for five-minute Square checks. Map exact products explicitly with `tcg:PRODUCT_ID` in the Square variation SKU; never match names heuristically. The new coordinator shares request limits across visitor and after-sale checks. Keep the Square webhook active for outstanding payments.
- `GITHUB_TOKEN` with this repository's Actions read/write permission enables Admin dispatch and notification-triggered imports. It is not needed for scheduled GitHub Actions.
- Optional staff email: verified Resend sender, `RESEND_API_KEY`, `EMAIL_FROM`, `NOTIFY_EMAIL`, then `INVENTORY_ALERT_EMAIL_ENABLED=true`. Obtain approval for the staff destination and test delivery. One digest may send promptly, subsequent new batches at least fifteen minutes apart. Three bounded delivery attempts reuse the provider idempotency key. Alerts stay available if email fails. A completed Square tender can be one part of a split payment: verify the full order before fulfilling it.
- Publish the Worker, run the configuration report in Admin, and set the deployment's `TL_API_URL` only after acceptance. Payments remain independently gated; this work does not activate ordinary-cart production checkout.

## Optional trusted email bridge

The shop has **not connected a mailbox**. The prepared receiver is not a Google/Gmail or Resend inbound integration by itself. Choose and authorize the mail-rule provider with the owner before enabling this:

1. A protected server-side rule reads only the relevant order notifications in the owner's authorized mailbox. Verify authentic TCGplayer delivery using the provider's trustworthy authentication results (e.g. aligned DKIM/DMARC); **never trust an editable From header or subject alone**. Exclude forwarded/spoofed/test mail unless explicitly verified.
2. Store a random shared secret of at least 32 characters in that bridge and Worker secret `TCG_NOTIFICATION_SECRET`. The upload helper supports this name. Enable `TCG_NOTIFICATION_ENABLED=true` only after testing. Never put the secret in website JavaScript, Admin fields, URLs, logs or GitHub public variables.
3. Emit an opaque event ID (for example SHA-256 of the provider's immutable message ID). On retries reuse that ID but regenerate the timestamp/signature. Retained IDs are bounded and deduped for seven days. HTTP 429/503 requires a later retry. Keep failed notifications in the bridge's own dead-letter/review queue.
4. Send **no customer identity, email body, order contents, price or stock instruction**. Use `productIds:[]` if exact numeric IDs are unavailable or absent from our snapshot; the generic refresh still works. Unknown/malformed IDs are refused instead of crawling arbitrary products.

Endpoint: `POST /inventory/notifications/tcgplayer`

```json
{"type":"order-notification","productIds":[]}
```

Headers: `X-TL-Timestamp` (Unix seconds, within five minutes), `X-TL-Event-Id` (1–100 letters, digits, `_` or `-`), `X-TL-Signature` (lowercase hex HMAC-SHA256). Sign the exact UTF-8 string `timestamp + '.' + eventId + '.' + rawJsonBody`. Extra body fields are refused; maximum 2 KiB / twenty numeric IDs. Accepted response: HTTP 202 with `accepted` and `duplicate` booleans. This authenticates the bridge, **not the original email**, which must be verified upstream.

The zero-dependency helper `tools/send-inventory-hint.mjs` exports `sendInventoryHint` for the trusted bridge. It also supports an explicit `--send OPAQUE_EVENT_ID [PRODUCT_ID ...]` CLI after `TCG_NOTIFICATION_API_BASE` and `TCG_NOTIFICATION_SECRET` are injected by the bridge's protected runtime. Without `--send`, it makes no request. It does not read mail or verify senders for you.

## Limits, failure behavior and privacy

- One coordinator for the shop: maximum 12 upstream listing reads per minute and 600 per UTC day. Fifteen-minute global pause after HTTP 403/429; no CAPTCHA bypass, proxy rotation or repeated hammering. Other failed reads wait five minutes before becoming eligible again.
- At most 600 cached products and 100 pending interest checks; a full queue declines new hints. A cold-cache lease prevents duplicate concurrent reads. Capacity and paused checks do not alter stock.
- Alarms drain at most three targeted reads per run, stop when work is done, and survive tab closure / Worker recreation. Delayed checks are best-effort, not an exact fifteen-minute SLA. Alarms may run late; GitHub imports also take time to publish. An import dispatch failure leaves a staff alert and the daily/manual paths remain available.
- No per-visitor browsing history, email contents or customer details are retained by this feature. Only product observations, pending product IDs, counters, and opaque notification dedupe IDs are stored. Provider/network logs and the pre-existing payment records have separate policies.
- Alert acknowledgment means **reviewed**, not “stock automatically synchronized.” Existing alerts use bounded KV storage and are best-effort under concurrent writers. Source order/payment records remain the authority. Check the actual Square/TCGplayer order screens when reconciling the last copy.

## Acceptance and rollback

Development verification (September 13): 142 automated API/frontend tests passed; Wrangler packaging passed; a real local Cloudflare runtime returned a valid seller observation and reused its timestamp on the next request, and accepted the persistent delayed-check alarm. Desktop and 375px mobile quick views showed the snapshot/unconfirmed notice without horizontal overflow or browser errors. These checks did not deploy a production Worker, send email, access a mailbox or take a payment. Cloudflare-hosted reachability and the owner-approved email/payment acceptance steps below still need testing after credentials are connected.

Run `node tools/check.mjs`, then a Wrangler dry run. In an isolated sandbox: open a known card from two browsers, confirm one fresh observation; follow a product link and confirm it opens without waiting; confirm the alarm runs after tab closure; simulate blocked public reads; deliver one valid and one spoofed hint; replay a valid hint and confirm dedupe; verify one signed Square sandbox payment + delayed check; test an approved staff email and a delivery failure. Do not run those payment/email tests against the real shop ledger.

Turn `LISTING_CHECKS_ENABLED=false` to stop new public reads. `TCG_NOTIFICATION_ENABLED=false` rejects new mail hints; already accepted hints can finish one queued review/import. `INVENTORY_ALERT_EMAIL_ENABLED=false` suppresses queued digests too. These switches do not stop the independent three-daily GitHub importer. Keep existing storage/migrations and Square webhook; never delete records as rollback. Clear `TL_API_URL` only to disconnect the website, not to cancel payments.

References: [Cloudflare persistent alarms](https://developers.cloudflare.com/durable-objects/api/alarms/), [Resend idempotent email requests](https://resend.com/docs/api-reference/emails/send-email).
