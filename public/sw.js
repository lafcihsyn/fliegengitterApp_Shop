const CACHE_NAME = 'fliegengitter-v1.20.12-externe-reparatur';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/css/style.css',
  '/js/01-helpers.js',
  '/js/02-i18n.js',
  '/js/03-auth.js',
  '/js/04-stock.js',
  '/js/05-output.js',
  '/js/06-stammdaten.js',
  '/js/07-board.js',
  '/js/08-order.js',
  '/js/09-prodstats.js',
  '/js/10-search.js',
  '/js/11-buchhaltung.js',
  '/js/12-mat-forecast.js',
  'https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,500;0,9..40,700;1,9..40,400&display=swap'
];

// Install: cache static assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate: clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch: network-first for HTML+API, cache-first for other static assets
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Always go to network for Firebase, Trello API calls
  if (url.hostname.includes('firestore.googleapis.com') ||
      url.hostname.includes('identitytoolkit.googleapis.com') ||
      url.hostname.includes('securetoken.googleapis.com') ||
      url.hostname.includes('trello.com')) {
    return;
  }

  // v1.18.5-phase4e: NETWORK-FIRST für HTML-Dokumente (index.html, /).
  // Verhindert dass alte gecachte index.html nach Update angezeigt wird.
  // Cache wird nur als Fallback bei Offline-Modus benutzt.
  const isHTML = event.request.mode === 'navigate' ||
                 url.pathname === '/' ||
                 url.pathname.endsWith('.html');

  // v1.18.25: JS/CSS auch network-first — sonst hängt das Frontend Tage nach
  // Updates noch auf alten Versionen (Chrome-PWAs besonders hartnäckig). Cache
  // ist nur noch Offline-Fallback. Bilder/Icons/Fonts bleiben cache-first.
  const isScriptOrStyle = url.pathname.endsWith('.js') || url.pathname.endsWith('.css');

  if (isHTML || isScriptOrStyle) {
    event.respondWith(
      fetch(event.request).then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache-first für statische Assets die sich selten ändern (Bilder, Icons, Fonts).
  event.respondWith(
    caches.match(event.request).then(cached => {
      const fetchPromise = fetch(event.request).then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
