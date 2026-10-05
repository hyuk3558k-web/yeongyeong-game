import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QUOTES, pickQuote, praiseFor } from '../app/js/praise.js';
import { createRng, randomFloat } from '../app/js/random.js';

const rand = (() => { const r = createRng('praise'); return () => randomFloat(r); })();

test('명언은 영어·한글·출처가 모두 있고, 연달아 같은 명언이 나오지 않는다', () => {
  assert.ok(QUOTES.length >= 15);
  for (const q of QUOTES) assert.ok(q.en && q.ko && q.by);
  let last = -1;
  const seen = new Set();
  for (let i = 0; i < 500; i++) {
    const k = pickQuote(rand, last);
    assert.notEqual(k, last);
    seen.add(k);
    last = k;
  }
  assert.equal(seen.size, QUOTES.length, '모든 명언이 고르게 나온다');
});

test('칭찬은 상황에 맞게 두 문장', () => {
  const improved = praiseFor({ streak: 3, ratio: 0.7, improved: 4, asked: 20 }, rand);
  assert.equal(improved.length, 2);
  assert.match(improved[0], /어제 틀렸던 단어 4개/);
  assert.match(improved[1], /3일째/);

  assert.match(praiseFor({ planDone: true, streak: 5 }, rand)[0], /5일 계획/);
  assert.match(praiseFor({ ratio: 0.3, streak: 1, planDay: 2 }, rand)[0], /끝까지|더 많이 배운/);
  assert.match(praiseFor({ ratio: 0.3, streak: 1, planDay: 2 }, rand)[1], /다음은 3일차/);
  assert.match(praiseFor({ streak: 10, ratio: 1 }, rand)[1], /10일 연속/);
});
