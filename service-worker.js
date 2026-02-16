const CACHE_NAME = 'vinyl-player-v23';
const ASSETS = [
    './',
    './index.html',
    './css/styles.css',
    './js/main.js',
    './js/services/VinylPlayer.js',
    './js/services/PlaylistManager.js',
    './js/services/i18n.js',
    './js/services/HolidayManager.js',
    './manifest.json',
    './favicon.png',
    './images/favicon.svg',
    './images/vinyl.png',
    './images/vinyl-cover.png',
    './images/tonearm.png'
];

self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(ASSETS))
    );
});

self.addEventListener('activate', (event) => {
    self.clients.claim();
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME) {
                        return caches.delete(key);
                    }
                })
            );
        })
    );
});

self.addEventListener('fetch', (event) => {
    // Skip cross-origin requests
    if (!event.request.url.startsWith(self.location.origin)) {
        return;
    }

    // Navigation Fallback (SPA)
    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request).catch(() => {
                return caches.match('./index.html');
            })
        );
        return;
    }

    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
                // Stale-While-Revalidate
                fetch(event.request).then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, networkResponse);
                        });
                    }
                }).catch(() => { });
                return cachedResponse;
            }

            return fetch(event.request).then((networkResponse) => {
                if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
                    return networkResponse;
                }
                const responseToCache = networkResponse.clone();
                caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, responseToCache);
                });
                return networkResponse;
            });
        })
    );
});

// Background Sync (Stub)
self.addEventListener('sync', (event) => {
    console.log('Background Sync event fired', event);
});

// Periodic Sync (Stub)
self.addEventListener('periodicsync', (event) => {
    console.log('Periodic Sync event fired', event);
});

// Push Notifications (Stub)
self.addEventListener('push', (event) => {
    console.log('Push event fired', event);
});
