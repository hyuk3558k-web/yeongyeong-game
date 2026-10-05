// 부모 메뉴: 통계·설정·백업. 홈의 톱니바퀴를 2초 길게 누르고 곱셈 문제를 풀어야 들어올 수 있다.
import { h, mount, toast, confirmDialog } from '../ui.js';
import { MAX_BOX, addDays } from '../scheduler.js';
import { defaultState, exportCode, importCode } from '../storage.js';
import { backBar } from './notes.js';
import { lessonStats } from './lessons.js';
import { PLAN_DAYS } from '../plan.js';

export function openParentGate(app) {
  const a = 6 + Math.floor(Math.random() * 4);
  const b = 6 + Math.floor(Math.random() * 4);
  const input = h('input', { type: 'text', inputmode: 'numeric', autocomplete: 'off', 'aria-label': '정답' });
  const dlg = h('dialog', {},
    h('h2', {}, '부모님 확인'),
    h('p', {}, `${a} × ${b} = ?`),
    input,
    h('div', { class: 'row' },
      h('button', { class: 'btn white small', onclick: () => close() }, '닫기'),
      h('button', { class: 'btn small', onclick: () => check() }, '확인'),
    ),
  );
  const close = () => { dlg.close(); dlg.remove(); };
  const check = () => {
    if (Number(input.value.trim()) === a * b) {
      close();
      app.go('parent');
    } else {
      toast('다시 확인해 주세요');
      input.select();
    }
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') check(); });
  document.body.append(dlg);
  dlg.showModal();
  input.focus();
}

function seg(options, value, onPick) {
  const box = h('div', { class: 'seg', role: 'group' });
  for (const [v, label] of options) {
    box.append(h('button', { 'aria-pressed': String(v === value), onclick: () => onPick(v) }, label));
  }
  return box;
}

function pct(n, d) {
  return d ? `${Math.round((n / d) * 100)}%` : '-';
}

export function showParent(app) {
  const st = app.state;
  const today = app.today();
  const words = app.words;
  const prog = (w) => st.words[w.id];
  const mastered = words.filter((w) => prog(w)?.box === MAX_BOX).length;
  const asked = st.history.reduce((s, x) => s + x.asked, 0);
  const correct = st.history.reduce((s, x) => s + x.correct, 0);
  const fmt = { definition: [0, 0], cloze: [0, 0], korean: [0, 0] };
  for (const p of Object.values(st.words)) {
    for (const f of ['definition', 'cloze', 'korean']) {
      fmt[f][0] += p.formatStats?.[f].correct ?? 0;
      fmt[f][1] += (p.formatStats?.[f].correct ?? 0) + (p.formatStats?.[f].wrong ?? 0);
    }
  }
  const topWrong = words.filter((w) => (prog(w)?.wrong ?? 0) > 0).sort((a, b) => prog(b).wrong - prog(a).wrong).slice(0, 10);
  const recent = Array.from({ length: 14 }, (_, i) => addDays(today, -i)).map((d) => {
    const rows = st.history.filter((x) => x.date === d);
    return { d, asked: rows.reduce((s, x) => s + x.asked, 0), correct: rows.reduce((s, x) => s + x.correct, 0) };
  });

  const update = (patch) => {
    app.setState({ ...app.state, settings: { ...app.state.settings, ...patch } });
    showParent(app);
  };

  const backupArea = h('textarea', { placeholder: '백업 코드를 붙여 넣으세요', 'aria-label': '백업 코드' });

  const lessonBoxes = app.data.lessons.map((l) => {
    const on = st.settings.activeLessons.length === 0 || st.settings.activeLessons.includes(l.id);
    return h('label', { class: 'toggle-row' },
      h('span', {}, `L${l.order} ${l.title}`),
      h('input', {
        type: 'checkbox', checked: on, style: { width: '24px', height: '24px' },
        onchange: (e) => {
          const all = app.data.lessons.map((x) => x.id);
          let cur = st.settings.activeLessons.length ? [...st.settings.activeLessons] : [...all];
          cur = e.target.checked ? [...new Set([...cur, l.id])] : cur.filter((x) => x !== l.id);
          if (cur.length === 0) { toast('레슨을 하나 이상 골라 주세요'); showParent(app); return; }
          update({ activeLessons: cur.length === all.length ? [] : cur });
        },
      }));
  });

  mount(app.root, h('section', { class: 'screen parent' },
    backBar(app, '부모님 메뉴'),

    h('div', { class: 'card' },
      h('h2', { class: 'section-title', style: { marginTop: 0 } }, '학습 요약'),
      h('dl', {},
        h('dt', {}, '연속 / 최고 출석'), h('dd', {}, `${st.streak.current}일 / ${st.streak.best}일`),
        h('dt', {}, '도장 (완료한 날)'), h('dd', {}, `${st.stamps.length}일`),
        h('dt', {}, '푼 문제'), h('dd', {}, String(asked)),
        h('dt', {}, '한 번에 맞힌 비율'), h('dd', {}, pct(correct, asked)),
        h('dt', {}, '완전히 외운 단어'), h('dd', {}, `${mastered} / ${words.length}`),
      ),
    ),

    h('div', { class: 'card' },
      h('h2', { class: 'section-title', style: { marginTop: 0 } }, '레슨별 외운 비율'),
      h('div', { class: 'bar-list' }, app.data.lessons.map((l) => {
        const s = lessonStats(app, l.id);
        const p = s.total ? (s.mastered / s.total) * 100 : 0;
        return h('div', { class: 'bar-item' }, h('span', {}, `L${l.order}`), h('span', { class: 'meter' }, h('i', { style: { width: `${p}%` } })), h('b', { class: 'en' }, `${Math.round(p)}%`));
      })),
      h('h2', { class: 'section-title' }, '문제 유형별 정답률'),
      h('p', { class: 'muted', style: { fontSize: '14px', margin: '0 0 8px' } }, '영영풀이가 낮으면 뜻을, 빈칸이 낮으면 문장 속 쓰임을 더 연습하면 좋아요.'),
      h('div', { class: 'bar-list' },
        ...[['영영풀이', fmt.definition], ['예문 빈칸', fmt.cloze], ['한글 뜻', fmt.korean]].map(([label, [c, t]]) =>
          h('div', { class: 'bar-item' }, h('span', {}, label), h('span', { class: 'meter' }, h('i', { style: { width: t ? `${(c / t) * 100}%` : '0%' } })), h('b', { class: 'en' }, pct(c, t)))),
      ),
    ),

    h('div', { class: 'card' },
      h('h2', { class: 'section-title', style: { marginTop: 0 } }, '자주 틀리는 단어'),
      topWrong.length
        ? h('dl', {}, topWrong.flatMap((w) => [h('dt', { class: 'en', style: { fontWeight: 800, color: 'var(--ink)' } }, w.word), h('dd', {}, `${prog(w).wrong}번`)]))
        : h('p', { class: 'muted', style: { margin: 0 } }, '아직 없어요.'),
    ),

    h('div', { class: 'card' },
      h('h2', { class: 'section-title', style: { marginTop: 0 } }, '최근 14일'),
      h('dl', {}, recent.flatMap((r) => [h('dt', {}, r.d.slice(5).replace('-', '/')), h('dd', {}, r.asked ? `${r.correct}/${r.asked}` : '–')])),
    ),

    h('div', { class: 'card', style: { display: 'flex', flexDirection: 'column', gap: '16px' } },
      h('h2', { class: 'section-title', style: { margin: 0 } }, '설정'),
      h('div', { class: 'setting' }, h('span', { class: 'setting-label' }, '제한시간'),
        seg([['relaxed', '여유'], ['normal', '보통'], ['challenge', '도전']], st.settings.timer, (v) => update({ timer: v }))),
      h('div', { class: 'setting' }, h('span', { class: 'setting-label' }, '한 세션 문항 수'),
        seg([[10, '10'], [15, '15'], [20, '20']], st.settings.sessionSize, (v) => update({ sessionSize: v }))),
      h('div', { class: 'setting' }, h('span', { class: 'setting-label' }, '하루 새 단어'),
        seg([[5, '5'], [10, '10'], [15, '15']], st.settings.newPerDay, (v) => update({ newPerDay: v }))),
      h('div', { class: 'setting' }, h('span', { class: 'setting-label' }, '쓰기 단계 (1~4일차)'),
        seg([['both', '철자+한글 뜻 모두'], ['one', '하나만 랜덤']], st.settings.writeMode, (v) => update({ writeMode: v })),
        h('span', { class: 'muted', style: { fontSize: '14px' } }, '쓰기는 그날 단어의 절반만 해요(틀린 단어 먼저). "모두"면 1일차는 7단어 × 2 = 14문제, 3일차는 14단어 × 2 = 28문제예요.')),
      h('div', { class: 'setting' }, h('span', { class: 'setting-label' }, '효과음·발음 자동 재생'),
        seg([[true, '켜기'], [false, '끄기']], st.settings.sound, (v) => update({ sound: v }))),
      h('div', { class: 'setting' }, h('span', { class: 'setting-label' }, '학습할 레슨'), ...lessonBoxes),
    ),

    h('div', { class: 'card', style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
      h('h2', { class: 'section-title', style: { margin: 0 } }, '5일 계획 진행'),
      h('dl', {}, app.data.lessons.flatMap((l) => {
        const p = st.plans[l.id];
        const n = p?.completedDays.length ?? 0;
        return [h('dt', {}, `L${l.order} ${l.title}`), h('dd', {}, n >= PLAN_DAYS ? '완주' : `${n}/${PLAN_DAYS}일`)];
      })),
      ...app.data.lessons.filter((l) => st.plans[l.id]).map((l) => h('button', {
        class: 'btn small white',
        onclick: async () => {
          if (!(await confirmDialog({ title: `Lesson ${l.order} 계획을 처음부터?`, message: '1일차부터 다시 시작해요. 외운 기록은 그대로 남아요.', yes: '처음부터' }))) return;
          const plans = { ...app.state.plans };
          delete plans[l.id];
          app.setState({ ...app.state, plans });
          showParent(app);
        },
      }, `L${l.order} 계획 처음부터 다시`)),
    ),

    h('div', { class: 'card', style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
      h('h2', { class: 'section-title', style: { margin: 0 } }, '아이가 맞다고 한 한글 뜻'),
      h('p', { class: 'muted', style: { margin: 0, fontSize: '15px' } }, '정답 목록에 없지만 아이가 "내 답도 같은 뜻이에요"를 누른 답이에요. 틀린 답이면 지워 주세요.'),
      Object.keys(st.koClaims).length === 0
        ? h('p', { class: 'muted', style: { margin: 0 } }, '아직 없어요.')
        : h('div', { class: 'list' }, Object.entries(st.koClaims).flatMap(([wid, answers]) => answers.map((a) => {
            const w = app.byId.get(wid);
            return h('div', { class: 'claim-row' },
              h('span', {}, h('b', { class: 'en' }, w?.word ?? wid), ` → ${a}`, h('span', { class: 'muted', style: { fontSize: '13px', display: 'block' } }, `정답: ${(w?.koMeanings ?? []).join(', ')}`)),
              h('button', {
                class: 'icon-btn', 'aria-label': `${a} 지우기`,
                onclick: () => {
                  const rest = (app.state.koClaims[wid] ?? []).filter((x) => x !== a);
                  const koClaims = { ...app.state.koClaims };
                  if (rest.length) koClaims[wid] = rest; else delete koClaims[wid];
                  app.setState({ ...app.state, koClaims });
                  showParent(app);
                },
              }, '🗑'));
          }))),
    ),

    h('div', { class: 'card', style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
      h('h2', { class: 'section-title', style: { margin: 0 } }, '백업 / 복원'),
      h('p', { class: 'muted', style: { margin: 0, fontSize: '15px' } }, '폰을 바꾸거나 기록이 지워질 때를 대비해 가끔 백업 코드를 메모해 두세요.'),
      h('button', {
        class: 'btn small sky',
        onclick: async () => {
          const code = exportCode(app.state);
          try {
            await navigator.clipboard.writeText(code);
            toast('백업 코드를 복사했어요');
          } catch {
            backupArea.value = code;
            backupArea.select();
            toast('아래 코드를 길게 눌러 복사하세요');
          }
        },
      }, '백업 코드 복사'),
      backupArea,
      h('button', {
        class: 'btn small white',
        onclick: async () => {
          let restored;
          try {
            restored = importCode(backupArea.value);
          } catch (e) {
            toast(e.message);
            return;
          }
          if (await confirmDialog({ title: '복원할까요?', message: '지금 기록이 백업 코드의 기록으로 바뀌어요.', yes: '복원' })) {
            app.setState(restored);
            toast('복원했어요');
            showParent(app);
          }
        },
      }, '백업 코드로 복원'),
    ),

    h('div', { class: 'card', style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
      h('h2', { class: 'section-title', style: { margin: 0 } }, '단어장 정보'),
      h('p', { class: 'muted', style: { margin: 0, fontSize: '15px' } },
        `버전 ${app.data.dataVersion} · 단어 ${words.length}개 · ${app.data.approved === false ? '미리보기(검토 전)' : '승인됨'}`),
      h('button', {
        class: 'btn small white', style: { color: 'var(--coral-deep)' },
        onclick: async () => {
          if (!(await confirmDialog({ title: '기록을 모두 지울까요?', message: '도장·연속 출석·외운 단어가 모두 사라져요.', yes: '지우기' }))) return;
          if (!(await confirmDialog({ title: '정말 지울까요?', message: '되돌릴 수 없어요. 먼저 백업 코드를 복사해 두는 걸 권해요.', yes: '정말 지우기' }))) return;
          app.setState(defaultState());
          toast('기록을 지웠어요');
          app.go('home', {}, { replace: true });
        },
      }, '학습 기록 초기화'),
    ),
  ));
}
