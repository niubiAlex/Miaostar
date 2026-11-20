// 用无界面 Chrome 跑一遍通用模型验证页：走、跑、吃、睡各截一张图，并量走路时脚掌贴地的那段时间滑了多少。
// 用法：先启动本地服务（python3 -m http.server 5173），再运行 node scripts/check_rig3d.mjs
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PAGE_URL = process.argv[2] ?? 'http://127.0.0.1:5173/rig3d.html';
const SHOT_DIR = join(dirname(fileURLToPath(import.meta.url)), 'out', 'rig3d');
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

async function shoot(socket, name) {
  const clip = await evaluate(
    socket,
    `(() => { const r = document.getElementById('stage').getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height, scale: 1 }; })()`,
  );
  const image = await send(socket, 'Page.captureScreenshot', { format: 'png', clip });
  mkdirSync(SHOT_DIR, { recursive: true });
  writeFileSync(join(SHOT_DIR, `${name}.png`), Buffer.from(image.data, 'base64'));
}

// 在页面里执行：让它沿一个方向走（或跑）一段，逐帧记下身体和左前脚掌的位置，
// 返回脚掌贴地期间它在地面上滑了多少（相对身体同期前进的距离，0 是完全不滑）。
function measureSlide(x, z, run) {
  return new Promise((resolve) => {
    const { cat, goTo, pawWorld } = window.rigDebug;
    const samples = [];
    goTo(x, z, { run });
    const tick = () => {
      if (cat.doing !== 'move') {
        // 开头转身、结尾停步的部分不算，只看中间走直线的那段。
        const steady = samples.slice(Math.floor(samples.length * 0.25), Math.floor(samples.length * 0.85));
        const heights = steady.map((sample) => sample.paw.y);
        const low = Math.min(...heights);
        const ground = low + 0.15 * (Math.max(...heights) - low);
        let slid = 0;
        let travelled = 0;
        for (let index = 1; index < steady.length; index += 1) {
          const [before, now] = [steady[index - 1], steady[index]];
          if (before.paw.y > ground || now.paw.y > ground) continue;
          slid += Math.hypot(now.paw.x - before.paw.x, now.paw.z - before.paw.z);
          travelled += Math.hypot(now.body.x - before.body.x, now.body.z - before.body.z);
        }
        resolve({ frames: steady.length, slideRatio: Number((slid / travelled).toFixed(3)) });
        return;
      }
      const paw = pawWorld();
      samples.push({ paw: { x: paw.x, y: paw.y, z: paw.z }, body: { x: cat.root.position.x, z: cat.root.position.z } });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

const profile = mkdtempSync(join(tmpdir(), 'rig-check-'));
const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${profile}`,
    '--window-size=540,960',
    '--no-first-run',
    'about:blank',
  ],
  { stdio: 'ignore' },
);

try {
  for (let attempt = 0; ; attempt += 1) {
    try {
      if ((await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`)).ok) break;
    } catch {
      if (attempt > 50) throw new Error('Chrome 没有在 10 秒内启动调试端口');
    }
    await sleep(200);
  }
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

  const waitFor = async (expression, timeoutMs = 30000) => {
    const start = Date.now();
    while (!(await evaluate(socket, expression))) {
      if (Date.now() - start > timeoutMs) throw new Error(`等不到：${expression}`);
      await sleep(100);
    }
  };
  // 把机位临时拉近，看清脸和花纹；用完恢复。
  const closeUp = async (name, distance) => {
    await evaluate(
      socket,
      `(() => { const d = window.rigDebug; d.saved = { ...d.views.angled, look: d.lookAt.clone() };
        d.views.angled.distance = ${distance}; d.lookAt.copy(d.cat.root.position).setY(0.38); })()`,
    );
    await sleep(1800);
    await shoot(socket, name);
    await evaluate(
      socket,
      `(() => { const d = window.rigDebug; d.views.angled.distance = d.saved.distance; d.lookAt.copy(d.saved.look); })()`,
    );
    await sleep(1200);
  };

  await waitFor('!!window.rigDebug');
  const speed = await evaluate(socket, 'window.rigDebug.cat.speed');
  await sleep(1500);
  await shoot(socket, 'sitting');
  await closeUp('sitting_close', 3.6);

  const walk = await evaluate(socket, `(${measureSlide.toString()})(1.0, 0.9, false)`);
  await evaluate(socket, 'window.rigDebug.goTo(-1.0, -0.6)');
  await sleep(2500);
  await shoot(socket, 'walking');
  await waitFor(`window.rigDebug.cat.doing !== 'move'`);
  const run = await evaluate(socket, `(${measureSlide.toString()})(1.0, 0.9, true)`);

  await evaluate(socket, 'window.rigDebug.feed()');
  await sleep(700);
  await shoot(socket, 'running');
  await waitFor(`window.rigDebug.cat.doing === 'eat'`);
  await sleep(1500);
  await shoot(socket, 'eating');

  await evaluate(socket, 'window.rigDebug.goToBed()');
  await waitFor(`window.rigDebug.cat.doing === 'sleep'`, 60000);
  await sleep(1500);
  await shoot(socket, 'sleeping');
  await closeUp('sleeping_close', 3.6);

  await evaluate(socket, `window.rigDebug.rest(); window.rigDebug.setView('front')`);
  await sleep(2500);
  await shoot(socket, 'front_view');
  await evaluate(socket, `document.getElementById('coatOriginal').click(); window.rigDebug.setView('angled')`);
  await sleep(2500);
  await shoot(socket, 'original_coat');
  socket.close();

  console.log(JSON.stringify({ speed, walk, run }, null, 2));
  if (pageErrors.length > 0) console.log(`页面报错：\n${pageErrors.join('\n')}`);
  process.exitCode = pageErrors.length > 0 ? 1 : 0;
} finally {
  chrome.kill();
  await sleep(300);
  rmSync(profile, { recursive: true, force: true });
}
