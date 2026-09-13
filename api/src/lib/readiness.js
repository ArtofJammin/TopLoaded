// Configuration evidence only. No network calls, secret values, or launch promises.
import { squareConfigured } from './square.js';

export function httpsUrl(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && !u.search && !u.hash && !/REPLACE|example\./i.test(u.href); } catch { return false; }
}
export function webhookConfigured(env) {
  return !!env.SQUARE_WEBHOOK_SIGNATURE_KEY && httpsUrl(env.SQUARE_WEBHOOK_URL) && new URL(env.SQUARE_WEBHOOK_URL).pathname.endsWith('/square/webhook');
}
export function shopCheckoutStatus(env) {
  // The legacy cart is not condition/SKU mapped. Production is deliberately impossible here.
  const ready = env.SHOP_CHECKOUT_ENABLED === 'true' && env.SQUARE_ENV === 'sandbox' && squareConfigured(env) && !!env.KV;
  return { ready, reason: ready ? 'Sandbox test checkout only; no production inventory mapping.' : 'Shop checkout is not activated. Buy through TCGplayer or visit the store. Catalog-linked stream claims have a separate payment switch.' };
}
export function setupReport(env, cfg = {}) {
  const checks = [];
  function add(id, title, requirements, detail, state) {
    const missing = Object.entries(requirements).filter(([, value]) => !value).map(([key]) => key);
    checks.push({ id, title, state: state || (missing.length ? 'missing' : 'configured'), missing, detail });
  }
  add('storage', 'Shared storage', { KV: !!env.KV, LIVE_CLAIMS: !!env.LIVE_CLAIMS }, 'KV stores settings and records; Durable Objects serialize live claims. Local demo records are never imported automatically.');
  add('auth', 'Private staff access', { STAFF_PIN_HASH: /^[a-f0-9]{64}$/i.test(env.STAFF_PIN_HASH || ''), ADMIN_PIN_HASH: /^[a-f0-9]{64}$/i.test(env.ADMIN_PIN_HASH || ''), DISTINCT_PASSCODES: !!env.ADMIN_PIN_HASH && env.ADMIN_PIN_HASH !== env.STAFF_PIN_HASH, TOKEN_SECRET: typeof env.TOKEN_SECRET === 'string' && env.TOKEN_SECRET.length >= 32 }, 'Use distinct private passcodes and a random token secret of at least 32 characters.');
  const origins = String(env.SITE_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
  let siteOrigin = ''; try { siteOrigin = new URL(env.SITE_URL).origin; } catch {}
  add('site', 'Published site / browser access', { SITE_URL: httpsUrl(env.SITE_URL), SITE_ORIGIN: origins.length > 0 && origins.every(o => httpsUrl(o) && new URL(o).origin === o) && origins.includes(siteOrigin) }, 'Use the full Pages site URL including /toploaded-demo/; CORS uses only the origin, without the repository path.');
  add('square', 'Square catalog connection', { SQUARE_ENV: ['sandbox', 'production'].includes(env.SQUARE_ENV), SQUARE_ACCESS_TOKEN: !!env.SQUARE_ACCESS_TOKEN, SQUARE_LOCATION_ID: !!env.SQUARE_LOCATION_ID }, 'Configuration is not proof of valid credentials. Run read-only checks to verify the active USD location and catalog access.');
  add('webhook', 'Signed Square webhooks', { SQUARE_WEBHOOK_SIGNATURE_KEY: !!env.SQUARE_WEBHOOK_SIGNATURE_KEY, SQUARE_WEBHOOK_URL: webhookConfigured(env) }, 'Register the exact HTTPS /square/webhook URL with Square. Delivery and inventory adjustment still require a sandbox payment test.');
  add('claims', 'Claim payments', { CLAIM_CHECKOUT_ENABLED: env.CLAIM_CHECKOUT_ENABLED === 'true', KV: !!env.KV, LIVE_CLAIMS: !!env.LIVE_CLAIMS, SQUARE: squareConfigured(env), SIGNED_WEBHOOK: webhookConfigured(env) }, 'Enable only after sandbox acceptance. Reserve physical cards from other channels; Square is not a global stock lock.', env.CLAIM_CHECKOUT_ENABLED === 'true' ? undefined : 'disabled');
  add('cart', 'Ordinary shop-cart payments', {}, shopCheckoutStatus(env).reason, shopCheckoutStatus(env).ready ? 'sandbox-only' : 'disabled');
  add('email', 'Customer sign-in / shop email', { KV: !!env.KV, RESEND_API_KEY: !!env.RESEND_API_KEY, EMAIL_FROM: !!env.EMAIL_FROM, NOTIFY_EMAIL: !!env.NOTIFY_EMAIL }, 'Verify the sender domain in Resend. Test delivery to an approved staff address; this checker sends no email.');
  add('google', 'Automatic five-star Google reviews', { GOOGLE_PLACES_API_KEY: !!env.GOOGLE_PLACES_API_KEY, 'reviews.googlePlaceId': !!cfg.reviews?.googlePlaceId, GOOGLE_REVIEWS_TERMS_URL: httpsUrl(env.GOOGLE_REVIEWS_TERMS_URL), GOOGLE_REVIEWS_PRIVACY_URL: httpsUrl(env.GOOGLE_REVIEWS_PRIVACY_URL) }, 'Requires Places API billing and the actual Place ID, not the share link. Only five-star reviews display; this checker makes no billable Places request.');
  add('github', 'Admin inventory sync', { GITHUB_TOKEN: !!env.GITHUB_TOKEN, GITHUB_REPO: /^[\w.-]+\/[\w.-]+$/.test(env.GITHUB_REPO || '') }, 'Fine-grained token: Actions read/write for this repository. Read-only verification cannot prove dispatch/write permission.');
  add('queue', 'Five-minute after-sale checks', { SALE_CHECK_QUEUE: !!env.SALE_CHECK_QUEUE, SIGNED_WEBHOOK: webhookConfigured(env), SQUARE: squareConfigured(env), LISTING_READS: !env.INVENTORY_COORDINATOR || env.LISTING_CHECKS_ENABLED === 'true' }, 'Optional queue and dead-letter queue must exist. Checks are read-only, delayed at least five minutes; delivery needs a sandbox test.');
  add('tcg-write', 'TCGplayer listing removal', {}, 'Requires an authorized seller connector and exact condition/printing/language mapping. Until then, remove sold cards manually.', 'manual');
  add('listing-checks', 'Visitor-triggered TCGplayer checks', { INVENTORY_COORDINATOR: !!env.INVENTORY_COORDINATOR, LISTING_CHECKS_ENABLED: env.LISTING_CHECKS_ENABLED === 'true' }, 'Read-only public listing observations shared for 15 minutes. Outbound clicks queue one delayed check, not a sale. Pauses on rejected requests; never overwrites snapshot stock.');
  add('inventory-email', 'Inventory alert emails', { INVENTORY_COORDINATOR: !!env.INVENTORY_COORDINATOR, RESEND_API_KEY: !!env.RESEND_API_KEY, EMAIL_FROM: !!env.EMAIL_FROM, NOTIFY_EMAIL: !!env.NOTIFY_EMAIL }, 'Opt-in staff digests, at most one new batch per 15 minutes. Delivery still needs an approved test.', env.INVENTORY_ALERT_EMAIL_ENABLED === 'true' ? undefined : 'disabled');
  add('tcg-notification', 'TCGplayer email-notification bridge', { INVENTORY_COORDINATOR: !!env.INVENTORY_COORDINATOR, TCG_NOTIFICATION_SECRET: typeof env.TCG_NOTIFICATION_SECRET === 'string' && env.TCG_NOTIFICATION_SECRET.length >= 32 }, 'Requires an owner-approved, sender-verified mailbox rule or bridge. Signed hints queue a refresh and staff review; they never subtract stock. See INVENTORY-SYNC.md.', env.TCG_NOTIFICATION_ENABLED === 'true' ? undefined : 'disabled');
  add('acceptance', 'Owner acceptance', {}, 'Verify payment, cancellation, tax/shipping, Square stock, email delivery, and customer-credit links before launch. No automated check can sign off the owner’s business rules.', 'manual');
  return { version: 1, checkedAt: new Date().toISOString(), mode: env.SQUARE_ENV === 'production' ? 'production' : 'sandbox', checks };
}
