// 轻量前端存储：示例猫写死；用户送来的猫、点的灯、留言存在本机浏览器。
// 登录：填名字即可，名字和猫的主人一致时，就是主人视角。
import { NEIGHBORS, SAMPLE_CATS } from './cats.js';
import { phaseAt } from '../schedule.js';

const KEYS = { me: 'miaostar:me', cats: 'miaostar:cats', extra: 'miaostar:extra' };
const read = (key, fallback) => JSON.parse(localStorage.getItem(key) ?? 'null') ?? fallback;
const write = (key, value) => localStorage.setItem(key, JSON.stringify(value));

export const BRAND = { zh: '喵星', en: 'Miaostar' };

export const me = () => read(KEYS.me, null);
export const login = (name) => write(KEYS.me, { name });
export const logout = () => localStorage.removeItem(KEYS.me);

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

export function allCats() {
  return [...read(KEYS.cats, []), ...SAMPLE_CATS, ...NEIGHBORS].map(withExtra);
}

export function findCat(slug) {
  return allCats().find((cat) => cat.slug === slug) ?? null;
}

export function slugTaken(slug) {
  return allCats().some((cat) => cat.slug === slug);
}

export function addCat(cat) {
  write(KEYS.cats, [cat, ...read(KEYS.cats, [])]);
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

export const isOwner = (cat) => me()?.name === cat.owner;

export function daysOnPlanet(cat) {
  const start = new Date(`${cat.planetDay}T00:00:00`);
  return Math.max(1, Math.floor((Date.now() - start.getTime()) / 86400000) + 1);
}

export function statusOf(cat) {
  if (cat.generating) return { text: '在来喵星的路上', out: false };
  const phase = phaseAt(cat.tier, new Date());
  return { text: phase.out ? '出去玩了' : phase.text, out: Boolean(phase.out), asleep: Boolean(phase.sleep) };
}

export const formatDate = (date) => {
  const [year, month, day] = date.split('-').map(Number);
  return `${year} 年 ${month} 月 ${day} 日`;
};

export const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

export function cardHtml(cat) {
  const status = statusOf(cat);
  return `<a class="cat-card" href="/${cat.slug}">
    <div class="cat-card-photo"><img src="${cat.portrait}" alt="" loading="lazy" /></div>
    <div class="cat-card-body">
      <div class="cat-card-name">${escapeHtml(cat.name)}</div>
      <div class="cat-card-owner">${escapeHtml(cat.owner)}的猫 · 来喵星第 ${daysOnPlanet(cat)} 天</div>
      <div class="cat-card-status ${status.out ? 'out' : ''}">${escapeHtml(status.text)}</div>
    </div>
  </a>`;
}

export function siteFooter() {
  return `${BRAND.zh} · ${BRAND.en}
    <span class="footer-links">
      <a href="/about">关于</a>
      <a href="/privacy">隐私</a>
      <a href="/terms">使用说明</a>
    </span>`;
}

export function renderHeader() {
  const header = document.getElementById('siteHeader');
  const user = me();
  header.innerHTML = `
    <a class="logo" href="/"><span class="logo-zh">${BRAND.zh}</span><span class="logo-en">${BRAND.en}</span></a>
    <nav>
      <a href="/cats">居民</a>
      <a href="/new">送它来喵星</a>
      <a href="/about">关于</a>
      ${user
        ? `<span class="me">${escapeHtml(user.name)}</span><button type="button" id="logoutButton">退出</button>`
        : '<button type="button" id="loginButton">登录</button>'}
    </nav>`;
  header.querySelector('#loginButton')?.addEventListener('click', () => {
    const name = window.prompt('请写下你的名字。若与猫的主人同名，就能进入主人视角。');
    if (name?.trim()) {
      login(name.trim());
      location.reload();
    }
  });
  header.querySelector('#logoutButton')?.addEventListener('click', () => {
    logout();
    location.reload();
  });
  const footer = document.querySelector('footer');
  if (footer) footer.innerHTML = siteFooter();
}

export const TOWN_HOUSES = 128;

export function residentsInOrder() {
  const userCats = read(KEYS.cats, []).slice().reverse();
  return [...SAMPLE_CATS, ...NEIGHBORS, ...userCats].map(withExtra);
}

export function addressOf(cat) {
  const index = residentsInOrder().findIndex((other) => other.slug === cat.slug);
  if (index < 0 || index >= TOWN_HOUSES) return null;
  const house = index + 1;
  return { house, text: `喵城镇 ${house} 号`, href: `/house/${house}` };
}
