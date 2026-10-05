// 정답 판정
// - 대소문자·앞뒤 공백·연속 공백·둥근 따옴표 차이는 무시
// - 빈칸 철자 문제에서 기본형이나 다른 변형을 쓰면 'needsForm'(오답 대신 한 번 더 기회)

export function normalize(s) {
  return String(s ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‘’ʼ`´]/g, "'")
    .replace(/[‐-―]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

const VOWELS = 'aeiou';

// 규칙 변화형 후보 (판정용이므로 넓게 만든다)
export function inflections(base) {
  const b = normalize(base);
  const out = new Set([b, `${b}s`, `${b}es`, `${b}ed`, `${b}d`, `${b}ing`, `${b}er`]);
  if (b.endsWith('y')) {
    const stem = b.slice(0, -1);
    out.add(`${stem}ies`).add(`${stem}ied`);
  }
  if (b.endsWith('e')) {
    out.add(`${b.slice(0, -1)}ing`);
  }
  const last = b.at(-1);
  const prev = b.at(-2);
  if (last && prev && !VOWELS.includes(last) && VOWELS.includes(prev) && !'wxy'.includes(last)) {
    out.add(`${b}${last}ed`).add(`${b}${last}ing`);
  }
  return out;
}

// 구 단어(wake up, put up)는 첫 단어만 변한다
export function phraseInflections(base) {
  const words = normalize(base).split(' ');
  if (words.length === 1) return inflections(words[0]);
  const rest = words.slice(1).join(' ');
  return new Set([...inflections(words[0])].map((w) => `${w} ${rest}`));
}

/**
 * 철자 입력 판정
 * @param {string} input
 * @param {object} q
 * @param {string} q.answer       정답(빈칸 문제면 문장 속 형태)
 * @param {string} q.baseWord     기본형
 * @param {string[]} [q.accepted] 허용 답안
 * @param {'definition'|'cloze'} q.format
 * @returns {'correct'|'needsForm'|'wrong'|'empty'}
 */
export function gradeSpelling(input, { answer, baseWord, accepted = [], format }) {
  const given = normalize(input);
  if (!given) return 'empty';
  const targets = [answer, ...accepted].map(normalize);
  if (targets.includes(given)) return 'correct';
  if (format === 'cloze') {
    const forms = phraseInflections(baseWord);
    if (forms.has(given)) return 'needsForm';
  }
  return 'wrong';
}

// ---------- 한글 뜻 ----------

// 공백·문장부호·물결표를 없애고, 괄호 안 설명은 빼고 비교한다: "(해·달이) 뜨다" → "뜨다"
export function normalizeKo(s, { dropParens = true } = {}) {
  let t = String(s ?? '').normalize('NFC');
  if (dropParens) t = t.replace(/\([^)]*\)/g, '');
  return t.replace(/[\s~·.,!?'"’‘…\-()]/g, '');
}

function koTargets(word, extra = []) {
  const out = new Set();
  for (const m of [...(word.koMeanings ?? []), ...(word.koAccepted ?? []), ...extra]) {
    out.add(normalizeKo(m));
    out.add(normalizeKo(m, { dropParens: false })); // 괄호 내용까지 쓴 것도 인정
  }
  out.delete('');
  return out;
}

/**
 * 한글 뜻 판정. 쉼표나 / 로 여러 뜻을 쓰면 하나하나가 모두 맞아야 정답.
 * @param {string} input
 * @param {object} word  koMeanings, koAccepted 를 가진 단어
 * @param {string[]} [extra]  아이가 "내 답도 맞아요"로 인정받은 답(부모 메뉴에서 확인 가능)
 * @returns {'correct'|'wrong'|'empty'}
 */
export function gradeKorean(input, word, extra = []) {
  const parts = String(input ?? '').split(/[,/、，]/).map((p) => normalizeKo(p)).filter(Boolean);
  if (parts.length === 0) return 'empty';
  const targets = koTargets(word, extra);
  return parts.every((p) => targets.has(p)) ? 'correct' : 'wrong';
}

/**
 * 틀린 글자 표시용 비교 (편집 거리 정렬)
 * @returns {{ch: string, status: 'ok'|'wrong'|'missing'|'extra'}[]}
 *   ok: 맞은 글자, wrong: 다른 글자로 씀(정답 글자 표시), missing: 빠뜨린 글자, extra: 더 쓴 글자
 */
export function spellingDiff(input, answer) {
  const a = [...normalize(input)];
  const b = [...normalize(answer)];
  const n = a.length;
  const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 0; i <= n; i++) dp[i][0] = i;
  for (let j = 0; j <= m; j++) dp[0][j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  const out = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)) {
      out.push({ ch: b[j - 1], status: a[i - 1] === b[j - 1] ? 'ok' : 'wrong' });
      i--; j--;
    } else if (j > 0 && dp[i][j] === dp[i][j - 1] + 1) {
      out.push({ ch: b[j - 1], status: 'missing' });
      j--;
    } else {
      out.push({ ch: a[i - 1], status: 'extra' });
      i--;
    }
  }
  return out.reverse();
}
