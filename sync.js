/* La Colección App — sync.js (v11.9.0)
   Cuenta y sincronización con Supabase: la misma colección en el móvil y en
   el PC. Todo va por la API REST de Supabase (sin librerías extra).

   Cómo funciona, en corto:
   - Tu colección sigue viviendo en este dispositivo como siempre (IndexedDB,
     kv 'overrides' y el almacén 'fotos'): la app funciona igual sin conexión
     y sin cuenta. Este archivo NO cambia ese formato.
   - En la nube, cada «cosa» es una fila de la tabla 'coleccion': cada pieza
     ('l:customProducts/<id>'), sus datos ('d:products/<id>'), cada carpeta,
     categoría, plataforma y ajuste de la colección, y una fila por foto
     ('f:<clave de la foto>'). Las fotos van en el almacén privado 'fotos',
     dentro de la carpeta de tu cuenta; cada versión de una foto va en su
     propio archivo (así nunca se baja una versión vieja de una caché).
   - Solo tu cuenta puede leer o tocar sus filas y fotos (reglas RLS en
     Supabase). Aquí solo está la clave pública del proyecto.
   - Lo que hace falta para sincronizar (sesión, qué se subió ya, cambios
     pendientes) se guarda APARTE: kv 'sync_auth', 'sync_meta' y 'sync_marks'.
     No va en las copias de seguridad.
   - Si una misma cosa se cambia en dos dispositivos antes de sincronizar, se
     queda el cambio más reciente y se avisa.
   - Con dos ventanas de la app abiertas a la vez, cada una se pone al día con
     lo que guarda la otra (antes se podían pisar).
   - El tema claro/oscuro es de cada dispositivo (no se sincroniza). */

const SYNC_URL = 'https://tdlxjrvydlecpclbuiya.supabase.co';
const SYNC_KEY = 'sb_publishable_3s5S8oULxmpQfsk5HL6EUA_Co480bCN';   // clave pública (publishable): no da acceso a nada sin tu sesión
const SYNC_PROJECT_URL = 'https://supabase.com/dashboard/project/tdlxjrvydlecpclbuiya';
const SYNC_TABLE = 'coleccion';
const SYNC_BUCKET = 'fotos';
const SYNC_STORAGE_LIMIT = 1024 * 1024 * 1024;   // 1 GB de fotos en el plan gratuito
// Forma de cada parte de tu colección en la nube
const SYNC_DICT = ['products','editions','folders','categoryChecklist','platformFlags','categoryFlags','categoryOrder','platformNames','categoryNames'];
const SYNC_LIST = ['customProducts','customCategories','customPlatforms'];
const SYNC_LOCAL = ['seedEnabled','theme','tourSeen'];   // de cada dispositivo
const SYNC_DEL = '-';                 // marca de «borrado»
const SYNC_GONE = 'x';                // la nube tiene la fila de una foto pero no su archivo
const SYNC_OVERLAP_MS = 120000;       // margen al pedir cambios a la nube
const SYNC_GUARD_PIECES = 10;         // a partir de aquí, quitar piezas de la nube se pregunta antes
const SYNC_GUARD_PHOTOS = 30;
const SYNC_CHUNK = 200;               // filas por envío
const SYNC_PAGE = 1000;               // filas por página al leer

const SYNC = {
  ready:false, auth:null, meta:null, status:'off', busy:false, again:false, timer:null,
  epoch:0, runEpoch:-1, retryAt:0, failures:0, lastError:'', lastRunAt:0,
  gen:0, cache:{ gen:-1 }, lastRaw:null,
  progress:null, bigNext:null, bigUnits:0, choice:null, pendingChoice:null, removal:null, presync:null,
  loginError:'', loginBusy:false, applying:false,
  localPhotoKeys:new Set(), pendingRender:false, renderTimer:null, saveAt:0, rowHtml:'',
  markQueue:{}, markTimer:null, localTimer:null, foreignTimer:null, bc:null, foreignPending:false,
  metaEdits:[], merged:false, choiceCopied:null,
};
// aviso entre ventanas de la app: se abre ya, para no perder nada mientras arranca
try{ if(typeof BroadcastChannel==='function'){ SYNC.bc = new BroadcastChannel('coleccion-app-sync'); SYNC.bc.onmessage = (ev)=> syncOnMessage(ev); } }catch(e){ SYNC.bc = null; }

/* ---------- Utilidades ---------- */
function syncErr(kind, msg, status){ const e = new Error(msg || kind); e.kind = kind; e.status = status || 0; return e; }
function syncTs(s){ if(typeof s==='number') return s; const n = Date.parse(String(s||'').replace(/(\.\d{3})\d+/, '$1')); return isNaN(n) ? 0 : n; }
function syncIso(ms){ return new Date(ms).toISOString(); }
function syncIsObj(v){ return !!v && typeof v==='object' && !Array.isArray(v); }
/* Texto que la base de datos acepta: sin el carácter nulo ni medios emojis sueltos */
function syncCleanStr(s){
  if(!/[\u0000\ud800-\udfff]/.test(s)) return s;
  return s.replace(/[\ud800-\udbff][\udc00-\udfff]|[\ud800-\udfff]|\u0000/g, m=> m.length===2 ? m : (m==='\u0000' ? '' : '\ufffd'));
}
/* JSON con las claves ordenadas: el mismo contenido da siempre el mismo texto */
function syncStable(v){
  if(v===null || v===undefined) return 'null';
  if(typeof v==='string') return JSON.stringify(syncCleanStr(v));
  if(typeof v!=='object') return (typeof v==='number' && !isFinite(v)) ? 'null' : (typeof v==='function' ? 'null' : JSON.stringify(v));
  if(Array.isArray(v)) return '[' + v.map(x=> (x===undefined || typeof x==='function') ? 'null' : syncStable(x)).join(',') + ']';
  const ks = Object.keys(v).filter(k=> v[k]!==undefined && typeof v[k]!=='function').sort();
  return '{' + ks.map(k=> JSON.stringify(syncCleanStr(k)) + ':' + syncStable(v[k])).join(',') + '}';
}
function syncHash(str){
  let h1 = 0xdeadbeef ^ str.length, h2 = 0x41c6ce57 ^ str.length;
  for(let i=0;i<str.length;i++){ const ch = str.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
  h1 = Math.imul(h1 ^ (h1>>>16), 2246822507) ^ Math.imul(h2 ^ (h2>>>13), 3266489909);
  h2 = Math.imul(h2 ^ (h2>>>16), 2246822507) ^ Math.imul(h1 ^ (h1>>>13), 3266489909);
  return (h2>>>0).toString(36) + '.' + (h1>>>0).toString(36) + '.' + str.length.toString(36);
}
async function syncPool(items, n, fn){
  let i = 0, err = null;
  const worker = async ()=>{ while(!err && i < items.length){ const it = items[i++]; try{ await fn(it); }catch(e){ err = err || e; } } };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  if(err) throw err;
}
function syncCountPieces(O){
  const list = Array.isArray(O.customProducts) ? O.customProducts : [];
  return list.filter(cp=> cp && !(O.products && O.products[cp.id] && O.products[cp.id].deleted)).length;
}
function syncLive(b){ return !!b && typeof b[0]==='number' && b[0] >= 0; }   // foto que está en la nube

/* ---------- Tu colección, en partes ---------- */
function syncUnits(O){
  const m = new Map();
  Object.keys(O).forEach(top=>{
    if(SYNC_LOCAL.includes(top)) return;
    const v = O[top];
    if(v===undefined || typeof v==='function') return;
    if(SYNC_DICT.includes(top) && syncIsObj(v)){ Object.keys(v).forEach(k=>{ if(v[k]!==undefined) m.set('d:' + top + '/' + k, v[k]); }); return; }
    if(SYNC_LIST.includes(top) && Array.isArray(v)){
      // cada elemento con su id; uno raro (sin id o repetido) se queda solo aquí, sin afectar al resto
      const ids = [], seen = new Set();
      v.forEach(x=>{ if(syncIsObj(x) && typeof x.id==='string' && x.id && !seen.has(x.id)){ seen.add(x.id); ids.push(x.id); m.set('l:' + top + '/' + x.id, x); } });
      m.set('o:' + top, ids);
      return;
    }
    m.set('v:' + top, v);
  });
  return m;
}
function syncLocalUnits(){
  if(SYNC.cache.gen===SYNC.gen && SYNC.cache.units) return SYNC.cache;
  const units = syncUnits(OVERRIDES), hashes = new Map();
  units.forEach((v,k)=> hashes.set(k, syncHash(syncStable(v))));
  SYNC.cache = { gen:SYNC.gen, units, hashes };
  return SYNC.cache;
}
/* Compara tu colección con lo último que se sincronizó y apunta los cambios (con su hora) */
function syncDetect(now){
  const M = SYNC.meta;
  const { units, hashes } = syncLocalUnits();
  hashes.forEach((h,k)=>{
    const b = M.base[k], d = M.dirty[k];
    if(b && b[0]===h){ if(d) delete M.dirty[k]; return; }
    if(!d) M.dirty[k] = [now, h]; else if(d[1]!==h){ d[0] = now; d[1] = h; }
  });
  Object.keys(M.base).forEach(k=>{
    if(hashes.has(k)) return;
    const b = M.base[k], d = M.dirty[k];
    if(b[0]===SYNC_DEL){ if(d) delete M.dirty[k]; return; }
    if(!d) M.dirty[k] = [now, SYNC_DEL]; else if(d[1]!==SYNC_DEL){ d[0] = now; d[1] = SYNC_DEL; }
  });
  Object.keys(M.dirty).forEach(k=>{ if(!hashes.has(k) && !M.base[k]) delete M.dirty[k]; });
  return { units, hashes };
}
async function syncDetectPhotos(now){
  const M = SYNC.meta;
  let keys;
  try{ keys = await idbGetKeysStrict(PHOTOS_STORE); }catch(e){ throw syncErr('local', 'photo keys'); }
  const local = new Set(keys.filter(k=> typeof k==='string' && parsePhotoKey(k)));
  SYNC.localPhotoKeys = local;
  const gone = (b)=> !!b && b[0]===SYNC_GONE;
  // foto aquí que la nube no tiene → se sube
  local.forEach(k=>{ const b = M.pbase[k]; if(!syncLive(b) && !gone(b) && M.pdirty[k]===undefined && !M.pdown[k]) M.pdirty[k] = now; });
  // la nube tiene su fila pero le falta el archivo: solo se repone si aquí está esa MISMA
  // versión, y con su hora de entonces (nunca como un cambio nuevo que pise otro más reciente)
  for(const k of local){
    const b = M.pbase[k];
    if(!gone(b) || M.pdirty[k]!==undefined || M.pdown[k] || !(b[3] > 0)) continue;
    let v; try{ v = await idbGetStrict(PHOTOS_STORE, k); }catch(e){ throw syncErr('local', 'photo read'); }
    if(typeof v==='string' && v.length===b[3]) M.pdirty[k] = b[1];
  }
  // foto que estaba sincronizada y ya no está aquí → se quitó aquí
  Object.keys(M.pbase).forEach(k=>{ if(syncLive(M.pbase[k]) && !local.has(k) && M.pdirty[k]===undefined && !M.pdown[k]) M.pdirty[k] = now; });
  // (lo que no está aquí ni en la nube no se sube; si tú la quitaste y en la nube falta el archivo, sí se apunta)
  Object.keys(M.pdirty).forEach(k=>{ if(!local.has(k) && !syncLive(M.pbase[k]) && !gone(M.pbase[k])) delete M.pdirty[k]; });
}
function syncRejectedNow(M){
  return Object.keys(M.rejected || {}).filter(k=> k.startsWith('f:') ? M.pdirty[k.slice(2)]===M.rejected[k] : (M.dirty[k] && M.dirty[k][1]===M.rejected[k]));
}
function syncPendingCount(){
  const M = SYNC.meta; if(!M) return 0;
  return Math.max(0, Object.keys(M.dirty).length + Object.keys(M.pdirty).length - syncRejectedNow(M).length);
}

/* Aplicar una parte que llega de la nube (v===undefined → se quitó) */
function syncApplyUnit(O, k, v){
  const kind = k[0], rest = k.slice(2);
  if(kind==='v'){
    if(v===undefined){ if(!SYNC_DICT.includes(rest) && !SYNC_LIST.includes(rest)) delete O[rest]; }
    else if(!SYNC_LOCAL.includes(rest)) O[rest] = v;
    return;
  }
  const i = rest.indexOf('/'); if(i<0) return;
  const top = rest.slice(0, i), id = rest.slice(i + 1);
  if(kind==='d'){
    if(!syncIsObj(O[top])){ if(v===undefined) return; O[top] = {}; }
    if(v===undefined) delete O[top][id]; else O[top][id] = v;
  } else if(kind==='l'){
    if(!Array.isArray(O[top])){ if(v===undefined) return; O[top] = []; }
    const arr = O[top], j = arr.findIndex(x=> x && x.id===id);
    if(v===undefined){ if(j>=0) arr.splice(j, 1); }
    else if(j>=0) arr[j] = v; else arr.push(v);
  }
}
/* El orden de una lista se mezcla: primero el de la nube y detrás lo que solo está aquí */
function syncApplyOrder(O, top, order){
  const arr = O[top];
  if(!Array.isArray(arr) || !Array.isArray(order)) return;
  const pos = new Map(); order.forEach((id, i)=>{ if(!pos.has(id)) pos.set(id, i); });
  const has = (x)=> syncIsObj(x) && pos.has(x.id);
  const inOrder = arr.filter(has).sort((a,b)=> pos.get(a.id) - pos.get(b.id));
  O[top] = inOrder.concat(arr.filter(x=> !has(x)));
}

/* ---------- Estado guardado en este dispositivo ---------- */
function syncNewMeta(uid){ return { v:1, uid, bound:false, cursor:null, base:{}, dirty:{}, pbase:{}, pdirty:{}, pdown:{}, rejected:{}, trash:[], lastOk:0, notices:[], paused:false, allowRemovalsAt:0 }; }
function syncNormMeta(m){
  ['base','dirty','pbase','pdirty','pdown','rejected'].forEach(k=>{ if(!syncIsObj(m[k])) m[k] = {}; });
  if(!Array.isArray(m.notices)) m.notices = [];
  if(!Array.isArray(m.trash)) m.trash = [];
  if(typeof m.allowRemovalsAt!=='number') m.allowRemovalsAt = 0;
  return m;
}
async function syncReadKV(key){
  const r = await readWithRetry(()=>idbGetStrict(KV_STORE, key), 3);
  if(!r.ok) return { ok:false };
  let val = null; try{ val = r.value ? JSON.parse(r.value) : null; }catch(e){ val = null; }
  return { ok:true, value:val };
}
async function syncSaveMeta(){
  if(!SYNC.meta) return true;
  SYNC.saveAt = Date.now();
  return idbSet(KV_STORE, 'sync_meta', JSON.stringify(SYNC.meta));
}
function syncSaveMetaSoon(){ if(Date.now() - SYNC.saveAt > 2500) return syncSaveMeta(); }
/* Cambiar el estado guardado desde la pantalla (sin pisar lo que haya escrito otra ventana) */
async function syncEditMeta(fn){
  SYNC.metaEdits.push(fn);      // si empieza una pasada mientras tanto, la aplica al leer el estado
  if(!SYNC.busy){
    const m = await syncReadKV('sync_meta');
    if(!SYNC.busy && m.ok && m.value && m.value.v===1 && (!SYNC.meta || m.value.uid===SYNC.meta.uid)) SYNC.meta = syncNormMeta(m.value);
  }
  if(!SYNC.meta) return false;
  fn(SYNC.meta);
  const ok = await syncSaveMeta();
  if(!SYNC.busy) SYNC.metaEdits = [];
  return ok;
}
async function syncSaveAuth(){ return SYNC.auth ? idbSet(KV_STORE, 'sync_auth', JSON.stringify(SYNC.auth)) : idbDelete(KV_STORE, 'sync_auth'); }
/* Cambios de fotos apuntados por la app (guardar, quitar, importar). Van en su
   propia clave y en una sola transacción (se juntan los de golpe, p. ej. al importar). */
function syncQueueMark(key, ts){
  SYNC.markQueue[key] = ts;
  clearTimeout(SYNC.markTimer);
  SYNC.markTimer = setTimeout(syncFlushMarks, 80);
}
function syncFlushMarks(){
  const q = SYNC.markQueue; SYNC.markQueue = {};
  const keys = Object.keys(q); if(!keys.length) return Promise.resolve(true);
  return idbTx(KV_STORE, 'readwrite').then(tx=>new Promise(resolve=>{
    const os = tx.objectStore(KV_STORE), r = os.get('sync_marks');
    r.onsuccess = ()=>{ let m = {}; try{ m = r.result ? JSON.parse(r.result) : {}; }catch(e){} keys.forEach(k=>{ m[k] = q[k]; }); os.put(JSON.stringify(m), 'sync_marks'); };
    tx.oncomplete = ()=>resolve(true); tx.onerror = ()=>resolve(false); tx.onabort = ()=>resolve(false);
  })).catch(()=>false);
}
async function syncMergeMarks(){
  await syncFlushMarks();
  const r = await syncReadKV('sync_marks');
  const marks = (r.ok && syncIsObj(r.value)) ? r.value : {};
  const M = SYNC.meta;
  Object.keys(marks).forEach(k=>{
    const ts = Number(marks[k]) || Date.now();
    if(!parsePhotoKey(k)) return;
    if(M.pdown[k] && M.pdown[k][0] > ts) return;          // la nube tiene una versión más nueva: gana esa
    delete M.pdown[k];
    if(M.pdirty[k]===undefined || M.pdirty[k] < ts) M.pdirty[k] = ts;
  });
  return marks;
}
function syncClearMarks(taken){
  const keys = Object.keys(taken || {}); if(!keys.length) return Promise.resolve(true);
  return idbTx(KV_STORE, 'readwrite').then(tx=>new Promise(resolve=>{
    const os = tx.objectStore(KV_STORE), r = os.get('sync_marks');
    r.onsuccess = ()=>{ let m = {}; try{ m = r.result ? JSON.parse(r.result) : {}; }catch(e){}
      keys.forEach(k=>{ if(m[k]===taken[k]) delete m[k]; });
      if(Object.keys(m).length) os.put(JSON.stringify(m), 'sync_marks'); else os.delete('sync_marks'); };
    tx.oncomplete = ()=>resolve(true); tx.onerror = ()=>resolve(false); tx.onabort = ()=>resolve(false);
  })).catch(()=>false);
}

/* ---------- Avisos desde el resto de la app ---------- */
/* persistOverrides() → cada vez que se guarda tu colección */
function syncNoteSaved(ok, json){
  SYNC.gen++;
  if(!ok) return;
  if(typeof json==='string') SYNC.lastRaw = json;
  if(SYNC.merged){
    SYNC.merged = false;
    if(typeof refreshChromeSettings==='function') refreshChromeSettings();
    buildProducts(); SYNC.pendingRender = true; setTimeout(()=>syncRefreshView(false), 0);
  }
  if(SYNC.bc) try{ SYNC.bc.postMessage({ t:'saved' }); }catch(e){}
  if(SYNC.applying) return;
  if(SYNC.auth && !SYNC.auth.expired) syncSchedule(2000);
  else if(SYNC.meta){
    // sin sesión: se apunta igualmente la hora de cada cambio (para cuando vuelvas a entrar)
    clearTimeout(SYNC.localTimer);
    SYNC.localTimer = setTimeout(async ()=>{
      if(SYNC.busy || !SYNC.meta || storageReadFailed || unreadableDataOnLoad || (SYNC.auth && !SYNC.auth.expired)) return;
      await syncEditMeta(()=>{ syncDetect(Date.now()); });
    }, 2000);
  }
}
/* ensureOverridesLoaded() → lo que esta ventana leyó al arrancar (referencia para notar lo que guarde otra) */
function syncNoteLoaded(raw){ if(typeof raw==='string') SYNC.lastRaw = raw; }
/* storePhotoData / removePhoto / importar fotos → cada foto que cambia */
function syncNotePhoto(key){
  if(!parsePhotoKey(key) || !SYNC.meta) return;
  const now = Date.now();
  // al momento, para que una descarga en curso no la pise
  SYNC.meta.pdirty[key] = now; delete SYNC.meta.pdown[key];
  syncQueueMark(key, now);
  if(SYNC.auth && !SYNC.auth.expired) syncSchedule(2000);
}

/* ---------- Otra ventana de la app abierta ---------- */
/* Junta, parte a parte, lo que cambió esta ventana (desde lo último que leyó o
   guardó) con lo que guardó la otra: de lo que solo cambió una se queda ese
   cambio; si las dos cambiaron lo mismo, el de esta (es el que acabas de hacer). */
function syncMerge3(baseRaw, mine, theirsRaw){
  const base = baseRaw ? JSON.parse(baseRaw) : {};
  const out = JSON.parse(theirsRaw);
  const B = syncUnits(base), Mi = syncUnits(mine), T = syncUnits(out);
  const h = (map, k)=> map.has(k) ? syncHash(syncStable(map.get(k))) : SYNC_DEL;
  const orders = [];
  new Set([...B.keys(), ...Mi.keys(), ...T.keys()]).forEach(k=>{
    if(h(Mi, k)===h(B, k)) return;                       // esta ventana no lo tocó: se queda el de la otra
    if(k.startsWith('o:')){ if(Mi.has(k)) orders.push([k.slice(2), Mi.get(k)]); return; }
    syncApplyUnit(out, k, Mi.has(k) ? JSON.parse(JSON.stringify(Mi.get(k))) : undefined);
  });
  orders.forEach(([top, ord])=> syncApplyOrder(out, top, ord));
  SYNC_LOCAL.forEach(k=>{ if(syncStable(mine[k])!==syncStable(base[k])){ if(mine[k]===undefined) delete out[k]; else out[k] = mine[k]; } });
  return out;
}
/* Guardar tu colección (lo llama persistOverrides). Lee y escribe en la misma
   transacción: si otra ventana guardó desde la última vez, se juntan los cambios
   en vez de pisar los suyos. Devuelve el texto guardado, o null si no se pudo. */
function syncCasWrite(){
  return idbTx(KV_STORE, 'readwrite').then(tx=>new Promise(resolve=>{
    const os = tx.objectStore(KV_STORE);
    let out = null;
    const r = os.get('overrides');
    r.onsuccess = ()=>{
      const cur = r.result;
      if(typeof cur==='string' && cur!==SYNC.lastRaw && (SYNC.lastRaw!==null || cur.length > 2)){
        try{ OVERRIDES = syncMerge3(SYNC.lastRaw, OVERRIDES, cur); SYNC.merged = true; SYNC.cache.gen = -1; }catch(e){ /* si no se puede juntar, se guarda lo de esta ventana, como siempre */ }
      }
      out = JSON.stringify(OVERRIDES);
      os.put(out, 'overrides');
    };
    tx.oncomplete = ()=>resolve(out);
    tx.onerror = ()=>resolve(null); tx.onabort = ()=>resolve(null);
  })).catch(()=>null);
}
/* Si otra ventana guardó la colección, esta se pone al día antes de comparar o
   guardar nada (si no, subiría su copia vieja). Devuelve false si ahora mismo
   esta ventana tiene algo a medio guardar (se vuelve a intentar enseguida). */
async function syncAdoptForeign(){
  if(storageReadFailed || unreadableDataOnLoad) return true;
  const before = SYNC.lastRaw;
  let raw;
  try{ raw = await idbGetStrict(KV_STORE, 'overrides'); }catch(e){ return false; }
  if(SYNC.lastRaw!==before) return false;        // esta ventana acaba de guardar: se mira otra vez enseguida
  if(typeof raw!=='string' || raw===SYNC.lastRaw) return true;
  // ¿esta ventana tiene algo sin guardar? se guarda juntándolo con lo de la otra
  if(SYNC.lastRaw!==null && JSON.stringify(OVERRIDES)!==SYNC.lastRaw) return await persistOverrides();
  let O; try{ O = JSON.parse(raw); }catch(e){ return false; }
  OVERRIDES = O; SYNC.lastRaw = raw; SYNC.gen++; SYNC.cache.gen = -1;
  if(typeof refreshChromeSettings==='function') refreshChromeSettings();
  buildProducts();
  try{ await loadPhotoIndex(); }catch(e){}
  SYNC.pendingRender = true;
  syncRefreshView(false);
  return true;
}
function syncOnMessage(ev){
  const d = ev && ev.data; if(!d) return;
  if(!SYNC.ready){ if(d.t==='saved') SYNC.foreignPending = true; return; }
  if(d.t==='saved'){
    clearTimeout(SYNC.foreignTimer);
    const tryAdopt = async (n)=>{ if(!(await syncAdoptForeign()) && n < 20) SYNC.foreignTimer = setTimeout(()=>tryAdopt(n+1), 500); };
    SYNC.foreignTimer = setTimeout(()=>tryAdopt(0), 200);
  } else if(d.t==='signout'){
    if(SYNC.auth){ SYNC.epoch++; SYNC.auth = null; SYNC.choice = null; SYNC.progress = null; SYNC.removal = null; syncSetStatus('off'); }
  } else if(d.t==='signin'){
    syncReadKV('sync_auth').then(a=>{
      if(!a.ok || !a.value || !a.value.user) return;
      SYNC.epoch++; SYNC.auth = a.value; SYNC.retryAt = 0; SYNC.failures = 0;
      syncSetStatus(navigator.onLine ? 'syncing' : 'offline');
      syncSchedule(3000);
    });
  }
}
function syncBroadcast(t){ if(SYNC.bc) try{ SYNC.bc.postMessage({ t }); }catch(e){} }

/* ---------- Conexión con Supabase ---------- */
async function syncRawFetch(path, opts){
  opts = opts || {};
  const ctl = typeof AbortController==='function' ? new AbortController() : null;
  const timer = ctl ? setTimeout(()=>ctl.abort(), opts.timeout || 30000) : null;
  try{
    const res = await fetch(SYNC_URL + path, { method: opts.method || 'GET', headers: Object.assign({ apikey: SYNC_KEY }, opts.headers || {}),
      body: opts.body, cache:'no-store', credentials:'omit', signal: ctl ? ctl.signal : undefined });
    let data = null;
    if(res.ok){
      if(opts.read==='json') data = await res.json();
      else if(opts.read==='blob') data = await res.blob();
    } else {
      try{ data = await res.text(); }catch(e){ data = ''; }
    }
    return { res, data };
  } finally { if(timer) clearTimeout(timer); }
}
function syncAuthFrom(j, fallbackUser){
  const user = (j && j.user && j.user.id) ? { id:j.user.id, email:j.user.email || (fallbackUser && fallbackUser.email) || '' } : fallbackUser;
  const exp = j.expires_at ? Number(j.expires_at) : Math.floor(Date.now()/1000) + (Number(j.expires_in) || 3600);
  return { access_token:j.access_token, refresh_token:j.refresh_token, expires_at:exp, user };
}
async function syncExpire(){
  if(!SYNC.auth) return;
  SYNC.auth = { user:SYNC.auth.user, expired:true };
  await syncSaveAuth();
}
let _syncRefreshing = null;
function syncRefresh(){
  if(_syncRefreshing) return _syncRefreshing;
  const run = async ()=>{
    const mine = SYNC.auth;
    if(!mine || mine.expired) throw syncErr('session');
    const st = await syncReadKV('sync_auth');
    if(!st.ok) throw syncErr('local', 'auth read');
    const saved = st.value;
    // se cerró la sesión en otra ventana
    if(!saved || !saved.user || saved.user.id!==mine.user.id){ if(SYNC.auth===mine){ SYNC.epoch++; SYNC.auth = null; } throw syncErr('stopped'); }
    if(saved.expired){ if(SYNC.auth===mine) SYNC.auth = saved; throw syncErr('session'); }
    // otra ventana ya la renovó
    if(saved.access_token!==mine.access_token && saved.expires_at*1000 - Date.now() > 60000){ if(SYNC.auth===mine) SYNC.auth = saved; return; }
    let r;
    const cur = (saved.refresh_token && (saved.expires_at || 0) >= (mine.expires_at || 0)) ? saved : mine;
    try{ r = await syncRawFetch('/auth/v1/token?grant_type=refresh_token', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ refresh_token: cur.refresh_token }), read:'json' }); }
    catch(e){ throw syncErr('net', e && e.message); }
    if(SYNC.auth!==mine) throw syncErr('stopped');          // se cerró la sesión mientras tanto
    if(r.res.status===540) throw syncErr('paused');
    if(!r.res.ok){
      const txt = String(r.data || '');
      // solo si Supabase dice que la sesión ya no vale; cualquier otro fallo se reintenta
      if([400, 401, 403].includes(r.res.status) && /refresh.?token|session_|user_not_found|user_banned|invalid_grant|bad_jwt/i.test(txt)){ await syncExpire(); throw syncErr('session'); }
      throw syncErr('server', 'auth ' + r.res.status, r.res.status);
    }
    SYNC.auth = syncAuthFrom(r.data, mine.user);
    await syncSaveAuth();
  };
  _syncRefreshing = (async ()=>{
    if(navigator.locks && navigator.locks.request) await navigator.locks.request('coleccion-app-auth', run); else await run();
  })().finally(()=>{ _syncRefreshing = null; });
  return _syncRefreshing;
}
async function syncToken(){
  const a = SYNC.auth;
  if(!a || a.expired) throw syncErr('session');
  if(a.expires_at*1000 - Date.now() > 60000) return a.access_token;
  await syncRefresh();
  if(!SYNC.auth || SYNC.auth.expired) throw syncErr('session');
  return SYNC.auth.access_token;
}
/* Petición con tu sesión. Devuelve los datos; si falla, lanza un error con su tipo. */
async function syncFetch(path, opts){
  opts = opts || {};
  if(SYNC.busy && SYNC.runEpoch!==SYNC.epoch) throw syncErr('stopped');   // se cerró o cambió la sesión
  const tok = await syncToken();
  let r;
  try{ r = await syncRawFetch(path, Object.assign({}, opts, { headers: Object.assign({ Authorization:'Bearer ' + tok }, opts.headers || {}) })); }
  catch(e){ throw syncErr('net', e && e.message); }
  const st = r.res.status, txt = r.res.ok ? '' : String(r.data || '');
  const expiredJwt = st===401 || (st===400 && /jwt.{0,20}expired|exp.{0,10}claim/i.test(txt)) || (st===403 && /jwt.{0,20}expired/i.test(txt));
  if(expiredJwt && !opts._retry){
    if(SYNC.auth && SYNC.auth.access_token===tok) SYNC.auth.expires_at = 0;
    await syncRefresh();
    return syncFetch(path, Object.assign({}, opts, { _retry:true }));
  }
  if(st===540) throw syncErr('paused');
  if(!r.res.ok) throw syncErr(st>=500 ? 'server' : 'http', st + ' ' + txt.slice(0, 240), st);
  return r.data;
}
/* «No existe» del almacén (según la versión, 404 o 400 con statusCode 404) */
function syncNotFound(e){ return !!e && (e.status===404 || (e.status===400 && /"statusCode"\s*:\s*"404"|object not found/i.test(e.message || ''))); }

/* Filas de la tabla, por páginas (siguiendo la última fila vista: no se salta ninguna aunque cambien mientras se leen) */
function syncQ(v){ return '"' + String(v).replace(/\\/g,'\\\\').replace(/"/g,'\\"') + '"'; }
async function syncListRows(since, select){
  const out = [], uid = SYNC.auth.user.id;
  let last = null;
  for(let guard=0; guard<10000; guard++){
    let q = 'select=' + select + '&user_id=eq.' + encodeURIComponent(uid) + '&order=actualizado.asc,clave.asc&limit=' + SYNC_PAGE;
    if(since) q += '&actualizado=gte.' + encodeURIComponent(since);
    if(last) q += '&or=' + encodeURIComponent('(actualizado.gt.' + syncQ(last.a) + ',and(actualizado.eq.' + syncQ(last.a) + ',clave.gt.' + syncQ(last.c) + '))');
    const rows = await syncFetch('/rest/v1/' + SYNC_TABLE + '?' + q, { read:'json' });
    if(!rows.length) break;
    out.push(...rows);
    const r = rows[rows.length - 1]; last = { a:r.actualizado, c:r.clave };
  }
  return out;
}
function syncInList(keys){ return '(' + keys.map(syncQ).join(',') + ')'; }
async function syncFetchFull(light, since){
  const uid = SYNC.auth.user.id;
  const need = new Set(light.map(r=>r.clave));
  if(need.size > 300){
    const all = await syncListRows(since, 'clave,valor,borrado,cambiado,actualizado');
    return all.filter(r=> need.has(r.clave));
  }
  const out = [], keys = [...need];
  for(let i=0;i<keys.length;i+=60){
    const q = 'select=clave,valor,borrado,cambiado,actualizado&user_id=eq.' + encodeURIComponent(uid) + '&clave=in.' + encodeURIComponent(syncInList(keys.slice(i, i+60)));
    out.push(...await syncFetch('/rest/v1/' + SYNC_TABLE + '?' + q, { read:'json' }));
  }
  return out;
}
/* Envía filas. Si el servidor rechaza alguna por su contenido (dato no válido, demasiado
   grande), se prueban de una en una y se devuelve cuáles entraron. Cualquier otro fallo
   (conexión, permisos, servidor) se lanza para reintentarlo más tarde. */
async function syncUpsert(rows){
  try{
    await syncFetch('/rest/v1/' + SYNC_TABLE, { method:'POST', headers:{ 'Content-Type':'application/json', Prefer:'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(rows) });
    return rows.map(()=>true);
  }catch(e){
    const bad = e.kind==='http' && (e.status===413 || (e.status===400 && /"code"\s*:\s*"22/.test(e.message || '')));
    if(!bad) throw e;
    if(rows.length===1) return [false];
    const ok = [];
    for(const row of rows) ok.push((await syncUpsert([row]))[0]);
    return ok;
  }
}
/* Fotos en el almacén privado: <tu cuenta>/<clave de la foto>/<hora del cambio> (un archivo por versión) */
function syncObjName(key){ return String(key).replace(/[^A-Za-z0-9._-]/g, c=> '_u' + c.charCodeAt(0).toString(16).padStart(4,'0') + '_'); }
function syncObjRel(key, at){ return syncObjName(key) + '/' + at; }
function syncObjUrl(rel){ return '/' + SYNC_BUCKET + '/' + SYNC.auth.user.id + '/' + rel; }
function syncParseDataUrl(dataUrl){
  const m = /^data:([^;,]+)(;base64)?,([\s\S]*)$/.exec(dataUrl || '');
  if(!m) return null;
  let bytes;
  try{
    if(m[2]){ const bin = atob(m[3]); bytes = new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) bytes[i] = bin.charCodeAt(i); }
    else bytes = new TextEncoder().encode(decodeURIComponent(m[3]));
  }catch(e){ return null; }
  return { mime:m[1], bytes };
}
function syncBlobToDataUrl(blob, mime){
  return new Promise((resolve, reject)=>{
    const fr = new FileReader();
    fr.onload = ()=>resolve(fr.result); fr.onerror = ()=>reject(fr.error || new Error('read'));
    fr.readAsDataURL(new Blob([blob], { type: mime || blob.type || 'image/jpeg' }));
  });
}
async function syncDeleteObject(rel){
  if(!rel) return;
  try{ await syncFetch('/storage/v1/object' + syncObjUrl(rel), { method:'DELETE' }); }
  catch(e){ if(!syncNotFound(e)) throw e; }
}
/* Archivos viejos que sobran: se apuntan antes de borrarlos (si falla o se corta, se reintenta en otra pasada) */
async function syncTrash(rel){
  const M = SYNC.meta; if(!rel || !M) return;
  if(!M.trash.includes(rel)) M.trash.push(rel);
  try{ await syncDeleteObject(rel); M.trash = M.trash.filter(x=> x!==rel); }
  catch(e){ if(e.kind==='stopped' || e.kind==='session') throw e; }
}
async function syncEmptyTrash(){
  const M = SYNC.meta;
  for(const rel of M.trash.slice(0, 40)){
    if(syncStopRequested()) return;
    try{ await syncDeleteObject(rel); M.trash = M.trash.filter(x=> x!==rel); }catch(e){ if(e.kind==='stopped' || e.kind==='session') throw e; break; }
  }
}

/* ---------- Sesión ---------- */
async function syncSignIn(email, password){
  let r;
  try{ r = await syncRawFetch('/auth/v1/token?grant_type=password', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ email, password }), read:'json', timeout:20000 }); }
  catch(e){ throw syncErr('net'); }
  if(r.res.status===540) throw syncErr('paused');
  if(!r.res.ok){
    let j = {}; try{ j = JSON.parse(r.data || '{}'); }catch(e){}
    const code = String(j.error_code || j.code || j.error || '');
    if(/email_not_confirmed/.test(code) || /not confirmed/i.test(j.msg || j.error_description || '')) throw syncErr('unconfirmed');
    if(r.res.status===429 || /rate/.test(code)) throw syncErr('rate');
    if(r.res.status===400 || /invalid/.test(code)) throw syncErr('credentials');
    throw syncErr('server', String(r.res.status), r.res.status);
  }
  const a = syncAuthFrom(r.data, null);
  if(!a.user || !a.user.id || !a.access_token) throw syncErr('server', 'sin sesión');
  SYNC.epoch++;
  SYNC.auth = a;
  await syncSaveAuth();
  syncBroadcast('signin');
}
async function syncLoginSubmit(ev){
  if(ev) ev.preventDefault();
  if(SYNC.loginBusy) return;
  const emailEl = document.getElementById('syncEmail'), passEl = document.getElementById('syncPass');
  const email = (emailEl && emailEl.value || '').trim(), password = passEl ? passEl.value : '';
  const errEl = document.getElementById('syncLoginError');
  const setErr = (msg)=>{ SYNC.loginError = msg; if(errEl) errEl.textContent = msg; };
  if(!email || !password){ setErr(t('sync.err_missing')); (email ? passEl : emailEl).focus(); return; }
  if(!navigator.onLine){ setErr(t('sync.err_offline')); return; }
  SYNC.loginBusy = true; setErr('');
  const btn = document.getElementById('syncLoginBtn');
  if(btn){ btn.classList.add('is-busy'); btn.textContent = t('sync.signing_in'); }
  try{
    await syncSignIn(email, password);
    if(passEl) passEl.value = '';
    SYNC.loginError = ''; SYNC.failures = 0; SYNC.retryAt = 0;
    showToast(t('sync.toast_in'), { ok:true, replace:true });
    syncSetStatus('syncing');
    syncRefreshView(true, true);
    syncRun();
  }catch(e){
    const k = e.kind;
    setErr(k==='credentials' ? t('sync.err_credentials') : k==='unconfirmed' ? t('sync.err_unconfirmed') : k==='rate' ? t('sync.err_rate')
      : k==='net' ? t('sync.err_offline') : k==='paused' ? t('sync.cloud_paused_title') : t('sync.err_generic').replace('{e}', e.message || k));
  }finally{
    SYNC.loginBusy = false;
    const b = document.getElementById('syncLoginBtn');
    if(b){ b.classList.remove('is-busy'); b.textContent = t('sync.signin'); }
  }
}
function syncTogglePass(){
  const el = document.getElementById('syncPass'), b = document.getElementById('syncPassToggle');
  if(!el || !b) return;
  const show = el.type==='password';
  el.type = show ? 'text' : 'password';
  b.textContent = show ? t('sync.hide') : t('sync.show');
  b.setAttribute('aria-pressed', String(show));
  b.setAttribute('aria-label', show ? t('sync.hide_label') : t('sync.show_label'));
}
async function syncSignOut(skipConfirm){
  if(!skipConfirm && !await showConfirmModal(t('sync.signout_confirm'), { okLabel:t('sync.signout') })) return;
  const a = SYNC.auth;
  SYNC.epoch++;                       // lo que estuviera en marcha se para
  clearTimeout(SYNC.timer);
  SYNC.auth = null;
  await syncSaveAuth();
  syncBroadcast('signout');
  if(a && a.access_token && !a.expired && navigator.onLine){
    syncRawFetch('/auth/v1/logout?scope=local', { method:'POST', headers:{ Authorization:'Bearer ' + a.access_token }, timeout:8000 }).catch(()=>{});
  }
  SYNC.choice = null; SYNC.pendingChoice = null; SYNC.progress = null; SYNC.removal = null; SYNC.failures = 0; SYNC.retryAt = 0; SYNC.loginError = '';
  syncSetStatus('off');
  showToast(t('sync.signed_out'), { replace:true });
  syncRefreshView(true, true);
}

/* ---------- Sincronizar ---------- */
/* ms: espera mínima. Tras un fallo se respeta la espera creciente (salvo «Sincronizar ahora»). */
function syncSchedule(ms){
  if(!SYNC.ready || !SYNC.auth || SYNC.auth.expired) return;
  const wait = Math.max(ms || 0, SYNC.retryAt - Date.now());
  clearTimeout(SYNC.timer);
  SYNC.timer = setTimeout(()=>syncRun(), wait);
}
function syncStopRequested(){ return SYNC.runEpoch!==SYNC.epoch || !SYNC.auth || SYNC.auth.expired || (SYNC.meta && SYNC.meta.paused); }
async function syncRun(opts){
  if(!SYNC.ready || !SYNC.auth || SYNC.auth.expired) return;
  if(SYNC.busy){ SYNC.again = true; return; }
  SYNC.busy = true; SYNC.runEpoch = SYNC.epoch;
  clearTimeout(SYNC.timer);
  try{
    if(navigator.locks && navigator.locks.request){
      await navigator.locks.request('coleccion-app-sync', { ifAvailable:true }, async (lock)=>{
        if(!lock){ SYNC.again = false; syncSchedule(15000); return; }   // otra ventana de la app está sincronizando
        await syncRunLocked(opts || {});
      });
    } else await syncRunLocked(opts || {});
  }catch(e){ syncHandleError(e); }
  finally{
    SYNC.busy = false; SYNC.lastRunAt = Date.now();
    SYNC.progress = null;
    syncRefreshView(false);
    if(SYNC.again){ SYNC.again = false; syncSchedule(800); }
  }
}
async function syncRunLocked(opts){
  if(storageReadFailed || unreadableDataOnLoad){ syncSetStatus('local-error'); return; }
  // ¿sigue la sesión? (se pudo cerrar en otra ventana)
  const a = await syncReadKV('sync_auth');
  if(a.ok && (!a.value || !a.value.user || a.value.user.id!==SYNC.auth.user.id)){ SYNC.epoch++; SYNC.auth = null; syncSetStatus('off'); return; }
  // ¿guardó otra ventana la colección? → primero ponerse al día
  if(!await syncAdoptForeign()){
    await sleepMs(1000);
    if(!await syncAdoptForeign()) throw syncErr('retry');
  }
  const uid = SYNC.auth.user.id;
  const m = await syncReadKV('sync_meta');
  if(!m.ok){ syncSetStatus('local-error'); return; }
  // (lo apuntado al momento por esta ventana se conserva; lo demás, de lo guardado)
  const memDirty = (SYNC.meta && SYNC.meta.uid===uid) ? Object.assign({}, SYNC.meta.pdirty) : {};
  SYNC.meta = syncNormMeta((m.value && m.value.uid===uid && m.value.v===1) ? m.value : (SYNC.meta && SYNC.meta.uid===uid ? SYNC.meta : syncNewMeta(uid)));
  const M = SYNC.meta;
  Object.keys(memDirty).forEach(k=>{ if(M.pdirty[k]===undefined || M.pdirty[k] < memDirty[k]){ M.pdirty[k] = memDirty[k]; delete M.pdown[k]; } });
  const edits = SYNC.metaEdits; SYNC.metaEdits = [];
  edits.forEach(fn=>{ try{ fn(M); }catch(e){} });
  const marks = await syncMergeMarks();
  syncDetect(Date.now());
  await syncDetectPhotos(Date.now());
  if(!await syncSaveMeta()){ syncSetStatus('local-error'); return; }
  await syncClearMarks(marks);
  if(!navigator.onLine){ syncSetStatus('offline'); return; }
  if(!M.bound){
    if(SYNC.status==='choose' && SYNC.choice && !SYNC.pendingChoice && !opts.force) return;
    await syncFirstTime(opts);
    if(!M.bound) return;
  }
  if(M.paused){ syncSetStatus('paused'); return; }
  syncSetStatus('syncing');
  await syncPull();
  if(syncStopRequested()) return;
  const { units } = syncDetect(Date.now());
  const removal = syncRemovalCheck(units);
  if(removal){ SYNC.removal = removal; await syncSaveMeta(); syncSetStatus('guard'); return; }
  SYNC.removal = null;
  syncStartProgress();
  await syncPushData();
  if(syncStopRequested()) return;
  await syncPushPhotos();
  if(syncStopRequested()) return;
  await syncDownloadPhotos();
  if(syncStopRequested()) return;
  await syncEmptyTrash();
  M.lastOk = Date.now();
  SYNC.failures = 0; SYNC.lastError = ''; SYNC.retryAt = 0;
  if(!await syncSaveMeta()) throw syncErr('local-save');
  syncSetStatus('ok');
}
function syncHandleError(e){
  const k = e && e.kind;
  if(k==='stopped'){ if(!SYNC.auth){ SYNC.status = 'off'; syncRefreshView(true); } return; }   // se cerró o cambió la sesión: no es un fallo
  if(k==='retry'){ SYNC.retryAt = Date.now() + 5000; syncSchedule(5000); return; }   // otra ventana guardando: en un momento
  if(!SYNC.auth){ SYNC.status = 'off'; syncRefreshView(true); return; }
  if(k==='presync'){
    SYNC.pendingChoice = null; SYNC.choiceCopied = null;
    showToast(t('sync.presync_failed'), { replace:true, duration:8000 });
    SYNC.status = SYNC.choice ? 'choose' : 'syncing'; syncRefreshView(true);
    if(!SYNC.choice) syncSchedule(1500);                       // vuelve a preguntar qué hacer
    return;
  }
  if(k==='session'){ syncSetStatus('session'); return; }
  if(k==='local'){ syncSetStatus('local-error'); return; }
  if(k==='net' && !navigator.onLine){ syncSetStatus('offline'); return; }
  SYNC.failures++;
  SYNC.lastError = k==='local-save' ? 'local-save' : ((e && e.message) || String(e));
  if(typeof console!=='undefined') console.warn('sync:', SYNC.lastError);
  const wait = k==='paused' ? 5 * 60000 : Math.min(5 * 60000, 10000 * Math.pow(2, Math.min(SYNC.failures, 5)));
  SYNC.retryAt = Date.now() + wait;
  syncSetStatus(k==='paused' ? 'cloud-paused' : 'error');
  syncSchedule(wait);
}

/* Traer de la nube lo que ha cambiado desde la última vez */
async function syncPull(){
  const M = SYNC.meta;
  const since = M.cursor ? syncIso(syncTs(M.cursor) - SYNC_OVERLAP_MS) : null;
  const light = await syncListRows(since, 'clave,borrado,cambiado,actualizado');
  let maxAct = M.cursor;
  const need = new Map();
  for(const r of light){
    if(!maxAct || syncTs(r.actualizado) > syncTs(maxAct)) maxAct = r.actualizado;
    const c = syncTs(r.cambiado);
    if(r.clave.startsWith('f:')){
      const k = r.clave.slice(2), b = M.pbase[k], d = M.pdown[k];
      if((b && b[1]===c && b[0]!==SYNC_GONE) || (d && d[0]===c)) continue;
    } else {
      const b = M.base[r.clave];
      if(b && b[1]===c) continue;
    }
    need.set(r.clave, r);
  }
  if(need.size){
    const full = await syncFetchFull([...need.values()], since);
    await syncApplyRows(full);
  }
  if(maxAct) M.cursor = maxAct;
  if(!await syncSaveMeta()) throw syncErr('local-save');
}
async function syncApplyRows(rows){
  const M = SYNC.meta;
  if(SYNC.runEpoch!==SYNC.epoch) throw syncErr('stopped');
  // una sola versión por clave (la más reciente)
  const byKey = new Map();
  rows.forEach(r=>{ const p = byKey.get(r.clave); if(!p || syncTs(r.actualizado) >= syncTs(p.actualizado)) byKey.set(r.clave, r); });
  const data = [], orders = [], photos = [];
  byKey.forEach(r=>{ (r.clave.startsWith('f:') ? photos : r.clave.startsWith('o:') ? orders : data).push(r); });
  if(data.length || orders.length){
    if(!await syncAdoptForeign()) throw syncErr('retry');   // otra ventana a medio guardar: se reintenta
    const baseBefore = JSON.stringify(M.base), dirtyBefore = JSON.stringify(M.dirty);
    const current = syncUnits(OVERRIDES);
    let touched = false;
    for(const r of data){
      const k = r.clave, c = syncTs(r.cambiado);
      const rh = r.borrado ? SYNC_DEL : syncHash(syncStable(r.valor));
      const b = M.base[k];
      if(b && b[0]===rh){ M.base[k] = [rh, c]; continue; }
      const has = current.has(k);
      const lh = has ? syncHash(syncStable(current.get(k))) : SYNC_DEL;
      if(lh===rh){ M.base[k] = [rh, c]; delete M.dirty[k]; continue; }
      const localChanged = b ? lh!==b[0] : has;
      if(localChanged){
        const lt = M.dirty[k] ? M.dirty[k][0] : Date.now();
        if(lt > c){ M.base[k] = [rh, c]; if(!M.dirty[k]) M.dirty[k] = [lt, lh]; if(b) syncNotice(k, 'here', lt); continue; }
        if(b) syncNotice(k, 'other', c);
      }
      syncApplyUnit(OVERRIDES, k, r.borrado ? undefined : r.valor);
      M.base[k] = [rh, c]; delete M.dirty[k];
      touched = true;
    }
    for(const r of orders){
      const k = r.clave, c = syncTs(r.cambiado), top = k.slice(2);
      M.base[k] = [r.borrado ? SYNC_DEL : syncHash(syncStable(r.valor)), c];
      if(!r.borrado){ syncApplyOrder(OVERRIDES, top, r.valor); touched = true; }
    }
    if(touched){
      SYNC.cache.gen = -1;
      SYNC.applying = true;
      let ok = false;
      try{ ok = await persistOverrides(); } finally { SYNC.applying = false; }
      if(!ok){ M.base = JSON.parse(baseBefore); M.dirty = JSON.parse(dirtyBefore); throw syncErr('local-save'); }
      await syncAfterDataChange();
    }
  }
  for(const r of photos){
    const k = r.clave.slice(2), c = syncTs(r.cambiado);
    if(!parsePhotoKey(k)) continue;
    const b = M.pbase[k];
    if(b && b[1]===c && b[0]!==SYNC_GONE) continue;
    const rn = r.borrado ? SYNC_DEL : ((r.valor && Number(r.valor.n)) || 0);
    const rel = r.borrado ? null : ((r.valor && typeof r.valor.p==='string' && r.valor.p) || syncObjName(k));
    const ld = M.pdirty[k];
    if(ld!==undefined){
      if(ld > c){ M.pbase[k] = [rn, c, rel]; continue; }   // el cambio de aquí es más reciente: se sube
      delete M.pdirty[k];
    }
    if(r.borrado){
      delete M.pdown[k];
      if(SYNC.localPhotoKeys.has(k)){
        if(M.pdirty[k]!==undefined){ M.pbase[k] = [SYNC_DEL, c]; continue; }   // la acabas de cambiar aquí: se queda
        await syncRemovePhotoQuiet(k);
      }
      M.pbase[k] = [SYNC_DEL, c];
      SYNC.pendingRender = true;
    } else {
      M.pdown[k] = [c, rn, (r.valor && r.valor.t) || 'image/jpeg', 0, rel];
    }
  }
}
async function syncAfterDataChange(){
  SYNC.applying = true;
  try{ if(typeof runMigrations==='function') await runMigrations(); } finally { SYNC.applying = false; }
  if(typeof refreshChromeSettings==='function') refreshChromeSettings();
  buildProducts();
  SYNC.pendingRender = true;
}
/* Quitar una foto porque se quitó en otro dispositivo (como removePhoto, pero sin
   apuntarlo como cambio de aquí). */
async function syncRemovePhotoQuiet(k){
  if(!await idbDelete(PHOTOS_STORE, k)) throw syncErr('local-save');
  await invalidateThumb(k);
  const info = parsePhotoKey(k);
  if(info && PHOTO_INDEX[info.side].get(info.id)===k){
    PHOTO_INDEX[info.side].delete(info.id);
    (await idbGetKeys(PHOTOS_STORE)).forEach(x=>{ const i = typeof x==='string' && parsePhotoKey(x); if(i && i.id===info.id && i.side===info.side) indexPhotoKey(x); });
  }
  SYNC.localPhotoKeys.delete(k);
}
function syncNotice(k, who, at){
  const M = SYNC.meta;
  const name = syncUnitName(k);
  M.notices = (M.notices || []).filter(n=> n.name!==name);
  M.notices.unshift({ name, who, at, t:Date.now() });
  M.notices = M.notices.slice(0, 12);
}
function syncUnitName(k){
  const rest = k.slice(2), i = rest.indexOf('/');
  const top = i>=0 ? rest.slice(0, i) : rest, id = i>=0 ? rest.slice(i + 1) : '';
  if(top==='products' || top==='customProducts' || top==='editions'){
    const baseId = id.replace(/__e\d+$/, '');
    const p = (typeof PRODUCTS_BY_ID!=='undefined' && (PRODUCTS_BY_ID[id] || PRODUCTS_BY_ID[baseId]))
      || (OVERRIDES.customProducts || []).find(x=> x && (x.id===id || x.id===baseId));
    if(p && p.name) return p.name;
  }
  if(top==='customPlatforms' || top==='platformFlags' || top==='platformNames' || top==='folders'){
    const pl = (typeof getAllPlatforms==='function' ? getAllPlatforms() : []).find(x=> x.id===id);
    if(pl && pl.name) return pl.name;
  }
  if(top==='customCategories' || top==='categoryFlags' || top==='categoryNames' || top==='categoryChecklist' || top==='categoryOrder'){
    const c = (typeof getAllCategories==='function' ? getAllCategories() : []).find(x=> x.id===id);
    if(c && c.name) return c.name;
  }
  return t('sync.conflict_settings');
}
/* Muchas piezas o fotos que se quitarían de la nube de golpe → se pregunta antes.
   Lo que ya aceptaste (hasta allowRemovalsAt) no se vuelve a preguntar. */
function syncRemovalCheck(units){
  const M = SYNC.meta, okAt = M.allowRemovalsAt || 0;
  let p = 0, f = 0;
  Object.keys(M.dirty).forEach(k=>{ if(k.startsWith('l:customProducts/') && !units.has(k) && M.base[k] && M.base[k][0]!==SYNC_DEL && M.dirty[k][0] > okAt) p++; });
  Object.keys(M.pdirty).forEach(k=>{ if(!SYNC.localPhotoKeys.has(k) && syncLive(M.pbase[k]) && M.pdirty[k] > okAt) f++; });
  return (p >= SYNC_GUARD_PIECES || f >= SYNC_GUARD_PHOTOS) ? { p, f } : null;
}

/* Subir tus cambios */
async function syncPushData(){
  const M = SYNC.meta, uid = SYNC.auth.user.id;
  const { units } = syncDetect(Date.now());
  const keys = Object.keys(M.dirty).filter(k=> M.rejected[k]!==M.dirty[k][1]);
  if(!keys.length) return;
  const P = SYNC.progress; if(P){ P.units = [0, keys.length]; syncProgressView(); }
  for(let i=0;i<keys.length;i+=SYNC_CHUNK){
    if(syncStopRequested()) return;
    const chunk = keys.slice(i, i + SYNC_CHUNK);
    const meta = [];
    const rows = chunk.map(k=>{
      const has = units.has(k);
      let valor = null, h = SYNC_DEL;
      if(has){ const s = syncStable(units.get(k)); h = syncHash(s); valor = JSON.parse(s); }
      const at = M.dirty[k] ? M.dirty[k][0] : Date.now();
      meta.push([h, at]);
      return { user_id:uid, clave:k, valor, borrado:!has, cambiado:syncIso(at) };
    });
    const ok = await syncUpsert(rows);
    chunk.forEach((k,j)=>{
      if(!ok[j]){ M.rejected[k] = meta[j][0]; return; }     // no entró: queda pendiente (se reintenta si cambia)
      delete M.rejected[k];
      M.base[k] = [meta[j][0], meta[j][1]];
      if(M.dirty[k] && M.dirty[k][0]===meta[j][1] && M.dirty[k][1]===meta[j][0]) delete M.dirty[k];
    });
    if(!await syncSaveMeta()) throw syncErr('local-save');
    if(P){ P.units[0] = Math.min(P.units[1], i + chunk.length); syncProgressView(); }
  }
}
async function syncPushPhotos(){
  const M = SYNC.meta, uid = SYNC.auth.user.id;
  const keys = Object.keys(M.pdirty).filter(k=> M.rejected['f:' + k]!==M.pdirty[k]);
  if(!keys.length) return;
  const P = SYNC.progress; if(P && P.dir==='up'){ P.photos = [0, keys.length]; P.tPhotos = Date.now(); syncProgressView(); }
  await syncPool(keys, 3, async (k)=>{
    if(syncStopRequested()) return;
    const at = M.pdirty[k]; if(at===undefined) return;
    let data;
    try{ data = await idbGetStrict(PHOTOS_STORE, k); }catch(e){ throw syncErr('local', 'photo read'); }
    const b = M.pbase[k], oldRel = b ? (b[2] || (syncLive(b) ? syncObjName(k) : null)) : null;
    if(data===undefined || data===null){
      if(b && b[0]!==SYNC_DEL){
        const ok = (await syncUpsert([{ user_id:uid, clave:'f:' + k, valor:null, borrado:true, cambiado:syncIso(at) }]))[0];
        if(!ok){ M.rejected['f:' + k] = at; return; }
        await syncTrash(oldRel);
      }
      M.pbase[k] = [SYNC_DEL, at];
    } else {
      const parsed = typeof data==='string' ? syncParseDataUrl(data) : null;
      if(!parsed){ if(M.pdirty[k]===at) delete M.pdirty[k]; return; }   // no es una foto: no se sube
      const rel = syncObjRel(k, at);
      try{
        await syncFetch('/storage/v1/object' + syncObjUrl(rel), { method:'POST', timeout:180000,
          headers:{ 'Content-Type':parsed.mime, 'x-upsert':'true' }, body:new Blob([parsed.bytes], { type:parsed.mime }) });
      }catch(e){
        // el almacén no acepta ESTA foto (demasiado grande, tipo no admitido…): se aparta y sigue con las demás
        const msg = e.message || '';
        if(e.kind==='http' && ([413, 415, 422].includes(e.status) || (e.status===400 && /"statusCode"\s*:\s*"(413|415|422)"|invalid_mime|mime type|too large|EntityTooLarge|InvalidKey/i.test(msg)))){ M.rejected['f:' + k] = at; return; }
        throw e;
      }
      const ok = (await syncUpsert([{ user_id:uid, clave:'f:' + k, valor:{ n:data.length, t:parsed.mime, p:rel }, borrado:false, cambiado:syncIso(at) }]))[0];
      if(!ok){ M.rejected['f:' + k] = at; await syncTrash(rel); return; }
      delete M.rejected['f:' + k];
      M.pbase[k] = [data.length, at, rel];
      if(oldRel && oldRel!==rel) await syncTrash(oldRel);   // la versión anterior ya no hace falta
    }
    if(M.pdirty[k]===at) delete M.pdirty[k];
    if(P && P.dir==='up' && P.photos){ P.photos[0]++; syncProgressView(); }
    syncSaveMetaSoon();
  });
  if(!await syncSaveMeta()) throw syncErr('local-save');
}
async function syncDownloadPhotos(){
  const M = SYNC.meta;
  const keys = Object.keys(M.pdown);
  if(!keys.length) return;
  const P = SYNC.progress; if(P && P.dir==='down'){ P.photos = [0, keys.length]; P.tPhotos = Date.now(); syncProgressView(); }
  let changed = 0;
  await syncPool(keys, 3, async (k)=>{
    if(syncStopRequested()) return;
    const d = M.pdown[k]; if(!d) return;
    if(M.pdirty[k]!==undefined && M.pdirty[k] > d[0]){ delete M.pdown[k]; return; }   // aquí hay un cambio más reciente
    const rel = d[4] || syncObjName(k);
    let blob;
    try{ blob = await syncFetch('/storage/v1/object/authenticated' + syncObjUrl(rel), { read:'blob', timeout:180000 }); }
    catch(e){
      if(!syncNotFound(e)) throw e;
      d[3] = (d[3] || 0) + 1;              // aún no está (o ya no): se reintenta un par de veces
      if(d[3] >= 3){ delete M.pdown[k]; M.pbase[k] = [SYNC_GONE, d[0], rel, d[1]]; }   // se deja estar: nunca se toma por «borrada aquí»
      return;
    }
    const dataUrl = await syncBlobToDataUrl(blob, d[2]);
    if(d[1] > 0 && dataUrl.length!==d[1] && (d[3] || 0) < 2){ d[3] = (d[3] || 0) + 1; return; }   // no es la versión esperada: se reintenta
    // ¿la has cambiado aquí mientras bajaba? entonces gana la tuya
    if((M.pdirty[k]!==undefined && M.pdirty[k] > d[0]) || M.pdown[k]!==d) return;
    if(!await idbSet(PHOTOS_STORE, k, dataUrl)) throw syncErr('local-save');
    indexPhotoKey(k);
    await invalidateThumb(k);
    if(M.pdirty[k]!==undefined && M.pdirty[k] <= d[0]) delete M.pdirty[k];
    SYNC.localPhotoKeys.add(k);
    M.pbase[k] = [dataUrl.length, d[0], rel];
    delete M.pdown[k];
    changed++;
    if(P && P.dir==='down' && P.photos){ P.photos[0]++; syncProgressView(); }
    if(changed % 12===0) SYNC.pendingRender = true;
    syncSaveMetaSoon();
  });
  if(!await syncSaveMeta()) throw syncErr('local-save');
  if(changed) SYNC.pendingRender = true;
}

/* ---------- Primera vez en este dispositivo ---------- */
async function syncFirstTime(opts){
  syncSetStatus('syncing');
  const rows = await syncListRows(null, 'clave,borrado,cambiado,actualizado,del:valor->>deleted,n:valor->>n,p:valor->>p');
  const live = rows.filter(r=> !r.borrado);
  const delIds = new Set(live.filter(r=> r.clave.startsWith('d:products/') && String(r.del)==='true').map(r=> r.clave.slice('d:products/'.length)));
  const cloudPieces = live.filter(r=> r.clave.startsWith('l:customProducts/') && !delIds.has(r.clave.slice('l:customProducts/'.length))).length;
  const cloudPhotos = live.filter(r=> r.clave.startsWith('f:')).length;
  const cloudHas = cloudPieces > 0 || cloudPhotos > 0 || live.some(r=> r.clave.startsWith('l:customCategories/'));
  const localHas = syncCountPieces(OVERRIDES) > 0 || (OVERRIDES.customCategories || []).length > 0 || SYNC.localPhotoKeys.size > 0;
  let mode = opts.choice || SYNC.pendingChoice || null;
  if(!cloudHas && (!live.length || localHas)) mode = 'local';   // la nube está vacía: se sube lo de aquí
  else if(!localHas) mode = 'cloud';                             // aquí no hay nada: se baja la de la nube
  if(!mode){
    const last = live.reduce((mx, r)=> Math.max(mx, syncTs(r.cambiado)), 0);
    SYNC.choice = { cloud:{ pieces:cloudPieces, photos:cloudPhotos, last }, local:{ pieces:syncCountPieces(OVERRIDES), photos:SYNC.localPhotoKeys.size } };
    syncSetStatus('choose');
    return;
  }
  if(mode==='local') await syncAdoptLocal(rows);
  else await syncAdoptCloud(localHas);
  SYNC.choice = null; SYNC.pendingChoice = null; SYNC.choiceCopied = null;   // (si algo falla antes, se sigue con la misma elección)
}
/* Esta colección sustituye a la de la nube */
async function syncAdoptLocal(rows){
  const M = SYNC.meta;
  const now = Date.now();
  const base = {}, pbase = {}, pdirty = {};
  let maxAct = null;
  rows.forEach(r=>{
    const c = syncTs(r.cambiado);
    if(!maxAct || syncTs(r.actualizado) > syncTs(maxAct)) maxAct = r.actualizado;
    if(r.clave.startsWith('f:')) pbase[r.clave.slice(2)] = r.borrado ? [SYNC_DEL, c] : [Number(r.n) || 0, c, r.p || syncObjName(r.clave.slice(2))];
    else base[r.clave] = [r.borrado ? SYNC_DEL : '?', c];   // «?»: se vuelve a subir lo de aquí
  });
  SYNC.progress = { dir:'up', big:true, units:null, photos:null, t0:now, label:'compare' };
  syncProgressView(true);
  for(const k of SYNC.localPhotoKeys){
    const b = pbase[k];
    if(syncLive(b) && b[0] > 0){
      let v; try{ v = await idbGetStrict(PHOTOS_STORE, k); }catch(e){ throw syncErr('local', 'photo read'); }
      if(typeof v==='string' && v.length===b[0]) continue;     // ya está igual en la nube
    }
    pdirty[k] = now;
  }
  Object.keys(pbase).forEach(k=>{ if(syncLive(pbase[k]) && !SYNC.localPhotoKeys.has(k)) pdirty[k] = now; });
  M.base = base; M.dirty = {}; M.pbase = pbase; M.pdirty = pdirty; M.pdown = {}; M.rejected = {};
  M.cursor = maxAct;
  M.allowRemovalsAt = now;            // ya lo confirmaste al elegir «Subir la de este dispositivo»
  M.bound = true;
  SYNC.cache.gen = -1;
  syncDetect(now);
  SYNC.bigNext = 'up';
  if(!await syncSaveMeta()) throw syncErr('local-save');
}
/* La colección de la nube sustituye a la de aquí (antes se guarda una copia) */
async function syncAdoptCloud(saveCopy){
  const M = SYNC.meta, t0 = Date.now();
  SYNC.progress = { dir:'down', big:true, units:null, photos:null, t0:Date.now(), label:'compare' };
  syncProgressView(true);
  const all = await syncListRows(null, 'clave,valor,borrado,cambiado,actualizado');
  const remotePhotos = new Map();
  all.forEach(r=>{ if(r.clave.startsWith('f:') && !r.borrado) remotePhotos.set(r.clave.slice(2), r); });
  // 1) qué fotos de aquí van a cambiar o a quitarse
  const changing = [];
  for(const k of SYNC.localPhotoKeys){
    const r = remotePhotos.get(k);
    if(!r || !r.valor || !(Number(r.valor.n) > 0)){ changing.push(k); continue; }
    let v; try{ v = await idbGetStrict(PHOTOS_STORE, k); }catch(e){ throw syncErr('local', 'photo read'); }
    if(typeof v!=='string' || v.length!==Number(r.valor.n)) changing.push(k);
  }
  // 2) copia de lo de aquí (datos + esas fotos) antes de tocar nada
  const cc = SYNC.choiceCopied;
  const reuse = cc && cc.gen===SYNC.gen && !Object.keys(M.pdirty).some(k=> M.pdirty[k] >= cc.at);
  if(saveCopy && !reuse){
    const at = Date.now(), gen = SYNC.gen;
    const savedAt = await syncPresyncSave(changing);
    if(!savedAt) throw syncErr('presync');
    SYNC.choiceCopied = { savedAt, gen, at };
  }
  if(syncStopRequested()) throw syncErr('stopped');
  if(!await syncAdoptForeign()) throw syncErr('retry');
  // 3) la colección de la nube
  const O = { products:{}, editions:{} };
  SYNC_LOCAL.forEach(k=>{ if(OVERRIDES[k]!==undefined) O[k] = OVERRIDES[k]; });
  const base = {}, orders = [];
  let maxAct = null, nUnits = 0;
  all.forEach(r=>{
    if(!maxAct || syncTs(r.actualizado) > syncTs(maxAct)) maxAct = r.actualizado;
    if(r.clave.startsWith('f:')) return;
    const c = syncTs(r.cambiado);
    base[r.clave] = [r.borrado ? SYNC_DEL : syncHash(syncStable(r.valor)), c];
    if(r.borrado) return;
    nUnits++;
    if(r.clave.startsWith('o:')) orders.push(r); else syncApplyUnit(O, r.clave, r.valor);
  });
  orders.forEach(r=> syncApplyOrder(O, r.clave.slice(2), r.valor));
  const previous = OVERRIDES;
  OVERRIDES = O;
  SYNC.cache.gen = -1;
  SYNC.applying = true;
  let ok = false;
  try{ ok = await persistOverrides(); } finally { SYNC.applying = false; }
  if(!ok){ OVERRIDES = previous; SYNC.cache.gen = -1; throw syncErr('local-save'); }
  // 4) fotos: las iguales se quedan; las distintas se bajan; las que solo estaban aquí se quitan (están en la copia)
  const pbase = {}, pdown = {};
  all.forEach(r=>{ if(r.clave.startsWith('f:') && r.borrado) pbase[r.clave.slice(2)] = [SYNC_DEL, syncTs(r.cambiado)]; });
  const changingSet = new Set(changing);
  remotePhotos.forEach((r, k)=>{
    if(!parsePhotoKey(k)) return;
    const c = syncTs(r.cambiado), n = (r.valor && Number(r.valor.n)) || 0;
    const rel = (r.valor && typeof r.valor.p==='string' && r.valor.p) || syncObjName(k);
    if(SYNC.localPhotoKeys.has(k) && !changingSet.has(k)) pbase[k] = [n, c, rel];
    else pdown[k] = [c, n, (r.valor && r.valor.t) || 'image/jpeg', 0, rel];
  });
  // fotos que has hecho o cambiado aquí MIENTRAS tanto: se quedan y se suben
  const during = {};
  Object.keys(M.pdirty).forEach(k=>{ if(M.pdirty[k] >= t0) during[k] = M.pdirty[k]; });
  for(const k of changing){ if(!remotePhotos.has(k) && during[k]===undefined) await syncRemovePhotoQuiet(k); }
  Object.keys(during).forEach(k=>{ delete pdown[k]; });
  M.base = base; M.dirty = {}; M.pbase = pbase; M.pdirty = during; M.pdown = pdown; M.rejected = {};
  M.cursor = maxAct;
  M.bound = true;
  M.allowRemovalsAt = 0;
  if(!await syncSaveMeta()) throw syncErr('local-save');
  SYNC.bigNext = 'down';
  SYNC.bigUnits = nUnits;
  await syncAfterDataChange();
  showToast(t('sync.cloud_done'), { ok:true, replace:true });
}
async function syncChoose(mode){
  const C = SYNC.choice;
  if(mode==='local'){
    const msg = C ? t('sync.use_local_confirm').replace('{p}', C.cloud.pieces).replace('{f}', C.cloud.photos).replace('{lp}', C.local.pieces).replace('{lf}', C.local.photos) : t('sync.use_local_sub');
    if(!await showConfirmModal(msg, { okLabel:t('sync.use_local_ok'), danger:true })) return;
  }
  SYNC.pendingChoice = mode==='local' ? 'local' : 'cloud'; SYNC.choiceCopied = null;
  syncSetStatus('syncing');
  syncRefreshView(true, true);
  syncRun();
}
/* Aviso de «se van a quitar cosas de la nube» */
async function syncGuardDecide(remove){
  if(!SYNC.meta) return;
  if(remove){
    const at = Date.now();
    await syncEditMeta(M=>{ M.allowRemovalsAt = Math.max(M.allowRemovalsAt || 0, at); });
    SYNC.removal = null;
    syncSetStatus('syncing'); syncRefreshView(true, true);
    syncRun();
  } else {
    if(!await showConfirmModal(t('sync.guard_restore_confirm'), { okLabel:t('sync.guard_restore') })) return;
    await syncEditMeta(M=>{ M.bound = false; });
    SYNC.removal = null;
    SYNC.pendingChoice = 'cloud'; SYNC.choiceCopied = null;
    syncSetStatus('syncing'); syncRefreshView(true, true);
    syncRun();
  }
}

/* ---------- Copias de antes de sincronizar (base de datos aparte) ----------
   Cada vez que «Usar la de la nube» sustituye lo de este dispositivo, se guarda
   antes una copia nueva (datos + fotos que cambian o sobran). Las copias no se
   borran solas: solo cuando tú lo pides. */
const SYNC_PRESYNC_DB = 'archivo_sergio_presync';
function syncPresyncDb(){
  return new Promise((resolve, reject)=>{
    const req = indexedDB.open(SYNC_PRESYNC_DB, 1);
    req.onupgradeneeded = ()=>{ if(!req.result.objectStoreNames.contains('copia')) req.result.createObjectStore('copia'); };
    req.onsuccess = ()=>resolve(req.result);
    req.onerror = ()=>reject(req.error);
  });
}
function syncPresyncOp(mode, fn){
  return syncPresyncDb().then(db=>new Promise((resolve, reject)=>{
    const tx = db.transaction('copia', mode);
    const r = fn(tx.objectStore('copia'));
    tx.oncomplete = ()=>{ db.close(); resolve(r && 'result' in r ? r.result : true); };
    tx.onerror = ()=>{ db.close(); reject(tx.error); };
    tx.onabort = ()=>{ db.close(); reject(tx.error || new Error('abort')); };
  }));
}
async function syncPresyncSave(photoKeys){
  const savedAt = new Date().toISOString();
  try{
    for(const k of photoKeys){
      const v = await idbGetStrict(PHOTOS_STORE, k);
      if(typeof v==='string') await syncPresyncOp('readwrite', os=> os.put(v, 'foto:' + savedAt + ':' + k));
    }
    // los datos, al final: si están, la copia está completa
    await syncPresyncOp('readwrite', os=> os.put({ savedAt, photos:photoKeys.length, data:JSON.stringify(OVERRIDES) }, 'datos:' + savedAt));
    if(!await idbSet(KV_STORE, 'sync_presync', '1')) throw new Error('marker');
    await syncPresyncInfo();
    return savedAt;
  }catch(e){
    // copia a medias: se quitan sus fotos (las copias anteriores no se tocan)
    try{ await syncPresyncOp('readwrite', os=> os.delete(IDBKeyRange.bound('foto:' + savedAt + ':', 'foto:' + savedAt + ':\uffff'))); }catch(e2){}
    try{ await syncPresyncOp('readwrite', os=> os.delete('datos:' + savedAt)); }catch(e3){}
    return null;
  }
}
/* Lista de copias. Devuelve false si no hay ninguna, o null si no se ha podido leer. */
async function syncPresyncInfo(){
  let marker;
  try{ marker = await idbGetStrict(KV_STORE, 'sync_presync'); }catch(e){ return null; }
  if(!marker){ SYNC.presync = false; return false; }   // nunca se hizo ninguna: no se crea nada
  try{
    const list = await syncPresyncOp('readonly', os=> os.getAll(IDBKeyRange.bound('datos:', 'datos:\uffff')));
    const copies = (list || []).filter(d=> d && d.savedAt).map(d=> ({ savedAt:d.savedAt, photos:d.photos || 0 })).sort((a,b)=> a.savedAt < b.savedAt ? 1 : -1);
    SYNC.presync = copies.length ? copies : false;
    return SYNC.presync;
  }catch(e){ return null; }
}
async function syncPresyncDownload(savedAt){
  if(typeof JSZip==='undefined'){ showToast(t('bk.nozip')); return; }
  const btn = document.querySelector('[data-presync-dl="' + savedAt + '"]'); if(btn) btn.classList.add('is-busy');
  try{
    const d = await syncPresyncOp('readonly', os=> os.get('datos:' + savedAt));
    if(!d) return;
    const zip = new JSZip();
    zip.file('datos.json', d.data);
    const pre = 'foto:' + savedAt + ':';
    const all = await syncPresyncDb().then(db=>new Promise((resolve, reject)=>{
      const tx = db.transaction('copia', 'readonly'), os = tx.objectStore('copia'), range = IDBKeyRange.bound(pre, pre + '\uffff');
      const kr = os.getAllKeys(range), vr = os.getAll(range);
      tx.oncomplete = ()=>{ db.close(); resolve({ keys:kr.result, vals:vr.result }); };
      tx.onerror = ()=>{ db.close(); reject(tx.error); };
    }));
    all.keys.forEach((key, i)=>{
      const m = /^data:([^;]+);base64,([\s\S]*)$/.exec(all.vals[i] || ''); if(!m) return;
      const ext = m[1].includes('png') ? 'png' : m[1].includes('webp') ? 'webp' : 'jpg';
      zip.file('fotos/' + String(key).slice(pre.length) + '.' + ext, m[2], { base64:true });
    });
    const blob = await zip.generateAsync({ type:'blob' });
    downloadBlob(blob, 'la-coleccion-antes-de-sincronizar-' + String(savedAt).slice(0,16).replace(/[:T]/g, '-') + '.zip');
  }catch(e){ showToast(t('bk.import_failed') + ' ' + (e && e.message || '')); }
  finally{ const b = document.querySelector('[data-presync-dl="' + savedAt + '"]'); if(b) b.classList.remove('is-busy'); }
}
async function syncPresyncDelete(savedAt){
  if(!await showConfirmModal(t('sync.presync_delete_confirm'), { okLabel:t('sync.presync_delete'), danger:true })) return;
  try{
    await syncPresyncOp('readwrite', os=>{ os.delete('datos:' + savedAt); os.delete(IDBKeyRange.bound('foto:' + savedAt + ':', 'foto:' + savedAt + ':\uffff')); });
  }catch(e){}
  await syncPresyncInfo();
  // la base aparte solo se borra si se ha podido comprobar que ya no queda NADA dentro
  let count = -1;
  try{ count = await syncPresyncOp('readonly', os=> os.count()); }catch(e){ count = -1; }
  if(count===0){
    await new Promise(resolve=>{ const r = indexedDB.deleteDatabase(SYNC_PRESYNC_DB); r.onsuccess = r.onerror = r.onblocked = ()=>resolve(); });
    await idbDelete(KV_STORE, 'sync_presync');
    SYNC.presync = false;
  }
  syncRefreshView(true, true);
}

/* ---------- Estado y pantalla ---------- */
function syncSetStatus(st){
  SYNC.status = st;
  syncRefreshView(true);
}
function syncStartProgress(){
  const M = SYNC.meta;
  const up = Object.keys(M.pdirty).length, down = Object.keys(M.pdown).length, units = Object.keys(M.dirty).length;
  const dir = SYNC.bigNext || (down > up ? 'down' : 'up');
  const big = !!SYNC.bigNext || units >= 100 || up >= 10 || down >= 10;
  SYNC.bigNext = null;
  const doneUnits = SYNC.bigUnits || 0; SYNC.bigUnits = 0;
  SYNC.progress = { dir, big, units: units ? [0, units] : (big && doneUnits ? [doneUnits, doneUnits] : null), photos: null, t0:Date.now(), tPhotos:0 };
  if(big) syncRefreshView(true);
}
function syncCanRender(){
  const a = document.activeElement;
  if(a && a.matches && a.matches('input, textarea, select') && a.closest && a.closest('#panel, #sheetOverlay, #modalOverlay')) return false;
  if(isModalOpen() || isSheetOpen() || isPhotoEditorOpen() || isViewerOpen()) return false;
  if(typeof isScannerOpen==='function' && isScannerOpen()) return false;
  if(typeof tourActive!=='undefined' && tourActive) return false;
  return true;
}
/* Repinta lo que depende de la sincronización: el punto de Ajustes, la fila de
   Ajustes y la pantalla de Cuenta. Si llegaron cambios de la nube, la pantalla
   se repinta en cuanto no estés escribiendo ni con un diálogo abierto. */
function syncUpdateSettingsRow(){
  const el = document.getElementById('syncSettingsRow');
  if(!el) return;
  const html = syncSettingsRowHTML();
  if(html===SYNC.rowHtml && el.isConnected) return;     // sin cambios: no se toca (no se pierden toques)
  const focused = document.activeElement===el;
  SYNC.rowHtml = html;
  el.outerHTML = html;
  if(focused){ const n = document.getElementById('syncSettingsRow'); if(n) n.focus(); }
}
function syncRefreshView(statusChanged, force){
  syncUpdateDot();
  syncUpdateSettingsRow();
  const onPage = view && view.page==='cuenta' && !view.productId;
  const wantPage = onPage && (statusChanged || force);
  if(!SYNC.pendingRender && !wantPage) return;
  if(onPage && !force){
    const a = document.activeElement;
    if(a && a.closest && a.closest('#syncForm')) return;    // no se borra lo que estás escribiendo
  }
  if(syncCanRender() || (force && onPage && !isModalOpen())){ SYNC.pendingRender = false; clearTimeout(SYNC.renderTimer); render(); return; }
  clearTimeout(SYNC.renderTimer);
  SYNC.renderTimer = setTimeout(()=>syncRefreshView(false), 1500);
}
function syncProgressView(full){
  if(full) return syncRefreshView(true);
  const P = SYNC.progress; if(!P) return;
  if(!(view && view.page==='cuenta' && !view.productId)){ syncUpdateSettingsRow(); return; }
  const set = (id, txt)=>{ const el = document.getElementById(id); if(el) el.textContent = txt; };
  const bar = (id, a)=>{ const el = document.getElementById(id); if(el && a) el.style.width = (a[1] ? Math.round(100 * a[0] / a[1]) : 100) + '%'; };
  if(!document.getElementById('syncBarPhotos') && P.big && P.photos){ syncRefreshView(true); return; }
  if(P.units){ set('syncCountUnits', syncOf(P.units)); bar('syncBarUnits', P.units); }
  if(P.photos){ set('syncCountPhotos', syncOf(P.photos)); bar('syncBarPhotos', P.photos); set('syncEta', syncEtaText(P)); }
}
function syncOf(a){ const f = (n)=> Number(n).toLocaleString(numLocale()); return t('sync.n_of').replace('{a}', f(a[0])).replace('{b}', f(a[1])); }
function syncEtaText(P){
  if(!P.photos || P.photos[0] < 3 || !P.tPhotos) return '';
  const el = Date.now() - P.tPhotos, left = P.photos[1] - P.photos[0];
  if(left<=0) return '';
  const ms = el / P.photos[0] * left;
  if(ms < 60000) return t('sync.eta_one');
  return t('sync.eta_min').replace('{n}', Math.round(ms / 60000));
}
function syncAgo(ms){
  if(!ms) return t('sync.never');
  const s = Math.round((Date.now() - ms) / 1000);
  if(s < 60) return t('sync.just_now');
  try{
    const rtf = new Intl.RelativeTimeFormat(OVERRIDES.lang || 'es', { numeric:'auto', style:'short' });
    if(s < 3600) return rtf.format(-Math.round(s/60), 'minute');
    if(s < 86400) return rtf.format(-Math.round(s/3600), 'hour');
    return rtf.format(-Math.round(s/86400), 'day');
  }catch(e){ return new Date(ms).toLocaleString(numLocale()); }
}
function syncWhen(ms){
  if(!ms) return '';
  const d = new Date(ms), now = new Date();
  const time = d.toLocaleTimeString(numLocale(), { hour:'2-digit', minute:'2-digit' });
  if(d.toDateString()===now.toDateString()) return t('sync.today_at').replace('{t}', time);
  return d.toLocaleDateString(numLocale(), { day:'numeric', month:'short' }) + ', ' + time;
}
function syncNeedsAttention(){
  if(!SYNC.auth) return false;
  if(SYNC.auth.expired) return true;
  const st = SYNC.status;
  if(st==='choose' || st==='guard' || st==='local-error') return true;
  if((st==='offline' || st==='error' || st==='cloud-paused' || st==='paused') && syncPendingCount() > 0) return true;
  return false;
}
function syncUpdateDot(){
  const btn = document.getElementById('settingsToggle');
  if(!btn) return;
  const on = syncNeedsAttention();
  btn.classList.toggle('sync-dot', on);
  const label = t('settings.title') + (on ? ' · ' + t('sync.dot_label') : '');
  btn.setAttribute('aria-label', label); btn.title = label;
}
/* Tono, icono y texto corto del estado (fila de Ajustes y tarjeta) */
function syncView(){
  const n = syncPendingCount();
  if(!SYNC.auth) return { tone:'off', icon:'cloud', sub:t('sync.row_off') };
  if(SYNC.auth.expired) return { tone:'err', icon:'cloudOff', sub:t('sync.row_session') };
  const P = SYNC.progress;
  switch(SYNC.status){
    case 'choose': return { tone:'warn', icon:'cloud', sub:t('sync.row_choose') };
    case 'guard': return { tone:'warn', icon:'cloud', sub:t('sync.row_guard') };
    case 'local-error': return { tone:'err', icon:'cloudOff', sub:t('sync.row_local_error') };
    case 'offline': return { tone:'warn', icon:'cloudOff', sub: n ? t(n===1 ? 'sync.row_offline_one' : 'sync.row_offline').replace('{n}', n) : t('sync.row_offline_0') };
    case 'paused': return { tone:'warn', icon:'pause', sub:t('sync.row_paused') };
    case 'cloud-paused': return { tone:'err', icon:'cloudOff', sub:t('sync.row_cloud_paused') };
    case 'error': return SYNC.failures >= 2 || SYNC.lastError==='local-save' ? { tone:'err', icon:'cloudOff', sub:t('sync.row_error') } : { tone:'warn', icon:'cloud', sub:t('sync.row_retrying') };
    case 'syncing':
      if(P && P.photos && P.photos[1]) return { tone:'warn', icon: P.dir==='down' ? 'cloudDown' : 'cloudUp', sub:t(P.dir==='down' ? 'sync.row_down' : 'sync.row_up').replace('{a}', P.photos[0]).replace('{b}', P.photos[1]) };
      return { tone:'warn', icon:'cloud', sub:t('sync.syncing') };
    default:
      if(n) return { tone:'warn', icon:'cloud', sub:t(n===1 ? 'sync.pending_one' : 'sync.pending_n').replace('{n}', n) };
      return { tone:'ok', icon:'cloudCheck', sub:t('sync.row_ok').replace('{t}', syncAgo(SYNC.meta && SYNC.meta.lastOk)) };
  }
}
function syncSettingsRowHTML(){
  const v = syncView(), off = !SYNC.auth;
  return `<button type="button" class="sync-row${off ? ' is-off' : ''}" id="syncSettingsRow" onclick="closeSheet(); goPage('cuenta')">
    <span class="sync-ic tone-${v.tone}">${icon(v.icon)}</span>
    <span class="row-text"><span class="row-name">${t('sync.title')}</span><span class="sync-row-sub tone-${v.tone}">${off ? '' : '<span class="sync-mark" aria-hidden="true"></span>'}${escapeHTML(v.sub)}</span></span>
    ${icon('chevronRight')}</button>`;
}
function syncNoteHTML(cls, ic, title, body, actions){
  const head = title ? `<div class="sync-note-title">${icon(ic)}<b>${title}</b></div>` : '';
  return `<div class="note ${cls} sync-note" role="status">${head}<div class="sync-note-body">${body}</div>${actions ? `<div class="note-actions">${actions}</div>` : ''}</div>`;
}
function renderCuenta(){
  return `<div class="sync-page">${syncPageHTML()}</div>`;
}
function syncPageHTML(){
  const S = SYNC;
  if(!S.auth || S.auth.expired) return screenHeadHTML({ kicker:t('settings.title'), title:t('sync.title'), sub: S.auth ? '' : t('sync.intro') }) + syncLoginHTML();
  if(S.status==='choose' && S.choice) return syncChoiceHTML();
  const head = screenHeadHTML({ kicker:t('settings.title'), title:t('sync.title') });
  if(S.progress && S.progress.big && S.status==='syncing') return head + syncTransferHTML();
  return head + syncMainHTML();
}
function syncLoginHTML(){
  const S = SYNC, expired = !!(S.auth && S.auth.expired);
  const email = expired ? S.auth.user.email || '' : '';
  return `${expired ? syncNoteHTML('note-error', 'cloudOff', t('sync.session_title'), t('sync.session_body')) : ''}
  <form class="sync-form" id="syncForm" data-nosave onsubmit="syncLoginSubmit(event)" novalidate>
    <div class="field"><label for="syncEmail">${t('sync.email')}</label>
      <input id="syncEmail" type="email" autocomplete="username" inputmode="email" autocapitalize="off" spellcheck="false" placeholder="tu@correo.com" value="${escapeHTML(email)}"></div>
    <div class="field"><label for="syncPass">${t('sync.password')}</label>
      <div class="sync-pass"><input id="syncPass" type="password" autocomplete="current-password">
      <button type="button" class="sync-pass-toggle" id="syncPassToggle" onclick="syncTogglePass()" aria-pressed="false" aria-label="${t('sync.show_label')}">${t('sync.show')}</button></div></div>
    <div class="sync-form-error" id="syncLoginError" role="alert">${escapeHTML(S.loginError)}</div>
    <button type="submit" class="btn primary btn-block sync-big-btn${S.loginBusy ? ' is-busy' : ''}" id="syncLoginBtn">${S.loginBusy ? t('sync.signing_in') : t('sync.signin')}</button>
  </form>
  <p class="sync-foot is-left">${t('sync.no_signup')}</p>
  <div class="sync-privacy">${icon('lock')}<span>${t('sync.privacy')}</span></div>
  ${syncPresyncNotesHTML()}
  ${expired ? `<div class="sync-center"><button type="button" class="sync-link" onclick="syncSignOut(true)">${t('sync.signout')}</button></div>` : ''}`;
}
function syncChoiceHTML(){
  const C = SYNC.choice;
  const counts = (o)=> t('sync.counts').replace('{p}', Number(o.pieces).toLocaleString(numLocale())).replace('{f}', Number(o.photos).toLocaleString(numLocale()));
  return screenHeadHTML({ kicker:t('sync.first_kicker'), title:t('sync.first_title'), sub:t('sync.first_sub') }) + `
  <div class="sync-card sync-compare">
    <div class="sync-compare-row"><span class="sync-ic tone-ok">${icon('cloud')}</span><span class="sync-compare-text"><b>${t('sync.in_cloud')}</b><span>${counts(C.cloud)}${C.cloud.last ? ' · ' + t('sync.changed_at').replace('{d}', syncWhen(C.cloud.last)) : ''}</span></span></div>
    <div class="sync-compare-row"><span class="sync-ic tone-off">${icon('device')}</span><span class="sync-compare-text"><b>${t('sync.in_device')}</b><span>${counts(C.local)}</span></span></div>
  </div>
  <div class="backup-hero sync-choice">
    <button type="button" class="backup-btn backup-btn-export" id="syncUseCloud" onclick="syncChoose('cloud')">
      <span class="backup-btn-icon">${icon('download')}</span><span class="backup-btn-label">${t('sync.use_cloud')}</span><span class="backup-btn-sub">${t('sync.use_cloud_sub')}</span></button>
    <button type="button" class="backup-btn backup-btn-import" id="syncUseLocal" onclick="syncChoose('local')">
      <span class="backup-btn-icon">${icon('upload')}</span><span class="backup-btn-label">${t('sync.use_local')}</span><span class="backup-btn-sub">${t('sync.use_local_sub')}</span></button>
  </div>
  <div class="sync-center"><button type="button" class="sync-link" id="syncNotNow" onclick="syncSignOut(true)">${t('sync.not_now')}</button></div>`;
}
function syncTransferHTML(){
  const P = SYNC.progress, up = P.dir!=='down';
  const row = (label, a, idCount, idBar, cls, extra)=>{
    const done = a && a[0]>=a[1];
    return `<div class="sync-bar-row">
      <div class="sync-bar-head"><span class="sync-bar-label">${label}</span><span class="sync-bar-count${done ? ' is-done' : ''}">${done ? icon('check') : ''}<span id="${idCount}">${a ? syncOf(a) : t('sync.comparing')}</span></span></div>
      <div class="sync-bar ${cls}"><div id="${idBar}" style="width:${a ? (a[1] ? Math.round(100*a[0]/a[1]) : 100) : 0}%"></div></div>${extra || ''}</div>`;
  };
  const showUnits = P.units || P.label, showPhotos = P.photos || P.label;
  return `<div class="sync-card sync-transfer">
    <span class="sync-ic sync-ic-xl tone-warn">${icon(up ? 'cloudUp' : 'cloudDown')}</span>
    <span class="sync-transfer-title">${t(up ? 'sync.uploading' : 'sync.downloading')}</span>
    <span class="sync-transfer-sub">${t('sync.transfer_sub')}</span>
  </div>
  <div class="sync-bars">
    ${showUnits ? row(t('sync.cards'), P.units, 'syncCountUnits', 'syncBarUnits', 'is-ok') : ''}
    ${showPhotos ? row(t('sync.photos'), P.photos, 'syncCountPhotos', 'syncBarPhotos', 'is-gold', `<span class="sync-eta" id="syncEta">${escapeHTML(syncEtaText(P))}</span>`) : ''}
  </div>
  <div class="note note-warn sync-wifi">${t('sync.wifi')}</div>
  <button type="button" class="btn btn-block sync-mid-btn" id="syncPauseBtn" onclick="syncPause()">${icon('pause')} ${t('sync.pause')}</button>`;
}
function syncPresyncNotesHTML(){
  if(!SYNC.presync) return '';
  return SYNC.presync.map(c=> syncNoteHTML('note-info', 'archive', t('sync.presync_title'),
      t(c.photos ? 'sync.presync_body' : 'sync.presync_body_0').replace('{d}', escapeHTML(syncWhen(syncTs(c.savedAt)))).replace('{n}', c.photos),
      `<button type="button" class="btn btn-sm" data-presync-dl="${escapeHTML(c.savedAt)}" onclick="syncPresyncDownload(this.dataset.presyncDl)">${icon('download')} ${t('sync.presync_download')}</button><button type="button" class="btn btn-sm btn-ghost" data-presync-del="${escapeHTML(c.savedAt)}" onclick="syncPresyncDelete(this.dataset.presyncDel)">${t('sync.presync_delete')}</button>`)).join('');
}
function syncMainHTML(){
  const S = SYNC, M = S.meta || syncNewMeta(''), st = S.status, n = syncPendingCount();
  const v = syncView();
  const pendingText = n ? t(n===1 ? 'sync.pending_one' : 'sync.pending_n').replace('{n}', n) : '';
  const ago = M.lastOk ? t('sync.synced_ago').replace('{t}', syncAgo(M.lastOk)) + ' · ' + t('sync.this_device') : t('sync.never');
  const titles = { offline:'sync.offline_title', paused:'sync.paused_title', 'cloud-paused':'sync.cloud_paused_title', guard:'sync.guard_title', 'local-error':'sync.local_error_title' };
  let title, sub = ago;
  if(st==='syncing'){ title = t('sync.syncing'); if(n) sub = pendingText; }
  else if(st==='ok' && !n) title = t('sync.ok');
  else if(st==='error') title = (S.failures >= 2 || S.lastError==='local-save') ? t('sync.error_title') : t('sync.syncing');
  else if(titles[st]){ title = t(titles[st]); if(n) sub = pendingText; }
  else title = n ? pendingText : t('sync.ok');
  let html = `<div class="sync-card sync-status-card" id="syncStatusCard">
    <span class="sync-ic sync-ic-lg tone-${v.tone}">${icon(v.icon)}</span>
    <span class="sync-status-text"><span class="sync-status-title">${escapeHTML(title)}</span><span class="sync-status-sub">${escapeHTML(sub)}</span></span>
  </div>`;
  // avisos (los de estado no repiten el título: ya está en la tarjeta de arriba)
  if(st==='local-error') html += syncNoteHTML('note-error', 'cloudOff', '', t('sync.local_error_body'));
  if(st==='offline') html += syncNoteHTML('note-warn', 'cloudOff', '', n ? t(n===1 ? 'sync.offline_body_one' : 'sync.offline_body_n').replace('{n}', n) : t('sync.offline_body_0'));
  if(st==='cloud-paused') html += syncNoteHTML('note-error', 'pause', '', t('sync.cloud_paused_body'),
      `<a class="btn btn-sm" href="${SYNC_PROJECT_URL}" target="_blank" rel="noopener">${t('sync.open_supabase')} ${icon('external')}</a><button type="button" class="btn btn-sm btn-ghost" onclick="syncNow()">${t('sync.retry')}</button>`);
  if(st==='error' && (S.failures >= 2 || S.lastError==='local-save')) html += S.lastError==='local-save'
      ? syncNoteHTML('note-error', 'cloudOff', '', t('sync.save_error'), `<button type="button" class="btn btn-sm" onclick="syncNow()">${t('sync.retry')}</button>`)
      : syncNoteHTML('note-error', 'cloudOff', '', t('sync.error_body'),
        `<button type="button" class="btn btn-sm" onclick="syncNow()">${t('sync.retry')}</button><a class="btn btn-sm btn-ghost" href="${SYNC_PROJECT_URL}" target="_blank" rel="noopener">${t('sync.open_supabase')} ${icon('external')}</a>`);
  if(st==='paused') html += syncNoteHTML('note-warn', 'pause', '', t('sync.paused_body'),
      `<button type="button" class="btn btn-sm" id="syncResumeBtn" onclick="syncResume()">${icon('refresh')} ${t('sync.resume')}</button>`);
  if(st==='guard' && S.removal) html += syncNoteHTML('note-warn', 'cloud', '',
      t(!S.removal.f ? 'sync.guard_body_p' : !S.removal.p ? 'sync.guard_body_f' : 'sync.guard_body').replace('{p}', S.removal.p).replace('{f}', S.removal.f),
      `<button type="button" class="btn btn-sm" id="syncGuardRestore" onclick="syncGuardDecide(false)">${t('sync.guard_restore')}</button><button type="button" class="btn btn-sm btn-danger" id="syncGuardRemove" onclick="syncGuardDecide(true)">${t('sync.guard_remove')}</button>`);
  if(M.notices && M.notices.length){
    const items = M.notices.slice(0, 5).map(x=> `<li>${escapeHTML(t(x.who==='here' ? 'sync.conflict_here' : 'sync.conflict_other').replace('{name}', x.name).replace('{d}', syncWhen(x.at)))}</li>`).join('');
    html += syncNoteHTML('note-info', 'flip', t('sync.conflict_title'), `<ul class="sync-notices">${items}</ul>`,
      `<button type="button" class="btn btn-sm" id="syncNoticesOk" onclick="syncClearNotices()">${t('sync.got_it')}</button>`);
  }
  const rejected = syncRejectedNow(M).length;
  if(rejected) html += syncNoteHTML('note-warn', 'cloud', t('sync.skipped_title'), t('sync.skipped_n').replace('{n}', rejected),
      `<button type="button" class="btn btn-sm" onclick="syncClearSkipped()">${t('sync.retry')}</button>`);
  html += syncPresyncNotesHTML();
  // cifras
  let photos = 0, bytes = 0;
  Object.keys(M.pbase).forEach(k=>{ const b = M.pbase[k]; if(syncLive(b) && b[0] > 0){ photos++; bytes += b[0] * 0.75; } });
  const pieces = M.bound ? syncCountPieces(OVERRIDES) : 0;
  const mb = bytes / 1048576;
  const used = mb >= 1024 ? (mb/1024).toLocaleString(numLocale(), { maximumFractionDigits:2 }) + ' GB'
    : mb.toLocaleString(numLocale(), { maximumFractionDigits: mb < 10 ? 1 : 0 }) + ' MB';
  const pct = Math.min(100, Math.max(bytes ? 1 : 0, Math.round(100 * bytes / SYNC_STORAGE_LIMIT)));
  html += `<div class="sync-stats">
    <div class="sync-stat"><span class="sync-stat-n">${pieces.toLocaleString(numLocale())}</span><span class="sync-stat-l">${t('sync.pieces_cloud')}</span></div>
    <div class="sync-stat"><span class="sync-stat-n">${photos.toLocaleString(numLocale())}</span><span class="sync-stat-l">${t('sync.photos_cloud')}</span></div>
  </div>
  <div class="sync-space">
    <div class="sync-bar-head"><span class="sync-bar-label">${t('sync.space')}</span><span class="sync-bar-count">${t('sync.space_of').replace('{u}', used)}</span></div>
    <div class="sync-bar is-ok${pct >= 85 ? ' is-full' : ''}"><div style="width:${pct}%"></div></div>
  </div>
  <div class="sync-account">
    <span class="sync-avatar" aria-hidden="true">${escapeHTML((S.auth.user.email || '?').charAt(0).toUpperCase())}</span>
    <span class="sync-account-text"><span class="sync-account-name">${t('sync.your_account')}</span><span class="sync-email">${escapeHTML(S.auth.user.email || '')}</span></span>
    <button type="button" class="sync-link" id="syncSignOut" onclick="syncSignOut()">${t('sync.signout')}</button>
  </div>
  <div class="sync-actions">
    <button type="button" class="btn primary btn-block sync-big-btn${st==='syncing' ? ' is-busy' : ''}" id="syncNow" onclick="syncNow()">${icon('refresh')} ${st==='syncing' ? t('sync.syncing') : t('sync.sync_now')}</button>
    <p class="sync-foot">${t('sync.foot')}</p>
  </div>`;
  return html;
}
function syncNow(){
  if(!SYNC.auth || SYNC.auth.expired) return;
  if(SYNC.meta && SYNC.meta.paused) return syncResume();
  SYNC.failures = Math.min(SYNC.failures, 1); SYNC.retryAt = 0;
  if(!navigator.onLine){ syncSetStatus('offline'); return; }
  syncSetStatus('syncing');
  syncRun();
}
async function syncPause(){
  await syncEditMeta(M=>{ M.paused = true; });
  syncSetStatus('paused');
}
async function syncResume(){
  await syncEditMeta(M=>{ M.paused = false; });
  SYNC.retryAt = 0;
  syncSetStatus('syncing');
  syncRun();
}
async function syncClearNotices(){ const at = Date.now(); await syncEditMeta(M=>{ M.notices = (M.notices || []).filter(n=> (n.t || 0) > at); }); syncRefreshView(true, true); }
async function syncClearSkipped(){ const keys = Object.keys((SYNC.meta && SYNC.meta.rejected) || {}); await syncEditMeta(M=>{ keys.forEach(k=>{ delete M.rejected[k]; }); }); syncNow(); }
/* Al entrar en la pantalla de Cuenta */
function syncOnOpen(){
  syncPresyncInfo().then(()=>{ if(view.page==='cuenta' && SYNC.presync) syncRefreshView(true); });
  if(SYNC.auth && !SYNC.auth.expired && !SYNC.busy && Date.now() - SYNC.lastRunAt > 20000) syncSchedule(300);
}

/* ---------- Arranque ---------- */
async function syncStart(){
  const a = await syncReadKV('sync_auth');
  if(!SYNC.auth) SYNC.auth = (a.ok && a.value && a.value.user && a.value.user.id) ? a.value : null;
  const m = await syncReadKV('sync_meta');
  if(!SYNC.meta) SYNC.meta = (m.ok && m.value && m.value.v===1) ? syncNormMeta(m.value) : null;
  SYNC.ready = true;
  if(SYNC.foreignPending){ SYNC.foreignPending = false; syncOnMessage({ data:{ t:'saved' } }); }
  window.addEventListener('pagehide', ()=>{ syncFlushMarks(); });
  document.addEventListener('visibilitychange', ()=>{ if(document.visibilityState==='hidden') syncFlushMarks(); });
  if(SYNC.auth && SYNC.auth.expired) SYNC.status = 'session';
  else if(SYNC.auth) SYNC.status = navigator.onLine ? 'syncing' : 'offline';
  syncRefreshView(true);
  if(SYNC.auth && !SYNC.auth.expired) syncSchedule(1200);
  window.addEventListener('online', ()=>{ if(SYNC.auth && !SYNC.auth.expired){ SYNC.failures = 0; SYNC.retryAt = 0; syncSchedule(500); } });
  window.addEventListener('offline', ()=>{ if(SYNC.auth && !SYNC.auth.expired && !SYNC.busy) syncSetStatus('offline'); });
  document.addEventListener('visibilitychange', ()=>{
    if(document.visibilityState==='visible' && SYNC.auth && !SYNC.auth.expired && Date.now() - SYNC.lastRunAt > 30000) syncSchedule(400);
  });
  // con la app abierta, se miran los cambios de tus otros dispositivos cada 90 s
  setInterval(()=>{
    if(document.visibilityState==='visible' && SYNC.auth && !SYNC.auth.expired && !SYNC.busy && navigator.onLine
       && Date.now() - SYNC.lastRunAt > 80000 && Date.now() >= SYNC.retryAt) syncRun();
  }, 30000);
}
