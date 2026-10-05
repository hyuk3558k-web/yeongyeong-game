import { test } from 'node:test';
import assert from 'node:assert/strict';
import { timeLimitMs, createCountdown } from '../app/js/timer.js';

test('중1 기준 기본 제한시간과 프리셋', () => {
  assert.equal(timeLimitMs('choice', 'definition'), 20000);
  assert.equal(timeLimitMs('choice', 'cloze'), 25000);
  assert.equal(timeLimitMs('spelling', 'definition'), 40000);
  assert.equal(timeLimitMs('spelling', 'cloze'), 45000);
  assert.equal(timeLimitMs('spelling', 'korean'), 40000);
  assert.equal(timeLimitMs('spelling', 'cloze', 'relaxed'), 67500);
  assert.equal(timeLimitMs('choice', 'definition', 'challenge'), 14000);
  assert.throws(() => timeLimitMs('choice', 'nope'));
});

test('일시정지 동안에는 시간이 줄지 않는다 (앱을 나갔다 올 때)', () => {
  let t = 0;
  const c = createCountdown(15000, () => t);
  t = 4000;
  assert.equal(c.remainingMs(), 11000);
  c.pause();
  t = 60000;
  assert.equal(c.remainingMs(), 11000);
  c.resume();
  t = 65000;
  assert.equal(c.remainingMs(), 6000);
  assert.equal(c.showNumber(), false);
  t = 66500;
  assert.equal(c.showNumber(), true);
  t = 80000;
  assert.ok(c.expired());
  assert.equal(c.fraction(), 0);
});
