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
function isSquareImage(w, h){ return Math.abs(w - h) <= Math.max(w, h) * 0.01; }
/* Lo de siempre, sin editor: la foto entera sobre fondo blanco */
async function compressImage(file){
  const { img, url } = await decodeImageFile(file);
  try{ return squarePhotoDataURL(img, img.naturalWidth, img.naturalHeight, 0, null, 0); }
  finally{ URL.revokeObjectURL(url); }
}
/* v11.4: cuadrada → directa; si no, editor. Devuelve { dataUrl } o { cancelled:true } */
async function photoDataFromFile(file){
  const { img, url } = await decodeImageFile(file);
  try{
    const w = img.naturalWidth, h = img.naturalHeight;
    if(!isSquareImage(w, h) && typeof openPhotoEditor === 'function'){
      const out = await openPhotoEditor({ source: img });
      return out ? { dataUrl: out } : { cancelled: true };
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
