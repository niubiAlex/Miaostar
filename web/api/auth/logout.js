import { json, parseCookies, remove, sessionCookie } from '../_lib.js';

export const config = { runtime: 'nodejs' };

export default async function handler(request) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const id = parseCookies(request).catplanet_session;
  if (id) await remove(`sessions/${id}.json`);
  return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie('', 0) });
}
