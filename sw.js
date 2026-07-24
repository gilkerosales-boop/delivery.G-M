const CACHE_NAME = 'delivery-gm-v1';
const FILES_TO_CACHE = [
  '/delivery.G-M/',
  '/delivery.G-M/index.html',
  '/delivery.G-M/style.css',
  '/delivery.G-M/script.js',
  '/delivery.G-M/manifest.json',
  '/delivery.G-M/icon-192.png',
  '/delivery.G-M/icon-512.png'
];

// Evento de Instalación: Cachea los recursos estáticos en el dispositivo
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Caching app shell...');
      return cache.addAll(FILES_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Evento de Activación: Elimina cachés antiguas si actualizas la versión
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[Service Worker] Removiendo caché antigua:', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Evento Fetch: Responde desde caché si existe; si no, consulta a la red
self.addEventListener('fetch', (event) => {
  // Ignorar peticiones a la API de Google Apps Script para no cachear respuestas dinámicas de BD
  if (event.request.url.includes('script.google.com')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request);
    })
  );
});
