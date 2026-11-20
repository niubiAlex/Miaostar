// 一整张画上的可点区域：主广场的地标、街区里的小屋都用它。
// 鼠标停上去：那块区域亮起来，上方浮出卡片；点一下去对应的页面。
// 手机上没有「停上去」：点一下从底下弹出卡片，卡片上的按钮才是去那里。
import { t } from './i18n.js';
import { escapeHtml } from './store.js';

const touchOnly = matchMedia('(hover: none)').matches;
const EDGE = 8;

// 卡片按屏幕定位（画可能被放大、平移），并且不出屏幕：上方放不下就放到区域下方。
const card = document.createElement('div');
card.className = 'spot-card';
card.hidden = true;
document.body.append(card);

const sheet = document.createElement('div');
sheet.className = 'spot-sheet';
sheet.hidden = true;
document.body.append(sheet);

export function hideCards() {
  card.hidden = true;
  sheet.hidden = true;
}

const cardHtml = (spot) => `${spot.image ? `<img src="${spot.image}" alt="" />` : ''}
  <span><b>${escapeHtml(spot.title)}</b>${spot.lines.map((line) => `<small>${escapeHtml(line)}</small>`).join('')}</span>`;

function showCard(link, spot) {
  card.innerHTML = cardHtml(spot);
  card.hidden = false;
  const area = link.getBoundingClientRect();
  const { width, height } = card.getBoundingClientRect();
  const center = area.left + area.width / 2;
  const left = Math.min(Math.max(center - width / 2, EDGE), innerWidth - width - EDGE);
  const below = area.top - height - 10 < EDGE;
  const top = below ? Math.min(area.bottom + 10, innerHeight - height - EDGE) : area.top - height - 10;
  card.classList.toggle('below', below);
  card.style.left = `${left}px`;
  card.style.top = `${top}px`;
  card.style.setProperty('--arrow', `${Math.min(Math.max(center - left, 16), width - 16)}px`);
}

// spots: [{ x, y, w, h（都按画面宽高的比例）, href, title, lines: [文字], image?, action?, onClick?, id?, kind? }]
export function mountSpots(stage, spots) {
  return spots.map((spot) => {
    const link = document.createElement('a');
    link.className = `spot ${spot.kind ?? ''}`;
    link.href = spot.href;
    link.setAttribute('aria-label', spot.title);
    Object.assign(link.style, {
      left: `${spot.x * 100}%`, top: `${spot.y * 100}%`, width: `${spot.w * 100}%`, height: `${spot.h * 100}%`,
    });
    if (spot.id) link.id = spot.id;
    link.tabIndex = 0;
    if (!touchOnly) {
      link.addEventListener('mouseenter', () => showCard(link, spot));
      link.addEventListener('mouseleave', () => {
        card.hidden = true;
      });
      link.addEventListener('focus', () => showCard(link, spot));
      link.addEventListener('blur', () => {
        card.hidden = true;
      });
    }
    const openSheet = () => {
      sheet.innerHTML = `<button type="button" class="close" aria-label="${t('close')}">×</button>${cardHtml(spot)}
        <a class="button" href="${spot.href}">${escapeHtml(spot.action ?? t('visit'))}</a>`;
      sheet.hidden = false;
      const closeBtn = sheet.querySelector('.close');
      closeBtn.focus();
      closeBtn.addEventListener('click', () => {
        sheet.hidden = true;
        link.focus();
      });
      sheet.querySelector('.button').addEventListener('click', (buttonEvent) => {
        sheet.hidden = true;
        if (spot.onClick) {
          buttonEvent.preventDefault();
          spot.onClick();
        }
      });
    };
    link.addEventListener('click', (event) => {
      if (touchOnly) {
        event.preventDefault();
        openSheet();
        return;
      }
      // Desktop house spots go to house camera first via in-page /house/N links.
      card.hidden = true;
      if (spot.onClick) {
        event.preventDefault();
        spot.onClick();
      }
    });
    link.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      if (touchOnly || spot.kind?.includes('house')) {
        event.preventDefault();
        openSheet();
      }
    });
    stage.append(link);
    return link;
  });
}
