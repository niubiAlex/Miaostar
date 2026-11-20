// Soft loading curtain: preload world art, then fade into the page.
import { brand, t } from './i18n.js';

const ASSETS = [
  '/assets/world/zoom2.webp',
  '/assets/world/zoom1.webp',
  '/assets/world/world.webp',
  '/assets/world/mid.webp',
  '/assets/world/center.webp',
];

function preload(src) {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve();
    image.onerror = () => resolve();
    image.src = src;
  });
}

export async function runLoading({ minMs = 2800 } = {}) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.body.classList.remove('booting');
    return;
  }
  const curtain = document.createElement('div');
  curtain.className = 'boot-curtain';
  curtain.innerHTML = `
    <div class="boot-inner">
      <div class="boot-mark">
        <span class="boot-en">${brand()}</span>
      </div>
      <p class="boot-line">${t('loading')}</p>
      <p class="boot-hint">${t('loadingHint')}</p>
      <div class="boot-bar"><i></i></div>
    </div>`;
  document.body.append(curtain);
  document.body.classList.add('booting');

  const started = performance.now();
  await Promise.all(ASSETS.map(preload));
  const left = Math.max(0, minMs - (performance.now() - started));
  await new Promise((resolve) => setTimeout(resolve, left));

  curtain.classList.add('out');
  document.body.classList.remove('booting');
  await new Promise((resolve) => setTimeout(resolve, 700));
  curtain.remove();
}
