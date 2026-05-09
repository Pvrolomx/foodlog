// FoodLog v1 — Service Worker
// Network-first per RDE Cloud v1 Apéndice PWA

const CACHE_NAME = 'foodlog-v1';
const STATIC = ['/manifest.json', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(STATIC).catch(() => {})));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;
  if (url.hostname.includes('supabase.co')) return;
  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) return;
  if (url.hostname.includes('nominatim.openstreetmap.org')) return;

  const isDoc = request.mode === 'navigate' || request.destination === 'document';
  const isApi = url.pathname.startsWith('/api/');

  if (isDoc || isApi) {
    event.respondWith(
      fetch(request)
        .then((resp) => {
          const copy = resp.clone();
          caches.open(CACHE_NAME).then((c) => c.put(request, copy).catch(() => {}));
          return resp;
        })
        .catch(() => caches.match(request).then((r) => r || caches.match('/')))
    );
  } else {
    event.respondWith(
      caches.match(request).then((cached) =>
        cached ||
        fetch(request).then((resp) => {
          const copy = resp.clone();
          caches.open(CACHE_NAME).then((c) => c.put(request, copy).catch(() => {}));
          return resp;
        })
      )
    );
  }
});
