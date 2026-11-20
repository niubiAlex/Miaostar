// 用无界面 Chrome 实际跑一遍房间版播放器，检查走动、衔接和响应时间，并在几个关键时刻截图。
// 用法：先启动本地服务（python3 -m http.server 5173），再运行 node scripts/check_player.mjs
// 脚打滑、动作自不自然这类问题脚本看不出来，要人看截图和实际页面。
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PAGE_URL = process.argv[2] ?? 'http://127.0.0.1:5173/';
const SHOT_DIR = join(dirname(fileURLToPath(import.meta.url)), 'out');
const CHROME =
  process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DEBUG_PORT = 9333;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// 要截的画面：某个片段播到一定进度时截一张。page 为真时截整个页面，否则只截舞台。
const SHOTS = [
  { name: 'start', clip: 'sit_idle', delayMs: 800, page: true },
  { name: 'running', clip: 'run_l', delayMs: 1500 },
  { name: 'eating', clip: 'stand_eat', delayMs: 2200 },
  { name: 'walking', clip: 'walk_r', delayMs: 1400 },
  { name: 'turning', clip: 'turn_r_to_l', delayMs: 900 },
  { name: 'sleeping', clip: 'sleep_petted', delayMs: 1500 },
  { name: 'playing', clip: 'sit_play', delayMs: 2000 },
  { name: 'petted', clip: 'sit_petted', delayMs: 2000 },
  { name: 'walking_away', clip: 'walk_b', delayMs: 2600 },
  { name: 'walking_closer', clip: 'walk_f', delayMs: 2600 },
  { name: 'turning_away', clip: 'turn_l_to_b', delayMs: 1300 },
  // 下面三个是它自己找事做时才会播的，这一遍没碰上就截不到。
  { name: 'grooming', clip: 'sit_groom', delayMs: 2200 },
  { name: 'watching', clip: 'sit_watch', delayMs: 2000 },
  { name: 'stretching', clip: 'stand_stretch', delayMs: 2200 },
];

// 在页面里执行的场景：在窝里发呆时被摸 → 喂食（跑到饭碗）→ 站着被摸 → 走回窝 → 双击地板朝左跑 →
// 回窝睡觉 → 睡着被摸 → 坐起来玩球 → 舔爪子或张望到一半被摸。全程逐帧采样。
async function scenario() {
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  for (let attempt = 0; attempt < 100 && !window.petDebug; attempt += 1) await wait(100);
  if (!window.petDebug) throw new Error('页面没有加载出播放器');
  const debug = window.petDebug;
  const { director, spots } = debug;
  const until = async (test, timeoutMs) => {
    const start = performance.now();
    while (!test()) {
      if (performance.now() - start > timeoutMs) return false;
      await wait(50);
    }
    return true;
  };
  const timedOut = [];
  const step = async (name, test, timeoutMs) => {
    if (!(await until(test, timeoutMs))) timedOut.push(name);
  };
  const played = (clipId, fromIndex) =>
    debug.history.slice(fromIndex).some((entry) => entry.clipId === clipId);
  const idle = () => director.queue.length === 0;

  await step('第一个片段开始', () => debug.history.length > 0, 15000);
  await wait(600); // 等最开始的淡入结束，之后舞台上应该始终有画面

  const stage = document.getElementById('stage');
  const cat = document.getElementById('cat');
  const bowl = document.getElementById('bowl');
  const videos = [...cat.querySelectorAll('video')];
  let lastEnded = null;
  const switchGapsMs = [];
  for (const video of videos) {
    video.addEventListener('ended', () => {
      lastEnded = performance.now();
    });
    video.addEventListener('playing', () => {
      if (lastEnded === null) return;
      switchGapsMs.push(Math.round(performance.now() - lastEnded));
      lastEnded = null;
    });
  }

  let frames = 0;
  let blankFrames = 0; // 两个视频都不显示：宠物消失
  let ghostFrames = 0; // 淡入结束后两个视频还都显示：身后留着上一个姿态
  let mismatchFrames = 0; // 画面上的片段不是逻辑上正在播的片段
  let offScreenFrames = 0; // 宠物的中心不在镜头里
  let sampling = true;
  let lastFront = null;
  let frontSince = 0;
  const sampleStart = performance.now();
  const tick = () => {
    frames += 1;
    const opacity = videos.map((video) => parseFloat(getComputedStyle(video).opacity));
    const front = videos.find((video) => video.style.zIndex === '2');
    if (!videos.some((video, i) => video.readyState >= 2 && opacity[i] >= 0.999)) blankFrames += 1;
    // 淡入最长 220 毫秒；换片段过了 400 毫秒两个视频还都显示，就是残影。按真实时间算，
    // 不按片段里的时间：片段可能在加速播放。
    if (front !== lastFront) {
      lastFront = front;
      frontSince = performance.now();
    }
    if (opacity.every((value) => value > 0.02) && performance.now() - frontSince > 400) ghostFrames += 1;
    if (front.src !== debug.player.urls.get(debug.player.showing)) mismatchFrames += 1;
    const stageRect = stage.getBoundingClientRect();
    const catRect = cat.getBoundingClientRect();
    const center = (catRect.left + catRect.width / 2 - stageRect.left) / stageRect.width;
    if (center < 0 || center > 1) offScreenFrames += 1;
    if (sampling) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  const click = (id) => document.getElementById(id).click();
  const goTo = (anchor) => document.querySelector(`[data-goto="${anchor}"]`).click();
  const at = (spot) => director.isAt(spots[spot].x);
  const results = {};

  // 从点下去到第一个新片段开始播，过了多少秒。
  const secondsUntilNextClip = async (act) => {
    const before = debug.history.length;
    const clickedAt = performance.now();
    act();
    await until(() => debug.history.length > before, 15000);
    return Number(((performance.now() - clickedAt) / 1000).toFixed(2));
  };
  const waitOf = (clipId, fromIndex) =>
    Number(debug.history.slice(fromIndex).find((entry) => entry.clipId === clipId)?.waitSeconds.toFixed(1));

  // 1. 在窝里坐着发呆时被摸：发呆到一半也要立刻回应，而且是原地回应
  await step('开始发呆', () => debug.playing.id === 'sit_idle', 60000);
  await wait(1500);
  let mark = debug.history.length;
  results.petStartsAfterSeconds = await secondsUntilNextClip(() => click('petButton'));
  results.pettedAtOnce = debug.history[mark]?.clipId === 'sit_petted' && results.petStartsAfterSeconds < 0.6;
  results.pettedAtBed = at('bed');
  await step('被摸的反应播完', () => debug.history.length > mark + 1, 15000);

  // 2. 喂食：碗里立刻有食物，它马上起身、跑到饭碗再吃，吃完碗空
  await step('回到发呆', () => debug.playing.type === 'idle' && debug.playing.calm === true, 60000);
  await wait(1000);
  mark = debug.history.length;
  results.feedStartsAfterSeconds = await secondsUntilNextClip(() => click('feedButton'));
  results.movedAtOnceForFood = results.feedStartsAfterSeconds < 0.6;
  results.bowlFilledOnClick = bowl.classList.contains('filled');
  await step('跑到饭碗开始吃', () => played('stand_eat', mark), 60000);
  results.ateAtBowl = at('bowl');
  results.ranToBowl = played('run_l', mark);
  results.eatingStartsAfterSeconds = waitOf('stand_eat', mark);
  await wait(600);
  results.bowlFilledWhileEating = bowl.classList.contains('filled');
  await step('吃完', () => debug.history.at(-1).clipId !== 'stand_eat', 15000);
  results.bowlEmptyAfterEating = !bowl.classList.contains('filled');

  // 3. 站着被摸：原地回应，不换姿态。它可能自己坐下，所以不在站姿时叫它站起来。
  const settledAt = (anchor) => () => {
    const { playing } = debug;
    if (!idle()) return false;
    if (playing.from === anchor && playing.to === anchor) return true;
    if (playing.to !== anchor) goTo(anchor);
    return false;
  };
  await step('站定', settledAt('stand'), 40000);
  mark = debug.history.length;
  click('petButton');
  await step('站着被摸', () => played('stand_petted', mark), 15000);
  const reactionAt = debug.history.findIndex((entry, i) => i >= mark && entry.clipId === 'stand_petted');
  results.pettedInPlace = debug.history.slice(mark, reactionAt).every((entry) => entry.reason !== 'path');

  // 4. 走回窝
  document.querySelector('[data-spot="bed"]').click();
  await step('走回窝', () => at('bed') && idle(), 90000);

  // 4b. 点它正后方的地板：转成背面往里走，变小；再点正前方：转成正面走回来，变大
  const stageRect = stage.getBoundingClientRect();
  const clickFloor = (height) => {
    const catRect = cat.getBoundingClientRect();
    stage.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      clientX: catRect.left + catRect.width / 2,
      clientY: stageRect.top + stageRect.height * height,
    }));
  };
  // 跑了几趟它已经有点困了，会自己回窝；先把精力补满，免得它中途走开。
  director.energy = 90;
  const widthAtBed = cat.getBoundingClientRect().width;
  // 某个片段播完、下一个片段开始的那一刻。
  const finished = (clipId, fromIndex) => () => {
    const index = debug.history.findIndex((entry, i) => i >= fromIndex && entry.clipId === clipId);
    return index !== -1 && debug.history.length > index + 1;
  };
  mark = debug.history.length;
  clickFloor(0.56);
  await step('往里走', finished('walk_b', mark), 60000);
  results.walkedAway = director.y < 0.60;
  const widthWhenFar = cat.getBoundingClientRect().width;
  results.smallerWhenFar = widthWhenFar < widthAtBed * 0.8;
  await step('往里走完转回来', () => idle() && debug.playing.type === 'idle', 30000);
  mark = debug.history.length;
  clickFloor(0.87);
  await step('走回来', () => played('walk_f', mark) && idle() && debug.playing.type === 'idle', 60000);
  results.walkedCloser = director.y > 0.74;
  results.biggerWhenNear = cat.getBoundingClientRect().width > widthWhenFar * 1.2;
  document.querySelector('[data-spot="bed"]').click();
  await step('再回窝', () => at('bed') && Math.abs(director.y - spots.bed.y) < 0.02 && idle(), 90000);

  // 5. 双击左边的地板：朝左跑
  mark = debug.history.length;
  stage.dispatchEvent(
    new MouseEvent('dblclick', { bubbles: true, clientX: stageRect.left + 20, clientY: stageRect.bottom - 40 }),
  );
  await step('朝左跑', () => played('run_l', mark) && idle(), 60000);
  results.ranLeft = played('run_l', mark);

  // 6. 让它去睡觉：睡觉只在窝里，所以要先走回窝
  goTo('sleep');
  await step('回窝睡着', () => director.anchor === 'sleep', 120000);
  results.sleptInBed = director.anchor === 'sleep' && at('bed');

  // 7. 睡着时被摸：不叫醒它
  await wait(800);
  mark = debug.history.length;
  click('petButton');
  await step('睡着被摸', () => played('sleep_petted', mark), 15000);
  await wait(2500);
  results.stayedAsleep = director.anchor === 'sleep';

  // 后面要看它醒着时的表现。跑了这么多趟它已经困了，会自己回去睡，所以先把精力补满。
  director.energy = 90;

  // 8. 坐起来玩球
  goTo('sit');
  await step('坐起来', () => director.anchor === 'sit', 40000);
  mark = debug.history.length;
  click('playButton');
  await step('玩球', () => played('sit_play', mark), 20000);
  await step('玩完', () => debug.history.at(-1).clipId !== 'sit_play' && idle(), 15000);

  // 9. 舔爪子、张望这类动作幅度大的待机播到一半被摸：不能硬切，但要很快收尾再回应
  const busy = () => {
    const { playing } = debug;
    const started = debug.history.at(-1)?.clipId === playing.id;
    if (playing.type === 'idle' && !playing.calm && playing.from === 'sit' && started) return true;
    if (idle() && playing.to !== 'sit') goTo('sit');
    return false;
  };
  await step('自己找事做', busy, 180000);
  results.busyWith = debug.playing.id;
  await wait(1000);
  mark = debug.history.length;
  results.petWhileBusyStartsAfterSeconds = await secondsUntilNextClip(() => click('petButton'));
  results.wrappedUpQuickly =
    debug.history[mark]?.clipId === 'sit_petted' && results.petWhileBusyStartsAfterSeconds < 2.5;
  await wait(4500);

  sampling = false;
  const seconds = (performance.now() - sampleStart) / 1000;
  const moves = debug.history.filter((entry) => entry.clipId.startsWith('walk') || entry.clipId.startsWith('run'));
  return {
    timedOut,
    seconds: Number(seconds.toFixed(1)),
    frames,
    framesPerSecond: Number((frames / seconds).toFixed(1)),
    blankFrames,
    ghostFrames,
    mismatchFrames,
    offScreenFrames,
    ...results,
    moveClips: moves.length,
    switchGapsMs: { count: switchGapsMs.length, max: Math.max(...switchGapsMs), all: switchGapsMs.join(' ') },
    played: debug.history
      .map((entry) => {
        const wait = entry.waitSeconds === null ? '' : `（等 ${entry.waitSeconds.toFixed(1)} 秒）`;
        return `${entry.clipId}${wait}@${entry.x.toFixed(2)},${entry.y.toFixed(2)}`;
      })
      .join(' → '),
  };
}

async function waitForChrome() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
      if (response.ok) return;
    } catch {
      // 还没起来，继续等
    }
    await sleep(200);
  }
  throw new Error('Chrome 没有在 10 秒内启动调试端口');
}

let nextMessageId = 0;

function send(socket, method, params) {
  nextMessageId += 1;
  const id = nextMessageId;
  return new Promise((resolve, reject) => {
    const onMessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== id) return;
      socket.removeEventListener('message', onMessage);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
    };
    socket.addEventListener('message', onMessage);
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(socket, expression) {
  const result = await send(socket, 'Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}

// 场景运行期间，等某个片段开始播，过 delayMs 后截图。场景结束还没等到就放弃。
async function captureDuring(socket, shot, scenarioDone) {
  const current = 'window.petDebug?.history.at(-1)?.clipId ?? null';
  while (!scenarioDone.value) {
    if ((await evaluate(socket, current)) === shot.clip) {
      await sleep(shot.delayMs);
      const params = { format: 'png' };
      if (!shot.page) {
        params.clip = await evaluate(
          socket,
          `(() => { const r = document.getElementById('stage').getBoundingClientRect();
            return { x: r.x, y: r.y, width: r.width, height: r.height, scale: 1 }; })()`,
        );
      }
      const image = await send(socket, 'Page.captureScreenshot', params);
      mkdirSync(SHOT_DIR, { recursive: true });
      writeFileSync(join(SHOT_DIR, `${shot.name}.png`), Buffer.from(image.data, 'base64'));
      return shot.name;
    }
    await sleep(100);
  }
  return null;
}

const profile = mkdtempSync(join(tmpdir(), 'pet-check-'));
const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${profile}`,
    '--autoplay-policy=no-user-gesture-required',
    '--window-size=430,860',
    '--no-first-run',
    'about:blank',
  ],
  { stdio: 'ignore' },
);

try {
  await waitForChrome();
  const target = await (
    await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/new?${encodeURIComponent(PAGE_URL)}`, {
      method: 'PUT',
    })
  ).json();
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve);
    socket.addEventListener('error', () => reject(new Error('连接 Chrome 调试端口失败')));
  });
  await send(socket, 'Runtime.enable');
  const pageErrors = [];
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') {
      pageErrors.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
    }
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
      pageErrors.push(message.params.args.map((arg) => arg.description ?? arg.value).join(' '));
    }
  });

  const scenarioDone = { value: false };
  const shots = SHOTS.map((shot) => captureDuring(socket, shot, scenarioDone));
  const result = await evaluate(socket, `(${scenario.toString()})()`);
  scenarioDone.value = true;
  const captured = (await Promise.all(shots)).filter(Boolean);
  socket.close();

  console.log(JSON.stringify(result, null, 2));
  console.log(`截图（${SHOT_DIR}）：${captured.join('、') || '无'}`);
  const missedShots = SHOTS.filter((shot) => !captured.includes(shot.name)).map((shot) => shot.name);
  if (missedShots.length > 0) console.log(`没截到：${missedShots.join('、')}`);
  if (pageErrors.length > 0) console.log(`页面报错：\n${pageErrors.join('\n')}`);

  const expectations = [
    'pettedAtOnce', 'pettedAtBed', 'movedAtOnceForFood', 'bowlFilledOnClick', 'ateAtBowl', 'ranToBowl',
    'bowlFilledWhileEating', 'bowlEmptyAfterEating', 'pettedInPlace', 'ranLeft', 'sleptInBed', 'stayedAsleep',
    'wrappedUpQuickly', 'walkedAway', 'smallerWhenFar', 'walkedCloser', 'biggerWhenNear',
  ];
  const unmet = expectations.filter((name) => result[name] !== true);
  if (unmet.length > 0) console.log(`没达到预期：${unmet.join('、')}`);
  const failed =
    result.timedOut.length > 0 ||
    result.blankFrames > 0 ||
    result.ghostFrames > 0 ||
    result.mismatchFrames > 0 ||
    result.offScreenFrames > 0 ||
    unmet.length > 0 ||
    pageErrors.length > 0;
  process.exitCode = failed ? 1 : 0;
} finally {
  chrome.kill();
  await sleep(300);
  rmSync(profile, { recursive: true, force: true });
}
