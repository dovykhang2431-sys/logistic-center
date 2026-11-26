const CACHE_NAME = 'logistic-center-cache-v1.4';
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/config.js',
  './js/assets.js',
  './js/entities.js',
  './js/scene6zones.js',
  './js/game.js',
  './assets/hub-scene.png',
  './assets/zone-nhap-hang.png',
  './assets/zone-kho.png',
  './assets/zone-dong-goi.png',
  './assets/zone-giao-hang.png',
  './assets/zone-van-phong.png',
  './assets/zone-quay-don.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
