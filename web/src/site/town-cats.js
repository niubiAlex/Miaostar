// 猫城镇广场上的居民猫。不能点，只是让广场活起来：
// 一只猫固定在栈桥上钓鱼；两只在睡；其余在湖边和草坪上待着——打哈欠、趴着、舔毛、伸懒腰、闻草、盯远处；
// 另有一两只从路口进来、绕着湖走过广场、从另一个路口离开，走完换一只别的居民。
// 每只猫的小视频由 pipeline/site/make_plaza_sprites.py 做：原地走一段、睡一段，其余是从站姿开始又回到站姿的小动作，
// 所以动作之间接得上。走路是原地踏步，这里按 plaza/motion.json 量出的每帧步子平移，脚底不打滑。
// 走路的片段只有斜朝下走这一种（朝右下走时左右翻过来），所以路线都是斜着往下走的，不用转身。
//
// 位置都用高清城镇中心 center.webp 的像素（3840×2160），摆的时候按它在整张图里的方框换算。
const IS_SAFARI = /^((?!chrome|chromium|android).)*safari/i.test(navigator.userAgent);
const EXTENSION = IS_SAFARI ? '.mov' : '.webm';

// 栈桥前端：钓鱼的猫蹲在这里，爪子朝湖心（朝左下，不用翻）。
const FISH_SPOT = [1928, 1088];
// 待着的地方：湖边石板、四周草坪（不含栈桥，留给钓鱼）。
const SPOTS = [
  [1673, 840], [1898, 833], [2192, 868], [1771, 880],
  [1652, 985], [2164, 985], [1771, 1093],
  [1448, 1023], [1532, 1107], [1813, 1198], [2094, 1205], [2263, 1093], [2333, 1065],
];
// 走过广场的路线：都从高处的路口走到低处的路口，绕开湖。
const ROUTES = [
  [[1940, 760], [1700, 850], [1378, 981]],
  [[1940, 760], [2190, 860], [2417, 960]],
  [[1378, 981], [1640, 1130], [1926, 1290]],
  [[2417, 960], [2190, 1110], [1926, 1290]],
];
// 视频画面边长（高清中心的像素）、落脚点在画面里的位置（和 normalize_cat.py 的 ANCHOR 一致）。
const SPRITE = 130;
const FOOT = { x: 0.5, y: 690 / 1024 };
// 广场上每种花色只有一套动画，同屏同花色只放一只，不然看着像复制粘贴。
// 现有外观大约 9 种（小五、不爱笑、七种花色），所以总数压在这个数以内。
// 居民少的时候（比如现在只有两只完全体），会按实际数量少放，优先留一只钓鱼、一只待着或路过。
const SITTERS = 4;
const SLEEPERS = 1;
const WALKERS = 2;
// 站着时随机挑一个小动作，权重。钓鱼是栈桥专属，不在这里。
const ACTIONS = [
  ['stand_idle', 2], ['sit_yawn', 2], ['loaf_rest', 2], ['sit_groom', 2],
  ['sit_watch', 3], ['stretch', 2], ['sniff_ground', 2],
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const between = (low, high) => low + Math.random() * (high - low);
const pick = (list) => list[Math.floor(Math.random() * list.length)];

function weighted(entries) {
  let roll = Math.random() * entries.reduce((sum, [, weight]) => sum + weight, 0);
  for (const [value, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return value;
  }
  return entries[0][0];
}

// 这只猫在广场上用哪套视频：有自己动画的用自己的，示例邻居按花色用同一套。
export function spriteOf(cat) {
  if (cat.animated && !cat.assets) return '/assets/home45/plaza';
  if (cat.assets) return `/assets/cats/${cat.assets}/plaza`;
  const coat = cat.portrait?.match(/\/cat_(\w+)\.jpg$/);
  return coat ? `/assets/cats/coat_${coat[1]}/plaza` : null;
}

// 沿折线走了 distance 远时的位置和这一段的方向。走过终点就沿最后一段继续往前（边走边淡出），不停在原地踏步。
function along(route, distance) {
  let left = distance;
  for (let index = 1; index < route.length; index += 1) {
    const [from, to] = [route[index - 1], route[index]];
    const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
    if (left <= length || index === route.length - 1) {
      const t = left / length;
      return { point: [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t], right: to[0] > from[0] };
    }
    left -= length;
  }
  return { point: route[0], right: false };
}

const routeLength = (route) => route.slice(1).reduce((sum, to, index) => sum + Math.hypot(to[0] - route[index][0], to[1] - route[index][1]), 0);

// When few real residents live here, pad the plaza with coat-only sprites so it still feels alive.
// These are atmosphere only — they do not get cottages or profile pages.
const COAT_PAD = ['orange', 'grey', 'black', 'white', 'tuxedo', 'siamese', 'sanhua'];

function plazaPool(residents) {
  const pool = residents.filter(spriteOf);
  const looks = new Set(pool.map(spriteOf));
  const need = SITTERS + SLEEPERS + WALKERS + 1;
  if (pool.length >= need) return pool;
  for (const coat of COAT_PAD) {
    const look = `/assets/cats/coat_${coat}/plaza`;
    if (looks.has(look)) continue;
    pool.push({
      slug: `plaza-${coat}`,
      portrait: `/assets/site/cat_${coat}.jpg`,
      animated: false,
    });
    looks.add(look);
    if (pool.length >= need) break;
  }
  return pool;
}

export function startTownCats({ layer, rect, residents }) {
  const unit = rect[2] / 3840;
  const toWorld = ([x, y]) => [rect[0] + x * unit, rect[1] + y * unit];
  const size = SPRITE * unit;
  const pool = plazaPool(residents);
  const cats = new Set();
  const motions = new Map();
  let paused = false;

  const motionOf = (base) => {
    if (!motions.has(base)) motions.set(base, fetch(`${base}/motion.json`).then((response) => response.json()).then((data) => data.walk_fl));
    return motions.get(base);
  };

  function video(src, loop = false) {
    const element = document.createElement('video');
    Object.assign(element, { muted: true, playsInline: true, loop, preload: 'auto', src });
    element.setAttribute('aria-hidden', 'true');
    return element;
  }

  const ready = (element) => (element.readyState >= 2 ? Promise.resolve()
    : new Promise((resolve) => element.addEventListener('loadeddata', resolve, { once: true })));
  const ended = (element) => new Promise((resolve) => element.addEventListener('ended', resolve, { once: true }));
  const play = (element) => {
    if (!paused) element.play().catch(() => {});
  };

  class TownCat {
    constructor(cat) {
      this.cat = cat;
      this.base = spriteOf(cat);
      this.element = document.createElement('div');
      this.element.className = 'town-cat';
      this.flip = document.createElement('div');
      this.flip.className = 'town-cat-flip';
      this.element.append(this.flip);
      Object.assign(this.element.style, { width: `${size}px`, height: `${size}px` });
      layer.append(this.element);
      this.alive = true;
      this.playing = null;
      cats.add(this);
    }

    clip(name, loop = false) {
      const element = video(`${this.base}/${name}${EXTENSION}`, loop);
      this.flip.append(element);
      return element;
    }

    place([x, y]) {
      const [wx, wy] = toWorld([x, y]);
      this.element.style.transform = `translate(${wx - size * FOOT.x}px, ${wy - size * FOOT.y}px)`;
      this.element.style.zIndex = String(Math.round(y));
    }

    face(toRight) {
      this.flip.classList.toggle('right', toRight);
    }

    async appear() {
      await sleep(50);
      this.element.classList.add('shown');
    }

    async leave() {
      this.element.classList.remove('shown');
      await sleep(900);
      this.alive = false;
      cats.delete(this);
      this.element.remove();
    }

    // 播一段视频，同时只有一段在播；网页暂停时它也跟着停。
    async run(element) {
      this.playing = element;
      element.currentTime = 0;
      play(element);
      await ended(element);
      this.playing = null;
    }
  }

  // 一直在睡的猫。
  async function sleeper(cat, spot) {
    const townCat = new TownCat(cat);
    const clip = townCat.clip('sleep_idle', true);
    clip.classList.add('on');
    townCat.place(spot);
    townCat.face(Math.random() < 0.5);
    townCat.playing = clip;
    await ready(clip);
    clip.currentTime = between(0, 3);
    play(clip);
    townCat.appear();
  }

  // 栈桥上钓鱼：蹲着盯水面、伸爪子拨一下，停一会儿再钓，过一阵换一只猫来。
  async function fisher(cat) {
    const townCat = new TownCat(cat);
    const stand = townCat.clip('stand_idle');
    const fish = townCat.clip('sit_fish');
    stand.classList.add('on');
    townCat.place(FISH_SPOT);
    townCat.face(false);
    await ready(stand);
    townCat.appear();
    const leaveAt = Date.now() + between(50, 110) * 1000;
    while (townCat.alive && Date.now() < leaveAt) {
      await ready(fish);
      fish.currentTime = 0;
      fish.classList.add('on');
      stand.classList.remove('on');
      await townCat.run(fish);
      stand.currentTime = 0;
      stand.classList.add('on');
      fish.classList.remove('on');
      await sleep(between(2000, 6000));
    }
    await townCat.leave();
    setTimeout(fishOn, between(3000, 8000));
  }

  function fishOn() {
    const cat = newcomer();
    if (cat) fisher(cat);
    else setTimeout(fishOn, between(4000, 10000));
  }

  // 待在原地的猫：站着的姿态垫在下面，小动作的片段盖在上面，播完正好回到站姿。
  async function sitter(cat, spot) {
    const townCat = new TownCat(cat);
    const stand = townCat.clip('stand_idle');
    stand.classList.add('on');
    const actions = Object.fromEntries(ACTIONS.map(([name]) => [name, townCat.clip(name)]));
    townCat.place(spot);
    townCat.face(Math.random() < 0.5);
    await ready(stand);
    townCat.appear();
    await sleep(between(0, 6000));
    while (townCat.alive) {
      await sleep(between(2500, 9000));
      const name = weighted(ACTIONS);
      const element = name === 'stand_idle' ? stand : actions[name];
      await ready(element);
      if (element !== stand) {
        element.currentTime = 0;
        element.classList.add('on');
        stand.classList.remove('on');
      }
      await townCat.run(element);
      if (element !== stand) {
        stand.currentTime = 0;
        stand.classList.add('on');
        element.classList.remove('on');
      }
    }
  }

  // 从一个路口走过广场到另一个路口。走一段停一下，有时站着张望一会儿再走。
  async function walker(cat) {
    const townCat = new TownCat(cat);
    const motion = await motionOf(townCat.base).catch(() => null);
    if (!motion) return townCat.leave();
    const walk = townCat.clip('walk_fl');
    const look = townCat.clip('stand_idle');
    walk.classList.add('on');
    const route = pick(ROUTES);
    const total = routeLength(route);
    const stride = motion.distance * SPRITE;
    const frames = motion.curve.length - 1;
    let travelled = 0;
    const update = () => {
      const progress = walk.duration ? Math.min(walk.currentTime / walk.duration, 1) * frames : 0;
      const frame = Math.floor(progress);
      const next = Math.min(frame + 1, frames);
      const done = motion.curve[frame] + (motion.curve[next] - motion.curve[frame]) * (progress - frame);
      const distance = travelled + done * stride;
      const { point, right } = along(route, distance);
      townCat.place(point);
      townCat.face(right);
      if (distance > total) townCat.element.classList.remove('shown');
    };
    update();
    await ready(walk);
    townCat.appear();
    let frame;
    const tick = () => {
      update();
      if (townCat.playing === walk) frame = requestAnimationFrame(tick);
    };
    while (travelled < total) {
      const step = townCat.run(walk);
      frame = requestAnimationFrame(tick);
      await step;
      cancelAnimationFrame(frame);
      travelled += stride;
      walk.currentTime = 0;
      update();
      if (travelled < total && Math.random() < 0.35) {
        await ready(look);
        look.currentTime = 0;
        look.classList.add('on');
        walk.classList.remove('on');
        await townCat.run(look);
        walk.classList.add('on');
        look.classList.remove('on');
      }
    }
    await townCat.leave();
  }

  // 还没在场上、而且花色外观也还没人用的居民。
  const newcomer = () => {
    const present = new Set([...cats].map((townCat) => townCat.cat.slug));
    const looks = new Set([...cats].map((townCat) => townCat.base));
    const candidates = pool.filter((cat) => !present.has(cat.slug) && !looks.has(spriteOf(cat)));
    return candidates.length > 0 ? pick(candidates) : null;
  };

  function walkOn() {
    const cat = newcomer();
    if (!cat) {
      setTimeout(walkOn, between(4000, 10000));
      return;
    }
    walker(cat).then(() => setTimeout(walkOn, between(3000, 12000)));
  }

  // 陆续进场：先一只钓鱼，再每隔几秒多一只待着/睡着的，路过的猫也错开时间进来。
  fishOn();
  const spots = [...SPOTS].sort(() => Math.random() - 0.5);
  let seat = 0;
  const seatTotal = SITTERS + SLEEPERS;
  const seatNext = () => {
    if (seat >= seatTotal || spots.length === 0) return;
    const cat = newcomer();
    if (!cat) {
      setTimeout(seatNext, between(4000, 8000));
      return;
    }
    const index = seat;
    seat += 1;
    (index < SLEEPERS ? sleeper : sitter)(cat, spots.pop());
    if (seat < seatTotal) setTimeout(seatNext, between(3500, 9000));
  };
  setTimeout(seatNext, between(800, 2500));
  for (let index = 0; index < WALKERS; index += 1) {
    setTimeout(walkOn, 6000 + index * between(5000, 12000));
  }

  return {
    // 镜头远到看不清猫、或者页面在后台时，视频都停下来，省电。
    setPaused(value) {
      if (paused === value) return;
      paused = value;
      for (const townCat of cats) {
        if (!townCat.playing) continue;
        if (paused) townCat.playing.pause();
        else townCat.playing.play().catch(() => {});
      }
    },
  };
}
