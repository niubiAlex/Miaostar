// 片段播放器：用两个叠放的 <video> 轮流播放带透明通道的片段。
// 片段播完后画面停在最后一帧（也就是某个固定姿态），下一个片段从同一姿态开始，
// 所以加载下一个片段的那一小段等待在画面上看不出来。
//
// 进度只跟随视频自身：不用时钟判断片段是否播完，否则页面切到后台、
// 浏览器暂停视频时，逻辑会跑到画面前面去。

// Safari 不支持带透明通道的 WebM，要用 HEVC；其他浏览器用 WebM。
const IS_SAFARI = /^((?!chrome|chromium|android).)*safari/i.test(navigator.userAgent);
const EXTENSION = IS_SAFARI ? '.mov' : '.webm';

function once(target, event) {
  return new Promise((resolve) => target.addEventListener(event, resolve, { once: true }));
}

// 等到视频真正画出一帧，避免显示时露出这个元素里残留的旧画面。
// 页面没在绘制时（比如嵌在别的应用里又被挡住），「画出一帧」的通知可能一直不来，
// 而视频自己还在播；所以最多等一小会儿就继续，免得逻辑卡住、片段在看不见的地方白白播完。
const FIRST_FRAME_TIMEOUT_MS = 300;
function firstFrame(video) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, FIRST_FRAME_TIMEOUT_MS);
    const done = () => {
      clearTimeout(timer);
      resolve();
    };
    if (typeof video.requestVideoFrameCallback === 'function') video.requestVideoFrameCallback(done);
    else requestAnimationFrame(done);
  });
}

// iOS 在低电量模式、省流量时不预先加载视频，也不让它自己播：「数据已加载」的事件一直不来，
// 要先调用 play()，被拒绝时还得等用户点一下页面。
function nextGesture() {
  return new Promise((resolve) => {
    const go = () => {
      removeEventListener('pointerdown', go, true);
      removeEventListener('touchstart', go, true);
      resolve();
    };
    addEventListener('pointerdown', go, true);
    addEventListener('touchstart', go, true);
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// 等片段自己播完。浏览器可能在页面进入后台时暂停视频，回到前台后要接着播。
// 返回 { ended, stopWatching }：片段被中途打断时调用 stopWatching，不再帮它恢复播放。
function playedToEnd(video) {
  const resume = () => {
    if (!document.hidden && video.paused && !video.ended) video.play().catch(() => {});
  };
  const timer = setInterval(resume, 1000);
  document.addEventListener('visibilitychange', resume);
  const stopWatching = () => {
    clearInterval(timer);
    document.removeEventListener('visibilitychange', resume);
  };
  const ended = new Promise((resolve) => {
    video.addEventListener('ended', () => {
      stopWatching();
      resolve();
    }, { once: true });
  });
  return { ended, stopWatching };
}

export class ClipPlayer {
  constructor(videoA, videoB) {
    this.videos = [videoA, videoB];
    this.front = 0;
    this.fadeMs = 120;
    this.urls = new Map();
    // 当前画面上的片段文件，用于核对画面和逻辑是否一致。
    this.showing = null;
    // 每次播放加一，用来让上一个片段遗留的逐帧回调自己停下。
    this.generation = 0;
    // 正在播放的片段：{ video, rate, cut }。没有在播时是 null。
    this.current = null;
  }

  // 立刻结束正在播放的片段，画面停在当前这一帧，下一个片段从这里淡入。
  // 只适合动作幅度很小的片段（待机），否则画面会跳。
  cut() {
    this.current?.cut();
  }

  // 让正在播放的片段剩下的部分播快一点（factor 是相对片段正常速度的倍数）。
  hurry(factor) {
    if (!this.current) return;
    const { video, rate } = this.current;
    video.playbackRate = Math.max(video.playbackRate, rate * factor);
  }

  // 把所有片段一次性下载到内存，之后切换不再走网络。
  async preload(clips, onProgress) {
    const files = [...new Set(clips.map((clip) => clip.file))];
    let done = 0;
    await Promise.all(
      files.map(async (file) => {
        const response = await fetch(file + EXTENSION);
        if (!response.ok) throw new Error(`片段加载失败：${file}${EXTENSION}（${response.status}）`);
        const blob = new Blob([await response.blob()], { type: IS_SAFARI ? 'video/quicktime' : 'video/webm' });
        this.urls.set(file, URL.createObjectURL(blob));
        done += 1;
        onProgress?.(done, files.length);
      }),
    );
  }

  // 开始播；浏览器不让自动播时，告诉页面（onBlocked），等用户点一下再播。
  async start(video) {
    for (;;) {
      try {
        await video.play();
        return;
      } catch (error) {
        if (error?.name !== 'NotAllowedError') return;
        this.onBlocked?.(true);
        await nextGesture();
        this.onBlocked?.(false);
      }
    }
  }

  // 播放一个片段，结束后返回 { seconds, wasCut }：播了片段里的多少秒，是不是被 cut() 中途打断的。
  // onStart 在画面真正开始时调用；onFrame(进度 0 到 1) 在播放期间每一帧调用，播完时一定以 1 调用一次。
  // hurry 是播放速度相对片段正常速度的倍数；fadeMs 是这次淡入的时长。
  async play(clip, { onStart, onFrame, hurry = 1, fadeMs = this.fadeMs } = {}) {
    this.generation += 1;
    const generation = this.generation;
    const incoming = this.videos[1 - this.front];
    const outgoing = this.videos[this.front];
    const rate = clip.rate ?? 1;
    let cutNow;
    const cutRequested = new Promise((resolve) => {
      cutNow = () => resolve(true);
    });
    this.current = { video: incoming, rate, cut: cutNow };

    // 先确保当前画面完全不透明、新片段完全透明。页面在后台时淡入动画会冻结，
    // 不这样做的话两个视频可能同时是透明的。
    outgoing.style.transition = 'none';
    if (this.showing !== null) outgoing.style.opacity = '1';
    incoming.style.transition = 'none';
    incoming.style.opacity = '0';

    // 有的片段画面比例和别的不同（比如溜达时猫只有一半大），由调用方给出这个视频的摆法。
    incoming.style.transformOrigin = '0 0';
    incoming.style.transform = clip.transform ?? 'none';
    const loaded = once(incoming, 'loadeddata');
    incoming.src = this.urls.get(clip.file);
    await Promise.race([loaded, sleep(1500)]);
    incoming.playbackRate = rate * hurry;
    // 先挂上「播完」的监听（它同时负责在视频被浏览器暂停后恢复播放），再开始播。
    const { ended, stopWatching } = playedToEnd(incoming);
    await this.start(incoming);
    await loaded;
    incoming.playbackRate = rate * hurry;
    await firstFrame(incoming);

    // 新片段移到上层淡入。旧片段在淡入期间不透明地垫在下面，所以宠物不会变淡；
    // 淡入结束后必须把旧片段藏起来，因为片段是透明底的，否则宠物身后会留着上一个姿态。
    incoming.style.zIndex = '2';
    outgoing.style.zIndex = '1';
    if (fadeMs > 0) {
      void incoming.offsetWidth;
      incoming.style.transition = `opacity ${fadeMs}ms linear`;
    }
    incoming.style.opacity = '1';
    this.front = 1 - this.front;
    this.showing = clip.file;
    onStart?.();

    let outgoingHidden = false;
    let over = false;
    const tick = () => {
      if (over || generation !== this.generation || incoming.ended) return;
      // 以新片段实际的不透明度为准，而不是按时间估计：藏早了宠物会有一瞬间变淡。
      if (!outgoingHidden && getComputedStyle(incoming).opacity === '1') {
        outgoing.style.opacity = '0';
        outgoingHidden = true;
      }
      if (incoming.duration > 0) onFrame?.(Math.min(1, incoming.currentTime / incoming.duration));
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);

    const wasCut = await Promise.race([ended.then(() => false), cutRequested]);
    over = true;
    this.current = null;
    if (wasCut) {
      stopWatching();
      incoming.pause();
    }
    // 被打断时可能还在淡入，直接到位。
    incoming.style.transition = 'none';
    incoming.style.opacity = '1';
    outgoing.style.opacity = '0';
    if (!wasCut) onFrame?.(1);
    return { seconds: incoming.currentTime, wasCut, video: incoming };
  }
}
