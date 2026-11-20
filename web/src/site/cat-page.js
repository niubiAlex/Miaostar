// Cat page: room first, story second, dossier third.
import { getCat } from './auth.js';
import { brand, lang } from './i18n.js';
import {
  addressOf, daysOnPlanet, displayName, displayOwner, ensureAuth, escapeHtml, findCat, formatDate,
  isOwner, leaveMessage, lightCandle, me, renderHeader, statusOf,
} from './store.js';

const slug = decodeURIComponent(location.pathname.slice(1)).replace(/\/$/, '');
const root = document.getElementById('profile');

await ensureAuth();
renderHeader();

function roomHtml(cat, owner) {
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
    </div>
    <p class="room-note">${zh ? '小屋动画还在路上' : 'Home animation is still on the way'}</p>`;
  }
  const params = new URLSearchParams({ tier: cat.tier, embed: '1', lang: zh ? 'zh' : 'en' });
  if (cat.assets) params.set('cat', cat.assets);
  if (!owner) params.set('visitor', '1');
  return `<iframe class="room-frame ${owner ? 'owner' : ''}" src="/home.html?${params}" title="${escapeHtml(name)}${zh ? ' 的小屋' : ' · home'}"></iframe>
    <p class="room-note">${owner
      ? (zh ? '这是你的猫，可以摸摸它、叫它、喂它。' : 'This is your cat — you can pet, call, and feed it.')
      : (zh
        ? `只有${escapeHtml(displayOwner(cat))}能和${escapeHtml(name)}互动，你可以看看它此刻在做什么。`
        : `Only ${escapeHtml(displayOwner(cat))} can play with ${escapeHtml(name)}. You can watch what it is doing.`)}</p>`;
}

function messagesHtml(cat) {
  const zh = lang() === 'zh';
  if (cat.messages.length === 0) return `<li class="hint">${zh ? '还没有人留言。' : 'No messages yet.'}</li>`;
  return [...cat.messages].reverse().map((message) => `<li>
    <span class="from">${escapeHtml(message.from)}</span><time>${escapeHtml(message.at)}</time>
    <div>${escapeHtml(message.text)}</div>
  </li>`).join('');
}

function bindSocial(cat) {
  root.querySelector('#lightButton')?.addEventListener('click', () => {
    lightCandle(cat.slug);
    render(findCat(cat.slug) || cat);
  });
  root.querySelector('#messageForm')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = new FormData(event.target).get('text').trim();
    if (!text) return;
    leaveMessage(cat.slug, me()?.name ?? (lang() === 'zh' ? '一位访客' : 'A visitor'), text);
    render(findCat(cat.slug) || cat);
  });
}

function render(cat) {
  const zh = lang() === 'zh';
  if (!cat) {
    document.title = zh ? '喵星 · 找不到这只猫' : 'Cat Planet · Cat not found';
    root.innerHTML = `<a class="home-back" href="/">${zh ? '← 回喵城镇' : '← Back to town'}</a>
      <h1>${zh ? `喵星上还没有 /${escapeHtml(slug)}` : `No cat at /${escapeHtml(slug)} yet`}</h1>
      <p class="lead">${zh ? '也许它还在来的路上。' : 'Maybe it is still on the way.'}</p>
      <a class="button" href="/new">${zh ? '送它来喵星' : 'Send a cat'}</a>`;
    return;
  }
  const name = displayName(cat);
  const owner = displayOwner(cat);
  document.title = `${name} · ${brand()}`;
  const owned = isOwner(cat);
  const address = addressOf(cat);
  const backHref = address?.href || '/';
  const status = statusOf(cat);

  root.innerHTML = `
    <a class="home-back" href="${backHref}">${zh ? '← 回喵城镇' : '← Back to town'}</a>

    <div class="home-stage">${roomHtml(cat, owned)}</div>

    <div class="home-identity">
      <div>
        <h1>${escapeHtml(name)}</h1>
        <p class="status">${escapeHtml(status.text)}</p>
        <p class="owner-line">${escapeHtml(owner)}${zh ? '的猫' : "'s cat"} · ${zh ? `来喵星第 ${daysOnPlanet(cat)} 天` : `Day ${daysOnPlanet(cat)}`}</p>
      </div>
    </div>

    <div class="home-actions">
      <button type="button" class="button" id="lightButton" ${cat.lit ? 'disabled' : ''}>
        ${cat.lit ? (zh ? '已为它点灯' : 'Lantern lit') : (zh ? `为${escapeHtml(name)}点一盏灯` : `Light a lantern for ${escapeHtml(name)}`)}
      </button>
      <span class="count">${zh ? `已经有 ${cat.lights} 盏灯` : `${cat.lights} lanterns`}</span>
    </div>

    ${cat.story?.length ? `<section class="home-story">
      <h2>${zh ? `${escapeHtml(owner)}写给${escapeHtml(name)}的话` : `From ${escapeHtml(owner)}`}</h2>
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
      <ul class="messages">${messagesHtml(cat)}</ul>
      <form class="message-form" id="messageForm">
        <input name="text" maxlength="120" placeholder="${zh ? `对${escapeHtml(name)}说一句话` : `Say something to ${escapeHtml(name)}`}" required />
        <button type="submit" class="button ghost">${zh ? '留言' : 'Send'}</button>
      </form>
    </section>`;
  bindSocial(cat);
}

let cat = findCat(slug);
if (!cat) cat = await getCat(slug);
render(cat);
