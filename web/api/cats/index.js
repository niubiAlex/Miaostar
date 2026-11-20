import {
  RESERVED, allRemoteCats, currentUser, json, readJson, sampleCats, slugExists, writeJson,
} from '../_lib.js';

export const config = { runtime: 'nodejs' };

export default async function handler(request) {
  if (request.method === 'GET') {
    const remote = await allRemoteCats();
    const cats = [...remote, ...sampleCats()];
    return json({ cats });
  }

  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const user = await currentUser(request);
  if (!user) return json({ error: 'Please log in first' }, 401);

  const body = await request.json().catch(() => ({}));
  const slug = String(body.slug || '').trim().toLowerCase();
  const name = String(body.name || '').trim().slice(0, 32);
  if (!name) return json({ error: 'Cat name required' }, 400);
  if (!/^[a-z0-9-]{2,24}$/.test(slug)) return json({ error: 'Invalid address' }, 400);
  if (RESERVED.has(slug)) return json({ error: 'Address reserved', taken: true }, 409);
  if (await slugExists(slug)) return json({ error: 'Address already taken', taken: true }, 409);

  const cat = {
    slug,
    name,
    owner: user.name,
    ownerId: user.id,
    ownerEmail: user.email,
    tier: 'free',
    animated: false,
    portrait: body.portrait || '/assets/site/cat_orange.jpg',
    coat: body.coat || '',
    birthday: body.birthday || '',
    homeDay: body.homeDay || '',
    planetDay: body.planetDay || new Date().toISOString().slice(0, 10),
    story: Array.isArray(body.story) ? body.story : [],
    timeline: body.timeline || [{ date: new Date().toISOString().slice(0, 10), text: 'Arrived on Cat Planet' }],
    lights: 0,
    messages: [],
    generating: true,
    createdAt: new Date().toISOString(),
  };
  await writeJson(`cats/${slug}.json`, cat);
  return json({ cat }, 201);
}
