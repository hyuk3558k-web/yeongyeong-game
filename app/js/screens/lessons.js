// 레슨 골라 하기
import { h, mount } from '../ui.js';
import { MAX_BOX } from '../scheduler.js';
import { backBar } from './notes.js';
import { PLAN_DAYS } from '../plan.js';

export function lessonStats(app, lessonId) {
  const ws = app.words.filter((w) => w.lessonId === lessonId);
  const mastered = ws.filter((w) => app.state.words[w.id]?.box === MAX_BOX).length;
  const started = ws.filter((w) => (app.state.words[w.id]?.box ?? 0) > 0).length;
  return { total: ws.length, mastered, started };
}

export function showLessons(app) {
  const lessons = [...app.data.lessons].sort((a, b) => b.order - a.order);
  mount(app.root, h('section', { class: 'screen' },
    backBar(app, '레슨 골라 하기'),
    h('p', { class: 'muted', style: { margin: 0 } }, '고른 레슨의 단어만 랜덤으로 복습해요. (5일 계획과 따로 기록돼요)'),
    h('div', { class: 'lesson-pick' }, lessons.map((l) => {
      const s = lessonStats(app, l.id);
      const pct = s.total ? Math.round((s.mastered / s.total) * 100) : 0;
      return h('button', { class: 'card lesson-btn', onclick: () => app.go('quiz', { kind: 'lesson', lessonId: l.id }, { replace: true }) },
        h('span', { class: 'lesson-no' }, `L${l.order}`),
        h('span', {},
          h('span', { class: 'lesson-title' }, l.title),
          h('span', { class: 'muted', style: { display: 'block', fontSize: '14px' } },
            `${s.total}단어 · 외운 단어 ${s.mastered}개 · 5일 계획 ${Math.min(app.state.plans[l.id]?.completedDays.length ?? 0, PLAN_DAYS)}/${PLAN_DAYS}`),
          h('span', { class: 'meter', 'aria-hidden': 'true' }, h('i', { style: { width: `${pct}%` } }))),
        h('span', { 'aria-hidden': 'true', style: { fontSize: '22px' } }, '→'),
      );
    })),
  ));
}
