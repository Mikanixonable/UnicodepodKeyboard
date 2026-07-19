// Service worker for the Unicodepod Keyboard PWA. Only runs when the app is
// served from a real origin (http/https) -- browsers refuse to register
// service workers for file:// pages, so this file is simply never fetched
// in that mode (see the guarded registration in index.html).
//
// Bump CACHE_VERSION whenever any precached file changes so clients pick up
// the new versions instead of serving stale ones from the old cache.
const CACHE_VERSION = 'v3';
const CACHE_NAME = `unicodepod-${CACHE_VERSION}`;

// App shell: everything needed for the app to boot and be usable offline.
// The rare-script fonts (fonts/*.woff2, ~7MB total) are deliberately NOT
// precached -- they're only fetched on demand (via @font-face unicode-range)
// when "拡張" font mode is on AND a matching glyph is actually rendered, and
// are cached at runtime instead (see the fetch handler below) so a normal
// visit doesn't pay for downloading all of them upfront.
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './css/fonts-extended.css',
  './data/segments.js',
  './data/blocks.js',
  './data/categories.js',
  './data/age.js',
  './data/block_names_ja.js',
  './data/names.js',
  './data/descriptions.js',
  './js/util.js',
  './js/data.js',
  './js/menu.js',
  './js/colormode.js',
  './js/favhighlight.js',
  './js/blockfavorites.js',
  './js/urlstate.js',
  './js/output.js',
  './js/favorites.js',
  './js/history.js',
  './js/art.js',
  './js/artlists.js',
  './js/artpatterns.js',
  './js/grid.js',
  './js/blocks.js',
  './js/modal.js',
  './js/app.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))
      ))
      .then(() => self.clients.claim())
  );
});

// Cache-first for everything same-origin: this is a static, mostly-frozen
// app (Unicode data doesn't change between visits), so staleness isn't a
// concern -- a new deploy just bumps CACHE_VERSION instead. Runtime-caches
// anything not in PRECACHE_URLS too (e.g. fonts/*.woff2), so the rare-script
// fonts become available offline after their first use.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        }
        return res;
      }).catch(() => cached);
    })
  );
});
