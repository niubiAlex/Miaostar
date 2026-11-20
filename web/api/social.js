// Lanterns and messages for one cat, shared by everyone.
// Each lantern and each message is its own blob, so two visitors writing at once never overwrite each other.
import { randomBytes } from 'node:crypto';
import {
  currentUser, listBlobs, parseCookies, readBody, readJson, sampleCats, send, writeJson,
} from './_lib.js';
import { translateMessage } from './_translate.js';

const MESSAGE_MAX = 120;
const MESSAGES_SHOWN = 60;
const MESSAGE_GAP_MS = 10000;

async function findCat(slug) {
  return sampleCats().find((cat) => cat.slug === slug) ?? readJson(`cats/${slug}.json`);
}

// Logged-in people light once per account; everyone else once per browser.
function visitor(req, res) {
  let id = parseCookies(req).catplanet_visitor;
  if (!/^[a-f0-9]{32}$/.test(id || '')) {
    id = randomBytes(16).toString('hex');
    const secure = process.env.VERCEL ? '; Secure' : '';
    res.setHeader('set-cookie', `catplanet_visitor=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 365 * 5}${secure}`);
  }
  return id;
}

const lightKey = (slug, user, visitorId) => `lights/${slug}/${user ? `u-${user.id}` : `v-${visitorId}`}.json`;

// Listing is up to date right after a write; reading a just-written blob back may not be yet.
async function snapshot(slug, user, visitorId, fresh = {}) {
  const [lightBlobs, blobs] = await Promise.all([listBlobs(`lights/${slug}/`), listBlobs(`messages/${slug}/`)]);
  const mine = lightKey(slug, user, visitorId);
  const lights = lightBlobs.length;
  const lit = lightBlobs.some((blob) => blob.pathname === mine);
  const recent = blobs.map((blob) => blob.pathname).sort().slice(-MESSAGES_SHOWN);
  const messages = (await Promise.all(recent.map((pathname) => fresh[pathname] ?? readJson(pathname)))).filter(Boolean)
    .map(({ fromId, ...message }) => ({ ...message, mine: Boolean(user && fromId === user.id) }));
  return { lights, lit, messages };
}

export default async function handler(req, res) {
  const slug = String(req.query?.slug || '').trim().toLowerCase();
  const cat = /^[a-z0-9-]{2,24}$/.test(slug) ? await findCat(slug) : null;
  if (!cat) return send(res, { error: 'Cat not found' }, 404);
  const user = await currentUser(req);
  const visitorId = visitor(req, res);

  if (req.method === 'GET') return send(res, await snapshot(slug, user, visitorId));
  if (req.method !== 'POST') return send(res, { error: 'Method not allowed' }, 405);

  const body = await readBody(req);
  if (body.action === 'light') {
    const key = lightKey(slug, user, visitorId);
    const already = (await listBlobs(key)).some((blob) => blob.pathname === key);
    if (!already) await writeJson(key, { at: new Date().toISOString() });
    return send(res, await snapshot(slug, user, visitorId));
  }

  if (body.action === 'message') {
    if (!user) return send(res, { error: 'Please log in first' }, 401);
    const text = String(body.text || '').trim().slice(0, MESSAGE_MAX);
    if (!text) return send(res, { error: 'Message is empty' }, 400);
    const gateKey = `ratelimit/messages/${user.id}.json`;
    const last = (await listBlobs(gateKey)).find((blob) => blob.pathname === gateKey);
    if (last && Date.now() - new Date(last.uploadedAt).getTime() < MESSAGE_GAP_MS) return send(res, { error: 'Too fast' }, 429);
    await writeJson(gateKey, { at: Date.now() });

    const now = new Date();
    const message = await translateMessage({
      from: user.name, fromId: user.id, text, at: now.toISOString().slice(0, 10),
    }, req, cat);
    const pathname = `messages/${slug}/${now.toISOString()}-${randomBytes(3).toString('hex')}.json`;
    await writeJson(pathname, message);
    return send(res, await snapshot(slug, user, visitorId, { [pathname]: message }), 201);
  }

  return send(res, { error: 'Unknown action' }, 400);
}
