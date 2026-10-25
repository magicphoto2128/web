// service-worker.js — a PLAIN (classic, non-module) service worker.
//
// It uses only the Cache API to precache the app shell so the app loads
// offline and is installable (Add to Home Screen). It deliberately does NOT
// import the Firebase ESM modules: ES-module service workers are not broadly
// supported across mobile browsers, and a classic cache-only worker is all the
// app shell needs. Firebase/gstatic (cross-origin) requests always fall
// through to the network.

const CACHE_NAME = 'magic-photo-shell-v7';

// App-shell files to precache. Every path here is a real file under web/.
const SHELL = [
  './',
  './index.html',
  './css/styles.css',
  './js/app.js',
  './js/ui.js',
  './js/router.js',
  './js/models.js',
  './js/firebase-config.js',
  './js/firebase-service.js',
  './js/image-matcher.js',
  './js/share.js',
  './js/screens/home.js',
  './js/screens/upload.js',
  './js/screens/detail.js',
  './js/screens/scan.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle GET; let the browser do the rest.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Cross-origin (Firebase SDK on gstatic, Storage media, etc.): network only.
  if (url.origin !== self.location.origin) return;

  // Same-origin shell: cache-first, then network (and cache a copy).
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          // Cache successful, basic (same-origin) responses for later.
          if (response && response.ok && response.type === 'basic') {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => {
          // Offline fallback for navigations: serve the app shell.
          if (request.mode === 'navigate') return caches.match('./index.html');
          return Response.error();
        });
    }),
  );
});
