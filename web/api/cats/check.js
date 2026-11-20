import { json, slugExists } from '../_lib.js';

export const config = { runtime: 'nodejs' };

export default async function handler(request) {
  const url = new URL(request.url);
  const slug = String(url.searchParams.get('slug') || '').trim().toLowerCase();
  if (!/^[a-z0-9-]{2,24}$/.test(slug)) return json({ ok: false, reason: 'invalid' });
  const taken = await slugExists(slug);
  return json({ ok: !taken, taken });
}
