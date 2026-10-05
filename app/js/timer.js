// 문항 제한시간 (설계서 §3 타이머)
// now()를 주입할 수 있어 테스트에서 시간을 직접 움직일 수 있다.

// 2026-10-05 부모 요청으로 늘림 (이전: 객관식 15/20초, 철자 30/35초)
export const BASE_SECONDS = {
  choice: { definition: 20, cloze: 25 },
  spelling: { definition: 40, cloze: 45, korean: 40 },
};
export const PRESET_FACTOR = { relaxed: 1.5, normal: 1, challenge: 0.7 };
export const SHOW_NUMBER_BELOW = 5; // 남은 시간 숫자는 마지막 5초부터만 표시

export function timeLimitMs(mode, format, preset = 'normal') {
  const base = BASE_SECONDS[mode]?.[format];
  if (!base) throw new Error(`알 수 없는 문항 종류: ${mode}/${format}`);
  return Math.round(base * (PRESET_FACTOR[preset] ?? 1) * 1000);
}

export function createCountdown(limitMs, now = () => performance.now()) {
  let startedAt = now();
  let usedBeforePause = 0;
  let paused = false;
  const elapsed = () => usedBeforePause + (paused ? 0 : now() - startedAt);
  return {
    pause() {
      if (paused) return;
      usedBeforePause = elapsed();
      paused = true;
    },
    resume() {
      if (!paused) return;
      startedAt = now();
      paused = false;
    },
    get paused() {
      return paused;
    },
    elapsedMs: elapsed,
    remainingMs: () => Math.max(0, limitMs - elapsed()),
    fraction: () => Math.max(0, 1 - elapsed() / limitMs), // 막대 길이
    expired: () => elapsed() >= limitMs,
    showNumber: () => limitMs - elapsed() <= SHOW_NUMBER_BELOW * 1000,
  };
}
