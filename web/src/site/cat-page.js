// 猫的主页：上面是小屋，下面是故事、点灯和留言。
import {
  addressOf, daysOnPlanet, escapeHtml, findCat, formatDate, isOwner, leaveMessage, lightCandle, me, renderHeader,
  statusOf,
} from './store.js';

const slug = decodeURIComponent(location.pathname.slice(1)).replace(/\/$/, '');
const root = document.getElementById('profile');

function roomHtml(cat, owner) {
  if (cat.generating) {
    return `<div class="arriving">
      <img src="${cat.portrait}" alt="" />
      <p>我们收到了${escapeHtml(cat.name)}的照片和故事。<br />小屋动画会陆续接上，做好了这里会更新。</p>
    </div>`;
  }
  if (!cat.animated) {
    return `<div class="room-static">
      <img src="${cat.portrait}" alt="" />
      <span class="badge">此刻：${escapeHtml(statusOf(cat).text)}</span>
    </div>
    <p class="room-note">小屋动画还在路上</p>`;
  }
  const params = new URLSearchParams({ tier: cat.tier, embed: '1' });
  if (cat.assets) params.set('cat', cat.assets);
  if (!owner) params.set('visitor', '1');
  return `<iframe class="room-frame ${owner ? 'owner' : ''}" src="/home.html?${params}" title="${escapeHtml(cat.name)}的小屋"></iframe>
    <p class="room-note">${owner
      ? `这是你的猫，可以摸摸它、叫它、喂它。`
      : `只有${escapeHtml(cat.owner)}能和${escapeHtml(cat.name)}互动，你可以看看它此刻在做什么。`}</p>`;
}

function messagesHtml(cat) {
  if (cat.messages.length === 0) return '<li class="hint">还没有人留言。</li>';
  return [...cat.messages].reverse().map((message) => `<li>
    <span class="from">${escapeHtml(message.from)}</span><time>${escapeHtml(message.at)}</time>
    <div>${escapeHtml(message.text)}</div>
  </li>`).join('');
}

function socialHtml(cat) {
  return `<div class="candle">
      <button type="button" class="button" id="lightButton" ${cat.lit ? 'disabled' : ''}>
        ${cat.lit ? '已为它点灯' : `为${escapeHtml(cat.name)}点一盏灯`}</button>
      <span class="count">已经有 ${cat.lights} 盏灯</span>
    </div>
    <ul class="messages">${messagesHtml(cat)}</ul>
    <form class="message-form" id="messageForm">
      <input name="text" maxlength="120" placeholder="对${escapeHtml(cat.name)}说一句话" required />
      <button type="submit" class="button">留言</button>
    </form>`;
}

function renderSocial() {
  const section = root.querySelector('#social');
  const cat = findCat(slug);
  section.innerHTML = socialHtml(cat);
  section.querySelector('#lightButton').addEventListener('click', () => {
    lightCandle(cat.slug);
    renderSocial();
  });
  section.querySelector('#messageForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const text = new FormData(event.target).get('text').trim();
    if (!text) return;
    leaveMessage(cat.slug, me()?.name ?? '一位访客', text);
    renderSocial();
  });
}

function render() {
  const cat = findCat(slug);
  if (!cat) {
    document.title = '喵星 · 找不到这只猫';
    root.innerHTML = `<h2>喵星上还没有 /${escapeHtml(slug)}</h2>
      <p class="lead">也许它还在来的路上。</p><a class="button" href="/new">送它来喵星</a>`;
    return;
  }
  document.title = `${cat.name} · ${cat.owner}的猫 · 喵星`;
  const owner = isOwner(cat);
  const address = addressOf(cat);
  root.innerHTML = `
    <div class="profile-head">
      <img src="${cat.portrait}" alt="" />
      <div>
        <h1>${escapeHtml(cat.name)}</h1>
        <div class="sub">${escapeHtml(cat.owner)}的猫 · 来喵星第 ${daysOnPlanet(cat)} 天</div>
      </div>
    </div>
    <div class="profile-grid">
      <div>${roomHtml(cat, owner)}</div>
      <div>
        <section class="card">
          <h3>关于${escapeHtml(cat.name)}</h3>
          <dl class="facts">
            ${cat.coat ? `<dt>花色</dt><dd>${escapeHtml(cat.coat)}</dd>` : ''}
            ${cat.birthday ? `<dt>生日</dt><dd>${formatDate(cat.birthday)}</dd>` : ''}
            ${cat.homeDay ? `<dt>来到家里</dt><dd>${formatDate(cat.homeDay)}</dd>` : ''}
            <dt>来到喵星</dt><dd>${formatDate(cat.planetDay)}</dd>
            ${address ? `<dt>住址</dt><dd><a href="${address.href}">${escapeHtml(address.text)}</a></dd>` : ''}
          </dl>
        </section>
        <section class="card" id="social"></section>
      </div>
    </div>
    ${cat.story?.length ? `<section class="card story" style="margin-top: 24px">
      <h3>${escapeHtml(cat.owner)}写给${escapeHtml(cat.name)}的话</h3>
      ${cat.story.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('')}
    </section>` : ''}
    ${cat.timeline?.length ? `<section class="card">
      <h3>我们的日子</h3>
      <ol class="timeline">${cat.timeline.map((item) => `<li><time>${formatDate(item.date)}</time>${escapeHtml(item.text)}</li>`).join('')}</ol>
    </section>` : ''}`;

  renderSocial();
}

renderHeader();
render();
