const CACHE = 'b737-rto-v1.4.1';
const ASSETS = [
  './',
  './index.html',
  './styles.css?v=1.4.1',
  './data.js?v=1.4.1',
  './engine.js?v=1.4.1',
  './app.js?v=1.4.1',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './hero-plane-max.png?v=1.4.1'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  // Prefer the latest deployed files. Fall back to cache when offline.
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match('./index.html')))
  );
});
