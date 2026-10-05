// 레슨 원본(유인물에서 옮긴 표) → 게임 단어 데이터
// 빈칸 예문 만들기, 정답 누출 가리기, ID 부여, 규칙 검사를 한 곳에서 한다.
import { phraseInflections as inflections } from '../app/js/grading.js';

export const slugOf = (word) => word.toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '');

// "L05:delicious" 처럼 다른 레슨 단어도 가리킬 수 있다
function refId(lessonId, ref) {
  const [l, w] = ref.includes(':') ? ref.split(':') : [lessonId, ref];
  return `${l}-${slugOf(w)}`;
}

function cloze(text, answer) {
  const i = text.indexOf(answer);
  if (i < 0 || text.indexOf(answer, i + 1) >= 0) throw new Error(`예문에 "${answer}"가 정확히 한 번 있어야 합니다: ${text}`);
  return text.slice(0, i) + '____' + text.slice(i + answer.length);
}

// 풀이 안에 정답 단어(또는 변형)가 있으면 ____ 로 가린다 (설계서 Step 4: 유인물 원문은 고치지 않고 가리기만)
export function maskLeak(def, word) {
  const forms = [...inflections(word)].sort((a, b) => b.length - a.length);
  let out = def;
  for (const f of forms) {
    const re = new RegExp(`\\b${f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    out = out.replace(re, '____');
  }
  return out;
}

/**
 * @param {object} src
 * @param {string} src.id      'L06'
 * @param {number} src.order   6
 * @param {string} src.title
 * @param {Array} src.rows     [번호, 단어, 품사, 영영풀이, 예문, 예문 속 정답 형태, 빈칸에 같이 들어갈 수 있는 단어들]
 * @param {object} src.korean  { 단어: [보여줄 뜻[], 함께 인정할 답[], 부모 확인 메모?] }
 * @param {string[][]} src.confusable  헷갈리는 단어 쌍(다른 레슨은 'L05:delicious')
 * @param {object} [src.paraphrases]   { 단어: 바꿔 쓴 풀이 }
 * @param {object} [src.notes]         { 번호: 판독 메모 } — 검토표에 표시
 */
export function buildLesson({ id, order, title, rows, korean, confusable = [], paraphrases = {}, notes = {} }) {
  const words = rows.map(([no, word, pos, def, ex, ans, clozeConf]) => {
    const wid = refId(id, word);
    const masked = maskLeak(def, word);
    const ko = korean[word];
    if (!ko) throw new Error(`${word}: 한글 뜻이 없습니다`);
    return {
      id: wid,
      lessonId: id,
      lessonOrder: order,
      word,
      sourceOrder: no,
      pos,
      definitions: [
        { text: masked, source: 'handout', ...(masked !== def ? { original: def } : {}) },
        ...(paraphrases[word] ? [{ text: paraphrases[word], source: 'paraphrase' }] : []),
      ],
      examples: [{ text: ex, clozeText: cloze(ex, ans), clozeAnswer: ans, clozeConfusable: clozeConf.map((w) => refId(id, w)) }],
      acceptedAnswers: [],
      koMeanings: ko[0],
      koAccepted: ko[1],
      ...(ko[2] ? { koNote: ko[2] } : {}),
      ...(notes[no] ? { readNote: notes[no] } : {}),
      confusableWith: confusable
        .filter((p) => p.includes(word))
        .flatMap((p) => p.filter((x) => x !== word).map((x) => refId(id, x))),
    };
  });
  validate(id, words);
  return { lessonId: id, title, order, words };
}

function validate(id, words) {
  const ids = new Set();
  for (const w of words) {
    if (ids.has(w.id)) throw new Error(`중복 단어: ${w.word}`);
    ids.add(w.id);
    if (!/^[A-Za-z][A-Za-z '\-]*$/.test(w.word)) throw new Error(`철자 형식 오류: ${w.word}`);
    if (maskLeak(w.definitions[0].text, w.word) !== w.definitions[0].text) throw new Error(`정답 누출: ${w.word}`);
    const blankOutside = w.examples[0].clozeText.replace('____', '');
    if (maskLeak(blankOutside, w.word) !== blankOutside) throw new Error(`빈칸 밖에 정답이 또 있음: ${w.word}`);
    if (!w.koMeanings.length) throw new Error(`한글 뜻 없음: ${w.word}`);
  }
  for (const w of words) {
    for (const c of w.examples[0].clozeConfusable) {
      if (c.startsWith(`${id}-`) && !ids.has(c)) throw new Error(`${w.word}: 빈칸 헷갈림 단어 ${c}가 레슨에 없음`);
    }
  }
}
