// 홈: 인사·연속 출석·오늘 만날 단어·메뉴
import { h, mount, svg, toast } from '../ui.js';
import { mascotSvg } from '../mascot.js';
import { selectWords, wrongNoteWords } from '../session.js';
import { createRng } from '../random.js';
import { isDue, MAX_BOX } from '../scheduler.js';
import { displayStreak, newIntroducedToday } from '../storage.js';
import { openParentGate } from './parent.js';
import {
  currentPlanLesson, nextDay, canStartNewDay, describeDay, lessonWordsSorted, emptyPlan, PLAN_DAYS,
} from '../plan.js';

// 5일 계획 진행 표시 (완료 ✓ / 오늘 / 남음)
function dayTracker(plan, todayDay) {
  const done = new Set(plan?.completedDays ?? []);
  return h('ol', { class: 'tracker', 'aria-label': '5일 계획 진행' },
    Array.from({ length: PLAN_DAYS }, (_, i) => {
      const d = i + 1;
      const cls = done.has(d) ? 'done' : d === todayDay ? 'now' : '';
      return h('li', { class: cls, 'aria-label': `${d}일차${done.has(d) ? ' 완료' : d === todayDay ? ' 오늘' : ''}` },
        h('span', { class: 'dot' }, done.has(d) ? '✓' : String(d)), h('span', { class: 'cap' }, `${d}일차`));
    }));
}

function planCard(app, lesson, today) {
  const plan = app.state.plans[lesson.id] ?? emptyPlan();
  const lessonWords = lessonWordsSorted(app.words, lesson.id);
  const day = nextDay(plan);
  const can = canStartNewDay(plan, today);
  const lastDone = plan.completedDays.at(-1);
  const ctx = { plan, progress: app.state.words, rng: createRng(today) };

  if (!can) {
    const d = describeDay(day, lessonWords, ctx);
    return h('div', { class: 'card tape today-card' },
      h('div', { class: 'badge-label' }, `Lesson ${lesson.order} · ${lesson.title}`),
      dayTracker(plan, null),
      h('div', { class: 'stamp small done-stamp-mini' }, `${lastDone}일차`, h('br'), '완료'),
      h('p', { class: 'today-sub' }, '오늘 학습 끝! 내일은 ', h('b', {}, `${day}일차 · ${d.range}`), ' 예요.'),
      h('div', { class: 'btn-col' },
        h('button', { class: 'btn sky', onclick: () => app.go('quiz', { kind: 'daily' }) }, '복습 한 판 더'),
        h('button', { class: 'btn white small', onclick: () => app.go('quiz', { kind: 'plan', lessonId: lesson.id, day: lastDone, replay: true }) }, `${lastDone}일차 다시 하기`),
      ),
    );
  }

  const d = describeDay(day, lessonWords, ctx);
  return h('div', { class: 'card tape today-card' },
    h('div', { class: 'badge-label' }, `Lesson ${lesson.order} · ${lesson.title}`),
    dayTracker(plan, day),
    h('div', { class: 'today-count' }, `${day}`, h('small', {}, '일차')),
    h('p', { class: 'today-sub' }, `${d.range} · ${d.count}단어`),
    h('div', { class: 'steps' }, d.stages.map((s, i) => h('span', { class: 'step' }, h('b', {}, String(i + 1)), s))),
    h('button', { class: 'btn', onclick: () => app.go('quiz', { kind: 'plan', lessonId: lesson.id, day }) },
      `${day}일차 시작`, h('span', { 'aria-hidden': 'true' }, '→')),
  );
}

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}
function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}

export function showHome(app) {
  const today = app.today();
  const st = app.state;
  const progress = st.words;
  const streak = displayStreak(st, today);
  const doneToday = st.stamps.includes(today);
  const mastered = app.words.filter((w) => progress[w.id]?.box === MAX_BOX).length;

  // 오늘 세션에 들어갈 단어 수 (실제 출제 순서와는 무관한 개수 계산)
  const picked = selectWords({
    words: app.words, progress, today, settings: st.settings,
    rng: createRng(today), newIntroducedToday: newIntroducedToday(st, today),
  });
  const again = picked.filter((w) => isDue(progress[w.id], today) && progress[w.id].box === 1).length;
  const fresh = picked.filter((w) => !progress[w.id] || progress[w.id].box === 0).length;
  const review = picked.length - again - fresh;
  const wrongCount = wrongNoteWords(app.words, progress).length;
  const planLesson = currentPlanLesson(app.data.lessons, st.plans, st.settings.activeLessons);

  let greeting;
  let mood = 'normal';
  if (planLesson && canStartNewDay(st.plans[planLesson.id] ?? emptyPlan(), today)) {
    const day = nextDay(st.plans[planLesson.id] ?? emptyPlan());
    greeting = day === 1
      ? `Lesson ${planLesson.order} 시작! 5일 동안 단어를 하나도 빠짐없이 외워 봐요.`
      : day === 5 ? '마지막 5일차! 예문 빈칸까지 채우면 완주예요.' : `오늘은 ${day}일차예요. 어제보다 한 걸음 더!`;
    mood = day === 1 ? 'cheer' : 'normal';
  } else if (Object.keys(progress).length === 0) {
    greeting = '안녕하세요! 저는 영영이예요. 영어 풀이를 보고 단어를 맞혀 봐요.';
    mood = 'cheer';
  } else if (doneToday) {
    greeting = '오늘 도장 획득! 한 판 더 하면 더 오래 기억나요.';
    mood = 'happy';
  } else if (again > 0) {
    greeting = `어제 헷갈렸던 단어 ${again}개가 기다리고 있어요.`;
  } else if (streak >= 2) {
    greeting = `${streak}일 연속이에요! 오늘도 이어가 볼까요?`;
    mood = 'happy';
  } else {
    greeting = '오늘의 단어를 만나러 가 볼까요?';
  }

  const subParts = [];
  if (again) subParts.push(`다시 만날 단어 ${again}개`);
  if (review) subParts.push(`복습 ${review}개`);
  if (fresh) subParts.push(`새 단어 ${fresh}개`);

  // 부모 메뉴: 2초 길게 누르기
  let pressTimer = null;
  const gear = h('button', {
    class: 'icon-btn', 'aria-label': '설정 (부모님은 2초 길게 누르세요)',
    onpointerdown: () => { pressTimer = setTimeout(() => { pressTimer = null; openParentGate(app); }, 2000); },
    onpointerup: () => { if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; toast('부모님 메뉴는 2초 동안 길게 눌러요'); } },
    onpointerleave: () => { clearTimeout(pressTimer); pressTimer = null; },
    oncontextmenu: (e) => e.preventDefault(),
  }, '⚙️');

  mount(app.root, h('section', { class: 'screen' },
    h('header', { class: 'topbar' },
      h('div', { class: 'logo' }, h('span', { class: 'logo-mark', 'aria-hidden': 'true' }, 'E·E'), '영영게임'),
      gear,
    ),

    app.data?.approved === false
      ? h('div', { class: 'notice' }, '🧪 미리보기용 단어장이에요 (부모님 검토 전)')
      : null,

    h('div', { class: 'hero' },
      svg(mascotSvg(mood)),
      h('p', { class: 'bubble' }, greeting),
    ),

    h('div', { class: 'stat-row' },
      h('span', { class: 'chip sun' }, '🔥 ', h('b', {}, `${streak}일`), ' 연속'),
      h('span', { class: 'chip mint' }, '⭐ 외운 단어 ', h('b', {}, `${mastered}/${app.words.length}`)),
    ),

    planLesson ? planCard(app, planLesson, today) : h('div', { class: 'card tape today-card' },
      doneToday ? h('div', { class: 'stamp small done-stamp-mini' }, '오늘', h('br'), '완료') : null,
      h('div', { class: 'badge-label' }, doneToday ? '한 판 더 할 단어' : '오늘 만날 단어'),
      h('div', { class: 'today-count' }, String(picked.length), h('small', {}, '개')),
      h('p', { class: 'today-sub' }, subParts.join(' · ') || '모든 단어를 외웠어요!'),
      h('button', {
        class: 'btn', disabled: picked.length === 0,
        onclick: () => app.go('quiz', { kind: 'daily' }),
      }, doneToday ? '한 판 더 하기' : '오늘의 영영게임 시작', h('span', { 'aria-hidden': 'true' }, '→')),
    ),

    h('nav', { class: 'tiles', 'aria-label': '메뉴' },
      h('button', { class: 'tile', onclick: () => app.go('lessons') }, h('span', { class: 'tile-icon' }, '📚'), '레슨 골라 하기'),
      h('button', { class: 'tile', onclick: () => app.go('notes') },
        h('span', { class: 'tile-icon' }, '📝'), '오답 노트',
        wrongCount ? h('span', { class: 'count-dot', 'aria-label': `${wrongCount}개` }, String(wrongCount)) : null,
      ),
      h('button', { class: 'tile', onclick: () => app.go('stamps') }, h('span', { class: 'tile-icon' }, '🗓️'), '도장판'),
    ),

    isIos() && !isStandalone()
      ? h('div', { class: 'notice' }, '📌 아래 공유 버튼 → ', h('b', {}, "'홈 화면에 추가'"), '를 하면 학습 기록이 안전하게 지켜져요.')
      : null,
    app.storage.memoryOnly
      ? h('div', { class: 'notice' }, '⚠️ 이 브라우저에서는 기록이 저장되지 않아요. 사생활 보호 모드를 꺼 주세요.')
      : null,
  ));
}
