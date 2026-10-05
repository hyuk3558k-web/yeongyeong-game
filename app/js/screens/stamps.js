// 도장판: 달력·연속 출석·배지
import { h, mount } from '../ui.js';
import { MAX_BOX } from '../scheduler.js';
import { displayStreak } from '../storage.js';
import { backBar } from './notes.js';

const DOW = ['일', '월', '화', '수', '목', '금', '토'];

function badges(app) {
  const st = app.state;
  const p = Object.values(st.words);
  const mastered = app.words.filter((w) => st.words[w.id]?.box === MAX_BOX).length;
  const asked = st.history.reduce((s, x) => s + x.asked, 0);
  const clozeRight = p.reduce((s, x) => s + (x.formatStats?.cloze.correct ?? 0), 0);
  const lessons = [...new Set(app.words.map((w) => w.lessonId))];
  const lessonDone = lessons.some((id) => app.words.filter((w) => w.lessonId === id).every((w) => st.words[w.id]?.box === MAX_BOX));
  return [
    ['🐣', '첫 도장', st.stamps.length >= 1],
    ['🔥', '3일 연속', st.streak.best >= 3],
    ['🏅', '7일 연속', st.streak.best >= 7],
    ['🏆', '30일 연속', st.streak.best >= 30],
    ['⭐', '첫 단어 외움', mastered >= 1],
    ['🌟', '10단어 외움', mastered >= 10],
    ['✏️', '빈칸 30번 정답', clozeRight >= 30],
    ['💯', '100문제 풀기', asked >= 100],
    ['👑', '레슨 하나 정복', lessonDone],
  ];
}

export function showStamps(app, { year, month } = {}) {
  const today = app.today();
  const [ty, tm] = today.split('-').map(Number);
  const y = year ?? ty;
  const m = month ?? tm; // 1~12
  const stamps = new Set(app.state.stamps);
  const first = new Date(y, m - 1, 1).getDay();
  const days = new Date(y, m, 0).getDate();
  const pad = (n) => String(n).padStart(2, '0');
  const thisMonthCount = app.state.stamps.filter((d) => d.startsWith(`${y}-${pad(m)}`)).length;

  const cells = [
    ...DOW.map((d) => h('div', { class: 'dow' }, d)),
    ...Array.from({ length: first }, () => h('div', { class: 'day empty' })),
    ...Array.from({ length: days }, (_, i) => {
      const ds = `${y}-${pad(m)}-${pad(i + 1)}`;
      const cls = ['day', stamps.has(ds) ? 'stamped' : '', ds === today ? 'today' : ''].filter(Boolean).join(' ');
      return h('div', { class: cls, 'aria-label': `${i + 1}일${stamps.has(ds) ? ' 도장' : ''}` }, String(i + 1));
    }),
  ];
  const move = (delta) => {
    const d = new Date(y, m - 1 + delta, 1);
    showStamps(app, { year: d.getFullYear(), month: d.getMonth() + 1 });
  };

  mount(app.root, h('section', { class: 'screen' },
    backBar(app, '도장판'),
    h('div', { class: 'stat-row' },
      h('span', { class: 'chip sun' }, `🔥 지금 ${displayStreak(app.state, today)}일 연속`),
      h('span', { class: 'chip mint' }, `🏅 최고 ${app.state.streak.best}일`),
      h('span', { class: 'chip sky' }, `📮 도장 ${app.state.stamps.length}개`),
    ),
    h('div', { class: 'card tape' },
      h('div', { class: 'month-nav' },
        h('button', { class: 'icon-btn', 'aria-label': '이전 달', onclick: () => move(-1) }, '‹'),
        h('strong', {}, `${y}년 ${m}월`),
        h('button', { class: 'icon-btn', 'aria-label': '다음 달', onclick: () => move(1) }, '›'),
      ),
      h('p', { class: 'muted', style: { textAlign: 'center', margin: '6px 0 12px', fontSize: '15px' } }, `이번 달 도장 ${thisMonthCount}개`),
      h('div', { class: 'calendar' }, cells),
    ),
    h('h2', { class: 'section-title' }, '배지'),
    h('div', { class: 'badges' }, badges(app).map(([icon, label, got]) =>
      h('div', { class: `badge${got ? '' : ' locked'}`, 'aria-label': `${label}${got ? ' 획득' : ' 미획득'}` }, h('span', { class: 'b-icon' }, icon), label))),
  ));
}
