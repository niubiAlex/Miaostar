// 喵星：一层套一层的画。最外是云海和喵星的地平线，往里是田园，正中是我们的喵城镇：
// 中间是大家的广场（思念湖、瞭望塔、纸箱山），居民猫在上面走来走去；四周散落着每只猫自己的小屋，点小屋去它家。
// 滚轮、双指可以缩放，最远到整颗喵星铺满屏幕为止。
// 一进来是整颗喵星，一路推近到城镇，再落到广场上。
// 地址：/ 是广场，/house/12 是飞到 12 号屋并让它亮一下，之间飞过去不换页。
import { runLoading } from './loading.js';
import { lang, t } from './i18n.js';
import { hideCards, mountSpots } from './scene.js';
import {
  allCats, daysOnPlanet, displayName, displayOwner, ensureAuth, isOwner, renderHeader, residentsInOrder, statusOf, TOWN_HOUSES,
} from './store.js';
import { startTownCats } from './town-cats.js';

await ensureAuth();
await runLoading({ minMs: 2600 });

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const view = document.getElementById('worldView');
const canvas = document.getElementById('worldCanvas');
const panel = document.getElementById('worldPanel');
const nav = document.getElementById('worldNav');
const [town, houses] = await Promise.all(['/assets/world/town.json', '/assets/world/houses.json']
  .map(async (path) => (await fetch(path)).json()));
const [WORLD_W, WORLD_H] = town.size;
Object.assign(canvas.style, { width: `${WORLD_W}px`, height: `${WORLD_H}px` });
if (houses.length !== TOWN_HOUSES) console.warn(`houses.json 有 ${houses.length} 间房，store.js 的 TOWN_HOUSES 是 ${TOWN_HOUSES}`);

// 坐标都按整座城镇那张图的像素：外面两层的左上角是负数，城镇中心的高清层在里面。
const placeAt = (element, [x, y, w, h]) => Object.assign(element.style, {
  left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px`,
});
// 由外到里：每一层，和刚好盖住它中间的那一层（边缘渐隐的部分不算盖住）。
const FADE = { x: 0.07, y: 0.1 }; // 和 register_ghibli.py 的 EDGE 一致
const layers = [...canvas.querySelectorAll('.world-layer')].map((element) => {
  const rect = town.outer[element.dataset.layer].rect;
  placeAt(element, rect);
  return { element, rect };
});
const OUTER = layers[0].rect;
const covers = [...layers.slice(1).map((layer) => layer.rect), [0, 0, WORLD_W, WORLD_H]]
  .map(([x, y, w, h]) => [x + w * FADE.x, y + h * FADE.y, w * (1 - 2 * FADE.x), h * (1 - 2 * FADE.y)]);
// 城镇里两层高清细节（第一圈和中心），放大时淡入。
const details = [...canvas.querySelectorAll('.town-detail')].map((element) => {
  placeAt(element, town.detail[element.dataset.layer].rect);
  return element;
});
const CENTER = town.detail.center.rect;
const fromCenter = ([x, y, w = 0, h = 0]) => {
  const unit = CENTER[2] / 3840;
  return [CENTER[0] + x * unit, CENTER[1] + y * unit, w * unit, h * unit];
};
// 广场：思念湖四周的草坪，连上瞭望塔、毛线球和纸箱山（高清中心的像素）。
const PLAZA = fromCenter([1300, 400, 1150, 890]);

renderHeader();
const cats = allCats();
const residents = residentsInOrder();

// ---------- 画里能点的地方：每间小屋，和广场上的几个地标 ----------
const spotLayer = document.createElement('div');
spotLayer.className = 'town-spots';
canvas.append(spotLayer);
const fraction = ([x, y, w, h]) => ({ x: x / WORLD_W, y: y / WORLD_H, w: w / WORLD_W, h: h / WORLD_H });

function houseSpots() {
  const zh = lang() === 'zh';
  return houses.map((box, index) => {
    const cat = residents[index];
    const number = index + 1;
    const id = `h${number}`;
    if (!cat) {
      return { ...fraction(box), id, kind: 'house empty', href: '/new',
        title: zh ? `${number} 号 · 空屋` : `No. ${number} · Empty`,
        lines: [zh ? '等一只猫搬进来' : 'Waiting for a cat'], action: t('sendHere') };
    }
    const name = displayName(cat);
    const owner = displayOwner(cat);
    return {
      ...fraction(box), id, kind: `house${isOwner(cat) ? ' mine' : ''}`, href: `/${cat.slug}`, image: cat.portrait,
      title: zh
        ? `${number} 号 · ${name}${isOwner(cat) ? '（你的猫）' : ''}`
        : `No. ${number} · ${name}${isOwner(cat) ? ' (yours)' : ''}`,
      lines: [
        zh ? `${owner}的猫 · 来喵星第 ${daysOnPlanet(cat)} 天` : `${owner}'s cat · Day ${daysOnPlanet(cat)}`,
        statusOf(cat).text,
      ],
      action: zh ? '去它家看看' : 'Visit home',
    };
  });
}

function landmarkSpots() {
  const zh = lang() === 'zh';
  const lights = cats.reduce((sum, cat) => sum + (cat.lights ?? 0), 0);
  return [
    { ...fraction(fromCenter([2122, 594, 278, 244])), href: '/new', title: zh ? '纸箱山' : 'Cardboard Hill',
      lines: zh ? ['新来的猫，都是坐纸箱来的', '送你的猫来喵星'] : ['New cats arrive in boxes', 'Send your cat to Cat Planet'],
      action: t('send') },
    { ...fraction(fromCenter([1855, 397, 197, 290])), href: '/cats', title: zh ? '瞭望塔' : 'Lookout Tower',
      lines: [zh ? `在塔上看看所有 ${cats.length} 位居民` : `See all ${cats.length} residents`],
      action: zh ? '看看所有居民' : 'See residents' },
    { ...fraction(fromCenter([1623, 880, 591, 200])), href: '/cats', title: zh ? '思念湖' : 'Lake of Remembrance',
      lines: zh
        ? [`湖上漂着 ${lights} 盏灯，都是大家为猫点的`, '随便去看一只猫，为它点一盏']
        : [`${lights} lanterns float here`, 'Visit a cat and light one'],
      action: zh ? '随便去看一只猫' : 'Visit a cat',
      onClick: () => {
        location.href = `/${cats[Math.floor(Math.random() * cats.length)].slug}`;
      } },
  ];
}
mountSpots(spotLayer, [...houseSpots(), ...landmarkSpots()]);

// ---------- 广场上的猫 ----------
const catLayer = document.createElement('div');
catLayer.className = 'town-cats';
canvas.append(catLayer);
let townCats = null;

// ---------- 镜头 ----------
// 镜头 = 视口中心对着整张图的哪一点 (x, y)，和放大倍数 z（屏幕像素 / 整张图像素）。
let camera = { x: WORLD_W / 2, y: WORLD_H / 2, z: 0.02 };
let flight = null;

const viewSize = () => ({ width: view.clientWidth, height: view.clientHeight });
const overviewZoom = () => {
  const { width, height } = viewSize();
  return Math.min(width / WORLD_W, height / WORLD_H);
};

// 最远：整颗喵星刚好铺满视口；最近：高清中心的一个像素放大到两个半屏幕像素。
const minZoom = () => {
  const { width, height } = viewSize();
  return Math.max(width / OUTER[2], height / OUTER[3]);
};
const maxZoom = () => 2.5 / (CENTER[2] / 3840);

// 用户自己拖、缩放时，镜头不能跑出最外一层。
function clampCamera({ x, y, z }) {
  const { width, height } = viewSize();
  const zoom = Math.min(Math.max(z, minZoom()), maxZoom());
  const halfW = width / 2 / zoom;
  const halfH = height / 2 / zoom;
  return {
    x: Math.min(Math.max(x, OUTER[0] + halfW), OUTER[0] + OUTER[2] - halfW),
    y: Math.min(Math.max(y, OUTER[1] + halfH), OUTER[1] + OUTER[3] - halfH),
    z: zoom,
  };
}

function render() {
  const { width, height } = viewSize();
  const { x, y, z } = camera;
  canvas.style.transform = `translate3d(${width / 2 - x * z}px, ${height / 2 - y * z}px, 0) scale(${z})`;
  // 远处看不清城镇里的东西：高清层、小屋和猫在放大到城镇全景的一半时才淡入。
  const near = Math.min(Math.max((z / overviewZoom() - 0.3) / 0.3, 0), 1);
  canvas.style.setProperty('--detail', near);
  for (const element of details) element.classList.toggle('off', near === 0);
  // 猫在屏幕上小于十来个像素就看不清了，不画也不放视频。
  const catsVisible = z * PLAZA[2] > 260;
  catLayer.classList.toggle('off', !catsVisible);
  townCats?.setPaused(!catsVisible || document.hidden);
  // 里一层已经铺满整个视口时，外面的层看不到，不用画。
  const seen = [x - width / 2 / z, y - height / 2 / z, x + width / 2 / z, y + height / 2 / z];
  layers.forEach((layer, index) => {
    const hidden = covers.slice(index).some(([left, top, w, h]) => left <= seen[0] && top <= seen[1]
      && left + w >= seen[2] && top + h >= seen[3]);
    layer.element.classList.toggle('off', hidden);
  });
}
document.addEventListener('visibilitychange', render);

// 把一块区域（整张图的像素）放进视口里没被文字和按钮挡住的部分。
function fit([left, top, width, height], insets) {
  const view = viewSize();
  const free = { width: view.width - insets.left - insets.right, height: view.height - insets.top - insets.bottom };
  const z = Math.min(free.width / width, free.height / height);
  const offsetX = insets.left + free.width / 2 - view.width / 2;
  const offsetY = insets.top + free.height / 2 - view.height / 2;
  return { x: left + width / 2 - offsetX / z, y: top + height / 2 - offsetY / z, z };
}

// 平滑缩放（van Wijk & Nuij）：远的两点之间先拉远、再平移、再推近，看起来一直在同一个世界里飞。
function zoomPath(from, to) {
  const rho = 1.4;
  const { width } = viewSize();
  const [x0, y0, w0] = [from.x, from.y, width / from.z];
  const [x1, y1, w1] = [to.x, to.y, width / to.z];
  const dx = x1 - x0;
  const dy = y1 - y0;
  const d2 = dx * dx + dy * dy;
  const at = (x, y, w) => ({ x, y, z: width / w });
  if (d2 < 1e-6) {
    const S = Math.log(w1 / w0) / rho;
    return { length: Math.abs(S), at: (t) => at(x0 + t * dx, y0 + t * dy, w0 * Math.exp(rho * t * S)) };
  }
  const d1 = Math.sqrt(d2);
  const b0 = (w1 * w1 - w0 * w0 + rho ** 4 * d2) / (2 * w0 * rho * rho * d1);
  const b1 = (w1 * w1 - w0 * w0 - rho ** 4 * d2) / (2 * w1 * rho * rho * d1);
  const r0 = Math.log(Math.sqrt(b0 * b0 + 1) - b0);
  const r1 = Math.log(Math.sqrt(b1 * b1 + 1) - b1);
  const S = (r1 - r0) / rho;
  return {
    length: S,
    at: (t) => {
      const s = t * S;
      const u = (w0 / (rho * rho * d1)) * (Math.cosh(r0) * Math.tanh(rho * s + r0) - Math.sinh(r0));
      return at(x0 + u * dx, y0 + u * dy, (w0 * Math.cosh(r0)) / Math.cosh(rho * s + r0));
    },
  };
}

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

function flyTo(target, { duration } = {}) {
  if (flight) flight.cancel();
  hideCards();
  if (reducedMotion) {
    camera = target;
    render();
    return Promise.resolve();
  }
  const path = zoomPath(camera, target);
  const time = duration ?? Math.min(Math.max(path.length * 620, 900), 2600);
  view.classList.add('moving');
  return new Promise((resolve) => {
    const start = performance.now();
    let frame = 0;
    const done = () => {
      view.classList.remove('moving');
      flight = null;
      resolve();
    };
    const step = (now) => {
      const t = Math.min((now - start) / time, 1);
      camera = path.at(ease(t));
      render();
      if (t < 1) frame = requestAnimationFrame(step);
      else done();
    };
    flight = { cancel: () => { cancelAnimationFrame(frame); done(); } };
    frame = requestAnimationFrame(step);
  });
}

// ---------- 地方：广场、某间小屋、全景 ----------
let place = null;

function parse(pathname) {
  const match = pathname.match(/^\/house\/(\d+)\/?$/);
  if (match) return { kind: 'house', number: Math.min(Math.max(Number(match[1]), 1), houses.length) };
  return { kind: 'plaza' };
}

const pathOf = (target) => (target.kind === 'house' ? `/house/${target.number}` : '/');

function describe(target) {
  if (target.kind !== 'house') {
    document.title = '喵星 · 每一只离开的猫，都去了喵星';
    return;
  }
  const cat = residents[target.number - 1];
  document.title = `喵城镇 ${target.number} 号 · 喵星`;
  const zh = lang() === 'zh';
  document.getElementById('houseName').textContent = cat
    ? (zh ? `${target.number} 号 · ${displayName(cat)}` : `No. ${target.number} · ${displayName(cat)}`)
    : (zh ? `${target.number} 号 · 空屋` : `No. ${target.number} · Empty`);
  document.getElementById('houseLine').textContent = cat
    ? (zh
      ? `${displayOwner(cat)}的猫 · 来喵星第 ${daysOnPlanet(cat)} 天 · ${statusOf(cat).text}`
      : `${displayOwner(cat)}'s cat · Day ${daysOnPlanet(cat)} · ${statusOf(cat).text}`)
    : t('emptyLine');
  const link = document.getElementById('houseLink');
  link.href = cat ? `/${cat.slug}` : '/new';
  link.textContent = cat
    ? (zh ? `去${displayName(cat)}家看看` : `Visit ${displayName(cat)}`)
    : t('sendHere');
}

function updateLinks(target) {
  nav.querySelector('[data-go="plaza"]').hidden = target.kind === 'plaza';
  nav.querySelector('[data-go="overview"]').hidden = target.kind === 'overview';
}

// 视口里被挡住的部分：桌面上左边是说明文字，手机上上面是文字；底下是按钮。
function insets(target) {
  const { width, height } = viewSize();
  const navHeight = nav.getBoundingClientRect().height + 16;
  const box = panel.getBoundingClientRect();
  const outer = view.getBoundingClientRect();
  if (width > 860 && target.kind !== 'overview') {
    return { left: box.right - outer.left + 16, right: 16, top: 16, bottom: navHeight };
  }
  return { left: 0, right: 0, top: Math.min(box.bottom - outer.top + 4, height * 0.45), bottom: navHeight };
}

function cameraFor(target) {
  if (target.kind === 'overview') return fit([0, 0, WORLD_W, WORLD_H], insets(target));
  if (target.kind === 'house') {
    const [x, y, w, h] = houses[target.number - 1];
    return fit([x + w / 2 - w * 4.5, y + h / 2 - h * 3.2, w * 9, h * 6.4], insets(target));
  }
  return fit(PLAZA, insets(target));
}

function showPanel(target) {
  panel.dataset.place = target.kind;
  describe(target);
  updateLinks(target);
}

async function go(target, { animate = true } = {}) {
  place = target;
  panel.classList.remove('shown');
  showPanel(target);
  const destination = cameraFor(target);
  if (!animate) {
    camera = destination;
    render();
  } else {
    await flyTo(destination);
  }
  if (place !== target) return;
  panel.classList.add('shown');
  flashHouse();
}

function flashHouse() {
  const number = place?.kind === 'house' ? place.number : Number(location.hash.match(/^#h(\d+)$/)?.[1]);
  const house = number && spotLayer.querySelector(`#h${number}`);
  if (!house) return;
  house.classList.remove('flash');
  void house.offsetWidth;
  house.classList.add('flash');
}

function navigate(path) {
  history.pushState(null, '', path);
  go(parse(path));
}

// 站内去广场、去某间小屋的链接都不换页，直接飞过去。
document.addEventListener('click', (event) => {
  const link = event.target.closest('a[href]');
  if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
  const url = new URL(link.href, location.href);
  if (url.origin !== location.origin || !/^\/(house\/\d+\/?)?$/.test(url.pathname)) return;
  event.preventDefault();
  if (dragged) return;
  navigate(url.pathname);
});
nav.querySelector('[data-go="overview"]').addEventListener('click', () => {
  place = { kind: 'overview' };
  panel.classList.remove('shown');
  showPanel(place);
  flyTo(cameraFor(place)).then(() => panel.classList.add('shown'));
});
addEventListener('popstate', () => go(parse(location.pathname)));
addEventListener('resize', () => {
  if (!flight && place) {
    camera = cameraFor(place);
    render();
  }
});

// ---------- 拖着看、滚轮和双指缩放 ----------
// 屏幕上的一点 (clientX, clientY) 对着整张图的哪里。
function worldPoint(clientX, clientY) {
  const box = view.getBoundingClientRect();
  const { width, height } = viewSize();
  return { x: camera.x + (clientX - box.left - width / 2) / camera.z, y: camera.y + (clientY - box.top - height / 2) / camera.z };
}

// 缩放到 z，屏幕上 (clientX, clientY) 那一点对着的地方不动。
function zoomAround(clientX, clientY, z) {
  const anchor = worldPoint(clientX, clientY);
  const zoom = Math.min(Math.max(z, minZoom()), maxZoom());
  camera = clampCamera({
    x: anchor.x - (anchor.x - camera.x) * (camera.z / zoom),
    y: anchor.y - (anchor.y - camera.y) * (camera.z / zoom),
    z: zoom,
  });
  render();
}

function takeOver() {
  if (flight) flight.cancel();
  hideCards();
}

let settleTimer = 0;
view.addEventListener('wheel', (event) => {
  event.preventDefault();
  if (view.classList.contains('intro')) return;
  takeOver();
  // 触控板双指捏合时浏览器发的是带 ctrlKey 的滚轮事件，数值小得多。
  const speed = event.ctrlKey ? 0.012 : 0.0018;
  const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
  view.classList.add('moving');
  zoomAround(event.clientX, event.clientY, camera.z * Math.exp(-delta * speed));
  clearTimeout(settleTimer);
  settleTimer = setTimeout(() => view.classList.remove('moving'), 200);
}, { passive: false });

let dragged = false;
const pointers = new Map();
let gesture = null;

function startGesture() {
  const points = [...pointers.values()];
  const center = { x: points.reduce((sum, p) => sum + p.x, 0) / points.length, y: points.reduce((sum, p) => sum + p.y, 0) / points.length };
  const spread = points.length > 1 ? Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) : 0;
  gesture = { center, spread, camera: { ...camera }, anchor: worldPoint(center.x, center.y) };
}

view.addEventListener('pointerdown', (event) => {
  if (event.pointerType === 'mouse' && event.button !== 0) return;
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (pointers.size === 1) dragged = false;
  startGesture();
});

addEventListener('pointermove', (event) => {
  if (!pointers.has(event.pointerId)) return;
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  const points = [...pointers.values()];
  const center = { x: points.reduce((sum, p) => sum + p.x, 0) / points.length, y: points.reduce((sum, p) => sum + p.y, 0) / points.length };
  if (!dragged && points.length === 1 && Math.hypot(center.x - gesture.center.x, center.y - gesture.center.y) < 5) return;
  if (!dragged) {
    dragged = true;
    takeOver();
    view.classList.add('dragging');
  }
  const spread = points.length > 1 ? Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) : 0;
  const z = gesture.spread && spread ? gesture.camera.z * (spread / gesture.spread) : gesture.camera.z;
  const zoom = Math.min(Math.max(z, minZoom()), maxZoom());
  // 手指下按住的那一点跟着手指走。
  const box = view.getBoundingClientRect();
  const { width, height } = viewSize();
  camera = clampCamera({
    x: gesture.anchor.x - (center.x - box.left - width / 2) / zoom,
    y: gesture.anchor.y - (center.y - box.top - height / 2) / zoom,
    z: zoom,
  });
  render();
});

function release(event) {
  if (!pointers.delete(event.pointerId)) return;
  if (pointers.size > 0) {
    startGesture();
    return;
  }
  view.classList.remove('dragging');
  setTimeout(() => {
    dragged = false;
  });
}
addEventListener('pointerup', release);
addEventListener('pointercancel', release);
view.addEventListener('click', (event) => {
  if (dragged) {
    event.preventDefault();
    event.stopPropagation();
  }
}, true);

// ---------- 开场：整颗喵星 → 喵城镇 → 落到广场（或要去的那间屋） ----------
const first = parse(location.pathname);
history.replaceState(null, '', pathOf(first) + location.hash);
function startCats() {
  townCats ??= startTownCats({ layer: catLayer, rect: CENTER, residents });
  render();
}
async function intro() {
  if (reducedMotion) {
    go(first, { animate: false }).then(() => panel.classList.add('shown'));
    startCats();
    return;
  }
  const overview = fit([0, 0, WORLD_W, WORLD_H], { left: 0, right: 0, top: 0, bottom: 0 });
  camera = clampCamera({ x: WORLD_W / 2, y: WORLD_H / 2, z: 0 });
  render();
  view.classList.add('intro');
  let skipped = false;
  const skip = () => {
    skipped = true;
    if (flight) flight.cancel();
    view.classList.remove('intro');
    go(first, { animate: false });
    startCats();
  };
  view.addEventListener('pointerdown', skip, { once: true });
  // 所有图先解码好再动，动画途中才不会卡一下。
  await Promise.all([...view.querySelectorAll('img')].map((img) => img.decode().catch(() => {})));
  await new Promise((resolve) => setTimeout(resolve, 500));
  if (skipped) return;
  await flyTo(overview, { duration: 2800 });
  if (skipped) return;
  startCats();
  await new Promise((resolve) => setTimeout(resolve, 350));
  if (skipped) return;
  view.removeEventListener('pointerdown', skip);
  view.classList.remove('intro');
  await go(first);
}
document.getElementById('residentCount').textContent = t('residentCount', cats.length);
intro();
