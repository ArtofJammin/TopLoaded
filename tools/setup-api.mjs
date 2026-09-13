#!/usr/bin/env node
// Generate a local, secret-free deployment config; never provisions or deploys anything.
import { existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { publicApiConfig } from './site-api-config.mjs';

export function deploymentConfig({ kvId, apiUrl, mode = 'sandbox', saleChecks = false }) {
  if (!/^[a-f0-9]{32}$/i.test(kvId || '')) throw new Error('Supply the real 32-character KV namespace ID.');
  if (!['sandbox', 'production'].includes(mode)) throw new Error('Mode must be sandbox or production.');
  const { apiBase } = publicApiConfig(apiUrl || '');
  if (!apiBase) throw new Error('Supply the final public Worker base URL.');
  const u = new URL(apiBase);
  if (!/^[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev$/.test(u.hostname) || u.pathname !== '/' || u.port) throw new Error('Initial setup requires the account’s direct workers.dev URL, without a path. Custom domains can be configured afterward.');
  const name = u.hostname.split('.')[0];
  const config = {
    name, main: 'src/index.js', compatibility_date: '2026-08-01', workers_dev: true,
    durable_objects: { bindings: [{ name: 'LIVE_CLAIMS', class_name: 'StreamClaims' }] },
    migrations: [{ tag: 'stream-claims-v1', new_sqlite_classes: ['StreamClaims'] }],
    kv_namespaces: [{ binding: 'KV', id: kvId }],
    triggers: { crons: ['0 11 * * *'] },
    vars: {
      SITE_ORIGIN: 'https://artofjammin.github.io', SITE_URL: 'https://artofjammin.github.io/toploaded-demo/',
      SQUARE_ENV: mode, SQUARE_WEBHOOK_URL: apiBase + '/square/webhook',
      CLAIM_CHECKOUT_ENABLED: 'false', SHOP_CHECKOUT_ENABLED: 'false',
      GITHUB_REPO: 'ArtofJammin/toploaded-demo', GITHUB_WORKFLOW: 'inventory.yml', GITHUB_REF: 'main',
      SHIPPING_CENTS: '499', FREE_SHIPPING_CENTS: '10000',
    },
  };
  if (saleChecks) config.queues = {
    producers: [{ binding: 'SALE_CHECK_QUEUE', queue: name + '-sale-checks' }],
    consumers: [{ queue: name + '-sale-checks', max_batch_size: 1, max_batch_timeout: 0, max_concurrency: 1, max_retries: 3, retry_delay: 300, dead_letter_queue: name + '-sale-checks-failed' }],
  };
  return config;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2), value = key => args[args.indexOf(key) + 1];
  if (args.includes('--help') || !args.length) {
    console.log('node tools/setup-api.mjs --kv-id <32-hex-id> --api-url https://toploaded-api.<account>.workers.dev [--mode sandbox|production] [--sale-checks]\nWrites api/wrangler.local.json only. No secrets, cloud resources or payments are created. Never overwrites an existing setup.');
  } else {
    try {
      const known = new Set(['--kv-id','--api-url','--mode','--sale-checks']);
      for (let i=0;i<args.length;i++) { if (!known.has(args[i])) throw new Error('Unknown argument. See --help.'); if(args[i]!=='--sale-checks' && (!args[++i] || args[i].startsWith('--'))) throw new Error('Missing argument value.'); }
      const config = deploymentConfig({ kvId: args.includes('--kv-id') ? value('--kv-id') : '', apiUrl: args.includes('--api-url') ? value('--api-url') : '', mode: args.includes('--mode') ? value('--mode') : 'sandbox', saleChecks: args.includes('--sale-checks') });
      const file = fileURLToPath(new URL('../api/wrangler.local.json', import.meta.url));
      if (existsSync(file)) throw new Error('api/wrangler.local.json already exists. Review/edit it; setup will not overwrite it.');
      writeFileSync(file, JSON.stringify(config, null, 2) + '\n', { flag: 'wx' });
      console.log('Prepared api/wrangler.local.json. Checkout remains disabled. Follow API-CONNECT.md to upload secrets, deploy, test, and connect Pages.');
      if(config.queues)console.log('Create BOTH named queues in this config before deploying. Provisioning is a separate operator action.');
    } catch(e) { console.error(e instanceof TypeError ? 'Invalid API URL. See --help.' : e.message); process.exitCode=1; }
  }
}
