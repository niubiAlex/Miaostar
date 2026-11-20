// Cat Planet / 喵星 — English primary, Chinese secondary.
const STRINGS = {
  en: {
    brand: 'Cat Planet',
    brandZh: '喵星',
    tagline: 'Every cat that left us went to Cat Planet.',
    taglineLong: 'Here it has a little home — to sleep, bask in the sun, and wait for you to visit.',
    send: 'Send a cat (free)',
    residents: 'Residents',
    about: 'About',
    login: 'Log in',
    logout: 'Log out',
    signUp: 'Sign up',
    backTown: 'Back to town',
    lookTown: 'See the whole town',
    backPlaza: 'Back to plaza',
    howTitle: 'How to send a cat',
    howLead: 'No drawing skills needed. Leave photos and a story; the home animation will follow.',
    step1: 'Upload a few photos',
    step1b: 'Front and side shots work best — we draw from them.',
    step2: 'Write their story',
    step2b: 'Name, birthday, the day they came home, and what you want to say.',
    step3: 'They move to Cat Planet',
    step3b: 'They get a cottage in town. You can visit anytime; friends can light a lantern.',
    legendBox: 'Cardboard Hill — new cats arrive in boxes',
    legendTower: 'Lookout Tower — see every resident',
    legendLake: 'Lake of Remembrance — lanterns lit for cats',
    legendCats: 'Plaza cats — fishing, stretching, sunning',
    legendHouses: 'Cottages — one per cat; tap to visit',
    residentCount: (n) => `${n} cat${n === 1 ? '' : 's'} live on Cat Planet`,
    emptyHouse: 'Empty home',
    emptyLine: 'No cat lives here yet',
    sendHere: 'Send a cat here',
    townTitle: 'Our cat town',
    townHint: 'Tap a cottage, or zoom out to see all of Cat Planet',
    loading: 'Arriving at Cat Planet…',
    loadingHint: 'Warming the clouds',
    loginTitle: 'Log in to Cat Planet',
    loginLead: 'So we know which cats are yours.',
    email: 'Email',
    password: 'Password',
    displayName: 'Your name',
    needLogin: 'Please log in first — then we know whose cat this is.',
    slugLabel: 'Homepage address',
    slugHint: 'Lowercase letters, numbers, hyphens. Others visit catplanet.online/this-name',
    slugTaken: 'This address is already taken. Try another.',
    slugSuggest: 'Suggested from the name — change it if you like.',
    privacy: 'Privacy',
    terms: 'Terms',
    footerAbout: 'About',
    langSwitch: '中文',
  },
  zh: {
    brand: '喵星',
    brandZh: '喵星',
    tagline: '每一只离开的猫，都去了喵星。',
    taglineLong: '它在这里有一间自己的小屋，睡觉、晒太阳、找朋友玩，等你回来看它。',
    send: '送它来喵星（免费）',
    residents: '居民',
    about: '关于',
    login: '登录',
    logout: '退出',
    signUp: '注册',
    backTown: '回喵城镇逛逛',
    lookTown: '看整座城镇',
    backPlaza: '回广场',
    howTitle: '怎么送它来喵星',
    howLead: '不用会画画。先留下照片和故事，小屋会慢慢接上。',
    step1: '上传几张它的照片',
    step1b: '正面、侧面都有最好，我们照着它的样子画。',
    step2: '写下它的故事',
    step2b: '名字、生日、来到你家的那天，还有你想对它说的话。',
    step3: '它住进喵星',
    step3b: '它会在喵城镇里有一间自己的小屋。你随时可以回来看它，朋友们也能来点灯。',
    legendBox: '纸箱山 — 新来的猫坐纸箱来',
    legendTower: '瞭望塔 — 看看所有居民',
    legendLake: '思念湖 — 大家为猫点的灯',
    legendCats: '广场上的猫 — 钓鱼、伸懒腰、晒太阳',
    legendHouses: '四周的小屋 — 每只猫一间，点进去',
    residentCount: (n) => `已经有 ${n} 只猫住在喵星`,
    emptyHouse: '空屋',
    emptyLine: '还没有猫搬来',
    sendHere: '送它来喵星',
    townTitle: '我们的喵城镇',
    townHint: '点一间小屋去它家，往外缩小看看整个喵星',
    loading: '正在抵达喵星…',
    loadingHint: '云层正在散开',
    loginTitle: '登录喵星',
    loginLead: '登录后我们才知道哪只猫是你的。',
    email: '邮箱',
    password: '密码',
    displayName: '你的名字',
    needLogin: '请先登录，我们才能知道这是谁的猫。',
    slugLabel: '主页地址',
    slugHint: '小写字母、数字或短横线。别人用 catplanet.online/这个地址 来看它',
    slugTaken: '这个地址已经有猫住了，换一个吧。',
    slugSuggest: '根据名字自动生成，也可以自己改。',
    privacy: '隐私',
    terms: '使用说明',
    footerAbout: '关于',
    langSwitch: 'EN',
  },
};

const KEY = 'catplanet:lang';

export function lang() {
  return localStorage.getItem(KEY) === 'zh' ? 'zh' : 'en';
}

export function setLang(next) {
  localStorage.setItem(KEY, next);
}

export function t(key, ...args) {
  const table = STRINGS[lang()] ?? STRINGS.en;
  const value = table[key] ?? STRINGS.en[key] ?? key;
  return typeof value === 'function' ? value(...args) : value;
}

export function toggleLang() {
  setLang(lang() === 'en' ? 'zh' : 'en');
  location.reload();
}

export const BRAND = { en: 'Cat Planet', zh: '喵星' };
