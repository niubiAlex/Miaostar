import { parseCookies, remove, send, sessionCookie } from '../_lib.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, { error: 'Method not allowed' }, 405);
  const id = parseCookies(req).catplanet_session;
  if (id) await remove(`sessions/${id}.json`);
  return send(res, { ok: true }, 200, { 'Set-Cookie': sessionCookie('', 0) });
}
