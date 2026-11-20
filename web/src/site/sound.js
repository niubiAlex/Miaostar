// Cat voices: a few real meows and one purr per voice (assets/sounds, built by pipeline/sounds/make_sounds.py).
// Browsers only play sound after the person has clicked or tapped the page once.
const BASE = '/assets/sounds';
const SOUND_KEY = 'catplanet:sound';
const MEOW_GAP_MS = 1500;

export const VOICES = {
  gentle: { zh: '温柔', en: 'Gentle', noteZh: '轻轻的一声喵', noteEn: 'A soft, quiet meow' },
  sweet: { zh: '撒娇', en: 'Sweet', noteZh: '要吃的时候那种', noteEn: 'The “feed me” voice' },
  chatty: { zh: '话痨', en: 'Chatty', noteZh: '暹罗猫，话很多', noteEn: 'A talkative Siamese' },
  deep: { zh: '低沉', en: 'Deep', noteZh: '嗓门粗一点', noteEn: 'A lower, rounder voice' },
  kitten: { zh: '奶猫', en: 'Kitten', noteZh: '细细尖尖的', noteEn: 'Small and high' },
};
export const DEFAULT_VOICE = 'gentle';

export const soundOn = () => localStorage.getItem(SOUND_KEY) !== 'off';
export const setSoundOn = (on) => localStorage.setItem(SOUND_KEY, on ? 'on' : 'off');

let manifest = null;
const loadManifest = () => (manifest ??= fetch(`${BASE}/voices.json`).then((response) => response.json()));

export function createVoice(id) {
  const voice = VOICES[id] ? id : DEFAULT_VOICE;
  const cache = new Map();
  let lastMeow = 0;
  let purr = null;

  const audio = (file) => {
    if (!cache.has(file)) {
      const element = new Audio(`${BASE}/${voice}/${file}`);
      element.preload = 'auto';
      cache.set(file, element);
    }
    return cache.get(file);
  };

  return {
    id: voice,
    async play(kind) {
      const set = (await loadManifest())[voice];
      if (!set) return;
      if (kind === 'meow') {
        const now = performance.now();
        if (now - lastMeow < MEOW_GAP_MS) return;
        lastMeow = now;
        const element = audio(set.meows[Math.floor(Math.random() * set.meows.length)]).cloneNode();
        element.volume = 0.7;
        await element.play().catch(() => {});
      } else if (kind === 'purr') {
        if (purr && !purr.paused) return;
        purr = audio(set.purr);
        purr.currentTime = 0;
        purr.volume = 0.6;
        await purr.play().catch(() => {});
      }
    },
    stop() {
      purr?.pause();
    },
  };
}
