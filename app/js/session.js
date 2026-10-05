// 세션 구성과 랜덤 출제 규칙 (설계서 §3 R2~R8)
import { chance, pick, randomInt, shuffle } from './random.js';
import { isDue, isNew, missingSpelledFormats, modeFor, MAX_BOX } from './scheduler.js';
import { normalize } from './grading.js';

export const DEFAULT_SETTINGS = {
  sessionSize: 15,
  newPerDay: 10,
  activeLessons: [], // 비어 있으면 모든 레슨
};

export const CLOZE_RATIO = { choice: 0.4, spelling: 0.5 };
export const MAX_FORMAT_RUN = 4;
export const MAX_RETRIES_PER_WORD = 2;
// 한 세션 최대 문항 수(재출제·재도전 포함). 넘치는 오답은 다음 날 세션에서 다시 나온다.
export const MAX_SESSION_QUESTIONS = 25;
export const RETRY_OFFSET = { min: 3, max: 6 };
const MAX_REMASTER_PER_SESSION = 2;
const MAX_ORDER_ATTEMPTS = 100;
const OPTION_COUNT = 4;

let qidSeq = 0;
const nextQid = () => `q${++qidSeq}`;

export function clozeExamples(word) {
  return (word.examples ?? []).filter((e) => e.clozeText && e.clozeAnswer);
}

// ---------- 문항 만들기 ----------

export const KOREAN_RATIO = 1 / 3; // 철자 단계 복습에서 한글 뜻 쓰기 비율

// 이 단어·단계에서 낼 수 있는 형식들 (한글 뜻은 쓰기 단계에서만)
export function availableFormats(word, mode) {
  const f = ['definition'];
  if (clozeExamples(word).length > 0) f.push('cloze');
  if (mode === 'spelling' && (word.koMeanings ?? []).length > 0) f.push('korean');
  return f;
}

// 형식이 규칙으로 정해지지 않고 무작위로 고를 수 있는 단어인가
function formatIsFlexible(word, progress, mode) {
  const box = progress?.box ?? 0;
  if (availableFormats(word, mode).length < 2 || box === 0) return false;
  return !(box === 4 && missingSpelledFormats(progress, clozeExamples(word).length > 0).length > 0);
}

function chooseFormat(word, progress, mode, rng, excludeFormat) {
  const avail = availableFormats(word, mode);
  if (excludeFormat) {
    const others = avail.filter((f) => f !== excludeFormat);
    return others.length ? pick(others, rng) : avail[0];
  }
  const box = progress?.box ?? 0;
  if (box === 0 || avail.length === 1) return 'definition'; // 처음 만나는 단어는 항상 영영풀이
  if (box === 4) {
    const missing = missingSpelledFormats(progress, avail.includes('cloze'));
    if (missing.length > 0) return pick(missing, rng);
  }
  if (mode === 'spelling' && avail.includes('korean') && chance(rng, KOREAN_RATIO)) return 'korean';
  if (!avail.includes('cloze')) return 'definition';
  return chance(rng, CLOZE_RATIO[mode]) ? 'cloze' : 'definition';
}

function chooseDefinition(word, progress, rng, avoidText) {
  const box = progress?.box ?? 0;
  const base = word.definitions.filter((d) => d.source !== 'paraphrase');
  const para = word.definitions.filter((d) => d.source === 'paraphrase');
  let pool = base;
  if (box >= 4 && para.length > 0 && chance(rng, 0.5)) pool = para;
  if (avoidText) {
    const others = word.definitions.filter((d) => d.text !== avoidText && (box >= 4 || d.source !== 'paraphrase'));
    if (others.length > 0) pool = others;
  }
  return pick(pool.length ? pool : word.definitions, rng);
}

function excludedIds(word, example, words) {
  const ex = new Set([word.id, ...(word.confusableWith ?? []), ...(example?.clozeConfusable ?? [])]);
  const self = new Set([normalize(word.word), ...(word.acceptedAnswers ?? []).map(normalize)]);
  for (const w of words) {
    if ((w.confusableWith ?? []).includes(word.id)) ex.add(w.id);
    if (self.has(normalize(w.word))) ex.add(w.id);
  }
  return ex;
}

// 오답 보기 (R7): 같은 레슨·같은 품사 우선, 헷갈림 쌍 제외
export function pickDistractors(word, words, rng, example = null, n = OPTION_COUNT - 1) {
  const ex = excludedIds(word, example, words);
  const pool = words.filter((w) => !w.archived && !ex.has(w.id));
  const samePos = (w) => word.pos && w.pos === word.pos;
  const tiers = [
    pool.filter((w) => w.lessonId === word.lessonId && samePos(w)),
    pool.filter((w) => w.lessonId === word.lessonId && !samePos(w)),
    pool.filter((w) => w.lessonId !== word.lessonId && samePos(w)),
    pool.filter((w) => w.lessonId !== word.lessonId && !samePos(w)),
  ];
  const out = [];
  for (const tier of tiers) {
    for (const w of shuffle(tier, rng)) {
      if (out.length >= n) return out;
      out.push(w);
    }
  }
  return out;
}

/**
 * 한 단어로 문항 하나를 만든다. 보기 위치(correctIndex)는 출제 직전에 정한다(R3).
 */
export function makeQuestion(word, progress, { words, rng, mode, excludeFormat, forceFormat, avoidPrompt, retry = false }) {
  const m = mode ?? modeFor(progress);
  const format = forceFormat ?? chooseFormat(word, progress, m, rng, excludeFormat);
  const def = chooseDefinition(word, progress, rng, format === 'definition' ? avoidPrompt : undefined);
  let example = null;
  if (format === 'cloze') {
    const pool = clozeExamples(word);
    const others = pool.filter((e) => e.clozeText !== avoidPrompt);
    example = pick(others.length ? others : pool, rng);
  }
  if (format === 'korean') return makeKoreanQuestion(word, { retry });
  const q = {
    qid: nextQid(),
    wordId: word.id,
    lessonId: word.lessonId,
    sourceOrder: word.sourceOrder,
    mode: m,
    format,
    prompt: format === 'cloze' ? example.clozeText : def.text,
    definition: def.text,
    definitionSource: def.source,
    example: example ?? (word.examples ?? [])[0] ?? null,
    baseWord: word.word,
    // 객관식은 기본형을 고르면 정답, 빈칸 철자는 문장 속 형태를 써야 정답
    answer: format === 'cloze' && m === 'spelling' ? example.clozeAnswer : word.word,
    accepted: format === 'cloze' && m === 'spelling' ? [] : (word.acceptedAnswers ?? []),
    retry,
  };
  if (m === 'choice') {
    q.distractorIds = pickDistractors(word, words, rng, example).map((w) => w.id);
  }
  return q;
}

// 한글 뜻 쓰기: 영어 단어를 보고 한글 뜻을 쓴다
export function makeKoreanQuestion(word, { retry = false } = {}) {
  const def = word.definitions.find((d) => d.source !== 'paraphrase') ?? word.definitions[0];
  return {
    qid: nextQid(),
    wordId: word.id,
    lessonId: word.lessonId,
    sourceOrder: word.sourceOrder,
    mode: 'spelling',
    format: 'korean',
    prompt: word.word,
    definition: def.text,
    definitionSource: def.source,
    example: (word.examples ?? [])[0] ?? null,
    baseWord: word.word,
    answer: (word.koMeanings ?? []).join(', '),
    accepted: [],
    retry,
  };
}

// 객관식 정답 위치를 정한다 (R3: 같은 위치가 세 번 연속 정답이 되지 않게). history는 지금까지의 정답 위치.
export function assignOptions(q, history, rng) {
  if (q.mode !== 'choice' || q.options) return q;
  const banned = history.length >= 2 && history.at(-1) === history.at(-2) ? history.at(-1) : -1;
  const allowed = [0, 1, 2, 3].filter((p) => p !== banned);
  const pos = allowed[randomInt(rng, allowed.length)];
  const others = shuffle(q.distractorIds, rng);
  const options = [];
  for (let i = 0, j = 0; i < OPTION_COUNT; i++) options.push(i === pos ? q.wordId : others[j++]);
  q.options = options.filter(Boolean);
  q.correctIndex = q.options.indexOf(q.wordId);
  history.push(q.correctIndex);
  return q;
}

// ---------- 오늘의 세션 고르기 ----------

export function selectWords({ words, progress, today, settings = {}, rng, newIntroducedToday = 0 }) {
  const s = { ...DEFAULT_SETTINGS, ...settings };
  const active = words.filter(
    (w) => !w.archived && (s.activeLessons.length === 0 || s.activeLessons.includes(w.lessonId)),
  );
  const prog = (w) => progress[w.id];
  const chosen = [];
  const take = (list, limit = Infinity) => {
    let n = 0;
    for (const w of list) {
      if (chosen.length >= s.sessionSize || n >= limit) break;
      if (chosen.includes(w)) continue;
      chosen.push(w);
      n++;
    }
  };

  // 1) 최근 틀린 단어 2) 복습일이 된 단어 3) 마스터 확인 4) 새 단어 5) 복습일 앞당기기
  take(shuffle(active.filter((w) => isDue(prog(w), today) && prog(w).box === 1), rng));
  take(shuffle(active.filter((w) => isDue(prog(w), today) && prog(w).box > 1 && prog(w).box < MAX_BOX), rng));
  take(shuffle(active.filter((w) => isDue(prog(w), today) && prog(w).box === MAX_BOX), rng), MAX_REMASTER_PER_SESSION);

  const lessonRank = new Map();
  for (const w of active) lessonRank.set(w.lessonId, Math.max(lessonRank.get(w.lessonId) ?? -Infinity, w.lessonOrder ?? 0));
  const fresh = active.filter((w) => isNew(prog(w)));
  const freshLessons = [...new Set(fresh.map((w) => w.lessonId))].sort((a, b) => (lessonRank.get(b) ?? 0) - (lessonRank.get(a) ?? 0) || (a < b ? 1 : -1));
  const freshOrdered = freshLessons.flatMap((id) => shuffle(fresh.filter((w) => w.lessonId === id), rng));
  take(freshOrdered, Math.max(0, s.newPerDay - newIntroducedToday));

  const notDue = shuffle(active.filter((w) => !isNew(prog(w)) && !isDue(prog(w), today)), rng);
  notDue.sort((a, b) => (prog(a).due < prog(b).due ? -1 : prog(a).due > prog(b).due ? 1 : 0));
  take(notDue);
  return chosen;
}

// ---------- 출제 순서 (R2, R5, R6 형식 연속 제한) ----------

function formatCounts(seq) {
  const counts = new Map();
  for (const q of seq) counts.set(q.format, (counts.get(q.format) ?? 0) + 1);
  return counts;
}

// 가장 많은 형식도 "4개마다 다른 형식 하나"로 끊을 수 있는가
function formatRunFeasible(seq) {
  const max = Math.max(0, ...formatCounts(seq).values());
  return max <= MAX_FORMAT_RUN * (seq.length - max + 1);
}

export function orderViolations(seq, { lastSessionFirstId, checkFormatRun = formatRunFeasible(seq) } = {}) {
  let v = 0;
  for (let i = 0; i + 2 < seq.length; i++) {
    const [a, b, c] = [seq[i], seq[i + 1], seq[i + 2]];
    if (a.lessonId === b.lessonId && b.lessonId === c.lessonId && b.sourceOrder === a.sourceOrder + 1 && c.sourceOrder === b.sourceOrder + 1) v++;
  }
  for (let i = 0; i + 1 < seq.length; i++) if (seq[i].wordId === seq[i + 1].wordId) v++;
  if (seq.length > 1 && lastSessionFirstId && seq[0].wordId === lastSessionFirstId) v++;
  if (checkFormatRun) {
    let run = 1;
    for (let i = 1; i < seq.length; i++) {
      run = seq[i].format === seq[i - 1].format ? run + 1 : 1;
      if (run > MAX_FORMAT_RUN) v++;
    }
  }
  return v;
}

export function orderQuestions(questions, rng, { lastSessionFirstId } = {}) {
  let best = null;
  let bestV = Infinity;
  for (let k = 0; k < MAX_ORDER_ATTEMPTS; k++) {
    const seq = shuffle(questions, rng);
    const v = orderViolations(seq, { lastSessionFirstId });
    if (v === 0) return seq;
    if (v < bestV) [best, bestV] = [seq, v];
  }
  return best;
}

export function buildSession({ words, progress, today, settings, rng, newIntroducedToday = 0, lastSessionFirstId = null }) {
  const picked = selectWords({ words, progress, today, settings, rng, newIntroducedToday });
  const questions = picked.map((w) => makeQuestion(w, progress[w.id], { words, rng }));
  balanceFormats(questions, picked, progress, words, rng);
  return orderQuestions(questions, rng, { lastSessionFirstId });
}

// 정해진 단어들로 세션 만들기 (오답 노트 "오답만 다시 풀기")
export function buildSessionFromWords({ picked, words, progress, rng, lastSessionFirstId = null }) {
  const questions = picked.map((w) => makeQuestion(w, progress[w.id], { words, rng }));
  balanceFormats(questions, picked, progress, words, rng);
  return orderQuestions(questions, rng, { lastSessionFirstId });
}

// 오답 노트에 올릴 단어: 틀린 적 있고 아직 마스터 전인 단어, 많이 틀린 순
export function wrongNoteWords(words, progress) {
  return words
    .filter((w) => !w.archived && (progress[w.id]?.wrong ?? 0) > 0 && progress[w.id].box < MAX_BOX)
    .sort((a, b) => progress[b.id].wrong - progress[a.id].wrong || (progress[b.id].lastWrong ?? '').localeCompare(progress[a.id].lastWrong ?? ''));
}

// 한 형식이 너무 많아 "같은 형식 5연속 금지"를 지킬 수 없으면,
// 형식을 자유롭게 고를 수 있는 문항 몇 개를 적은 쪽 형식으로 바꾼다.
function balanceFormats(questions, picked, progress, words, rng) {
  for (let guard = 0; guard < questions.length * 3; guard++) {
    if (formatRunFeasible(questions)) return;
    const counts = formatCounts(questions);
    const major = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const flexible = questions
      .map((q, i) => i)
      .filter((i) => questions[i].format === major && formatIsFlexible(picked[i], progress[picked[i].id], questions[i].mode));
    if (flexible.length === 0) return;
    const i = pick(flexible, rng);
    const others = availableFormats(picked[i], questions[i].mode).filter((f) => f !== major);
    const minor = others.sort((a, b) => (counts.get(a) ?? 0) - (counts.get(b) ?? 0))[0];
    questions[i] = makeQuestion(picked[i], progress[picked[i].id], { words, rng, mode: questions[i].mode, forceFormat: minor });
  }
}

// ---------- 세션 진행 (R3 보기 위치, R4 재출제, R5 연속 금지, R8 형식 바꾸기) ----------

export class SessionRunner {
  /**
   * @param {object} o
   * @param {object[]} o.questions  buildSession 결과
   * @param {object[]} o.words      전체 단어(보기·재출제용)
   * @param {() => object} o.getProgress  현재 진행 상태 맵을 돌려주는 함수
   * @param {object} o.rng
   */
  constructor({ questions, words, getProgress, rng, maxQuestions = MAX_SESSION_QUESTIONS }) {
    this.maxQuestions = Math.max(maxQuestions, questions.length);
    this.queue = questions.slice();
    this.index = 0;
    this.words = words;
    this.byId = new Map(words.map((w) => [w.id, w]));
    this.getProgress = getProgress;
    this.rng = rng;
    this.retries = new Map();
    this.lastResult = new Map();
    this.firstResult = new Map();
    this.correctPosHistory = [];
    this.finalRoundAdded = false;
    this.log = [];
  }

  isDone() {
    return this.index >= this.queue.length;
  }

  // 현재 문항. 객관식이면 이때 정답 위치를 정한다(실제 출제 순서 기준으로 R3 보장).
  current() {
    if (this.isDone()) return null;
    return assignOptions(this.queue[this.index], this.correctPosHistory, this.rng);
  }

  /**
   * 현재 문항 결과를 기록하고 다음으로 넘어간다.
   * @param {'correct'|'assisted'|'wrong'} result
   */
  submit(result) {
    const q = this.current();
    if (!q) throw new Error('세션이 이미 끝났습니다');
    this.log.push({ qid: q.qid, wordId: q.wordId, mode: q.mode, format: q.format, result, retry: q.retry });
    if (!this.firstResult.has(q.wordId)) this.firstResult.set(q.wordId, result);
    this.lastResult.set(q.wordId, result);
    if (result === 'wrong') this.#scheduleRetry(q);
    this.#advance();
  }

  // 앱이 백그라운드로 가서 문제를 가린 경우: 오답 처리 없이 맨 뒤로 미룬다
  defer() {
    const q = this.queue[this.index];
    if (!q) return;
    this.queue.splice(this.index, 1);
    delete q.options;
    if (q.mode === 'choice') this.correctPosHistory.pop();
    this.queue.push(q);
    this.#fixTailAdjacency();
  }

  #retryQuestion(q) {
    const word = this.byId.get(q.wordId);
    return makeQuestion(word, this.getProgress()[q.wordId], {
      words: this.words,
      rng: this.rng,
      mode: q.mode,
      excludeFormat: q.format, // R8: 다른 형식으로 (예문이 없으면 영영풀이 유지)
      avoidPrompt: q.prompt,
      retry: true,
    });
  }

  #scheduleRetry(q) {
    const used = this.retries.get(q.wordId) ?? 0;
    if (used >= MAX_RETRIES_PER_WORD || this.queue.length >= this.maxQuestions) return;
    this.retries.set(q.wordId, used + 1);
    const rq = this.#retryQuestion(q);
    const offsets = shuffle(range(RETRY_OFFSET.min, RETRY_OFFSET.max), this.rng);
    for (const off of offsets) {
      const pos = this.index + off;
      if (pos > this.queue.length) continue;
      const before = this.queue[pos - 1];
      const after = this.queue[pos];
      if (before?.wordId === rq.wordId || after?.wordId === rq.wordId) continue;
      this.queue.splice(pos, 0, rq);
      return;
    }
    // 남은 문항이 부족하면 맨 끝. 지금이 마지막 문항이면 바로 다시 내지 않고 재도전 라운드로 넘긴다(R5).
    const remaining = this.queue.length - this.index - 1;
    if (remaining >= 1 && this.queue.at(-1).wordId !== rq.wordId) this.queue.push(rq);
  }

  #advance() {
    this.index++;
    if (this.isDone() && !this.finalRoundAdded) {
      this.finalRoundAdded = true;
      // 재도전 라운드: 마지막 결과가 오답인 단어만 한 번 더
      const last = this.log.at(-1);
      const pending = [...this.lastResult.entries()].filter(([, r]) => r === 'wrong').map(([id]) => id);
      if (pending.length === 0) return;
      const lastQ = new Map();
      for (const q of this.queue) lastQ.set(q.wordId, q);
      let round = shuffle(pending.map((id) => this.#retryQuestion(lastQ.get(id))), this.rng);
      if (round.length > 1 && round[0].wordId === last?.wordId) round = [...round.slice(1), round[0]];
      const room = this.maxQuestions - this.queue.length;
      if (room <= 0) return;
      round = round.slice(0, room);
      if (round[0].wordId === last?.wordId) {
        // 끼워 넣을 자리가 모자라면 재도전 대신 다음 날로 넘긴다
        if (room < 2) return;
        round = [...this.#fillers(pending).slice(0, room - 1), ...round].slice(0, room);
      }
      this.queue.push(...round);
    }
  }

  // 방금 틀린 단어가 곧바로 다시 나오지 않도록, 이번 세션에서 맞힌 단어로 복습 문항 1~2개를 끼워 넣는다
  #fillers(excludeIds) {
    const done = [...this.firstResult.entries()]
      .filter(([id, r]) => r === 'correct' && !excludeIds.includes(id))
      .map(([id]) => id);
    const lastQ = new Map();
    for (const q of this.queue) lastQ.set(q.wordId, q);
    return shuffle(done, this.rng)
      .slice(0, 2)
      .map((id) => ({ ...this.#retryQuestion(lastQ.get(id)), retry: false, filler: true }));
  }

  // 맨 끝에 붙인 문항이 바로 앞 문항과 같은 단어면 자리를 바꾼다 (R5)
  #fixTailAdjacency() {
    const n = this.queue.length;
    if (n < 2 || this.queue[n - 1].wordId !== this.queue[n - 2].wordId) return;
    for (let i = n - 3; i >= this.index + 1; i--) {
      const cand = this.queue[i];
      const prev = this.queue[i - 1];
      const next = this.queue[i + 1];
      const tail = this.queue[n - 1];
      if (cand.wordId !== tail.wordId && prev?.wordId !== tail.wordId && next?.wordId !== tail.wordId && this.queue[n - 2].wordId !== cand.wordId) {
        [this.queue[i], this.queue[n - 1]] = [tail, cand];
        return;
      }
    }
  }

  summary() {
    const firstTry = [...this.firstResult.values()];
    return {
      asked: this.log.length,
      words: this.firstResult.size,
      correctFirstTry: firstTry.filter((r) => r === 'correct').length,
      correctWordIds: [...this.firstResult.entries()].filter(([, r]) => r === 'correct').map(([id]) => id),
      wrongWordIds: [...this.firstResult.entries()].filter(([, r]) => r === 'wrong').map(([id]) => id),
    };
  }
}

function range(a, b) {
  const out = [];
  for (let i = a; i <= b; i++) out.push(i);
  return out;
}
