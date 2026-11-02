/**
 * Director 24/7 service worker (D-127, hand-written — no vite-plugin-pwa).
 *
 * Cache-first for the app shell and static assets; network-first for
 * API calls and the WebSocket (never cache API responses — stale
 * telemetry or approvals would be worse than an honest offline error).
 * No offline queue for steering/approvals (D-126): a steering note
 * sent offline fails visibly and stays in the box for retry.
 */

const CACHE_VERSION = 'director-v1';
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const SHELL_URLS = ['/', '/index.html'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('director-') && key !== SHELL_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function isApiRequest(url) {
  return url.pathname.startsWith('/api/') || url.pathname === '/ws';
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (isApiRequest(url)) {
    // Network-first: always live data, never a cached answer.
    event.respondWith(fetch(request));
    return;
  }

  const isStatic = url.pathname.startsWith('/assets/') || url.pathname.startsWith('/fonts/');
  if (isStatic) {
    // Cache-first for versioned build assets.
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
    return;
  }

  if (url.pathname === '/' || url.pathname.endsWith('.html')) {
    // App shell: serve the cached shell, refresh it in the background.
    event.respondWith(
      caches.match('/index.html').then((cached) => {
        const network = fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put('/index.html', copy));
          }
          return response;
        });
        return cached ?? network;
      }),
    );
  }
});
