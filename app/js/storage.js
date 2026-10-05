// 학습 기록 저장·스키마 버전·백업 코드·스트릭
// storage 인자는 localStorage와 같은 getItem/setItem 인터페이스(테스트에서는 가짜 객체 주입).
import { addDays } from './scheduler.js';

export const STORAGE_KEY = 'yy-progress-v1';
export const SCHEMA_VERSION = 1;
const BACKUP_PREFIX = 'YY1:';
const HISTORY_LIMIT = 365;

export function defaultState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    words: {},
    streak: { current: 0, best: 0, lastDate: null },
    stamps: [],
    history: [],
    newIntroduced: { date: null, count: 0 },
    lastSessionFirstId: null,
    plans: {}, // 레슨별 5일 계획 진행 {completedDays, dayDates, day3Wrong, lastDayDate}
    koClaims: {}, // 아이가 "내 답도 맞아요"로 인정한 한글 뜻 {wordId: [답...]} — 부모 메뉴에서 확인
    lastQuote: -1,
    settings: {
      timer: 'normal', // relaxed | normal | challenge
      sessionSize: 15,
      newPerDay: 10,
      sound: true,
      activeLessons: [],
      writeMode: 'both', // 쓰기 단계: both = 단어마다 철자·한글 뜻 모두, one = 하나만 랜덤
    },
  };
}

// 이전 버전 데이터를 현재 스키마로 올린다. 모르는 버전이면 null.
export function migrate(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.schemaVersion === SCHEMA_VERSION) {
    const base = defaultState();
    return { ...base, ...raw, settings: { ...base.settings, ...raw.settings }, streak: { ...base.streak, ...raw.streak } };
  }
  return null;
}

export function load(storage) {
  try {
    const text = storage.getItem(STORAGE_KEY);
    if (!text) return defaultState();
    return migrate(JSON.parse(text)) ?? defaultState();
  } catch {
    return defaultState();
  }
}

export function save(storage, state) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false; // 저장 공간 부족·사생활 보호 모드 등
  }
}

// ---------- 백업 코드 ----------

function toBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function fromBase64(b64) {
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function checksum(text) {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (Math.imul(h, 31) + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export function exportCode(state) {
  const json = JSON.stringify(state);
  return `${BACKUP_PREFIX}${checksum(json)}:${toBase64(json)}`;
}

// 잘못된 코드면 Error를 던진다(화면에서 "코드가 올바르지 않아요" 표시)
export function importCode(code) {
  const s = String(code ?? '').trim();
  if (!s.startsWith(BACKUP_PREFIX)) throw new Error('백업 코드 형식이 아니에요');
  const rest = s.slice(BACKUP_PREFIX.length);
  const sep = rest.indexOf(':');
  if (sep < 0) throw new Error('백업 코드 형식이 아니에요');
  let json;
  try {
    json = fromBase64(rest.slice(sep + 1));
  } catch {
    throw new Error('백업 코드가 손상됐어요');
  }
  if (checksum(json) !== rest.slice(0, sep)) throw new Error('백업 코드가 손상됐어요');
  const state = migrate(JSON.parse(json));
  if (!state) throw new Error('지원하지 않는 백업 버전이에요');
  return state;
}

// ---------- 하루 기록 ----------

export function countNewIntroduced(state, today, n) {
  const cur = state.newIntroduced?.date === today ? state.newIntroduced.count : 0;
  return { ...state, newIntroduced: { date: today, count: cur + n } };
}

export function newIntroducedToday(state, today) {
  return state.newIntroduced?.date === today ? state.newIntroduced.count : 0;
}

// 세션을 끝까지 마쳤을 때: 도장·연속 출석·기록
export function recordSessionComplete(state, today, { asked, correct, seconds }) {
  const s = structuredClone(state);
  if (s.streak.lastDate !== today) {
    s.streak.current = s.streak.lastDate === addDays(today, -1) ? s.streak.current + 1 : 1;
    s.streak.best = Math.max(s.streak.best, s.streak.current);
    s.streak.lastDate = today;
  }
  if (!s.stamps.includes(today)) s.stamps.push(today);
  s.history.push({ date: today, asked, correct, seconds });
  if (s.history.length > HISTORY_LIMIT) s.history = s.history.slice(-HISTORY_LIMIT);
  return s;
}

// 홈 화면 표시용: 오늘 기준 연속 출석(어제까지 이어졌으면 유지, 그 전에 끊겼으면 0)
export function displayStreak(state, today) {
  const { current, lastDate } = state.streak;
  if (lastDate === today || lastDate === addDays(today, -1)) return current;
  return 0;
}
