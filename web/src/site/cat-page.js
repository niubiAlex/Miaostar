// Cat page: the room fills the first screen (name, lantern and sound float in it); story, details and messages below.
import { fetchSocial, getCat, openAuthModal, postSocial, updateCat } from './auth.js';
import { brand, lang, t } from './i18n.js';
import { skyAt } from '../schedule.js';
import { DEFAULT_VOICE, VOICES, createVoice, setSoundOn, soundOn } from './sound.js';
import {
  addressOf, daysOnPlanet, displayName, displayOwner, ensureAuth, escapeHtml, findCat, formatDate,
  isOwner, localizeMessage, localized, me, renderHeader, statusOf,
} from './store.js';

const slug = decodeURIComponent(location.pathname.slice(1)).replace(/\/$/, '');
const root = document.getElementById('profile');
// ?hour=21 / ?weather=rain pass through to the room, for looking at other times of day.
const pageParams = new URLSearchParams(location.search);

await ensureAuth();
renderHeader();

// Built-in cats can be open to everyone (public); otherwise only the owner plays.
const canPlay = (cat) => Boolean(cat.public) || isOwner(cat);

function roomHtml(cat) {
  const zh = lang() === 'zh';
  const name = displayName(cat);
  if (cat.generating) {
    return `<div class="arriving">
      <img src="${cat.portrait}" alt="" />
      <p>${zh
        ? `我们收到了${escapeHtml(name)}的照片和故事。<br />小屋动画会陆续接上，做好了这里会更新。`
        : `We received ${escapeHtml(name)}’s photos and story.<br />Home animation will follow — this page will update when ready.`}</p>
    </div>`;
  }
  if (!cat.animated) {
    return `<div class="room-static">
      <img src="${cat.portrait}" alt="" />
      <span class="badge">${zh ? '此刻' : 'Now'}: ${escapeHtml(statusOf(cat).text)}</span>
    </div>`;
  }
  const params = new URLSearchParams({ tier: cat.tier, embed: '1', lang: zh ? 'zh' : 'en', voice: cat.voice || DEFAULT_VOICE });
  if (cat.assets) params.set('cat', cat.assets);
  if (cat.bell) params.set('bell', '1');
  if (!canPlay(cat)) params.set('visitor', '1');
  for (const key of ['hour', 'weather']) if (pageParams.has(key)) params.set(key, pageParams.get(key));
  return `<iframe class="room-frame" src="/home.html?${params}" title="${escapeHtml(name)}${zh ? ' 的小屋' : ' · home'}" allow="autoplay"></iframe>`;
}

function roomNote(cat) {
  const zh = lang() === 'zh';
  const name = escapeHtml(displayName(cat));
  if (!cat.animated) return zh ? '小屋动画还在路上。' : 'Home animation is still on the way.';
  if (cat.public) {
    return zh
      ? `${name}是大家的猫：谁来了都可以摸摸它、叫它、喂它。饭点它会等着有人来。`
      : `${name} is everyone’s cat — anyone can pet, call, and feed them. Around mealtimes they wait for someone to come.`;
  }
  if (isOwner(cat)) return zh ? '这是你的猫，可以摸摸它、叫它、喂它。' : 'This is your cat — you can pet, call, and feed it.';
  return zh
    ? `只有${escapeHtml(displayOwner(cat))}能和${name}互动，你可以看看它此刻在做什么。`
    : `Only ${escapeHtml(displayOwner(cat))} can play with ${name}. You can watch what it is doing.`;
}

// Built-in messages that came with the cat, then everyone's messages from the server.
let social = { lights: 0, lit: false, messages: [] };
let voice = null;
let ambient = null;

const lanternCount = (cat) => (cat.lights ?? 0) + social.lights;
const allMessages = (cat) => [...(cat.messages ?? []), ...social.messages.map(localizeMessage)];

function messagesHtml(cat) {
  const messages = allMessages(cat);
  if (messages.length === 0) return `<li class="hint">${t('noMessages')}</li>`;
  return [...messages].reverse().map((message) => `<li>
    <span class="from">${escapeHtml(message.from)}</span><time>${escapeHtml(message.at)}</time>
    <div>${escapeHtml(message.text)}</div>
  </li>`).join('');
}

function lanternHtml(cat) {
  const name = escapeHtml(displayName(cat));
  return `<button type="button" class="scene-lantern-button" id="lightButton" ${social.lit ? 'disabled' : ''}>
      <span class="lantern-icon ${social.lit ? 'lit' : ''}" aria-hidden="true"></span>
      <span>${social.lit ? t('lanternLit') : t('lightFor', name)}</span>
    </button>
    <span class="scene-count" id="lightCount">${t('lanternCount', lanternCount(cat))}</span>`;
}

function messageFormHtml(cat) {
  if (!me()) {
    return `<p class="hint message-login">${t('loginToMessage')}
      <button type="button" class="button ghost" id="messageLogin">${t('login')}</button></p>`;
  }
  return `<form class="message-form" id="messageForm">
      <input name="text" maxlength="120" placeholder="${t('sayTo', escapeHtml(displayName(cat)))}" required />
      <button type="submit" class="button ghost">${t('sendMessage')}</button>
    </form>
    <p class="error" id="messageError" hidden></p>`;
}

function soundHtml() {
  const on = soundOn();
  return `<button type="button" class="scene-chip" id="soundToggle" aria-pressed="${on}">
    <span class="sound-icon ${on ? 'on' : ''}" aria-hidden="true"></span>${on ? t('soundOn') : t('soundOff')}</button>`;
}

function voicePickerHtml(cat) {
  const current = cat.voice || DEFAULT_VOICE;
  const zh = lang() === 'zh';
  return `<label class="voice-picker">${t('voiceLabel')}
    <select id="voiceSelect">${Object.entries(VOICES).map(([id, v]) =>
      `<option value="${id}" ${id === current ? 'selected' : ''}>${zh ? v.zh : v.en} · ${zh ? v.noteZh : v.noteEn}</option>`).join('')}
    </select></label>`;
}

function paintSocial(cat) {
  root.querySelector('#lanternBox').innerHTML = lanternHtml(cat);
  root.querySelector('#messageList').innerHTML = messagesHtml(cat);
  root.querySelector('#lightButton')?.addEventListener('click', async (event) => {
    event.currentTarget.disabled = true;
    try {
      social = await postSocial(cat.slug, { action: 'light' });
      if (soundOn()) voice?.play('bell');
    } catch {
      event.currentTarget.disabled = false;
    }
    paintSocial(cat);
  });
}

function paintSound(cat) {
  const box = root.querySelector('#soundBox');
  if (!box) return;
  box.innerHTML = soundHtml();
  box.querySelector('#soundToggle').addEventListener('click', () => {
    setSoundOn(!soundOn());
    if (soundOn()) {
      voice.ambient(ambient);
      voice.play('meow');
    } else {
      voice.stop();
    }
    paintSound(cat);
  });
}

function bindSocial(cat) {
  paintSocial(cat);
  fetchSocial(cat.slug).then((data) => {
    social = data;
    paintSocial(cat);
  }).catch(() => {});

  root.querySelector('#messageLogin')?.addEventListener('click', async () => {
    await openAuthModal({ mode: 'login' });
    if (me()) location.reload();
  });
  root.querySelector('#messageForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.target;
    const error = root.querySelector('#messageError');
    const text = new FormData(form).get('text').trim();
    if (!text) return;
    const button = form.querySelector('button');
    button.disabled = true;
    error.hidden = true;
    try {
      social = await postSocial(cat.slug, { action: 'message', text });
      form.reset();
      paintSocial(cat);
    } catch (problem) {
      error.textContent = problem.message;
      error.hidden = false;
    }
    button.disabled = false;
  });

  voice = createVoice(cat.voice);
  paintSound(cat);
  root.querySelector('#voiceSelect')?.addEventListener('change', async (event) => {
    const next = event.target.value;
    try {
      const saved = await updateCat(cat.slug, { voice: next });
      cat.voice = saved.voice;
      voice.stop();
      voice = createVoice(cat.voice);
      if (soundOn()) voice.ambient(ambient);
      voice.play('meow');
      const frame = root.querySelector('.room-frame');
      if (frame) frame.src = frame.src.replace(/voice=[a-z]+/, `voice=${cat.voice}`);
    } catch (problem) {
      event.target.value = cat.voice || DEFAULT_VOICE;
      alert(problem.message);
    }
  });
}

// The room iframe asks us to play its sounds: we hold the sound switch and the visitor's click.
window.addEventListener('message', (event) => {
  if (event.origin !== location.origin || event.data?.type !== 'catplanet:sound') return;
  if (event.source !== root.querySelector('.room-frame')?.contentWindow) return;
  if (event.data.kind === 'ambient') ambient = event.data.name;
  if (soundOn() && voice) voice.play(event.data.kind, event.data.name);
});

// Sound can only start after a click; the first click anywhere on the page wakes the ambient up.
window.addEventListener('pointerdown', () => {
  if (soundOn() && voice && ambient) voice.ambient(ambient);
}, { once: true });

function render(cat) {
  const zh = lang() === 'zh';
  if (!cat) {
    document.title = zh ? '喵星 · 找不到这只猫' : 'Cat Planet · Cat not found';
    root.innerHTML = `<div class="home-body"><a class="home-back" href="/">${zh ? '← 回喵城镇' : '← Back to town'}</a>
      <h1>${zh ? `喵星上还没有 /${escapeHtml(slug)}` : `No cat at /${escapeHtml(slug)} yet`}</h1>
      <p class="lead">${zh ? '也许它还在来的路上。' : 'Maybe it is still on the way.'}</p>
      <a class="button" href="/new">${zh ? '送它来喵星' : 'Send a cat'}</a></div>`;
    return;
  }
  const name = displayName(cat);
  const owner = displayOwner(cat);
  document.title = `${name} · ${brand()}`;
  const address = addressOf(cat);
  const backHref = address?.href || '/';
  const ownerLine = cat.public
    ? (zh ? '大家的猫' : 'Everyone’s cat')
    : `${escapeHtml(owner)}${zh ? '的猫' : "'s cat"}`;

  root.innerHTML = `
    <section class="scene ${cat.animated ? 'live' : ''}">
      <div class="scene-room">${roomHtml(cat)}</div>
      <div class="scene-top">
        <a class="scene-chip" href="${backHref}">${zh ? '← 回喵城镇' : '← Back to town'}</a>
        ${cat.animated ? '<div id="soundBox"></div>' : ''}
      </div>
      <div class="scene-identity">
        <h1>${escapeHtml(name)}</h1>
        <p>${ownerLine} · ${zh ? `来喵星第 ${daysOnPlanet(cat)} 天` : `Day ${daysOnPlanet(cat)} on Cat Planet`}</p>
      </div>
      <div class="scene-lantern" id="lanternBox"></div>
    </section>

    <div class="home-body">
      <p class="room-note">${roomNote(cat)}</p>
      ${isOwner(cat) ? `<div class="owner-tools">${voicePickerHtml(cat)}</div>` : ''}

      ${cat.story?.length ? `<section class="home-story">
        <h2>${cat.public ? (zh ? `关于${escapeHtml(name)}` : `About ${escapeHtml(name)}`)
          : (zh ? `${escapeHtml(owner)}写给${escapeHtml(name)}的话` : `From ${escapeHtml(owner)}`)}</h2>
        ${cat.story.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('')}
      </section>` : ''}

      <section class="home-dossier">
        <h2>${zh ? '档案' : 'Details'}</h2>
        <dl class="facts">
          ${cat.coat ? `<dt>${zh ? '花色' : 'Coat'}</dt><dd>${escapeHtml(cat.coat)}</dd>` : ''}
          ${cat.birthday ? `<dt>${zh ? '生日' : 'Birthday'}</dt><dd>${formatDate(cat.birthday)}</dd>` : ''}
          ${cat.homeDay ? `<dt>${zh ? '来到家里' : 'Came home'}</dt><dd>${formatDate(cat.homeDay)}</dd>` : ''}
          <dt>${zh ? '来到喵星' : 'Arrived'}</dt><dd>${formatDate(cat.planetDay)}</dd>
          ${address ? `<dt>${zh ? '住址' : 'Address'}</dt><dd><a href="${address.href}">${escapeHtml(address.text)}</a></dd>` : ''}
        </dl>
        ${cat.timeline?.length ? `<ol class="timeline" style="margin-top:18px">${cat.timeline.map((item) => `<li><time>${formatDate(item.date)}</time>${escapeHtml(item.text)}</li>`).join('')}</ol>` : ''}
      </section>

      <section class="home-messages">
        <h2>${zh ? '留言' : 'Messages'}</h2>
        <ul class="messages" id="messageList"></ul>
        ${messageFormHtml(cat)}
      </section>
    </div>`;
  bindSocial(cat);
  const scene = root.querySelector('.scene');
  const paintSky = () => {
    const date = new Date();
    if (pageParams.has('hour')) date.setHours(Number(pageParams.get('hour')), 0);
    scene.dataset.sky = skyAt(date).id;
  };
  paintSky();
  setInterval(paintSky, 60000);
}

let cat = findCat(slug);
if (!cat) {
  const remote = await getCat(slug);
  cat = remote ? localized(remote) : null;
}
render(cat);
