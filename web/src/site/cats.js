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
    birthday: '2011-04-03',
    homeDay: '2011-06-18',
    planetDay: '2025-09-12',
    story: [
      'Xiaowu was found in a cardboard box downstairs on a rainy day — palm-sized, and very loud.',
      'It never liked being held, but every night it slept by my feet. However late I came home, it was waiting at the door.',
      'It left last autumn at fourteen. I still feel like it just went out to play, and will come back when it is done.',
    ],
    timeline: [
      { date: '2011-06-18', text: 'Found in a cardboard box' },
      { date: '2014-03-02', text: 'First move — hid under the bed for three days' },
      { date: '2019-08-20', text: 'Perfect checkup' },
      { date: '2025-09-12', text: 'Arrived on Cat Planet' },
    ],
    lights: 128,
    messages: [
      { from: 'Ajie', text: 'Be good on Cat Planet, Xiaowu.', at: '2025-09-14' },
      { from: 'Xiaolu', text: 'It is raining today. You hated rainy days. I miss you.', at: '2026-10-03' },
    ],
  },
];

export const NEIGHBORS = [];
