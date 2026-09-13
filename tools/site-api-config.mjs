// Public deployment setting only. Never accept credentials in this file or URL.
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
export function publicApiConfig(value = '') {
  if (!value.trim()) return { version: 1, apiBase: '' };
  const u = new URL(value.trim());
  if (u.protocol !== 'https:' || u.username || u.password || u.search || u.hash || /REPLACE|example\./i.test(u.href) || ['localhost','127.0.0.1','[::1]'].includes(u.hostname)) throw new Error('TL_API_URL must be the public HTTPS Worker base URL, without credentials, query, or fragment.');
  return { version: 1, apiBase: u.href.replace(/\/+$/, '') };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { writeFileSync(process.argv[2] || '_site/api-config.json', JSON.stringify(publicApiConfig(process.env.TL_API_URL || ''), null, 2) + '\n'); }
  catch { console.error('Invalid TL_API_URL or output path. Use an HTTPS Worker base URL with no secrets.'); process.exitCode = 1; }
}
