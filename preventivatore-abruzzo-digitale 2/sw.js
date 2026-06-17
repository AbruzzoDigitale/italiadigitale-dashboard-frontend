/* ============================================================
   SERVICE WORKER — Abruzzo Digitale Preventivatore
   Strategia: NETWORK-FIRST per il codice (html/js/css/json) così
   online si riceve sempre l'ultima versione; CACHE-FIRST per font
   e immagini; fallback alla cache quando offline.
   ============================================================ */

const VERSION = 'v2.4.39';
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
  'css/pipeline.css',
  'css/contracts.css',
  'css/social-plan.css',
  'css/ped-generator.css',
  'css/workload.css',
  'css/operations-board.css',
  'css/daily-todo.css',
  'css/oracle.css',
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
  'js/pipeline.js',
  'js/reminders.js',
  'js/integrations.js',
  'js/contracts.js',
  'js/social-plan.js',
  'js/ped-generator.js',
  'js/workload.js',
  'js/operations-board.js',
  'js/daily-todo.js',
  'js/oracle.js',
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

// Permette ai client di forzare lo skip-waiting via postMessage
// (lo sfruttiamo in app.js per attivare subito il nuovo SW senza chiudere il tab)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'skip-waiting') {
    self.skipWaiting();
  }
});

self.addEventListener('install', (event) => {
  // Pulizia prima dell'install: rimuove TUTTE le cache esistenti (anche
  // RUNTIME di versioni precedenti) per evitare di servire file stale.
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .then(() => caches.open(SHELL_CACHE))
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
     .then(() => {
       // Notifica i client connessi che è arrivata una nuova versione,
       // così possono ricaricare automaticamente.
       self.clients.matchAll().then(cs => cs.forEach(c => c.postMessage({ type: 'sw-updated', version: VERSION })));
     })
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
