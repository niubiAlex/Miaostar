// 把猫星网站从头走一遍：首页、居民墙、小五的主页（访客和主人）、示例猫、送一只新猫来、找不到的猫。
// 每一步截图，核对关键的东西在不在，页面报错也算失败。
// 用法：先启动本地服务（python3 scripts/serve.py 5173），再运行 node scripts/check_site.mjs
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SAMPLE_CATS } from '../src/site/cats.js';

const SITE = 'http://127.0.0.1:5173';
const WEB_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const SHOT_DIR = join(WEB_DIR, 'scripts', 'out', 'site');
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DEBUG_PORT = 9336;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let nextMessageId = 0;
const errors = [];
const failures = [];

function send(socket, method, params = {}) {
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
  const result = await send(socket, 'Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}

function expect(ok, what) {
  console.log(`${ok ? '✓' : '✗'} ${what}`);
  if (!ok) failures.push(what);
}

async function open(socket, path) {
  await send(socket, 'Page.navigate', { url: `${SITE}${path}` });
  await sleep(1500);
}

async function hover(socket, selector) {
  const point = await evaluate(socket, `(() => {
    const rect = document.querySelector('${selector}').getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  })()`);
  await send(socket, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x - 5, y: point.y });
  await send(socket, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y });
  await sleep(300);
}

async function shot(socket, name, { full = true } = {}) {
  const image = await send(socket, 'Page.captureScreenshot', { format: 'png', captureBeyondViewport: full });
  writeFileSync(join(SHOT_DIR, `${name}.png`), Buffer.from(image.data, 'base64'));
}

// 等小屋里的猫加载好（iframe 同源，可以直接看进去）。
const ROOM_READY = `new Promise((resolve) => {
  const started = Date.now();
  const check = () => {
    const room = document.querySelector('iframe')?.contentWindow;
    if (room?.homeDebug && room.document.getElementById('loading').hidden) resolve(true);
    else if (Date.now() - started > 20000) resolve(false);
    else setTimeout(check, 200);
  };
  check();
})`;

// 首页镜头飞完、文字出来了。
const ARRIVED = `new Promise((resolve) => {
  const started = Date.now();
  const check = () => {
    const panel = document.getElementById('worldPanel');
    if (panel?.classList.contains('shown') && !document.getElementById('worldView').classList.contains('moving')) resolve(true);
    else if (Date.now() - started > 12000) resolve(false);
    else setTimeout(check, 100);
  };
  check();
})`;
const CARD_INSIDE = `(() => {
  const rect = document.querySelector('.spot-card').getBoundingClientRect();
  return rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight;
})()`;
// 广场（思念湖那一块）整个在屏幕里。
const POND_INSIDE = `(() => {
  const rect = document.querySelector('.town-spots .spot[aria-label="思念湖"]').getBoundingClientRect();
  return rect.left >= -1 && rect.right <= innerWidth + 1 && rect.top >= -1 && rect.bottom <= innerHeight + 1;
})()`;
// 广场上的猫：至少有一只已经出来、视频在播（目前只留两只有动画的居民）。
const CATS_PLAYING = `new Promise((resolve) => {
  const started = Date.now();
  const check = () => {
    const playing = [...document.querySelectorAll('.town-cat.shown video.on')].filter((video) => video.readyState >= 2).length;
    if (playing >= 1) resolve(playing);
    else if (Date.now() - started > 10000) resolve(playing);
    else setTimeout(check, 200);
  };
  check();
})`;

mkdirSync(SHOT_DIR, { recursive: true });
const profile = mkdtempSync(join(tmpdir(), 'site-check-'));
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${profile}`,
  '--autoplay-policy=no-user-gesture-required', '--window-size=1280,900', '--no-first-run', 'about:blank',
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
  const target = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve) => socket.addEventListener('open', resolve));
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') {
      errors.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
    }
  });
  await send(socket, 'Page.enable');
  await send(socket, 'Runtime.enable');
  await send(socket, 'DOM.enable');

  console.log('— 首页：云海上的猫星 → 田园 → 猫城镇 → 落到广场');
  await send(socket, 'Page.navigate', { url: `${SITE}/` });
  await sleep(1000);
  await shot(socket, '00a_intro_planet', { full: false });
  await sleep(1500);
  await shot(socket, '00b_intro_country', { full: false });
  await sleep(1500);
  await shot(socket, '00c_intro_town', { full: false });
  expect(await evaluate(socket, 'document.getElementById("worldView").classList.contains("moving")'),
    '开场 4 秒时还在飞，没被跳过');
  expect(await evaluate(socket, ARRIVED), '开场动画落到广场');
  expect(await evaluate(socket, POND_INSIDE), '思念湖整个在屏幕里');
  expect((await evaluate(socket, 'document.querySelectorAll(".town-spots .spot.house").length')) === 128,
    '城镇里 128 间小屋都能点');
  expect((await evaluate(socket, CATS_PLAYING)) >= 1, '广场上至少有猫出来了，视频在播');
  await sleep(1500);
  await shot(socket, '01_home', { full: false });
  await shot(socket, '01a_home_later', { full: false });
  // 挑一间没被说明文字挡住、整个在屏幕里的屋（住着的优先，没有就空屋）。
  const visibleHouse = await evaluate(socket, `(() => {
    const free = document.getElementById('worldPanel').getBoundingClientRect().right;
    const visible = (spot) => {
      const rect = spot.getBoundingClientRect();
      return rect.left > free + 10 && rect.right < innerWidth - 10 && rect.top > 80 && rect.bottom < innerHeight - 80;
    };
    const occupied = [...document.querySelectorAll('.town-spots .spot.house:not(.empty)')].find(visible);
    const any = [...document.querySelectorAll('.town-spots .spot.house')].find(visible);
    return (occupied ?? any)?.id ?? null;
  })()`);
  expect(Boolean(visibleHouse), '广场上能看见至少一间小屋');
  await hover(socket, `#${visibleHouse}`);
  expect(await evaluate(socket, `document.querySelector(".spot-card").textContent.includes("${visibleHouse.slice(1)} 号 · ")`),
    `鼠标停在 ${visibleHouse.slice(1)} 号屋上浮出卡片`);
  await shot(socket, '01b_home_hover', { full: false });
  await hover(socket, '.town-spots .spot[href="/new"]:not(.house)');
  expect(await evaluate(socket, 'document.querySelector(".spot-card").textContent.includes("纸箱山")'), '纸箱山写着送它来猫星');
  expect(await evaluate(socket, CARD_INSIDE), '纸箱山的卡片不出屏幕');
  const pond = await evaluate(socket, `(() => {
    const rect = document.querySelector('.town-spots .spot[aria-label="思念湖"]').getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  })()`);
  for (let step = 0; step < 6; step += 1) {
    await send(socket, 'Input.dispatchMouseEvent', { type: 'mouseWheel', x: pond.x, y: pond.y, deltaX: 0, deltaY: -120 });
    await sleep(60);
  }
  await sleep(1200);
  await shot(socket, '01c_home_zoomed', { full: false });
  await sleep(1000);
  await shot(socket, '01c_home_zoomed_b', { full: false });

  console.log('— 城镇里飞，不换页');
  await evaluate(socket, 'window.samePage = true');
  await evaluate(socket, 'document.querySelector("[data-go=overview]").click()');
  expect(await evaluate(socket, ARRIVED), '点「看整座城镇」拉远');
  await shot(socket, '01g_overview', { full: false });
  await evaluate(socket, 'history.pushState(null, "", "/"); dispatchEvent(new PopStateEvent("popstate"))');
  expect(await evaluate(socket, ARRIVED), '回到广场');
  await evaluate(socket, `(() => {
    const link = document.createElement('a');
    link.href = '/house/60';
    document.body.append(link);
    link.click();
    link.remove();
  })()`);
  await sleep(650);
  await shot(socket, '01d_flying', { full: false });
  expect(await evaluate(socket, ARRIVED), '点去 60 号屋的链接，飞过去');
  expect(await evaluate(socket, 'location.pathname === "/house/60" && window.samePage === true'), '地址变成 /house/60，页面没重新加载');
  expect(await evaluate(socket, 'document.getElementById("houseName").textContent.startsWith("60 号 · ")'), '说明写着 60 号');
  expect(await evaluate(socket, 'document.getElementById("h60").classList.contains("flash")'), '60 号屋亮一下');
  await shot(socket, '01e_house', { full: false });
  await evaluate(socket, 'history.back()');
  expect(await evaluate(socket, ARRIVED), '浏览器后退');
  expect(await evaluate(socket, 'location.pathname === "/" && window.samePage === true'), '后退飞回广场，还是同一页');

  console.log('— 居民墙');
  await open(socket, '/cats');
  expect((await evaluate(socket, 'document.querySelectorAll(".cat-card").length')) === SAMPLE_CATS.length,
    `居民墙有 ${SAMPLE_CATS.length} 只猫`);
  await shot(socket, '02_cats');

  console.log('— 小五的主页，访客');
  await open(socket, '/xiaowu');
  expect(await evaluate(socket, 'document.querySelector("h1")?.textContent === "小五"'), '/xiaowu 是小五');
  expect(await evaluate(socket, 'document.body.textContent.includes("小鹿的猫")'), '写着是小鹿的猫');
  expect(await evaluate(socket, 'document.querySelector("iframe").src.includes("visitor")'), '访客看到的是只能看的小屋');
  expect(await evaluate(socket, ROOM_READY), '小屋里的猫加载好了');
  expect(await evaluate(socket, `getComputedStyle(document.querySelector('iframe').contentDocument
    .querySelector('.controls')).display === 'none'`), '访客看不到叫它、喂它的按钮');
  await sleep(2500);
  await shot(socket, '03_xiaowu_visitor');

  await evaluate(socket, 'document.querySelector("iframe").dataset.marker = "same"');
  const lightsBefore = await evaluate(socket, 'document.querySelector(".candle .count").textContent');
  await evaluate(socket, 'document.getElementById("lightButton").click()');
  const lightsAfter = await evaluate(socket, 'document.querySelector(".candle .count").textContent');
  expect(lightsBefore !== lightsAfter, `点灯后灯数变了（${lightsBefore} → ${lightsAfter}）`);
  expect(await evaluate(socket, 'document.getElementById("lightButton").disabled'), '同一个人只能点一次灯');
  await evaluate(socket, `(() => {
    const form = document.getElementById('messageForm');
    form.text.value = '小五，在喵星要好好吃饭';
    form.requestSubmit();
  })()`);
  expect(await evaluate(socket, 'document.querySelector(".messages li").textContent.includes("好好吃饭")'),
    '留言出现在最上面');
  expect(await evaluate(socket, 'document.querySelector("iframe").dataset.marker === "same"'), '点灯留言不会让小屋重新加载');
  await shot(socket, '04_xiaowu_lit');

  console.log('— 小五的主页，主人');
  await evaluate(socket, 'localStorage.setItem("miaostar:me", JSON.stringify({ name: "小鹿" }))');
  await open(socket, '/xiaowu');
  await sleep(1500);
  expect(await evaluate(socket, '!document.querySelector("iframe").src.includes("visitor")'), '主人看到的是能互动的小屋');
  expect(await evaluate(socket, ROOM_READY), '主人的小屋加载好了');
  expect(await evaluate(socket, `getComputedStyle(document.querySelector('iframe').contentDocument
    .querySelector('.controls')).display !== 'none'`), '主人能看到按钮');
  await sleep(2500);
  await shot(socket, '05_xiaowu_owner');

  console.log('— 送一只新猫来');
  await open(socket, '/new');
  expect(await evaluate(socket, 'document.getElementById("form").owner.value === "小鹿"'), '登录了就自动填好主人名字');
  await evaluate(socket, 'document.getElementById("form").requestSubmit()');
  expect(await evaluate(socket, '!document.getElementById("error").hidden'), '什么都不填会提示');
  const { root } = await send(socket, 'DOM.getDocument');
  const { nodeId } = await send(socket, 'DOM.querySelector', { nodeId: root.nodeId, selector: 'input[type=file]' });
  await send(socket, 'DOM.setFileInputFiles', { nodeId, files: [join(WEB_DIR, 'assets', 'site', 'cat_orange.jpg')] });
  await sleep(800);
  expect((await evaluate(socket, 'document.querySelectorAll("#photoPreview img").length')) === 1, '照片有预览');
  await evaluate(socket, `(() => {
    const form = document.getElementById('form');
    form.name.value = '大黄';
    form.slug.value = 'xiaowu';
    form.planetDay.value = '2026-11-01';
    form.birthday.value = '2015-04-02';
    form.coat.value = '橘猫';
    form.story.value = '它总在门口等我下班。\\n\\n胖胖的，最爱晒太阳。';
    form.requestSubmit();
  })()`);
  expect(await evaluate(socket, 'document.getElementById("error").textContent.includes("已经有猫住了")'), '地址重名会提示');
  await shot(socket, '07_new_form');
  await evaluate(socket, `(() => {
    const form = document.getElementById('form');
    form.slug.value = 'dahuang';
    form.requestSubmit();
  })()`);
  await sleep(1500);
  expect(await evaluate(socket, 'location.pathname === "/dahuang"'), '提交后跳到 /dahuang');
  expect(await evaluate(socket, 'Boolean(document.querySelector(".arriving"))'), '新猫显示正在路上');
  expect(await evaluate(socket, 'document.querySelectorAll(".story p").length === 2'), '故事分成两段');
  await shot(socket, '08_dahuang');
  await open(socket, '/cats');
  expect(await evaluate(socket, 'document.querySelector(".cat-card-name").textContent === "大黄"'), '新猫排在居民墙最前面');

  console.log('— 门牌');
  await open(socket, '/xiaowu');
  const address = await evaluate(socket, '[...document.querySelectorAll(".facts a")].find((a) => a.href.includes("/house/"))?.getAttribute("href")');
  expect(address === '/house/1', `小五的主页写着住址，点过去是 ${address}`);
  await open(socket, address);
  expect(await evaluate(socket, ARRIVED), '打开住址，开场后落到 1 号屋');
  expect(await evaluate(socket, 'document.getElementById("h1").classList.contains("flash")'), '从住址点过来，小五的屋会闪');
  await shot(socket, '09_house', { full: false });
  await open(socket, '/house/999');
  expect(await evaluate(socket, ARRIVED), '超出的门牌落到最后一间');
  expect(await evaluate(socket, 'location.pathname === "/house/128"'), `地址改成了最后一间（${await evaluate(socket, 'location.pathname')}）`);
  expect(await evaluate(socket, 'document.getElementById("houseName").textContent.includes("空屋")'), '最后一间是空屋');
  await shot(socket, '10_house_last', { full: false });

  console.log('— 找不到的猫');
  await open(socket, '/nobody');
  expect(await evaluate(socket, 'document.body.textContent.includes("喵星上还没有")'), '不存在的地址有提示');

  console.log('— 手机');
  await send(socket, 'Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await send(socket, 'Emulation.setTouchEmulationEnabled', { enabled: true });
  await send(socket, 'Emulation.setEmitTouchEventsForMouse', { enabled: true, configuration: 'mobile' });
  await open(socket, '/');
  expect(await evaluate(socket, ARRIVED), '手机上开场落到广场');
  expect(await evaluate(socket, POND_INSIDE), '手机上思念湖整个在屏幕里');
  await sleep(1500);
  await shot(socket, '11_mobile_home', { full: false });
  await evaluate(socket, 'document.getElementById("h2").click()');
  await sleep(500);
  expect(await evaluate(socket, '!document.querySelector(".spot-sheet").hidden'), '手机上点小屋弹出卡片');
  expect(await evaluate(socket, 'document.querySelector(".spot-card").hidden'), '手机上不会再冒出鼠标用的卡片');
  await shot(socket, '12_mobile_sheet', { full: false });
  await evaluate(socket, 'document.querySelector(".spot-sheet .close").click()');
  await evaluate(socket, 'document.querySelector("[data-go=overview]").click()');
  expect(await evaluate(socket, ARRIVED), '手机上看整座城镇');
  await shot(socket, '13_mobile_overview', { full: false });

  expect(errors.length === 0, `页面没有报错${errors.length ? `：${errors.join(' | ')}` : ''}`);
  socket.close();
} finally {
  chrome.kill();
  await sleep(300);
  rmSync(profile, { recursive: true, force: true });
}

console.log(failures.length ? `\n${failures.length} 项没通过` : '\n全部通过');
process.exitCode = failures.length ? 1 : 0;
