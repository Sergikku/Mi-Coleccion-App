/* Service worker de La Colección App — v11.8.0
 *
 * Qué hace:
 *  - Al instalarse guarda TODO lo necesario para funcionar sin conexión
 *    (la app, JSZip, la fuente, iconos y manifest), así la app funciona sin
 *    conexión desde la primera visita. Se piden saltándose la caché HTTP
 *    del navegador para no guardar copias viejas.
 *  - La app (index.html) se pide SIEMPRE primero a la red (preguntando al
 *    servidor aunque el navegador tenga una copia reciente en su caché
 *    HTTP), para tener la última versión mientras haya conexión. Si la red tarda más de
 *    NETWORK_TIMEOUT_MS y hay una copia guardada, se abre la copia (la
 *    respuesta de la red, si llega después, actualiza la copia para la
 *    próxima vez). Sin conexión, se abre la copia directamente.
 *  - Solo se guarda como "app" una respuesta HTML correcta del propio sitio
 *    (nunca una página de error, una redirección o un portal de wifi).
 *  - El resto de archivos propios se sirven desde la caché (casi nunca
 *    cambian; cada versión nueva cambia CACHE_NAME y los vuelve a bajar).
 *  - Los datos de la colección NO pasan por aquí: viven en IndexedDB.
 *  - v11.7: iconos nuevos (mismos nombres de archivo); al cambiar CACHE_NAME se
 *    vuelven a bajar.
 */
const CACHE_NAME = 'coleccion-app-v11.8.0';
const NETWORK_TIMEOUT_MS = 4000;
const APP_SHELL = './index.html';
// Todos los archivos de la app (si se añade uno, añadirlo también a index.html)
// CSS y JS se piden con ?v=<versión> (igual que en index.html), así una versión
// nueva nunca reutiliza archivos de la anterior. Todo va en la raíz, sin carpetas.
const V = '?v=11.8.0';
const PRECACHE = [
  APP_SHELL, './app.css' + V,
  ...['util', 'i18n', 'storage', 'model', 'ui', 'screens', 'actions', 'backup', 'scanner', 'app'].map((n) => './' + n + '.js' + V),
  './manifest.json', './icon-192.png', './icon-512.png', './favicon.png',
  './jszip.min.js', './SpaceGrotesk-VF.woff2', './OFL.txt',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(PRECACHE.map((u) => new Request(u, { cache: 'reload' })));
    // './' (la carpeta) es opcional: si el servidor no la sirve, no pasa nada
    try { await cache.add(new Request('./', { cache: 'reload' })); } catch (e) {}
  })());
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      // solo las cachés de ESTA app: en GitHub Pages varias webs comparten origen
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('coleccion-app-') && k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isAppShellRequest(req, url) {
  return req.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('/index.html');
}

function isGoodHtml(res) {
  return !!res && res.ok && res.type === 'basic' && !res.redirected &&
    (res.headers.get('content-type') || '').includes('text/html');
}

async function cachedShell(req) {
  return (await caches.match(req, { ignoreSearch: true })) || (await caches.match(APP_SHELL));
}

function networkFirstWithTimeout(event) {
  const req = event.request;
  return new Promise((resolve) => {
    let settled = false;
    const finish = (res) => { if (!settled && res) { settled = true; resolve(res); } };

    // 'no-cache': se pregunta SIEMPRE al servidor si hay versión nueva (si no
    // la hay, responde "sin cambios" y es casi instantáneo). Sin esto, la caché
    // HTTP del navegador (10 min en GitHub Pages) podía servir la versión vieja.
    let netReq = req;
    try { netReq = new Request(req, { cache: 'no-cache' }); } catch (e) {}
    const network = fetch(netReq).then((res) => {
      if (isGoodHtml(res)) {
        const copy = res.clone();
        const save = caches.open(CACHE_NAME).then((c) => c.put(req, copy));
        try { event.waitUntil(save); } catch (e) {}
      }
      return res;
    });

    const timer = setTimeout(async () => {
      const cached = await cachedShell(req);
      finish(cached);            // si no hay copia guardada, se sigue esperando a la red
    }, NETWORK_TIMEOUT_MS);

    network.then((res) => { clearTimeout(timer); finish(res); })
      .catch(async () => {
        clearTimeout(timer);
        finish((await cachedShell(req)) || Response.error());
      });
  });
}

async function cacheFirst(event) {
  const req = event.request;
  const cached = await caches.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res && res.ok && res.type === 'basic') {
      const copy = res.clone();
      const save = caches.open(CACHE_NAME).then((c) => c.put(req, copy));
      try { event.waitUntil(save); } catch (e) {}
    }
    return res;
  } catch (e) {
    return (await caches.match(req, { ignoreSearch: true })) || Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // externos: el navegador directamente
  if (isAppShellRequest(req, url)) { event.respondWith(networkFirstWithTimeout(event)); return; }
  event.respondWith(cacheFirst(event));
});
