/* Service worker de AltaFishing: permite instalar la app y abrirla sin conexión.
   No modifica la lógica de la app: solo guarda en caché sus archivos. */
const CACHE = 'altafishing-pwa-v1';
const APP_FILES = [
  './',
  './index.html',
  './styles.css',
  './theme.css',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => Promise.all(APP_FILES.map(file => cache.add(file).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // Clima, mareas, búsqueda y mosaicos del mapa: siempre desde la red (datos en vivo).
  const live = ['open-meteo.com', 'openfreemap.org'];
  if (live.some(host => url.hostname.endsWith(host))) return;

  // Archivos de la app y librerías/fuentes externas: caché primero, y se actualiza en segundo plano.
  event.respondWith(
    caches.match(request).then(cached => {
      const network = fetch(request).then(response => {
        if (response && (response.ok || response.type === 'opaque')) {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(request, copy));
        }
        return response;
      }).catch(() => cached || (request.mode === 'navigate' ? caches.match('./index.html') : undefined));
      return cached || network;
    })
  );
});
