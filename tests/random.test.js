import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng, randomInt, shuffle, sample, chance } from '../app/js/random.js';

// 카이제곱 임계값 (유의수준 0.01)
const CHI2_CRIT_01 = { 2: 9.21, 3: 11.34, 81: 113.51 };

function chiSquare(observed, expected) {
  return observed.reduce((s, o) => s + (o - expected) ** 2 / expected, 0);
}

test('randomInt는 0 이상 n 미만 정수만 낸다', () => {
  const rng = createRng('range');
  for (let i = 0; i < 10000; i++) {
    const x = randomInt(rng, 7);
    assert.ok(Number.isInteger(x) && x >= 0 && x < 7);
  }
  assert.throws(() => randomInt(rng, 0), RangeError);
  assert.throws(() => randomInt(rng, 2.5), RangeError);
});

test('randomInt 분포가 고르다 (카이제곱, n=3)', () => {
  const rng = createRng('int-uniform');
  const counts = [0, 0, 0];
  const N = 30000;
  for (let i = 0; i < N; i++) counts[randomInt(rng, 3)]++;
  assert.ok(chiSquare(counts, N / 3) < CHI2_CRIT_01[2], `counts=${counts}`);
});

test('실제 앱용 crypto 난수도 동작한다', () => {
  const rng = createRng();
  const seen = new Set();
  for (let i = 0; i < 2000; i++) seen.add(randomInt(rng, 4));
  assert.deepEqual([...seen].sort(), [0, 1, 2, 3]);
});

test('같은 시드는 같은 결과, 다른 시드는 다른 결과', () => {
  const a = shuffle([...Array(20).keys()], createRng(42));
  const b = shuffle([...Array(20).keys()], createRng(42));
  const c = shuffle([...Array(20).keys()], createRng(43));
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
});

test('shuffle은 원소를 보존하고 원본을 바꾸지 않는다', () => {
  const src = ['a', 'b', 'c', 'd', 'e'];
  const copy = src.slice();
  const out = shuffle(src, createRng(1));
  assert.deepEqual(src, copy);
  assert.deepEqual([...out].sort(), [...src].sort());
});

test('R1: 10개 단어를 10,000번 섞으면 모든 단어가 모든 위치에 고르게 나온다 (카이제곱)', () => {
  const rng = createRng('shuffle-uniform');
  const n = 10;
  const N = 10000;
  const counts = Array.from({ length: n }, () => new Array(n).fill(0));
  const items = [...Array(n).keys()];
  for (let k = 0; k < N; k++) {
    shuffle(items, rng).forEach((item, pos) => counts[item][pos]++);
  }
  const chi2 = chiSquare(counts.flat(), N / n);
  assert.ok(chi2 < CHI2_CRIT_01[81], `chi2=${chi2.toFixed(1)}`);
});

test('편향된 셔플(sort+random)은 이 검정에서 걸린다 — 검정이 실제로 편향을 잡는지 확인', () => {
  const rng = createRng('biased');
  const n = 10;
  const N = 10000;
  const counts = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let k = 0; k < N; k++) {
    const arr = [...Array(n).keys()].sort(() => (chance(rng, 0.5) ? 1 : -1));
    arr.forEach((item, pos) => counts[item][pos]++);
  }
  const chi2 = chiSquare(counts.flat(), N / n);
  assert.ok(chi2 > CHI2_CRIT_01[81], `biased chi2=${chi2.toFixed(1)} should be large`);
});

test('sample은 중복 없이 k개를 고른다', () => {
  const out = sample([1, 2, 3, 4, 5], 3, createRng(7));
  assert.equal(out.length, 3);
  assert.equal(new Set(out).size, 3);
  assert.equal(sample([1, 2], 5, createRng(7)).length, 2);
});
