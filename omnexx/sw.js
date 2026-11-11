// Kill-switch service worker for omnexx (deployed Oct 2026; keep about 6 months, until ~Apr 2027).
// The old DWEEBS game registered a worker at /sw.js that may serve a cached page. Browsers re-check
// this URL (served with Cache-Control: no-store), get this file, and it removes itself: it deletes
// every cache, unregisters, and reloads open tabs onto the new page. It has no fetch handler.
self.addEventListener('install', function () {
  self.skipWaiting();
});
self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches
      .keys()
      .then(function (keys) {
        return Promise.all(keys.map(function (k) { return caches.delete(k); }));
      })
      .then(function () { return self.registration.unregister(); })
      .then(function () { return self.clients.matchAll({ type: 'window' }); })
      .then(function (clients) {
        clients.forEach(function (client) { client.navigate(client.url); });
      }),
  );
});
