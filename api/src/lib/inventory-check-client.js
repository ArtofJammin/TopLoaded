// Internal Worker -> Durable Object calls. No customer credentials or arbitrary URLs.
import { HttpError } from './http.js';
export async function inventoryCoordinator(env, action, data = {}) {
  if (!env.INVENTORY_COORDINATOR) return null;
  const stub = env.INVENTORY_COORDINATOR.get(env.INVENTORY_COORDINATOR.idFromName('shop-inventory'));
  const r = await stub.fetch(new Request('https://inventory.internal/' + action, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data)
  }));
  if (!r.ok) throw new HttpError(r.status === 429 ? 429 : 503, 'Inventory coordinator unavailable; retry later');
  return r.json();
}

export function inventoryEmailEnabled(env) {
  return env.INVENTORY_ALERT_EMAIL_ENABLED === 'true' && !!(env.RESEND_API_KEY && env.EMAIL_FROM && env.NOTIFY_EMAIL);
}

// Call only after a verified payment event. The existing staff alert is immediate;
// optional email is a bounded digest, not one message for every stock change.
export async function notifyInventoryStaff(env, eventId) {
  if (!inventoryEmailEnabled(env) || !env.INVENTORY_COORDINATOR) return false;
  await inventoryCoordinator(env, 'notify', { eventId, kind: 'square-payment' });
  return true;
}
