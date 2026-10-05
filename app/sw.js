// 서비스워커: 오프라인 실행과 업데이트
// - 앱 파일: 미리 저장해 두고 캐시 우선 (배포할 때마다 VERSION을 올려 새 파일로 교체)
// - 단어장(data/words.json): 네트워크 우선 → 새 레슨이 바로 반영, 인터넷이 없으면 저장본
// - 글꼴(Google Fonts): 처음 받은 뒤 저장해 두고 사용
const VERSION = 'v4';
const APP_CACHE = `yy-app-${VERSION}`;
const DATA_CACHE = 'yy-data';
const FONT_CACHE = 'yy-fonts';
const AUDIO_CACHE = 'yy-audio';

// speech.js의 audioUrl과 같은 규칙
const audioUrl = (text) => `audio/${String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.wav`;

// 단어장에 있는 모든 단어(빈칸 정답 형태 포함)의 발음 파일을 미리 저장
async function cacheAudio(words) {
  const cache = await caches.open(AUDIO_CACHE);
  const texts = new Set();
  for (const w of words) {
    texts.add(w.word);
    for (const e of w.examples ?? []) if (e.clozeAnswer) texts.add(e.clozeAnswer);
  }
  await Promise.all([...texts].map(async (t) => {
    const url = audioUrl(t);
    if (await cache.match(url)) return;
    const res = await fetch(url).catch(() => null);
    if (res?.ok) await cache.put(url, res);
  }));
}

const APP_FILES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'js/main.js',
  'js/random.js',
  'js/scheduler.js',
  'js/grading.js',
  'js/session.js',
  'js/plan.js',
  'js/storage.js',
  'js/timer.js',
  'js/ui.js',
  'js/mascot.js',
  'js/speech.js',
  'js/sound.js',
  'js/praise.js',
  'js/screens/home.js',
  'js/screens/quiz.js',
  'js/screens/result.js',
  'js/screens/notes.js',
  'js/screens/stamps.js',
  'js/screens/lessons.js',
  'js/screens/parent.js',
  'assets/icons/icon-any-192.png',
  'assets/icons/icon-any-512.png',
  'assets/icons/icon-maskable-512.png',
  'assets/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(APP_CACHE);
    await cache.addAll(APP_FILES);
    const data = await caches.open(DATA_CACHE);
    await data.add('data/words.json').catch(() => {});
    const saved = await data.match('data/words.json');
    if (saved) await cacheAudio((await saved.json()).words).catch(() => {});
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = new Set([APP_CACHE, DATA_CACHE, FONT_CACHE, AUDIO_CACHE]);
    for (const key of await caches.keys()) if (!keep.has(key)) await caches.delete(key);
    await self.clients.claim();
  })());
});

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(request);
    if (res.ok) await cache.put(request, res.clone());
    return res;
  } catch {
    const hit = await cache.match(request, { ignoreSearch: true });
    if (hit) return hit;
    throw new Error('offline and not cached');
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request, { ignoreSearch: true });
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok || res.type === 'opaque') await cache.put(request, res.clone());
  return res;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(cacheFirst(request, FONT_CACHE));
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (url.pathname.endsWith('/data/words.json')) {
    // 새 단어장을 받으면 새 단어 발음 파일도 이어서 저장
    event.respondWith(networkFirst(request, DATA_CACHE).then((res) => {
      try {
        event.waitUntil(res.clone().json().then((d) => cacheAudio(d.words)).catch(() => {}));
      } catch { /* 일부 브라우저는 늦은 waitUntil을 허용하지 않음 — 다음 설치 때 저장 */ }
      return res;
    }));
    return;
  }
  if (url.pathname.includes('/audio/')) {
    event.respondWith(cacheFirst(request, AUDIO_CACHE));
    return;
  }
  if (request.mode === 'navigate') {
    event.respondWith(caches.match('index.html').then((hit) => hit ?? fetch(request)));
    return;
  }
  event.respondWith(cacheFirst(request, APP_CACHE));
});
