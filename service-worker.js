const CACHE_NAME = 'vinyl-player-v30';
const ASSETS = [
    './',
    './index.html',
    './css/styles.css',
    './js/main.js',
    './js/services/VinylPlayer.js',
    './js/services/ExportEngine.js',
    './js/services/PlaylistManager.js',
    './js/services/i18n.js',
    './js/services/HolidayManager.js',
    './js/mp4box.all.min.js',
    './js/jsmediatags.js',
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

    // Never cache user media or the large FFmpeg runtime response. This keeps
    // the web app from retaining full audio/video files in Cache Storage.
    const pathname = new URL(event.request.url).pathname;
    if (pathname.includes('/uploads/') || /\.(mp3|m4a|m4b|wav|flac|ogg|mp4|mkv|webm|wasm)$/i.test(pathname)) {
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
