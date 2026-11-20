import { send, slugExists } from '../_lib.js';

export default async function handler(req, res) {
  const slug = String(req.query?.slug || '').trim().toLowerCase();
  if (!/^[a-z0-9-]{2,24}$/.test(slug)) return send(res, { ok: false, reason: 'invalid' });
  const taken = await slugExists(slug);
  return send(res, { ok: !taken, taken });
}
