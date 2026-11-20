import {
  checkPassword, emailKey, readBody, readJson, send, sessionCookie, sessionId, writeJson,
} from '../_lib.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, { error: 'Method not allowed' }, 405);
  const body = await readBody(req);
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const user = await readJson(`users/${emailKey(email)}.json`);
  if (!user || !checkPassword(password, user.salt, user.hash)) {
    return send(res, { error: 'Email or password incorrect' }, 401);
  }
  const sid = sessionId();
  await writeJson(`sessions/${sid}.json`, { userId: user.id, createdAt: new Date().toISOString() });
  return send(res, { user: { id: user.id, email: user.email, name: user.name } }, 200, {
    'Set-Cookie': sessionCookie(sid),
  });
}
