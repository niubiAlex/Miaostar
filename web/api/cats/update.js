// Owner-only changes to a cat. For now: which voice it has.
import { VOICES, currentUser, publicCat, readBody, readJson, send, writeJson } from '../_lib.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, { error: 'Method not allowed' }, 405);
  const user = await currentUser(req);
  if (!user) return send(res, { error: 'Please log in first' }, 401);
  const body = await readBody(req);
  const slug = String(body.slug || '').trim().toLowerCase();
  const cat = await readJson(`cats/${slug}.json`);
  if (!cat) return send(res, { error: 'Cat not found' }, 404);
  if (cat.ownerId !== user.id) return send(res, { error: 'Not your cat' }, 403);
  if (!VOICES.includes(body.voice)) return send(res, { error: 'Unknown voice' }, 400);
  const next = { ...cat, voice: body.voice };
  await writeJson(`cats/${slug}.json`, next);
  return send(res, { cat: publicCat(next) });
}
