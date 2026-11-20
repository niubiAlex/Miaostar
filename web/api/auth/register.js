import {
  emailKey, hashPassword, readBody, readJson, send, sessionCookie, sessionId, writeJson,
} from '../_lib.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, { error: 'Method not allowed' }, 405);
  const body = await readBody(req);
  const email = String(body.email || '').trim().toLowerCase();
  const name = String(body.name || '').trim().slice(0, 32);
  const password = String(body.password || '');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return send(res, { error: 'Invalid email' }, 400);
  if (name.length < 1) return send(res, { error: 'Name required' }, 400);
  if (password.length < 6) return send(res, { error: 'Password must be at least 6 characters' }, 400);

  const id = emailKey(email);
  if (await readJson(`users/${id}.json`)) return send(res, { error: 'Email already registered' }, 409);

  const { salt, hash } = hashPassword(password);
  const user = { id, email, name, salt, hash, createdAt: new Date().toISOString() };
  await writeJson(`users/${id}.json`, user);

  const sid = sessionId();
  await writeJson(`sessions/${sid}.json`, { userId: id, createdAt: new Date().toISOString() });
  return send(res, { user: { id, email, name } }, 201, { 'Set-Cookie': sessionCookie(sid) });
}
