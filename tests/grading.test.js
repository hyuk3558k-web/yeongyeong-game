import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gradeSpelling, gradeKorean, normalize, spellingDiff } from '../app/js/grading.js';

const def = (answer, extra = {}) => ({ answer, baseWord: answer, format: 'definition', ...extra });
const cloze = (answer, baseWord) => ({ answer, baseWord, format: 'cloze' });

test('대소문자·공백·둥근 따옴표 차이는 무시', () => {
  assert.equal(gradeSpelling('  SEPTEMBER ', def('September')), 'correct');
  assert.equal(gradeSpelling('wake   up', def('wake up')), 'correct');
  assert.equal(normalize('I’m'), "i'm");
});

test('철자가 다르면 오답, 빈 입력은 empty', () => {
  assert.equal(gradeSpelling('lighthose', def('lighthouse')), 'wrong');
  assert.equal(gradeSpelling('   ', def('rock')), 'empty');
});

test('허용 답안 인정', () => {
  assert.equal(gradeSpelling('color', def('colour', { accepted: ['color'] })), 'correct');
});

test('빈칸 철자: 문장 속 형태만 정답, 기본형·다른 변형은 needsForm', () => {
  assert.equal(gradeSpelling('hiking', cloze('hiking', 'hike')), 'correct');
  assert.equal(gradeSpelling('hike', cloze('hiking', 'hike')), 'needsForm');
  assert.equal(gradeSpelling('hiked', cloze('hiking', 'hike')), 'needsForm');
  assert.equal(gradeSpelling('pushed', cloze('pushed', 'push')), 'correct');
  assert.equal(gradeSpelling('push', cloze('pushed', 'push')), 'needsForm');
  assert.equal(gradeSpelling('shines', cloze('shines', 'shine')), 'correct');
  assert.equal(gradeSpelling('waves', cloze('waves', 'wave')), 'correct');
  assert.equal(gradeSpelling('wave', cloze('waves', 'wave')), 'needsForm');
});

test('불규칙형·구 단어: woke up 자리에 wake up/wakes up은 needsForm', () => {
  assert.equal(gradeSpelling('woke up', cloze('woke up', 'wake up')), 'correct');
  assert.equal(gradeSpelling('Woke Up', cloze('woke up', 'wake up')), 'correct');
  assert.equal(gradeSpelling('wake up', cloze('woke up', 'wake up')), 'needsForm');
  assert.equal(gradeSpelling('wakes up', cloze('woke up', 'wake up')), 'needsForm');
  assert.equal(gradeSpelling('woke', cloze('woke up', 'wake up')), 'wrong');
});

test('영영풀이 철자에서 변형을 쓰면 그냥 오답', () => {
  assert.equal(gradeSpelling('hiking', def('hike')), 'wrong');
});

test('한글 뜻: 여러 뜻 중 하나만 써도, 띄어쓰기·괄호·물결표가 달라도 정답', () => {
  const hope = { koMeanings: ['바라다', '기대하다'], koAccepted: ['희망하다'] };
  assert.equal(gradeKorean('바라다', hope), 'correct');
  assert.equal(gradeKorean(' 기대 하다 ', hope), 'correct');
  assert.equal(gradeKorean('바라다, 기대하다', hope), 'correct');
  assert.equal(gradeKorean('희망하다', hope), 'correct');
  assert.equal(gradeKorean('싫어하다', hope), 'wrong');
  assert.equal(gradeKorean('바라다, 싫어하다', hope), 'wrong', '쓴 뜻이 모두 맞아야 함');
  assert.equal(gradeKorean('   ', hope), 'empty');

  const rise = { koMeanings: ['(해·달이) 뜨다', '오르다'], koAccepted: [] };
  assert.equal(gradeKorean('뜨다', rise), 'correct');
  assert.equal(gradeKorean('해가 뜨다', rise), 'wrong');
  assert.equal(gradeKorean('해달이뜨다', rise), 'correct');

  const like = { koMeanings: ['~와 같은', '좋아하다'], koAccepted: ['처럼'] };
  assert.equal(gradeKorean('와 같은', like), 'correct');
  assert.equal(gradeKorean('~처럼', like), 'correct');
});

test('한글 뜻: 아이가 "내 답도 맞아요"로 인정받은 답은 다음부터 정답', () => {
  const trip = { koMeanings: ['여행'], koAccepted: [] };
  assert.equal(gradeKorean('나들이', trip), 'wrong');
  assert.equal(gradeKorean('나들이', trip, ['나들이']), 'correct');
});

test('틀린 글자 표시', () => {
  const d = spellingDiff('lighthose', 'lighthouse');
  assert.equal(d.map((x) => x.ch).join(''), 'lighthouse');
  assert.deepEqual(d.filter((x) => x.status !== 'ok').map((x) => [x.ch, x.status]), [['u', 'missing']]);

  const d2 = spellingDiff('stepp', 'steep');
  assert.ok(d2.some((x) => x.status !== 'ok'));

  const d3 = spellingDiff('rock', 'rock');
  assert.ok(d3.every((x) => x.status === 'ok'));
});
