const CACHE_NAME = 'amanah-pwa-v4';
const APP_SHELL_URLS = [
  '/manifest.webmanifest',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/apple-touch-icon.png',
];

const IS_DEV_PREVIEW =
  self.location.hostname === 'localhost' ||
  self.location.hostname === '127.0.0.1' ||
  self.location.hostname === '0.0.0.0' ||
  self.location.hostname.startsWith('ais-dev-');

self.addEventListener('install', (event) => {
  // Always take over immediately in dev/preview or on initial install so stale caches never linger.
  if (IS_DEV_PREVIEW || !self.registration || !self.registration.active) {
    self.skipWaiting();
  }
  if (IS_DEV_PREVIEW) {
    event.waitUntil(Promise.resolve());
    return;
  }
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL_URLS).catch(() => undefined))
  );
});

self.addEventListener('message', (event) => {
  if (!event.data || typeof event.data !== 'object') return;
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }
  if (event.data.type === 'CLEAR_CACHES') {
    event.waitUntil(
      caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
    );
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => IS_DEV_PREVIEW || k !== CACHE_NAME)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (IS_DEV_PREVIEW) return;

  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never intercept or cache live API data, SSE streams, or Next.js HMR dev endpoints
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/_next/webpack') ||
    url.pathname.startsWith('/_next/data/') ||
    url.pathname.includes('hot-update')
  ) {
    return;
  }

  // Navigation requests: network first with cached fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const ct = (res.headers.get('content-type') || '').toLowerCase();
          if (res && res.ok && ct.includes('text/html')) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() =>
          caches
            .match(request)
            .then((cached) => cached || caches.match('/'))
            .then(
              (fallback) =>
                fallback ||
                new Response('Offline — please reconnect to load Amanah.', {
                  status: 503,
                  headers: { 'Content-Type': 'text/plain; charset=utf-8' },
                })
            )
        )
    );
    return;
  }

  // Static assets: never cache or serve HTML responses for JS/CSS/media assets
  if (
    url.pathname.startsWith('/_next/static/') ||
    /\.(?:png|jpg|jpeg|webp|svg|ico|woff2?|css|js|webmanifest)$/.test(url.pathname)
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const cachedCt = cached ? (cached.headers.get('content-type') || '').toLowerCase() : '';
        const validCached = cached && !cachedCt.includes('text/html') ? cached : undefined;

        const networkFetch = fetch(request)
          .then((res) => {
            const ct = (res.headers.get('content-type') || '').toLowerCase();
            if (res && res.ok && !ct.includes('text/html')) {
              const copy = res.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
            }
            return res;
          })
          .catch(
            () =>
              validCached ||
              new Response('', {
                status: 504,
                statusText: 'Offline',
              })
          );
        return validCached || networkFetch;
      })
    );
  }
});
