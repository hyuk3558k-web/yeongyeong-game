import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng, chance } from '../app/js/random.js';
import { applyResult, newProgress } from '../app/js/scheduler.js';
import {
  PlanSession, dayWords, lessonWordsSorted, emptyPlan, completeDay, nextDay, canStartNewDay,
  currentPlanLesson, isPlanDone, MAX_REPEAT_ROUNDS, MIN_DAY4_WORDS, daysDoneOn, MAX_DAYS_PER_DATE,
} from '../app/js/plan.js';

test('하루 두 일차 제한은 레슨을 합쳐서 센다 (Lesson 5 5일차 + Lesson 6 1일차 = 2)', () => {
  const plans = {
    L05: { completedDays: [1, 2, 3, 4, 5], dayDates: { 4: '2026-10-05', 5: '2026-10-06' }, lastDayDate: '2026-10-06' },
    L06: emptyPlan(),
  };
  assert.equal(daysDoneOn(plans, '2026-10-06'), 1);
  assert.ok(canStartNewDay(plans.L06, '2026-10-06', daysDoneOn(plans, '2026-10-06')));
  plans.L06 = completeDay(plans.L06, 1, '2026-10-06', []);
  assert.ok(!canStartNewDay(plans.L06, '2026-10-06', daysDoneOn(plans, '2026-10-06')));
});
import { lesson5, idOf } from './fixtures/lesson5.js';

const TODAY = '2026-10-06';
const words = lesson5;
const lessonWords = lessonWordsSorted(words, 'L05');

function play(session, answer) {
  const shown = [];
  const events = [];
  while (!session.isDone()) {
    const q = session.current();
    shown.push({ ...q, stage: session.stage, round: session.round });
    session.submit(answer(q, session));
    const e = session.takeEvent();
    if (e) events.push(e);
  }
  return { shown, events };
}

test('1일차는 1~13번, 2일차는 14~27번, 3·5일차는 전체', () => {
  const ctx = { plan: emptyPlan(), progress: {}, rng: createRng(1) };
  assert.deepEqual(dayWords(1, lessonWords, ctx).map((w) => w.sourceOrder), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
  assert.deepEqual(dayWords(2, lessonWords, ctx).map((w) => w.sourceOrder), [14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27]);
  assert.equal(dayWords(3, lessonWords, ctx).length, 27);
  assert.equal(dayWords(5, lessonWords, ctx).length, 27);
});

test('4일차는 3일차 오답 + 오답 노트 단어 위주, 적으면 덜 외운 단어로 8개까지 채움', () => {
  const plan = { ...emptyPlan(), day3Wrong: [idOf('wish'), idOf('steep')] };
  const progress = { [idOf('rock')]: { ...newProgress(), box: 1, wrong: 2 } };
  const ws = dayWords(4, lessonWords, { plan, progress, rng: createRng(2) });
  assert.equal(ws.length, MIN_DAY4_WORDS);
  for (const id of [idOf('wish'), idOf('steep'), idOf('rock')]) assert.ok(ws.some((w) => w.id === id));

  const many = { ...emptyPlan(), day3Wrong: lessonWords.slice(0, 12).map((w) => w.id) };
  assert.equal(dayWords(4, lessonWords, { plan: many, progress: {}, rng: createRng(2) }).length, 12);
});

test('1일차 흐름: 객관식(13) → 오답 반복 → 쓰기(절반 7단어 × 철자+한글 뜻 = 14) 순서, 오답만 반복된다', () => {
  const rng = createRng('day1');
  const target = dayWords(1, lessonWords, { plan: emptyPlan(), progress: {}, rng });
  const s = new PlanSession({ day: 1, targetWords: target, words, getProgress: () => ({}), rng });
  const wrongOnce = new Set([idOf('beach'), idOf('hope'), idOf('moment')]);
  const missed = new Set();
  const { shown, events } = play(s, (q, sess) => {
    // 객관식에서 3개 틀리고, 오답 반복 1라운드에서 모두 맞힘
    if (sess.stage === 'choice' && wrongOnce.has(q.wordId)) { missed.add(q.wordId); return 'wrong'; }
    return 'correct';
  });
  const choice = shown.filter((q) => q.stage === 'choice');
  const repeat = shown.filter((q) => q.stage === 'repeat');
  const write = shown.filter((q) => q.stage === 'write');
  assert.equal(choice.length, 13);
  assert.ok(choice.every((q) => q.mode === 'choice' && q.format === 'definition'));
  assert.deepEqual(new Set(repeat.map((q) => q.wordId)), missed);
  assert.equal(repeat.length, 3);
  assert.equal(write.length, 14);
  assert.equal(write.filter((q) => q.format === 'korean').length, 7);
  assert.equal(write.filter((q) => q.format === 'definition' && q.mode === 'spelling').length, 7);
  // 객관식에서 틀린 단어는 쓰기에 반드시 들어간다
  for (const id of missed) assert.ok(write.some((q) => q.wordId === id), `${id} 쓰기 누락`);
  // 단계 순서가 섞이지 않는다
  const order = shown.map((q) => q.stage).filter((st, i, a) => st !== a[i - 1]);
  assert.deepEqual(order, ['choice', 'repeat', 'write']);
  assert.ok(events.some((e) => e.type === 'stage' && e.finished === 'choice' && e.next === 'repeat'));
  assert.deepEqual(new Set(s.summary().wrongWordIds), missed);
});

test('객관식을 다 맞히면 오답 반복 단계는 건너뛴다', () => {
  const rng = createRng('skip');
  const s = new PlanSession({ day: 2, targetWords: dayWords(2, lessonWords, { rng }), words, getProgress: () => ({}), rng });
  const { shown, events } = play(s, () => 'correct');
  assert.equal(shown.filter((q) => q.stage === 'repeat').length, 0);
  const e = events.find((x) => x.finished === 'choice');
  assert.equal(e.next, 'write');
  assert.deepEqual(e.skipped, ['repeat']);
});

test('오답 반복은 계속 틀려도 최대 3라운드', () => {
  const rng = createRng('rounds');
  const target = lessonWords.slice(0, 5);
  const s = new PlanSession({ day: 1, targetWords: target, words, getProgress: () => ({}), rng });
  const { shown } = play(s, (q, sess) => (q.wordId === target[0].id && sess.stage !== 'write' ? 'wrong' : 'correct'));
  const rounds = shown.filter((q) => q.stage === 'repeat').map((q) => q.round);
  assert.deepEqual(rounds, [1, 2, 3].slice(0, MAX_REPEAT_ROUNDS));
});

test('쓰기 단계에서 틀린 문항은 단계 끝에 한 번 더, 같은 단어가 연달아 나오지 않는다', () => {
  const rng = createRng('write-retry');
  for (let k = 0; k < 100; k++) {
    const target = dayWords(1, lessonWords, { rng });
    const s = new PlanSession({ day: 1, targetWords: target, words, getProgress: () => ({}), rng });
    const { shown } = play(s, (q, sess) => (sess.stage === 'write' && chance(rng, 0.3) ? 'wrong' : 'correct'));
    for (let i = 1; i < shown.length; i++) assert.notEqual(shown[i].wordId, shown[i - 1].wordId, `${i}: ${shown[i].wordId}`);
    const write = shown.filter((q) => q.stage === 'write');
    assert.ok(write.length >= 14 && write.length <= 28);
  }
});

test('쓰기 단계는 그날 단어의 절반: 1일차 7개, 2일차 7개, 3일차 14개 / 틀린 단어가 절반보다 많으면 틀린 단어 중에서만', () => {
  const rng = createRng('half');
  for (const [day, n] of [[1, 7], [2, 7], [3, 14]]) {
    const s = new PlanSession({ day, targetWords: dayWords(day, lessonWords, { rng }), words, getProgress: () => ({}), rng, writeMode: 'one' });
    const { shown } = play(s, () => 'correct');
    assert.equal(new Set(shown.filter((q) => q.stage === 'write').map((q) => q.wordId)).size, n, `${day}일차`);
  }
  // 객관식 13개 중 10개를 틀리면 쓰기 7개는 모두 틀린 단어에서
  const target = dayWords(1, lessonWords, { rng });
  const wrongIds = new Set(target.slice(0, 10).map((w) => w.id));
  const s = new PlanSession({ day: 1, targetWords: target, words, getProgress: () => ({}), rng });
  const { shown } = play(s, (q, sess) => (sess.stage === 'choice' && wrongIds.has(q.wordId) ? 'wrong' : 'correct'));
  const writeIds = new Set(shown.filter((q) => q.stage === 'write').map((q) => q.wordId));
  assert.equal(writeIds.size, 7);
  for (const id of writeIds) assert.ok(wrongIds.has(id));
});

test('쓰기에 고르는 단어는 날마다 달라진다 (모두 맞힌 경우)', () => {
  const rng = createRng('vary');
  const sets = new Set();
  for (let k = 0; k < 20; k++) {
    const s = new PlanSession({ day: 1, targetWords: dayWords(1, lessonWords, { rng }), words, getProgress: () => ({}), rng });
    const { shown } = play(s, () => 'correct');
    sets.add([...new Set(shown.filter((q) => q.stage === 'write').map((q) => q.wordId))].sort().join());
  }
  assert.ok(sets.size > 10, `서로 다른 조합 ${sets.size}개`);
});

test('보기 정답 위치가 고르고 3연속 같은 위치가 없다 (계획 학습에서도 R3)', () => {
  const rng = createRng('plan-pos');
  const counts = [0, 0, 0, 0];
  for (let k = 0; k < 300; k++) {
    const s = new PlanSession({ day: 3, targetWords: lessonWords, words, getProgress: () => ({}), rng });
    const { shown } = play(s, () => 'correct');
    const seq = shown.filter((q) => q.mode === 'choice').map((q) => q.correctIndex);
    seq.forEach((p) => counts[p]++);
    for (let i = 2; i < seq.length; i++) assert.ok(!(seq[i] === seq[i - 1] && seq[i] === seq[i - 2]));
  }
  const total = counts.reduce((a, b) => a + b, 0);
  for (const c of counts) assert.ok(Math.abs(c / total - 0.25) < 0.02, `counts=${counts}`);
});

test('5일차: 단어마다 예문 빈칸 1문항 + 다른 유형 1문항이 랜덤으로 섞인다', () => {
  const rng = createRng('day5');
  const s = new PlanSession({ day: 5, targetWords: lessonWords, words, getProgress: () => ({}), rng });
  const { shown } = play(s, () => 'correct');
  assert.equal(shown.length, 54);
  for (const w of lessonWords) {
    const qs = shown.filter((q) => q.wordId === w.id);
    assert.equal(qs.length, 2);
    assert.equal(qs.filter((q) => q.format === 'cloze').length, 1);
  }
  const formats = new Set(shown.map((q) => `${q.mode}/${q.format}`));
  assert.ok(formats.size >= 3, [...formats].join());
});

test('쓰기 "하나만" 설정이면 단어마다 한 문항', () => {
  const rng = createRng('one');
  const s = new PlanSession({ day: 3, targetWords: lessonWords, words, getProgress: () => ({}), rng, writeMode: 'one' });
  const { shown } = play(s, () => 'correct');
  assert.equal(shown.filter((q) => q.stage === 'write').length, 14);
});

test('계획 진행: 하루에 한 일차, 5일차 후 완료, 3일차 오답 기억', () => {
  let plan = emptyPlan();
  assert.equal(nextDay(plan), 1);
  assert.ok(canStartNewDay(plan, TODAY));
  plan = completeDay(plan, 1, TODAY, []);
  assert.equal(nextDay(plan), 2);
  assert.equal(daysDoneOn({ L05: plan }, TODAY), 1);
  assert.ok(canStartNewDay(plan, TODAY, 1), '같은 날 한 일차 더 가능');
  plan = completeDay(plan, 2, TODAY, []);
  assert.equal(daysDoneOn({ L05: plan }, TODAY), 2);
  assert.ok(!canStartNewDay(plan, TODAY, 2), `하루 최대 ${MAX_DAYS_PER_DATE}일차`);
  assert.ok(canStartNewDay(plan, '2026-10-07', daysDoneOn({ L05: plan }, '2026-10-07')));
  plan = completeDay(plan, 3, '2026-10-07', [idOf('wish')]);
  assert.deepEqual(plan.day3Wrong, [idOf('wish')]);
  plan = completeDay(plan, 4, '2026-10-09', []);
  plan = completeDay(plan, 5, '2026-10-10', []);
  assert.ok(isPlanDone(plan));
  assert.equal(nextDay(plan), null);
});

test('진행할 레슨: 순서가 빠른 레슨부터, 끝난 레슨은 건너뜀', () => {
  const lessons = [{ id: 'L06', order: 6 }, { id: 'L05', order: 5 }];
  const done = { completedDays: [1, 2, 3, 4, 5] };
  assert.equal(currentPlanLesson(lessons, {}).id, 'L05');
  assert.equal(currentPlanLesson(lessons, { L05: done }).id, 'L06');
  assert.equal(currentPlanLesson(lessons, { L05: done, L06: done }), null);
  assert.equal(currentPlanLesson(lessons, {}, ['L06']).id, 'L06');
});

test('계획 학습 결과도 간격 반복 기록에 반영된다 (틀린 단어는 다음 날 복습)', () => {
  const rng = createRng('sr');
  let progress = {};
  const s = new PlanSession({ day: 1, targetWords: dayWords(1, lessonWords, { rng }), words, getProgress: () => progress, rng });
  while (!s.isDone()) {
    const q = s.current();
    const result = q.wordId === idOf('beach') && s.stage === 'choice' ? 'wrong' : 'correct';
    progress = { ...progress, [q.wordId]: applyResult(progress[q.wordId], { result, mode: q.mode, format: q.format, today: TODAY, hasCloze: true }) };
    s.submit(result);
  }
  assert.equal(progress[idOf('beach')].box, 1);
  assert.equal(progress[idOf('beach')].due, '2026-10-07');
  assert.equal(progress[idOf('hope')].box, 2);
  const wroteKorean = s.log.find((l) => l.format === 'korean');
  assert.equal(progress[wroteKorean.wordId].formatStats.korean.correct, 1);
});
