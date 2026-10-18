const CACHE_VERSION = 'v2'; // Increment this on every deploy!
const CACHE_NAME = `justgoals-cache-${CACHE_VERSION}`;
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/assets/index-B7Jt2LEL.js', // Update this with your current main JS file
  '/assets/index-3JjS-6J9.css', // Update this with your current main CSS file
  '/favicon.ico',
  '/manifest.json',
  '/robots.txt',
  '/sw.js',
];

// Install event: cache files
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS_TO_CACHE))
  );
});

// Activate event: delete old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch event: serve from cache, then network
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => response || fetch(event.request))
  );
});

// Background sync for notifications
self.addEventListener('sync', (event) => {
  if (event.tag === 'background-notification') {
    event.waitUntil(sendBackgroundNotification());
  }
});

// Push notification event
self.addEventListener('push', (event) => {
  const options = {
    body: event.data ? event.data.text() : 'Goal reminder!',
    icon: '/assets/images/app-icon.png',
    badge: '/assets/images/app-icon.png',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1
    },
    actions: [
      {
        action: 'explore',
        title: 'Open App',
        icon: '/assets/images/app-icon.png'
      },
      {
        action: 'close',
        title: 'Close',
        icon: '/assets/images/app-icon.png'
      }
    ]
  };

  event.waitUntil(
    self.registration.showNotification('JustGoals', options)
  );
});

// Notification click event
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'explore') {
    event.waitUntil(
      clients.openWindow('/')
    );
  }
});

// Background notification function
async function sendBackgroundNotification() {
  // This would be called when the app is in background
  // You can implement custom logic here for different notification types
  console.log('Background notification sent');
} 