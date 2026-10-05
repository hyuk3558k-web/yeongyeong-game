import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLesson, maskLeak } from '../tools/lesson-builder.mjs';
import L05 from '../tools/lessons/L05.mjs';
import L06 from '../tools/lessons/L06.mjs';
import { createRng } from '../app/js/random.js';
import { newProgress } from '../app/js/scheduler.js';
import { buildSession, SessionRunner } from '../app/js/session.js';
import { currentPlanLesson } from '../app/js/plan.js';

const l5 = buildLesson(L05);
const l6 = buildLesson(L06);
const all = [...l5.words, ...l6.words];

test('Lesson 6: 28단어, 빈칸 정답 형태, 정답 누출 가림', () => {
  assert.equal(l6.words.length, 28);
  const by = Object.fromEntries(l6.words.map((w) => [w.word, w]));
  assert.equal(by.enjoy.examples[0].clozeAnswer, 'enjoyed');
  assert.equal(by.dip.examples[0].clozeText, 'She ____ French fries in ketchup.');
  assert.equal(by.taste.definitions[0].text, 'to have a particular ____');
  assert.equal(by.taste.definitions[0].original, 'to have a particular taste');
  assert.equal(by.mean.definitions[0].text, 'to have or represent a particular ____');
  assert.equal(by.tasty.definitions[0].text, 'pleasing to taste', 'tasty 풀이의 taste는 다른 단어라 그대로');
});

test('정답 누출 가리기: 변형까지, 다른 단어 속 글자는 건드리지 않음', () => {
  assert.equal(maskLeak('to notice a particular smell', 'smell'), 'to notice a particular ____');
  assert.equal(maskLeak('he looks and looked', 'look'), 'he ____ and ____');
  assert.equal(maskLeak('relating to Thailand', 'Thai'), 'relating to Thailand');
  assert.equal(maskLeak('a small amount', 'a little'), 'a small amount');
});

test('다른 레슨 단어와도 헷갈림 쌍: tasty와 Lesson 5 delicious는 보기에 같이 안 나온다', () => {
  const rng = createRng('cross');
  const progress = {};
  for (const w of all) progress[w.id] = { ...newProgress(), box: 1, due: '2026-10-06' };
  for (let k = 0; k < 300; k++) {
    const qs = buildSession({ words: all, progress, today: '2026-10-06', rng, settings: { sessionSize: 20 } });
    const r = new SessionRunner({ questions: qs, words: all, getProgress: () => progress, rng });
    while (!r.isDone()) {
      const q = r.current();
      if (q.mode === 'choice') {
        const pair = new Set([q.wordId, ...q.options]);
        assert.ok(!(pair.has('L06-tasty') && pair.has('L05-delicious')), `${q.wordId}: ${q.options}`);
        if (q.wordId === 'L06-taste') for (const x of ['L06-smell', 'L06-mean', 'L06-tasty']) assert.ok(!q.options.includes(x));
      }
      r.submit('correct');
    }
  }
});

test('5일 계획은 Lesson 5를 끝낸 뒤 Lesson 6으로 이어진다', () => {
  const lessons = [{ id: 'L05', order: 5 }, { id: 'L06', order: 6 }];
  assert.equal(currentPlanLesson(lessons, {}).id, 'L05');
  assert.equal(currentPlanLesson(lessons, { L05: { completedDays: [1, 2, 3, 4, 5] } }).id, 'L06');
});
