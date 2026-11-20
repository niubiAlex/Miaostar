// 行为调度：决定下一个播哪个片段，以及这个片段要让宠物在房间里移动多远。
// 有请求时优先满足请求（必要时先走过去、先换姿态），
// 没有请求时按当前状态给各种选择算权重，随机选一个。
//
// 位置有两个量：x 是左右（以一屏宽度为 1），y 是远近（脚底在舞台高度上的位置，越大离镜头越近）。
// 离镜头越远宠物画得越小，同一段走路在屏幕上前进的距离也按同样的比例变短。

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const sum = (values) => values.reduce((total, value) => total + value, 0);

// 离目标这么近就算到了：左右以一屏宽度为 1，远近以舞台高度为 1。
const ARRIVE_TOLERANCE = 0.012;
const DEPTH_TOLERANCE = 0.012;
// 精力低于这个值就回窝睡觉；饱食低于这个值就去饭碗边等着。
const SLEEPY_BELOW = 25;
const HUNGRY_BELOW = 30;
// 走、跑片段的步幅最多伸缩到多少倍还看不太出脚打滑。
const MAX_STRETCH = 1.15;
// 随手点的位置离某个地点这么近，就当作是要去那个地点（左右、远近）。
const SNAP_TO_SPOT = 0.15;
const SNAP_TO_SPOT_DEPTH = 0.08;
// 绕路时去程、回程各自最多走几段。
const MAX_DETOUR_LEGS = 4;
// 随手点的位置比一段走路的这个比例还近，就不走了。
const TOO_CLOSE_FRACTION = 0.4;
// 正面或背面走一段，远近变化多少。视频是原地踏步，网页推得太远会像滑冰；
// 一整段纵深大约拆成两三步走完。
const DEPTH_STRIDE = 0.11;
// 随手点时，远近差不到这么多就不专门转身去走了（左右照走）。
const MIN_DEPTH_LEG = 0.05;

export function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

// 两种走法哪个更好：先看伸缩是否可接受；都可接受时跑得多的好；其余情况伸缩小的好。
function betterPlan(a, b) {
  if (a.acceptable !== b.acceptable) return a.acceptable;
  if (a.acceptable && a.runs !== b.runs) return a.runs > b.runs;
  return a.error < b.error;
}

function pickWeighted(options) {
  const total = options.reduce((sum, option) => sum + option.weight, 0);
  let roll = Math.random() * total;
  for (const option of options) {
    roll -= option.weight;
    if (roll <= 0) return option;
  }
  return options[options.length - 1];
}

export class Director {
  // scaleAt(y)：宠物在远近 y 处画多大（相对于地点所在的远近）。
  constructor({ anchors, clips, spots, world, scaleAt, startAnchor, startX, startY }) {
    this.anchors = anchors;
    this.clips = clips;
    this.spots = spots;
    this.world = world;
    this.scaleAt = scaleAt;
    this.anchor = startAnchor;
    this.x = startX;
    this.y = startY;
    this.queue = [];
    this.energy = 70;
    this.mood = 50;
    this.satiety = 60;
    // 换姿态或走动之后至少先播几个待机，避免刚趴下就起来、刚走到又走开。
    this.minIdlesBetweenTransitions = 2;
    this.idlesSinceTransition = 0;
    // 上一个播完的片段。舔爪子、伸懒腰这类显眼的待机不连着播两遍。
    this.lastClip = null;
  }

  get hungry() {
    return this.satiety < HUNGRY_BELOW;
  }

  // 是不是已经在这个位置。y 不给时只看左右。
  isAt(x, y = null) {
    if (Math.abs(this.x - x) > ARRIVE_TOLERANCE) return false;
    return y === null || Math.abs(this.y - y) <= DEPTH_TOLERANCE;
  }

  // 从 from 姿态换到 to 姿态要依次播放的片段（过渡和转身）；换不到返回 null。
  findPath(from, to) {
    if (from === to) return [];
    const visited = new Set([from]);
    const frontier = [{ anchor: from, path: [] }];
    while (frontier.length > 0) {
      const { anchor, path } = frontier.shift();
      for (const clip of this.clips) {
        const usable = clip.type === 'transition' || clip.type === 'turn';
        if (!usable || clip.from !== anchor || visited.has(clip.to)) continue;
        const nextPath = [...path, clip];
        if (clip.to === to) return nextPath;
        visited.add(clip.to);
        frontier.push({ anchor: clip.to, path: nextPath });
      }
    }
    return null;
  }

  // 朝左（-1）或朝右（1）走、跑的片段。
  moveClip(gait, direction) {
    return this.clips.find(
      (clip) => clip.type === 'move' && clip.gait === gait && clip.direction === direction,
    );
  }

  // 朝镜头走近（1）或走远（-1）的片段；这套素材里没有时返回 null。
  depthClip(direction) {
    return this.clips.find((clip) => clip.type === 'move' && clip.depth === direction) ?? null;
  }

  // 朝某个方向最多还能走多远。
  roomToward(direction) {
    return direction < 0 ? this.x - this.world.minX : this.world.maxX - this.x;
  }

  // 依次走这几段、同时远近从 fromY 变到 toY，每一段在屏幕上自然前进多远。
  // 每段的大小取决于它走到一半时的远近，而走到哪儿又取决于各段的长短，所以迭代几次。
  spans(clips, fromY, toY) {
    let spans = clips.map((clip) => clip.distance * this.scaleAt((fromY + toY) / 2));
    for (let round = 0; round < 3; round += 1) {
      const total = sum(spans);
      let done = 0;
      const next = clips.map((clip, index) => {
        const middle = (done + spans[index] / 2) / total;
        done += spans[index];
        return clip.distance * this.scaleAt(fromY + (toY - fromY) * middle);
      });
      spans = next;
    }
    return spans;
  }

  // 安排去 target（{ x, y }）的路，返回 [{ clip, move, rise }]：move 是左右移动多少，rise 是远近变化多少。
  // 只走直线：要么纯左右（侧身走/跑），要么纯走近/走远（正面/背面），绝不斜着滑。
  // 两样都要改时，先横着走到目标的左右位置，再转身走远近；横走步幅凑不好时反过来。
  // loose 为真表示目标可以挪一点（比如随手点的地板）。
  planTrip(target, run, loose) {
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const needSide = Math.abs(dx) > ARRIVE_TOLERANCE;
    const needDepth =
      Math.abs(dy) > DEPTH_TOLERANCE && (!loose || Math.abs(dy) >= MIN_DEPTH_LEG || !needSide);

    const withRise = (legs) => legs.map((leg) => ({ ...leg, rise: 0 }));
    const depthLegs = (delta) => {
      if (Math.abs(delta) <= DEPTH_TOLERANCE) return [];
      const clip = this.depthClip(Math.sign(delta));
      if (clip === null) return [];
      const count = Math.max(1, Math.round(Math.abs(delta) / DEPTH_STRIDE));
      return Array.from({ length: count }, () => ({ clip, move: 0, rise: delta / count }));
    };

    if (needSide && !needDepth) {
      return withRise(this.planLegs(target.x, this.y, this.y, run, loose));
    }
    if (!needSide && needDepth) return depthLegs(dy);
    if (!needSide && !needDepth) return [];

    // 先左右、后远近：去饭碗时先跑过去，再微调前后，看起来最自然。
    const across = this.planLegs(target.x, this.y, this.y, run, loose);
    if (across.fit === 'good' || across.fit === 'detour') {
      return [...withRise(across), ...depthLegs(dy)];
    }

    // 横走凑不整时：先走到目标的远近（那边的步幅不一样），再横着走。
    const along = this.planLegs(target.x, target.y, target.y, run, loose);
    if (along.fit === 'good' && this.depthClip(Math.sign(dy))) {
      return [...depthLegs(dy), ...withRise(along)];
    }

    return [...withRise(across), ...depthLegs(dy)];
  }

  // 把横着去 x 的路程拆成若干段走和跑，返回 [{ clip, move }]；途中远近从 fromY 变到 toY。
  // 返回的数组上带一个 fit：good 步幅伸缩可接受，detour 绕了路，strained 伸缩超出了可接受范围。
  // 每个走、跑片段前进的距离是固定的，路程凑不整时每段按同一比例伸缩；伸缩越大脚越打滑。
  // 所以在「几段跑加几段走」的各种组合里挑伸缩最小的；要求跑时，在伸缩可接受的组合里挑跑得最多的。
  // loose 为真时伸缩限制在可接受范围内，宁可停得偏一点；离得太近就干脆不动。
  // 目标不能挪（比如饭碗）又凑不整时，绕一下再过去。
  planLegs(x, fromY, toY, run, loose) {
    const direction = x < this.x ? -1 : 1;
    const distance = Math.abs(x - this.x);
    const walk = this.moveClip('walk', direction);
    const sprint = run ? this.moveClip('run', direction) : null;
    const room = this.roomToward(direction);
    const scale = this.scaleAt((fromY + toY) / 2);
    const tagged = (legs, fit) => Object.assign(legs, { fit });
    if (loose && distance < TOO_CLOSE_FRACTION * walk.distance * scale) return tagged([], 'good');

    let best = null;
    const maxRuns = sprint ? Math.ceil(distance / (sprint.distance * scale)) : 0;
    const maxWalks = Math.ceil(distance / (walk.distance * scale)) + 1;
    for (let runs = 0; runs <= maxRuns; runs += 1) {
      for (let walks = 0; walks <= maxWalks; walks += 1) {
        if (runs + walks === 0) continue;
        const clips = [...Array(runs).fill(sprint), ...Array(walks).fill(walk)];
        const spans = this.spans(clips, fromY, toY);
        const natural = sum(spans);
        // 缩到最短也会走出房间的组合不要。随手点时允许多缩一点（见下面钳步幅）。
        if (loose && natural > room * MAX_STRETCH * 1.15) continue;
        const error = Math.abs(Math.log(distance / natural));
        // 随手点的目标可以停偏一点：候选方案略超出 15% 也先收下，后面再把步幅钳回 15% 以内。
        // 竖屏走近时步幅会变大，一段跑步常常刚好略超，不这样的话「快跑」会被拆成几段走。
        const acceptable = error <= Math.log(MAX_STRETCH) * (loose ? 1.5 : 1);
        const candidate = { runs, clips, spans, natural, error, acceptable };
        if (best === null || betterPlan(candidate, best)) best = candidate;
      }
    }
    if (best === null) return tagged([], 'good');
    if (!best.acceptable && !loose) {
      const detour = this.planDetour(x - this.x, fromY);
      if (detour !== null) return tagged(detour, 'detour');
    }

    let stretch = distance / best.natural;
    if (loose) {
      // 房间不够长时，最短可以缩到刚好走完剩下的路；略小于 15% 时脚会滑一点，但总比改成走强。
      const fit = room / best.natural;
      const shortest = Math.min(1 / MAX_STRETCH, fit);
      const longest = Math.min(MAX_STRETCH, fit);
      stretch = clamp(stretch, shortest, longest);
      // 停在哪儿可以挪一点，就尽量停在之后去哪个地点都能直接走到的位置，免得下次还要绕路。
      let settled = null;
      for (let option = shortest; option <= longest + 1e-9; option += 0.01) {
        const closer = settled === null || Math.abs(option - stretch) < Math.abs(settled - stretch);
        if (closer && this.settlesWell(this.x + direction * best.natural * option, toY)) settled = option;
      }
      stretch = settled ?? stretch;
    }
    const legs = best.clips.map((clip, index) => ({ clip, move: direction * best.spans[index] * stretch }));
    return tagged(legs, loose || best.acceptable ? 'good' : 'strained');
  }

  // 从 (x, y) 出发，是不是去每个地点都能直接走到（走整数段，步幅伸缩在可接受范围内）。
  settlesWell(x, y) {
    return Object.values(this.spots).every((spot) => {
      const distance = Math.abs(spot.x - x);
      if (distance <= ARRIVE_TOLERANCE) return true;
      const stride = this.moveClip('walk', spot.x < x ? -1 : 1).distance * this.scaleAt((y + spot.y) / 2);
      const legs = Math.max(1, Math.round(distance / stride));
      return Math.abs(Math.log(distance / (legs * stride))) <= Math.log(MAX_STRETCH);
    });
  }

  // 直接走过去凑不整时绕一下：先走过头再折回来，或者先退几步再走过去，
  // 这样每一段的步幅都接近原样。delta 是要横着移动的距离，朝右为正。找不到合适的绕法返回 null。
  // 绕路时远近不变（都在 y 处），这样每一段的大小都一样，好算。
  planDetour(delta, y) {
    const scale = this.scaleAt(y);
    let best = null;
    for (const first of [-1, 1]) {
      const out = this.moveClip('walk', first);
      const back = this.moveClip('walk', -first);
      // 朝 first 方向的净位移；先退再进时是负数。
      const net = first * delta;
      for (let outs = 1; outs <= MAX_DETOUR_LEGS; outs += 1) {
        for (let backs = 1; backs <= MAX_DETOUR_LEGS; backs += 1) {
          const a = outs * out.distance * scale;
          const b = backs * back.distance * scale;
          // 去程每段放大 u 倍、回程每段缩小 u 倍，正好到位：a·u − b/u = net。
          const u = (net + Math.sqrt(net * net + 4 * a * b)) / (2 * a);
          const error = Math.abs(Math.log(u));
          if (error > Math.log(MAX_STRETCH) || a * u > this.roomToward(first)) continue;
          const count = outs + backs;
          if (best === null || count < best.count || (count === best.count && error < best.error)) {
            best = { count, error, first, out, back, outs, backs, u };
          }
        }
      }
    }
    if (best === null) return null;
    const { first, out, back, outs, backs, u } = best;
    return [
      ...Array.from({ length: outs }, () => ({ clip: out, move: first * out.distance * scale * u })),
      ...Array.from({ length: backs }, () => ({ clip: back, move: (-first * back.distance * scale) / u })),
    ];
  }

  // 请求还要不要继续走。goal（{ x, y }）是它最初想去的位置，y 为 null 表示远近不变；
  // 安排好路程后以 request.target 为准。
  stillTravelling(request, goal) {
    if (!request.legs) return !this.isAt(goal.x, goal.y ?? null);
    return request.legs.length > 0 || !this.isAt(request.target.x, request.target.y);
  }

  // 朝目标走一步：先站起来并转到要走的方向，再播一段走或跑。没有路要走时返回 null。
  stepToward(request, goal) {
    const endOf = (legs) => ({
      x: this.x + sum(legs.map((leg) => leg.move)),
      y: this.y + sum(legs.map((leg) => leg.rise)),
    });
    const planned = request.legs != null;
    const target = planned ? request.target : { x: goal.x, y: goal.y ?? this.y };
    // 已经安排过、但路上被别的事带到了别处（比如中途去吃了饭），原来的安排就不对了，重新安排。
    const end = planned ? endOf(request.legs) : null;
    const offCourse =
      planned &&
      (Math.abs(end.x - target.x) > ARRIVE_TOLERANCE || Math.abs(end.y - target.y) > DEPTH_TOLERANCE);
    if (!planned || offCourse) {
      request.legs = this.isAt(target.x, target.y)
        ? []
        : this.planTrip(target, request.run, request.loose === true);
      request.target = endOf(request.legs);
    }
    if (request.legs.length === 0) return null;
    const facing = request.legs[0].clip.from;
    if (this.anchor !== facing) {
      return { clip: this.findPath(this.anchor, facing)[0], reason: 'path', move: 0, rise: 0 };
    }
    const leg = request.legs.shift();
    return { clip: leg.clip, reason: 'move', move: leg.move, rise: leg.rise };
  }

  // 用户操作触发的反应，例如摸头、喂食。同一种反应已经在排队时不重复加。
  // 反应对等待时间最敏感，所以排在「去某处」的请求前面。
  requestReaction(trigger, requestedAt) {
    if (this.queue.some((request) => request.kind === 'reaction' && request.trigger === trigger)) {
      return false;
    }
    const firstGoto = this.queue.findIndex((request) => request.kind === 'goto');
    const position = firstGoto === -1 ? this.queue.length : firstGoto;
    // 听到开饭会跑过去。
    const run = trigger === 'feed';
    this.queue.splice(position, 0, { kind: 'reaction', trigger, requestedAt, run });
    return true;
  }

  // 要求换成某个姿态。睡觉只在窝里，所以会先走回窝。
  requestAnchor(anchor) {
    this.queue = this.queue.filter((request) => request.kind !== 'goto');
    const place = anchor === 'sleep' ? this.spots.bed : { x: null, y: null };
    this.queue.push({ kind: 'goto', anchor, x: place.x, y: place.y });
  }

  // 要求走（或跑）到房间里的某个位置。y 不给表示远近不变；loose 表示位置是随手点的，可以停得偏一点。
  requestMove(x, { y = null, run = false, loose = false } = {}) {
    this.queue = this.queue.filter((request) => request.kind !== 'goto');
    // 随手点在某个地点附近，就当作是要去那个地点。
    const spot = Object.values(this.spots).find(
      (candidate) =>
        Math.abs(candidate.x - x) < SNAP_TO_SPOT &&
        (y === null || Math.abs(candidate.y - y) < SNAP_TO_SPOT_DEPTH),
    );
    if (loose && spot) {
      this.queue.push({ kind: 'goto', x: spot.x, y: spot.y, run, loose: false });
      return;
    }
    this.queue.push({
      kind: 'goto',
      x: clamp(x, this.world.minX, this.world.maxX),
      y: y === null ? null : clamp(y, this.world.minY, this.world.maxY),
      run,
      loose,
    });
  }

  // 返回 { clip, reason, request, move, rise }。
  // reason：autonomous 自主选择；path 为了满足请求先换姿态；move 为了满足请求在走动；reaction 响应用户操作。
  // move、rise：这个片段播放期间宠物在房间里左右、远近各移动多少（朝右、朝镜头为正）。
  next() {
    for (;;) {
      while (this.queue.length > 0) {
        const request = this.pickRequest();
        const step = request.kind === 'goto' ? this.stepForGoto(request) : this.stepForReaction(request);
        if (step === null || step.done) this.queue.splice(this.queue.indexOf(request), 1);
        if (step !== null) {
          return { clip: step.clip, reason: step.reason, move: step.move, rise: step.rise ?? 0, request };
        }
      }
      // 自主选择可能只是定了一个去处（加进队列），这时回到上面按请求走。
      const clip = this.chooseAutonomous();
      if (clip !== null) return { clip, reason: 'autonomous', move: 0, rise: 0, request: null };
    }
  }

  // 一般按排队顺序处理。例外：正走在半路上（朝右、正面、背面这些只在途中出现的姿态）时被摸，
  // 先走完再回应，否则要转身回应、再转回去接着走，光转身就要好几秒。
  // 喂食这类自己要走去某个地点的反应不受影响，它本来就会接着走。
  pickRequest() {
    const first = this.queue[0];
    if (first.kind !== 'reaction' || !this.anchors[this.anchor].passing) return first;
    const hasOwnSpot = this.clips.some(
      (clip) => clip.type === 'reaction' && clip.trigger === first.trigger && clip.at,
    );
    const pendingGoto = this.queue.find((request) => request.kind === 'goto');
    return !hasOwnSpot && pendingGoto ? pendingGoto : first;
  }

  // 返回下一步；已经到位返回 null。
  stepForGoto(request) {
    if (request.x != null && this.stillTravelling(request, request)) {
      const step = this.stepToward(request, request);
      if (step !== null) return step;
    }
    // 没指定姿态时，如果停在只在途中出现的姿态（朝右、正面、背面），转回朝左。
    const target = request.anchor ?? (this.anchors[this.anchor].passing ? 'stand' : this.anchor);
    const path = this.findPath(this.anchor, target);
    if (path === null || path.length === 0) return null;
    return { clip: path[0], reason: 'path', move: 0, rise: 0 };
  }

  // 返回下一步；这种操作在任何姿态下都没有对应片段时返回 null。
  stepForReaction(request) {
    // 反应片段可能只在某些姿态下有，选离当前姿态最近的那个。
    let best = null;
    for (const clip of this.clips) {
      if (clip.type !== 'reaction' || clip.trigger !== request.trigger) continue;
      const path = this.findPath(this.anchor, clip.from);
      if (path === null) continue;
      if (best === null || path.length < best.path.length) best = { clip, path };
    }
    if (best === null) return null;
    if (best.clip.at) {
      const spot = this.spots[best.clip.at];
      if (this.stillTravelling(request, spot)) return this.stepToward(request, spot);
    }
    if (best.path.length > 0) return { clip: best.path[0], reason: 'path', move: 0, rise: 0 };
    return { clip: best.clip, reason: 'reaction', move: 0, rise: 0, done: true };
  }

  // 没有请求时自己决定做什么。返回要播的片段；如果决定的是「去某处」，
  // 就把它加进队列并返回 null。
  chooseAutonomous() {
    if (this.anchors[this.anchor].passing) return this.findPath(this.anchor, 'stand')[0];
    const { bed, bowl } = this.spots;

    // 困了回窝睡觉。
    if (this.energy < SLEEPY_BELOW && this.anchor !== 'sleep') {
      this.queue.push({ kind: 'goto', anchor: 'sleep', x: bed.x, y: bed.y, auto: true, note: 'sleepy' });
      return null;
    }
    // 饿了去饭碗边坐着等。
    if (this.hungry && this.anchor !== 'sleep' && !this.isAt(bowl.x, bowl.y)) {
      this.queue.push({ kind: 'goto', anchor: 'sit', x: bowl.x, y: bowl.y, auto: true, note: 'hungry' });
      return null;
    }

    // 累了倾向于往更安静的姿态走（站 → 坐 → 趴 → 睡），精力足了反过来。
    const tiredness = clamp((60 - this.energy) / 60, 0, 1);
    const restedness = clamp((this.energy - 50) / 50, 0, 1);
    const mayChange = this.idlesSinceTransition >= this.minIdlesBetweenTransitions;

    const options = [];
    for (const clip of this.clips) {
      if (clip.from !== this.anchor) continue;
      if (clip.type === 'idle' && (clip.calm || clip !== this.lastClip)) {
        options.push({ clip, weight: clip.weight ?? 1 });
      }
      if (clip.type !== 'transition' || !mayChange) continue;
      if (clip.at && !this.isAt(this.spots[clip.at].x, this.spots[clip.at].y)) continue;
      const calmer = this.anchors[clip.to].activity < this.anchors[clip.from].activity;
      const weight = calmer ? 0.1 + 2 * tiredness : 2 * restedness;
      if (weight > 0) options.push({ clip, weight });
    }
    // 站着、不饿的时候偶尔换个地方：这是它的家，多数时间待着，不会不停地遛圈。
    if (this.anchor === 'stand' && mayChange && !this.hungry) {
      const elsewhere = Object.values(this.spots).filter((spot) => !this.isAt(spot.x, spot.y));
      if (elsewhere.length > 0) {
        const spot = pick(elsewhere);
        options.push({ goto: { x: spot.x, y: spot.y, run: false, note: 'wander' }, weight: 0.25 + 0.35 * restedness });
        if (this.energy > 75) {
          const far = elsewhere.reduce((a, b) => (Math.abs(b.x - this.x) > Math.abs(a.x - this.x) ? b : a));
          options.push({ goto: { x: far.x, y: far.y, run: true }, weight: 0.35 });
        }
      }
      // 只改左右或只改远近，避免为了闲逛走出折线。
      const { minX, maxX, minY, maxY } = this.world;
      if (Math.random() < 0.5) {
        options.push({
          goto: { x: minX + Math.random() * (maxX - minX), y: this.y, loose: true, note: 'wander' },
          weight: 0.15 + 0.2 * restedness,
        });
      } else {
        options.push({
          goto: { x: this.x, y: minY + Math.random() * (maxY - minY), loose: true, note: 'wander' },
          weight: 0.15 + 0.2 * restedness,
        });
      }
    }
    if (options.length === 0) {
      throw new Error(`姿态「${this.anchor}」下没有可播放的片段`);
    }

    const choice = pickWeighted(options);
    if (choice.clip) return choice.clip;
    this.queue.push({ kind: 'goto', auto: true, ...choice.goto });
    return null;
  }

  // 片段播完后更新姿态、位置和状态数值。
  finish(clip, seconds, move = 0, rise = 0) {
    this.x = clamp(this.x + move, this.world.minX, this.world.maxX);
    this.y = clamp(this.y + rise, this.world.minY, this.world.maxY);
    const rate = this.anchors[clip.to].energyPerSecond;
    this.energy = clamp(this.energy + rate * seconds, 0, 100);
    this.mood = clamp(this.mood - 0.1 * seconds, 0, 100);
    this.satiety = clamp(this.satiety - 0.12 * seconds, 0, 100);
    if (clip.gait === 'run') this.energy = clamp(this.energy - 4, 0, 100);
    if (clip.trigger === 'pet') this.mood = clamp(this.mood + 25, 0, 100);
    if (clip.trigger === 'feed') {
      this.satiety = clamp(this.satiety + 60, 0, 100);
      this.mood = clamp(this.mood + 10, 0, 100);
    }
    if (clip.trigger === 'play') {
      this.mood = clamp(this.mood + 20, 0, 100);
      this.energy = clamp(this.energy - 8, 0, 100);
    }
    if (clip.type === 'idle' || clip.type === 'reaction') this.idlesSinceTransition += 1;
    else this.idlesSinceTransition = 0;
    this.anchor = clip.to;
    this.lastClip = clip;
  }
}
