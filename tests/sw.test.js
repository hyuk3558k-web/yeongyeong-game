import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = fileURLToPath(new URL('../app/', import.meta.url));

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

test('오프라인용 파일 목록(sw.js)에 앱의 모든 js·css·아이콘이 들어 있다', () => {
  const sw = readFileSync(join(APP, 'sw.js'), 'utf8');
  const listed = new Set([...sw.matchAll(/'([^']+\.(?:js|css|png|webmanifest|html))'/g)].map((m) => m[1]));
  const files = walk(APP)
    .map((p) => relative(APP, p).replace(/\\/g, '/'))
    .filter((p) => /\.(js|css|png|webmanifest)$/.test(p) && p !== 'sw.js');
  const missing = files.filter((f) => !listed.has(f));
  assert.deepEqual(missing, [], `sw.js APP_FILES에 빠진 파일: ${missing.join(', ')}`);
  for (const f of listed) assert.ok(files.includes(f) || f === 'index.html', `sw.js에 있는데 실제로 없는 파일: ${f}`);
});
