// 用无界面 Chrome 把 45° 小屋跑一遍：吃饭、玩球、睡觉、睡着被摸、被叫醒、出门、回来、出门路上被摸，
// 每一步截图，最后打印播放顺序和响应时间。
// 用法：先启动本地服务（在 web/ 下 python3 -m http.server 5173），再运行 node scripts/check_home.mjs
// 脚打不打滑、像不像这类问题脚本看不出来，要人看截图和实际页面。
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// 固定在中午：不在饭点、不在夜里，它不会自己去睡、去等饭、去夜游，好按顺序检查。
const PAGE_URL = process.argv[2] ?? 'http://127.0.0.1:5173/home.html?fast&hour=12.5';
const SHOT_DIR = join(dirname(fileURLToPath(import.meta.url)), 'out', 'home');
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DEBUG_PORT = 9334;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
  const result = await send(socket, 'Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}

async function waitForChrome() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      if ((await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`)).ok) return;
    } catch {
      // 还没起来，继续等
    }
    await sleep(200);
  }
  throw new Error('Chrome 没有在 10 秒内启动调试端口');
}

const profile = mkdtempSync(join(tmpdir(), 'home-check-'));
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${profile}`,
  '--autoplay-policy=no-user-gesture-required', '--window-size=480,760', '--no-first-run', 'about:blank',
], { stdio: 'ignore' });

try {
  await waitForChrome();
  const target = await (
    await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/new?${encodeURIComponent(PAGE_URL)}`, { method: 'PUT' })
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

  mkdirSync(SHOT_DIR, { recursive: true });
  const shots = [];
  const shoot = async (name) => {
    const image = await send(socket, 'Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(SHOT_DIR, `${name}.png`), Buffer.from(image.data, 'base64'));
    shots.push(name);
  };
  const timedOut = [];
  // 等页面里的条件成立。
  const until = async (name, condition, timeoutMs = Number(process.env.TIMEOUT ?? 60000)) => {
    const started = Date.now();
    while (!(await evaluate(socket, `Boolean(window.homeDebug && (${condition}))`))) {
      if (Date.now() - started > timeoutMs) {
        timedOut.push(name);
        return false;
      }
      await sleep(100);
    }
    return true;
  };
  const playingClip = (name) => `homeDebug.playing.name === '${name}'`;
  const ask = (what) => evaluate(socket, `homeDebug.request('ask', '${what}')`);
  const react = (kind) => evaluate(socket, `homeDebug.request('reaction', '${kind}')`);
  // 从发出请求到某个片段开始播，过了多少秒。
  const secondsUntil = async (name, clip) => {
    const started = Date.now();
    await until(name, playingClip(clip), 30000);
    return Number(((Date.now() - started) / 1000).toFixed(1));
  };
  const results = {};

  await until('页面加载', 'homeDebug.history.length > 0', 30000);
  await sleep(1200);
  await shoot('01_start');

  await ask('eat');
  await until('开始吃饭', playingClip('eat_bowl'));
  results.ateAtBowl = await evaluate(socket, 'document.getElementById("bowl").classList.contains("shown")');
  await sleep(2400);
  await shoot('02_eating');
  await until('吃完收碗', '!document.getElementById("bowl").classList.contains("shown")');

  await ask('play');
  await until('开始玩球', playingClip('play_ball'));
  await sleep(2300);
  await shoot('03_playing');

  // 站着被摸、被叫。
  await until('玩完', '!homeDebug.playing.name || homeDebug.playing.name !== "play_ball"');
  // 压住自发吃饭睡觉，否则它可能已经趴下，摸它就不会播 petted。
  await evaluate(socket, 'Object.assign(homeDebug.cat, { hunger: 0, tiredness: 0 })');
  await until('醒着', '!homeDebug.cat.asleep');
  await react('pet');
  results.petSeconds = await secondsUntil('被摸', 'petted');
  await sleep(1800);
  await shoot('04_petted');
  await until('摸完', 'homeDebug.playing.name !== "petted"');
  await react('call');
  results.callSeconds = await secondsUntil('被叫', 'called');
  await sleep(1800);
  await shoot('05_called');

  await ask('sleep');
  await until('窝出现', 'document.getElementById("bed").classList.contains("shown")');
  await sleep(500);
  await shoot('06_bed_appears');
  await until('趴下', playingClip('settle_fl'));
  await sleep(2000);
  await shoot('07_settling');
  await until('睡着', 'homeDebug.cat.asleep');
  await sleep(1500);
  await shoot('08_sleeping');
  await react('pet');
  await sleep(700);
  await shoot('09_petted_asleep');
  results.stayedAsleepWhenPetted = await evaluate(socket, 'homeDebug.cat.asleep');
  await react('call');
  results.wakeSeconds = await secondsUntil('被叫醒', 'wake_up');
  results.calledAfterWakeSeconds = await secondsUntil('醒来应一声', 'called');
  results.awakeAfterCall = await evaluate(socket, '!homeDebug.cat.asleep');

  await ask('out');
  await until('朝门走', playingClip('walk_br'));
  await sleep(1000);
  for (let i = 0; i < 6; i += 1) {
    await shoot(`10_walking_to_door_${i}`);
    await sleep(120);
  }
  await until('出门', '!document.getElementById("doorCover").hidden');
  await sleep(1800);
  await shoot('11_through_door');
  await until('出去了', 'homeDebug.cat.out');
  await sleep(600);
  await shoot('12_away');
  await until('回来', '!document.getElementById("doorCover").hidden && homeDebug.playing.name === "walk_fl"');
  await sleep(1500);
  await shoot('13_coming_back');
  await until('进屋', '!homeDebug.cat.out');

  await ask('scratch');
  await until('开始抓板', playingClip('scratch'));
  await sleep(2400);
  await shoot('15_scratching');
  await until('抓完', 'homeDebug.playing.name !== "scratch"');
  await ask('out');
  await until('走到门口', '!document.getElementById("doorCover").hidden');
  // 连拍穿过门洞的过程。
  for (let i = 0; i < 6; i += 1) {
    await sleep(700);
    await shoot(`17_door_${i}`);
  }
  await until('又出去了', 'homeDebug.cat.out');
  await until('又回来', '!document.getElementById("doorCover").hidden && homeDebug.playing.name === "walk_fl"');
  for (let i = 0; i < 5; i += 1) {
    await sleep(700);
    await shoot(`18_back_${i}`);
  }
  await until('又进屋', '!homeDebug.cat.out');
  await sleep(1500);

  // 出门路上被摸：要在最近的可停帧停下，而不是走到门口。先让它回到中间抓板，离门远一点。
  await ask('scratch');
  await until('回中间抓板', playingClip('scratch'));
  await until('抓完', 'homeDebug.playing.name !== "scratch"');
  await ask('out');
  await until('朝门走', playingClip('walk_br'));
  await sleep(300);
  await react('pet');
  results.petWhileWalkingSeconds = await secondsUntil('走到一半被摸', 'petted');
  results.stoppedHalfway = await evaluate(socket, 'homeDebug.cat.pos.x < 440');
  await sleep(4500);
  await shoot('14_after_walk_petted');

  // 溜达：它自己会溜达，等着拍几张。
  if (await until('溜达', 'homeDebug.playing.name?.startsWith("stroll")', 90000)) {
    for (let i = 0; i < 4; i += 1) {
      await sleep(1100);
      await shoot(`19_stroll_${i}`);
    }
  }

  results.played = await evaluate(
    socket, 'homeDebug.history.map((entry) => `${entry.name}@${entry.s}`).join(" → ")',
  );
  socket.close();

  console.log(JSON.stringify({ timedOut, ...results }, null, 2));
  console.log(`截图（${SHOT_DIR}）：${shots.join('、')}`);
  if (pageErrors.length > 0) console.log(`页面报错：\n${pageErrors.join('\n')}`);
  const expectations = ['ateAtBowl', 'stayedAsleepWhenPetted', 'awakeAfterCall', 'stoppedHalfway'];
  const unmet = expectations.filter((name) => results[name] !== true);
  if (unmet.length > 0) console.log(`没达到预期：${unmet.join('、')}`);
  process.exitCode = timedOut.length > 0 || unmet.length > 0 || pageErrors.length > 0 ? 1 : 0;
} finally {
  chrome.kill();
  await sleep(300);
  rmSync(profile, { recursive: true, force: true });
}
