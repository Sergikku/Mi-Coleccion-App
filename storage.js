/* La Colección App — storage.js
   Almacenamiento: IndexedDB (colección = OVERRIDES en kv/overrides, fotos en el almacén fotos), datos del dispositivo (app_meta) y almacenamiento persistente. */

/* ---------- 2. ALMACENAMIENTO: IndexedDB (fotos + overrides del usuario) ---------- */
/* No depende del chat de Claude: funciona en cualquier navegador si abres
   este archivo directamente (recomendado: Safari/Chrome, no la vista
   previa incrustada del chat, para que el selector de galería no esté
   restringido). */

const DB_NAME = 'archivo_sergio_db';
const PHOTOS_STORE = 'fotos';
const KV_STORE = 'kv';

/* v11: una sola conexión a IndexedDB para toda la sesión (antes se abría
   una nueva en CADA lectura: 440 aperturas para pintar una plataforma de 100
   piezas). Si el navegador la cierra, se vuelve a abrir en el siguiente uso.
   Misma base de datos, misma versión (2) y mismos almacenes que siempre. */
let _dbPromise = null;
function openDB(){
  if(_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject)=>{
    if(!window.indexedDB){ reject(new Error('Este navegador no soporta almacenamiento local')); return; }
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = (e)=>{
      const db = req.result;
      if(!db.objectStoreNames.contains(PHOTOS_STORE)) db.createObjectStore(PHOTOS_STORE);
      if(!db.objectStoreNames.contains(KV_STORE)) db.createObjectStore(KV_STORE);
    };
    req.onsuccess = ()=>{
      const db = req.result;
      db.onversionchange = ()=>{ try{ db.close(); }catch(e){} _dbPromise = null; };
      db.onclose = ()=>{ _dbPromise = null; };
      resolve(db);
    };
    req.onerror = ()=>{ _dbPromise = null; reject(req.error); };
  });
  return _dbPromise;
}
/* Abre una transacción; si la conexión guardada ya no sirve (cerrada por el
   navegador), la reabre una vez. */
async function idbTx(store, mode){
  let db = await openDB();
  try{ return db.transaction(store, mode); }
  catch(e){
    if(e && e.name==='InvalidStateError'){ _dbPromise = null; db = await openDB(); return db.transaction(store, mode); }
    throw e;
  }
}
function idbGet(store, key){
  return idbTx(store,'readonly').then(tx=>new Promise((resolve,reject)=>{
    const r = tx.objectStore(store).get(key);
    r.onsuccess = ()=>resolve(r.result || null);
    r.onerror = ()=>reject(r.error);
    tx.onabort = ()=>reject(tx.error || new Error('abort'));
  })).catch(()=>null);
}
/* Lectura estricta: distingue "no existe" (undefined) de "no se ha podido
   leer" (error). Se usa para los datos de la colección: un fallo pasajero de
   lectura NUNCA debe tomarse por "colección vacía". */
function idbGetStrict(store, key){
  return idbTx(store,'readonly').then(tx=>new Promise((resolve,reject)=>{
    const r = tx.objectStore(store).get(key);
    r.onsuccess = ()=>resolve(r.result);
    r.onerror = ()=>reject(r.error || new Error('read error'));
    tx.onabort = ()=>reject(tx.error || new Error('abort'));
  }));
}
function sleepMs(ms){ return new Promise(r=>setTimeout(r, ms)); }
async function readWithRetry(fn, tries){
  let lastErr = null;
  for(let i=0;i<(tries||3);i++){
    try{ return { ok:true, value: await fn() }; }
    catch(e){ lastErr = e; _dbPromise = null; await sleepMs(250*(i+1)); }
  }
  return { ok:false, error:lastErr };
}
function idbSet(store, key, val){
  return idbTx(store,'readwrite').then(tx=>new Promise((resolve,reject)=>{
    tx.objectStore(store).put(val, key);
    tx.oncomplete = ()=>resolve(true);
    tx.onerror = ()=>reject(tx.error);
    // v10.2: cuando falta espacio, IndexedDB ABORTA la transacción (no
    // siempre avisa por onerror): sin esto, la promesa se quedaba colgada
    tx.onabort = ()=>reject(tx.error || new Error('abort'));
  })).catch(()=>false);
}
function idbDelete(store, key){
  return idbTx(store,'readwrite').then(tx=>new Promise((resolve,reject)=>{
    tx.objectStore(store).delete(key);
    tx.oncomplete = ()=>resolve(true);
    tx.onerror = ()=>reject(tx.error);
    tx.onabort = ()=>reject(tx.error || new Error('abort'));
  })).catch(()=>false);
}
function idbGetAll(store){
  return idbTx(store,'readonly').then(tx=>new Promise((resolve,reject)=>{
    const os = tx.objectStore(store);
    const keysReq = os.getAllKeys();
    const valsReq = os.getAll();
    let keys, vals;
    keysReq.onsuccess = ()=>{ keys = keysReq.result; if(vals!==undefined) resolve({keys, vals}); };
    valsReq.onsuccess = ()=>{ vals = valsReq.result; if(keys!==undefined) resolve({keys, vals}); };
    tx.onerror = ()=>reject(tx.error);
    tx.onabort = ()=>reject(tx.error || new Error('abort'));
  })).catch(()=>({keys:[], vals:[]}));
}

function idbGetKeysStrict(store){
  return idbTx(store,'readonly').then(tx=>new Promise((resolve,reject)=>{
    const r = tx.objectStore(store).getAllKeys();
    r.onsuccess = ()=>resolve(r.result || []);
    r.onerror = ()=>reject(r.error || new Error('read error'));
    tx.onabort = ()=>reject(tx.error || new Error('abort'));
  }));
}
function idbGetKeys(store){
  return idbTx(store,'readonly').then(tx=>new Promise((resolve,reject)=>{
    const r = tx.objectStore(store).getAllKeys();
    r.onsuccess = ()=>resolve(r.result || []);
    r.onerror = ()=>reject(r.error);
    tx.onabort = ()=>reject(tx.error || new Error('abort'));
  })).catch(()=>[]);
}

// overrides en memoria: { products:{id:{...}}, editions:{id:{...}} }
let OVERRIDES = { products:{}, editions:{} };
let overridesLoaded = false;
async function ensureOverridesLoaded(){
  if(overridesLoaded) return;
  // v11: si la lectura FALLA (no es lo mismo que "no hay datos"), se reintenta;
  // si sigue fallando, la app no guarda NADA en esta sesión para no pisar tu
  // colección con una vacía (antes podía pasar con un fallo pasajero).
  const res = await readWithRetry(()=>idbGetStrict(KV_STORE, 'overrides'), 3);
  if(!res.ok){
    storageReadFailed = true;
    OVERRIDES.seedEnabled = false;
    overridesLoaded = true;
    return;
  }
  const saved = res.value || null;
  if(saved){
    try{ OVERRIDES = JSON.parse(saved); }
    catch(e){
      // v10.2: si los datos guardados no se pueden leer, se aparta una copia
      // literal ANTES de seguir, para que ningún guardado posterior los pise
      await idbSet(KV_STORE, 'overrides_unreadable_' + new Date().toISOString().slice(0,19).replace(/[:T]/g,'-'), saved);
      unreadableDataOnLoad = true;
    }
  } else {
    // Primera vez que se abre esta copia del archivo en este navegador:
    // arranca completamente en blanco, como si fueras un coleccionista
    // nuevo — sin el catálogo de ejemplo cargado. Importa una copia de
    // seguridad (o crea tus propias categorías) para empezar a llenarla.
    OVERRIDES.seedEnabled = false;
  }
  overridesLoaded = true;
}
/* v10.2: si un guardado falla (normalmente por falta de espacio), se avisa
   con una franja visible y un botón "Reintentar"; desaparece sola en cuanto
   un guardado vuelve a funcionar. Devuelve true/false. */
let unreadableDataOnLoad = false;
let storageReadFailed = false;   // v11: la colección no se pudo leer al arrancar → no se guarda nada
async function persistOverrides(){
  if(storageReadFailed){ showSaveError(true, t('load.read_failed')); return false; }
  let ok = false;
  try{ ok = await idbSet(KV_STORE, 'overrides', JSON.stringify(OVERRIDES)); }catch(e){ ok = false; }
  showSaveError(!ok);
  if(typeof notifySaved==='function') notifySaved(ok);
  return ok;
}
function getProductOverride(id){ return OVERRIDES.products[id] || {}; }
function getEditionOverride(id){ return OVERRIDES.editions[id] || {}; }
async function setProductField(id, field, value){
  if(!OVERRIDES.products[id]) OVERRIDES.products[id] = {};
  OVERRIDES.products[id][field] = value;
  await persistOverrides();
}
/* A partir de este aplanado, "producto" y "edición" son la misma entidad:
   todo lo que antes era un campo de "edición" (checklist, posesión,
   conservación, procedencia, valoración, objetivo) se guarda ahora en el
   mismo cajón que el resto de campos del ítem (OVERRIDES.products), para
   que nunca se pierda al recargar. OVERRIDES.editions se conserva solo
   para poder leer datos de versiones anteriores de la app. */
async function setEditionField(id, field, value){
  if(!OVERRIDES.products[id]) OVERRIDES.products[id] = {};
  OVERRIDES.products[id][field] = value;
  await persistOverrides();
}
async function setEditionNested(id, group, field, value){
  if(!OVERRIDES.products[id]) OVERRIDES.products[id] = {};
  if(!OVERRIDES.products[id][group]) OVERRIDES.products[id][group] = {};
  OVERRIDES.products[id][group][field] = value;
  await persistOverrides();
}

// Fotos: se guardan en un cuadrado de 1200 × 1200 (el formato de siempre).
// v11.1.1: la imagen se abre directamente desde el archivo y se reduce con la
// máxima calidad de suavizado. La orientación de la cámara la aplica el navegador.
// v11.4: si la foto no es cuadrada se abre el editor (recortar o entera con
// fondo blanco, y girar); las cuadradas se guardan directamente, como siempre.
const PHOTO_SIZE = 1200;
function decodeImageFile(file){
  return new Promise((resolve, reject)=>{
    if(file && file.type && !/^image\//.test(file.type)){ reject(new Error(t('photo.not_image'))); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = ()=> resolve({ img, url });
    img.onerror = ()=>{ URL.revokeObjectURL(url); reject(new Error(t('photo.unsupported'))); };
    img.src = url;
  });
}
function loadImageURL(src){
  return new Promise((resolve, reject)=>{ const img = new Image(); img.onload = ()=>resolve(img); img.onerror = ()=>reject(new Error(t('photo.unsupported'))); img.src = src; });
}
/* Dibuja la foto en un cuadrado blanco de `size` (v11.5).
   rot  = giros de 90° a la derecha.
   rect = zona rectangular { x, y, w, h } de la foto ya girada, en píxeles de
          `src` (null = la foto entera). Se coloca centrada y lo más grande
          posible; lo que falte para completar el cuadrado queda en blanco.
   margin = blanco alrededor, en fracción del lado (0 = sin margen, 0,05 = 5 %).
   Con la foto entera y margen 0 el resultado es el de siempre. */
function drawPhotoFramed(ctx, size, src, w, h, rot, rect, margin){
  rot = rot || 0;
  margin = Math.min(0.45, Math.max(0, margin || 0));
  const W = rot % 2 ? h : w, H = rot % 2 ? w : h;
  rect = rect || { x:0, y:0, w:W, h:H };
  const k = size * (1 - 2 * margin) / Math.max(rect.w, rect.h);
  const dw = rect.w * k, dh = rect.h * k, ox = (size - dw) / 2, oy = (size - dh) / 2;
  const whole = rect.x <= 0 && rect.y <= 0 && rect.x + rect.w >= W && rect.y + rect.h >= H;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, size, size);
  ctx.save();
  if(!whole){ ctx.beginPath(); ctx.rect(ox, oy, dw, dh); ctx.clip(); }
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.setTransform(k, 0, 0, k, ox - rect.x * k, oy - rect.y * k);
  ctx.translate(W / 2, H / 2); ctx.rotate(rot * Math.PI / 2);
  ctx.drawImage(src, -w / 2, -h / 2, w, h);
  ctx.restore();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
function squarePhotoDataURL(src, w, h, rot, rect, margin){
  const c = document.createElement('canvas'); c.width = c.height = PHOTO_SIZE;
  drawPhotoFramed(c.getContext('2d'), PHOTO_SIZE, src, w, h, rot || 0, rect || null, margin || 0);
  return c.toDataURL('image/jpeg', 0.9);
}
/* ---------- Recorte con perspectiva (v11.7) ----------
   quad = 4 esquinas [[x,y] × 4] en píxeles de la foto ya girada, en orden
   arriba-izquierda, arriba-derecha, abajo-derecha, abajo-izquierda. La zona
   se endereza como un rectángulo con sus proporciones reales y se coloca
   centrada en el cuadrado blanco, igual que un recorte normal. */
function solveLinear(A, b){
  const n = b.length, M = A.map((r, i)=>r.concat([b[i]]));
  for(let c = 0; c < n; c++){
    let piv = c;
    for(let r = c + 1; r < n; r++) if(Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    const tmp = M[c]; M[c] = M[piv]; M[piv] = tmp;
    if(Math.abs(M[c][c]) < 1e-12) return null;
    for(let r = 0; r < n; r++){
      if(r === c) continue;
      const f = M[r][c] / M[c][c];
      if(f) for(let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((r, i)=>r[n] / r[i]);
}
/* Homografía que lleva los 4 puntos `from` a los 4 puntos `to`: [a,b,c,d,e,f,g,h]
   con x' = (a·x + b·y + c) / (g·x + h·y + 1), y' = (d·x + e·y + f) / (g·x + h·y + 1) */
function homographyFromPoints(from, to){
  const A = [], b = [];
  for(let i = 0; i < 4; i++){
    const x = from[i][0], y = from[i][1], u = to[i][0], v = to[i][1];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  return solveLinear(A, b);
}
/* Proporción real (ancho / alto) del rectángulo fotografiado en perspectiva,
   con el método de Zhang y He (2007): se estima la focal de la cámara a partir
   de las 4 esquinas, suponiendo el centro óptico en el centro de la foto.
   Si la focal no es creíble se usa una típica de móvil, y el resultado nunca
   se aleja más de un 50 % de la media de los lados (probado con esquinas
   desviadas 1–3 px de pantalla: ningún resultado disparatado). */
function quadAspect(q, W, H){
  const d = (a, b)=>Math.hypot(a[0] - b[0], a[1] - b[1]);
  const naive = (d(q[0], q[1]) + d(q[3], q[2])) / Math.max(1e-9, d(q[0], q[3]) + d(q[1], q[2]));
  const u0 = W / 2, v0 = H / 2;
  const m1 = [q[0][0], q[0][1], 1], m2 = [q[1][0], q[1][1], 1], m4 = [q[2][0], q[2][1], 1], m3 = [q[3][0], q[3][1], 1];
  const cr = (a, b)=>[a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a, b)=>a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const k2 = dot(cr(m1, m4), m3) / dot(cr(m2, m4), m3);
  const k3 = dot(cr(m1, m4), m2) / dot(cr(m3, m4), m2);
  if(!isFinite(k2) || !isFinite(k3)) return naive;
  const n2 = [k2 * m2[0] - m1[0], k2 * m2[1] - m1[1], k2 * m2[2] - m1[2]];
  const n3 = [k3 * m3[0] - m1[0], k3 * m3[1] - m1[1], k3 * m3[2] - m1[2]];
  const big = Math.max(W, H);
  let f = 0;
  if(Math.abs(n2[2]) > 1e-9 && Math.abs(n3[2]) > 1e-9){
    const f2 = -((n2[0] * n3[0] - (n2[0] * n3[2] + n2[2] * n3[0]) * u0 + n2[2] * n3[2] * u0 * u0)
               + (n2[1] * n3[1] - (n2[1] * n3[2] + n2[2] * n3[1]) * v0 + n2[2] * n3[2] * v0 * v0)) / (n2[2] * n3[2]);
    if(f2 > 0) f = Math.sqrt(f2);
  }
  // focal poco creíble (o lados casi paralelos): una normal de móvil
  if(!(f > 0.5 * big && f < 3 * big)) f = 0.9 * big;
  const ai = n=>[(n[0] - u0 * n[2]) / f, (n[1] - v0 * n[2]) / f, n[2]];
  const a2 = ai(n2), a3 = ai(n3);
  const r = Math.sqrt(dot(a2, a2) / dot(a3, a3));
  if(!isFinite(r) || r <= 0) return naive;
  // con esquinas algo imprecisas la estimación puede dispararse: nunca más de
  // un 50 % por encima o por debajo de lo que miden los lados en la foto
  return Math.min(naive * 1.5, Math.max(naive / 1.5, r));
}
/* Tamaño aproximado (px de la foto) del recorte enderezado */
function quadOutputSize(q, W, H){
  const d = (a, b)=>Math.hypot(a[0] - b[0], a[1] - b[1]);
  const ar = quadAspect(q, W, H);
  if(ar >= 1){ const w = Math.max(d(q[0], q[1]), d(q[3], q[2])); return { w, h:w / ar, ar }; }
  const h = Math.max(d(q[0], q[3]), d(q[1], q[2])); return { w:h * ar, h, ar };
}
function drawPhotoQuad(ctx, size, src, w, h, rot, quad, margin){
  rot = rot || 0;
  margin = Math.min(0.45, Math.max(0, margin || 0));
  const W = rot % 2 ? h : w, H = rot % 2 ? w : h;
  const ar = quadAspect(quad, W, H), inner = size * (1 - 2 * margin);
  const dw = Math.max(1, Math.round(ar >= 1 ? inner : inner * ar));
  const dh = Math.max(1, Math.round(ar >= 1 ? inner / ar : inner));
  const ox = Math.round((size - dw) / 2), oy = Math.round((size - dh) / 2);
  // 1) la zona de la foto que hace falta (con un poco de holgura), a una resolución parecida a la de salida
  const xs = quad.map(p=>p[0]), ys = quad.map(p=>p[1]);
  const bx = Math.max(0, Math.floor(Math.min(...xs)) - 1), by = Math.max(0, Math.floor(Math.min(...ys)) - 1);
  const bw = Math.max(1, Math.min(W, Math.ceil(Math.max(...xs)) + 1) - bx), bh = Math.max(1, Math.min(H, Math.ceil(Math.max(...ys)) + 1) - by);
  const sf = Math.min(1, 1.5 * Math.max(dw, dh) / Math.max(bw, bh));
  const tw = Math.max(1, Math.round(bw * sf)), th = Math.max(1, Math.round(bh * sf));
  const tmp = document.createElement('canvas'); tmp.width = tw; tmp.height = th;
  const tc = tmp.getContext('2d');
  tc.fillStyle = '#ffffff'; tc.fillRect(0, 0, tw, th);
  tc.imageSmoothingEnabled = true; tc.imageSmoothingQuality = 'high';
  const kx = tw / bw, ky = th / bh;
  tc.setTransform(kx, 0, 0, ky, -bx * kx, -by * ky);
  tc.translate(W / 2, H / 2); tc.rotate(rot * Math.PI / 2);
  tc.drawImage(src, -w / 2, -h / 2, w, h);
  const sd = tc.getImageData(0, 0, tw, th).data;
  // 2) cada píxel del rectángulo de salida sale de su punto en la foto (interpolación bilineal)
  const qs = quad.map(p=>[(p[0] - bx) * kx, (p[1] - by) * ky]);
  const M = homographyFromPoints([[0, 0], [dw, 0], [dw, dh], [0, dh]], qs);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, size, size);
  if(!M) return;
  const [a, b, c, d, e, f, g, hh] = M;
  const out = ctx.createImageData(dw, dh), od = out.data;
  const xmax = tw - 1, ymax = th - 1;
  let o = 0;
  for(let v = 0; v < dh; v++){
    const vy = v + 0.5;
    for(let u = 0; u < dw; u++){
      const ux = u + 0.5, z = g * ux + hh * vy + 1;
      let X = (a * ux + b * vy + c) / z - 0.5, Y = (d * ux + e * vy + f) / z - 0.5;
      X = X < 0 ? 0 : X > xmax ? xmax : X; Y = Y < 0 ? 0 : Y > ymax ? ymax : Y;
      const x0 = X | 0, y0 = Y | 0, x1 = x0 < xmax ? x0 + 1 : x0, y1 = y0 < ymax ? y0 + 1 : y0;
      const fx = X - x0, fy = Y - y0;
      const i00 = (y0 * tw + x0) * 4, i10 = (y0 * tw + x1) * 4, i01 = (y1 * tw + x0) * 4, i11 = (y1 * tw + x1) * 4;
      const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
      od[o]     = sd[i00]     * w00 + sd[i10]     * w10 + sd[i01]     * w01 + sd[i11]     * w11;
      od[o + 1] = sd[i00 + 1] * w00 + sd[i10 + 1] * w10 + sd[i01 + 1] * w01 + sd[i11 + 1] * w11;
      od[o + 2] = sd[i00 + 2] * w00 + sd[i10 + 2] * w10 + sd[i01 + 2] * w01 + sd[i11 + 2] * w11;
      od[o + 3] = 255;
      o += 4;
    }
  }
  ctx.putImageData(out, ox, oy);
}
function squarePhotoQuadDataURL(src, w, h, rot, quad, margin){
  const c = document.createElement('canvas'); c.width = c.height = PHOTO_SIZE;
  drawPhotoQuad(c.getContext('2d'), PHOTO_SIZE, src, w, h, rot || 0, quad, margin || 0);
  return c.toDataURL('image/jpeg', 0.9);
}
/* ---------- Recorte automático (v11.8) ----------
   Busca la pieza en la foto y devuelve sus 4 esquinas (o null si no hay un
   borde claro). Todo se hace aquí, sin conexión y sin librerías:
   1. Foto reducida a 384 px: se calculan los bordes (cambios de color).
   2. Para varios umbrales, se «inunda» el fondo desde los bordes de la foto
      sin cruzar ningún borde; lo que queda sin inundar es la pieza (se quitan
      hilos sueltos y se rellenan sus huecos).
   3. Se elige el umbral que da la forma más compacta (y, si empatan, la más
      grande); si ninguna es compacta, no hay pieza clara.
   4. Si la pieza es un cuadrilátero casi perfecto, se toman sus 4 esquinas
      (perspectiva); si no (una solapa, piezas redondeadas…), el rectángulo
      más pequeño que la contiene, girado como esté.
   5. A 1024 px, cada lado se ajusta al borde nítido más exterior que tenga
      cerca, saltándose las sombras (un escalón de luz del mismo color).
   Las esquinas van en píxeles de la foto original (sin girar), en orden
   arriba-izq., arriba-der., abajo-der., abajo-izq. */
const PD_SIZE = 384, PD_FINE = 1024;
const PD_THRESHOLDS = [5, 7, 9, 11, 13, 16, 19, 23, 28];
function pdImage(src, w, h, S){
  const s = Math.min(1, S / Math.max(w, h));
  const W = Math.max(1, Math.round(w * s)), H = Math.max(1, Math.round(h * s));
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d', { willReadFrequently:true });
  x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
  x.drawImage(src, 0, 0, W, H);
  return { W, H, s:W / w, sy:H / h, canvas:c, rgba:x.getImageData(0, 0, W, H).data };
}
/* Desenfoque separable (núcleo [1,4,6,4,1]/16 o [1,2,1]/4), bordes repetidos */
function pdBlur(rgba, W, H, k){
  const r = (k.length - 1) / 2, tmp = new Float32Array(W * H * 3), out = new Float32Array(W * H * 3);
  const sum = k.reduce((a, b)=>a + b, 0);
  for(let y = 0; y < H; y++) for(let x = 0; x < W; x++){
    let v0 = 0, v1 = 0, v2 = 0;
    for(let i = -r; i <= r; i++){
      const xx = x + i < 0 ? 0 : x + i >= W ? W - 1 : x + i, j = (y * W + xx) * 4, kk = k[i + r];
      v0 += kk * rgba[j]; v1 += kk * rgba[j + 1]; v2 += kk * rgba[j + 2];
    }
    const o = (y * W + x) * 3; tmp[o] = v0 / sum; tmp[o + 1] = v1 / sum; tmp[o + 2] = v2 / sum;
  }
  for(let y = 0; y < H; y++) for(let x = 0; x < W; x++){
    let v0 = 0, v1 = 0, v2 = 0;
    for(let i = -r; i <= r; i++){
      const yy = y + i < 0 ? 0 : y + i >= H ? H - 1 : y + i, j = (yy * W + x) * 3, kk = k[i + r];
      v0 += kk * tmp[j]; v1 += kk * tmp[j + 1]; v2 += kk * tmp[j + 2];
    }
    const o = (y * W + x) * 3; out[o] = v0 / sum; out[o + 1] = v1 / sum; out[o + 2] = v2 / sum;
  }
  return out;
}
/* Fuerza del borde: Sobel en cada canal de color, el mayor */
function pdGradient(rgb, W, H){
  const g = new Float32Array(W * H), R = W * 3;
  for(let y = 1; y < H - 1; y++) for(let x = 1; x < W - 1; x++){
    let m = 0;
    const o = (y * W + x) * 3;
    for(let c = 0; c < 3; c++){
      const i = o + c;
      const tl = rgb[i - R - 3], tc = rgb[i - R], tr = rgb[i - R + 3], ml = rgb[i - 3], mr = rgb[i + 3], bl = rgb[i + R - 3], bc = rgb[i + R], br = rgb[i + R + 3];
      const gx = (tr + 2 * mr + br - tl - 2 * ml - bl) / 8, gy = (bl + 2 * bc + br - tl - 2 * tc - tr) / 8;
      const v = gx * gx + gy * gy; if(v > m) m = v;
    }
    g[y * W + x] = Math.sqrt(m);
  }
  return g;
}
/* Inunda desde el borde de la foto por los píxeles «pasables» (4 vecinos) */
function pdFloodFromBorder(pass, W, H){
  const seen = new Uint8Array(W * H), q = new Int32Array(W * H);
  let head = 0, tail = 0;
  const push = i=>{ if(pass[i] && !seen[i]){ seen[i] = 1; q[tail++] = i; } };
  for(let x = 0; x < W; x++){ push(x); push((H - 1) * W + x); }
  for(let y = 0; y < H; y++){ push(y * W); push(y * W + W - 1); }
  while(head < tail){
    const i = q[head++], x = i % W;
    if(x > 0) push(i - 1);
    if(x < W - 1) push(i + 1);
    if(i >= W) push(i - W);
    if(i < (H - 1) * W) push(i + W);
  }
  return seen;
}
/* Erosión / dilatación con una ventana cuadrada (fuera de la foto cuenta como 0) */
function pdMorph(m, W, H, r, erode){
  const I = new Int32Array((W + 1) * (H + 1));
  for(let y = 0; y < H; y++){ let row = 0; for(let x = 0; x < W; x++){ row += m[y * W + x]; I[(y + 1) * (W + 1) + x + 1] = I[y * (W + 1) + x + 1] + row; } }
  const out = new Uint8Array(W * H), full = (2 * r + 1) * (2 * r + 1);
  for(let y = 0; y < H; y++) for(let x = 0; x < W; x++){
    const x0 = Math.max(0, x - r), x1 = Math.min(W, x + r + 1), y0 = Math.max(0, y - r), y1 = Math.min(H, y + r + 1);
    const n = I[y1 * (W + 1) + x1] - I[y0 * (W + 1) + x1] - I[y1 * (W + 1) + x0] + I[y0 * (W + 1) + x0];
    out[y * W + x] = erode ? (n === full ? 1 : 0) : (n > 0 ? 1 : 0);
  }
  return out;
}
/* Se queda con la mancha más grande (4 vecinos) y le rellena los huecos */
function pdLargest(m, W, H){
  const lab = new Int32Array(W * H), q = new Int32Array(W * H);
  let best = 0, bestN = 0, id = 0;
  for(let s = 0; s < W * H; s++){
    if(!m[s] || lab[s]) continue;
    id++; let head = 0, tail = 0; q[tail++] = s; lab[s] = id;
    while(head < tail){
      const i = q[head++], x = i % W;
      if(x > 0 && m[i - 1] && !lab[i - 1]){ lab[i - 1] = id; q[tail++] = i - 1; }
      if(x < W - 1 && m[i + 1] && !lab[i + 1]){ lab[i + 1] = id; q[tail++] = i + 1; }
      if(i >= W && m[i - W] && !lab[i - W]){ lab[i - W] = id; q[tail++] = i - W; }
      if(i < (H - 1) * W && m[i + W] && !lab[i + W]){ lab[i + W] = id; q[tail++] = i + W; }
    }
    if(tail > bestN){ bestN = tail; best = id; }
  }
  if(!best) return null;
  const pass = new Uint8Array(W * H);
  for(let i = 0; i < W * H; i++) pass[i] = lab[i] === best ? 0 : 1;
  const outside = pdFloodFromBorder(pass, W, H), obj = new Uint8Array(W * H);
  let n = 0;
  for(let i = 0; i < W * H; i++) if(!outside[i]){ obj[i] = 1; n++; }
  return { obj, n };
}
function pdCross(o, a, b){ return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); }
function pdArea(P){ let s = 0; for(let i = 0; i < P.length; i++){ const a = P[i], b = P[(i + 1) % P.length]; s += a[0] * b[1] - b[0] * a[1]; } return Math.abs(s) / 2; }
/* Envolvente convexa de la mancha (con las esquinas de cada píxel) */
function pdHull(obj, W, H){
  const pts = [];
  for(let y = 0; y < H; y++){
    let l = -1, r = -1;
    for(let x = 0; x < W; x++) if(obj[y * W + x]){ if(l < 0) l = x; r = x; }
    if(l >= 0) pts.push([l, y], [l, y + 1], [r + 1, y], [r + 1, y + 1]);
  }
  if(pts.length < 3) return null;
  pts.sort((a, b)=>a[0] - b[0] || a[1] - b[1]);
  const lo = [], up = [];
  for(const p of pts){ while(lo.length >= 2 && pdCross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for(let i = pts.length - 1; i >= 0; i--){ const p = pts[i]; while(up.length >= 2 && pdCross(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
function pdLineInter(a, b, c, d){
  const x1 = a[0], y1 = a[1], x2 = b[0], y2 = b[1], x3 = c[0], y3 = c[1], x4 = d[0], y4 = d[1];
  const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if(Math.abs(den) < 1e-9) return null;
  const p = x1 * y2 - y1 * x2, q = x3 * y4 - y3 * x4;
  return [(p * (x3 - x4) - (x1 - x2) * q) / den, (p * (y3 - y4) - (y1 - y2) * q) / den];
}
/* Reduce un polígono convexo a 4 lados: cada vez se quita el lado cuya
   desaparición (prolongando sus dos vecinos) añade menos área */
function pdCollapse(P){
  P = P.map(p=>p.slice());
  while(P.length > 4){
    const n = P.length; let best = null;
    for(let i = 0; i < n; i++){
      const a = P[(i - 1 + n) % n], b = P[i], c = P[(i + 1) % n], d = P[(i + 2) % n];
      const x = pdLineInter(a, b, c, d); if(!x) continue;
      // tiene que quedar por fuera: más allá de b siguiendo a→b y más allá de c siguiendo d→c
      const ab = [b[0] - a[0], b[1] - a[1]], dc = [c[0] - d[0], c[1] - d[1]];
      if((x[0] - b[0]) * ab[0] + (x[1] - b[1]) * ab[1] < -1e-9) continue;
      if((x[0] - c[0]) * dc[0] + (x[1] - c[1]) * dc[1] < -1e-9) continue;
      const add = pdArea([b, x, c]);
      if(!best || add < best.add) best = { add, i, x };
    }
    if(!best) return null;
    const out = [];
    for(let j = 0; j < n; j++){ if(j === best.i) out.push(best.x); else if(j !== (best.i + 1) % n) out.push(P[j]); }
    P = out;
  }
  return P.length === 4 ? P : null;
}
function pdOrder(Q){
  const cx = Q.reduce((s, p)=>s + p[0], 0) / 4, cy = Q.reduce((s, p)=>s + p[1], 0) / 4;
  const a = Q.slice().sort((p, q)=>Math.atan2(p[1] - cy, p[0] - cx) - Math.atan2(q[1] - cy, q[0] - cx));
  let k = 0; for(let i = 1; i < 4; i++) if(a[i][0] + a[i][1] < a[k][0] + a[k][1]) k = i;
  return [0, 1, 2, 3].map(i=>a[(k + i) % 4]);
}
function pdMinAreaRect(Hh){
  let best = null;
  for(let i = 0; i < Hh.length; i++){
    const e = [Hh[(i + 1) % Hh.length][0] - Hh[i][0], Hh[(i + 1) % Hh.length][1] - Hh[i][1]];
    const ang = Math.atan2(e[1], e[0]), c = Math.cos(-ang), s = Math.sin(-ang);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for(const p of Hh){ const x = c * p[0] - s * p[1], y = s * p[0] + c * p[1]; if(x < x0) x0 = x; if(x > x1) x1 = x; if(y < y0) y0 = y; if(y > y1) y1 = y; }
    const A = (x1 - x0) * (y1 - y0);
    if(!best || A < best.A) best = { A, ang, x0, y0, x1, y1 };
  }
  const c = Math.cos(best.ang), s = Math.sin(best.ang);
  const back = (x, y)=>[c * x - s * y, s * x + c * y];
  return pdOrder([back(best.x0, best.y0), back(best.x1, best.y0), back(best.x1, best.y1), back(best.x0, best.y1)]);
}
/* Dentro del marco base, el rectángulo (en su propio plano) que más pieza y menos fondo coge */
function pdFitRect(obj, W, H, Q, lam){
  const d = (a, b)=>Math.hypot(a[0] - b[0], a[1] - b[1]), G = 120;
  const wq = Math.max(d(Q[0], Q[1]), d(Q[3], Q[2])), hq = Math.max(d(Q[0], Q[3]), d(Q[1], Q[2]));
  const gw = wq >= hq ? G : Math.max(8, Math.round(G * wq / hq)), gh = wq >= hq ? Math.max(8, Math.round(G * hq / wq)) : G;
  const M = homographyFromPoints([[0, 0], [gw, 0], [gw, gh], [0, gh]], Q); if(!M) return Q;
  const map = (x, y)=>{ const z = M[6] * x + M[7] * y + 1; return [(M[0] * x + M[1] * y + M[2]) / z, (M[3] * x + M[4] * y + M[5]) / z]; };
  const w = new Float32Array(gw * gh);
  for(let yy = 0; yy < gh; yy++) for(let xx = 0; xx < gw; xx++){
    const p = map(xx + 0.5, yy + 0.5), px = Math.floor(p[0]), py = Math.floor(p[1]);
    const inside = p[0] >= 0 && p[0] < W && p[1] >= 0 && p[1] < H;
    w[yy * gw + xx] = inside && obj[Math.min(H - 1, Math.max(0, py)) * W + Math.min(W - 1, Math.max(0, px))] ? 1 : -lam;
  }
  let best = -Infinity, bl = 0, br = gw - 1, bt = 0, bb = gh - 1;
  const col = new Float32Array(gh);
  for(let l = 0; l < gw; l++){
    col.fill(0);
    for(let r = l; r < gw; r++){
      for(let i = 0; i < gh; i++) col[i] += w[i * gw + r];
      let s = 0, st = 0;
      for(let i = 0; i < gh; i++){
        if(s <= 0){ s = col[i]; st = i; } else s += col[i];
        if(s > best){ best = s; bl = l; br = r; bt = st; bb = i; }
      }
    }
  }
  return [map(bl, bt), map(br + 1, bt), map(br + 1, bb + 1), map(bl, bb + 1)];
}
function pdMedian(a){ const s = a.slice().sort((x, y)=>x - y), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : 0; }
/* Ajusta cada lado al borde nítido más exterior de su zona, saltando sombras */
function pdRefine(img, Q, persp){
  const { W, H } = img, rgb = img.rgba, L0 = new Float32Array(W * H), L1 = new Float32Array(W * H), L = new Float32Array(W * H);
  for(let i = 0; i < W * H; i++) L0[i] = (rgb[i * 4] + rgb[i * 4 + 1] + rgb[i * 4 + 2]) / 3;
  // la luz, ligeramente suavizada ([1,2,1] en las dos direcciones)
  for(let y = 0; y < H; y++){ const r = y * W; for(let x = 0; x < W; x++){ const a = x > 0 ? x - 1 : 0, b = x < W - 1 ? x + 1 : W - 1; L1[r + x] = (L0[r + a] + 2 * L0[r + x] + L0[r + b]) / 4; } }
  for(let y = 0; y < H; y++){ const r = y * W, ra = (y > 0 ? y - 1 : 0) * W, rb = (y < H - 1 ? y + 1 : H - 1) * W; for(let x = 0; x < W; x++) L[r + x] = (L1[ra + x] + 2 * L1[r + x] + L1[rb + x]) / 4; }
  const S = Math.max(W, H), rin = Math.floor(S * 0.05) + 2, rout = Math.floor(S * 0.02) + 2, N = rin + rout + 1;
  const samp = (x, y, out, k)=>{   // bilineal: luz en out[k] y color en out.rgb[k]
    x = Math.min(W - 1.001, Math.max(0, x)); y = Math.min(H - 1.001, Math.max(0, y));
    const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0;
    const i00 = y0 * W + x0, i10 = i00 + 1, i01 = i00 + W, i11 = i01 + 1;
    const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
    out.l[k] = L[i00] * w00 + L[i10] * w10 + L[i01] * w01 + L[i11] * w11;
    for(let c = 0; c < 3; c++) out.c[k * 3 + c] = rgb[i00 * 4 + c] * w00 + rgb[i10 * 4 + c] * w10 + rgb[i01 * 4 + c] * w01 + rgb[i11 * 4 + c] * w11;
  };
  const prof = { l:new Float32Array(N), c:new Float32Array(N * 3) }, gr = new Float32Array(N);
  const cx = Q.reduce((s, p)=>s + p[0], 0) / 4, cy = Q.reduce((s, p)=>s + p[1], 0) / 4;
  const lines = [];
  for(let i = 0; i < 4; i++){
    const a = Q[i], b = Q[(i + 1) % 4], len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const t = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    let n = [t[1], -t[0]];
    if(((a[0] + b[0]) / 2 - cx) * n[0] + ((a[1] + b[1]) / 2 - cy) * n[1] < 0) n = [-n[0], -n[1]];
    const offs = [], pts = [];
    for(let u = 0; u < 48; u++){
      const f = 0.1 + 0.8 * u / 47, px = a[0] + (b[0] - a[0]) * f, py = a[1] + (b[1] - a[1]) * f;
      for(let k = 0; k < N; k++){ const o = k - rin; samp(px + n[0] * o, py + n[1] * o, prof, k); }
      let mx = 0;
      for(let k = 0; k < N; k++){
        const v = k === 0 ? prof.l[1] - prof.l[0] : k === N - 1 ? prof.l[N - 1] - prof.l[N - 2] : (prof.l[k + 1] - prof.l[k - 1]) / 2;
        gr[k] = Math.abs(v); if(gr[k] > mx) mx = gr[k];
      }
      if(mx <= 8) continue;
      let kk = -1;
      for(let j = N - 2; j > 0; j--){       // de fuera hacia dentro
        if(!(gr[j] >= 0.45 * mx && gr[j] >= gr[j - 1] && gr[j] >= gr[j + 1])) continue;
        const half = gr[j] / 2; let a0 = j, b0 = j;
        while(a0 > 0 && gr[a0 - 1] >= half) a0--;
        while(b0 < N - 1 && gr[b0 + 1] >= half) b0++;
        if(b0 - a0 + 1 > 5) continue;          // borde difuso
        // ¿sombra? un escalón de luz del mismo color, más oscuro por dentro
        const mean = (from, to)=>{ const m = [0, 0, 0]; let c = 0; for(let k = from; k < to; k++){ m[0] += prof.c[k * 3]; m[1] += prof.c[k * 3 + 1]; m[2] += prof.c[k * 3 + 2]; c++; } return c ? m.map(v=>v / c) : m; };
        const ci = mean(Math.max(0, j - 9), Math.max(1, j - 3)), co = mean(Math.min(N - 1, j + 3), Math.min(N, j + 9));
        const li = ci[0] + ci[1] + ci[2] + 1, lo = co[0] + co[1] + co[2] + 1;
        const chroma = Math.abs(ci[0] / li - co[0] / lo) + Math.abs(ci[1] / li - co[1] / lo) + Math.abs(ci[2] / li - co[2] / lo);
        if(li < lo * 0.93 && chroma < 0.05) continue;
        kk = j; break;
      }
      if(kk < 0){ kk = 0; for(let k = 1; k < N; k++) if(gr[k] > gr[kk]) kk = k; }
      const o = kk - rin;
      offs.push(o); pts.push([px + n[0] * o, py + n[1] * o]);
    }
    if(offs.length < 10){ lines.push([a, b]); continue; }
    if(!persp){
      // sin perspectiva el marco conserva su giro: cada lado solo se desplaza
      // (si la pieza tiene salientes, un lado puede tocar el borde solo en parte)
      const med = pdMedian(offs), keep = offs.filter(o=>Math.abs(o - med) <= 1.5);
      const dd = keep.length >= 8 ? keep.reduce((s, v)=>s + v, 0) / keep.length : 0;
      lines.push([[a[0] + n[0] * dd, a[1] + n[1] * dd], [b[0] + n[0] * dd, b[1] + n[1] * dd]]);
      continue;
    }
    // recta que mejor pasa por los puntos (quitando los que se alejan)
    let P = pts, dir = t, m = [0, 0];
    for(let it = 0; it < 4; it++){
      m = [P.reduce((s, p)=>s + p[0], 0) / P.length, P.reduce((s, p)=>s + p[1], 0) / P.length];
      let sxx = 0, sxy = 0, syy = 0;
      for(const p of P){ const dx = p[0] - m[0], dy = p[1] - m[1]; sxx += dx * dx; sxy += dx * dy; syy += dy * dy; }
      const th = 0.5 * Math.atan2(2 * sxy, sxx - syy); dir = [Math.cos(th), Math.sin(th)];
      if(it === 3) break;
      const dist = P.map(p=>Math.abs((p[0] - m[0]) * -dir[1] + (p[1] - m[1]) * dir[0]));
      const lim = Math.max(1, 2.5 * pdMedian(dist)), next = P.filter((p, k)=>dist[k] <= lim);
      if(next.length < 6) break;
      P = next;
    }
    if(Math.abs(dir[0] * t[0] + dir[1] * t[1]) < Math.cos(2.5 * Math.PI / 180)){ lines.push([a, b]); continue; }   // giro raro: no se toca
    lines.push([[m[0] - dir[0] * 1000, m[1] - dir[1] * 1000], [m[0] + dir[0] * 1000, m[1] + dir[1] * 1000]]);
  }
  const R = [];
  for(let i = 0; i < 4; i++){
    const p = pdLineInter(lines[(i + 3) % 4][0], lines[(i + 3) % 4][1], lines[i][0], lines[i][1]);
    R.push(p || Q[i]);
  }
  return R;
}
const pdYield = ()=>new Promise(r=>setTimeout(r, 0));
async function detectPieceQuad(src, w, h){
  const fine = pdImage(src, w, h, PD_FINE);                       // 1024 px, para el ajuste fino
  const base = pdImage(fine.canvas, fine.W, fine.H, PD_SIZE);     // 384 px, para buscar la pieza
  const W = base.W, H = base.H;
  const g = pdGradient(pdBlur(base.rgba, W, H, [1, 4, 6, 4, 1]), W, H);
  const cands = [];
  for(const t of PD_THRESHOLDS){
    await pdYield();
    const edges = new Uint8Array(W * H);
    for(let i = 0; i < W * H; i++) edges[i] = g[i] >= t ? 1 : 0;
    const wall = pdMorph(edges, W, H, 1, false), pass = new Uint8Array(W * H);
    for(let i = 0; i < W * H; i++) pass[i] = wall[i] ? 0 : 1;
    const bg = pdFloodFromBorder(pass, W, H), raw = new Uint8Array(W * H);
    for(let i = 0; i < W * H; i++) raw[i] = bg[i] ? 0 : 1;
    const opened = pdMorph(pdMorph(raw, W, H, 4, true), W, H, 4, false);
    const lg = pdLargest(opened, W, H); if(!lg || lg.n < 50) continue;
    const Hh = pdHull(lg.obj, W, H); if(!Hh) continue;
    const C = pdCollapse(Hh); if(!C) continue;
    const Q = pdOrder(C), qa = pdArea(Q);
    const cand = { t, obj:lg.obj, n:lg.n, Hh, Q, ar:qa / (W * H), fill:lg.n / qa };
    cands.push(cand);
    // con umbrales más altos el fondo ya se está comiendo la pieza: no hace falta seguir
    const good = cands.filter(c=>c.ar > 0.04 && c.ar < 0.985);
    const top = good.length ? Math.max(...good.map(c=>c.fill)) : 0;
    if(top >= 0.9 && cand.fill < top - 0.04) break;
  }
  // la pieza más compacta (la que menos fondo tiene alrededor dentro de su contorno);
  // entre las que empatan, la más grande: con umbrales altos el fondo se «come» partes claras de la pieza
  const ok = cands.filter(c=>c.ar > 0.04 && c.ar < 0.985);
  if(!ok.length) return null;
  const top = Math.max(...ok.map(c=>c.fill));
  if(top < 0.8) return null;              // nada compacto: no es una pieza clara
  const c = ok.filter(c=>c.fill >= top - 0.015).reduce((a, b)=>b.ar > a.ar ? b : a);
  const persp = c.fill >= 0.975;
  const frame = pdFitRect(c.obj, W, H, persp ? c.Q : pdMinAreaRect(c.Hh), 0.3);
  await pdYield();
  const kx = fine.W / W, ky = fine.H / H;
  let R = pdRefine(fine, frame.map(p=>[p[0] * kx, p[1] * ky]), persp).map(p=>[p[0] / fine.s, p[1] / fine.sy]);
  // comprobaciones finales: dentro de la foto, sin cruzarse y de un tamaño razonable
  R = R.map(p=>[Math.min(w, Math.max(0, p[0])), Math.min(h, Math.max(0, p[1]))]);
  for(let i = 0; i < 4; i++) if(pdCross(R[i], R[(i + 1) % 4], R[(i + 2) % 4]) <= 0) return null;
  const ar = pdArea(R) / (w * h);
  if(!(ar > 0.04 && ar < 0.985)) return null;
  return { quad:R, persp, threshold:c.t, fill:c.fill };
}
function isSquareImage(w, h){ return Math.abs(w - h) <= Math.max(w, h) * 0.01; }
/* Lo de siempre, sin editor: la foto entera sobre fondo blanco */
async function compressImage(file){
  const { img, url } = await decodeImageFile(file);
  try{ return squarePhotoDataURL(img, img.naturalWidth, img.naturalHeight, 0, null, 0); }
  finally{ URL.revokeObjectURL(url); }
}
/* v11.4: cuadrada → directa; si no, editor. Devuelve { dataUrl } o { cancelled:true }
   v11.8: una cuadrada también abre el editor si se ve una pieza clara bastante
   más pequeña que la foto (con el recorte ya propuesto); si no, directa como siempre. */
async function photoDataFromFile(file){
  const { img, url } = await decodeImageFile(file);
  try{
    const w = img.naturalWidth, h = img.naturalHeight;
    if(typeof openPhotoEditor === 'function'){
      if(!isSquareImage(w, h)){
        const out = await openPhotoEditor({ source: img });
        return out ? { dataUrl: out } : { cancelled: true };
      }
      let det = null;
      try{ det = await detectPieceQuad(img, w, h); }catch(_){ det = null; }
      if(det && pdArea(det.quad) < 0.85 * w * h){
        const out = await openPhotoEditor({ source: img, detected: det });
        return out ? { dataUrl: out } : { cancelled: true };
      }
    }
    return { dataUrl: squarePhotoDataURL(img, w, h, 0, null, 0) };
  } finally { URL.revokeObjectURL(url); }
}
async function loadPhoto(key){ return idbGet(PHOTOS_STORE, key); }

/* ---------- Índice de fotos (v11) ----------
   Al arrancar se leen solo las CLAVES del almacén de fotos (no las fotos),
   así se sabe al instante qué piezas tienen foto delantera/trasera sin
   cargar megas de imágenes. Reconoce las claves actuales
   (photo_<id>_front / _back) y las antiguas (photo_product_<id>_front /
   _back / _main), con la misma prioridad que antes. */
/* v11.3: además de delantera y trasera, cada pieza puede tener hasta 4 fotos
   extra (photo_<id>_extra1 … _extra4) para documentar manual, insertos,
   cartucho, precinto… Son claves NUEVAS en el mismo almacén: las de siempre
   no cambian, y una versión anterior de la app simplemente no las ve. */
const EXTRA_SLOTS = ['extra1','extra2','extra3','extra4'];
const PHOTO_SIDES = ['front','back'].concat(EXTRA_SLOTS);
const PHOTO_INDEX = { ready:false };
PHOTO_SIDES.forEach(s=>{ PHOTO_INDEX[s] = new Map(); });
function parsePhotoKey(key){
  let m = /^photo_product_(.+)_(front|back|main)$/.exec(key);
  if(m) return { id:m[1], side: m[2]==='back' ? 'back' : 'front', legacy:true, main: m[2]==='main' };
  m = /^photo_(.+)_(front|back|extra[1-4])$/.exec(key);
  if(m) return { id:m[1], side:m[2], legacy:false };
  return null;
}
function photoKeyRank(key){ const i = parsePhotoKey(key); return !i ? 9 : (!i.legacy ? 0 : (i.main ? 2 : 1)); }
function indexPhotoKey(key){
  const info = parsePhotoKey(key); if(!info) return;
  const map = PHOTO_INDEX[info.side];
  const cur = map.get(info.id);
  // prioridad: clave actual > photo_product_*_front > photo_product_*_main
  if(!cur || photoKeyRank(key) < photoKeyRank(cur)) map.set(info.id, key);
}
/* Devuelve true si el índice se ha podido leer. Si la lectura falla, NO se
   da por hecho que no hay fotos: se reintenta y, si sigue fallando, se
   comprueba pieza a pieza (probePhotoIndex), como hacían las versiones
   anteriores. */
function photoIndexSignature(){ return PHOTO_SIDES.map(s=>PHOTO_INDEX[s].size).join(':') + ':' + PHOTO_SIDES.map(s=>[...PHOTO_INDEX[s].values()].join('|')).join('|'); }
async function loadPhotoIndex(){
  const res = await readWithRetry(()=>idbGetKeysStrict(PHOTOS_STORE), 3);
  if(!res.ok){ PHOTO_INDEX.ready = false; return false; }
  PHOTO_SIDES.forEach(s=>PHOTO_INDEX[s].clear());
  res.value.forEach(k=>{ if(typeof k==='string') indexPhotoKey(k); });
  PHOTO_INDEX.ready = true;
  return true;
}
async function probePhotoIndex(ids){
  const cand = (id)=>['photo_'+id+'_front','photo_product_'+id+'_front','photo_product_'+id+'_main','photo_'+id+'_back','photo_product_'+id+'_back'].concat(EXTRA_SLOTS.map(s=>'photo_'+id+'_'+s));
  for(const id of ids){
    for(const key of cand(id)){
      try{
        const tx = await idbTx(PHOTOS_STORE, 'readonly');
        const n = await new Promise((resolve,reject)=>{ const r = tx.objectStore(PHOTOS_STORE).count(key); r.onsuccess=()=>resolve(r.result); r.onerror=()=>reject(r.error); });
        if(n) indexPhotoKey(key);
      }catch(e){}
    }
  }
  PHOTO_INDEX.ready = true;
}
function hasPhoto(id, side){ return PHOTO_INDEX.ready ? PHOTO_INDEX[side||'front'].has(id) : false; }
function photoKeyFor(id, side){ return PHOTO_INDEX[side||'front'].get(id) || null; }
function productIdsWithPhoto(){ return new Set(PHOTO_INDEX.front.keys()); }
/* Todas las fotos de una pieza, en orden (delantera, trasera, extra 1…4) */
function photoSidesFor(id){ return PHOTO_SIDES.filter(s=>hasPhoto(id, s)); }
function extraSidesFor(id){ return EXTRA_SLOTS.filter(s=>hasPhoto(id, s)); }
function freeExtraSlot(id){ return EXTRA_SLOTS.find(s=>!hasPhoto(id, s)) || null; }
function photoSideLabel(side){
  if(side==='back') return t('photo.back');
  if(side==='front') return t('photo.front');
  return t('photo.extra_n').replace('{n}', String(side).replace('extra',''));
}

async function savePhotoFile(key, file){
  // v11.1.1: los errores se avisan con un aviso de la app (antes, alert() del navegador)
  // v11.4: si la foto no es cuadrada pasa antes por el editor; si lo cancelas, no se guarda nada
  try{
    const r = await photoDataFromFile(file);
    if(r.cancelled) return null;
    return await storePhotoData(key, r.dataUrl);
  }catch(err){ showToast(t('photo.read_failed') + ' ' + (err && err.message || ''), { replace:true, duration:6000 }); return null; }
}
async function storePhotoData(key, dataUrl){
  const ok = await idbSet(PHOTOS_STORE, key, dataUrl);
  if(!ok){ showToast(t('photo.save_failed'), { replace:true, duration:6000 }); return null; }
  indexPhotoKey(key);
  await invalidateThumb(key);
  return dataUrl;
}
async function removePhoto(key){
  await idbDelete(PHOTOS_STORE, key);
  await invalidateThumb(key);
  const info = parsePhotoKey(key);
  if(info && PHOTO_INDEX[info.side].get(info.id)===key){
    PHOTO_INDEX[info.side].delete(info.id);
    // si quedaba una clave antigua para la misma pieza, pasa a ser la visible
    (await idbGetKeys(PHOTOS_STORE)).forEach(k=>{ const i = typeof k==='string' && parsePhotoKey(k); if(i && i.id===info.id && i.side===info.side) indexPhotoKey(k); });
  }
}

async function loadMainFront(id){
  if(PHOTO_INDEX.ready){ const k = photoKeyFor(id,'front'); return k ? loadPhoto(k) : null; }
  return (await loadPhoto('photo_'+id+'_front')) || (await loadPhoto('photo_product_'+id+'_front')) || (await loadPhoto('photo_product_'+id+'_main'));
}
async function loadMainBack(id){
  if(PHOTO_INDEX.ready){ const k = photoKeyFor(id,'back'); return k ? loadPhoto(k) : null; }
  return (await loadPhoto('photo_'+id+'_back')) || (await loadPhoto('photo_product_'+id+'_back'));
}

/* ---------- Miniaturas (v11) ----------
   Las rejillas y listas ya no decodifican la foto completa (1200 px, hasta
   1 MB) de cada tarjeta: usan una miniatura de 480 px generada la primera
   vez que se ve. Se guardan en OTRA base de datos ('archivo_sergio_thumbs'),
   separada de la tuya: tus fotos originales no se tocan, las miniaturas no
   van en las copias de seguridad, se regeneran solas si faltan, y una
   versión anterior de la app simplemente no las ve. */
const THUMB_DB = 'archivo_sergio_thumbs';
const THUMB_SIZE = 480;
let _thumbDbPromise = null;
const _thumbURLs = new Map();      // clave de foto → objectURL
const _thumbPending = new Map();   // clave de foto → Promise<objectURL>
const _thumbGen = new Map();       // clave de foto → nº de cambios (si cambia, una miniatura en curso se descarta)
let _thumbEpoch = 0;               // sube al borrar todas las miniaturas
function thumbGen(key){ return _thumbEpoch * 1e6 + (_thumbGen.get(key) || 0); }
function openThumbDB(){
  if(_thumbDbPromise) return _thumbDbPromise;
  _thumbDbPromise = new Promise((resolve, reject)=>{
    if(!window.indexedDB){ reject(new Error('sin IndexedDB')); return; }
    const req = indexedDB.open(THUMB_DB, 1);
    req.onupgradeneeded = ()=>{ if(!req.result.objectStoreNames.contains('thumbs')) req.result.createObjectStore('thumbs'); };
    req.onsuccess = ()=>{ const db = req.result; db.onversionchange = ()=>{ try{db.close();}catch(e){} _thumbDbPromise=null; }; db.onclose = ()=>{ _thumbDbPromise=null; }; resolve(db); };
    req.onerror = ()=>{ _thumbDbPromise = null; reject(req.error); };
  });
  return _thumbDbPromise;
}
function thumbDbOp(mode, fn){
  return openThumbDB().then(db=>new Promise((resolve,reject)=>{
    const tx = db.transaction('thumbs', mode);
    const r = fn(tx.objectStore('thumbs'));
    tx.oncomplete = ()=>resolve(r && 'result' in r ? r.result : true);
    tx.onerror = ()=>reject(tx.error); tx.onabort = ()=>reject(tx.error || new Error('abort'));
  })).catch(()=>null);
}
/* Genera la miniatura. Si el navegador lo permite, la foto se decodifica y
   reduce fuera del hilo principal (createImageBitmap), así la app no se
   "atasca" la primera vez que se ven muchas fotos; si no, como siempre. Como
   mucho se generan 2 a la vez. */
let _thumbJobs = 0; const _thumbWaiters = [];
async function withThumbSlot(fn){
  if(_thumbJobs >= 2) await new Promise(r=>_thumbWaiters.push(r));
  _thumbJobs++;
  try{ return await fn(); }
  finally{ _thumbJobs--; const next = _thumbWaiters.shift(); if(next) next(); }
}
function drawThumb(src, sw, sh){
  const scale = Math.min(1, THUMB_SIZE / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw*scale)), h = Math.max(1, Math.round(sh*scale));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,w,h);
  ctx.imageSmoothingQuality = 'high'; ctx.drawImage(src, 0, 0, w, h);
  return new Promise(resolve=> c.toBlob(b=>resolve(b), 'image/jpeg', 0.84));
}
function makeThumbBlob(dataUrl){
  return (async ()=>{
    if(typeof createImageBitmap === 'function'){
      try{
        const blob = await (await fetch(dataUrl)).blob();
        // ancho fijo de 480 px; el alto se calcula solo (las fotos de la app son cuadradas)
        const small = await createImageBitmap(blob, { resizeWidth:THUMB_SIZE, resizeQuality:'high' });
        const out = await drawThumb(small, small.width, small.height);
        small.close && small.close();
        if(out) return out;
      }catch(e){ /* se intenta a la manera clásica */ }
    }
    return new Promise((resolve)=>{
      const img = new Image();
      img.onload = ()=>{ drawThumb(img, img.naturalWidth, img.naturalHeight).then(resolve, ()=>resolve(null)); };
      img.onerror = ()=>resolve(null);
      img.src = dataUrl;
    });
  })();
}
/* URL lista para <img src>: size 'thumb' (miniatura) o 'full' (foto completa).
   Cada miniatura guarda el tamaño de la foto de la que salió: si la foto
   cambia (o la cambió otra versión de la app), la miniatura se rehace. */
async function getPhotoURL(id, side, size, _retry){
  const key = photoKeyFor(id, side);
  if(!key) return null;
  if(size==='full'){
    const full = await loadPhoto(key);
    if(full) checkThumbFresh(key, full.length);
    return full;
  }
  if(_thumbURLs.has(key)) return _thumbURLs.get(key);
  if(_thumbPending.has(key)) return _thumbPending.get(key);
  const gen = thumbGen(key);
  const p = (async ()=>{
    const rec = await thumbDbOp('readonly', os=>os.get(key));
    let blob = rec instanceof Blob ? rec : (rec && rec.b instanceof Blob ? rec.b : null);
    if(!blob){
      const made = await withThumbSlot(async ()=>{
        if(thumbGen(key)!==gen) return { stale:true };
        const full = await loadPhoto(key);
        if(!full) return { none:true };
        const b = await makeThumbBlob(full);
        return { b, n: full.length, full };
      });
      if(made.none) return null;
      if(made.stale || thumbGen(key)!==gen) return { retry:true };
      if(!made.b) return made.full;                 // si no se puede reducir, se usa la original
      blob = made.b;
      thumbDbOp('readwrite', os=>os.put({ b:blob, n:made.n }, key));
    }
    if(thumbGen(key)!==gen) return { retry:true };
    const url = URL.createObjectURL(blob);
    _thumbURLs.set(key, url);
    return url;
  })();
  _thumbPending.set(key, p);
  let out;
  try{ out = await p; } finally { if(_thumbPending.get(key)===p) _thumbPending.delete(key); }
  if(out && out.retry) return _retry ? null : getPhotoURL(id, side, size, true);   // la foto cambió mientras tanto
  return out;
}
async function checkThumbFresh(key, len){
  const rec = await thumbDbOp('readonly', os=>os.get(key));
  if(rec && !(rec instanceof Blob) && rec.n !== len) await invalidateThumb(key);
}
async function invalidateThumb(key){
  _thumbGen.set(key, thumbGen(key) + 1);
  _thumbPending.delete(key);
  const url = _thumbURLs.get(key);
  if(url){ URL.revokeObjectURL(url); _thumbURLs.delete(key); }
  await thumbDbOp('readwrite', os=>os.delete(key));
}
async function clearAllThumbs(){
  _thumbEpoch++; _thumbPending.clear();
  _thumbURLs.forEach(u=>URL.revokeObjectURL(u)); _thumbURLs.clear();
  await thumbDbOp('readwrite', os=>os.clear());
}

/* ---------- Datos del dispositivo (v10.2) ----------
   Fecha de la última copia completa y de la última importación. Se guardan
   APARTE de la colección (kv 'app_meta'), así una importación no los borra
   y el formato de tus datos no cambia. */
let APP_META = {};
let appMetaReadFailed = false;
async function loadAppMeta(){
  const res = await readWithRetry(()=>idbGetStrict(KV_STORE, 'app_meta'), 2);
  if(!res.ok){ appMetaReadFailed = true; APP_META = {}; return; }
  try{ APP_META = res.value ? JSON.parse(res.value) : {}; }catch(e){ APP_META = {}; }
}
/* si no se pudo leer, no se sobrescribe (se perderían la fecha de la última copia y el "deshacer importación") */
async function saveAppMeta(){ if(appMetaReadFailed) return false; return idbSet(KV_STORE, 'app_meta', JSON.stringify(APP_META)); }

/* ---------- Almacenamiento persistente (v10.2) ----------
   Pide al navegador que no borre los datos de la app aunque el móvil se
   quede sin espacio. En Chrome/Android se concede sin preguntar a las apps
   instaladas o muy usadas; si no se concede, se explica en Copia de
   seguridad y se puede volver a pedir. */
let storageState = { status:'unknown', usageMB:null };
async function refreshStorageState(requestIfNeeded){
  try{
    if(!navigator.storage || !navigator.storage.persisted){ storageState.status = 'unsupported'; }
    else {
      let granted = await navigator.storage.persisted();
      if(!granted && requestIfNeeded && navigator.storage.persist) granted = await navigator.storage.persist();
      storageState.status = granted ? 'granted' : 'denied';
    }
    if(navigator.storage && navigator.storage.estimate){
      const e = await navigator.storage.estimate();
      storageState.usageMB = Math.round((e.usage||0)/104857.6)/10;
    }
  }catch(e){ storageState.status = 'unsupported'; }
  return storageState;
}
