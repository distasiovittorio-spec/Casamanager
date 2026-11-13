// Service worker: l'app funziona anche senza connessione.
const CACHE = 'casamanager-v2';
const FILE = ['./', './index.html', './style.css', './app.js', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(chiavi => Promise.all(chiavi.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Prima la rete (così gli aggiornamenti arrivano subito), poi la copia salvata.
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;
  e.respondWith(
    fetch(r).then(risposta => {
      const copia = risposta.clone();
      caches.open(CACHE).then(c => c.put(r, copia));
      return risposta;
    }).catch(() => caches.match(r).then(x => x || caches.match('./index.html')))
  );
});
