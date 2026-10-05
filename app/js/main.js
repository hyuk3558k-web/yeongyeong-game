// 앱 시작·화면 전환·저장
import { load, save } from './storage.js';
import { createRng } from './random.js';
import { toDateStr } from './scheduler.js';
import { setSoundEnabled } from './sound.js';
import { h, mount, svg, toast } from './ui.js';
import { mascotSvg } from './mascot.js';
import { showHome } from './screens/home.js';
import { startQuiz } from './screens/quiz.js';
import { showResult } from './screens/result.js';
import { showNotes } from './screens/notes.js';
import { showStamps } from './screens/stamps.js';
import { showLessons } from './screens/lessons.js';
import { showParent } from './screens/parent.js';

const SCREENS = {
  home: showHome,
  quiz: startQuiz,
  result: showResult,
  notes: showNotes,
  stamps: showStamps,
  lessons: showLessons,
  parent: showParent,
};

function safeStorage() {
  try {
    const k = '__yy_test__';
    window.localStorage.setItem(k, '1');
    window.localStorage.removeItem(k);
    return window.localStorage;
  } catch {
    // 사생활 보호 모드 등: 메모리에만 저장(앱을 닫으면 사라짐)
    const m = new Map();
    return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), memoryOnly: true };
  }
}

const app = {
  root: document.getElementById('app'),
  storage: safeStorage(),
  rng: createRng(),
  data: null,
  words: [],
  byId: new Map(),
  state: null,
  current: null,
  onBack: null, // 화면별 뒤로 가기 처리(문제 화면에서 "그만할까요?")
  today: () => toDateStr(),
  save() {
    save(this.storage, this.state);
  },
  setState(next) {
    this.state = next;
    setSoundEnabled(next.settings.sound);
    this.save();
  },
  go(name, params = {}, { replace = false } = {}) {
    this.onBack = null;
    this.cleanup?.();
    this.cleanup = null;
    this.current = name;
    if (name !== 'home' && !replace) history.pushState({ screen: name }, '');
    SCREENS[name](this, params);
  },
};

window.addEventListener('popstate', () => {
  if (app.onBack) {
    history.pushState({ screen: app.current }, '');
    app.onBack();
    return;
  }
  if (app.current !== 'home') app.go('home', {}, { replace: true });
});

async function loadWords() {
  const res = await fetch('data/words.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error(`words.json ${res.status}`);
  const data = await res.json();
  const order = new Map(data.lessons.map((l) => [l.id, l.order]));
  const words = data.words
    .filter((w) => !w.archived)
    .map((w) => ({ ...w, lessonOrder: order.get(w.lessonId) ?? 0 }));
  return { data, words };
}

function showError(err) {
  console.error(err);
  mount(app.root, h('section', { class: 'screen', style: { justifyContent: 'center', textAlign: 'center' } },
    svg(mascotSvg('oops')),
    h('h1', { class: 'section-title' }, '단어장을 불러오지 못했어요'),
    h('p', { class: 'muted' }, '인터넷 연결을 확인하고 다시 열어 주세요.'),
    h('button', { class: 'btn', onclick: () => location.reload() }, '다시 시도'),
  ));
}

async function boot() {
  app.state = load(app.storage);
  setSoundEnabled(app.state.settings.sound);
  try {
    const { data, words } = await loadWords();
    app.data = data;
    app.words = words;
    app.byId = new Map(words.map((w) => [w.id, w]));
  } catch (err) {
    showError(err);
    return;
  }
  // 브라우저가 저장 공간을 함부로 지우지 않도록 요청
  navigator.storage?.persist?.().catch(() => {});
  if ('serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('service worker', e));
  }
  history.replaceState({ screen: 'home' }, '');
  app.go('home');

  // 새 단어장이 배포됐으면 알려준다
  const seen = app.state.lastDataVersion;
  if (seen !== app.data.dataVersion) {
    if (seen !== undefined && app.data.dataVersion > seen) toast('📚 새 레슨이 도착했어요!', 3000);
    app.setState({ ...app.state, lastDataVersion: app.data.dataVersion });
  }
}

boot();
