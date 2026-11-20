import { json, readJson, sampleCats } from '../_lib.js';

export const config = { runtime: 'nodejs' };

export default async function handler(request) {
  const slug = String(new URL(request.url).searchParams.get('slug') || '').trim().toLowerCase();
  if (!slug) return json({ cat: null }, 400);
  const sample = sampleCats().find((cat) => cat.slug === slug);
  if (sample) return json({ cat: sample });
  const cat = await readJson(`cats/${slug}.json`);
  return json({ cat: cat || null }, cat ? 200 : 404);
}
