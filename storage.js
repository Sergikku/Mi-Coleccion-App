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
