// 서비스워커: 오프라인 실행과 업데이트
// - 앱 파일: 미리 저장해 두고 캐시 우선 (배포할 때마다 VERSION을 올려 새 파일로 교체)
// - 단어장(data/words.json): 네트워크 우선 → 새 레슨이 바로 반영, 인터넷이 없으면 저장본
// - 글꼴(Google Fonts): 처음 받은 뒤 저장해 두고 사용
const VERSION = 'v1';
const APP_CACHE = `yy-app-${VERSION}`;
const DATA_CACHE = 'yy-data';
const FONT_CACHE = 'yy-fonts';

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
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = new Set([APP_CACHE, DATA_CACHE, FONT_CACHE]);
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
    event.respondWith(networkFirst(request, DATA_CACHE));
    return;
  }
  if (request.mode === 'navigate') {
    event.respondWith(caches.match('index.html').then((hit) => hit ?? fetch(request)));
    return;
  }
  event.respondWith(cacheFirst(request, APP_CACHE));
});
