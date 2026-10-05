import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng, randomInt, chance } from '../app/js/random.js';
import { newProgress, applyResult, addDays } from '../app/js/scheduler.js';
import {
  buildSession, selectWords, orderViolations, SessionRunner, RETRY_OFFSET, MAX_FORMAT_RUN,
  MAX_SESSION_QUESTIONS, wrongNoteWords, buildSessionFromWords,
} from '../app/js/session.js';
import { lesson5, idOf } from './fixtures/lesson5.js';

const TODAY = '2026-10-06';
const words = lesson5;
const byId = new Map(words.map((w) => [w.id, w]));

function progressWithBox(box, extra = {}) {
  return { ...newProgress(), box, due: TODAY, ...extra };
}

// 상자 1~4가 섞인, 모두 복습일이 된 상태
function mixedProgress(rng) {
  const p = {};
  for (const w of words) p[w.id] = progressWithBox(1 + randomInt(rng, 4));
  return p;
}

function runAll(questions, progress, rng, answer = () => 'correct') {
  const runner = new SessionRunner({ questions, words, getProgress: () => progress, rng });
  const shown = [];
  while (!runner.isDone()) {
    const q = runner.current();
    shown.push({ ...q, at: runner.index });
    runner.submit(answer(q, runner));
  }
  return { runner, shown };
}

test('처음 시작: 새 단어 10개, 전부 영영풀이 객관식', () => {
  const qs = buildSession({ words, progress: {}, today: TODAY, rng: createRng('first') });
  assert.equal(qs.length, 10);
  assert.equal(new Set(qs.map((q) => q.wordId)).size, 10);
  for (const q of qs) {
    assert.equal(q.mode, 'choice');
    assert.equal(q.format, 'definition', '처음 만나는 단어는 영영풀이로');
    assert.equal(q.definitionSource, 'handout');
  }
});

test('오늘 이미 새 단어를 소개했으면 그만큼 줄인다', () => {
  const picked = selectWords({ words, progress: {}, today: TODAY, rng: createRng(1), newIntroducedToday: 7 });
  assert.equal(picked.length, 3);
});

test('최근 틀린 단어(상자1)가 가장 먼저 뽑힌다', () => {
  const rng = createRng('priority');
  const progress = {};
  for (const w of words) progress[w.id] = progressWithBox(3);
  const wrongIds = [idOf('wish'), idOf('steep'), idOf('observatory')];
  for (const id of wrongIds) progress[id] = progressWithBox(1);
  for (let k = 0; k < 50; k++) {
    const picked = selectWords({ words, progress, today: TODAY, rng, settings: { sessionSize: 5 } });
    for (const id of wrongIds) assert.ok(picked.some((w) => w.id === id));
  }
});

test('상자에 따라 객관식/철자 단계가 정해진다', () => {
  const rng = createRng('modes');
  const progress = mixedProgress(rng);
  const qs = buildSession({ words, progress, today: TODAY, rng });
  assert.equal(qs.length, 15);
  for (const q of qs) {
    assert.equal(q.mode, progress[q.wordId].box <= 1 ? 'choice' : 'spelling');
  }
});

test('R2·R5·R6: 1,000개 세션에서 유인물 순서 3연속·같은 단어 연속·같은 형식 5연속·직전 첫 문항 반복이 없다', () => {
  const rng = createRng('order');
  let lastFirst = null;
  for (let k = 0; k < 1000; k++) {
    const qs = buildSession({ words, progress: mixedProgress(rng), today: TODAY, rng, lastSessionFirstId: lastFirst });
    assert.equal(orderViolations(qs, { lastSessionFirstId: lastFirst, checkFormatRun: true }), 0);
    let run = 1;
    for (let i = 1; i < qs.length; i++) {
      run = qs[i].format === qs[i - 1].format ? run + 1 : 1;
      assert.ok(run <= MAX_FORMAT_RUN);
    }
    if (lastFirst) assert.notEqual(qs[0].wordId, lastFirst);
    lastFirst = qs[0].wordId;
  }
});

test('R2: 순서 규칙이 없다면 실제로 위반이 자주 생긴다 (규칙이 의미 있는지 확인)', () => {
  // 1~15번만 남긴 상태에서 아무렇게나 섞으면 3연속 오름차순이 가끔 나온다 → orderViolations가 잡아야 한다
  const seq = [1, 2, 3, 9, 5].map((n) => ({ wordId: `w${n}`, lessonId: 'L05', sourceOrder: n, format: 'definition' }));
  assert.equal(orderViolations(seq, { checkFormatRun: false }), 1);
});

test('R6: 형식 비율 — 객관식은 빈칸 40%, 철자 단계는 영영풀이·빈칸·한글 뜻 각 1/3 (±5%)', () => {
  // 상자4는 '부족한 형식 우선' 규칙이 있으므로 상자1~3만으로 잰다
  const rng2 = createRng('ratio2');
  const t = { choice: {}, spelling: {} };
  for (let k = 0; k < 1000; k++) {
    const progress = {};
    for (const w of words) progress[w.id] = progressWithBox(chance(rng2, 0.5) ? 1 : 2 + randomInt(rng2, 2));
    for (const q of buildSession({ words, progress, today: TODAY, rng: rng2 })) t[q.mode][q.format] = (t[q.mode][q.format] ?? 0) + 1;
  }
  const share = (m, f) => (t[m][f] ?? 0) / Object.values(t[m]).reduce((a, b) => a + b, 0);
  assert.equal(t.choice.korean, undefined, '한글 뜻은 쓰기 단계에서만');
  assert.ok(Math.abs(share('choice', 'cloze') - 0.4) < 0.05, `choice cloze ${share('choice', 'cloze')}`);
  for (const f of ['definition', 'cloze', 'korean']) {
    assert.ok(Math.abs(share('spelling', f) - 1 / 3) < 0.05, `spelling ${f} ${share('spelling', f)}`);
  }
});

test('R3: 정답 위치가 4칸에 고르게(25%±2%) 나오고, 같은 위치 3연속은 없다', () => {
  const rng = createRng('positions');
  const counts = [0, 0, 0, 0];
  for (let k = 0; k < 1000; k++) {
    const progress = {};
    for (const w of words) progress[w.id] = progressWithBox(1);
    const qs = buildSession({ words, progress, today: TODAY, rng });
    const { shown } = runAll(qs, progress, rng);
    const seq = shown.filter((q) => q.mode === 'choice').map((q) => q.correctIndex);
    seq.forEach((p) => counts[p]++);
    for (let i = 2; i < seq.length; i++) assert.ok(!(seq[i] === seq[i - 1] && seq[i] === seq[i - 2]), `3연속 ${seq}`);
  }
  const total = counts.reduce((a, b) => a + b, 0);
  for (const c of counts) assert.ok(Math.abs(c / total - 0.25) < 0.02, `counts=${counts}`);
});

test('R7: 보기 4개는 서로 다르고 정답을 포함하며, 헷갈림 쌍과 빈칸에 들어맞는 단어는 빠진다', () => {
  const rng = createRng('options');
  for (let k = 0; k < 300; k++) {
    const progress = {};
    for (const w of words) progress[w.id] = progressWithBox(1);
    const qs = buildSession({ words, progress, today: TODAY, rng });
    const { shown } = runAll(qs, progress, rng);
    for (const q of shown.filter((x) => x.mode === 'choice')) {
      assert.equal(q.options.length, 4);
      assert.equal(new Set(q.options).size, 4);
      assert.equal(q.options[q.correctIndex], q.wordId);
      const w = byId.get(q.wordId);
      for (const id of w.confusableWith) assert.ok(!q.options.includes(id), `${w.word}: ${id} 보기 금지`);
      if (q.format === 'cloze') {
        for (const id of q.example.clozeConfusable) assert.ok(!q.options.includes(id), `${q.prompt}: ${id} 보기 금지`);
      }
    }
  }
  // 대표 사례: wish 문제에 hope가 보기로 나오면 안 된다
  const wish = byId.get(idOf('wish'));
  assert.ok(wish.confusableWith.includes(idOf('hope')));
});

test('빈칸 객관식은 기본형, 빈칸 철자는 문장 속 형태가 정답', () => {
  const rng = createRng('cloze-answer');
  let sawChoice = false;
  let sawSpelling = false;
  for (let k = 0; k < 200 && !(sawChoice && sawSpelling); k++) {
    const progress = {};
    for (const w of words) progress[w.id] = progressWithBox(1 + randomInt(rng, 3));
    for (const q of buildSession({ words, progress, today: TODAY, rng })) {
      if (q.wordId !== idOf('wake up') || q.format !== 'cloze') continue;
      assert.equal(q.prompt, 'I ____ late this morning.');
      if (q.mode === 'choice') { assert.equal(q.answer, 'wake up'); sawChoice = true; }
      else { assert.equal(q.answer, 'woke up'); sawSpelling = true; }
    }
  }
  assert.ok(sawChoice && sawSpelling);
});

test('R4·R8: 틀린 단어는 3~6문항 뒤에 다른 형식으로 다시 나오고, 단어당 최대 2번 + 재도전 라운드', () => {
  const rng = createRng('retry');
  for (let k = 0; k < 300; k++) {
    const progress = {};
    for (const w of words) progress[w.id] = progressWithBox(1);
    const qs = buildSession({ words, progress, today: TODAY, rng });
    const target = qs[randomInt(rng, qs.length)].wordId;
    const { shown, runner } = runAll(qs, progress, rng, (q) => (q.wordId === target ? 'wrong' : 'correct'));
    const appearances = shown.filter((q) => q.wordId === target);
    // 첫 출제 + 재출제 최대 2번 + 재도전 라운드 1번 (마지막 문항에서 틀리면 곧바로 재출제하지 않으므로 더 적을 수 있음)
    assert.ok(appearances.length >= 2 && appearances.length <= 4, `appearances=${appearances.length}`);
    const firstAt = qs.findIndex((q) => q.wordId === target);
    if (firstAt <= qs.length - 1 - RETRY_OFFSET.max) assert.equal(appearances.length, 4);
    for (let i = 1; i < appearances.length; i++) {
      assert.notEqual(appearances[i].format, appearances[i - 1].format, 'R8: 형식이 바뀌어야 함');
    }
    // 재출제 간격: 3 이상 (남은 문항이 부족해 맨 끝에 붙은 경우 제외)
    const gap = appearances[1].at - appearances[0].at;
    const remainingAfterFirst = qs.length - 1 - qs.findIndex((q) => q.wordId === target);
    if (remainingAfterFirst >= RETRY_OFFSET.min) {
      assert.ok(gap >= RETRY_OFFSET.min && gap <= RETRY_OFFSET.max, `gap=${gap}`);
    }
    // R5: 같은 단어 연속 없음
    for (let i = 1; i < shown.length; i++) assert.notEqual(shown[i].wordId, shown[i - 1].wordId);
    assert.deepEqual(runner.summary().wrongWordIds, [target]);
  }
});

test('많이 틀려도 한 세션은 최대 25문항, 넘친 오답은 다음 날 다시', () => {
  const rng = createRng('cap');
  for (let k = 0; k < 300; k++) {
    // 15개만 오늘 복습 대상, 나머지는 먼 미래
    const progress = {};
    const dueIds = new Set(words.map((w) => w.id).filter((_, i) => (i * 7 + k) % 27 < 15));
    for (const w of words) progress[w.id] = dueIds.has(w.id) ? progressWithBox(1) : progressWithBox(3, { due: addDays(TODAY, 30) });
    const qs = buildSession({ words, progress, today: TODAY, rng });
    assert.equal(qs.length, 15);
    const { shown } = runAll(qs, progress, rng, () => 'wrong');
    assert.ok(shown.length <= MAX_SESSION_QUESTIONS, `length=${shown.length}`);
    for (let i = 1; i < shown.length; i++) assert.notEqual(shown[i].wordId, shown[i - 1].wordId);
    // 모두 틀렸으므로 모두 상자1·다음 날 복습 대상
    for (const q of shown) progress[q.wordId] = applyResult(progress[q.wordId], { result: 'wrong', mode: q.mode, format: q.format, today: TODAY, hasCloze: true });
    const next = selectWords({ words, progress, today: addDays(TODAY, 1), rng });
    for (const q of qs) assert.ok(next.some((w) => w.id === q.wordId));
  }
});

test('오답 노트: 틀린 적 있는 단어만, 많이 틀린 순, 마스터한 단어 제외', () => {
  const progress = {
    [idOf('rock')]: progressWithBox(1, { wrong: 2 }),
    [idOf('wish')]: progressWithBox(2, { wrong: 5 }),
    [idOf('trip')]: progressWithBox(5, { wrong: 9 }),
    [idOf('steep')]: progressWithBox(3, { wrong: 0 }),
  };
  assert.deepEqual(wrongNoteWords(words, progress).map((w) => w.word), ['wish', 'rock']);
  const qs = buildSessionFromWords({ picked: wrongNoteWords(words, progress), words, progress, rng: createRng(3) });
  assert.equal(qs.length, 2);
});

test('재도전에서 맞히면 더 나오지 않는다', () => {
  const rng = createRng('retry-ok');
  const progress = {};
  for (const w of words) progress[w.id] = progressWithBox(1);
  const qs = buildSession({ words, progress, today: TODAY, rng });
  const target = qs[0].wordId;
  let wrongOnce = false;
  const { shown } = runAll(qs, progress, rng, (q) => {
    if (q.wordId === target && !wrongOnce) { wrongOnce = true; return 'wrong'; }
    return 'correct';
  });
  assert.equal(shown.filter((q) => q.wordId === target).length, 2);
  assert.equal(shown.length, qs.length + 1);
});

test('앱을 나갔다 오면(defer) 그 문항은 오답 없이 뒤로 미뤄진다', () => {
  const rng = createRng('defer');
  const progress = {};
  for (const w of words) progress[w.id] = progressWithBox(1);
  const qs = buildSession({ words, progress, today: TODAY, rng });
  const runner = new SessionRunner({ questions: qs, words, getProgress: () => progress, rng });
  const first = runner.current().wordId;
  runner.defer();
  assert.notEqual(runner.current().wordId, first);
  assert.equal(runner.queue.at(-1).wordId, first);
  while (!runner.isDone()) { runner.current(); runner.submit('correct'); }
  assert.equal(runner.log.length, qs.length);
  assert.equal(runner.summary().wrongWordIds.length, 0);
});

test('마스터 확인 문제는 바꿔 쓴 풀이를 약 50% 쓴다', () => {
  const rng = createRng('paraphrase');
  let para = 0;
  let total = 0;
  for (let k = 0; k < 2000; k++) {
    const progress = {};
    for (const w of words) progress[w.id] = progressWithBox(5);
    for (const q of buildSession({ words, progress, today: TODAY, rng })) {
      if (q.format !== 'definition' || !['delicious', 'moment', 'trip'].includes(q.baseWord)) continue;
      total++;
      if (q.definitionSource === 'paraphrase') para++;
    }
  }
  assert.ok(total > 100);
  assert.ok(Math.abs(para / total - 0.5) < 0.06, `paraphrase share ${para / total}`);
});

test('상자4는 아직 철자로 맞히지 못한 형식을 먼저 낸다', () => {
  const rng = createRng('box4');
  for (let k = 0; k < 200; k++) {
    const progress = {};
    for (const w of words) progress[w.id] = progressWithBox(4, { spelledFormats: ['definition'] });
    for (const q of buildSession({ words, progress, today: TODAY, rng })) assert.equal(q.format, 'cloze');
  }
});

test('30일 시뮬레이션: 틀린 단어는 다음 날 세션에 반드시 다시 나온다', () => {
  const rng = createRng('simulation');
  let progress = {};
  let newToday = { date: null, count: 0 };
  let lastFirst = null;
  let wrongYesterday = [];
  for (let day = 0; day < 30; day++) {
    const today = addDays(TODAY, day);
    const qs = buildSession({
      words, progress, today, rng, lastSessionFirstId: lastFirst,
      newIntroducedToday: newToday.date === today ? newToday.count : 0,
    });
    const ids = new Set(qs.map((q) => q.wordId));
    for (const id of wrongYesterday) assert.ok(ids.has(id), `day ${day}: 어제 틀린 ${id}가 없음`);
    newToday = { date: today, count: qs.filter((q) => !progress[q.wordId]).length };
    lastFirst = qs[0]?.wordId ?? lastFirst;

    const wrongToday = new Set();
    const runner = new SessionRunner({ questions: qs, words, getProgress: () => progress, rng });
    while (!runner.isDone()) {
      const q = runner.current();
      const result = chance(rng, 0.8) ? 'correct' : 'wrong';
      if (result === 'wrong') wrongToday.add(q.wordId);
      progress = {
        ...progress,
        [q.wordId]: applyResult(progress[q.wordId], { result, mode: q.mode, format: q.format, today, hasCloze: true }),
      };
      runner.submit(result);
    }
    wrongYesterday = [...wrongToday];
  }
  const mastered = Object.values(progress).filter((p) => p.box === 5).length;
  assert.ok(mastered > 0, '30일 동안 마스터한 단어가 있어야 함');
});
