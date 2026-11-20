import {
  checkPassword, emailKey, json, readJson, sessionCookie, sessionId, writeJson,
} from '../_lib.js';

export const config = { runtime: 'nodejs' };

export default async function handler(request) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const body = await request.json().catch(() => ({}));
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const user = await readJson(`users/${emailKey(email)}.json`);
  if (!user || !checkPassword(password, user.salt, user.hash)) {
    return json({ error: 'Email or password incorrect' }, 401);
  }
  const sid = sessionId();
  await writeJson(`sessions/${sid}.json`, { userId: user.id, createdAt: new Date().toISOString() });
  return json({ user: { id: user.id, email: user.email, name: user.name } }, 200, {
    'Set-Cookie': sessionCookie(sid),
  });
}
