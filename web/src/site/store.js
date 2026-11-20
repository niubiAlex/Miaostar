// Cat Planet front store: sample cat + remote cats from API; lanterns/messages still local for now.
import { fetchMe, logout as apiLogout, listCats, meCached, openAuthModal } from './auth.js';
import { NEIGHBORS, SAMPLE_CATS } from './cats.js';
import { BRAND, lang, t, toggleLang } from './i18n.js';
import { phaseAt } from '../schedule.js';

const KEYS = { extra: 'catplanet:extra' };
const read = (key, fallback) => JSON.parse(localStorage.getItem(key) ?? 'null') ?? fallback;
const write = (key, value) => localStorage.setItem(key, JSON.stringify(value));

let remoteCats = [];
let ready = null;

export { BRAND };

export function me() {
  return meCached();
}

export async function ensureAuth() {
  ready ??= (async () => {
    await fetchMe();
    try {
      remoteCats = await listCats();
    } catch {
      remoteCats = [...SAMPLE_CATS];
    }
  })();
  await ready;
  return me();
}

export async function loginPrompt() {
  return openAuthModal({ mode: 'login' });
}

export async function logout() {
  await apiLogout();
}

function extraFor(slug) {
  return read(KEYS.extra, {})[slug] ?? { lights: 0, lit: false, messages: [] };
}

function saveExtra(slug, extra) {
  const all = read(KEYS.extra, {});
  all[slug] = extra;
  write(KEYS.extra, all);
}

function withExtra(cat) {
  const extra = extraFor(cat.slug);
  return {
    ...cat,
    lights: (cat.lights ?? 0) + extra.lights,
    lit: extra.lit,
    messages: [...(cat.messages ?? []), ...extra.messages],
  };
}

function displayName(cat) {
  if (lang() === 'zh' && cat.nameZh) return cat.nameZh;
  return cat.name;
}

function displayOwner(cat) {
  if (lang() === 'zh' && cat.ownerZh) return cat.ownerZh;
  return cat.owner;
}

export function allCats() {
  const bySlug = new Map();
  for (const cat of [...SAMPLE_CATS, ...NEIGHBORS, ...remoteCats]) bySlug.set(cat.slug, cat);
  return [...bySlug.values()].map(withExtra);
}

export function findCat(slug) {
  return allCats().find((cat) => cat.slug === slug) ?? null;
}

export function slugTaken(slug) {
  return allCats().some((cat) => cat.slug === slug);
}

export function lightCandle(slug) {
  const extra = extraFor(slug);
  if (extra.lit) return;
  saveExtra(slug, { ...extra, lights: extra.lights + 1, lit: true });
}

export function leaveMessage(slug, from, text) {
  const extra = extraFor(slug);
  const at = new Date().toISOString().slice(0, 10);
  saveExtra(slug, { ...extra, messages: [...extra.messages, { from, text, at }] });
}

export const isOwner = (cat) => {
  const user = me();
  if (!user || !cat) return false;
  if (cat.ownerId && user.id) return cat.ownerId === user.id;
  return user.name === cat.owner;
};

export function daysOnPlanet(cat) {
  const start = new Date(`${cat.planetDay}T00:00:00`);
  return Math.max(1, Math.floor((Date.now() - start.getTime()) / 86400000) + 1);
}

export function statusOf(cat) {
  if (cat.generating) return { text: lang() === 'zh' ? '在来喵星的路上' : 'On the way to Cat Planet', out: false };
  const phase = phaseAt(cat.tier, new Date());
  const text = lang() === 'zh'
    ? (phase.out ? '出去玩了' : phase.text)
    : (phase.out ? 'Out playing' : phase.text);
  return { text, out: Boolean(phase.out), asleep: Boolean(phase.sleep) };
}

export const formatDate = (date) => {
  const [year, month, day] = date.split('-').map(Number);
  return lang() === 'zh' ? `${year} 年 ${month} 月 ${day} 日` : `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

export const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

export function cardHtml(cat) {
  const status = statusOf(cat);
  const name = displayName(cat);
  const owner = displayOwner(cat);
  const dayLabel = lang() === 'zh'
    ? `来喵星第 ${daysOnPlanet(cat)} 天`
    : `Day ${daysOnPlanet(cat)} on Cat Planet`;
  return `<a class="cat-card" href="/${cat.slug}">
    <div class="cat-card-photo"><img src="${cat.portrait}" alt="" loading="lazy" /></div>
    <div class="cat-card-body">
      <div class="cat-card-name">${escapeHtml(name)}</div>
      <div class="cat-card-owner">${escapeHtml(owner)}${lang() === 'zh' ? '的猫' : "'s cat"} · ${dayLabel}</div>
      <div class="cat-card-status ${status.out ? 'out' : ''}">${escapeHtml(status.text)}</div>
    </div>
  </a>`;
}

export function siteFooter() {
  return `<span class="footer-brand"><b>Cat Planet</b> · 喵星</span>
    <span class="footer-links">
      <a href="/about">${t('footerAbout')}</a>
      <a href="/privacy">${t('privacy')}</a>
      <a href="/terms">${t('terms')}</a>
    </span>`;
}

export function renderHeader() {
  const header = document.getElementById('siteHeader');
  const user = me();
  header.innerHTML = `
    <a class="logo" href="/">
      <span class="logo-en">Cat Planet</span>
      <span class="logo-zh">喵星</span>
    </a>
    <nav>
      <a href="/cats">${t('residents')}</a>
      <a href="/new">${t('send')}</a>
      <a href="/about">${t('about')}</a>
      <button type="button" id="langButton" class="ghost-nav">${t('langSwitch')}</button>
      ${user
        ? `<span class="me">${escapeHtml(user.name)}</span><button type="button" id="logoutButton">${t('logout')}</button>`
        : `<button type="button" id="loginButton">${t('login')}</button>`}
    </nav>`;
  header.querySelector('#langButton')?.addEventListener('click', () => toggleLang());
  header.querySelector('#loginButton')?.addEventListener('click', () => openAuthModal({ mode: 'login' }));
  header.querySelector('#logoutButton')?.addEventListener('click', async () => {
    await logout();
    location.reload();
  });
  const footer = document.querySelector('footer');
  if (footer) footer.innerHTML = siteFooter();
}

export const TOWN_HOUSES = 128;

export function residentsInOrder() {
  return allCats();
}

export function addressOf(cat) {
  const index = residentsInOrder().findIndex((other) => other.slug === cat.slug);
  if (index < 0 || index >= TOWN_HOUSES) return null;
  const house = index + 1;
  return {
    house,
    text: lang() === 'zh' ? `喵城镇 ${house} 号` : `Cat Town No. ${house}`,
    href: `/house/${house}`,
  };
}

export { displayName, displayOwner };
