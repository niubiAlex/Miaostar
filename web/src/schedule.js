// 猫一天的作息：按真实时间分成几个时段，每个时段它想做的事不一样。
// 真猫一天睡 12 到 16 个小时，清晨和傍晚最精神。
// 当天随机的部分（几点出门夜游、玩多久）用日期做种子，同一天里刷新页面也不会变。

// 各时段里它自己想做什么、各有多想（权重）。sleep 是睡得深还是打个盹：deep 不会自己醒，nap 睡一会儿就醒。
const PHASES = {
  morning: { label: '清晨', text: '刚睡醒', textEn: 'Just woke up', meal: 'breakfast',
    weights: { idle: 3, wander: 2, play: 1, scratch: 1.5, sleep: 0.3 } },
  nap: { label: '上午', text: '打盹中', textEn: 'Napping', sleep: 'nap', weights: { sleep: 6, idle: 2, wander: 0.5 } },
  noon: { label: '中午', text: '醒着，晒晒太阳', textEn: 'Awake, sunbathing', weights: { idle: 4, wander: 3, play: 1, scratch: 1, sleep: 1 } },
  siesta: { label: '下午', text: '午睡中', textEn: 'Afternoon nap', sleep: 'nap', weights: { sleep: 6, idle: 2, wander: 0.5 } },
  evening: { label: '傍晚', text: '最精神的时候', textEn: 'At their liveliest', meal: 'dinner',
    weights: { idle: 2, wander: 4, play: 2.5, scratch: 1.5, sleep: 0.3 } },
  night: { label: '夜里', text: '睡觉中', textEn: 'Asleep', sleep: 'deep', weights: { sleep: 10, idle: 1 } },
  roam: { label: '夜里', text: '出门夜游去了', textEn: 'Out for a night stroll', out: true, weights: {} },
  // 免费档只有这两个。
  dayNap: { label: '白天', text: '在家睡觉', textEn: 'Sleeping at home', sleep: 'deep', weights: {} },
  nightOut: { label: '晚上', text: '出去玩了，早上 7 点回来', textEn: 'Out playing, back at 7 am', out: true, weights: {} },
};

// 从几点开始是哪个时段（按开始时间排好，最后一个一直到第二天第一个之前）。
const DAY = [[7, 'morning'], [9, 'nap'], [12, 'noon'], [14, 'siesta'], [18, 'evening'], [21, 'night']];

export const MEALS = { breakfast: '早饭', dinner: '晚饭' };
export const MEALS_EN = { breakfast: 'breakfast', dinner: 'dinner' };

function hash(text) {
  let h = 2166136261;
  for (const char of text) h = Math.imul(h ^ char.charCodeAt(0), 16777619);
  return h >>> 0;
}

// 这一天里固定的随机数（0 到 1）。
function dailyRandom(dayKey, salt) {
  let t = hash(`${dayKey}:${salt}`) + 0x6d2b79f5;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// 作息上的「一天」从早上 7 点算起，夜里 0 点到 7 点还算前一天。
export function dayKey(date) {
  const day = new Date(date.getTime() - 7 * 3600000);
  return `${day.getFullYear()}-${day.getMonth() + 1}-${day.getDate()}`;
}

// 某一档在某个时刻处在哪个时段。
export function phaseAt(tier, date) {
  const hour = date.getHours() + date.getMinutes() / 60;
  if (tier === 'free') {
    const id = hour >= 7 && hour < 19 ? 'dayNap' : 'nightOut';
    return { id, ...PHASES[id] };
  }
  if (tier === '299') {
    // 夜游：21 点半到 23 点之间出门，玩一个半到三个小时。
    const key = dayKey(date);
    const leave = 21.5 + dailyRandom(key, 'leave') * 1.5;
    const back = leave + 1.5 + dailyRandom(key, 'back') * 1.5;
    const sinceMorning = hour < 7 ? hour + 24 : hour;
    if (sinceMorning >= leave && sinceMorning < back) return { id: 'roam', ...PHASES.roam };
  }
  let id = DAY[DAY.length - 1][1];
  for (const [start, name] of DAY) {
    if (hour >= start) id = name;
  }
  return { id, ...PHASES[id] };
}

// 天空/室内光线：跟真实时钟走（和猫作息共用同一天），只改观感，不改行为。
// dawn → morning → noon → afternoon → dusk → night
const SKY = {
  dawn: { id: 'dawn', label: '破晓', labelEn: 'Dawn' },
  morning: { id: 'morning', label: '早晨', labelEn: 'Morning' },
  noon: { id: 'noon', label: '中午', labelEn: 'Noon' },
  afternoon: { id: 'afternoon', label: '午后', labelEn: 'Afternoon' },
  dusk: { id: 'dusk', label: '傍晚', labelEn: 'Dusk' },
  night: { id: 'night', label: '夜里', labelEn: 'Night' },
};

export function skyAt(date = new Date()) {
  const hour = date.getHours() + date.getMinutes() / 60;
  if (hour >= 5 && hour < 7.5) return SKY.dawn;
  if (hour >= 7.5 && hour < 11) return SKY.morning;
  if (hour >= 11 && hour < 15) return SKY.noon;
  if (hour >= 15 && hour < 17.5) return SKY.afternoon;
  if (hour >= 17.5 && hour < 19.5) return SKY.dusk;
  return SKY.night;
}
