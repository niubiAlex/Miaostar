// Cat Planet front store: sample cat + remote cats from API. Lanterns and messages live on the server (social.js).
import { fetchMe, logout as apiLogout, listCats, meCached, openAuthModal } from './auth.js';
import { NEIGHBORS, SAMPLE_CATS } from './cats.js';
import { BRAND, brand, lang, t, toggleLang } from './i18n.js';
import { phaseAt } from '../schedule.js';

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

// Text written in one language carries a translated copy (*Zh / *En); show the reader's.
const pick = (item, field) => item[`${field}${lang() === 'zh' ? 'Zh' : 'En'}`] ?? item[field];

export function localizeMessage(message) {
  return { ...message, from: pick(message, 'from'), text: pick(message, 'text') };
}

export function localized(cat) {
  return {
    ...cat,
    coat: pick(cat, 'coat'),
    story: pick(cat, 'story'),
    timeline: cat.timeline?.map((item) => ({ ...item, text: pick(item, 'text') })),
    messages: (cat.messages ?? []).map(localizeMessage),
  };
}

function displayName(cat) {
  return pick(cat, 'name');
}

function displayOwner(cat) {
  if (lang() === 'zh' && cat.ownerZh) return cat.ownerZh;
  return cat.owner;
}

export function allCats() {
  const bySlug = new Map();
  for (const cat of [...SAMPLE_CATS, ...NEIGHBORS, ...remoteCats]) bySlug.set(cat.slug, cat);
  return [...bySlug.values()].map(localized);
}

export function findCat(slug) {
  return allCats().find((cat) => cat.slug === slug) ?? null;
}

export function slugTaken(slug) {
  return allCats().some((cat) => cat.slug === slug);
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
  if (cat.generating) return { text: lang() === 'zh' ? '坐飞船来喵星的路上' : 'Flying to Cat Planet', out: false };
  const phase = phaseAt(cat.tier, new Date());
  const text = lang() === 'zh'
    ? (phase.out ? '出去玩了' : phase.text)
    : (phase.out ? 'Out playing' : phase.textEn);
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
  return `<span class="footer-brand"><b>${brand()}</b></span>
    <span class="footer-links">
      <a href="/about">${t('footerAbout')}</a>
      <a href="/privacy">${t('privacy')}</a>
      <a href="/terms">${t('terms')}</a>
    </span>`;
}

const PAGE_TITLES_ZH = { 'Send a cat': '送它来喵星', About: '关于', Residents: '居民', Privacy: '隐私说明', Terms: '使用说明' };

export function renderHeader() {
  const [page, site] = document.title.split(' · ');
  if (site === BRAND.en && lang() === 'zh') document.title = `${PAGE_TITLES_ZH[page] ?? page} · ${brand()}`;
  const header = document.getElementById('siteHeader');
  const user = me();
  header.innerHTML = `
    <a class="logo" href="/">
      <span class="logo-en">${brand()}</span>
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

// 留给某只猫的房子：它还没来时空着，别的新猫不会住进去。
const PINNED_HOUSES = { xiaowu: 2 };

// 第 i 间房住谁（下标从 0 开始，空房是 undefined）。内置的猫在前，其余按入住时间，先来的房号小。
export function residentsInOrder() {
  const order = (cat) => (SAMPLE_CATS.some((sample) => sample.slug === cat.slug) ? '' : cat.createdAt || '9');
  const cats = allCats().sort((a, b) => order(a).localeCompare(order(b)));
  const slots = new Array(TOWN_HOUSES);
  for (const cat of cats) {
    const house = PINNED_HOUSES[cat.slug];
    if (house) slots[house - 1] = cat;
  }
  const pinned = new Set(Object.values(PINNED_HOUSES).map((house) => house - 1));
  let next = 0;
  for (const cat of cats) {
    if (PINNED_HOUSES[cat.slug]) continue;
    while (next < TOWN_HOUSES && (pinned.has(next) || slots[next])) next += 1;
    if (next < TOWN_HOUSES) slots[next] = cat;
  }
  return slots;
}

export function addressOf(cat) {
  const index = residentsInOrder().findIndex((other) => other?.slug === cat.slug);
  if (index < 0 || index >= TOWN_HOUSES) return null;
  const house = index + 1;
  return {
    house,
    text: lang() === 'zh' ? `喵城镇 ${house} 号` : `Cat Town No. ${house}`,
    href: `/house/${house}`,
  };
}

export { displayName, displayOwner };
