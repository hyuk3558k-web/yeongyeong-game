import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { audioUrl } from '../app/js/speech.js';

const APP = fileURLToPath(new URL('../app/', import.meta.url));

test('단어장의 모든 단어와 빈칸 정답 형태에 발음 파일이 있다', () => {
  const data = JSON.parse(readFileSync(join(APP, 'data/words.json'), 'utf8'));
  const missing = [];
  for (const w of data.words) {
    for (const t of [w.word, ...(w.examples ?? []).map((e) => e.clozeAnswer).filter(Boolean)]) {
      if (!existsSync(join(APP, audioUrl(t)))) missing.push(t);
    }
  }
  assert.deepEqual(missing, [], `발음 파일 없음: ${missing.join(', ')} → tools/make_audio.ps1로 만드세요`);
});

test('발음 파일 이름 규칙', () => {
  assert.equal(audioUrl('wake up'), 'audio/wake-up.wav');
  assert.equal(audioUrl('September'), 'audio/september.wav');
  assert.equal(audioUrl('a lot of'), 'audio/a-lot-of.wav');
});
