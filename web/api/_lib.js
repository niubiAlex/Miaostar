import { list, put, del, get } from '@vercel/blob';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export const RESERVED = new Set([
  'cats', 'new', 'home', 'me', 'assets', 'src', 'site', 'concepts', 'scripts', 'vendor',
  'api', 'login', 'admin', 'about', 'privacy', 'terms', 'shushu',
]);

const SAMPLE = {
  shushu: {
    slug: 'shushu',
    name: 'Uncle',
    nameZh: '叔叔',
    owner: 'Cat Town',
    ownerZh: '喵城镇',
    ownerId: 'sample-town',
    public: true,
    tier: '299',
    animated: true,
    voice: 'sweet',
    portrait: '/assets/site/cat_sanhua.jpg',
    coat: 'calico',
    planetDay: '2025-09-12',
    story: [],
    timeline: [{ date: '2025-09-12', text: 'Arrived on Cat Planet' }],
    lights: 0,
    messages: [],
  },
};

function token() {
  return process.env.BLOB_READ_WRITE_TOKEN;
}

export async function readJson(pathname, fallback = null) {
  const key = pathname.replace(/^\//, '');
  try {
    const result = await get(key, { access: 'private', token: token() });
    if (!result?.stream) return fallback;
    const text = await new Response(result.stream).text();
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

export async function writeJson(pathname, data) {
  await put(pathname.replace(/^\//, ''), JSON.stringify(data), {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
    token: token(),
  });
}

export async function remove(pathname) {
  const prefix = pathname.replace(/^\//, '');
  const { blobs } = await list({ prefix, limit: 5, token: token() });
  const urls = blobs.filter((b) => b.pathname === prefix).map((b) => b.url);
  if (urls.length) await del(urls, { token: token() });
}

export function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const hash = scryptSync(password, salt, 32).toString('hex');
  return { salt, hash };
}

export function checkPassword(password, salt, hash) {
  const next = scryptSync(password, salt, 32).toString('hex');
  try {
    return timingSafeEqual(Buffer.from(next, 'hex'), Buffer.from(hash, 'hex'));
  } catch {
    return false;
  }
}

export function sessionId() {
  return randomBytes(24).toString('hex');
}

export function emailKey(email) {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex').slice(0, 32);
}

export function send(res, data, status = 200, headers = {}) {
  for (const [key, value] of Object.entries(headers)) res.setHeader(key, value);
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(data));
}

export function parseCookies(req) {
  const raw = req.headers.cookie || '';
  return Object.fromEntries(raw.split(';').map((part) => {
    const [key, ...rest] = part.trim().split('=');
    return [key, decodeURIComponent(rest.join('=') || '')];
  }).filter(([key]) => key));
}

export function sessionCookie(id, maxAge = 60 * 60 * 24 * 30) {
  const secure = process.env.VERCEL ? '; Secure' : '';
  return `catplanet_session=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export async function currentUser(req) {
  const id = parseCookies(req).catplanet_session;
  if (!id) return null;
  const session = await readJson(`sessions/${id}.json`);
  if (!session?.userId) return null;
  const user = await readJson(`users/${session.userId}.json`);
  if (!user) return null;
  return { id: user.id, email: user.email, name: user.name };
}

export async function listBlobs(prefix) {
  const blobs = [];
  let cursor;
  do {
    const page = await list({ prefix, limit: 1000, cursor, token: token() });
    blobs.push(...page.blobs);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return blobs;
}

export const VOICES = ['gentle', 'sweet', 'chatty', 'deep', 'kitten'];

export async function allRemoteCats() {
  const { blobs } = await list({ prefix: 'cats/', limit: 1000, token: token() });
  const cats = [];
  for (const blob of blobs) {
    if (!blob.pathname.endsWith('.json')) continue;
    const cat = await readJson(blob.pathname);
    if (cat) cats.push(cat);
  }
  return cats;
}

// Never send the owner's email to the browser; ownerId is enough to know who owns it.
export function publicCat(cat) {
  if (!cat) return cat;
  const { ownerEmail, ...rest } = cat;
  return rest;
}

export function sampleCats() {
  return [SAMPLE.shushu];
}

export async function slugExists(slug) {
  if (RESERVED.has(slug) || SAMPLE[slug]) return true;
  const cat = await readJson(`cats/${slug}.json`);
  return Boolean(cat);
}

export async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return {};
  }
}
