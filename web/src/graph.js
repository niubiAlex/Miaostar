// 动作图：固定姿态是节点，片段是边。
// 每个片段都从一个固定姿态开始、在一个固定姿态结束，所以片段之间可以任意衔接。

// activity：姿态的活跃程度，睡 0、趴 1、坐 2、站 3。累了往低处走，精力足了往高处走。
// energyPerSecond：处在这个姿态时精力每秒的变化量。
// stand 是朝左的站姿，stand_r 朝右，stand_f 正面（朝镜头），stand_b 背面。
// 坐、趴、睡只有朝左的，所以另外三个朝向只在走动途中出现。
// headTop：头顶在视频画面里的高度（0 是画面上沿），气泡贴着它放。
// passing：只在走动途中出现的姿态，不在这个姿态停留。
export const ANCHORS = {
  sit: { label: '坐', image: 'assets/poses/sit.jpg', activity: 2, energyPerSecond: -0.4, headTop: 0.226 },
  lie: { label: '趴', image: 'assets/poses/lie.jpg', activity: 1, energyPerSecond: 0.3, headTop: 0.549 },
  stand: { label: '站', image: 'assets/poses/stand.jpg', activity: 3, energyPerSecond: -0.8, headTop: 0.24 },
  sleep: { label: '睡', image: 'assets/poses/sleep.jpg', activity: 0, energyPerSecond: 1.5, headTop: 0.533 },
  stand_r: { label: '站（朝右）', image: 'assets/poses/stand_r.jpg', activity: 3, energyPerSecond: -0.8, headTop: 0.227, passing: true },
  stand_f: { label: '站（正面）', image: 'assets/poses/stand_f.jpg', activity: 3, energyPerSecond: -0.8, headTop: 0.3, passing: true },
  stand_b: { label: '站（背面）', image: 'assets/poses/stand_b.jpg', activity: 3, energyPerSecond: -0.8, headTop: 0.25, passing: true },
};

// 房间的尺寸和位置都以「一屏的宽度」为 1。镜头跟着宠物左右移动。
// 房间的宽度是按宠物的步幅定的：窝和饭碗之间正好跑一段、或者走三段（约 2 屏），再窄就跑不起来了。
export const WORLD = {
  // 竖屏下一屏更窄，同样步幅要占更多「屏」；房间加宽，喂食时仍能跑一段。
  width: 3.6,
  // 一屏的宽高比，和房间背景图一致。竖屏 9:16。
  screenAspect: 9 / 16,
  // 宠物的视频是正方形，边长占一屏宽度的比例。竖屏屏幕窄，占宽要大一点才显眼。
  spriteWidth: 0.62,
  // 宠物中心能到的最左和最右。
  minX: 0.4,
  maxX: 3.2,
  // 远近：脚底在舞台高度上的位置（0 是舞台上沿）。竖屏房间地板大约从 49% 开始；
  // 最远走到墙根前，最近到操作按钮上方。
  minY: 0.55,
  maxY: 0.88,
  // 地平线的高度。宠物的大小和「脚底到地平线的距离」成正比，所以越靠后越小。
  horizon: 0.32,
  // 一张背景图铺多宽。等于 1 时和竖屏背景图正好对上；略大于 1 等于把镜头拉近。
  tileWidth: 1.08,
  // 背景图上沿在舞台上沿之上多少（以舞台高度为 1），决定露出哪一截。
  tileRaise: 0.04,
};

// 视频画面里的几个位置，以视频边长为 1。换一套素材要重新量。
export const SPRITE = {
  ground: 0.86, // 脚底所在的高度
  mouthWhenEating: { x: 0.215, y: 0.85 }, // 吃饭时嘴尖的位置
};

// 窝和饭碗所在的远近（脚底在舞台高度上的位置）。宠物在这个远近时按 WORLD.spriteWidth 的大小画。
// 舞台最下面一条留给操作按钮，所以放在地板中间偏前，窝的下沿也压不到按钮。
export const GROUND_Y = 0.76;

// 宠物在远近 y 处画多大（在 GROUND_Y 处是 1）。
export function depthScale(y) {
  return (y - WORLD.horizon) / (GROUND_Y - WORLD.horizon);
}

// 房间里的地点，从左到右。x、y 是宠物待在这个地点时的位置（左右、远近）；setSpots 按步幅把它们排开。
// 饭碗在左边：宠物坐、趴、吃饭都朝左，从窝去饭碗不用转身，喂食时能最快吃上。
export const SPOTS = {
  bowl: { label: '饭碗', x: 0, y: GROUND_Y },
  bed: { label: '窝', x: 0, y: GROUND_Y },
};

// 排地点的位置。朝左走、朝右走、朝左跑、朝右跑是四段不同的片段，每段前进的距离都不一样；
// 地点的间距要尽量同时是它们的整数倍，这样不管怎么来回都是整数段，脚不打滑。
// strides 是这几段片段各自前进的距离。
export function setSpots(strides) {
  const names = Object.keys(SPOTS);
  const widest = (WORLD.maxX - WORLD.minX) / (names.length - 1);
  // 间距与「整数段」差多少（比例），取各段里差得最多的那个。
  const misfit = (spacing) =>
    Math.max(
      ...strides.map((stride) => {
        const segments = Math.max(1, Math.round(spacing / stride));
        return Math.abs(spacing / (segments * stride) - 1);
      }),
    );
  let best = widest;
  for (let spacing = widest; spacing >= widest * 0.6; spacing -= 0.005) {
    if (misfit(spacing) < misfit(best)) best = spacing;
  }
  names.forEach((name, index) => {
    SPOTS[name].x = WORLD.minX + index * best;
  });
}

const clip = (id) => `assets/clips/${id}`;

// type：
//   idle       待机，自主播放。weight 是被选中的相对机会（默认 1）；
//              calm 表示动作幅度很小，用户一有指示可以直接打断，其余的待机只能加快播完
//   transition 两个姿态之间的过渡
//   turn       原地转身（朝左、朝右之间），只在走动时用
//   move       走或跑：视频里是原地踏步，由网页来移动它。
//              侧身的（direction -1 朝左、1 朝右）按 distance 平移，distance 启动时从量好的数据里填；
//              正面、背面的（depth 1 走近、-1 走远）上下平移并缩放
//   reaction   由用户操作触发（trigger 指明是哪种操作）；at 表示要先走到哪个地点
// 同一种操作有多个反应片段时，选离当前姿态最近的；一样近时选排在前面的。
export const CLIPS = [
  { id: 'sit_idle', label: '坐着发呆', type: 'idle', from: 'sit', to: 'sit', file: clip('sit_idle'), calm: true },
  { id: 'sit_groom', label: '舔爪子洗脸', type: 'idle', from: 'sit', to: 'sit', file: clip('sit_groom'), weight: 0.4 },
  { id: 'sit_watch', label: '盯着什么东西看', type: 'idle', from: 'sit', to: 'sit', file: clip('sit_watch'), weight: 0.5 },
  { id: 'lie_idle', label: '趴着发呆', type: 'idle', from: 'lie', to: 'lie', file: clip('lie_idle'), calm: true },
  { id: 'stand_idle', label: '站着张望', type: 'idle', from: 'stand', to: 'stand', file: clip('stand_idle'), calm: true },
  { id: 'stand_stretch', label: '伸懒腰', type: 'idle', from: 'stand', to: 'stand', file: clip('stand_stretch'), weight: 0.4 },
  { id: 'sleep_idle', label: '睡觉', type: 'idle', from: 'sleep', to: 'sleep', file: clip('sleep_idle'), calm: true },

  { id: 'sit_to_lie', label: '从坐到趴', type: 'transition', from: 'sit', to: 'lie', file: clip('sit_to_lie') },
  { id: 'lie_to_sit', label: '从趴到坐', type: 'transition', from: 'lie', to: 'sit', file: clip('lie_to_sit') },
  { id: 'sit_to_stand', label: '从坐到站', type: 'transition', from: 'sit', to: 'stand', file: clip('sit_to_stand') },
  { id: 'stand_to_sit', label: '从站到坐', type: 'transition', from: 'stand', to: 'sit', file: clip('stand_to_sit') },
  // 只在窝里睡：困了先走回窝。
  { id: 'lie_to_sleep', label: '睡着', type: 'transition', from: 'lie', to: 'sleep', file: clip('lie_to_sleep'), at: 'bed' },
  { id: 'sleep_to_lie', label: '醒来', type: 'transition', from: 'sleep', to: 'lie', file: clip('sleep_to_lie') },

  // 转身动作本身有 4 秒，按 1.5 倍速播，否则每次掉头都要等很久。
  { id: 'turn_l_to_r', label: '转身朝右', type: 'turn', from: 'stand', to: 'stand_r', file: clip('turn_l_to_r'), rate: 1.5 },
  { id: 'turn_r_to_l', label: '转身朝左', type: 'turn', from: 'stand_r', to: 'stand', file: clip('turn_r_to_l'), rate: 1.5 },

  { id: 'turn_l_to_f', label: '转身朝镜头', type: 'turn', from: 'stand', to: 'stand_f', file: clip('turn_l_to_f'), rate: 1.5 },
  { id: 'turn_f_to_l', label: '转身朝左', type: 'turn', from: 'stand_f', to: 'stand', file: clip('turn_f_to_l'), rate: 1.5 },
  { id: 'turn_l_to_b', label: '转身背过去', type: 'turn', from: 'stand', to: 'stand_b', file: clip('turn_l_to_b'), rate: 1.5 },
  { id: 'turn_b_to_l', label: '转身朝左', type: 'turn', from: 'stand_b', to: 'stand', file: clip('turn_b_to_l'), rate: 1.5 },
  { id: 'turn_r_to_f', label: '转身朝镜头', type: 'turn', from: 'stand_r', to: 'stand_f', file: clip('turn_r_to_f'), rate: 1.5 },
  { id: 'turn_f_to_r', label: '转身朝右', type: 'turn', from: 'stand_f', to: 'stand_r', file: clip('turn_f_to_r'), rate: 1.5 },
  { id: 'turn_r_to_b', label: '转身背过去', type: 'turn', from: 'stand_r', to: 'stand_b', file: clip('turn_r_to_b'), rate: 1.5 },
  { id: 'turn_b_to_r', label: '转身朝右', type: 'turn', from: 'stand_b', to: 'stand_r', file: clip('turn_b_to_r'), rate: 1.5 },

  { id: 'walk_l', label: '朝左走', type: 'move', gait: 'walk', direction: -1, from: 'stand', to: 'stand', file: clip('walk_l') },
  { id: 'walk_r', label: '朝右走', type: 'move', gait: 'walk', direction: 1, from: 'stand_r', to: 'stand_r', file: clip('walk_r') },
  { id: 'run_l', label: '朝左跑', type: 'move', gait: 'run', direction: -1, from: 'stand', to: 'stand', file: clip('run_l') },
  { id: 'run_r', label: '朝右跑', type: 'move', gait: 'run', direction: 1, from: 'stand_r', to: 'stand_r', file: clip('run_r') },

  { id: 'walk_f', label: '朝镜头走近', type: 'move', gait: 'walk', depth: 1, from: 'stand_f', to: 'stand_f', file: clip('walk_f') },
  { id: 'walk_b', label: '往里走远', type: 'move', gait: 'walk', depth: -1, from: 'stand_b', to: 'stand_b', file: clip('walk_b') },

  // 被摸在每个姿态下都有对应片段，在什么姿态被摸就在什么姿态回应，不用先换姿态。
  { id: 'sit_petted', label: '坐着被摸', type: 'reaction', trigger: 'pet', from: 'sit', to: 'sit', file: clip('sit_petted') },
  { id: 'lie_petted', label: '趴着被摸', type: 'reaction', trigger: 'pet', from: 'lie', to: 'lie', file: clip('lie_petted') },
  { id: 'stand_petted', label: '站着被摸', type: 'reaction', trigger: 'pet', from: 'stand', to: 'stand', file: clip('stand_petted') },
  // 睡着时被摸不叫醒它，只是动一动，复用睡觉的待机片段。
  { id: 'sleep_petted', label: '睡着被摸（不醒）', type: 'reaction', trigger: 'pet', from: 'sleep', to: 'sleep', file: clip('sleep_idle') },
  { id: 'stand_eat', label: '吃饭', type: 'reaction', trigger: 'feed', from: 'stand', to: 'stand', file: clip('stand_eat'), at: 'bowl' },
  // 球是画在视频里的，从视频左边缘滚进来、再滚出去。
  { id: 'sit_play', label: '玩球', type: 'reaction', trigger: 'play', from: 'sit', to: 'sit', file: clip('sit_play') },
];

// 内心气泡的占位文案。正式版由大模型按宠物性格和当前状态生成。
export const BUBBLES = {
  sit_idle: ['窗外好像有只鸟', '有点无聊', '今天太阳不错'],
  sit_groom: ['舔舔爪子', '要干干净净的'],
  sit_watch: ['那是什么', '有东西在动'],
  lie_idle: ['这样趴着真舒服', '呼……'],
  stand_idle: ['那边是什么声音', '想到处走走'],
  stand_stretch: ['伸个懒腰', '啊——舒服'],
  sit_to_lie: ['有点累了，趴一会儿'],
  lie_to_sit: ['休息好了'],
  sit_to_stand: ['起来活动一下'],
  lie_to_sleep: ['困了……'],
  sleep_to_lie: ['睡醒了'],
  run_l: ['冲呀', '跑跑跑'],
  run_r: ['冲呀', '跑跑跑'],
  sit_petted: ['呼噜呼噜', '再摸一会儿嘛', '最喜欢被摸头了'],
  lie_petted: ['呼噜呼噜', '就这样别停'],
  stand_petted: ['蹭蹭你', '再摸一会儿嘛'],
  sleep_petted: ['（睡得正香）'],
  stand_eat: ['好吃', '就等这一口了'],
  sit_play: ['看我的', '别跑'],
  hungry: ['有点饿了', '是不是该开饭了'],
  sleepy: ['困了，回窝睡觉'],
  wander: ['去那边看看', '走一走'],
  onPet: ['喵？', '是你呀'],
  onFeed: ['开饭了？', '来了来了'],
  onPlay: ['球！', '要玩要玩'],
  onCall: ['来了', '叫我吗'],
};
