/* Service Worker：起動時に自動更新する構成
 * - キャッシュ名にバージョンを含める。アプリを更新するたびに VERSION をインクリメントすること
 * - install で skipWaiting、activate で clients.claim → 待機せず即時に新版へ切替
 * - activate で旧バージョンのキャッシュを削除
 * - 取得は「ネットワーク優先、失敗時キャッシュ」。オンラインなら起動のたびに最新を取得、オフラインでもキャッシュで動作
 */
const VERSION = 'lighting-v17';

const PRECACHE = [
  './',
  'index.html',
  'manifest.json',
  'css/style.css',
  'js/rules/daylight-rules.js',
  'js/data/windows.js',
  'js/core/state.js',
  'js/core/daylight-calc.js',
  'js/ui/section-svg.js',
  'js/app.js',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(caches.open(VERSION).then(c => c.addAll(PRECACHE)));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(req)
      .then(res => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(VERSION).then(c => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then(hit => hit || (req.mode === 'navigate' ? caches.match('index.html') : Response.error())))
  );
});
