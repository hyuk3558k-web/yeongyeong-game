// 화면 만들기 도우미. innerHTML 대신 h()로 만들어 데이터가 그대로 HTML로 해석되지 않게 한다.

export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

// 신뢰하는 SVG 문자열(마스코트 등)을 노드로
export function svg(markup) {
  const t = document.createElement('template');
  t.innerHTML = markup.trim();
  return t.content.firstElementChild;
}

export function mount(root, ...nodes) {
  root.replaceChildren(...nodes);
  window.scrollTo(0, 0);
}

let toastTimer;
export function toast(message, ms = 2200) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

// 예/아니오 확인 창. Promise<boolean>
export function confirmDialog({ title, message, yes = '네', no = '아니요' }) {
  return new Promise((resolve) => {
    const dlg = h('dialog', {},
      h('h2', {}, title),
      message ? h('p', {}, message) : null,
      h('div', { class: 'row' },
        h('button', { class: 'btn white small', onclick: () => close(false) }, no),
        h('button', { class: 'btn small', onclick: () => close(true) }, yes),
      ),
    );
    const close = (v) => { dlg.close(); dlg.remove(); resolve(v); };
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(false); });
    document.body.append(dlg);
    dlg.showModal();
  });
}

export function confetti(count = 60) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const colors = ['#FFD54A', '#79D9B8', '#8CC8FF', '#FF8B7B', '#FFFFFF'];
  const box = h('div', { class: 'confetti', 'aria-hidden': 'true' });
  for (let i = 0; i < count; i++) {
    box.append(h('i', {
      style: {
        left: `${Math.random() * 100}%`,
        background: colors[i % colors.length],
        animationDuration: `${1.6 + Math.random() * 1.6}s`,
        animationDelay: `${Math.random() * 0.4}s`,
        transform: `rotate(${Math.random() * 360}deg)`,
      },
    }));
  }
  document.body.append(box);
  setTimeout(() => box.remove(), 3800);
}

// 예문 속 빈칸/정답 부분을 강조해서 보여준다
export function sentenceWithBlank(clozeText, fill = null) {
  const [before, after] = clozeText.split('____');
  const blank = fill
    ? h('span', { class: 'blank filled' }, fill)
    : h('span', { class: 'blank', 'aria-label': '빈칸' }, ' ');
  return [before, blank, after ?? ''];
}

export function sentenceWithMark(clozeText, answer) {
  const [before, after] = clozeText.split('____');
  return [before, h('mark', {}, answer), after ?? ''];
}
