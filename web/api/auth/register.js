import {
  emailKey, hashPassword, json, readJson, sessionCookie, sessionId, writeJson,
} from '../_lib.js';

export const config = { runtime: 'nodejs' };

export default async function handler(request) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const body = await request.json().catch(() => ({}));
  const email = String(body.email || '').trim().toLowerCase();
  const name = String(body.name || '').trim().slice(0, 32);
  const password = String(body.password || '');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Invalid email' }, 400);
  if (name.length < 1) return json({ error: 'Name required' }, 400);
  if (password.length < 6) return json({ error: 'Password must be at least 6 characters' }, 400);

  const id = emailKey(email);
  if (await readJson(`users/${id}.json`)) return json({ error: 'Email already registered' }, 409);

  const { salt, hash } = hashPassword(password);
  const user = { id, email, name, salt, hash, createdAt: new Date().toISOString() };
  await writeJson(`users/${id}.json`, user);

  const sid = sessionId();
  await writeJson(`sessions/${sid}.json`, { userId: id, createdAt: new Date().toISOString() });
  return json({ user: { id, email, name } }, 201, { 'Set-Cookie': sessionCookie(sid) });
}
