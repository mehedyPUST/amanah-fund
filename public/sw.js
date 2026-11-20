const CACHE_NAME = 'amanah-pwa-v15';
const PRIVATE_NAV_PREFIXES = ['/dashboard', '/community', '/login', '/signup'];
const APP_SHELL_URLS = [
  '/manifest.webmanifest',
  '/brand-logo.png',
  '/brand-lockup.png',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/pwa-maskable-192x192.png',
  '/pwa-maskable-512x512.png',
  '/apple-touch-icon.png',
  '/favicon-32x32.png',
  '/favicon.ico',
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
    return;
  }
  if (event.data.type === 'CLEAR_HTML_CACHES') {
    event.waitUntil(
      caches.keys().then((keys) =>
        Promise.all(
          keys.map((key) =>
            caches.open(key).then((cache) =>
              cache.keys().then((requests) =>
                Promise.all(
                  requests.map((req) =>
                    cache.match(req).then((resp) => {
                      const reqUrl = new URL(req.url);
                      const ct = (resp?.headers.get('content-type') || '').toLowerCase();
                      const isHtml =
                        ct.includes('text/html') ||
                        reqUrl.pathname === '/' ||
                        PRIVATE_NAV_PREFIXES.some((prefix) => reqUrl.pathname.startsWith(prefix));
                      if (isHtml) {
                        return cache.delete(req);
                      }
                      return undefined;
                    })
                  )
                )
              )
            )
          )
        )
      )
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

  // Navigation requests: network first; never cache private/authenticated HTML pages
  if (request.mode === 'navigate') {
    const isPrivateNav = PRIVATE_NAV_PREFIXES.some((prefix) => url.pathname.startsWith(prefix));
    event.respondWith(
      fetch(request)
        .then((res) => {
          const ct = (res.headers.get('content-type') || '').toLowerCase();
          const cc = (res.headers.get('cache-control') || '').toLowerCase();
          const cacheableHtml =
            !isPrivateNav &&
            res &&
            res.ok &&
            ct.includes('text/html') &&
            !cc.includes('no-store') &&
            !cc.includes('private');
          if (cacheableHtml) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() =>
          (isPrivateNav
            ? Promise.resolve(undefined)
            : caches.match(request).then((cached) => cached || caches.match('/'))
          ).then(
            (fallback) =>
              fallback ||
                new Response(
                  `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="theme-color" content="#059669" />
  <title>Amanah — Offline</title>
  <style>
    body{margin:0;min-height:100dvh;display:flex;align-items:center;justify-content:center;padding:24px;background:#f8fafc;color:#0f172a;font-family:system-ui,-apple-system,sans-serif;text-align:center}
    @media (prefers-color-scheme:dark){body{background:#020617;color:#f1f5f9}.card{background:#0f172a;border-color:#1e293b}.sub{color:#94a3b8}}
    .card{max-width:360px;width:100%;padding:28px 24px;border-radius:20px;background:#fff;border:1px solid #e2e8f0;box-shadow:0 12px 32px rgba(2,6,23,.08)}
    .logo{width:88px;height:88px;border-radius:20px;display:block;margin:0 auto 16px;background:#047857;box-shadow:0 8px 20px rgba(4,120,87,.25)}
    h1{margin:0 0 6px;font-size:18px;font-weight:700}
    .sub{margin:0 0 20px;font-size:13px;line-height:1.5;color:#475569}
    button{background:#047857;color:#fff;border:0;border-radius:10px;padding:10px 18px;font-size:13px;font-weight:600;cursor:pointer}
  </style>
</head>
<body>
  <main class="card">
    <img class="logo" src="/brand-lockup.png" alt="Amanah logo" referrerpolicy="no-referrer" />
    <h1>Amanah is Offline</h1>
    <p class="sub">Reconnect to sync your encrypted cooperative ledger, member balance, and live ballots.</p>
    <button type="button" onclick="window.location.reload()">Retry Connection</button>
  </main>
</body>
</html>`,
                  {
                    status: 503,
                    headers: { 'Content-Type': 'text/html; charset=utf-8' },
                  }
                )
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

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload = {};
  try {
    payload = event.data.json();
  } catch {
    try {
      payload = { notification: { title: 'Amanah Co-op Treasury', body: event.data.text() } };
    } catch {
      payload = {};
    }
  }

  const notif = (payload && typeof payload.notification === 'object' && payload.notification) || {};
  const data = (payload && typeof payload.data === 'object' && payload.data) || {};
  const fcmOptions =
    (payload && typeof payload.fcmOptions === 'object' && payload.fcmOptions) || {};

  const title = notif.title || data.title || 'Amanah Co-op Treasury';
  const body = notif.body || data.body || '';
  const targetUrl =
    data.url || fcmOptions.link || notif.click_action || '/dashboard?page=notification';
  const tag = notif.tag || data.tag || 'amanah-push';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        let hasFocusedVisibleClient = false;
        for (const client of windowClients) {
          if (client.visibilityState === 'visible' && client.focused) {
            hasFocusedVisibleClient = true;
          }
          try {
            client.postMessage({
              type: 'AMANAH_PUSH_RECEIVED',
              notification: {
                title,
                body,
                url: targetUrl,
                tag,
                data,
              },
            });
          } catch {
            // ignore client postMessage error
          }
        }

        if (hasFocusedVisibleClient) {
          return undefined;
        }

        return self.registration.showNotification(title, {
          body,
          icon: notif.icon || '/pwa-192x192.png',
          badge: notif.badge || '/favicon-32x32.png',
          tag,
          renotify: true,
          data: {
            ...data,
            url: targetUrl,
          },
        });
      })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const rawData = (event.notification && event.notification.data) || {};
  const rawUrl =
    typeof rawData.url === 'string' && rawData.url.trim()
      ? rawData.url.trim()
      : '/dashboard?page=notification';

  let targetUrl = '/dashboard?page=notification';
  try {
    const resolved = new URL(rawUrl, self.location.origin);
    targetUrl =
      resolved.origin === self.location.origin
        ? `${resolved.pathname}${resolved.search}${resolved.hash}`
        : '/dashboard?page=notification';
  } catch {
    targetUrl = '/dashboard?page=notification';
  }

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(async (windowClients) => {
        for (const client of windowClients) {
          if ('focus' in client) {
            try {
              const clientUrl = new URL(client.url);
              if (clientUrl.origin === self.location.origin) {
                await client.focus();
                client.postMessage({
                  type: 'AMANAH_PUSH_NAVIGATE',
                  url: targetUrl,
                  data: rawData,
                });
                return;
              }
            } catch {
              // continue checking other clients
            }
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
        return undefined;
      })
  );
});

self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        for (const client of windowClients) {
          try {
            client.postMessage({ type: 'AMANAH_PUSH_RESUBSCRIBE' });
          } catch {
            // ignore client postMessage error
          }
        }
      })
  );
});

