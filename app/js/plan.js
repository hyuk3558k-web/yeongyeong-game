// 레슨별 5일 학습 계획 (부모 요청 2026-10-05)
// 1일차: 앞쪽 절반(1~13번)  객관식 → 오답 반복 → 철자·한글 뜻 쓰기(그날 단어의 절반, 틀린 단어 우선, 랜덤)
// 2일차: 뒤쪽 절반(14~27번) 같은 순서
// 3일차: 전체 단어          같은 순서
// 4일차: 3일차 오답 + 오답 노트 단어 위주, 같은 순서
// 5일차: 전체 단어          예문 빈칸 + 여러 문제 유형을 랜덤으로
// 5일차가 끝나면 그 레슨은 매일 복습(간격 반복)으로 넘어간다.
import { shuffle, pick } from './random.js';
import { makeQuestion, makeKoreanQuestion, orderQuestions, assignOptions, clozeExamples } from './session.js';
import { MAX_BOX } from './scheduler.js';

export const PLAN_DAYS = 5;
export const MAX_REPEAT_ROUNDS = 3;
export const MIN_DAY4_WORDS = 8;
// 쓰기 단계는 그날 단어의 절반만 (부모 요청 2026-10-05). 앞 단계에서 틀린 단어를 먼저 고른다.
export const WRITE_FRACTION = 0.5;

export function writeWordCount(n) {
  return Math.ceil(n * WRITE_FRACTION);
}

export const STAGE_LABEL = {
  choice: '객관식',
  repeat: '오답 반복',
  write: '철자·한글 뜻 쓰기',
  mixed: '예문 빈칸 + 랜덤 문제',
};

export function stagesForDay(day) {
  return day === PLAN_DAYS ? ['mixed'] : ['choice', 'repeat', 'write'];
}

export function lessonWordsSorted(words, lessonId) {
  return words.filter((w) => w.lessonId === lessonId && !w.archived).sort((a, b) => a.sourceOrder - b.sourceOrder);
}

// ---------- 계획 진행 상태 (storage에 저장) ----------

export function emptyPlan() {
  return { completedDays: [], dayDates: {}, day3Wrong: [], lastDayDate: null };
}

export function nextDay(plan) {
  const done = plan?.completedDays?.length ?? 0;
  return done >= PLAN_DAYS ? null : done + 1;
}

export function isPlanDone(plan) {
  return nextDay(plan) === null;
}

// 하루에 최대 두 일차까지 (부모 요청 2026-10-05: 수행평가 전에 따라잡을 수 있게)
export const MAX_DAYS_PER_DATE = 2;

// 오늘 끝낸 일차 수 (모든 레슨 합계)
export function daysDoneOn(plans, today) {
  return Object.values(plans ?? {}).reduce((n, p) => n + Object.values(p?.dayDates ?? {}).filter((d) => d === today).length, 0);
}

export function canStartNewDay(plan, today, doneToday = plan?.lastDayDate === today ? 1 : 0) {
  return !isPlanDone(plan) && doneToday < MAX_DAYS_PER_DATE;
}

export function completeDay(plan, day, today, wrongIds) {
  const p = structuredClone(plan ?? emptyPlan());
  if (!p.completedDays.includes(day)) p.completedDays.push(day);
  p.completedDays.sort((a, b) => a - b);
  p.dayDates[day] = today;
  p.lastDayDate = today;
  if (day === 3) p.day3Wrong = [...wrongIds];
  return p;
}

// 지금 진행할 레슨: 순서가 빠른 레슨 중 계획이 안 끝난 것
export function currentPlanLesson(lessons, plans, activeLessons = []) {
  return [...lessons]
    .filter((l) => activeLessons.length === 0 || activeLessons.includes(l.id))
    .sort((a, b) => a.order - b.order)
    .find((l) => !isPlanDone(plans[l.id])) ?? null;
}

// ---------- 일차별 단어 ----------

export function dayWords(day, lessonWords, { plan, progress, rng }) {
  const half = Math.floor(lessonWords.length / 2);
  if (day === 1) return lessonWords.slice(0, half);
  if (day === 2) return lessonWords.slice(half);
  if (day === 4) {
    const focusIds = new Set(plan?.day3Wrong ?? []);
    for (const w of lessonWords) {
      const p = progress[w.id];
      if (p && p.wrong > 0 && p.box < MAX_BOX) focusIds.add(w.id);
    }
    const focus = lessonWords.filter((w) => focusIds.has(w.id));
    if (focus.length >= MIN_DAY4_WORDS) return focus;
    // 오답이 적으면 덜 외운 단어로 채운다
    const rest = shuffle(lessonWords.filter((w) => !focusIds.has(w.id)), rng)
      .sort((a, b) => (progress[a.id]?.box ?? 0) - (progress[b.id]?.box ?? 0));
    return [...focus, ...rest.slice(0, MIN_DAY4_WORDS - focus.length)].sort((a, b) => a.sourceOrder - b.sourceOrder);
  }
  return lessonWords;
}

export function describeDay(day, lessonWords, ctx) {
  const ws = dayWords(day, lessonWords, ctx);
  const range = day === 1 || day === 2 ? `${ws[0]?.sourceOrder}~${ws.at(-1)?.sourceOrder}번` : day === 4 ? '틀린 단어 위주' : '전체 단어';
  const stages = stagesForDay(day).map((s) => (s === 'write' ? `${STAGE_LABEL[s]} (${writeWordCount(ws.length)}단어)` : STAGE_LABEL[s]));
  return { day, count: ws.length, range, stages };
}

// ---------- 하루 학습 진행 ----------

export class PlanSession {
  /**
   * @param {object} o
   * @param {number} o.day
   * @param {object[]} o.targetWords  오늘 할 단어
   * @param {object[]} o.words        전체 단어(오답 보기용)
   * @param {() => object} o.getProgress
   * @param {object} o.rng
   * @param {'both'|'one'} [o.writeMode]  쓰기 단계: 단어마다 철자·한글 뜻 모두 / 하나만 랜덤
   */
  constructor({ day, targetWords, words, getProgress, rng, writeMode = 'both' }) {
    this.day = day;
    this.targetWords = targetWords;
    this.words = words;
    this.byId = new Map(words.map((w) => [w.id, w]));
    this.getProgress = getProgress;
    this.rng = rng;
    this.writeMode = writeMode;
    this.stages = stagesForDay(day);
    this.stageIdx = -1;
    this.queue = [];
    this.index = 0;
    this.round = 0;
    this.posHistory = [];
    this.log = [];
    this.firstResult = new Map();
    this.dayWrong = new Set();
    this.stageResults = [];
    this.retried = new Set();
    this.pendingRetry = [];
    this.retryAppended = false;
    this.event = null;
    this.#enterNextStage();
    this.event = null; // 첫 단계 시작은 알릴 필요 없음
  }

  get stage() {
    return this.stages[this.stageIdx];
  }

  isDone() {
    return this.stageIdx >= this.stages.length;
  }

  current() {
    if (this.isDone()) return null;
    return assignOptions(this.queue[this.index], this.posHistory, this.rng);
  }

  info() {
    return {
      day: this.day,
      stage: this.stage,
      stageNo: this.stageIdx + 1,
      stageCount: this.stages.length,
      label: STAGE_LABEL[this.stage],
      round: this.round,
      index: this.index,
      length: this.queue.length,
    };
  }

  // 단계가 바뀌었으면 한 번만 알려준다 (화면에서 중간 안내 카드)
  takeEvent() {
    const e = this.event;
    this.event = null;
    return e;
  }

  submit(result) {
    const q = this.current();
    if (!q) throw new Error('오늘 학습이 이미 끝났습니다');
    this.log.push({ wordId: q.wordId, mode: q.mode, format: q.format, stage: this.stage, round: this.round, result });
    if (!this.firstResult.has(q.wordId)) this.firstResult.set(q.wordId, result);
    this.stageResults.push({ wordId: q.wordId, result });
    if (result === 'wrong') {
      this.dayWrong.add(q.wordId);
      if ((this.stage === 'write' || this.stage === 'mixed') && !this.retried.has(q.qid)) {
        this.retried.add(q.qid);
        this.pendingRetry.push(q);
      }
    }
    this.index++;
    if (this.index >= this.queue.length) this.#onQueueEnd();
  }

  // 앱을 나갔다 온 문항은 이 단계 맨 뒤로
  defer() {
    const q = this.queue[this.index];
    if (!q) return;
    this.queue.splice(this.index, 1);
    if (q.options) {
      delete q.options;
      this.posHistory.pop();
    }
    this.queue.push(q);
    const n = this.queue.length;
    if (n >= 2 && this.queue[n - 1].wordId === this.queue[n - 2].wordId && n - 3 >= this.index) {
      [this.queue[n - 2], this.queue[n - 3]] = [this.queue[n - 3], this.queue[n - 2]];
    }
  }

  summary() {
    const byStage = {};
    for (const s of this.stages) byStage[s] = { asked: 0, correct: 0 };
    for (const l of this.log) {
      byStage[l.stage].asked++;
      if (l.result !== 'wrong') byStage[l.stage].correct++;
    }
    const first = [...this.firstResult.entries()];
    return {
      asked: this.log.length,
      words: this.firstResult.size,
      correctFirstTry: first.filter(([, r]) => r === 'correct').length,
      correctWordIds: first.filter(([, r]) => r === 'correct').map(([id]) => id),
      wrongWordIds: [...this.dayWrong],
      byStage,
    };
  }

  // ---------- 내부 ----------

  #lastWordId() {
    return this.log.at(-1)?.wordId ?? null;
  }

  #order(questions) {
    return orderQuestions(questions, this.rng, { lastSessionFirstId: this.#lastWordId() });
  }

  #q(word, mode, format) {
    if (format === 'korean') return makeKoreanQuestion(word);
    return makeQuestion(word, this.getProgress()[word.id], { words: this.words, rng: this.rng, mode, forceFormat: format });
  }

  #choiceRound(words) {
    return this.#order(words.map((w) => this.#q(w, 'choice', 'definition')));
  }

  // 쓰기할 단어: 그날 단어의 절반. 객관식·오답 반복에서 틀린 단어 먼저, 나머지는 무작위
  #writeWords() {
    const n = writeWordCount(this.targetWords.length);
    const wrongIds = new Set(this.log.filter((l) => l.result === 'wrong').map((l) => l.wordId));
    const wrong = shuffle(this.targetWords.filter((w) => wrongIds.has(w.id)), this.rng);
    const rest = shuffle(this.targetWords.filter((w) => !wrongIds.has(w.id)), this.rng);
    return [...wrong, ...rest].slice(0, n);
  }

  #writeQuestions() {
    const out = [];
    this.writeWords = this.#writeWords();
    for (const w of this.writeWords) {
      const tasks = [['spelling', 'definition']];
      if ((w.koMeanings ?? []).length) tasks.push(['spelling', 'korean']);
      const chosen = this.writeMode === 'one' ? [pick(tasks, this.rng)] : tasks;
      for (const [m, f] of chosen) out.push(this.#q(w, m, f));
    }
    return this.#order(out);
  }

  #mixedQuestions() {
    const out = [];
    for (const w of this.targetWords) {
      const box = this.getProgress()[w.id]?.box ?? 0;
      const others = [['choice', 'definition'], ['spelling', 'definition']];
      if ((w.koMeanings ?? []).length) others.push(['spelling', 'korean']);
      if (clozeExamples(w).length) {
        out.push(this.#q(w, box <= 1 ? 'choice' : 'spelling', 'cloze'));
        if (this.writeMode === 'both') out.push(this.#q(w, ...pick(others, this.rng)));
      } else {
        out.push(this.#q(w, ...pick(others, this.rng)));
      }
    }
    return this.#order(out);
  }

  #buildStage(stage) {
    this.round = 0;
    this.pendingRetry = [];
    this.retryAppended = false;
    this.stageResults = [];
    if (stage === 'choice') return this.#choiceRound(this.targetWords);
    if (stage === 'repeat') {
      const wrong = this.#wrongIn(this.log.filter((l) => l.stage === 'choice'));
      if (wrong.length === 0) return [];
      this.round = 1;
      return this.#choiceRound(wrong);
    }
    if (stage === 'write') return this.#writeQuestions();
    return this.#mixedQuestions();
  }

  #wrongIn(entries) {
    const ids = [...new Set(entries.filter((l) => l.result === 'wrong').map((l) => l.wordId))];
    return ids.map((id) => this.byId.get(id)).filter(Boolean);
  }

  #enterNextStage() {
    const finished = this.stage ?? null;
    const skipped = [];
    for (;;) {
      this.stageIdx++;
      if (this.isDone()) break;
      this.queue = this.#buildStage(this.stage);
      this.index = 0;
      if (this.queue.length > 0) break;
      skipped.push(this.stage);
    }
    this.event = { type: 'stage', finished, next: this.isDone() ? null : this.stage, skipped };
  }

  #onQueueEnd() {
    // 쓰기·랜덤 단계: 틀린 문항을 단계 끝에서 한 번 더
    if ((this.stage === 'write' || this.stage === 'mixed') && !this.retryAppended && this.pendingRetry.length) {
      this.retryAppended = true;
      const retry = this.pendingRetry.map((q) => ({ ...this.#q(this.byId.get(q.wordId), q.mode, q.format), retry: true }));
      this.queue.push(...this.#order(retry));
      this.event = { type: 'retry', count: retry.length };
      return;
    }
    // 오답 반복: 이번 라운드에서도 틀린 단어가 있으면 다음 라운드 (최대 3라운드)
    if (this.stage === 'repeat') {
      const stillWrong = this.#wrongIn(this.stageResults);
      if (stillWrong.length && this.round < MAX_REPEAT_ROUNDS) {
        this.round++;
        this.stageResults = [];
        this.queue = this.#choiceRound(stillWrong);
        this.index = 0;
        this.event = { type: 'round', round: this.round, count: stillWrong.length };
        return;
      }
    }
    this.#enterNextStage();
  }
}
