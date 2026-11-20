import { ANCHORS, CLIPS, BUBBLES, WORLD, SPRITE, SPOTS, GROUND_Y, setSpots, depthScale } from './graph.js';
import { ClipPlayer } from './player.js';
import { Director, pick } from './director.js';

const $ = (id) => document.getElementById(id);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const stage = $('stage');
const world = $('world');
const cat = $('cat');
const loading = $('loading');
const bubble = $('bubble');
const hearts = $('hearts');
const logList = $('log');

const TRIGGER_LABELS = { pet: '摸头', feed: '喂食', play: '逗它玩' };
const NOTE_LABELS = { sleepy: '困了，回窝睡觉', hungry: '饿了，去饭碗边等', wander: '换个地方待着' };
const IDLE_BUBBLE_CHANCE = 0.35;
const HEART_PATH =
  'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z';
// 镜头追上宠物的快慢（秒）。越小跟得越紧；太大的话它跑起来会冲出画面。
const CAMERA_LAG = 0.15;
// 为了响应用户的指示而换姿态、转身、走动时，播放速度是平时的多少倍。
const HURRY = 1.3;
// 走动不催：位移是按步幅量好的，播快了脚会打滑。只催换姿态和转身。
const HURRIED_TYPES = ['transition', 'turn'];
// 舔爪子、伸懒腰这类待机动作幅度大，不能硬切；用户有指示时剩下的部分按这个倍数快速播完。
const WRAP_UP = 2.5;
// 待机片段被打断后，下一个片段淡入的时长（毫秒）。比平时长一点，盖住姿态上的细微差别。
const CUT_FADE_MS = 220;
// 转身刚结束就淡入走动时，底下还叠着转身最后一帧；这时候若整只猫已经在挪，
// 定格的那一帧会像在地板上滑。转身接走动改为硬切，并等迈出第一步再开始位移。
const MOVE_AFTER_TURN_HOLD = 0.14;

const player = new ClipPlayer($('videoA'), $('videoB'));
const history = [];
let director = null;
let currentClip = null;
// 正在播的片段能不能被用户的指示立刻打断。
let currentInterruptible = false;
// 正在播的片段是不是它自己在打发时间（没有请求时自主选的待机）。
let currentPastime = false;

// ---------- 房间里的位置 ----------
// 横向位置以一屏宽度为 1，房间宽 WORLD.width 屏；纵向以舞台高度为 1。
// 宠物的位置是 (x, y)：x 左右，y 远近（脚底在舞台高度上的位置）。

// 宠物在地点所在的远近（GROUND_Y）时视频的边长，以舞台高度为 1。
const spriteHeight = WORLD.spriteWidth * WORLD.screenAspect;
const spriteTop = GROUND_Y - SPRITE.ground * spriteHeight;
const worldPercent = (x) => `${(x / WORLD.width) * 100}%`;

let catX = 0;
let catY = GROUND_Y;
let camera = 0;

function cameraTarget() {
  return clamp(catX - 0.5, 0, WORLD.width - 1);
}

// 元素本身按 GROUND_Y 处的大小摆放；远近不同时，以脚底为中心缩放，再上下平移。
function placeCat(x, y) {
  catX = x;
  catY = y;
  const scale = depthScale(y);
  cat.style.left = worldPercent(x - WORLD.spriteWidth / 2);
  cat.style.transform = `translateY(${(((y - GROUND_Y) / spriteHeight) * 100).toFixed(3)}%) scale(${scale.toFixed(4)})`;
  // 气泡不跟着缩放。
  cat.style.setProperty('--scale', scale.toFixed(4));
  // 宠物比饭碗离镜头更近时，碗在它身后。
  $('bowl').style.zIndex = y > SPOTS.bowl.y + 0.01 ? '0' : '2';
}

function layoutRoom() {
  world.style.width = `${WORLD.width * 100}%`;
  // 背景图和一屏的宽高比相同，所以铺得比一屏宽多少，就比舞台高多少。
  const tiles = Math.ceil(WORLD.width / WORLD.tileWidth - 1e-6);
  for (let index = tiles - 1; index >= 0; index -= 1) {
    const room = document.createElement('div');
    room.className = index % 2 === 1 ? 'room room-mirrored' : 'room';
    room.style.left = worldPercent(index * WORLD.tileWidth);
    room.style.width = worldPercent(WORLD.tileWidth);
    room.style.top = `${-WORLD.tileRaise * 100}%`;
    room.style.height = `${WORLD.tileWidth * 100}%`;
    world.prepend(room);
  }

  cat.style.width = worldPercent(WORLD.spriteWidth);
  cat.style.top = `${spriteTop * 100}%`;
  cat.style.transformOrigin = `50% ${SPRITE.ground * 100}%`;

  // 窝：一个扁垫子，比趴着的宠物略宽，中心落在脚底线上。
  const bed = $('bed');
  const bedWidth = WORLD.spriteWidth * 0.95;
  const bedHeight = bedWidth * WORLD.screenAspect * (52 / 200);
  bed.style.width = worldPercent(bedWidth);
  bed.style.left = worldPercent(SPOTS.bed.x - bedWidth / 2);
  bed.style.top = `${(GROUND_Y + 0.012 - bedHeight / 2) * 100}%`;

  // 碗：宠物站在饭碗这个地点吃饭时，舌尖正好落在碗里食物的远端边缘。
  const bowl = $('bowl');
  const bowlWidth = WORLD.spriteWidth * 0.23;
  const mouthX = SPOTS.bowl.x + (SPRITE.mouthWhenEating.x - 0.5) * WORLD.spriteWidth;
  bowl.style.width = worldPercent(bowlWidth);
  bowl.style.left = worldPercent(mouthX - bowlWidth * 0.56);
  bowl.style.top = `${(spriteTop + (SPRITE.mouthWhenEating.y - 0.02) * spriteHeight) * 100}%`;
}

// 镜头平滑地跟着宠物。用真实经过的时间计算，帧率变化时速度不变。
let lastCameraTime = null;
function followCamera(now) {
  const elapsed = lastCameraTime === null ? 0 : (now - lastCameraTime) / 1000;
  lastCameraTime = now;
  camera += (cameraTarget() - camera) * (1 - Math.exp(-elapsed / CAMERA_LAG));
  world.style.transform = `translateX(${((-camera / WORLD.width) * 100).toFixed(3)}%)`;
  requestAnimationFrame(followCamera);
}

// 「起步、匀速、停下」的位移曲线：开头和结尾各有一小段加速、减速。
// 正面/背面走是原地踏步视频，位移全靠网页推；起步再软一点，转身之后不显得在滑。
const EASED_CURVE = Array.from({ length: 97 }, (_, index) => {
  const t = index / 96;
  const ramp = 0.28;
  const full = 1 - ramp;
  if (t < ramp) return (t * t) / (2 * ramp) / full;
  if (t > 1 - ramp) return 1 - ((1 - t) * (1 - t)) / (2 * ramp) / full;
  return (t - ramp / 2) / full;
});

// 位移曲线是按帧记录的累计比例，按播放进度取值，两帧之间线性插值。
function curveAt(curve, progress) {
  const position = progress * (curve.length - 1);
  const index = Math.min(curve.length - 2, Math.floor(position));
  return curve[index] + (curve[index + 1] - curve[index]) * (position - index);
}

function nearestSpot(x) {
  return Object.values(SPOTS).find((spot) => Math.abs(spot.x - x) < 0.02) ?? null;
}

// ---------- 气泡和爱心 ----------

let bubbleTimer = null;

function showBubble(text) {
  bubble.textContent = text;
  bubble.hidden = false;
  // 重新触发出现动画
  bubble.style.animation = 'none';
  void bubble.offsetWidth;
  bubble.style.animation = '';
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => {
    bubble.hidden = true;
  }, 2600);
}

// x、y 是相对整个房间（不是舞台窗口）左上角的像素位置。
function spawnHearts(x, y) {
  for (let i = 0; i < 3; i += 1) {
    const heart = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    heart.setAttribute('viewBox', '0 0 24 24');
    heart.classList.add('heart');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', HEART_PATH);
    heart.appendChild(path);
    heart.style.left = `${x + (Math.random() - 0.5) * 36}px`;
    heart.style.top = `${y + (Math.random() - 0.5) * 20}px`;
    heart.style.setProperty('--drift', `${(Math.random() - 0.5) * 60}px`);
    heart.style.animationDelay = `${i * 90}ms`;
    heart.addEventListener('animationend', () => heart.remove());
    hearts.appendChild(heart);
  }
}

// ---------- 用户操作 ----------

// 用户刚给了指示，让它尽快有反应：
// 正在发呆（动作幅度很小的待机）就立刻打断，马上接下一个动作；
// 正在舔爪子、伸懒腰就赶紧收尾；
// 正在换姿态、转身或走动时不能硬切，剩下的部分播快一点。
function respondSoon() {
  const playing = window.petDebug?.playing;
  if (!playing) return;
  if (currentInterruptible) player.cut();
  else if (currentPastime) player.hurry(WRAP_UP);
  else if (HURRIED_TYPES.includes(playing.type)) player.hurry(HURRY);
}

// 点击后立刻给爱心和气泡，反应动作等当前片段播完再接上。
function pet(clientX, clientY) {
  const rect = world.getBoundingClientRect();
  spawnHearts(clientX - rect.left, clientY - rect.top);
  const queued = director.requestReaction('pet', performance.now());
  if (queued) {
    showBubble(pick(BUBBLES.onPet));
    respondSoon();
  }
  renderStatus();
}

function petAtHead() {
  const rect = cat.getBoundingClientRect();
  pet(rect.left + rect.width / 2, rect.top + rect.height * 0.35);
}

// 点地板叫它过来：点的左右位置和远近它都会照着走。
// 镜头跟着它，所以能点到的地方离它最多半屏多一点，还不够跑一段的距离；
// 因此双击表示「朝那边跑」：至少跑出一段跑步片段那么远，房间不够长时它会改成走。
function callTo(clientX, clientY, run) {
  const rect = stage.getBoundingClientRect();
  let x = camera + (clientX - rect.left) / rect.width;
  const y = (clientY - rect.top) / rect.height;
  if (run) {
    const direction = x < director.x ? -1 : 1;
    const sprint = CLIPS.find((clip) => clip.gait === 'run' && clip.direction === direction);
    const reach = Math.max(Math.abs(x - director.x), sprint.distance);
    x = clamp(director.x + direction * reach, WORLD.minX, WORLD.maxX);
  }
  director.requestMove(x, { y, run, loose: true });
  showBubble(pick(BUBBLES.onCall));
  respondSoon();
  renderStatus();
}

function bindControls() {
  $('catHit').addEventListener('click', (event) => {
    event.stopPropagation();
    // 用键盘触发时没有鼠标位置，爱心放在头上。
    if (event.detail === 0) petAtHead();
    else pet(event.clientX, event.clientY);
  });
  $('catHit').addEventListener('dblclick', (event) => event.stopPropagation());

  // 点地板：走过去；双击：跑过去（双击会先触发两次单击，跑的请求会替换掉走的）。
  stage.addEventListener('click', (event) => callTo(event.clientX, event.clientY, false));
  stage.addEventListener('dblclick', (event) => callTo(event.clientX, event.clientY, true));

  $('petButton').addEventListener('click', petAtHead);

  $('debugToggle').addEventListener('click', () => {
    const panel = $('panel');
    panel.hidden = !panel.hidden;
    $('debugToggle').setAttribute('aria-expanded', String(!panel.hidden));
  });

  // 一点喂食碗里就有食物，不用等它走到位；吃完才空。
  $('feedButton').addEventListener('click', () => {
    const queued = director.requestReaction('feed', performance.now());
    if (queued) {
      $('bowl').classList.add('filled');
      showBubble(pick(BUBBLES.onFeed));
      respondSoon();
    }
    renderStatus();
  });

  $('playButton').addEventListener('click', () => {
    const queued = director.requestReaction('play', performance.now());
    if (queued) {
      showBubble(pick(BUBBLES.onPlay));
      respondSoon();
    }
    renderStatus();
  });

  for (const [id, anchor] of Object.entries(ANCHORS)) {
    if (anchor.passing) continue;
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = anchor.label;
    button.dataset.goto = id;
    button.addEventListener('click', () => {
      director.requestAnchor(id);
      respondSoon();
      renderStatus();
    });
    $('gotoButtons').appendChild(button);
  }

  for (const [id, spot] of Object.entries(SPOTS)) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = spot.label;
    button.dataset.spot = id;
    button.addEventListener('click', () => {
      director.requestMove(spot.x, { y: spot.y });
      respondSoon();
      renderStatus();
    });
    $('spotButtons').appendChild(button);
  }
}

// ---------- 面板 ----------

function describePlace(x) {
  return nearestSpot(x)?.label ?? `离左墙 ${x.toFixed(2)} 屏`;
}

function describeRequest(request) {
  if (request.kind === 'reaction') return TRIGGER_LABELS[request.trigger] ?? request.trigger;
  const parts = [];
  if (request.x != null) parts.push(`${request.run ? '跑' : '走'}到${describePlace(request.x)}`);
  if (request.anchor) parts.push(`换成「${ANCHORS[request.anchor].label}」`);
  return parts.join('，');
}

function renderStatus() {
  $('statusAnchor').textContent = ANCHORS[director.anchor].label;
  $('statusPlace').textContent = describePlace(director.x);
  $('statusClip').textContent = currentClip ? currentClip.label : '-';
  $('statusQueue').textContent =
    director.queue.length > 0 ? director.queue.map(describeRequest).join('、') : '无';

  $('energyBar').style.width = `${director.energy}%`;
  $('energyValue').textContent = Math.round(director.energy);
  $('moodBar').style.width = `${director.mood}%`;
  $('moodValue').textContent = Math.round(director.mood);
  $('satietyBar').style.width = `${director.satiety}%`;
  $('satietyValue').textContent = Math.round(director.satiety);

  for (const item of $('anchors').children) {
    item.classList.toggle('current', item.dataset.anchor === director.anchor);
  }
}

function renderAnchors() {
  const list = $('anchors');
  for (const [id, anchor] of Object.entries(ANCHORS)) {
    const item = document.createElement('li');
    item.dataset.anchor = id;
    const image = document.createElement('img');
    image.src = anchor.image;
    image.alt = `${anchor.label}姿`;
    const name = document.createElement('strong');
    name.textContent = anchor.label;
    item.append(image, name);
    list.appendChild(item);
  }
}

function describeReason(reason, request, waitSeconds) {
  if (reason === 'autonomous') return '自主';
  if (reason === 'reaction') {
    return `响应${TRIGGER_LABELS[request.trigger]}，点击后 ${waitSeconds.toFixed(1)} 秒开始`;
  }
  if (request.kind === 'reaction') {
    return `为了响应${TRIGGER_LABELS[request.trigger]}，先${reason === 'move' ? '走过去' : '换姿态'}`;
  }
  if (request.auto) return `自主：${NOTE_LABELS[request.note] ?? '跑一跑'}`;
  return `按要求${describeRequest(request)}`;
}

function addLog(clip, reason, request) {
  const waitSeconds =
    reason === 'reaction' ? (performance.now() - request.requestedAt) / 1000 : null;
  history.push({ at: Date.now(), clipId: clip.id, reason, waitSeconds, x: director.x, y: director.y });

  const item = document.createElement('li');
  const time = document.createElement('time');
  time.textContent = new Date().toLocaleTimeString('zh-CN', { hour12: false });
  const text = document.createElement('div');
  text.textContent = clip.label;
  const why = document.createElement('span');
  why.className = 'reason';
  why.textContent = describeReason(reason, request, waitSeconds);
  text.appendChild(why);
  item.append(time, text);

  logList.prepend(item);
  while (logList.children.length > 30) logList.lastElementChild.remove();
}

// ---------- 主循环 ----------

function onClipStart(clip, reason, request) {
  currentClip = clip;
  addLog(clip, reason, request);
  renderStatus();
  cat.style.setProperty('--head-top', Math.min(ANCHORS[clip.from].headTop, ANCHORS[clip.to].headTop));

  // 自己决定去某处时，出发那一刻说一句为什么。
  if (request?.note && !request.announced) {
    request.announced = true;
    showBubble(pick(BUBBLES[request.note]));
    return;
  }
  const lines = BUBBLES[clip.id];
  if (!lines) return;
  if (clip.type === 'idle' && Math.random() > IDLE_BUBBLE_CHANCE) return;
  showBubble(pick(lines));
}

async function main() {
  // 侧身走、跑的片段各自前进多远、怎么加减速，是离线量好的。
  const motion = await (await fetch('assets/motion.json')).json();
  const sideMoves = CLIPS.filter((clip) => clip.type === 'move' && clip.direction);
  for (const clip of sideMoves) {
    clip.distance = motion[clip.id].distance * WORLD.spriteWidth;
    clip.curve = motion[clip.id].curve;
  }
  // 正面、背面走的片段量不出位移（它是朝着镜头走的），用一条「起步、匀速、停下」的曲线。
  for (const clip of CLIPS) {
    if (clip.type === 'move' && clip.depth) clip.curve = EASED_CURVE;
  }
  setSpots(sideMoves.map((clip) => clip.distance));

  director = new Director({
    anchors: ANCHORS,
    clips: CLIPS,
    spots: SPOTS,
    world: WORLD,
    scaleAt: depthScale,
    startAnchor: 'sit',
    startX: SPOTS.bed.x,
    startY: SPOTS.bed.y,
  });
  // 方便在浏览器控制台里查看和调试。playing 是调度器刚选定的片段，比 history 早一点更新。
  window.petDebug = { director, player, history, playing: null, spots: SPOTS, view: () => ({ catX, catY, camera }) };

  layoutRoom();
  placeCat(director.x, director.y);
  camera = cameraTarget();
  requestAnimationFrame(followCamera);
  renderAnchors();
  bindControls();
  renderStatus();

  await player.preload(CLIPS, (done, total) => {
    loading.textContent = `正在加载片段 ${done}/${total}`;
  });
  loading.hidden = true;

  let lastWasCut = false;
  let previousClip = null;
  for (;;) {
    const { clip, reason, request, move, rise } = director.next();
    window.petDebug.playing = clip;
    const startX = director.x;
    const startY = director.y;
    // 自己在发呆时可以被随时打断；为了响应用户的指示而做的准备动作播快一点，反应本身按正常速度。
    currentPastime = clip.type === 'idle' && reason === 'autonomous';
    currentInterruptible = currentPastime && clip.calm === true;
    const forUser = request !== null && !request.auto;
    const afterTurn = previousClip?.type === 'turn' && clip.type === 'move';
    const hold = afterTurn && (move || rise) ? MOVE_AFTER_TURN_HOLD : 0;
    const { seconds, wasCut } = await player.play(clip, {
      hurry: forUser && HURRIED_TYPES.includes(clip.type) ? HURRY : 1,
      // 转身接走动硬切，避免淡入期间底下那帧定格跟着位移滑出去。
      fadeMs: lastWasCut ? CUT_FADE_MS : afterTurn ? 0 : undefined,
      onStart: () => onClipStart(clip, reason, request),
      onFrame:
        move || rise
          ? (progress) => {
              const stepped = hold === 0 || progress <= hold ? 0 : (progress - hold) / (1 - hold);
              const done = curveAt(clip.curve, stepped);
              placeCat(startX + move * done, startY + rise * done);
            }
          : undefined,
    });
    lastWasCut = wasCut;
    previousClip = clip;
    director.finish(clip, seconds, move, rise);
    placeCat(director.x, director.y);
    // 吃完碗就空了；如果吃的过程中又点了一次喂食，食物留着等下一顿。
    const feedQueued = director.queue.some((queued) => queued.trigger === 'feed');
    if (clip.trigger === 'feed' && !feedQueued) $('bowl').classList.remove('filled');
    renderStatus();
  }
}

main().catch((error) => {
  console.error(error);
  loading.hidden = false;
  loading.textContent = `出错了：${error.message}`;
});
