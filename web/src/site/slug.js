// Turn a cat name into a /xiaowu-style address. Latin letters preferred; otherwise a short code.
const PINYIN = {
  小: 'xiao', 五: 'wu', 大: 'da', 黄: 'huang', 橘: 'ju', 猫: 'mao', 咪: 'mi', 阿: 'a',
  花: 'hua', 黑: 'hei', 白: 'bai', 灰: 'hui', 球: 'qiu', 豆: 'dou', 团: 'tuan',
  子: 'zi', 宝: 'bao', 福: 'fu', 乐: 'le', 多: 'duo', 毛: 'mao', 虎: 'hu',
  奶: 'nai', 茶: 'cha', 糖: 'tang', 果: 'guo', 桃: 'tao', 雪: 'xue', 月: 'yue',
  星: 'xing', 云: 'yun', 风: 'feng', 雨: 'yu', 阳: 'yang', 明: 'ming', 亮: 'liang',
};

export function slugifyName(name) {
  const raw = String(name || '').trim();
  let out = '';
  for (const char of raw) {
    if (/[a-zA-Z0-9]/.test(char)) out += char.toLowerCase();
    else if (/[\s_]+/.test(char)) out += '-';
    else if (PINYIN[char]) out += PINYIN[char];
    else if (/[\u4e00-\u9fff]/.test(char)) out += '';
  }
  out = out.replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 24);
  if (out.length >= 2) return out;
  return `cat-${Date.now().toString(36).slice(-6)}`;
}

export function nextSlug(base, taken) {
  if (!taken(base)) return base;
  for (let n = 2; n < 100; n += 1) {
    const candidate = `${base.slice(0, 20)}-${n}`;
    if (!taken(candidate)) return candidate;
  }
  return `${base.slice(0, 14)}-${Date.now().toString(36).slice(-6)}`;
}

export function validSlug(slug) {
  return /^[a-z0-9-]{2,24}$/.test(slug);
}
