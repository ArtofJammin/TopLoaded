// Admin-only diagnostics: provider reads only; never send email, dispatch a job or create a payment.
import { requireRole } from '../lib/auth.js';
import { rateLimit } from '../lib/ratelimit.js';
import { setupReport } from '../lib/readiness.js';
import { squareConfigured, squareRequest } from '../lib/square.js';
import { loadConfig } from './config.js';

export function register(r) {
  r.get('/setup/status', requireRole('admin'), async ({ env }) => setupReport(env, await loadConfig(env)));
  r.post('/setup/verify', requireRole('admin'), async ({ env, ip }) => {
    await rateLimit(env, `setup:${ip}`, { limit: 3, windowSec: 60 });
    const report = setupReport(env, await loadConfig(env));
    report.probes = await Promise.all([
      (async () => {
        if (!squareConfigured(env)) return { id: 'square', ok: false, detail: 'Square credentials/location are missing.' };
        try {
          const res = await squareRequest(env, 'GET', '/v2/locations/' + encodeURIComponent(env.SQUARE_LOCATION_ID), undefined, { timeoutMs: 5000 });
          const l = res.body?.location;
          if (!res.ok || l?.id !== env.SQUARE_LOCATION_ID || l.status !== 'ACTIVE' || l.currency !== 'USD') return { id: 'square', ok: false, detail: 'Cannot verify an active USD Square location. Check the environment, location ID and permissions.' };
          const cat = await squareRequest(env, 'GET', '/v2/catalog/list?types=ITEM_VARIATION', undefined, { timeoutMs: 5000 });
          return { id: 'square', ok: cat.ok, detail: cat.ok ? 'Active USD location and catalog read verified. Payment, inventory permissions and webhook delivery still need sandbox acceptance.' : 'Location verified; catalog read failed. Check Catalog read permission.' };
        } catch { return { id: 'square', ok: false, detail: 'Square could not be reached. Retry or check environment/credentials.' }; }
      })(),
      (async () => {
        if (!env.GITHUB_TOKEN || !/^[\w.-]+\/[\w.-]+$/.test(env.GITHUB_REPO || '')) return { id: 'github', ok: false, detail: 'GitHub token/repository are missing.' };
        try {
          const url = 'https://api.github.com/repos/' + env.GITHUB_REPO + '/actions/workflows/' + encodeURIComponent(env.GITHUB_WORKFLOW || 'inventory.yml');
          const res = await fetch(url, { headers: { Authorization: 'Bearer ' + env.GITHUB_TOKEN, Accept: 'application/vnd.github+json', 'User-Agent': 'TopLoaded-Setup' }, redirect: 'error', signal: AbortSignal.timeout(5000) });
          const d = res.ok ? await res.json() : null;
          return { id: 'github', ok: d?.state === 'active', detail: d?.state === 'active' ? 'Inventory workflow read verified. No job dispatched; Actions write permission remains to be tested using Sync now.' : 'Workflow unavailable/inactive. Check the repository, workflow name and token permission.' };
        } catch { return { id: 'github', ok: false, detail: 'GitHub verification unavailable. No job was dispatched.' }; }
      })(),
    ]);
    return report;
  });
}
