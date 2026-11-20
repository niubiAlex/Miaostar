// 45° 小屋：镜头固定。吃饭、睡觉、抓板都回到屋子中间做，道具平时不显示，用的时候在中间出现，用完消失。
// 平时它在屋里溜达：溜达片段里它是真的在画面里走一段（镜头不动，路线带弯），播完后网页把它的位置挪到终点。
// 有目的地走（去中间、去门口）时沿地板的两个斜向走：原地踏步的走路片段，由网页按步幅平移。
import { ClipPlayer } from './player.js?v=4';
import { MEALS, dayKey, phaseAt } from './schedule.js?v=4';

// 舞台的设计尺寸，下面的位置都按这个尺寸写。
const STAGE = { width: 576, height: 720 };
// 普通片段画面在舞台上的边长，以及落脚点在片段画面里的位置（pipeline/home45/normalize.py 的 ANCHOR）。
const SPRITE = 300;
const FOOT = { x: 0.5, y: 690 / 1024 };
// 四个朝向在屏幕上的方向。
const DIRECTIONS = {
  fl: { x: -0.887, y: 0.462 },
  br: { x: 0.887, y: -0.462 },
  bl: { x: -0.887, y: -0.462 },
  fr: { x: 0.887, y: 0.462 },
};
// 屋子中间（吃饭、睡觉、抓板的地方）、门口、门外（被墙挡住）。门口到门外正好斜朝后穿过门洞。
const CENTER = { x: 289, y: 438 };
const DOOR = { x: 450, y: 355 };
const OUTSIDE = { x: 645, y: 253 };
// 地板是个菱形；溜达只在里面这一圈走，离墙、窗台、门都留点距离。
const FLOOR = { x: 287, y: 450, halfWidth: 285, halfHeight: 227, inner: 0.72 };
// 道具相对它在屋子中间站的位置的偏移和宽度。碗和 eat_bowl 片段里画的碗在同一个地方（make_extra_poses.py）。
const PROPS = {
  bowl: { offset: { x: -55, y: 30 }, width: 52 },
  bed: { offset: { x: 0, y: 4 }, width: 118 },
  board: { offset: { x: -40, y: 21 }, width: 100 }, // 在它前爪下面
};
const PROP_FADE_MS = 700; // 和 home.css 里 .prop 的淡入淡出时长一致
const HURRY = 1.6; // 有人摸它、叫它时，手头的动作加快收尾
const TURN_RATE = 1.3; // 转身片段播快一点，原速太拖

const params = new URLSearchParams(location.search);
const FAST = params.has('fast'); // 检查脚本用：睡得短、出门短
// 三个档位：免费只会睡觉；¥99 醒着陪你，待在屋子中间；¥299 全套，满屋走、出门。
// activities 是这一档自己会做、也能让它去做的事；idles 是待着时的小动作和权重。
const TIERS = {
  free: { activities: [], idles: {} },
  99: { activities: ['idle', 'eat', 'sleep'], idles: { stand_idle: 3, sit_groom: 2 } },
  299: {
    activities: ['idle', 'wander', 'eat', 'play', 'scratch', 'sleep', 'out'],
    idles: { stand_idle: 3, sit_groom: 2, stretch: 1, loaf_rest: 2, sit_watch: 2, sniff_ground: 1.5 },
  },
};
const TIER = TIERS[params.get('tier')] ? params.get('tier') : '299';
const { activities: TIER_ACTIVITIES, idles: IDLES } = TIERS[TIER];
const SLEEPS_ONLY = TIER === 'free';
// 现在几点。?hour=20.5 可以假装从晚上 8 点半开始，之后照常往前走，用来看不同时段。
const FAKE_HOUR = params.has('hour') ? Number(params.get('hour')) : null;
const loadedAt = Date.now();
function clock() {
  if (FAKE_HOUR === null) return new Date();
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  return new Date(midnight.getTime() + FAKE_HOUR * 3600000 + (Date.now() - loadedAt));
}
// 哪天哪顿已经喂过。假装时间的时候只记在这个标签页里，不影响平时。
const mealStore = FAKE_HOUR === null ? localStorage : sessionStorage;
const fedKey = (meal) => `pet-fed:${TIER}:${dayKey(clock())}:${meal}`;
const mealPending = (phase) => Boolean(phase.meal) && TIER_ACTIVITIES.includes('eat')
  && mealStore.getItem(fedKey(phase.meal)) === null;
// 转身片段：只有这几种是直接有的，其余的由它们接起来。
const TURNS = [
  ['fl', 'br'], ['br', 'fl'], ['fl', 'bl'], ['br', 'bl'], ['bl', 'fl'], ['bl', 'br'], ['fr', 'fl'], ['fr', 'br'],
  ['fl', 'fr'],
];
const STROLLS = ['stroll_right', 'stroll_left', 'stroll_up', 'stroll_down', 'stroll_front', 'stroll_back'];
// 每一档要加载的片段。
const CLIP_NAMES = {
  free: ['sleep_idle'],
  99: ['sleep_idle', 'wake_up', 'settle_fl', 'petted', 'called', 'eat_bowl', ...Object.keys(IDLES)],
  299: [
    'walk_fl', 'walk_br', 'walk_bl', 'walk_fr', ...TURNS.map(([from, to]) => `turn_${from}_to_${to}`),
    ...Object.keys(IDLES), ...STROLLS, 'settle_fl', 'sleep_idle', 'wake_up', 'eat_bowl', 'play_ball', 'petted',
    'called', 'scratch',
  ],
}[TIER];
// ?cat=<名字> 时用这只猫的片段（pipeline/cat/make_cat.mjs 生成在 assets/cats/<名字>/），否则是小五。
const CAT_ASSETS = /^[a-z0-9_-]+$/.test(params.get('cat') ?? '') ? `assets/cats/${params.get('cat')}` : 'assets/home45';
const clipFile = (name) => `${CAT_ASSETS}/clips/${name}`;

const elements = Object.fromEntries(
  ['stage', 'cat', 'bed', 'bowl', 'board', 'doorCover', 'bubble', 'hearts', 'away', 'status', 'loading', 'callButton',
    'catHit', 'videoA', 'videoB'].map((id) => [id, document.getElementById(id)]),
);
const player = new ClipPlayer(elements.videoA, elements.videoB);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const random = (from, to) => from + Math.random() * (to - from);
const pick = (list) => list[Math.floor(Math.random() * list.length)];

function pickWeighted(weights) {
  const total = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
  let roll = Math.random() * total;
  for (const [name, weight] of Object.entries(weights)) {
    roll -= weight;
    if (roll <= 0) return name;
  }
  return Object.keys(weights)[0];
}

const cat = {
  pos: { ...CENTER }, // 落脚点在舞台上的位置
  facing: 'fl', // fl 斜朝前（左下）、br 斜朝后（右上）、bl 斜朝后（左上）、fr 斜朝前（右下）
  asleep: false,
  napsLeft: 0, // 还要睡几段
  out: false,
  returnAt: 0,
  hunger: 0.4, // 0 到 1
  tiredness: 0.2,
  lastActivity: null,
  stayInUntil: 0, // 夜游时被叫回来，在家待到这个时候再出去
  hungryLoops: 0,
};
// 等着处理的事：reaction 是摸或叫（'pet' | 'call'），ask 是让它去做的事。
const wishes = { reaction: null, ask: null };
// 正在播的片段：calm 表示动作很小可以直接打断；committed 表示不能打断（进出门）。
const playing = { name: null, calm: false, walking: false, committed: false };
const history = [];
let motion = null;
let strolls = null;

const wishPending = () => wishes.reaction !== null || wishes.ask !== null;
const near = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) < 8;

function onFloor({ x, y }) {
  return Math.abs(x - FLOOR.x) / FLOOR.halfWidth + Math.abs(y - FLOOR.y) / FLOOR.halfHeight <= FLOOR.inner;
}

function placeAt(element, x, y) {
  element.style.left = `${(x / STAGE.width) * 100}%`;
  element.style.top = `${(y / STAGE.height) * 100}%`;
}

function placeCat() {
  placeAt(elements.cat, cat.pos.x - FOOT.x * SPRITE, cat.pos.y - FOOT.y * SPRITE);
}

function layoutRoom() {
  elements.cat.style.width = `${(SPRITE / STAGE.width) * 100}%`;
  for (const [id, { offset, width }] of Object.entries(PROPS)) {
    placeAt(elements[id], CENTER.x + offset.x, CENTER.y + offset.y);
    elements[id].style.width = `${(width / STAGE.width) * 100}%`;
  }
  placeCat();
}

// 道具出现、消失。出现时等它显出来再开始动作。
async function showProp(id) {
  elements[id].classList.add('shown');
  await wait(PROP_FADE_MS);
}

function hideProp(id) {
  elements[id].classList.remove('shown');
}

function hideAllProps({ except } = {}) {
  for (const id of Object.keys(PROPS)) {
    if (id !== except) hideProp(id);
  }
}

let bubbleTimer = null;
function say(text, at = null) {
  const { x, y } = at ?? { x: cat.pos.x, y: cat.pos.y - 0.36 * SPRITE };
  placeAt(elements.bubble, Math.min(Math.max(x, 70), STAGE.width - 70), Math.max(y, 40));
  elements.bubble.textContent = text;
  elements.bubble.hidden = true;
  void elements.bubble.offsetWidth; // 重新触发出现的动画
  elements.bubble.hidden = false;
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => {
    elements.bubble.hidden = true;
  }, 2200);
}

function hearts() {
  const { x, y } = cat.pos;
  // 头的大致位置：醒着时在落脚点左上，睡着时贴着地。
  const head = cat.asleep ? { x: x - 0.1 * SPRITE, y: y - 0.06 * SPRITE } : { x: x - 0.2 * SPRITE, y: y - 0.16 * SPRITE };
  for (let i = 0; i < 3; i += 1) {
    setTimeout(() => {
      const heart = document.createElement('span');
      heart.className = 'heart';
      heart.textContent = '♥';
      placeAt(heart, head.x + random(-18, 18), head.y + random(-8, 8));
      elements.hearts.append(heart);
      heart.addEventListener('animationend', () => heart.remove());
    }, i * 220);
  }
}

// 播一个片段。返回 { wasCut, video }。
async function playClip(name, { calm = false, walking = false, committed = false, rate, transform, onFrame, onStart,
  fadeMs } = {}) {
  Object.assign(playing, { name, calm, walking, committed });
  history.push({ name, at: performance.now(), s: `${Math.round(cat.pos.x)},${Math.round(cat.pos.y)}` });
  const hurry = !walking && !calm && wishes.reaction !== null ? HURRY : 1;
  const result = await player.play({ file: clipFile(name), rate, transform }, { onFrame, onStart, hurry, fadeMs });
  playing.name = null;
  return result;
}

// 摸它、叫它、让它去做事：手头的事尽快让路。
function interrupt() {
  if (playing.name === null || playing.committed) return;
  if (playing.calm) player.cut();
  // 走到一半时由 walkLeg 在最近的可停帧停下；其他动作加快收尾。
  else if (!playing.walking && wishPending()) player.hurry(HURRY);
}

async function wake() {
  if (!cat.asleep) return;
  await playClip('wake_up');
  cat.asleep = false;
  cat.napsLeft = 0;
  cat.facing = 'fl';
  cat.tiredness = Math.min(cat.tiredness, 0.3);
  elements.cat.classList.remove('asleep');
  hideProp('bed');
}

// 从一个朝向转到另一个朝向要播哪几段转身（按段数最少的走）。
function turnsBetween(from, to) {
  const queue = [[from, []]];
  const seen = new Set([from]);
  while (queue.length > 0) {
    const [at, path] = queue.shift();
    if (at === to) return path;
    for (const [a, b] of TURNS) {
      if (a !== at || seen.has(b)) continue;
      seen.add(b);
      queue.push([b, [...path, [a, b]]]);
    }
  }
  throw new Error(`转不过去：${from} → ${to}`);
}

async function face(direction) {
  await wake();
  for (const [from, to] of turnsBetween(cat.facing, direction)) {
    await playClip(`turn_${from}_to_${to}`, { rate: TURN_RATE });
    cat.facing = to;
  }
}

function curveAt(curve, frame) {
  const index = Math.min(Math.floor(frame), curve.length - 2);
  return curve[index] + (curve[index + 1] - curve[index]) * (frame - index);
}

// 一段路怎么走：整段片段播几遍，最后一遍播到哪个可停帧。
// 片段的步幅是固定的，凑不到正好那么远，就整体把位移放大或缩小一点（scale），选最接近 1 的方案。
function planLeg(length, walk) {
  const full = walk.distance * SPRITE;
  const last = walk.curve.length - 1;
  let best = null;
  for (let repeats = 0; repeats <= 3; repeats += 1) {
    const endings = walk.stops.map((frame) => ({ frame, distance: walk.curve[frame] * full }));
    if (repeats > 0) endings.push({ frame: null, distance: 0 });
    for (const ending of endings) {
      const total = repeats * full + ending.distance;
      const error = Math.abs(Math.log(length / total));
      if (best === null || error < best.error) {
        const pieces = Array(repeats).fill(last);
        if (ending.frame !== null) pieces.push(ending.frame);
        best = { error, pieces, scale: length / total };
      }
    }
  }
  return best;
}

// 朝一个斜向直着走 length 远。被打断时在最近的可停帧停下，返回 false。
async function walkLeg(direction, length, { committed = false, onStart } = {}) {
  if (length < 8) return true;
  // 还没迈步就有人摸它、叫它：不走了，连转身也省掉。
  if (!committed && wishPending()) return false;
  await face(direction);
  const walk = motion[`walk_${direction}`];
  const full = walk.distance * SPRITE;
  const last = walk.curve.length - 1;
  const plan = planLeg(length, walk);
  const along = DIRECTIONS[direction];
  for (const [index, plannedStop] of plan.pieces.entries()) {
    const start = { ...cat.pos };
    let stopAt = plannedStop;
    await playClip(`walk_${direction}`, {
      walking: true,
      committed,
      // 转身后接着走：直接切过去，不叠化，否则两个姿态叠在一起像在滑。
      fadeMs: 0,
      onStart: index === 0 ? onStart : undefined,
      onFrame: (progress) => {
        const frame = progress * last;
        // 有人摸它、叫它，或者让它去做别的事：在最近的可停帧停下。
        if (!committed && wishPending()) stopAt = Math.min(stopAt, walk.stops.find((stop) => stop >= frame) ?? last);
        const moved = plan.scale * full * curveAt(walk.curve, Math.min(frame, stopAt));
        cat.pos = { x: start.x + along.x * moved, y: start.y + along.y * moved };
        placeCat();
        if (stopAt < last && frame >= stopAt) player.cut();
      },
    });
    if (stopAt !== plannedStop) return false;
  }
  return true;
}

// 把一段位移拆成沿 br 和沿 bl 两个斜向各走多远（负数是反方向）。
function splitMove(dx, dy) {
  // br 和 bl 的横向分量相反、纵向分量相同。
  const difference = dx / DIRECTIONS.br.x;
  const sum = dy / DIRECTIONS.br.y;
  return { br: (sum + difference) / 2, bl: (sum - difference) / 2 };
}

// 沿地板的两个斜向走到 target：先走 first 那个斜向，再走另一个。被打断返回 false。
async function walkTo(target, { first = 'bl', ...options } = {}) {
  await wake();
  const { br, bl } = splitMove(target.x - cat.pos.x, target.y - cat.pos.y);
  const legs = { br: [br > 0 ? 'br' : 'fl', Math.abs(br)], bl: [bl > 0 ? 'bl' : 'fr', Math.abs(bl)] };
  const order = first === 'bl' ? ['bl', 'br'] : ['br', 'bl'];
  for (const axis of order) {
    const [direction, length] = legs[axis];
    if (!(await walkLeg(direction, length, options))) return false;
  }
  cat.pos = { ...target };
  placeCat();
  return true;
}

// 溜达一段：从现在的地方真的走到附近另一处，终点要在地板里面。
async function stroll() {
  const options = STROLLS.filter((name) => {
    const { move } = strolls.strolls[name];
    return onFloor({ x: cat.pos.x + move[0], y: cat.pos.y + move[1] });
  });
  if (options.length === 0) return walkTo(CENTER);
  await face('fl');
  if (wishPending()) return false;
  const name = pick(options);
  const { start, move } = strolls.strolls[name];
  const zoom = strolls.sprite / SPRITE;
  // 把溜达片段（画面是普通片段的 zoom 倍大）摆到起点正好落在它现在的落脚点上。
  const placement = (point) => `translate(${(FOOT.x - zoom * point[0]) * 100}%, ${(FOOT.y - zoom * point[1]) * 100}%) scale(${zoom})`;
  elements.cat.classList.add('strolling');
  const { video } = await playClip(name, { transform: placement(start) });
  // 画面停在终点；把它的位置挪到终点，同时把这个视频反着挪回去，画面上不动。
  cat.pos = { x: cat.pos.x + move[0], y: cat.pos.y + move[1] };
  placeCat();
  video.style.transform = placement([start[0] + move[0] / strolls.sprite, start[1] + move[1] / strolls.sprite]);
  elements.cat.classList.remove('strolling');
  cat.facing = 'fl';
  return true;
}

// 走到屋子中间，道具出现。被打断返回 false，道具不出现。
async function goUse(id) {
  hideAllProps();
  if (!(await walkTo(CENTER)) || wishPending()) return false;
  await showProp(id);
  if (wishPending()) {
    hideProp(id);
    return false;
  }
  return true;
}

const ACTIVITIES = {
  // 在原地做个小动作。小动作都是斜朝前的，所以先转过来。
  async idle() {
    hideAllProps();
    await face('fl');
    if (wishPending()) return;
    const name = pickWeighted(IDLES);
    await playClip(name, { calm: true }); // 待着的动作都可以立刻打断，摸它、让它做事不用等
  },

  async wander() {
    hideAllProps();
    await stroll();
  },

  async eat() {
    const waiting = elements.bowl.classList.contains('shown') && near(cat.pos, CENTER);
    elements.bowl.src = 'assets/home45/bowl_full.png';
    if (!waiting && !(await goUse('bowl'))) return;
    await face('fl');
    if (wishPending()) return hideProp('bowl');
    const { meal } = phaseAt(TIER, clock());
    const isMeal = Boolean(meal) && mealStore.getItem(fedKey(meal)) === null;
    say(isMeal ? pick([`${MEALS[meal]}来啦`, '终于开饭了', '好香']) : pick(['加个餐', '嘿嘿，零食']));
    await playClip('eat_bowl');
    if (isMeal) mealStore.setItem(fedKey(meal), String(Date.now()));
    elements.bowl.src = 'assets/home45/bowl_empty.png';
    await wait(600);
    hideProp('bowl');
  },

  async play() {
    hideAllProps();
    await face('fl');
    if (wishPending()) return;
    say(pick(['球！', '看我的', '来玩呀']));
    await playClip('play_ball');
    cat.tiredness = Math.min(1, cat.tiredness + 0.08);
  },

  async sleep() {
    if (!(await goUse('bed'))) return;
    await face('fl');
    if (wishPending()) return hideProp('bed');
    say(pick(['困了…', '睡一会儿', '呼…']));
    await playClip('settle_fl');
    cat.asleep = true;
    cat.facing = 'fl';
    cat.napsLeft = napLength();
    elements.cat.classList.add('asleep');
  },

  async scratch() {
    if (!(await goUse('board'))) return;
    await face('fl');
    if (wishPending()) return hideProp('board');
    say(pick(['磨磨爪子', '嚓嚓嚓', '爪子痒了']));
    await playClip('scratch');
    hideProp('board');
  },

  async out() {
    hideAllProps();
    // 最后一段要斜朝后正对着门洞走，所以先走另一个斜向。
    if (!(await walkTo(DOOR, { first: 'bl' })) || wishPending()) return;
    say(pick(['出去找朋友玩～', '出门逛逛', '我出去一下', '出去上个厕所']));
    elements.doorCover.hidden = false;
    await walkTo(OUTSIDE, { first: 'br', committed: true });
    elements.cat.style.visibility = 'hidden';
    elements.doorCover.hidden = true;
    elements.away.textContent = '出门玩去了';
    elements.away.hidden = false;
    cat.out = true;
    cat.returnAt = performance.now() + (FAST ? 3000 : random(15000, 30000));
  },
};

// 睡一觉播几段「睡着」：夜里睡得沉，白天打个盹。
function napLength() {
  if (FAST) return 2;
  return phaseAt(TIER, clock()).sleep === 'deep' ? Math.round(random(20, 40)) : Math.round(random(6, 12));
}

// 到了饭点还没喂：饿醒了，在中间守着空碗，时不时看着你叫一声。
async function waitForMeal(phase) {
  await wake();
  if (!near(cat.pos, CENTER)) {
    hideAllProps();
    if (!(await walkTo(CENTER))) return;
  }
  hideAllProps({ except: 'bowl' });
  if (!elements.bowl.classList.contains('shown')) {
    elements.bowl.src = 'assets/home45/bowl_empty.png';
    await showProp('bowl');
  }
  await face('fl');
  if (wishPending()) return;
  cat.hungryLoops += 1;
  if (cat.hungryLoops % 3 === 1) {
    say(pick([`喵～${MEALS[phase.meal]}呢？`, '碗空空的…', '饿了，喵']));
    await playClip('called');
  } else {
    await playClip('stand_idle', { calm: true });
  }
}

// 免费档不演出门进门：不在家时屋里空着，回来时直接睡在窝里，都是慢慢淡入淡出。
async function vanish(phase) {
  elements.cat.classList.add('gone');
  await wait(1000);
  elements.cat.style.visibility = 'hidden';
  elements.away.textContent = '出去玩了'; // 几点回来写在左上角的状态里
  elements.away.hidden = false;
  cat.out = true;
}

async function reappear() {
  elements.away.hidden = true;
  cat.out = false;
  cat.asleep = true;
  elements.cat.classList.add('asleep');
  elements.bed.classList.add('shown');
  await playClip('sleep_idle', { calm: true, onStart: () => {
    elements.cat.style.visibility = '';
    elements.cat.classList.remove('gone');
  } });
}

// 夜游：睡着就先醒，然后走出门；到点自己回来。
async function goRoaming(phase) {
  await ACTIVITIES.out();
  if (!cat.out) return;
  elements.away.textContent = '出去玩了'; // 几点回来写在左上角的状态里
  cat.returnAt = Infinity;
}

async function comeBack() {
  cat.facing = 'fl';
  cat.pos = { ...OUTSIDE };
  placeCat();
  elements.doorCover.hidden = false;
  elements.away.hidden = true;
  await walkTo(DOOR, {
    first: 'br',
    committed: true,
    onStart: () => {
      elements.cat.style.visibility = '';
    },
  });
  elements.doorCover.hidden = true;
  cat.out = false;
  cat.tiredness = Math.min(1, cat.tiredness + 0.25);
  say(pick(['我回来啦', '外面真好玩', '回家啦']));
}

async function react(kind) {
  if (cat.out) {
    // 摸不到；叫它的话，它听见就回来（免费档叫不回来）。夜游被叫回来，在家待一会儿再出去。
    if (kind === 'call' && !SLEEPS_ONLY) {
      cat.returnAt = 0;
      cat.stayInUntil = performance.now() + (FAST ? 10000 : 120000);
    }
    return;
  }
  // 免费档只会睡觉：叫它也不醒，耳朵动一动。
  if (SLEEPS_ONLY) {
    if (kind === 'pet') hearts();
    say(kind === 'pet' ? '呼噜呼噜…' : pick(['呼…睡得正香', 'zzz…']));
    await playClip('sleep_idle', { calm: true });
    return;
  }
  if (kind === 'pet') {
    if (cat.asleep) {
      // 睡着被摸不醒，只是更安心。
      hearts();
      say('呼噜呼噜…');
      await playClip('sleep_idle', { calm: true });
      return;
    }
    await face('fl');
    hearts();
    say(pick(['喵～', '舒服', '再摸摸']));
    await playClip('petted');
    return;
  }
  // 被叫：睡着就醒过来，背对着就转过来，然后看向你应一声。
  await face('fl');
  say(pick(['喵？', '喵～', '在呢']));
  await playClip('called');
}

function chooseActivity(phase) {
  const weights = { ...phase.weights };
  // 除了待着和溜达，同一件事不连着做两次。
  if (cat.lastActivity !== 'idle' && cat.lastActivity !== 'wander') weights[cat.lastActivity] = 0;
  for (const name of Object.keys(weights)) {
    if (!TIER_ACTIVITIES.includes(name)) delete weights[name];
  }
  if (Object.keys(weights).length === 0) return 'idle';
  return pickWeighted(weights);
}

function showStatus(phase) {
  const time = clock().toTimeString().slice(0, 5);
  const text = mealPending(phase) ? `等${params.has('visitor') ? '主人' : '你'}喂${MEALS[phase.meal]}` : phase.text;
  elements.status.textContent = `${time} ${phase.label} · ${text}`;
}

// 主循环：每一圈只做一小步，所以摸它、叫它最多等手头这一个片段。
async function live() {
  let lastTick = performance.now();
  for (;;) {
    const now = performance.now();
    const minutes = (now - lastTick) / 60000;
    lastTick = now;
    if (!cat.asleep) cat.tiredness = Math.min(1, cat.tiredness + minutes / 2.5);
    const phase = phaseAt(TIER, clock());
    showStatus(phase);
    const goesOut = phase.out && now >= cat.stayInUntil;

    if (wishes.reaction !== null) {
      const kind = wishes.reaction;
      wishes.reaction = null;
      await react(kind);
    } else if (cat.out) {
      if (SLEEPS_ONLY) {
        if (!phase.out) await reappear();
        else await wait(1000);
      } else if (wishes.ask !== null || now >= cat.returnAt || !phase.out && cat.returnAt === Infinity) {
        await comeBack();
      } else {
        await wait(200);
      }
    } else if (goesOut && SLEEPS_ONLY) {
      await vanish(phase);
    } else if (goesOut && TIER_ACTIVITIES.includes('out') && wishes.ask === null) {
      await goRoaming(phase);
    } else if (wishes.ask !== null) {
      const ask = wishes.ask;
      wishes.ask = null;
      // 已经睡着时让它去睡：接着睡。这一档没有的事不做。
      if (TIER_ACTIVITIES.includes(ask) && !(ask === 'sleep' && cat.asleep)) {
        cat.lastActivity = ask;
        await ACTIVITIES[ask]();
      }
    } else if (mealPending(phase)) {
      await waitForMeal(phase);
    } else if (cat.asleep) {
      // 夜里睡得沉，睡完一觉翻个身接着睡，叫它才醒。
      if (cat.napsLeft <= 0 && phase.sleep === 'deep') cat.napsLeft = napLength();
      if (cat.napsLeft > 0 || SLEEPS_ONLY) {
        cat.napsLeft -= 1;
        await playClip('sleep_idle', { calm: true });
      } else {
        await wake();
      }
    } else {
      cat.hungryLoops = 0;
      const activity = chooseActivity(phase);
      cat.lastActivity = activity;
      await ACTIVITIES[activity]();
    }
  }
}

function request(kind, value) {
  if (kind === 'ask') wishes.ask = value;
  else wishes.reaction = value;
  interrupt();
}

async function start() {
  layoutRoom();
  [motion, strolls] = await Promise.all([
    // 步速是从这只猫的走路片段量出来的，只有 ¥299 档会走路。
    TIER === '299' ? fetch(`${CAT_ASSETS}/motion.json`).then((response) => response.json()) : null,
    fetch('assets/home45/extra_poses.json').then((response) => response.json()),
    player.preload(CLIP_NAMES.map((name) => ({ file: clipFile(name) })), (done, total) => {
      elements.loading.textContent = `正在加载 ${done}/${total}`;
    }),
  ]);
  elements.loading.hidden = true;

  // 嵌在猫猫主页里时：访客只能看，不能摸、不能叫；档位由主人买的那档决定，不给切换。
  document.body.classList.toggle('embed', params.has('embed'));
  document.body.classList.toggle('visitor', params.has('visitor'));
  if (!params.has('visitor')) elements.catHit.addEventListener('click', () => request('reaction', 'pet'));
  elements.callButton.addEventListener('click', () => {
    if (cat.out) say(SLEEPS_ONLY ? '它在外面玩，早上回来' : '听见啦，这就回来', { x: 470, y: 250 });
    request('reaction', 'call');
  });
  for (const button of document.querySelectorAll('[data-ask]')) {
    button.hidden = !TIER_ACTIVITIES.includes(button.dataset.ask);
    button.addEventListener('click', () => request('ask', button.dataset.ask));
  }
  document.querySelector('.asks').hidden = TIER_ACTIVITIES.length === 0;
  for (const link of document.querySelectorAll('[data-tier]')) {
    link.classList.toggle('current', link.dataset.tier === TIER);
    const linked = new URLSearchParams(params);
    linked.set('tier', link.dataset.tier);
    link.href = `?${linked}`;
  }

  window.homeDebug = { cat, wishes, playing, history, player, request, stroll, tier: TIER, clock };
  // 一进来看到的是它这个时段该有的样子：该睡的睡在窝里，出去了的屋里空着。
  const phase = phaseAt(TIER, clock());
  showStatus(phase);
  if (phase.out && TIER !== '99') {
    cat.out = true;
    cat.returnAt = Infinity;
    elements.cat.style.visibility = 'hidden';
    elements.away.textContent = '出去玩了'; // 几点回来写在左上角的状态里
    elements.away.hidden = false;
  } else if (phase.sleep === 'deep' || phase.sleep === 'nap' && Math.random() < 0.7) {
    cat.asleep = true;
    cat.napsLeft = napLength();
    elements.cat.classList.add('asleep');
    elements.bed.classList.add('shown');
    await playClip('sleep_idle', { calm: true });
  } else {
    await playClip('stand_idle', { calm: true });
  }
  live();
}

start().catch((error) => {
  elements.loading.hidden = false;
  elements.loading.textContent = `出错了：${error.message}`;
  throw error;
});
