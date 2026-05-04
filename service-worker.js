/* service-worker.js — offline cache for the dashboard PWA.
 *
 * Strategy:
 *  - Pre-cache the app shell (HTML, JS, manifest, icons, fonts) on install.
 *  - Network-first for HTML pages so updates show up quickly when online.
 *  - Cache-first for static assets and Google Fonts.
 *  - Never cache Firebase / Open-Meteo / calendar / news API requests —
 *    those need fresh data.
 */
const VERSION = 'v1';
const APP_CACHE = `dash-app-${VERSION}`;
const RUNTIME = `dash-runtime-${VERSION}`;

const APP_SHELL = [
  './',
  './dashboard.html',
  './daily-dashboard.html',
  './market-dashboard.html',
  './sync.js',
  './firebase-config.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

// Hosts whose responses must always come from the network (live data).
const NEVER_CACHE_HOSTS = [
  'api.open-meteo.com',
  'firestore.googleapis.com',
  'firebaseinstallations.googleapis.com',
  'identitytoolkit.googleapis.com',
  'www.googleapis.com',
  'calendar.google.com',
  'query1.finance.yahoo.com',
  'query2.finance.yahoo.com',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(APP_CACHE).then((c) => c.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => ![APP_CACHE, RUNTIME].includes(k)).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Live data — always go to network, never cache.
  if (NEVER_CACHE_HOSTS.some((h) => url.hostname.endsWith(h))) return;

  // Same-origin HTML — network-first so updates appear quickly.
  const isHTML = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
  if (isHTML && url.origin === self.location.origin) {
    e.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(APP_CACHE).then((c) => c.put(req, copy));
        return res;
      }).catch(() => caches.match(req).then((m) => m || caches.match('./dashboard.html')))
    );
    return;
  }

  // Everything else (JS, CSS, fonts, icons) — cache-first.
  e.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res.ok && (url.origin === self.location.origin
            || url.hostname.endsWith('gstatic.com')
            || url.hostname.endsWith('googleapis.com') && url.hostname.startsWith('fonts'))) {
          const copy = res.clone();
          caches.open(RUNTIME).then((c) => c.put(req, copy));
        }
        return res;
      });
    })
  );
});

// Allow page to ask for an immediate update.
self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});
