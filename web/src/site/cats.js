// Built-in residents. User cats come from the API after login.
// 叔叔 lives at No. 1 and belongs to everyone (public): anyone can pet, call and feed him.
export const SAMPLE_CATS = [
  {
    slug: 'shushu',
    name: 'Uncle',
    nameZh: '叔叔',
    owner: 'Cat Town',
    ownerZh: '喵城镇',
    ownerId: 'sample-town',
    public: true,
    tier: '299',
    animated: true,
    voice: 'sweet',
    bell: true,
    portrait: '/assets/site/cat_sanhua.jpg',
    coat: 'calico',
    coatZh: '三花',
    planetDay: '2025-09-12',
    story: [
      'Uncle is the first resident of Cat Town, at No. 1. He doesn’t belong to anyone in particular — whoever comes by, he walks over and leans on their leg.',
      'Pet him, call him, ask him to play. At breakfast and dinner he sits by his bowl and waits for someone to feed him.',
      'If you are missing a cat of your own today, come and keep Uncle company for a while.',
    ],
    storyZh: [
      '叔叔是喵城镇的第一位居民，住在 1 号。它不属于哪一个人，谁来了，它都会走过来在腿边蹭一下。',
      '可以摸它、叫它、让它去玩。早饭和晚饭的时候，它会守在碗边，等有人来喂。',
      '如果今天你想念自己的猫，就来陪叔叔待一会儿。',
    ],
    timeline: [{ date: '2025-09-12', text: 'Arrived on Cat Planet', textZh: '来到喵星' }],
    lights: 0,
    messages: [],
  },
];

export const NEIGHBORS = [];
