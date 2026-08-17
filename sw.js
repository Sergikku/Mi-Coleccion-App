const CACHE_NAME = 'coleccion-app-v7.2.1';
const ASSETS = ['./manifest.json', './icon-192.png', './icon-512.png', './favicon.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// El HTML de la app (donde vive todo el código) se pide SIEMPRE a la red
// primero, para tener la última versión mientras haya conexión — la copia
// guardada solo se usa si no hay internet. Así una actualización nueva no
// se queda "pegada" a una versión vieja como pasó esta vez. Los archivos
// estáticos (iconos, manifest) sí se sirven directos desde caché, porque
// casi nunca cambian.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = event.request.url;
  const isAppShell = url.endsWith('/') || url.endsWith('index.html');

  if (isAppShell) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          if (response && response.status === 200 && url.startsWith(self.location.origin)) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached);
    })
  );
});
