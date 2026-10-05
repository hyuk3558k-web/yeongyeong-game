// 결과: 점수·도장·새로 외운 단어·틀린 단어 + 칭찬과 힘이 나는 한마디
import { h, mount, svg, confetti } from '../ui.js';
import { mascotSvg } from '../mascot.js';
import { play } from '../sound.js';
import { speak, canSpeak } from '../speech.js';
import { displayStreak } from '../storage.js';
import { randomFloat } from '../random.js';
import { praiseFor, pickQuote, QUOTES } from '../praise.js';
import { STAGE_LABEL, PLAN_DAYS, describeDay, lessonWordsSorted, nextDay, emptyPlan, canStartNewDay, daysDoneOn } from '../plan.js';

function wordChip(word) {
  return h('span', { class: 'word-chip' }, word,
    canSpeak() ? h('button', { 'aria-label': `${word} 발음 듣기`, onclick: () => speak(word) }, '🔊') : null);
}

export function showResult(app, { summary, seconds, newlyMastered = [], improved = 0, plan = null }) {
  const { words: total, correctFirstTry, wrongWordIds } = summary;
  const ratio = total ? correctFirstTry / total : 0;
  const stampText = plan?.done ? ['레슨', '완주!'] : ratio === 1 ? ['완벽', '해요'] : ratio >= 0.8 ? ['참', '잘했어요'] : ratio >= 0.5 ? ['잘', '했어요'] : ['오늘도', '해냈어요'];
  const mood = ratio >= 0.8 || plan?.done ? 'cheer' : 'happy';
  const today = app.today();
  const streak = displayStreak(app.state, today);
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  const rand = () => randomFloat(app.rng);

  const praise = praiseFor({ streak, ratio, improved, asked: summary.asked, planDay: plan && !plan.replay ? plan.day : null, planDone: plan?.done }, rand);
  const qi = pickQuote(rand, app.state.lastQuote);
  app.setState({ ...app.state, lastQuote: qi });
  const quote = QUOTES[qi];

  let heading = null;
  let tomorrow = null;
  if (plan) {
    const lesson = app.data.lessons.find((l) => l.id === plan.lessonId);
    heading = h('div', { class: 'badge-label', style: { marginBottom: '6px' } },
      `Lesson ${lesson?.order} · ${plan.day}일차 ${plan.replay ? '다시 하기 ' : ''}완료!`);
    const p = app.state.plans[plan.lessonId] ?? emptyPlan();
    const nd = nextDay(p);
    if (nd && !plan.replay) {
      const d = describeDay(nd, lessonWordsSorted(app.words, plan.lessonId), { plan: p, progress: app.state.words, rng: app.rng });
      const more = canStartNewDay(p, today, daysDoneOn(app.state.plans, today));
      tomorrow = h('p', { class: 'muted', style: { margin: '10px 0 0', fontSize: '15px' } },
        more ? `다음은 ${nd}일차 · ${d.range} (${d.count}단어) — 원하면 오늘 이어서 할 수 있어요` : `내일은 ${nd}일차 · ${d.range} (${d.count}단어)`);
    } else if (plan.done) {
      tomorrow = h('p', { class: 'muted', style: { margin: '10px 0 0', fontSize: '15px' } }, `${PLAN_DAYS}일 계획 끝! 이제 매일 복습으로 오래 기억해요.`);
    }
  }

  const stageRows = plan
    ? Object.entries(summary.byStage ?? {}).filter(([, s]) => s.asked > 0).map(([k, s]) =>
        h('div', { class: 'bar-item' }, h('span', {}, STAGE_LABEL[k]),
          h('span', { class: 'meter' }, h('i', { style: { width: `${(s.correct / s.asked) * 100}%` } })),
          h('b', { class: 'en' }, `${s.correct}/${s.asked}`)))
    : [];

  mount(app.root, h('section', { class: 'screen' },
    h('div', { class: 'card tape result-hero' },
      heading,
      h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' } },
        h('div', { style: { width: '96px' } }, svg(mascotSvg(mood))),
        h('div', { class: 'stamp' }, stampText[0], h('br'), stampText[1]),
      ),
      h('div', { class: 'badge-label', style: { marginTop: '10px' } }, '한 번에 맞힌 단어'),
      h('div', { class: 'score' }, String(correctFirstTry), h('small', {}, ` / ${total}`)),
      h('div', { class: 'stat-row', style: { justifyContent: 'center', marginTop: '12px' } },
        h('span', { class: 'chip sun' }, `🔥 ${streak}일 연속`),
        h('span', { class: 'chip sky' }, `⏱ ${min ? `${min}분 ` : ''}${sec}초`),
      ),
      tomorrow,
    ),

    stageRows.length
      ? h('div', { class: 'card' }, h('h2', { class: 'section-title', style: { marginTop: 0 } }, '단계별 결과'), h('div', { class: 'bar-list' }, stageRows))
      : null,

    h('div', { class: 'card praise' },
      h('div', { class: 'praise-head' },
        h('div', { style: { width: '56px', flex: 'none' } }, svg(mascotSvg('cheer'))),
        h('div', {}, praise.map((line) => h('p', {}, line)))),
      h('figure', { class: 'quote' },
        h('blockquote', {}, h('p', { class: 'en' }, quote.en), h('p', { class: 'quote-ko' }, quote.ko)),
        h('figcaption', {}, `— ${quote.by}`)),
    ),

    newlyMastered.length
      ? h('div', { class: 'card' },
          h('h2', { class: 'section-title', style: { marginTop: 0 } }, '⭐ 완전히 외운 단어'),
          h('div', { class: 'word-chips' }, newlyMastered.map((id) => wordChip(app.byId.get(id)?.word ?? id))))
      : null,

    wrongWordIds.length
      ? h('div', { class: 'card' },
          h('h2', { class: 'section-title', style: { marginTop: 0 } }, '📝 다시 만날 단어'),
          h('p', { class: 'muted', style: { margin: '4px 0 12px', fontSize: '15px' } }, '틀린 단어는 다음 학습과 복습에 꼭 다시 나와요.'),
          h('div', { class: 'word-chips' }, wrongWordIds.map((id) => wordChip(app.byId.get(id)?.word ?? id))))
      : null,

    h('div', { class: 'btn-col', style: { marginTop: 'auto' } },
      wrongWordIds.length
        ? h('button', { class: 'btn sky', onclick: () => app.go('quiz', { wordIds: wrongWordIds }, { replace: true }) }, '틀린 단어 한 번 더')
        : null,
      h('button', { class: 'btn', onclick: () => app.go('home', {}, { replace: true }) }, '홈으로'),
    ),
  ));

  setTimeout(() => play('stamp'), 300);
  if (ratio === 1 || newlyMastered.length || plan?.done) setTimeout(() => confetti(), 450);
}
