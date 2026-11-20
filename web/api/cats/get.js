import { readJson, sampleCats, send } from '../_lib.js';

export default async function handler(req, res) {
  const slug = String(req.query?.slug || '').trim().toLowerCase();
  if (!slug) return send(res, { cat: null }, 400);
  const sample = sampleCats().find((cat) => cat.slug === slug);
  if (sample) return send(res, { cat: sample });
  const cat = await readJson(`cats/${slug}.json`);
  return send(res, { cat: cat || null }, cat ? 200 : 404);
}
