// Send a cat: requires login; slug is auto-suggested and checked on the server.
import { checkSlug, createCat, openAuthModal } from './auth.js';
import { nextSlug, slugifyName, validSlug } from './slug.js';
import { ensureAuth, me, renderHeader } from './store.js';
import { lang, t as tr } from './i18n.js';
import { DEFAULT_VOICE, VOICES, createVoice } from './sound.js';

const RESERVED = new Set(['cats', 'new', 'home', 'me', 'assets', 'src', 'site', 'concepts', 'scripts', 'vendor', 'api',
  'login', 'admin', 'about', 'privacy', 'terms']);
const PHOTO_SIZE = 512;
const MAX_PHOTOS = 5;

await ensureAuth();
renderHeader();

const form = document.getElementById('form');
const errorBox = document.getElementById('error');
const gate = document.getElementById('loginGate');
let photos = [];

function syncGate() {
  const user = me();
  if (gate) gate.hidden = Boolean(user);
  form.hidden = !user;
  if (user && form.owner) form.owner.value = user.name;
}

syncGate();

document.getElementById('voiceOptions').innerHTML = Object.entries(VOICES).map(([id, voice]) => {
  const zh = lang() === 'zh';
  return `<label class="voice-option">
    <input type="radio" name="voice" value="${id}" ${id === DEFAULT_VOICE ? 'checked' : ''} />
    <span class="voice-name">${zh ? voice.zh : voice.en}</span>
    <span class="voice-note">${zh ? voice.noteZh : voice.noteEn}</span>
    <button type="button" class="button ghost voice-play" data-voice="${id}">${tr('voicePreview')}</button>
  </label>`;
}).join('');
const previews = {};
for (const button of document.querySelectorAll('.voice-play')) {
  button.addEventListener('click', () => {
    const id = button.dataset.voice;
    form.querySelector(`input[name=voice][value=${id}]`).checked = true;
    (previews[id] ??= createVoice(id)).play('meow');
  });
}

document.getElementById('gateLogin')?.addEventListener('click', () => openAuthModal({ mode: 'login' }));
document.getElementById('gateSignup')?.addEventListener('click', () => openAuthModal({ mode: 'register' }));

function shrink(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(1, PHOTO_SIZE / Math.max(image.width, image.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(image.width * scale);
      canvas.height = Math.round(image.height * scale);
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(image.src);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    image.onerror = reject;
    image.src = URL.createObjectURL(file);
  });
}

function paintPhotos() {
  const zh = lang() === 'zh';
  document.getElementById('photoPreview').innerHTML = photos.map((src, index) => `<span class="photo-thumb">
    <img src="${src}" alt="" />
    <button type="button" data-remove="${index}" aria-label="${zh ? '去掉这张' : 'Remove'}">×</button>
  </span>`).join('');
  document.getElementById('photoCount').textContent = photos.length === 0
    ? (zh ? '还没选照片' : 'No photos yet')
    : zh ? `已选 ${photos.length} 张，最多 ${MAX_PHOTOS} 张` : `${photos.length} of ${MAX_PHOTOS} chosen`;
}

// 再选一次是往后加，不是替换；点缩略图上的 × 去掉一张。
form.photos?.addEventListener('change', async () => {
  const added = await Promise.all([...form.photos.files].slice(0, MAX_PHOTOS - photos.length).map(shrink));
  photos = [...photos, ...added];
  form.photos.value = '';
  paintPhotos();
});
document.getElementById('photoPreview')?.addEventListener('click', (event) => {
  const index = event.target.closest('[data-remove]')?.dataset.remove;
  if (index === undefined) return;
  photos.splice(Number(index), 1);
  paintPhotos();
});
if (form.photos) paintPhotos();

for (const input of form.querySelectorAll('input[type=date]')) {
  const mark = () => input.classList.toggle('filled', Boolean(input.value));
  input.addEventListener('input', mark);
  input.addEventListener('change', mark);
  mark();
}

let slugTouched = false;
form.name?.addEventListener('input', () => {
  if (slugTouched) return;
  form.slug.value = slugifyName(form.name.value);
  void refreshSlugHint();
});
form.slug?.addEventListener('input', () => {
  slugTouched = true;
  void refreshSlugHint();
});

async function refreshSlugHint() {
  const hint = document.getElementById('slugStatus');
  if (!hint) return;
  const slug = form.slug.value.trim().toLowerCase();
  if (!validSlug(slug) || RESERVED.has(slug)) {
    hint.textContent = tr('slugHint');
    hint.dataset.state = '';
    return;
  }
  const result = await checkSlug(slug);
  if (result.taken) {
    const alt = nextSlug(slugifyName(form.name.value || slug), (candidate) => candidate === slug);
    hint.textContent = `${tr('slugTaken')} ${tr('slugTry', alt)}`;
    hint.dataset.state = 'bad';
  } else {
    hint.textContent = tr('slugSuggest');
    hint.dataset.state = 'ok';
  }
}

async function problem(data) {
  if (!me()) return tr('needLogin');
  if (photos.length === 0) return tr('errPhoto');
  if (!data.name) return tr('errCatName');
  if (!validSlug(data.slug) || RESERVED.has(data.slug)) return tr('errSlug');
  const result = await checkSlug(data.slug);
  if (result.taken) return tr('slugTaken');
  if (!data.planetDay) return tr('errPlanetDay');
  return null;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!me()) {
    await openAuthModal({ mode: 'login' });
    return;
  }
  const data = Object.fromEntries([...new FormData(form)].filter(([key]) => key !== 'photos')
    .map(([key, value]) => [key, value.trim()]));
  data.slug = data.slug.toLowerCase();
  const message = await problem(data);
  errorBox.hidden = message === null;
  errorBox.textContent = message ?? '';
  if (message) return;

  const timeline = [
    data.homeDay && { date: data.homeDay, text: tr('timelineHome') },
    { date: data.planetDay, text: tr('timelineArrived') },
  ].filter(Boolean);

  try {
    await createCat({
      slug: data.slug,
      name: data.name,
      coat: data.coat,
      birthday: data.birthday,
      homeDay: data.homeDay,
      planetDay: data.planetDay,
      portrait: photos[0],
      voice: data.voice || DEFAULT_VOICE,
      story: data.story.split(/\n\s*\n/).map((paragraph) => paragraph.trim()).filter(Boolean),
      timeline,
    });
    location.href = `/${data.slug}`;
  } catch (error) {
    errorBox.hidden = false;
    errorBox.textContent = error.message;
  }
});
