/* ============================================================
   SERVICE WORKER — Abruzzo Digitale Preventivatore
   Strategia: NETWORK-FIRST per il codice (html/js/css/json) così
   online si riceve sempre l'ultima versione; CACHE-FIRST per font
   e immagini; fallback alla cache quando offline.
   ============================================================ */

const VERSION = 'v1.6.0';
const SHELL_CACHE = `ad-shell-${VERSION}`;
const RUNTIME_CACHE = `ad-runtime-${VERSION}`;

const SHELL = [
  './',
  'index.html',
  'manifest.json',
  'css/tokens.css',
  'css/app.css',
  'css/configurator.css',
  'css/roles.css',
  'css/profile-brand.css',
  'css/sprint1-tweaks.css',
  'js/db.js',
  'js/sync.js',
  'js/listino-data.js',
  'js/listino.js',
  'js/state.js',
  'js/roles.js',
  'js/fic.js',
  'js/views.js',
  'js/configurator.js',
  'js/configurator-view.js',
  'js/sprint1-tweaks.js',
  'js/profile-brand.js',
  'js/app-profile.js',
  'js/app.js',
  'data/listino.json',
  'assets/logo/logo-mark.svg',
  'assets/fonts/SpaceGrotesk-Regular.otf',
  'assets/fonts/SpaceGrotesk-SemiBold.otf',
  'assets/fonts/SpaceGrotesk-Bold.otf',
  'assets/fonts/Lato-Light.ttf',
  'assets/fonts/Lato-Regular.ttf',
  'assets/fonts/Lato-Medium.ttf',
  'assets/fonts/Lato-Semibold.ttf',
  'assets/fonts/Lato-Bold.ttf',
  'assets/fonts/Lato-Black.ttf',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== SHELL_CACHE && k !== RUNTIME_CACHE)
            .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Non cacheare chiamate API Fatture in Cloud
  if (url.hostname.includes('fattureincloud.it')) {
    return; // lascia che il browser le gestisca direttamente
  }

  if (event.request.method !== 'GET' || url.origin !== location.origin) return;

  const dest = event.request.destination;
  const isCode = dest === 'document' || dest === 'script' || dest === 'style' ||
                 url.pathname.endsWith('.js') || url.pathname.endsWith('.css') ||
                 url.pathname.endsWith('.json') || url.pathname.endsWith('.html');

  if (isCode) {
    // NETWORK-FIRST: online → sempre l'ultima versione; offline → cache.
    event.respondWith(
      fetch(event.request).then(res => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(RUNTIME_CACHE).then(c => c.put(event.request, clone));
        }
        return res;
      }).catch(() =>
        caches.match(event.request).then(c =>
          c || (event.request.destination === 'document' ? caches.match('index.html') : undefined)
        )
      )
    );
  } else {
    // CACHE-FIRST: font, immagini, asset statici pesanti.
    event.respondWith(
      caches.match(event.request).then(cached =>
        cached || fetch(event.request).then(res => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(RUNTIME_CACHE).then(c => c.put(event.request, clone));
          }
          return res;
        }).catch(() => undefined)
      )
    );
  }
});
