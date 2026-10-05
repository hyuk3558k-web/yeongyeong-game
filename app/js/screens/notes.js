// 오답 노트: 틀린 적 있는 단어(마스터 전), 많이 틀린 순
import { h, mount, svg } from '../ui.js';
import { mascotSvg } from '../mascot.js';
import { wrongNoteWords } from '../session.js';
import { speak, canSpeak } from '../speech.js';

export function backBar(app, title) {
  return h('header', { class: 'topbar' },
    h('button', { class: 'icon-btn', 'aria-label': '뒤로', onclick: () => history.back() }, '←'),
    h('h1', { class: 'section-title', style: { flex: 1, margin: 0 } }, title),
  );
}

export function showNotes(app) {
  const progress = app.state.words;
  const list = wrongNoteWords(app.words, progress);

  mount(app.root, h('section', { class: 'screen' },
    backBar(app, '오답 노트'),
    list.length === 0
      ? h('div', { class: 'card', style: { textAlign: 'center' } },
          h('div', { style: { width: '120px', margin: '0 auto' } }, svg(mascotSvg('cheer'))),
          h('p', {}, '지금은 틀린 단어가 없어요!'))
      : [
          h('button', { class: 'btn coral', style: { background: 'var(--coral)' }, onclick: () => app.go('quiz', { kind: 'wrong' }, { replace: true }) },
            `오답만 다시 풀기 (${Math.min(list.length, 15)}개)`),
          h('div', { class: 'list' }, list.map((w) => {
            const p = progress[w.id];
            return h('article', { class: 'card note-item' },
              h('span', { class: 'note-word' }, w.word),
              h('div', { class: 'note-meta' },
                h('span', { class: 'chip coral' }, `✗ ${p.wrong}번`),
                canSpeak() ? h('button', { class: 'icon-btn', 'aria-label': `${w.word} 발음 듣기`, onclick: () => speak(w.word) }, '🔊') : null),
              h('p', { class: 'note-def', style: { margin: 0 } }, w.definitions.find((d) => d.source !== 'paraphrase')?.text ?? ''),
            );
          })),
        ],
  ));
}
