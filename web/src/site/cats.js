// Built-in residents. User cats come from the API after login.
export const SAMPLE_CATS = [
  {
    slug: 'xiaowu',
    name: 'Xiaowu',
    nameZh: '小五',
    owner: 'Xiaolu',
    ownerZh: '小鹿',
    ownerId: 'sample-xiaolu',
    tier: '299',
    animated: true,
    portrait: '/assets/site/cat_sanhua.jpg',
    coat: 'calico',
    coatZh: '三花',
    birthday: '2011-04-03',
    homeDay: '2011-06-18',
    planetDay: '2025-09-12',
    story: [
      'Xiaowu was found in a cardboard box downstairs on a rainy day — palm-sized, and very loud.',
      'It never liked being held, but every night it slept by my feet. However late I came home, it was waiting at the door.',
      'It left last autumn at fourteen. I still feel like it just went out to play, and will come back when it is done.',
    ],
    storyZh: [
      '小五是下雨天在楼下纸箱里捡到的，只有巴掌大，叫得特别响。',
      '它从来不喜欢被抱，可每天晚上都睡在我脚边。不管我多晚回家，它都在门口等着。',
      '它去年秋天走的，十四岁。我总觉得它只是出去玩了，玩够了就会回来。',
    ],
    timeline: [
      { date: '2011-06-18', text: 'Found in a cardboard box', textZh: '在纸箱里被捡到' },
      { date: '2014-03-02', text: 'First move — hid under the bed for three days', textZh: '第一次搬家，在床底躲了三天' },
      { date: '2019-08-20', text: 'Perfect checkup', textZh: '体检全部正常' },
      { date: '2025-09-12', text: 'Arrived on Cat Planet', textZh: '来到喵星' },
    ],
    lights: 128,
    messages: [
      { from: 'Ajie', fromZh: '阿杰', text: 'Be good on Cat Planet, Xiaowu.', textZh: '小五在喵星要乖乖的。', at: '2025-09-14' },
      { from: 'Xiaolu', fromZh: '小鹿', text: 'It is raining today. You hated rainy days. I miss you.', textZh: '今天下雨了，你最讨厌下雨天。想你。', at: '2026-10-03' },
    ],
  },
];

export const NEIGHBORS = [];
