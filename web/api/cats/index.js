import {
  RESERVED, VOICES, allRemoteCats, currentUser, publicCat, readBody, sampleCats, send, slugExists, writeBinary, writeJson,
} from '../_lib.js';
import { translateCat } from '../_translate.js';

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

  // 照片原图单独存，生成小屋时脚本来取；猫的资料里只留数量。
  const photos = (Array.isArray(body.photos) ? body.photos : []).slice(0, 5)
    .map((photo) => String(photo).match(/^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/)?.[1])
    .filter(Boolean)
    .map((data) => Buffer.from(data, 'base64'))
    .filter((data) => data.length > 0 && data.length <= 2_000_000);
  await Promise.all(photos.map((data, index) => writeBinary(`photos/${slug}/${index + 1}.jpg`, data, 'image/jpeg')));

  const cat = await translateCat({
    slug,
    name,
    owner: user.name,
    ownerId: user.id,
    ownerEmail: user.email,
    tier: 'free',
    animated: false,
    voice: VOICES.includes(body.voice) ? body.voice : 'gentle',
    portrait: body.portrait || '/assets/site/cat_orange.jpg',
    birthday: body.birthday || '',
    homeDay: body.homeDay || '',
    planetDay: body.planetDay || new Date().toISOString().slice(0, 10),
    coat: String(body.coat || '').slice(0, 20),
    story: (Array.isArray(body.story) ? body.story : []).map((paragraph) => String(paragraph).slice(0, 2000)).slice(0, 20),
    timeline: (Array.isArray(body.timeline) ? body.timeline : [{ date: new Date().toISOString().slice(0, 10), text: 'Arrived on Cat Planet' }])
      .slice(0, 10).map((item) => ({ date: String(item.date || '').slice(0, 10), text: String(item.text || '').slice(0, 80) })),
    lights: 0,
    messages: [],
    photoCount: photos.length,
    generating: true,
    createdAt: new Date().toISOString(),
  }, req);
  await writeJson(`cats/${slug}.json`, cat);
  return send(res, { cat: publicCat(cat) }, 201);
}
