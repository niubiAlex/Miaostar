// 喵星上的示例居民。用户自己送来的猫存在浏览器里（见 store.js）。
// animated 表示这只猫已经有小屋动画；素材在 /assets/home45/。
export const SAMPLE_CATS = [
  {
    slug: 'xiaowu',
    name: '小五',
    owner: '小鹿',
    tier: '299',
    animated: true,
    portrait: '/assets/site/cat_sanhua.jpg',
    coat: '三花',
    birthday: '2011-04-03',
    homeDay: '2011-06-18',
    planetDay: '2025-09-12',
    story: [
      '小五是在小区楼下的纸箱里捡到的，那天下着雨，它只有巴掌大，叫得特别响。',
      '它不爱被抱，但每天晚上一定要睡在我脚边。我加班到多晚，门一开它都在门口等。',
      '去年秋天它走了，十四岁。我总觉得它只是出门玩去了，玩够了就会回来。',
    ],
    timeline: [
      { date: '2011-06-18', text: '在楼下纸箱里遇见它' },
      { date: '2014-03-02', text: '跟我搬了第一次家，躲在床底下三天' },
      { date: '2019-08-20', text: '第一次体检全优，医生说它比我还健康' },
      { date: '2025-09-12', text: '来到喵星' },
    ],
    lights: 128,
    messages: [
      { from: '阿杰', text: '小五在喵星要乖乖的。', at: '2025-09-14' },
      { from: '小鹿', text: '今天下雨了，你最讨厌下雨天。我想你。', at: '2026-10-03' },
    ],
  },
];

export const NEIGHBORS = [];
