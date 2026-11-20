// Chinese ⇄ English through Vercel AI Gateway. Called once when text is written, never on read.
const ENDPOINT = 'https://ai-gateway.vercel.sh/v1/chat/completions';
const MODELS = ['google/gemini-2.5-flash-lite', 'openai/gpt-4.1-nano'];

const SYSTEM = `You translate short notes people write about their cats who have passed away, between Simplified Chinese and English.
Keep the meaning, warmth and plainness; do not add, explain or soften anything.
Cat names: Chinese → English use pinyin without tone marks (e.g. 小五 → Xiaowu); English → Chinese keep the Latin name unchanged.
If catName is given, write the cat's name exactly that way in the target language.
Fixed terms: 喵星 = Cat Planet, 喵城镇 = Cat Town, 来到喵星 = Arrived on Cat Planet, 点灯 = light a lantern, 小屋 = home.
Reply with JSON only: {"t": [...]} — one translated string per input string, same order, same count.`;

export const isChinese = (text) => /[\u3400-\u9fff]/.test(text);

function credential(req) {
  return req?.headers?.['x-vercel-oidc-token'] || process.env.VERCEL_OIDC_TOKEN || process.env.AI_GATEWAY_API_KEY;
}

async function ask(model, texts, to, key, names) {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: JSON.stringify({ to: to === 'zh' ? 'Simplified Chinese' : 'English', ...(names ? { catName: names } : {}), texts }) },
      ],
    }),
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error(`gateway ${response.status}: ${(await response.text()).slice(0, 200)}`);
  const data = await response.json();
  const out = JSON.parse(data.choices?.[0]?.message?.content ?? '{}').t;
  if (!Array.isArray(out) || out.length !== texts.length || out.some((item) => typeof item !== 'string')) {
    throw new Error('bad translation shape');
  }
  return out;
}

// Returns { from, to, texts } or null if there was nothing to do or every model failed.
// names ({ zh, en }) tells the model how this cat's name is written in each language.
export async function translate(texts, req, names = null) {
  const key = credential(req);
  const items = texts.map((text) => String(text ?? ''));
  if (!key || !items.some((text) => text.trim())) return null;
  const from = isChinese(items.join('')) ? 'zh' : 'en';
  const to = from === 'zh' ? 'en' : 'zh';
  for (const model of MODELS) {
    try {
      return { from, to, texts: await ask(model, items, to, key, names) };
    } catch (error) {
      console.warn('translate failed', model, error.message);
    }
  }
  return null;
}

const suffix = (lang) => (lang === 'zh' ? 'Zh' : 'En');

// Adds nameZh/nameEn, storyZh/storyEn, coatZh/coatEn and timeline[].textZh/textEn to a cat.
export async function translateCat(cat, req) {
  const story = cat.story ?? [];
  const timeline = cat.timeline ?? [];
  const texts = [cat.name, cat.coat ?? '', ...story, ...timeline.map((item) => item.text)];
  const result = await translate(texts, req);
  if (!result) return cat;
  const [name, coat, ...rest] = result.texts;
  const from = suffix(result.from);
  const to = suffix(result.to);
  return {
    ...cat,
    lang: result.from,
    [`name${from}`]: cat.name,
    [`name${to}`]: name,
    ...(cat.coat ? { [`coat${from}`]: cat.coat, [`coat${to}`]: coat } : {}),
    [`story${from}`]: story,
    [`story${to}`]: rest.slice(0, story.length),
    timeline: timeline.map((item, index) => ({
      ...item,
      [`text${from}`]: item.text,
      [`text${to}`]: rest[story.length + index],
    })),
  };
}

export async function translateMessage(message, req, cat) {
  const names = cat ? { zh: cat.nameZh ?? cat.name, en: cat.nameEn ?? cat.name } : null;
  const result = await translate([message.text], req, names);
  if (!result) return message;
  return { ...message, lang: result.from, [`text${suffix(result.from)}`]: message.text, [`text${suffix(result.to)}`]: result.texts[0] };
}
