// 通用模型验证：一个带骨骼动画的通用猫模型，所有宠物共用动作，每只宠物只换一张贴图。
// 房间是三维的，镜头固定；宠物可以朝任意方向走，位移由程序推，速度按动画里脚掌贴地时的速度来定，所以脚不打滑。
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const $ = (id) => document.getElementById(id);
const stage = $('stage');
const canvas = $('canvas');

// ---------- 尺寸 ----------
// 长度单位是模型单位，猫站着大约高 0.56。
const ROOM = { width: 3.0, depth: 3.0, wallHeight: 1.7 };
// 宠物中心离墙至少这么远。
const WALL_MARGIN = 0.38;
const CAT_SCALE = 1.25;
const BED = new THREE.Vector3(0.85, 0, -0.85);
const BOWL = new THREE.Vector3(-0.95, 0, 0.55);
// 吃饭时站在碗的哪一侧、离碗心多远。
const EAT_OFFSET = new THREE.Vector3(0.42, 0, 0);

// 两个固定机位：方位角（绕竖轴，0 是正对后墙）、仰角、离房间中心的距离。
const VIEWS = {
  angled: { azimuth: 40, elevation: 33, distance: 10.2 },
  front: { azimuth: 0, elevation: 14, distance: 9.4 },
};
const LOOK_AT = new THREE.Vector3(0, 0.42, 0);

// 转向的快慢（弧度每秒）；两个动作之间交叉过渡的时长（秒）。
const TURN_RATE = 7;
const FADE = 0.25;
// 量不出步速时用的值（模型单位每秒）。
const FALLBACK_SPEED = { walk: 0.45, run: 1.3 };

// ---------- 场景 ----------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#f6ead6');
const camera = new THREE.PerspectiveCamera(22, 9 / 16, 0.1, 60);

scene.add(new THREE.HemisphereLight('#fff8ec', '#d9c3a3', 1.9));
const sun = new THREE.DirectionalLight('#fff3dd', 2.1);
sun.position.set(-2.6, 5.5, 3.4);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -3;
sun.shadow.camera.right = 3;
sun.shadow.camera.top = 3;
sun.shadow.camera.bottom = -3;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 14;
sun.shadow.radius = 6;
sun.shadow.bias = -0.0015;
scene.add(sun);

function woodTexture() {
  const size = 1024;
  const board = document.createElement('canvas');
  board.width = size;
  board.height = size;
  const context = board.getContext('2d');
  const planks = 8;
  for (let index = 0; index < planks; index += 1) {
    const shade = 0.94 + 0.06 * Math.sin(index * 12.9898) ** 2;
    context.fillStyle = `rgb(${Math.round(232 * shade)}, ${Math.round(196 * shade)}, ${Math.round(150 * shade)})`;
    context.fillRect((index * size) / planks, 0, size / planks, size);
    context.fillStyle = 'rgba(150, 110, 70, 0.35)';
    context.fillRect((index * size) / planks, 0, 3, size);
    // 每条木板在不同的位置有一道接缝。
    const joint = ((index * 0.37) % 1) * size;
    context.fillRect((index * size) / planks, joint, size / planks, 3);
  }
  const texture = new THREE.CanvasTexture(board);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function box(width, height, depth, color, x, y, z) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    new THREE.MeshStandardMaterial({ color, roughness: 0.9 }),
  );
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

function buildRoom() {
  const { width, depth, wallHeight } = ROOM;
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(width, depth),
    new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.85 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  floor.name = 'floor';
  scene.add(floor);

  // 后墙和左墙；墙有厚度，从上面看得到墙头。
  const wall = '#f7ecd4';
  box(width + 0.12, wallHeight, 0.12, wall, -0.06, wallHeight / 2, -depth / 2 - 0.06);
  box(0.12, wallHeight, depth, wall, -width / 2 - 0.06, wallHeight / 2, 0);
  // 踢脚线
  box(width, 0.09, 0.03, '#e3cfae', 0, 0.045, -depth / 2 + 0.015);
  box(0.03, 0.09, depth, '#e3cfae', -width / 2 + 0.015, 0.045, 0);

  // 后墙上的窗
  box(1.0, 0.8, 0.04, '#fffaf0', -0.35, 1.05, -depth / 2 + 0.02);
  const glass = box(0.86, 0.66, 0.05, '#bfe3f2', -0.35, 1.05, -depth / 2 + 0.025);
  glass.material.emissive = new THREE.Color('#bfe3f2');
  glass.material.emissiveIntensity = 0.35;
  glass.castShadow = false;
  box(0.03, 0.66, 0.06, '#fffaf0', -0.35, 1.05, -depth / 2 + 0.03);
  box(0.86, 0.03, 0.06, '#fffaf0', -0.35, 1.05, -depth / 2 + 0.03);

  // 左墙边的矮书架和上面的一盆植物
  box(0.3, 0.5, 0.9, '#c99a66', -width / 2 + 0.15, 0.25, -0.75);
  const bookColors = ['#d9765c', '#6fa3a8', '#e6b655', '#8d7fb8', '#7fae78'];
  bookColors.forEach((color, index) => {
    box(0.2, 0.3, 0.11, color, -width / 2 + 0.2, 0.25, -1.08 + index * 0.15).castShadow = false;
  });
  const pot = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.07, 0.13, 20),
    new THREE.MeshStandardMaterial({ color: '#d98b5f', roughness: 0.9 }),
  );
  pot.position.set(-width / 2 + 0.16, 0.565, -0.5);
  pot.castShadow = true;
  scene.add(pot);
  const plant = new THREE.Mesh(
    new THREE.SphereGeometry(0.15, 16, 12),
    new THREE.MeshStandardMaterial({ color: '#6fae6a', roughness: 1 }),
  );
  plant.position.set(-width / 2 + 0.16, 0.74, -0.5);
  plant.scale.set(1, 0.85, 1);
  plant.castShadow = true;
  scene.add(plant);

  // 地毯
  const rug = new THREE.Mesh(
    new THREE.CircleGeometry(0.72, 48),
    new THREE.MeshStandardMaterial({ color: '#e9b7a6', roughness: 1 }),
  );
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(-0.1, 0.004, 0.25);
  rug.receiveShadow = true;
  scene.add(rug);

  // 窝：一圈软边加中间的垫子
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(0.4, 0.1, 16, 40),
    new THREE.MeshStandardMaterial({ color: '#d98f8a', roughness: 1 }),
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.set(BED.x, 0.1, BED.z);
  rim.scale.set(1, 1, 0.8);
  rim.castShadow = true;
  rim.receiveShadow = true;
  scene.add(rim);
  const cushion = new THREE.Mesh(
    new THREE.CylinderGeometry(0.4, 0.4, 0.05, 40),
    new THREE.MeshStandardMaterial({ color: '#f3d7c8', roughness: 1 }),
  );
  cushion.position.set(BED.x, 0.025, BED.z);
  cushion.receiveShadow = true;
  scene.add(cushion);

  // 饭碗
  const bowl = new THREE.Mesh(
    new THREE.CylinderGeometry(0.17, 0.13, 0.09, 32),
    new THREE.MeshStandardMaterial({ color: '#7fb6c9', roughness: 0.6 }),
  );
  bowl.position.set(BOWL.x, 0.045, BOWL.z);
  bowl.castShadow = true;
  bowl.receiveShadow = true;
  scene.add(bowl);
  const food = new THREE.Mesh(
    new THREE.CylinderGeometry(0.14, 0.14, 0.02, 32),
    new THREE.MeshStandardMaterial({ color: '#a8703f', roughness: 1 }),
  );
  food.position.set(BOWL.x, 0.085, BOWL.z);
  food.visible = false;
  scene.add(food);
  return { floor, food };
}

const room = buildRoom();

// ---------- 镜头 ----------
let viewName = 'angled';
const cameraNow = { ...VIEWS.angled };

function placeCamera() {
  const azimuth = THREE.MathUtils.degToRad(cameraNow.azimuth);
  const elevation = THREE.MathUtils.degToRad(cameraNow.elevation);
  camera.position.set(
    LOOK_AT.x + cameraNow.distance * Math.sin(azimuth) * Math.cos(elevation),
    LOOK_AT.y + cameraNow.distance * Math.sin(elevation),
    LOOK_AT.z + cameraNow.distance * Math.cos(azimuth) * Math.cos(elevation),
  );
  camera.lookAt(LOOK_AT);
}

function resize() {
  const { clientWidth, clientHeight } = stage;
  renderer.setSize(clientWidth, clientHeight, false);
  camera.aspect = clientWidth / clientHeight;
  camera.updateProjectionMatrix();
}

// ---------- 宠物 ----------
const cat = {
  root: null,
  mesh: null,
  mixer: null,
  actions: {},
  current: null,
  speed: { ...FALLBACK_SPEED },
  heading: 0,
  // 正在去的地方：{ x, z, run, faceTo, onArrive }
  trip: null,
  // 正在做的事的名字，调试和自主行为用。
  doing: 'idle',
  coats: {},
};
let restTimer = 0;

function play(name, { once = false, fade = FADE } = {}) {
  const next = cat.actions[name];
  if (cat.current === next && !once) return next;
  next.reset();
  next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
  next.clampWhenFinished = true;
  next.timeScale = 1;
  next.play();
  if (cat.current && cat.current !== next) cat.current.crossFadeTo(next, fade, false);
  cat.current = next;
  return next;
}

// 量走、跑的速度：动画是原地踏步的，脚掌贴地的那段时间里它相对身体往后移的速度，就是身体该前进的速度。
function measureSpeed(model, clip) {
  const bone = model.getObjectByName('FrontLowerLeg_L');
  const paw = cat.pawLocal;
  const mixer = new THREE.AnimationMixer(model);
  mixer.clipAction(clip).play();
  const samples = [];
  const steps = 120;
  for (let index = 0; index <= steps; index += 1) {
    mixer.setTime((clip.duration * index) / steps);
    model.updateMatrixWorld(true);
    samples.push(bone.localToWorld(paw.clone()));
  }
  mixer.stopAllAction();
  mixer.uncacheRoot(model);
  const heights = samples.map((sample) => sample.y);
  const low = Math.min(...heights);
  const ground = low + 0.2 * (Math.max(...heights) - low);
  const step = clip.duration / steps;
  const speeds = [];
  for (let index = 1; index < samples.length; index += 1) {
    if (samples[index].y > ground || samples[index - 1].y > ground) continue;
    const speed = -(samples[index].z - samples[index - 1].z) / step;
    if (speed > 0) speeds.push(speed);
  }
  if (speeds.length < 5) return null;
  speeds.sort((a, b) => a - b);
  return speeds[Math.floor(speeds.length / 2)];
}

async function loadCat() {
  const gltf = await new GLTFLoader().loadAsync('assets/rig3d/cat.glb');
  const model = gltf.scene;
  // 文件里带了一个给手机用的简化网格，这里只用完整的那个。
  const simplified = model.getObjectByName('cat_LOD1');
  if (simplified) simplified.visible = false;
  const mesh = model.getObjectByName('cat_LOD0');
  mesh.castShadow = true;
  mesh.frustumCulled = false;

  const clips = Object.fromEntries(gltf.animations.map((clip) => [clip.name, clip]));
  // 左前脚掌在小腿骨骼里的位置：站着不动时，小腿骨骼正下方的地面那一点。
  model.updateMatrixWorld(true);
  const shin = model.getObjectByName('FrontLowerLeg_L');
  const shinAt = shin.getWorldPosition(new THREE.Vector3());
  cat.pawLocal = shin.worldToLocal(new THREE.Vector3(shinAt.x, 0, shinAt.z));
  for (const gait of ['walk', 'run']) {
    const measured = measureSpeed(model, clips[gait]);
    if (measured) cat.speed[gait] = measured * CAT_SCALE;
  }

  const calico = await new THREE.TextureLoader().loadAsync('assets/rig3d/calico.png');
  calico.flipY = false;
  calico.colorSpace = THREE.SRGBColorSpace;
  calico.anisotropy = 8;
  cat.coats = { original: mesh.material.map, calico };
  mesh.material.map = calico;

  const root = new THREE.Group();
  root.add(model);
  root.scale.setScalar(CAT_SCALE);
  scene.add(root);
  cat.root = root;
  cat.mesh = mesh;
  cat.mixer = new THREE.AnimationMixer(model);
  for (const [name, clip] of Object.entries(clips)) cat.actions[name] = cat.mixer.clipAction(clip);
  // 只播一遍的动作播完后，回到它之前循环着的动作。
  cat.mixer.addEventListener('finished', () => {
    cat.afterOnce?.();
  });
}

function rest(doing = 'idle') {
  cat.trip = null;
  cat.doing = doing;
  play(doing === 'sit' || doing === 'sleep' ? doing : 'idle');
  restTimer = 5 + Math.random() * 6;
}

function goTo(x, z, { run = false, faceTo = null, onArrive = null } = {}) {
  const limitX = ROOM.width / 2 - WALL_MARGIN;
  const limitZ = ROOM.depth / 2 - WALL_MARGIN;
  cat.trip = {
    x: THREE.MathUtils.clamp(x, -limitX, limitX),
    z: THREE.MathUtils.clamp(z, -limitZ, limitZ),
    run,
    faceTo,
    onArrive,
  };
  cat.doing = 'move';
  cat.afterOnce = null;
}

function angleDifference(to, from) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

// 朝 target 方向转，最多转 TURN_RATE * seconds；返回还差多少。
function turnToward(target, seconds) {
  const difference = angleDifference(target, cat.heading);
  const step = THREE.MathUtils.clamp(difference, -TURN_RATE * seconds, TURN_RATE * seconds);
  cat.heading += step;
  cat.root.rotation.y = cat.heading;
  return difference - step;
}

function updateTrip(seconds) {
  const trip = cat.trip;
  const position = cat.root.position;
  const dx = trip.x - position.x;
  const dz = trip.z - position.z;
  const distance = Math.hypot(dx, dz);
  const gait = trip.run && distance > 0.35 ? 'run' : 'walk';

  if (distance > 0.02) {
    const action = play(gait);
    const off = Math.abs(turnToward(Math.atan2(dx, dz), seconds));
    // 还没转过去的时候少往前走；脚步跟着放慢，免得原地空踩。
    const forward = Math.max(0, Math.cos(Math.min(off * 1.5, Math.PI / 2)));
    action.timeScale = Math.max(0.55, forward);
    const stride = Math.min(distance, cat.speed[gait] * forward * seconds);
    position.x += Math.sin(cat.heading) * stride;
    position.z += Math.cos(cat.heading) * stride;
    return;
  }
  // 到了：需要的话先转到指定的朝向。
  position.set(trip.x, 0, trip.z);
  if (trip.faceTo !== null) {
    play('walk').timeScale = 0.7;
    if (Math.abs(turnToward(trip.faceTo, seconds)) > 0.03) return;
  }
  const { onArrive } = trip;
  cat.trip = null;
  if (onArrive) onArrive();
  else rest();
}

// 没人理它的时候自己找点事做。
function actOnItsOwn() {
  const roll = Math.random();
  if (cat.doing === 'sleep') {
    if (roll < 0.3) rest();
    else restTimer = 6;
    return;
  }
  if (roll < 0.4) {
    const limitX = ROOM.width / 2 - WALL_MARGIN;
    const limitZ = ROOM.depth / 2 - WALL_MARGIN;
    goTo((Math.random() * 2 - 1) * limitX, (Math.random() * 2 - 1) * limitZ);
  } else if (roll < 0.6) {
    rest('sit');
  } else if (roll < 0.72) {
    goToBed();
  } else {
    cat.doing = 'idle';
    play(Math.random() < 0.5 ? 'idle_alt' : 'idle');
    restTimer = 4 + Math.random() * 4;
  }
}

function goToBed() {
  goTo(BED.x, BED.z, { faceTo: -Math.PI / 4, onArrive: () => rest('sleep') });
}

function feed() {
  room.food.visible = true;
  const spot = BOWL.clone().add(EAT_OFFSET);
  goTo(spot.x, spot.z, {
    run: true,
    faceTo: Math.atan2(-EAT_OFFSET.x, -EAT_OFFSET.z),
    onArrive: () => {
      cat.doing = 'eat';
      play('eat');
      restTimer = 6;
      cat.afterEat = true;
    },
  });
}

function pet() {
  spawnHearts();
  if (cat.doing === 'move' || cat.doing === 'eat') return;
  // 睡着被摸不醒；其他时候抬头叫一声，再回到原来的样子。
  if (cat.doing === 'sleep') return;
  const before = cat.doing;
  play('call', { once: true });
  cat.afterOnce = () => {
    cat.afterOnce = null;
    rest(before === 'sit' ? 'sit' : 'idle');
  };
  restTimer = 8;
}

const HEART_PATH =
  'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z';

function spawnHearts() {
  const head = cat.root.position.clone();
  head.y += 0.5 * CAT_SCALE;
  head.project(camera);
  const x = ((head.x + 1) / 2) * stage.clientWidth;
  const y = ((1 - head.y) / 2) * stage.clientHeight;
  for (let index = 0; index < 3; index += 1) {
    const heart = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    heart.setAttribute('viewBox', '0 0 24 24');
    heart.classList.add('heart');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', HEART_PATH);
    heart.appendChild(path);
    heart.style.left = `${x + (Math.random() - 0.5) * 40}px`;
    heart.style.top = `${y + (Math.random() - 0.5) * 20}px`;
    heart.style.setProperty('--drift', `${(Math.random() - 0.5) * 60}px`);
    heart.style.animationDelay = `${index * 90}ms`;
    heart.addEventListener('animationend', () => heart.remove());
    stage.appendChild(heart);
  }
}

// ---------- 操作 ----------
const raycaster = new THREE.Raycaster();

function pointerRay(event) {
  const rect = canvas.getBoundingClientRect();
  const pointer = new THREE.Vector2(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1,
  );
  raycaster.setFromCamera(pointer, camera);
}

function onClick(event, run) {
  pointerRay(event);
  // 点在它身上是摸头：用一个罩住它的球来判断，比逐个三角形算快，也好点中。
  const body = new THREE.Sphere(
    cat.root.position.clone().add(new THREE.Vector3(0, 0.3 * CAT_SCALE, 0)),
    0.34 * CAT_SCALE,
  );
  if (raycaster.ray.intersectsSphere(body)) {
    if (!run) pet();
    return;
  }
  const hit = raycaster.intersectObject(room.floor)[0];
  if (!hit) return;
  if (cat.doing === 'eat') room.food.visible = false;
  goTo(hit.point.x, hit.point.z, { run });
}

function pressed(on, off) {
  $(on).setAttribute('aria-pressed', 'true');
  $(off).setAttribute('aria-pressed', 'false');
}

function bindControls() {
  canvas.addEventListener('click', (event) => onClick(event, false));
  canvas.addEventListener('dblclick', (event) => onClick(event, true));
  $('petButton').addEventListener('click', pet);
  $('feedButton').addEventListener('click', feed);
  $('sitButton').addEventListener('click', () => rest('sit'));
  $('sleepButton').addEventListener('click', goToBed);
  $('coatCalico').addEventListener('click', () => {
    cat.mesh.material.map = cat.coats.calico;
    pressed('coatCalico', 'coatOriginal');
  });
  $('coatOriginal').addEventListener('click', () => {
    cat.mesh.material.map = cat.coats.original;
    pressed('coatOriginal', 'coatCalico');
  });
  $('viewAngled').addEventListener('click', () => {
    viewName = 'angled';
    pressed('viewAngled', 'viewFront');
  });
  $('viewFront').addEventListener('click', () => {
    viewName = 'front';
    pressed('viewFront', 'viewAngled');
  });
  window.addEventListener('resize', resize);
}

// ---------- 主循环 ----------
const clock = new THREE.Clock();

function frame() {
  const seconds = Math.min(clock.getDelta(), 0.1);
  if (cat.trip) {
    updateTrip(seconds);
  } else {
    restTimer -= seconds;
    if (restTimer <= 0) {
      if (cat.doing === 'eat') {
        room.food.visible = false;
        rest();
      } else {
        actOnItsOwn();
      }
    }
  }
  cat.mixer.update(seconds);

  // 换机位时慢慢转过去。
  const target = VIEWS[viewName];
  const blend = 1 - Math.exp(-seconds / 0.35);
  for (const key of ['azimuth', 'elevation', 'distance']) cameraNow[key] += (target[key] - cameraNow[key]) * blend;
  placeCamera();

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

async function main() {
  resize();
  placeCamera();
  await loadCat();
  cat.root.position.set(0.1, 0, 0.4);
  cat.heading = 0.5;
  cat.root.rotation.y = cat.heading;
  rest('sit');
  bindControls();
  // 方便在浏览器控制台里查看和调试。pawWorld 返回左前脚掌此刻在房间里的位置，检查脚打不打滑用。
  const pawBone = cat.root.getObjectByName('FrontLowerLeg_L');
  window.rigDebug = {
    cat,
    room,
    goTo,
    feed,
    pet,
    goToBed,
    rest,
    views: VIEWS,
    lookAt: LOOK_AT,
    setView: (name) => $(name === 'front' ? 'viewFront' : 'viewAngled').click(),
    pawWorld: () => pawBone.localToWorld(cat.pawLocal.clone()),
  };
  $('loading').hidden = true;
  requestAnimationFrame(frame);
}

main().catch((error) => {
  console.error(error);
  $('loading').hidden = false;
  $('loading').textContent = `出错了：${error.message}`;
});
