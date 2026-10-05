// 효과음과 단어 발음 재생 (WebAudio)
// 아이폰 등은 화면을 터치할 때 한 번 소리를 "열어" 둬야 이후에 소리를 낼 수 있다 → 첫 터치에서 unlock.

let ctx = null;
let enabled = true;

export function setSoundEnabled(on) {
  enabled = on;
}

export function soundEnabled() {
  return enabled;
}

function getCtx() {
  try {
    ctx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
  } catch {
    ctx = null;
  }
  return ctx;
}

// 첫 터치 때 소리 열기
function unlock() {
  const c = getCtx();
  if (c) {
    const src = c.createBufferSource();
    src.buffer = c.createBuffer(1, 1, 22050);
    src.connect(c.destination);
    src.start(0);
  }
  window.removeEventListener('pointerdown', unlock, true);
  window.removeEventListener('keydown', unlock, true);
}
if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', unlock, true);
  window.addEventListener('keydown', unlock, true);
}

function tone(freq, start, dur, type = 'sine', gain = 0.14) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0, ctx.currentTime + start);
  g.gain.linearRampToValueAtTime(gain, ctx.currentTime + start + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
  o.connect(g).connect(ctx.destination);
  o.start(ctx.currentTime + start);
  o.stop(ctx.currentTime + start + dur + 0.02);
}

const SOUNDS = {
  correct: () => { tone(784, 0, 0.12, 'triangle'); tone(1175, 0.09, 0.2, 'triangle'); },
  wrong: () => { tone(330, 0, 0.18, 'sine', 0.12); tone(262, 0.14, 0.26, 'sine', 0.1); },
  tap: () => tone(660, 0, 0.05, 'triangle', 0.06),
  stamp: () => { tone(140, 0, 0.18, 'square', 0.08); tone(523, 0.12, 0.14, 'triangle'); tone(784, 0.22, 0.14, 'triangle'); tone(1047, 0.32, 0.3, 'triangle'); },
  tick: () => tone(880, 0, 0.04, 'square', 0.03),
};

export function play(name) {
  if (!enabled) return;
  try {
    if (getCtx()) SOUNDS[name]?.();
  } catch {
    // 소리를 못 내는 환경이면 조용히 넘어간다
  }
}

// ---------- 녹음된 소리 파일 ----------

const buffers = new Map(); // url → Promise<AudioBuffer|null>
let current = null;

function loadBuffer(url) {
  if (!buffers.has(url)) {
    buffers.set(url, (async () => {
      const c = getCtx();
      if (!c) return null;
      const res = await fetch(url);
      if (!res.ok) return null;
      const data = await res.arrayBuffer();
      return await new Promise((resolve, reject) => c.decodeAudioData(data, resolve, reject));
    })().catch(() => null));
  }
  return buffers.get(url);
}

export function preload(url) {
  loadBuffer(url);
}

/**
 * 소리 파일을 재생한다. 파일이 없거나 재생할 수 없으면 false.
 * @param {string} url
 * @param {number} delaySec  효과음과 겹치지 않게 조금 뒤에 시작
 */
export async function playFile(url, delaySec = 0) {
  const buf = await loadBuffer(url);
  const c = getCtx();
  if (!buf || !c) return false;
  try {
    current?.stop();
  } catch { /* 이미 끝남 */ }
  const src = c.createBufferSource();
  src.buffer = buf;
  const g = c.createGain();
  g.gain.value = 1.4;
  src.connect(g).connect(c.destination);
  src.start(c.currentTime + delaySec);
  current = src;
  return true;
}
