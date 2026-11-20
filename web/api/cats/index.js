import {
  RESERVED, allRemoteCats, currentUser, publicCat, readBody, sampleCats, send, slugExists, writeJson,
} from '../_lib.js';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const remote = await allRemoteCats();
    return send(res, { cats: [...remote.map(publicCat), ...sampleCats()] });
  }

  if (req.method !== 'POST') return send(res, { error: 'Method not allowed' }, 405);
  const user = await currentUser(req);
  if (!user) return send(res, { error: 'Please log in first' }, 401);

  const body = await readBody(req);
  const slug = String(body.slug || '').trim().toLowerCase();
  const name = String(body.name || '').trim().slice(0, 32);
  if (!name) return send(res, { error: 'Cat name required' }, 400);
  if (!/^[a-z0-9-]{2,24}$/.test(slug)) return send(res, { error: 'Invalid address' }, 400);
  if (RESERVED.has(slug)) return send(res, { error: 'Address reserved', taken: true }, 409);
  if (await slugExists(slug)) return send(res, { error: 'Address already taken', taken: true }, 409);

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
  return send(res, { cat: publicCat(cat) }, 201);
}
