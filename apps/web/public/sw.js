/**
 * ALOS Service Worker — Offline-first PWA cache strategy
 *
 * Strategy:
 *  - Shell (HTML, JS chunks, CSS, fonts): Cache-first with network fallback
 *  - API calls:                           Network-first with cache fallback (stale-while-revalidate)
 *  - Static assets (images, icons):       Cache-first, 30-day expiry
 *
 * On install → pre-cache the app shell.
 * On activate → purge old caches.
 * On fetch → route based on request destination / URL pattern.
 */

const CACHE_VERSION = 'v1';
const SHELL_CACHE   = `alos-shell-${CACHE_VERSION}`;
const DATA_CACHE    = `alos-data-${CACHE_VERSION}`;
const STATIC_CACHE  = `alos-static-${CACHE_VERSION}`;

// App shell — critical pages cached on install
const SHELL_URLS = [
  '/',
  '/dashboard',
  '/login',
  '/offline',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
];

// ── Install: pre-cache shell ──────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => {
      // addAll fails silently for missing pages in dev — use individual adds
      return Promise.allSettled(SHELL_URLS.map(url => cache.add(url)));
    }).then(() => {
      console.log('[SW] Shell cached');
      return self.skipWaiting();
    })
  );
});

// ── Activate: clean up old caches ─────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  const validCaches = [SHELL_CACHE, DATA_CACHE, STATIC_CACHE];
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter(k => !validCaches.includes(k)).map(k => caches.delete(k)))
    ).then(() => {
      console.log('[SW] Activated, old caches purged');
      return self.clients.claim();
    })
  );
});

// ── Fetch routing ─────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and non-http(s) requests
  if (request.method !== 'GET') return;
  if (!url.protocol.startsWith('http')) return;

  // 1. API calls → Network-first, fall back to cache
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirstWithCache(request, DATA_CACHE));
    return;
  }

  // 2. Static assets (images, fonts, icons) → Cache-first
  const isStaticAsset = /\.(png|jpg|jpeg|webp|svg|gif|woff2?|ttf|ico)$/.test(url.pathname);
  if (isStaticAsset) {
    event.respondWith(cacheFirstWithNetwork(request, STATIC_CACHE));
    return;
  }

  // 3. Next.js JS/CSS chunks → Cache-first (immutable with content hash)
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirstWithNetwork(request, SHELL_CACHE));
    return;
  }

  // 4. HTML navigation → Network-first, fall back to shell, then /offline
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(request).then(r => r || caches.match('/offline').then(r2 => r2 || caches.match('/')))
      )
    );
    return;
  }
});

// ── Strategy helpers ──────────────────────────────────────────────────────────

/** Network first, cache fallback. Good for API data. */
async function networkFirstWithCache(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch {
    const cached = await cache.match(request);
    return cached || new Response(JSON.stringify({ error: 'Offline', cached: false }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/** Cache first, network fallback. Good for static/immutable assets. */
async function cacheFirstWithNetwork(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch {
    return new Response('', { status: 408 });
  }
}

// ── Push Notifications (future) ───────────────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;
  let data;
  try { data = event.data.json(); } catch { data = { title: 'ALOS', body: event.data.text() }; }

  event.waitUntil(
    self.registration.showNotification(data.title || 'ALOS', {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: data.url ? { url: data.url } : undefined,
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.notification.data?.url) {
    event.waitUntil(clients.openWindow(event.notification.data.url));
  }
});
