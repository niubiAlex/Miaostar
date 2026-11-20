// A cat's sounds: its voice (meows, trill, purr), room effects (eating, scratching, ball, collar bell)
// and the ambient outside (birds, crickets, rain). Files come from pipeline/sounds/.
// Browsers only play sound after the person has clicked or tapped the page once.
const BASE = '/assets/sounds';
const SOUND_KEY = 'catplanet:sound';
const MEOW_GAP_MS = 1500;
const AMBIENT_FADE = 2.5;
const AMBIENT_LEVEL = 0.35;

export const VOICES = {
  gentle: { zh: '温柔', en: 'Gentle', noteZh: '轻轻的一声喵', noteEn: 'A soft, quiet meow' },
  sweet: { zh: '撒娇', en: 'Sweet', noteZh: '要吃的时候那种', noteEn: 'The “feed me” voice' },
  chatty: { zh: '话痨', en: 'Chatty', noteZh: '暹罗猫，话很多', noteEn: 'A talkative Siamese' },
  deep: { zh: '低沉', en: 'Deep', noteZh: '嗓门粗一点', noteEn: 'A lower, rounder voice' },
  kitten: { zh: '奶猫', en: 'Kitten', noteZh: '细细尖尖的', noteEn: 'Small and high' },
};
export const DEFAULT_VOICE = 'gentle';

const EFFECTS = { eat: ['eat.mp3'], scratch: ['scratch.mp3'], ball: ['ball.mp3'], bell: ['bell1.mp3', 'bell2.mp3', 'bell3.mp3'] };
const LEVELS = { meow: 0.75, trill: 0.75, purr: 0.6, eat: 0.5, scratch: 0.45, ball: 0.5, bell: 0.35 };

export const soundOn = () => localStorage.getItem(SOUND_KEY) !== 'off';
export const setSoundOn = (on) => localStorage.setItem(SOUND_KEY, on ? 'on' : 'off');

let context = null;
let master = null;
const buffers = new Map();
let manifest = null;

function audio() {
  if (!context) {
    context = new AudioContext();
    master = context.createGain();
    master.connect(context.destination);
  }
  if (context.state === 'suspended') context.resume().catch(() => {});
  return context;
}

const loadManifest = () => (manifest ??= fetch(`${BASE}/voices.json?v=3`).then((response) => response.json()));

function buffer(path) {
  if (!buffers.has(path)) {
    buffers.set(path, fetch(`${BASE}/${path}`)
      .then((response) => response.arrayBuffer())
      .then((data) => audio().decodeAudioData(data)));
  }
  return buffers.get(path);
}

function start(decoded, level, when = audio().currentTime, fadeIn = 0) {
  const ctx = audio();
  const source = ctx.createBufferSource();
  const gain = ctx.createGain();
  source.buffer = decoded;
  gain.gain.setValueAtTime(fadeIn ? 0 : level, when);
  if (fadeIn) gain.gain.linearRampToValueAtTime(level, when + fadeIn);
  source.connect(gain).connect(master);
  source.start(when);
  return { source, gain };
}

const pickOne = (list) => list[Math.floor(Math.random() * list.length)];

export function createVoice(id) {
  const voice = VOICES[id] ? id : DEFAULT_VOICE;
  let lastMeow = 0;
  let purrUntil = 0;
  let ambient = { name: null, layers: [], timer: null };

  function stopAmbient() {
    clearTimeout(ambient.timer);
    const now = context?.currentTime ?? 0;
    for (const layer of ambient.layers) {
      layer.gain.gain.cancelScheduledValues(now);
      layer.gain.gain.setValueAtTime(layer.gain.gain.value, now);
      layer.gain.gain.linearRampToValueAtTime(0, now + AMBIENT_FADE);
      layer.source.stop(now + AMBIENT_FADE + 0.1);
    }
    ambient = { name: null, layers: [], timer: null };
  }

  // Two copies overlap and cross-fade at each seam, so the loop never clicks or pauses.
  async function loopAmbient(name) {
    const decoded = await buffer(`ambient/${name}.mp3`);
    if (ambient.name !== name) return;
    const ctx = audio();
    let when = ctx.currentTime + 0.05;
    const schedule = () => {
      if (ambient.name !== name) return;
      const layer = start(decoded, AMBIENT_LEVEL, when, AMBIENT_FADE);
      const end = when + decoded.duration;
      layer.gain.gain.setValueAtTime(AMBIENT_LEVEL, end - AMBIENT_FADE);
      layer.gain.gain.linearRampToValueAtTime(0, end);
      layer.source.stop(end + 0.1);
      ambient.layers = [...ambient.layers.slice(-1), layer];
      when = end - AMBIENT_FADE;
      ambient.timer = setTimeout(schedule, Math.max(0, (when - ctx.currentTime - 1) * 1000));
    };
    schedule();
  }

  return {
    id: voice,
    async play(kind, name) {
      if (kind === 'ambient') return this.ambient(name);
      const set = (await loadManifest())[voice];
      if (!set) return;
      const now = performance.now();
      let file;
      if (kind === 'meow' || kind === 'trill') {
        if (now - lastMeow < MEOW_GAP_MS) return;
        lastMeow = now;
        file = `${voice}/${kind === 'trill' && set.trill ? set.trill : pickOne(set.meows)}`;
      } else if (kind === 'purr') {
        if (now < purrUntil) return;
        file = `${voice}/${set.purr}`;
      } else if (EFFECTS[kind]) {
        file = `effects/${pickOne(EFFECTS[kind])}`;
      } else {
        return;
      }
      const decoded = await buffer(file);
      if (kind === 'purr') purrUntil = now + decoded.duration * 1000;
      start(decoded, LEVELS[kind] ?? 0.6);
    },
    ambient(name) {
      if (name === ambient.name) return;
      stopAmbient();
      if (!name) return;
      ambient.name = name;
      loopAmbient(name);
    },
    stop() {
      stopAmbient();
    },
  };
}
