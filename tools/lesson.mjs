// 레슨 추가 도구
//   node tools/lesson.mjs review L06   → 검토 초안(output/work/L06/draft.json)과 검토표(output/review/L06-review.md)
//   node tools/lesson.mjs approve L06  → 승인본(output/lessons/L06.json) 저장 + 게임 단어장(app/data/words.json) 다시 만들기
//   node tools/lesson.mjs merge        → 승인된 레슨으로 단어장만 다시 만들기
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildLesson } from './lesson-builder.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const p = (...xs) => join(ROOT, ...xs);
const json = (file) => JSON.parse(readFileSync(file, 'utf8'));
const write = (file, data) => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, typeof data === 'string' ? data : JSON.stringify(data, null, 2) + '\n');
};

async function load(id) {
  const mod = await import(pathToFileURL(p('tools', 'lessons', `${id}.mjs`)).href);
  return buildLesson(mod.default);
}

function reviewMarkdown(lesson) {
  const esc = (s) => String(s).replace(/\|/g, '\\|');
  const bold = (ex) => ex.clozeText.replace('____', `**${ex.clozeAnswer}**`);
  const flags = lesson.words.filter((w) => w.koNote || w.readNote || w.definitions[0].original);
  let md = `# Lesson ${lesson.order} "${lesson.title}" 검토표\n\n`;
  md += '> 확인 후 "승인" 또는 고칠 내용(예: "11번 뜻은 하와이의만")을 알려 주세요.\n';
  md += "> 영영풀이·예문은 인쇄된 글자를 옮긴 것, 한글 뜻은 유인물 '뜻' 칸의 손글씨를 옮긴 것입니다.\n\n";
  md += `## ⚠️ 먼저 확인할 것 (${flags.length}개)\n\n`;
  for (const w of flags) {
    const why = [
      w.definitions[0].original ? `풀이에 정답이 들어 있어 가림: "${w.definitions[0].original}" → "${w.definitions[0].text}"` : null,
      w.koNote,
      w.readNote,
    ].filter(Boolean);
    md += `- **${w.sourceOrder}. ${w.word}** — ${why.join(' / ')}\n`;
  }
  md += '\n## 전체 단어\n\n| # | 단어 | 영영풀이 | 예문 (빈칸 정답 굵게) | 한글 뜻 | 함께 인정 |\n|---|---|---|---|---|---|\n';
  for (const w of lesson.words) {
    md += `| ${w.sourceOrder} | **${esc(w.word)}** | ${esc(w.definitions[0].text)} | ${esc(bold(w.examples[0]))} | ${esc(w.koMeanings.join(', '))} | ${esc(w.koAccepted.join(', ') || '–')} |\n`;
  }
  const pairs = lesson.words.flatMap((w) => w.confusableWith.map((c) => [w.id, c].sort().join(' – ')));
  md += `\n## 객관식에서 서로 보기로 같이 나오지 않는 단어\n\n- ${[...new Set(pairs)].map((s) => s.replace(/L\d+-/g, '')).join(', ')}\n`;
  md += '- 예문 빈칸에 같이 들어갈 수 있는 단어도 예문별로 제외했습니다.\n';
  return md;
}

function merge() {
  const dir = p('output', 'lessons');
  const lessons = readdirSync(dir).filter((f) => /^L\d+\.json$/.test(f)).map((f) => json(join(dir, f))).sort((a, b) => a.order - b.order);
  const prev = existsSync(p('app', 'data', 'words.json')) ? json(p('app', 'data', 'words.json')) : { dataVersion: 0, words: [] };
  const words = lessons.flatMap((l) => l.words.map(({ lessonOrder, readNote, ...w }) => w));
  // 승인 목록에서 빠진 단어는 지우지 않고 보관 처리 (아이 기록 보존)
  const ids = new Set(words.map((w) => w.id));
  const archived = prev.words.filter((w) => !ids.has(w.id)).map((w) => ({ ...w, archived: true }));
  const data = {
    dataVersion: prev.dataVersion + 1,
    generatedAt: new Date().toISOString(),
    approved: true,
    lessons: lessons.map((l) => ({ id: l.lessonId, title: l.title, order: l.order })),
    words: [...words, ...archived],
  };
  if (new Set(data.words.map((w) => w.id)).size !== data.words.length) throw new Error('단어 ID 중복');
  write(p('app', 'data', 'words.json'), data);
  return data;
}

const [cmd, id] = process.argv.slice(2);
if (cmd === 'review') {
  const lesson = await load(id);
  write(p('output', 'work', id, 'draft.json'), lesson);
  write(p('output', 'review', `${id}-review.md`), reviewMarkdown(lesson));
  console.log(`${id}: ${lesson.words.length}단어, 검토표 output/review/${id}-review.md`);
} else if (cmd === 'approve') {
  const lesson = await load(id);
  write(p('output', 'lessons', `${id}.json`), { ...lesson, approvedAt: new Date().toISOString() });
  const data = merge();
  console.log(`${id} 승인 → 단어장 버전 ${data.dataVersion}, 레슨 ${data.lessons.length}개, 단어 ${data.words.length}개`);
} else if (cmd === 'merge') {
  const data = merge();
  console.log(`단어장 버전 ${data.dataVersion}, 단어 ${data.words.length}개`);
} else {
  console.log('사용법: node tools/lesson.mjs review|approve <L06> / merge');
  process.exit(1);
}
