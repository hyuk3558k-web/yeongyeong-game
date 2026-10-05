// 라이트너 상자 간격 반복 (설계서 §2 상태 전이 B)
// 날짜는 기기 현지 시간 기준 'YYYY-MM-DD' 문자열로 다룬다(문자열 비교 = 날짜 비교).

export const BOX_INTERVAL_DAYS = { 1: 1, 2: 2, 3: 4, 4: 7, 5: 14 };
export const MASTERED_RECHECK_DAYS = 30;
export const MASTERY_SPELLING_DAYS = 3;
export const MAX_BOX = 5;

export function toDateStr(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return toDateStr(new Date(y, m - 1, d + days));
}

export function newProgress() {
  return {
    box: 0,
    due: null,
    correct: 0,
    wrong: 0,
    lastSeen: null,
    lastAdvanced: null,
    lastWrong: null,
    spellingDays: [],
    spelledFormats: [],
    hintUsed: 0,
    formatStats: {
      definition: { correct: 0, wrong: 0 },
      cloze: { correct: 0, wrong: 0 },
      korean: { correct: 0, wrong: 0 },
    },
  };
}

// 상자 0~1은 객관식, 2 이상은 철자 입력
export function modeFor(progress) {
  return (progress?.box ?? 0) <= 1 ? 'choice' : 'spelling';
}

export function isNew(progress) {
  return !progress || progress.box === 0;
}

export function isDue(progress, today) {
  return !!progress && progress.box > 0 && progress.due !== null && progress.due <= today;
}

export function isMastered(progress) {
  return !!progress && progress.box === MAX_BOX;
}

// 마스터에 필요한데 아직 철자로 맞히지 못한 형식들
export function missingSpelledFormats(progress, hasCloze) {
  const need = hasCloze ? ['definition', 'cloze'] : ['definition'];
  const have = progress?.spelledFormats ?? [];
  return need.filter((f) => !have.includes(f));
}

/**
 * 한 문항 결과를 반영한 새 진행 상태를 돌려준다(원본 불변).
 * @param {object} progress  이전 상태(없으면 새 단어)
 * @param {object} r
 * @param {'correct'|'assisted'|'wrong'} r.result  assisted = 힌트 사용 또는 "형태 바꾸기" 두 번째 기회로 맞힘
 * @param {'choice'|'spelling'} r.mode
 * @param {'definition'|'cloze'} r.format
 * @param {string} r.today
 * @param {boolean} r.hasCloze  빈칸 문제를 낼 수 있는 예문이 있는 단어인가
 */
export function applyResult(progress, { result, mode, format, today, hasCloze }) {
  const p = structuredClone(progress ?? newProgress());
  p.lastSeen = today;
  p.formatStats[format] ??= { correct: 0, wrong: 0 }; // 예전 기록에는 korean 칸이 없다
  const stats = p.formatStats[format];

  if (result === 'wrong') {
    p.wrong += 1;
    stats.wrong += 1;
    p.box = 1;
    p.due = addDays(today, BOX_INTERVAL_DAYS[1]);
    p.lastWrong = today;
    return p;
  }

  p.correct += 1;
  stats.correct += 1;

  if (result === 'assisted') {
    // 도움을 받아 맞힌 경우: 상자는 그대로, 내일 다시
    p.hintUsed += 1;
    if (p.box === 0) p.box = 1;
    if (p.lastWrong !== today) p.due = addDays(today, 1);
    return p;
  }

  if (mode === 'spelling') {
    if (!p.spellingDays.includes(today)) p.spellingDays.push(today);
    if (!p.spelledFormats.includes(format)) p.spelledFormats.push(format);
  }

  // 같은 날 두 번째 승급은 하지 않는다(연습 세션에서 몰아서 올리는 것 방지).
  // 오늘 틀린 단어는 세션 안 재도전에서 맞혀도 승급하지 않는다 → 내일 반드시 다시 나온다.
  if (p.lastAdvanced === today || p.lastWrong === today) return p;

  if (p.box <= 1) {
    p.box = 2;
  } else if (p.box === 2 || p.box === 3) {
    p.box += 1;
  } else if (p.box === 4) {
    const enoughDays = p.spellingDays.length >= MASTERY_SPELLING_DAYS;
    const allFormats = missingSpelledFormats(p, hasCloze).length === 0;
    if (enoughDays && allFormats) p.box = 5;
  }

  p.due = addDays(today, p.box === MAX_BOX && progress?.box === MAX_BOX ? MASTERED_RECHECK_DAYS : BOX_INTERVAL_DAYS[p.box]);
  p.lastAdvanced = today;
  return p;
}
