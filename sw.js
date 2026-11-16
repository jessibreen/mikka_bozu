// Mikka Bōzu service worker: full offline use after the first load.
// Strategy: serve from cache immediately, refresh the cache in the background.
// A new deploy therefore shows up the next time the app is opened after it
// has been fetched once. Bump CACHE to force everything to be re-fetched.

const CACHE = 'mikka-bozu-v2';
const ASSETS = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'logic.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;

  // Any page navigation gets the app shell.
  const key = request.mode === 'navigate' ? 'index.html' : request;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(key, { ignoreSearch: true });

    const update = fetch(request)
      .then((response) => {
        if (response.ok) cache.put(key, response.clone());
        return response;
      })
      .catch(() => null);

    if (cached) {
      event.waitUntil(update);
      return cached;
    }
    return (await update) ?? Response.error();
  })());
});
