// 不开浏览器，只跑调度逻辑：让它自己过很久，中间随机插入用户操作，检查有没有走出房间、
// 卡死、在不该睡的地方睡，以及走动时步幅被伸缩了多少（伸缩越大脚越打滑）。
// 用法：node scripts/check_director.mjs [位移数据文件，默认用 assets/motion.json]
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ANCHORS, CLIPS, SPOTS, WORLD, setSpots, depthScale } from '../src/graph.js';
import { Director } from '../src/director.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const motion = JSON.parse(readFileSync(process.argv[2] ?? join(ROOT, 'assets', 'motion.json'), 'utf8'));
const sideMoves = CLIPS.filter((clip) => clip.type === 'move' && clip.direction);
for (const clip of sideMoves) clip.distance = motion[clip.id].distance * WORLD.spriteWidth;
setSpots(sideMoves.map((clip) => clip.distance));

// 固定的伪随机数，结果可以复现。
let seed = 20261116;
Math.random = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};

const director = new Director({
  anchors: ANCHORS, clips: CLIPS, spots: SPOTS, world: WORLD, scaleAt: depthScale,
  startAnchor: 'sit', startX: SPOTS.bed.x, startY: SPOTS.bed.y,
});

const STEPS = 20000;
const problems = [];
const played = new Map();
const stretches = { exact: [], loose: [] };
// 每一趟走动（一个请求）有没有绕路。
const trips = new Map();
let seconds = 0;
let sleptAwayFromBed = 0;
let previous = null;
// 正面、背面走的每一段远近变了多少；侧身走时斜得最厉害的一段；斜着走的段数；到过的最近和最远。
const depthLegs = [];
let steepest = 0;
let slantedLegs = 0;
let nearest = -Infinity;
let farthest = Infinity;
const FIVE_SECOND_CLIPS = ['stand_eat', 'sit_play', 'sit_groom', 'stand_stretch'];

for (let step = 0; step < STEPS; step += 1) {
  // 平均每 12 个片段来一次用户操作。
  const roll = Math.random();
  if (roll < 0.02) director.requestReaction('pet', seconds);
  else if (roll < 0.035) director.requestReaction('feed', seconds);
  else if (roll < 0.05) director.requestReaction('play', seconds);
  else if (roll < 0.07) {
    const x = WORLD.minX + Math.random() * (WORLD.maxX - WORLD.minX);
    // 点的位置可能在墙上或按钮那一条，超出可走的远近。
    const y = 0.5 + Math.random() * 0.45;
    director.requestMove(x, { y, run: Math.random() < 0.4, loose: true });
  } else if (roll < 0.08) director.requestAnchor(['sit', 'lie', 'stand', 'sleep'][Math.floor(Math.random() * 4)]);

  const { clip, reason, move, rise, request } = director.next();
  if (clip.from !== director.anchor) {
    problems.push(`第 ${step} 步：在「${director.anchor}」姿态下播了从「${clip.from}」开始的 ${clip.id}`);
  }
  if (clip.at && !director.isAt(SPOTS[clip.at].x, SPOTS[clip.at].y)) {
    problems.push(`第 ${step} 步：不在${SPOTS[clip.at].label}却播了 ${clip.id}`);
  }
  if (clip.type === 'move' && clip.depth) {
    if (Math.sign(rise) !== clip.depth || move !== 0) problems.push(`第 ${step} 步：${clip.id} 的移动方向不对`);
    depthLegs.push(Math.abs(rise));
  } else if (clip.type === 'move') {
    if (Math.sign(move) !== clip.direction) problems.push(`第 ${step} 步：${clip.id} 的移动方向反了`);
    const kind = request?.loose ? 'loose' : 'exact';
    // 这一段在屏幕上自然前进多远，取决于它走到一半时的远近。
    stretches[kind].push(Math.abs(move) / (clip.distance * depthScale(director.y + rise / 2)));
    steepest = Math.max(steepest, Math.abs(rise / move));
    if (Math.abs(rise) > 0.01) slantedLegs += 1;
    // 同一趟里两个方向都走过，就是绕了一下。
    if (request) {
      request.directions = (request.directions ?? new Set()).add(clip.direction);
      if (!trips.has(request)) trips.set(request, false);
      if (request.directions.size > 1) trips.set(request, true);
    }
  } else if (move !== 0 || rise !== 0) {
    problems.push(`第 ${step} 步：${clip.id} 不是走动片段却带了位移`);
  }
  if (clip.type === 'idle' && !clip.calm && clip === previous) {
    problems.push(`第 ${step} 步：${clip.id} 连着播了两遍`);
  }
  previous = clip;
  const duration = (FIVE_SECOND_CLIPS.includes(clip.id) ? 5 : 4) / (clip.rate ?? 1);
  director.finish(clip, duration, move, rise);
  seconds += duration;
  if (director.x < WORLD.minX - 1e-9 || director.x > WORLD.maxX + 1e-9) {
    problems.push(`第 ${step} 步：走出了房间，x=${director.x}`);
  }
  if (director.y < WORLD.minY - 1e-9 || director.y > WORLD.maxY + 1e-9) {
    problems.push(`第 ${step} 步：走出了地板，y=${director.y}`);
  }
  nearest = Math.max(nearest, director.y);
  farthest = Math.min(farthest, director.y);
  if (director.anchor === 'sleep' && !director.isAt(SPOTS.bed.x, SPOTS.bed.y)) sleptAwayFromBed += 1;
  if (director.queue.length > 6) problems.push(`第 ${step} 步：请求越积越多（${director.queue.length} 个）`);
  played.set(clip.id, (played.get(clip.id) ?? 0) + 1);
  void reason;
}

const neverPlayed = CLIPS.filter((clip) => !played.has(clip.id)).map((clip) => clip.id);
const summarize = (values) => {
  if (values.length === 0) return '没有';
  const off = values.map((value) => Math.abs(value - 1));
  const within = off.filter((value) => value <= 0.151).length;
  return `${values.length} 段，其中 ${((within / values.length) * 100).toFixed(1)}% 伸缩在 15% 以内，最大偏离 ${(Math.max(...off) * 100).toFixed(0)}%`;
};

console.log(`地点：${Object.values(SPOTS).map((spot) => `${spot.label} ${spot.x.toFixed(3)}`).join('，')}`);
console.log(`步幅（屏）：${sideMoves.map((clip) => `${clip.id} ${clip.distance.toFixed(3)}`).join('，')}`);
console.log(`模拟 ${STEPS} 个片段，相当于 ${(seconds / 3600).toFixed(1)} 小时`);
console.log(`去固定地点的走动：${summarize(stretches.exact)}`);
console.log(`随手点地板的走动：${summarize(stretches.loose)}`);
const detours = [...trips.values()].filter(Boolean).length;
console.log(`一共走了 ${trips.size} 趟，其中 ${detours} 趟为了凑整步幅绕了一下（${((detours / trips.size) * 100).toFixed(1)}%）`);
console.log(`远近：到过 ${farthest.toFixed(2)}–${nearest.toFixed(2)}（可走范围 ${WORLD.minY}–${WORLD.maxY}）；侧身斜着走 ${slantedLegs} 段（应为 0），最斜每横走一屏远近变 ${steepest.toFixed(2)}；正面或背面走 ${depthLegs.length} 段，每段远近变 ${depthLegs.length ? `${Math.min(...depthLegs).toFixed(2)}–${Math.max(...depthLegs).toFixed(2)}` : '-'}`);
console.log(`各片段播放次数：${[...played].sort((a, b) => b[1] - a[1]).map(([id, count]) => `${id} ${count}`).join('，')}`);
if (neverPlayed.length > 0) problems.push(`从没播过的片段：${neverPlayed.join('、')}`);
if (sleptAwayFromBed > 0) problems.push(`有 ${sleptAwayFromBed} 次不在窝里睡`);
if (slantedLegs > 0) problems.push(`有 ${slantedLegs} 段侧身斜着走（应只走直线）`);
console.log(problems.length === 0 ? '没有发现问题' : `发现 ${problems.length} 个问题：\n${[...new Set(problems)].slice(0, 12).join('\n')}`);
process.exitCode = problems.length === 0 ? 0 : 1;
