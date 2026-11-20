// 让小屋自己跑一阵，不断核对画面上的视频和它的摆法对不对得上（溜达片段要放大，别的不放大），
// 对不上就截图并打印当时的播放记录。
// 用法：先启动本地服务，再运行 node scripts/probe_home.mjs [秒数，默认 240]
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SECONDS = Number(process.argv[2] ?? 240);
// TIER 环境变量选档位：free、99、299。
const HOUR = process.env.HOUR ? `&hour=${process.env.HOUR}` : '';
const PAGE_URL = `http://127.0.0.1:5173/home.html?fast&tier=${process.env.TIER ?? '299'}${HOUR}`;
const SHOT_DIR = join(dirname(fileURLToPath(import.meta.url)), 'out', 'probe');
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DEBUG_PORT = 9335;
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
  const result = await send(socket, 'Runtime.evaluate', { expression, returnByValue: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}

// 在页面里核对：最上层（不透明）的那个视频，放的是不是溜达片段，摆法有没有放大。
const CHECK = `(() => {
  if (!window.homeDebug) return null;
  const videos = [...document.querySelectorAll('#cat video')];
  const front = videos.find((video) => video.style.zIndex === '2') ?? videos[0];
  const file = [...homeDebug.player.urls.entries()].find(([, url]) => url === front.src)?.[0] ?? '';
  const scaled = front.style.transform.includes('scale');
  const stroll = file.includes('stroll');
  return { file, transform: front.style.transform, bad: stroll !== scaled, playing: homeDebug.playing.name };
})()`;

mkdirSync(SHOT_DIR, { recursive: true });
const profile = mkdtempSync(join(tmpdir(), 'home-probe-'));
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${profile}`,
  '--autoplay-policy=no-user-gesture-required', '--window-size=480,760', '--no-first-run', 'about:blank',
], { stdio: 'ignore' });

try {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      if ((await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`)).ok) break;
    } catch {
      // 还没起来
    }
    await sleep(200);
  }
  const target = await (
    await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/new?${encodeURIComponent(PAGE_URL)}`, { method: 'PUT' })
  ).json();
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve) => socket.addEventListener('open', resolve));
  const started = Date.now();
  let problems = 0;
  // 时不时摸它、叫它、让它做事，模拟有人在玩。
  const pokes = ["request('reaction','pet')", "request('reaction','call')", "request('ask','eat')",
    "request('ask','scratch')", "request('ask','sleep')", "request('ask','play')"];
  let nextPoke = Date.now() + 8000;
  // POKE 环境变量：页面起来 5 秒后做一次这件事，比如 request('ask','eat')。
  let poked = !process.env.POKE;
  let readyAt = null;
  while (Date.now() - started < SECONDS * 1000) {
    const state = await evaluate(socket, CHECK);
    if (state !== null && readyAt === null) readyAt = Date.now();
    if (!poked && readyAt !== null && Date.now() - readyAt > 5000) {
      await evaluate(socket, `homeDebug.${process.env.POKE}`);
      poked = true;
    }
    if (state?.bad) {
      problems += 1;
      const image = await send(socket, 'Page.captureScreenshot', { format: 'png' });
      writeFileSync(join(SHOT_DIR, `bad_${problems}.png`), Buffer.from(image.data, 'base64'));
      const recent = await evaluate(socket, 'homeDebug.history.slice(-6).map((entry) => entry.name).join(" → ")');
      console.log(`第 ${problems} 次对不上：${JSON.stringify(state)}；最近：${recent}`);
      if (problems >= 5) break;
    }
    if (!process.env.QUIET && state !== null && Date.now() > nextPoke) {
      await evaluate(socket, `homeDebug.${pokes[Math.floor(Math.random() * pokes.length)]}`);
      nextPoke = Date.now() + 5000 + Math.random() * 10000;
    }
    await sleep(60);
  }
  const strolls = await evaluate(socket, 'homeDebug.history.filter((entry) => entry.name.startsWith("stroll")).length');
  console.log(`跑了 ${Math.round((Date.now() - started) / 1000)} 秒，溜达 ${strolls} 次，对不上 ${problems} 次`);
  const counts = await evaluate(socket, `Object.entries(homeDebug.history.reduce((all, entry) => {
    all[entry.name] = (all[entry.name] ?? 0) + 1;
    return all;
  }, {})).map(([name, count]) => name + '×' + count).join('、')`);
  console.log(`播过的片段：${counts}`);
  const status = await evaluate(socket, 'document.getElementById("status").textContent');
  console.log(`最后的状态：${status}`);
  const image = await send(socket, 'Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(SHOT_DIR, `last_${process.env.TIER ?? '299'}_${process.env.HOUR ?? 'now'}.png`), Buffer.from(image.data, 'base64'));
  socket.close();
} finally {
  chrome.kill();
  await sleep(300);
  rmSync(profile, { recursive: true, force: true });
}
