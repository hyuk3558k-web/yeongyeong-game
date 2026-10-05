// 문제 화면: 5일 계획 학습(객관식 → 오답 반복 → 쓰기 / 5일차 랜덤)과 매일 복습을 함께 처리
import { h, mount, svg, toast, confirmDialog, sentenceWithBlank, sentenceWithMark } from '../ui.js';
import { mascotSvg } from '../mascot.js';
import { buildSession, buildSessionFromWords, wrongNoteWords, SessionRunner } from '../session.js';
import { applyResult, MAX_BOX } from '../scheduler.js';
import { gradeSpelling, gradeKorean, normalizeKo, spellingDiff } from '../grading.js';
import { timeLimitMs, createCountdown } from '../timer.js';
import { countNewIntroduced, newIntroducedToday, recordSessionComplete } from '../storage.js';
import { PlanSession, dayWords, lessonWordsSorted, completeDay, emptyPlan, isPlanDone, STAGE_LABEL } from '../plan.js';
import { play } from '../sound.js';
import { speak, canSpeak, preloadWord } from '../speech.js';

// 정답·오답 뒤에 읽어 줄 말: 빈칸 철자 문제는 문장 속 형태(woke up), 나머지는 기본형
function spokenText(q, word) {
  return q.format === 'cloze' && q.mode === 'spelling' ? q.answer : word.word;
}

function autoSpeak(app, text, delaySec) {
  if (app.state.settings.sound) speak(text, delaySec);
}

const GOOD_TITLES = ['정답! 🎉', '좋아요! ✨', '바로 그거예요!', '완벽해요! 👏'];
const MAX_WRONG_PRACTICE = 15;
const FORMAT_TAG = { definition: '📖 영영풀이', cloze: '✏️ 예문 빈칸', korean: '✍️ 한글 뜻' };

function speakButton(text, label = '발음 듣기') {
  if (!canSpeak()) return null;
  return h('button', { class: 'icon-btn speak-btn', 'aria-label': `${label}: ${text}`, onclick: (e) => { e.stopPropagation(); speak(text); } }, '🔊');
}

// 어떤 학습인지에 따라 진행기를 만든다. PlanSession과 SessionRunner는 같은 방식으로 쓴다.
function makeRunner(app, params) {
  const today = app.today();
  const st = app.state;
  const getProgress = () => app.state.words;

  if (params.kind === 'plan') {
    const plan = st.plans[params.lessonId] ?? emptyPlan();
    const lessonWords = lessonWordsSorted(app.words, params.lessonId);
    const targetWords = dayWords(params.day, lessonWords, { plan, progress: st.words, rng: app.rng });
    const runner = new PlanSession({ day: params.day, targetWords, words: app.words, getProgress, rng: app.rng, writeMode: st.settings.writeMode });
    return { runner, wordIds: targetWords.map((w) => w.id) };
  }

  let questions;
  if (params.kind === 'wrong' || params.wordIds) {
    const picked = params.wordIds
      ? params.wordIds.map((id) => app.byId.get(id)).filter(Boolean)
      : wrongNoteWords(app.words, st.words).slice(0, MAX_WRONG_PRACTICE);
    questions = buildSessionFromWords({ picked, words: app.words, progress: st.words, rng: app.rng, lastSessionFirstId: st.lastSessionFirstId });
  } else {
    questions = buildSession({
      words: app.words,
      progress: st.words,
      today,
      settings: { ...st.settings, activeLessons: params.lessonId ? [params.lessonId] : st.settings.activeLessons },
      rng: app.rng,
      newIntroducedToday: newIntroducedToday(st, today),
      lastSessionFirstId: st.lastSessionFirstId,
    });
  }
  const runner = new SessionRunner({ questions, words: app.words, getProgress, rng: app.rng });
  return { runner, wordIds: [...new Set(questions.map((q) => q.wordId))] };
}

export function startQuiz(app, params = {}) {
  const today = app.today();
  const isPlan = params.kind === 'plan';
  const { runner, wordIds } = makeRunner(app, params);
  if (runner.isDone() || wordIds.length === 0) {
    toast('지금은 풀 단어가 없어요');
    app.go('home', {}, { replace: true });
    return;
  }

  const before = new Map(wordIds.map((id) => [id, app.state.words[id]]));
  const newCount = wordIds.filter((id) => (before.get(id)?.box ?? 0) === 0).length;
  app.setState({ ...countNewIntroduced(app.state, today, newCount), lastSessionFirstId: runner.current().wordId });

  const startedAt = Date.now();
  const preset = app.state.settings.timer;

  let countdown = null;
  let raf = 0;
  let autoNext = 0;
  let active = false; // 답을 받을 수 있는 상태
  let awayDuringQuestion = false;
  let cover = null;

  // ---------- 정리 ----------
  function stopTimer() {
    cancelAnimationFrame(raf);
    raf = 0;
  }
  function removeSheets() {
    document.querySelectorAll('.sheet, .sheet-backdrop').forEach((el) => el.remove());
  }
  function onVisibility() {
    if (document.hidden) {
      if (!active) return;
      countdown?.pause();
      stopTimer();
      awayDuringQuestion = true;
      cover = h('div', { class: 'cover' }, h('div', {}, svg(mascotSvg('sleepy')), h('p', {}, '잠깐 쉬는 중…')));
      document.body.append(cover);
    } else if (awayDuringQuestion) {
      awayDuringQuestion = false;
      cover?.remove();
      cover = null;
      active = false;
      runner.defer();
      toast('잠깐 다녀왔네요! 그 문제는 뒤에서 다시 나와요');
      renderQuestion();
    }
  }
  document.addEventListener('visibilitychange', onVisibility);
  app.cleanup = () => {
    stopTimer();
    clearTimeout(autoNext);
    document.removeEventListener('visibilitychange', onVisibility);
    cover?.remove();
    removeSheets();
  };

  async function askQuit() {
    const wasActive = active;
    countdown?.pause();
    const quit = await confirmDialog({
      title: '그만할까요?',
      message: isPlan
        ? '지금까지 푼 기록은 저장돼요. 오늘 일차는 끝까지 해야 완료로 표시돼요.'
        : '지금까지 푼 기록은 저장돼요. 도장은 끝까지 풀어야 받을 수 있어요.',
      yes: '그만하기',
      no: '계속하기',
    });
    if (quit) {
      app.go('home', {}, { replace: true });
    } else if (wasActive) {
      countdown?.resume();
      tick();
    }
  }
  app.onBack = askQuit;

  // ---------- 타이머 ----------
  let timerFill;
  let timerNum;
  let timerBox;
  let lastShownSec = -1;
  function tick() {
    if (!countdown || !active) return;
    timerFill.style.transform = `scaleX(${countdown.fraction()})`;
    const hurry = countdown.showNumber();
    timerBox.classList.toggle('hurry', hurry);
    const sec = Math.ceil(countdown.remainingMs() / 1000);
    if (sec !== lastShownSec) {
      timerNum.textContent = String(sec);
      if (hurry && sec > 0) play('tick');
      lastShownSec = sec;
    }
    if (countdown.expired()) {
      onAnswer({ result: 'wrong', timeout: true });
      return;
    }
    raf = requestAnimationFrame(tick);
  }

  // ---------- 단계 사이 안내 카드 (계획 학습) ----------
  function renderInterlude(event) {
    const sum = runner.summary();
    let title;
    let body;
    let mood = 'cheer';
    if (event.type === 'round') {
      title = `아직 헷갈리는 단어 ${event.count}개`;
      body = '보기 순서를 바꿔서 한 번 더! 다 맞힐 때까지 해 봐요.';
      mood = 'normal';
    } else if (event.type === 'retry') {
      title = `틀린 문제 ${event.count}개, 한 번 더`;
      body = '방금 본 정답을 떠올리며 다시 써 봐요.';
      mood = 'normal';
    } else {
      const fin = sum.byStage[event.finished];
      title = `${STAGE_LABEL[event.finished]} 끝!`;
      const parts = [];
      if (fin) parts.push(`${fin.asked}문제 중 ${fin.correct}개 정답.`);
      if (event.skipped.includes('repeat')) parts.push('객관식을 다 맞혀서 오답 반복은 건너뛰어요.');
      if (event.next === 'repeat') parts.push('틀린 단어만 모아서 다시 풀어요.');
      if (event.next === 'write') {
        parts.push(`이제 직접 써 볼 차례예요. 오늘 단어 중 ${runner.writeWords?.length ?? ''}개를 골랐어요(틀린 단어 먼저). 영영풀이를 보고 철자를, 영어 단어를 보고 한글 뜻을 써요.`);
      }
      body = parts.join(' ');
    }
    mount(app.root, h('section', { class: 'screen interlude' },
      h('div', { class: 'card tape', style: { textAlign: 'center', marginTop: '40px' } },
        h('div', { style: { width: '120px', margin: '0 auto' } }, svg(mascotSvg(mood))),
        h('h2', { class: 'section-title' }, title),
        h('p', { class: 'muted' }, body),
        event.next ? h('div', { class: 'steps', style: { justifyContent: 'center' } },
          runner.stages.map((s, i) => h('span', { class: `step${s === runner.stage ? ' on' : ''}` }, h('b', {}, String(i + 1)), STAGE_LABEL[s]))) : null,
      ),
      h('button', { class: 'btn', style: { marginTop: 'auto' }, onclick: () => renderQuestion(true) }, '계속하기 →'),
    ));
  }

  // ---------- 문제 그리기 ----------
  let q;
  let state;
  function renderQuestion(skipEvent = false) {
    clearTimeout(autoNext);
    removeSheets();
    if (!skipEvent && isPlan) {
      const event = runner.takeEvent();
      if (event && !runner.isDone()) {
        renderInterlude(event);
        return;
      }
    }
    q = runner.current();
    if (!q) {
      finish();
      return;
    }
    state = { hints: 0, secondChance: false, input: '' };

    let done;
    let total;
    let stageLine = null;
    if (isPlan) {
      const info = runner.info();
      done = info.index;
      total = info.length;
      stageLine = h('div', { class: 'stage-line' },
        h('b', {}, `${info.day}일차`),
        ` · ${info.stageNo}/${info.stageCount} ${info.label}`,
        info.round > 1 ? ` (${info.round}번째)` : '');
    } else {
      done = runner.index;
      total = runner.queue.length;
    }

    timerFill = h('div', { class: 'timer-fill' });
    timerNum = h('span', { class: 'timer-num', 'aria-hidden': 'true' });
    timerBox = h('div', { class: 'timer', role: 'timer', 'aria-label': '남은 시간' }, h('div', { class: 'timer-track' }, timerFill), timerNum);

    let card;
    let answerArea;
    if (q.format === 'korean') {
      card = h('div', { class: 'card tape q-card ko-card' },
        h('div', { class: 'q-ask' }, '이 단어의 한글 뜻은?'),
        h('div', { class: 'ko-word' }, h('span', { class: 'en' }, q.prompt), speakButton(q.prompt)),
      );
      answerArea = renderWriting('korean');
    } else {
      const isCloze = q.format === 'cloze';
      card = h('div', { class: `card tape ${isCloze ? 'mint-tape' : 'sky-tape'} q-card` },
        h('div', { class: 'q-ask' }, isCloze ? 'Fill in the blank!' : 'Which word means…'),
        h('p', { class: `q-text en${q.prompt.length > 90 ? ' long' : ''}` }, isCloze ? sentenceWithBlank(q.prompt) : q.prompt),
      );
      answerArea = q.mode === 'choice' ? renderChoices() : renderWriting('spelling');
    }

    mount(app.root, h('section', { class: 'screen' },
      h('div', { class: 'quiz-top' },
        h('button', { class: 'icon-btn', 'aria-label': '그만하기', onclick: askQuit }, '✕'),
        h('div', { class: 'progress-track', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(total), 'aria-valuenow': String(done) },
          h('div', { class: 'progress-fill', style: { width: `${Math.max(4, (done / total) * 100)}%` } })),
        h('span', { class: 'progress-text' }, `${done + 1}/${total}`),
      ),
      stageLine,
      timerBox,
      h('span', { class: `format-tag ${q.format}` },
        FORMAT_TAG[q.format],
        q.format === 'korean' ? ' · 쓰기' : q.mode === 'spelling' ? ' · 철자 쓰기' : ' · 고르기',
        q.retry ? ' · 다시 도전' : ''),
      card,
      answerArea,
    ));

    // 정답·오답 때 바로 읽을 수 있게 발음 파일을 미리 불러 둔다
    preloadWord(spokenText(q, app.byId.get(q.wordId)));

    countdown = createCountdown(timeLimitMs(q.mode, q.format, preset));
    lastShownSec = -1;
    active = true;
    raf = requestAnimationFrame(tick);
    if (q.mode === 'spelling') setTimeout(() => app.root.querySelector('.spell-input')?.focus(), 60);
  }

  function renderChoices() {
    const box = h('div', { class: 'choices' });
    q.options.forEach((id, i) => {
      const w = app.byId.get(id);
      box.append(h('button', {
        class: 'choice en',
        onclick: (e) => {
          if (!active) return;
          box.classList.add('locked');
          const right = i === q.correctIndex;
          e.currentTarget.classList.add(right ? 'right' : 'wrong');
          if (!right) box.children[q.correctIndex].classList.add('right');
          [...box.children].forEach((b, j) => { if (j !== i && j !== q.correctIndex) b.classList.add('dim'); });
          onAnswer({ result: right ? 'correct' : 'wrong' });
        },
      }, w.word));
    });
    return box;
  }

  // kind: 'spelling'(영어 철자) | 'korean'(한글 뜻)
  function renderWriting(kind) {
    const isKo = kind === 'korean';
    const word = app.byId.get(q.wordId);
    const answer = q.answer;
    let slots = null;
    let drawSlots = () => {};
    if (!isKo) {
      slots = h('div', { class: 'slots', 'aria-hidden': 'true' });
      drawSlots = (typed) => {
        slots.replaceChildren(...[...answer].map((ch, i) => {
          if (ch === ' ') return h('span', { class: 'slot gap' });
          const t = typed[i] && typed[i] !== ' ' ? typed[i] : '';
          return h('span', { class: `slot${t ? ' on' : ''}` }, t);
        }), ...(typed.length > answer.length ? [h('span', { class: 'slot extra' }, '+')] : []));
      };
      drawSlots('');
    }

    const input = h('input', {
      class: `spell-input${isKo ? ' ko' : ' en'}`, type: 'text', inputmode: 'text', enterkeyhint: 'done',
      autocomplete: 'off', autocorrect: 'off', autocapitalize: 'none', spellcheck: 'false', lang: isKo ? 'ko' : 'en',
      placeholder: isKo ? '한글로 뜻을 써 보세요' : '',
      'aria-label': isKo ? '한글 뜻을 입력하세요' : `철자를 입력하세요 (${answer.replace(/ /g, '').length}글자)`,
      oninput: (e) => { state.input = e.target.value; drawSlots(e.target.value.toLowerCase()); },
      onkeydown: (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); submit(); } },
    });

    const extra = h('div', {});
    const hintBtn = h('button', { class: 'btn white small', onclick: () => giveHint() }, '💡 힌트');
    const okBtn = h('button', { class: 'btn small mint', onclick: () => submit() }, '확인');

    function giveHint() {
      if (!active) return;
      state.hints++;
      if (isKo) {
        if (state.hints === 1) {
          extra.replaceChildren(h('div', { class: 'hint-box' }, '영영풀이: ', h('span', { class: 'en' }, q.definition)));
        } else {
          const first = normalizeKo(word.koMeanings[0])[0] ?? '';
          extra.replaceChildren(h('div', { class: 'hint-box' }, '첫 글자는 ', h('b', {}, `"${first}"`), ' 이에요'));
          hintBtn.disabled = true;
        }
      } else if (q.format === 'cloze' && state.hints === 1) {
        extra.replaceChildren(h('div', { class: 'hint-box' }, '뜻: ', h('span', { class: 'en' }, q.definition)));
      } else {
        extra.replaceChildren(h('div', { class: 'hint-box' }, '첫 글자는 ', h('b', { class: 'en' }, `"${answer[0]}"`), ' 이에요'));
        hintBtn.disabled = true;
      }
      input.focus();
    }

    function submit() {
      if (!active) return;
      const verdict = isKo
        ? gradeKorean(state.input, word, app.state.koClaims[q.wordId] ?? [])
        : gradeSpelling(state.input, q);
      if (verdict === 'empty') {
        toast(isKo ? '뜻을 입력해 주세요' : '철자를 입력해 주세요');
        input.focus();
        return;
      }
      if (verdict === 'needsForm' && !state.secondChance) {
        state.secondChance = true;
        extra.replaceChildren(h('div', { class: 'form-hint', role: 'alert' }, '🦉 ', h('span', {}, '거의 다 왔어요! 문장에 맞게 ', h('b', {}, '형태를 바꿔'), ' 볼까요?')));
        input.select();
        return;
      }
      if (verdict === 'correct') {
        onAnswer({ result: state.hints > 0 || state.secondChance ? 'assisted' : 'correct', typed: state.input });
      } else {
        onAnswer({ result: 'wrong', typed: state.input });
      }
    }

    return h('div', { class: 'spell' }, slots, input, extra, h('div', { class: 'spell-actions' }, hintBtn, okBtn));
  }

  // ---------- 채점 후 ----------
  function record(answered, result) {
    const word = app.byId.get(answered.wordId);
    const hasCloze = (word.examples ?? []).some((e) => e.clozeText);
    const next = applyResult(app.state.words[answered.wordId], { result, mode: answered.mode, format: answered.format, today, hasCloze });
    app.setState({ ...app.state, words: { ...app.state.words, [answered.wordId]: next } });
    runner.submit(result);
  }

  function onAnswer({ result, timeout = false, typed = '' }) {
    if (!active) return;
    active = false;
    stopTimer();
    const answered = q;
    if (result === 'wrong' && answered.format === 'korean' && typed.trim()) {
      // 한글 뜻은 비슷한 말이 많아서, 아이가 "내 답도 맞아요"를 고를 수 있게 기록을 잠시 미룬다
      showBad(answered, { timeout, typed, canClaim: true });
      return;
    }
    record(answered, result);
    if (result === 'wrong') showBad(answered, { timeout, typed });
    else showGood(answered, result === 'assisted');
  }

  function sheet(kind, ...children) {
    const backdrop = h('div', { class: 'sheet-backdrop' });
    const el = h('div', { class: `sheet ${kind}`, role: 'dialog', 'aria-modal': 'true' }, ...children);
    document.body.append(backdrop, el);
    return { el, backdrop };
  }

  function showGood(answered, assisted) {
    play('correct');
    const title = assisted ? '맞혔어요! 내일 한 번 더 확인해요' : GOOD_TITLES[Math.floor(Math.random() * GOOD_TITLES.length)];
    const word = app.byId.get(answered.wordId);
    const shown = answered.format === 'korean' ? word.koMeanings.join(', ') : answered.answer;
    const { el, backdrop } = sheet('good',
      h('div', { class: 'sheet-head' }, svg(mascotSvg('happy')), h('div', { class: 'sheet-title' }, title)),
      h('div', { class: 'answer-row' },
        h('div', {},
          h('span', { class: `answer-word ${answered.format === 'korean' ? 'ko' : 'en'}` }, shown),
          answered.format === 'korean' ? h('div', { class: 'answer-base en' }, word.word) : null),
        speakButton(spokenText(answered, word))),
    );
    const go = () => renderQuestion();
    backdrop.addEventListener('click', go);
    el.addEventListener('click', go);
    autoSpeak(app, spokenText(answered, word), 0.3);
    // 단어를 다 듣고 넘어가도록 조금 더 머문다
    autoNext = setTimeout(go, assisted ? 2400 : 2000);
  }

  function showBad(answered, { timeout, typed, canClaim = false }) {
    play('wrong');
    const word = app.byId.get(answered.wordId);
    const isKo = answered.format === 'korean';
    const ex = answered.example;
    const exampleNode = ex?.clozeText
      ? h('p', { class: 'en', style: { margin: 0 } }, sentenceWithMark(ex.clozeText, ex.clozeAnswer))
      : ex ? h('p', { class: 'en', style: { margin: 0 } }, ex.text) : null;

    let compare = null;
    if (typed.trim()) {
      if (isKo) {
        compare = h('div', { class: 'learn-box' }, h('span', { class: 'label' }, '내가 쓴 답'), h('div', { class: 'diff' }, h('span', { class: 'extra' }, typed.trim())));
      } else if (answered.mode === 'spelling') {
        const diff = spellingDiff(typed, answered.answer);
        const close = diff.filter((d) => d.status !== 'ok').length <= Math.max(2, Math.floor(answered.answer.length / 2));
        compare = h('div', { class: 'learn-box' },
          close
            ? [h('span', { class: 'label' }, '틀린 글자를 확인해요'),
               h('div', { class: 'diff' }, diff.map((d) => h('span', { class: d.status }, d.ch === ' ' ? ' ' : d.ch)))]
            : [h('span', { class: 'label' }, '내가 쓴 답'), h('div', { class: 'diff' }, h('span', { class: 'extra' }, typed.trim()))]);
      }
    }

    const finishWith = (result) => {
      if (canClaim) record(answered, result);
      renderQuestion();
    };
    const okBtn = h('button', { class: 'btn', onclick: () => finishWith('wrong') }, '알겠어요!');
    const claimBtn = canClaim
      ? h('button', {
          class: 'btn white small',
          onclick: () => {
            const claims = app.state.koClaims[answered.wordId] ?? [];
            app.setState({ ...app.state, koClaims: { ...app.state.koClaims, [answered.wordId]: [...new Set([...claims, typed.trim()])] } });
            toast('같은 뜻으로 인정했어요. 부모님 메뉴에서 확인할 수 있어요');
            finishWith('assisted');
          },
        }, '내 답도 같은 뜻이에요')
      : null;

    sheet('bad',
      h('div', { class: 'sheet-head' }, svg(mascotSvg('oops')),
        h('div', { class: 'sheet-title' }, timeout ? '앗, 시간이 다 됐어요!' : '아쉬워요! 정답은…')),
      h('div', { class: 'answer-row' },
        h('div', {},
          isKo
            ? [h('div', { class: 'answer-word ko' }, word.koMeanings.join(', ')), h('div', { class: 'answer-base en' }, word.word)]
            : [h('div', { class: 'answer-word en' }, answered.answer),
               answered.answer.toLowerCase() !== word.word.toLowerCase() ? h('div', { class: 'answer-base' }, `기본형: ${word.word}`) : null]),
        speakButton(spokenText(answered, word))),
      compare,
      h('div', { class: 'learn-box' },
        isKo ? null : [h('span', { class: 'label' }, '한글 뜻'), h('p', { style: { margin: 0, fontWeight: 700 } }, (word.koMeanings ?? []).join(', '))],
        exampleNode ? [h('span', { class: 'label' }, '예문'), exampleNode] : null,
        h('span', { class: 'label' }, '영영풀이'),
        h('p', { class: 'en', style: { margin: 0 } }, answered.definition),
      ),
      okBtn,
      claimBtn,
    );
    autoSpeak(app, spokenText(answered, word), 0.45);
    setTimeout(() => okBtn.focus(), 50);
  }

  // ---------- 끝 ----------
  function finish() {
    const summary = runner.summary();
    const seconds = Math.round((Date.now() - startedAt) / 1000);
    let next = recordSessionComplete(app.state, today, { asked: summary.asked, correct: summary.correctFirstTry, seconds });
    let planInfo = null;
    if (isPlan) {
      const plan = next.plans[params.lessonId] ?? emptyPlan();
      const updated = params.replay ? plan : completeDay(plan, params.day, today, summary.wrongWordIds);
      next = { ...next, plans: { ...next.plans, [params.lessonId]: updated } };
      planInfo = { lessonId: params.lessonId, day: params.day, replay: !!params.replay, done: !params.replay && isPlanDone(updated) };
    }
    app.setState(next);
    const newlyMastered = [...before.entries()]
      .filter(([id, p]) => (p?.box ?? 0) < MAX_BOX && app.state.words[id]?.box === MAX_BOX)
      .map(([id]) => id);
    const correctSet = new Set(summary.correctWordIds ?? []);
    const improved = [...before.entries()].filter(([id, p]) => p?.lastWrong && p.lastWrong < today && correctSet.has(id)).length;
    app.go('result', { summary, seconds, newlyMastered, improved, kind: params.kind, plan: planInfo }, { replace: true });
  }

  renderQuestion();
}
