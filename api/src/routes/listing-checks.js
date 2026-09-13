import { HttpError, json } from '../lib/http.js';
import { rateLimit } from '../lib/ratelimit.js';
import { loadInventory } from './price.js';
import { inventoryCoordinator } from '../lib/inventory-check-client.js';

const validId = id => typeof id === 'string' && /^[1-9]\d{0,11}$/.test(id);
export const notificationEnabled = env => env.TCG_NOTIFICATION_ENABLED === 'true' &&
  typeof env.TCG_NOTIFICATION_SECRET === 'string' && env.TCG_NOTIFICATION_SECRET.length >= 32 && !!env.INVENTORY_COORDINATOR;

async function knownProduct(env, id) {
  if (!validId(id)) throw new HttpError(400, 'Invalid product ID');
  const inventory = await loadInventory(env);
  if (!inventory) throw new HttpError(503, 'Inventory snapshot unavailable');
  if (!inventory.byId.has(id)) throw new HttpError(404, 'Product is not in the shop inventory snapshot');
}
async function listing(ctx, action) {
  const { env, params, ip } = ctx;
  if (!validId(params.id)) throw new HttpError(400, 'Invalid product ID');
  if (env.LISTING_CHECKS_ENABLED !== 'true' || !env.INVENTORY_COORDINATOR) {
    return { status: 'unknown', reason: 'disabled', productId: params.id, queued: false };
  }
  await rateLimit(env, 'listing:' + ip, { limit: 120, windowSec: 600 });
  await knownProduct(env, params.id);
  return inventoryCoordinator(env, action, { id: params.id });
}

// A TRUSTED mail-rule bridge signs a tiny hint after verifying the real sender.
// This is not a raw-email endpoint. From:/subject text alone is not authentication.
// Signature = hex HMAC-SHA256(secret, `${unixSeconds}.${eventId}.${rawBody}`).
async function notification({ env, req, ip }) {
  if (!notificationEnabled(env)) throw new HttpError(503, 'Notification bridge is not enabled');
  await rateLimit(env, 'inventory-hint:' + ip, { limit: 30, windowSec: 60 });
  const timestamp = req.headers.get('x-tl-timestamp') || '', eventId = req.headers.get('x-tl-event-id') || '';
  const signature = req.headers.get('x-tl-signature') || '';
  if (!/^\d{10}$/.test(timestamp) || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300 ||
      !/^[A-Za-z0-9_-]{1,100}$/.test(eventId) || !/^[a-f0-9]{64}$/.test(signature)) throw new HttpError(401, 'Invalid notification signature');
  if (Number(req.headers.get('content-length') || 0) > 2048) throw new HttpError(413, 'Notification too large');
  // Bounded stream read: do not buffer arbitrary email bodies before rejecting.
  const reader = req.body?.getReader(); let bytes = new Uint8Array(0);
  if (reader) for (;;) {
    const part = await reader.read(); if (part.done) break;
    if (bytes.length + part.value.length > 2048) { await reader.cancel(); throw new HttpError(413, 'Notification too large'); }
    const next = new Uint8Array(bytes.length + part.value.length); next.set(bytes); next.set(part.value, bytes.length); bytes = next;
  }
  const raw = new TextDecoder().decode(bytes), encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(env.TCG_NOTIFICATION_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const sig = Uint8Array.from(signature.match(/../g), pair => parseInt(pair, 16));
  if (!await crypto.subtle.verify('HMAC', key, sig, encoder.encode(timestamp + '.' + eventId + '.' + raw))) throw new HttpError(401, 'Invalid notification signature');
  let body; try { body = JSON.parse(raw); } catch { throw new HttpError(400, 'Invalid notification'); }
  if (!body || Array.isArray(body) || body.type !== 'order-notification' ||
    Object.keys(body).some(k => !['type', 'productIds'].includes(k)) ||
    !Array.isArray(body.productIds) || body.productIds.length > 20 || !body.productIds.every(validId)) throw new HttpError(400, 'Send only the notification type and numeric product IDs; no customer or email content');
  for (const id of new Set(body.productIds)) await knownProduct(env, id);
  const result = await inventoryCoordinator(env, 'notify', { eventId, kind: 'tcg-notification', productIds: [...new Set(body.productIds)] });
  return json(result, 202);
}
export function register(r) {
  r.get('/inventory/listing/:id', ctx => listing(ctx, 'check'));
  r.post('/inventory/listing/:id/interest', ctx => listing(ctx, 'interest'));
  r.post('/inventory/notifications/tcgplayer', notification);
}
