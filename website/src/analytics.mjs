import { readFile } from 'node:fs/promises';

export function validateAnalytics(value) {
  const tracker = new URL(value.tracker);
  if (tracker.protocol !== 'https:' || tracker.username || tracker.password || tracker.search || tracker.hash || tracker.pathname !== '/tracker.js') throw new Error('Crumbs tracker must be an explicit HTTPS /tracker.js URL without credentials or query parameters.');
  const endpoint = new URL(value.endpoint);
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.pathname !== '/api/v1/events') {
    throw new Error('Crumbs endpoint must be the public HTTPS /api/v1/events URL, without credentials or query parameters.');
  }
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(value.site)) throw new Error('Invalid Crumbs website ID.');
  if (!Number.isInteger(value.retentionDays) || value.retentionDays < 1 || value.retentionDays > 730) throw new Error('Confirm the configured Crumbs retention (1–730 days).');
  return { tracker: tracker.href, endpoint: endpoint.href, site: value.site, retentionDays: value.retentionDays };
}

export async function readAnalytics() {
  let text;
  try { text = await readFile(new URL('../.analytics.local.json', import.meta.url), 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  return validateAnalytics(JSON.parse(text));
}
