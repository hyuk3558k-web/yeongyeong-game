import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyResult, newProgress, addDays, modeFor, isDue, toDateStr } from '../app/js/scheduler.js';

const D = '2026-10-06';
const step = (p, result, mode, format, today = D, hasCloze = true) => applyResult(p, { result, mode, format, today, hasCloze });

test('날짜 계산: 월말·연말을 넘어간다', () => {
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(toDateStr(new Date(2026, 0, 5)), '2026-01-05');
});

test('새 단어 정답 → 상자2(철자 단계), 2일 뒤', () => {
  const p = step(undefined, 'correct', 'choice', 'definition');
  assert.equal(p.box, 2);
  assert.equal(p.due, addDays(D, 2));
  assert.equal(modeFor(p), 'spelling');
});

test('새 단어 오답 → 상자1, 다음 날', () => {
  const p = step(undefined, 'wrong', 'choice', 'definition');
  assert.equal(p.box, 1);
  assert.equal(p.due, addDays(D, 1));
  assert.equal(modeFor(p), 'choice');
});

test('상자2→3(4일)→4(7일)', () => {
  let p = { ...newProgress(), box: 2, due: D };
  p = step(p, 'correct', 'spelling', 'definition');
  assert.equal(p.box, 3);
  assert.equal(p.due, addDays(D, 4));
  const d2 = addDays(D, 4);
  p = step(p, 'correct', 'spelling', 'cloze', d2);
  assert.equal(p.box, 4);
  assert.equal(p.due, addDays(d2, 7));
});

test('상자4: 서로 다른 3일 + 두 형식 모두 철자 정답이어야 마스터', () => {
  let p = { ...newProgress(), box: 4, due: D, spellingDays: ['2026-10-01', '2026-10-03'], spelledFormats: ['definition'] };
  // 3일은 채웠지만 빈칸 철자를 아직 못 맞힘 → 상자4 유지
  p = step(p, 'correct', 'spelling', 'definition');
  assert.equal(p.box, 4);
  assert.equal(p.due, addDays(D, 7));
  // 빈칸 철자 정답 → 마스터, 14일 뒤 확인
  const d2 = addDays(D, 7);
  p = step(p, 'correct', 'spelling', 'cloze', d2);
  assert.equal(p.box, 5);
  assert.equal(p.due, addDays(d2, 14));
  // 마스터 확인 정답 → 30일 뒤
  const d3 = addDays(d2, 14);
  p = step(p, 'correct', 'spelling', 'definition', d3);
  assert.equal(p.box, 5);
  assert.equal(p.due, addDays(d3, 30));
});

test('예문이 없는 단어는 영영풀이 철자만으로 마스터 가능', () => {
  let p = { ...newProgress(), box: 4, due: D, spellingDays: ['2026-10-01', '2026-10-03'], spelledFormats: ['definition'] };
  p = applyResult(p, { result: 'correct', mode: 'spelling', format: 'definition', today: D, hasCloze: false });
  assert.equal(p.box, 5);
});

test('어느 상자에서든 오답 → 상자1, 다음 날', () => {
  for (const box of [2, 3, 4, 5]) {
    const p = step({ ...newProgress(), box, due: D }, 'wrong', 'spelling', 'cloze');
    assert.equal(p.box, 1);
    assert.equal(p.due, addDays(D, 1));
    assert.equal(p.formatStats.cloze.wrong, 1);
  }
});

test('오늘 틀린 단어는 같은 날 재도전에서 맞혀도 승급하지 않는다 → 내일 다시', () => {
  let p = step({ ...newProgress(), box: 3, due: D }, 'wrong', 'spelling', 'definition');
  p = step(p, 'correct', 'spelling', 'cloze');
  assert.equal(p.box, 1);
  assert.equal(p.due, addDays(D, 1));
  assert.ok(isDue(p, addDays(D, 1)));
});

test('하루에 두 번 승급하지 않는다 (연습 세션)', () => {
  let p = step(undefined, 'correct', 'choice', 'definition');
  assert.equal(p.box, 2);
  p = step(p, 'correct', 'spelling', 'definition');
  assert.equal(p.box, 2);
});

test('힌트·형태 바꾸기로 맞힘(assisted) → 상자 유지, 내일 다시', () => {
  const p = step({ ...newProgress(), box: 3, due: D }, 'assisted', 'spelling', 'cloze');
  assert.equal(p.box, 3);
  assert.equal(p.due, addDays(D, 1));
  assert.equal(p.hintUsed, 1);
  assert.deepEqual(p.spelledFormats, []);
});

test('원본 진행 상태를 바꾸지 않는다', () => {
  const orig = { ...newProgress(), box: 2, due: D };
  const snapshot = structuredClone(orig);
  step(orig, 'correct', 'spelling', 'definition');
  assert.deepEqual(orig, snapshot);
});
