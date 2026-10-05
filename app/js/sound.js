// 효과음 (파일 없이 WebAudio로 만든 짧은 소리). 설정에서 끌 수 있다.

let ctx = null;
let enabled = true;

export function setSoundEnabled(on) {
  enabled = on;
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
    ctx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    SOUNDS[name]?.();
  } catch {
    // 소리를 못 내는 환경이면 조용히 넘어간다
  }
}
