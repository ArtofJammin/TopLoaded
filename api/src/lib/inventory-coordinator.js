import { HttpError, json, readJson } from './http.js';
import { sellerListing } from './sale-checks.js';
import { inventoryEmailEnabled } from './inventory-check-client.js';
import { sendEmail } from './email.js';
import { appendAlert } from '../routes/alerts.js';
import { dispatchInventory } from '../routes/inventory.js';

const FRESH = 15 * 60000, DAY = 86400000;
const productId = value => typeof value === 'string' && /^[1-9]\d{0,11}$/.test(value);
const initial = () => ({ records: {}, pending: {}, seen: {}, notices: [], pauseUntil: 0 });

// One bounded, strongly-consistent coordinator for the shop. Network requests run
// OUTSIDE transactions. A persisted lease prevents concurrent cold-cache requests
// from hammering the seller; alarms persist even after the visitor closes the tab.
export class InventoryCoordinator {
  constructor(ctx, env) { this.storage = ctx.storage; this.env = env; }
  async change(fn) {
    return this.storage.transaction(async tx => {
      const s = await tx.get('state') || initial(), now = Date.now();
      for (const [id, r] of Object.entries(s.records)) if (r.touched < now - DAY) delete s.records[id];
      for (const [id, at] of Object.entries(s.seen)) if (at < now - 7 * DAY) delete s.seen[id];
      const result = await fn(s, now);
      await tx.put('state', s);
      const due = [...Object.values(s.pending), ...(s.hintDue ? [s.hintDue] : []), ...(s.digest ? [s.digest.due] : []),
        ...(!s.digest && s.notices.length ? [Math.max(now + 1000, s.emailAfter || 0)] : [])];
      if (due.length) await tx.setAlarm(Math.max(now + 1000, Math.min(...due)));
      else await tx.deleteAlarm();
      return result;
    });
  }
  observation(id, r, now, reason) {
    const fresh = !!r?.checkedAt && now < r.checkedAt + FRESH && !r.error;
    return { productId: id, status: fresh ? r.status : 'unknown', checkedAt: r?.checkedAt || null,
      expiresAt: fresh ? r.checkedAt + FRESH : null, reason: reason || (fresh ? null : r?.error || 'unconfirmed'),
      retryAt: Math.max(now + 5000, r?.lease || 0, r?.retryAt || 0),
      // Never expose a stale quantity as current stock. Returned listings may not
      // cover every condition/printing, so even a fresh count is not inventory truth.
      ...(fresh && r.status === 'listed' ? { quantityShown: r.quantityShown } : {}),
      ...(!fresh && r?.checkedAt ? { lastKnown: { status: r.status, checkedAt: r.checkedAt } } : {}) };
  }
  async check(id, after = 0) {
    if (!productId(id)) throw new HttpError(400, 'Invalid product ID');
    if (this.env.LISTING_CHECKS_ENABLED !== 'true') return this.observation(id, null, Date.now(), 'disabled');
    const reservation = await this.change((s, now) => {
      let r = s.records[id];
      if (r?.checkedAt >= after && now < r.checkedAt + FRESH && !r.error) return { result: this.observation(id, r, now) };
      if (r?.lease > now) return { result: this.observation(id, r, now, 'checking') };
      const day = Math.floor(now / DAY), minute = Math.floor(now / 60000);
      if (s.day !== day) { s.day = day; s.dayCount = 0; }
      if (s.minute !== minute) { s.minute = minute; s.minuteCount = 0; }
      const retryAt = Math.max(s.pauseUntil || 0, r?.retryAt || 0,
        s.dayCount >= 600 ? (day + 1) * DAY : 0, s.minuteCount >= 12 ? (minute + 1) * 60000 : 0);
      if (retryAt > now) return { result: { ...this.observation(id, r, now, 'paused'), retryAt } };
      if (!r && Object.keys(s.records).length >= 600) return { result: this.observation(id, null, now, 'capacity') };
      r = s.records[id] = { ...r, touched: now, lease: now + 30000 };
      s.minuteCount++; s.dayCount++;
      return { lease: r.lease };
    });
    if (reservation.result) return reservation.result;
    let observed, error;
    try { observed = await sellerListing(id); } catch (e) {
      error = e;
      // Provider diagnostics belong in protected Worker logs, not customer UI.
      console.warn('[listing check]', e.upstreamStatus || 'unconfirmed', e.message);
    }
    return this.change((s, now) => {
      const r = s.records[id];
      if (!r || r.lease !== reservation.lease) return this.observation(id, r, now, 'checking');
      r.lease = 0;
      if (error) {
        r.error = 'unconfirmed'; r.retryAt = now + 5 * 60000;
        if ([403, 429].includes(error.upstreamStatus)) s.pauseUntil = now + FRESH;
      } else {
        Object.assign(r, { status: observed.listed ? 'listed' : 'not-listed', quantityShown: observed.quantityShown,
          checkedAt: now, error: null, retryAt: 0 });
      }
      const result = this.observation(id, r, now);
      if (error) result.retryAt = Math.max(result.retryAt, s.pauseUntil);
      return result;
    });
  }
  async interest(id) {
    if (!productId(id)) throw new HttpError(400, 'Invalid product ID');
    if (this.env.LISTING_CHECKS_ENABLED !== 'true') return { queued: false, reason: 'disabled' };
    return this.change((s, now) => {
      // Anchor to the first click, not the last one, so repeated interest cannot
      // keep postponing the check. No browsing event creates a sale or a reservation.
      if (!s.pending[id] && Object.keys(s.pending).length >= 100) return { queued: false, reason: 'capacity' };
      s.pending[id] ||= now + FRESH;
      return { queued: true, notBefore: s.pending[id] };
    });
  }
  async notice(eventId, kind, ids = []) {
    if (!/^[a-zA-Z0-9:_-]{1,120}$/.test(eventId) || !['tcg-notification', 'square-payment'].includes(kind) ||
      !Array.isArray(ids) || ids.length > 20 || !ids.every(productId)) throw new HttpError(400, 'Invalid notification');
    return this.change((s, now) => {
      const key = kind + ':' + eventId;
      if (s.seen[key]) return { accepted: true, duplicate: true };
      // Reject (rather than silently lose) a burst. The trusted bridge can retry.
      if (Object.keys(s.seen).length >= 2000 || s.notices.length >= 100) throw new HttpError(429, 'Notification queue full');
      s.seen[key] = now;
      if (inventoryEmailEnabled(this.env)) s.notices.push({ key, kind });
      if (kind === 'tcg-notification') {
        s.hintDue ||= Math.max(now + 1000, s.hintAfter || 0);
        if (this.env.LISTING_CHECKS_ENABLED === 'true') for (const id of ids) {
          if (s.pending[id] || Object.keys(s.pending).length < 100) s.pending[id] ||= now + 1000;
        }
      }
      return { accepted: true, duplicate: false };
    });
  }
  async alarm() {
    // Lease due work before yielding; a crash leaves it eligible for retry. At
    // most three 12-second reads per alarm, with no perpetual background polling.
    const work = await this.change((s, now) => {
      const ids = Object.entries(s.pending).filter(([, at]) => at <= now).slice(0, 3).map(([id]) => id);
      for (const id of ids) s.pending[id] = now + 60000;
      const hint = s.hintDue && s.hintDue <= now;
      if (hint) s.hintDue = now + 60000;
      if (!s.digest && s.notices.length && now >= (s.emailAfter || 0)) {
        s.digest = { id: crypto.randomUUID(), notices: s.notices.splice(0), due: now, attempts: 0 };
      }
      const digest = s.digest?.due <= now ? structuredClone(s.digest) : null;
      if (digest) s.digest.due = now + 60000;
      return { ids, hint, digest };
    });
    for (const id of work.ids) {
      await this.check(id);
      // A failed public read remains unknown. Don't retry forever in the absence
      // of visitors; the next visit or daily import can recover it.
      await this.change(s => { delete s.pending[id]; });
    }
    if (work.hint) {
      let dispatched = false;
      try { dispatched = !!(await dispatchInventory(this.env)).dispatched; } catch { /* staff can retry */ }
      await appendAlert(this.env, { ch: 'Square', source: 'tcg:notification',
        msg: 'TCGplayer order notification received. Verify the order and reconcile Square / case stock. ' +
          (dispatched ? 'Inventory import requested.' : 'Use Admin Sync now to refresh inventory if needed.') });
      await this.change((s, now) => { s.hintDue = 0; s.hintAfter = now + FRESH; });
    }
    if (work.digest) {
      let sent = false;
      if (inventoryEmailEnabled(this.env)) {
        try {
          const n = work.digest.notices.length;
          const result = await sendEmail(this.env, { subject: 'Top Loaded: inventory review needed',
            text: `${n} sale/payment notification(s) need staff review. Open the website Admin > Channel sync alerts. Verify payment completion and remaining physical stock before changing listings. TCGplayer is NOT updated automatically.`,
            idempotencyKey: 'inventory-digest/' + work.digest.id });
          sent = result.sent;
        } catch { /* bounded retry; staff alerts already exist */ }
      }
      await this.change((s, now) => {
        if (s.digest?.id !== work.digest.id) return;
        if (sent || !inventoryEmailEnabled(this.env) || ++s.digest.attempts >= 3) {
          s.digest = null; s.emailAfter = now + FRESH;
        } else s.digest.due = now + FRESH;
      });
      if (!sent && inventoryEmailEnabled(this.env)) await appendAlert(this.env, { ch: 'TCGplayer', source: 'inventory:email',
        msg: 'Inventory notification email could not be delivered. Review channel alerts here and check the Resend configuration.' });
    }
    await this.change(() => {});
  }
  async fetch(req) {
    try {
      const b = await readJson(req, 4096), path = new URL(req.url).pathname;
      if (path === '/check') return json(await this.check(b.id, Number(b.after) || 0));
      if (path === '/interest') return json(await this.interest(b.id));
      if (path === '/notify') return json(await this.notice(b.eventId, b.kind, b.productIds || []));
      throw new HttpError(404, 'Unknown operation');
    } catch (e) { if (e instanceof HttpError) return json({ error: e.message }, e.status); throw e; }
  }
}
