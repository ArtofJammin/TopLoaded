// GET /health — liveness + which integrations are configured (no secrets leak).
import { squareConfigured } from '../lib/square.js';
import { webhookConfigured, shopCheckoutStatus } from '../lib/readiness.js';
import { claimCheckoutStatus } from '../lib/claim-checkout.js';
export function register(r) {
  r.get('/health', async ({ env }) => ({
    ok: true,
    service: 'toploaded-api',
    apiVersion: 1,
    time: new Date().toISOString(),
    integrations: {
      kv: !!env.KV,
      auth: !!(env.TOKEN_SECRET && (env.STAFF_PIN_HASH || env.ADMIN_PIN_HASH)),
      square: squareConfigured(env),
      squareWebhook: webhookConfigured(env),
      shopCheckout: shopCheckoutStatus(env).ready,
      claimCheckout: claimCheckoutStatus(env).ready,
      saleChecks: !!(env.SALE_CHECK_QUEUE && webhookConfigured(env) && squareConfigured(env)),
      email: !!(env.RESEND_API_KEY && env.EMAIL_FROM),
      github: !!env.GITHUB_TOKEN,
      pokemontcg: !!env.POKEMONTCG_API_KEY,
    },
  }));
}
