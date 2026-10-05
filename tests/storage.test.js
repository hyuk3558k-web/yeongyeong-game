import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  load, save, defaultState, exportCode, importCode, recordSessionComplete, displayStreak,
  countNewIntroduced, newIntroducedToday, STORAGE_KEY,
} from '../app/js/storage.js';

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m };
}

test('저장한 것을 그대로 불러온다', () => {
  const st = memoryStorage();
  const s = defaultState();
  s.words['L05-rock'] = { box: 3 };
  assert.ok(save(st, s));
  assert.deepEqual(load(st), s);
});

test('빈 저장소·깨진 데이터·모르는 버전이면 기본 상태', () => {
  const st = memoryStorage();
  assert.deepEqual(load(st), defaultState());
  st.setItem(STORAGE_KEY, '{not json');
  assert.deepEqual(load(st), defaultState());
  st.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: 99 }));
  assert.deepEqual(load(st), defaultState());
});

test('저장 실패(용량 초과 등)해도 앱이 죽지 않는다', () => {
  const st = { getItem: () => null, setItem: () => { throw new Error('QuotaExceeded'); } };
  assert.equal(save(st, defaultState()), false);
});

test('예전 저장 데이터에 새 설정 항목이 없으면 기본값으로 채운다', () => {
  const st = memoryStorage();
  st.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: 1, words: {}, settings: { timer: 'relaxed' } }));
  const s = load(st);
  assert.equal(s.settings.timer, 'relaxed');
  assert.equal(s.settings.sessionSize, 15);
});

test('백업 코드: 내보내기 → 가져오기 (한글 포함)', () => {
  const s = defaultState();
  s.words['L05-wish'] = { box: 5 };
  s.history.push({ date: '2026-10-06', asked: 15, correct: 12, seconds: 300, note: '잘했어요' });
  const code = exportCode(s);
  assert.ok(code.startsWith('YY1:'));
  assert.deepEqual(importCode(code), s);
});

test('잘못되거나 손상된 백업 코드는 거부', () => {
  assert.throws(() => importCode('hello'), /형식/);
  const code = exportCode(defaultState());
  const broken = code.slice(0, -4) + (code.endsWith('AAAA') ? 'BBBB' : 'AAAA');
  assert.throws(() => importCode(broken), /손상|형식|JSON/);
});

test('연속 출석: 이어지면 +1, 하루 빠지면 1부터, 같은 날 여러 번은 한 번', () => {
  let s = defaultState();
  s = recordSessionComplete(s, '2026-10-06', { asked: 15, correct: 10, seconds: 300 });
  s = recordSessionComplete(s, '2026-10-07', { asked: 15, correct: 11, seconds: 280 });
  s = recordSessionComplete(s, '2026-10-07', { asked: 15, correct: 14, seconds: 250 });
  assert.equal(s.streak.current, 2);
  assert.deepEqual(s.stamps, ['2026-10-06', '2026-10-07']);
  assert.equal(s.history.length, 3);
  s = recordSessionComplete(s, '2026-10-09', { asked: 15, correct: 9, seconds: 310 });
  assert.equal(s.streak.current, 1);
  assert.equal(s.streak.best, 2);
});

test('홈 화면 연속 출석 표시: 어제까지 했으면 유지, 이틀 전이면 0', () => {
  let s = recordSessionComplete(defaultState(), '2026-10-06', { asked: 1, correct: 1, seconds: 1 });
  assert.equal(displayStreak(s, '2026-10-07'), 1);
  assert.equal(displayStreak(s, '2026-10-08'), 0);
});

test('오늘 소개한 새 단어 수는 날짜가 바뀌면 0부터', () => {
  let s = countNewIntroduced(defaultState(), '2026-10-06', 6);
  s = countNewIntroduced(s, '2026-10-06', 3);
  assert.equal(newIntroducedToday(s, '2026-10-06'), 9);
  assert.equal(newIntroducedToday(s, '2026-10-07'), 0);
});
