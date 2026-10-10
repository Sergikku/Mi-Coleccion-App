/* La Colección App — estanteria.js (v11.11)
   «Tu estantería»: la colección colocada en muebles en 3D (solo CSS, sin
   librerías, funciona sin conexión).
   · Muebles con baldas a medida (ancho, fondo, alto de cada balda), y
     también encima del mueble.
   · Por defecto las piezas van en orden, de lomo y una al lado de otra.
     Cada una se puede poner de lomo, de frente, en diagonal o tumbada,
     girar, mover por la balda y apilar encima de otra.
   · Madera, puertas de cristal, luz LED, placas, pared; día y noche.
   · «Sacarla»: la pieza en grande, girando, con sus fotos (sin el margen
     blanco). En el ordenador, la sala con todos los muebles.
   Datos (nuevos, en tu colección; una versión anterior los conserva sin verlos):
     estanterias = { v:1, pared, medidasPlataforma:{ <plataforma>:{ancho,alto,fondo} },
       muebles:[{ id, nombre, ancho, fondo, madera, puertas, luz, placas,
                  encima:{ items:[…] }, baldas:[{ id, alto, placa, items:[…] }] }] }
     item = { pid, pose:'lomo'|'portada'|'diagonal'|'tumbado', rot (grados), dx (cm), apilado }
   Las medidas de cada pieza: las suyas (ficha), las de su plataforma o las
   estándar (plano.js, piezaDims). */

/* =====================================================================
   1. DATOS
   ===================================================================== */
const EST_WOODS = {
  roble:  { f:'#b98b57', s:'#a07646', t:'#caa06b', e:'#8b6439', g:'rgba(80,48,20,0.16)' },
  nogal:  { f:'#6f4b30', s:'#5b3d27', t:'#7f5838', e:'#4a311f', g:'rgba(30,16,6,0.22)' },
  wengue: { f:'#3c2b21', s:'#2f2119', t:'#4a362b', e:'#24180f', g:'rgba(0,0,0,0.25)' },
  blanco: { f:'#ebe6dc', s:'#d9d3c7', t:'#f4f0e8', e:'#c9c2b4', g:'rgba(120,100,70,0.06)' },
  negro:  { f:'#26272c', s:'#1d1e22', t:'#303238', e:'#141518', g:'rgba(255,255,255,0.04)' },
};
const EST_LIGHTS = { apagada:null, calida:'#ffcf8a', fria:'#cfe2ff', plataforma:'plat' };
const EST_PLATES = { laton:['#b98f3e','#f3d98e','#8a6524'], plata:['#9aa1ab','#eef1f5','#6d737c'], sin:null };
const EST_WALLS = ['lisa', 'ladrillo', 'madera', 'oscura'];
const EST_DOORS = ['sin', 'cristal', 'ahumado'];
const EST_POSES = ['lomo', 'portada', 'diagonal', 'tumbado'];
const EST_T = 1.8;            // grosor de tableros (cm)
const EST_PLINTH = 8, EST_CROWN = 6, EST_GAP = 0.35, EST_FRONT = 1.5;
const EST_TOP_H = 60;         // alto útil encima del mueble (cm)
const EST_MAX_BALDAS = 12;
function estUid(prefix){ return prefix + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function estNum(v, lo, hi, def){ v = Number(v); return isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def; }
function estIsObj(v){ return !!v && typeof v==='object' && !Array.isArray(v); }
function estOkId(v){ return typeof v==='string' && /^[\w-]{1,64}$/.test(v); }
/* Sanea una fila EN SU SITIO: mismos objetos y se conservan los campos que
   no conoce esta versión (por si los añade una versión posterior). */
function estCleanItems(arr){
  if(!Array.isArray(arr)) return [];
  const out = arr.filter(it=> estIsObj(it) && typeof it.pid==='string' && it.pid);
  out.forEach(it=>{
    if('pose' in it && !(EST_POSES.includes(it.pose) && it.pose!=='lomo')) delete it.pose;
    if('rot' in it){ const r = Math.round(estNum(it.rot, -180, 180, 0)); if(r) it.rot = r; else delete it.rot; }
    if('dx' in it){ const dx = Math.round(estNum(it.dx, -5, 300, 0) * 10) / 10; if(dx) it.dx = dx; else delete it.dx; }
    if('apilado' in it && it.apilado!==true) delete it.apilado;
  });
  return out.length===arr.length ? arr : out;
}
/* Lee (y sanea) los datos; nunca devuelve null. Se sanea una vez por cada
   objeto nuevo (al cargar, al sincronizar o al importar): las ediciones de
   la app ya dejan los valores bien. */
let _estClean = null;
function estData(){
  const E = OVERRIDES.estanterias;
  if(!estIsObj(E)) return { v:1, pared:'lisa', medidasPlataforma:{}, muebles:[] };
  if(_estClean===E) return E;
  if(!Array.isArray(E.muebles)) E.muebles = [];
  if(E.muebles.some(m=> !estIsObj(m))) E.muebles = E.muebles.filter(estIsObj);
  const ids = new Set();
  E.muebles.forEach(m=>{
    if(!estOkId(m.id) || ids.has(m.id)) m.id = estUid('m');
    ids.add(m.id);
    m.nombre = String(m.nombre || '');
    m.ancho = estNum(m.ancho, 30, 400, 100); m.fondo = estNum(m.fondo, 15, 80, 32);
    if(!EST_WOODS[m.madera]) m.madera = 'nogal';
    if(!EST_DOORS.includes(m.puertas)) m.puertas = 'cristal';
    if(!(m.luz in EST_LIGHTS)) m.luz = 'calida';
    if(!(m.placas in EST_PLATES)) m.placas = 'laton';
    if(!estIsObj(m.encima)) m.encima = { items:[] };
    m.encima.items = estCleanItems(m.encima.items);
    if(!Array.isArray(m.baldas)) m.baldas = [];
    if(m.baldas.length > EST_MAX_BALDAS || m.baldas.some(b=> !estIsObj(b))) m.baldas = m.baldas.filter(estIsObj).slice(0, EST_MAX_BALDAS);
    m.baldas.forEach(b=>{ if(!estOkId(b.id) || ids.has(b.id)) b.id = estUid('b'); ids.add(b.id); b.alto = estNum(b.alto, 6, 80, 22); b.placa = String(b.placa || ''); b.items = estCleanItems(b.items); });
  });
  if(!EST_WALLS.includes(E.pared)) E.pared = 'lisa';
  if(!estIsObj(E.medidasPlataforma)) E.medidasPlataforma = {};
  E.v = 1;
  _estClean = E;
  return E;
}
function estEnsure(){
  if(!estIsObj(OVERRIDES.estanterias)) OVERRIDES.estanterias = { v:1, pared:'lisa', medidasPlataforma:{}, muebles:[] };
  return estData();
}
function estHas(){ return estIsObj(OVERRIDES.estanterias) && Array.isArray(OVERRIDES.estanterias.muebles) && OVERRIDES.estanterias.muebles.length > 0; }
/* ¿Es una pieza que existe? (una borrada sigue en la estantería por si la
   recuperas, pero no se ve ni cuenta) */
function estKnown(it){ return !!(it && PRODUCTS_BY_ID[it.pid]); }
function estKnownCount(items){ return items.reduce((a, it)=> a + (estKnown(it) ? 1 : 0), 0); }
/* Guardado: al momento en memoria; en disco, agrupando cambios seguidos */
let _estSaveTimer = null;
function estSave(now){
  clearTimeout(_estSaveTimer);
  if(now) return estFlush();
  _estSaveTimer = setTimeout(estFlush, 450);
}
async function estFlush(){
  clearTimeout(_estSaveTimer); _estSaveTimer = null;
  return persistOverrides();
}
document.addEventListener('visibilitychange', ()=>{ if(document.visibilityState==='hidden' && _estSaveTimer) estFlush(); });
async function estSetPlatformDims(platId, dims){
  const E = estEnsure();
  E.medidasPlataforma[platId] = dims;
  await estSave(true);
}
function estMueble(mid){ return estData().muebles.find(m=>m.id===mid) || null; }
/* Superficie: 'top' (encima) o el id de una balda */
function estSurface(m, sid){ return !m ? null : sid==='top' ? m.encima : (m.baldas.find(b=>b.id===sid) || null); }
/* ¿Dónde está una pieza? */
function estFind(pid){
  for(const m of estData().muebles){
    let i = m.encima.items.findIndex(it=>it.pid===pid);
    if(i >= 0) return { m, sid:'top', i, n:0 };
    for(let k=0;k<m.baldas.length;k++){ i = m.baldas[k].items.findIndex(it=>it.pid===pid); if(i >= 0) return { m, sid:m.baldas[k].id, i, n:k + 1 }; }
  }
  return null;
}
function estPlacedSet(){
  const s = new Set();
  estData().muebles.forEach(m=>{ m.encima.items.forEach(it=>s.add(it.pid)); m.baldas.forEach(b=>b.items.forEach(it=>s.add(it.pid))); });
  return s;
}
/* Quita una pieza de donde esté (cada pieza va en un solo sitio) */
function estUnplace(pid){
  estData().muebles.forEach(m=>{
    [m.encima].concat(m.baldas).forEach(sf=>{
      const i = sf.items.findIndex(it=>it.pid===pid);
      if(i >= 0){ const was = sf.items[i]; sf.items.splice(i, 1); if(!was.apilado && sf.items[i] && sf.items[i].apilado) delete sf.items[i].apilado; }
    });
  });
}
function estNewMueble(nombre){
  return { id:estUid('m'), nombre: nombre || t('est.mueble_default'), ancho:100, fondo:32, madera:'nogal', puertas:'cristal', luz:'calida', placas:'laton', encima:{ items:[] }, baldas:[] };
}

/* =====================================================================
   2. COLOCACIÓN (cálculo puro, en cm)
   ===================================================================== */
/* Tamaño que ocupa una pieza según cómo está puesta */
function estItemBox(it, p){
  const d0 = piezaDims(p);
  const pose = it.pose || 'lomo';
  const base = pose==='lomo' ? 90 : pose==='diagonal' ? 35 : 0;
  const th = (base + (it.rot || 0)) * Math.PI / 180;
  const c = Math.abs(Math.cos(th)), s = Math.abs(Math.sin(th));
  if(pose==='tumbado') return { fw: d0.h * c + d0.w * s, fd: d0.h * s + d0.w * c, hgt: d0.d, dims:d0, pose, ang: base + (it.rot || 0) };
  return { fw: d0.w * c + d0.d * s, fd: d0.w * s + d0.d * c, hgt: d0.h, dims:d0, pose, ang: base + (it.rot || 0) };
}
/* Coloca una fila: columnas de izquierda a derecha (las apiladas, encima de
   la anterior). Devuelve la posición de cada pieza y lo que no cabe. */
function estLayout(items, W, H){
  const cols = [], out = [];
  let cursor = EST_GAP;
  items.forEach((it, idx)=>{
    const p = PRODUCTS_BY_ID[it.pid]; if(!p) return;
    const b = estItemBox(it, p);
    const rec = { it, idx, p, b, y:0 };
    const last = cols[cols.length - 1];
    if(it.apilado && last){
      rec.y = last.top; last.top += b.hgt; last.items.push(rec);
      if(b.fw > last.fw){ cursor += b.fw - last.fw; last.fw = b.fw; }
    } else {
      const x = cursor + Math.max(-EST_GAP, it.dx || 0);
      const col = { x, fw:b.fw, top:b.hgt, items:[rec] };
      cols.push(col);
      cursor = x + b.fw + EST_GAP;
    }
    out.push(rec);
  });
  const over = [], tall = [];
  cols.forEach(c=>{
    c.items.forEach(r=>{ r.x = c.x + c.fw / 2; r.colW = c.fw; });
    if(c.x + c.fw > W + 0.01) c.items.forEach(r=> over.push(r.p.id));
    else if(c.top > H + 0.01) c.items.forEach(r=> tall.push(r.p.id));
  });
  return { recs:out, cols, used: cursor, over, tall };
}
function estSurfaceH(m, sid){ if(sid==='top') return EST_TOP_H; const b = estSurface(m, sid); return b ? b.alto : 0; }
/* Placa automática: las plataformas de la balda (y lo que tienes de ellas ahí) */
function estAutoPlate(b){
  const codes = [], seen = new Set(); let have = 0, tot = 0;
  b.items.forEach(it=>{ const p = PRODUCTS_BY_ID[it.pid]; if(!p) return; tot++; if(p.possession==='tengo') have++; const c = platVisual(p.platformId).code || '—'; if(!seen.has(c)){ seen.add(c); codes.push(p); } });
  if(!codes.length) return '';
  if(codes.length===1){ const pl = getAllPlatforms().find(x=>x.id===codes[0].platformId); return ((pl ? pl.name : codes[0].platformName) || '').toUpperCase() + ' · ' + have + '/' + tot; }
  return codes.slice(0, 4).map(p=>platVisual(p.platformId).code).join(' · ') + (codes.length > 4 ? ' …' : '');
}
function estPlateText(b){ return b.placa ? b.placa : estAutoPlate(b); }
function estMuebleHeight(m){ return EST_PLINTH + EST_CROWN + m.baldas.reduce((a, b)=>a + b.alto, 0) + Math.max(0, m.baldas.length - 1) * EST_T; }

/* ---------- Montarla con tu colección ----------
   Un mueble por categoría (o varios si no cabe): cada plataforma por orden,
   sus piezas por año, de lomo; las que te faltan dejan su hueco. Las
   plataformas pequeñas comparten balda si son de una altura parecida. */
function estAutoPlan(opts){
  opts = opts || {};
  const ancho = opts.ancho || 100, maxB = opts.maxBaldas || 6, huecos = opts.huecos !== false;
  const placed = opts.skipPlaced ? estPlacedSet() : new Set();
  const muebles = [];
  getAllCategories().forEach(cat=>{
    const plats = orderedPlatformsForCategory(cat.id, getAllPlatforms().filter(p=>p.categoryId===cat.id));
    let m = null, cur = null, part = 1;
    const newM = ()=>{ m = estNewMueble(cat.name + (part > 1 ? ' ' + part : '')); m.ancho = ancho; m._cat = cat.id; muebles.push(m); part++; };
    const newB = (alto)=>{ if(!m || m.baldas.length >= maxB) newM(); cur = { id:estUid('b'), alto, placa:'', items:[], _used:EST_GAP, _plats:0 }; m.baldas.push(cur); };
    plats.forEach(pl=>{
      const list = sortGames(PRODUCTS.filter(p=>p.platformId===pl.id && !placed.has(p.id) && (huecos || p.possession==='tengo')));
      if(!list.length) return;
      const hNeed = Math.min(60, Math.max(12, Math.ceil(Math.max(...list.map(p=>piezaDims(p).h)) + 3)));
      const wNeed = list.reduce((a, p)=>a + estItemBox({ pid:p.id }, p).fw + EST_GAP, 0);
      // comparte la balda anterior (hasta 6 plataformas) si la altura es parecida y cabe entera
      // o queda más de un tercio libre (lo que no quepa sigue en la balda siguiente)
      const fits = cur && cur._plats < 6 && Math.abs(cur.alto - hNeed) <= 15 && (cur._used + wNeed <= ancho || ancho - cur._used >= ancho * 0.3);
      if(fits) cur.alto = Math.max(cur.alto, hNeed); else newB(hNeed);
      cur._plats++;
      list.forEach(p=>{
        const fw = estItemBox({ pid:p.id }, p).fw + EST_GAP;
        if(cur._used + fw > ancho && cur.items.length){ newB(hNeed); cur._plats = 1; }
        cur.items.push({ pid:p.id }); cur._used += fw;
      });
    });
  });
  // un mueble «2» con una sola balda: esa balda va al mueble anterior de la misma categoría
  for(let i = muebles.length - 1; i > 0; i--){
    const a = muebles[i - 1], b = muebles[i];
    if(b._cat===a._cat && b.baldas.length===1 && a.baldas.length < EST_MAX_BALDAS){ a.baldas.push(b.baldas[0]); muebles.splice(i, 1); }
  }
  muebles.forEach(m=>{ delete m._cat; m.baldas.forEach(b=>{ delete b._used; delete b._plats; }); });
  return muebles;
}

/* =====================================================================
   3. FOTOS SIN EL MARGEN BLANCO
   ===================================================================== */
/* Las fotos de la app son cuadradas con blanco alrededor. Para la estantería
   se recorta ese blanco (sin tocar la foto guardada): se busca la zona que no
   es blanca y se hace una copia solo de ella. Devuelve { url, ar, avg, light }
   o null (avg: el color medio de la pieza, para pintar su lomo). */
const _trimCache = new Map(), _trimPending = new Map(), _trimBig = [];
async function estTrimmedPhoto(photoId, side, size){
  const key = photoKeyFor(photoId, side); if(!key) return null;
  const src = await getPhotoURL(photoId, side, size || 'thumb'); if(!src) return null;
  const ck = key + '|' + (size || 'thumb') + '|' + (src.length > 200 ? src.length + ':' + src.slice(-40) : src);
  if(_trimCache.has(ck)) return _trimCache.get(ck);
  if(_trimPending.has(ck)) return _trimPending.get(ck);
  const job = (async ()=>{
    const img = await new Promise(res=>{ const i = new Image(); i.onload = ()=>res(i); i.onerror = ()=>res(null); i.src = src; });
    if(!img) return null;
    const W = img.naturalWidth, H = img.naturalHeight;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d', { willReadFrequently:true }); x.drawImage(img, 0, 0);
    let d; try{ d = x.getImageData(0, 0, W, H).data; }catch(e){ return { url:src, ar:W / H }; }
    const white = (i)=> d[i] > 236 && d[i + 1] > 236 && d[i + 2] > 236;
    const rowInk = (y)=>{ let n = 0; for(let xx=0; xx<W; xx++) if(!white((y * W + xx) * 4)) n++; return n; };
    const colInk = (xx, y0, y1)=>{ let n = 0; for(let y=y0; y<=y1; y++) if(!white((y * W + xx) * 4)) n++; return n; };
    const minR = Math.max(2, W * 0.012);
    let top = 0, bot = H - 1, left = 0, right = W - 1;
    while(top < H - 1 && rowInk(top) < minR) top++;
    while(bot > top && rowInk(bot) < minR) bot--;
    const minC = Math.max(2, (bot - top + 1) * 0.012);
    while(left < W - 1 && colInk(left, top, bot) < minC) left++;
    while(right > left && colInk(right, top, bot) < minC) right--;
    const w = right - left + 1, h = bot - top + 1;
    // color medio (de la parte con la pieza), algo oscurecido para que el nombre en blanco se lea
    const avgOf = (x0, y0, x1, y1)=>{ let r = 0, g = 0, b = 0, n = 0; const st = Math.max(1, Math.floor(Math.min(x1 - x0, y1 - y0) / 40));
      for(let y=y0; y<=y1; y+=st) for(let xx=x0; xx<=x1; xx+=st){ const i = (y * W + xx) * 4; r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
      if(!n) return { avg:null, light:false };
      r /= n; g /= n; b /= n;
      const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      return { avg:`rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`, light: lum > 0.62 }; };
    if(w < W * 0.15 || h < H * 0.15) return Object.assign({ url:src, ar:W / H }, avgOf(0, 0, W - 1, H - 1));
    const col = avgOf(left, top, right, bot);
    if(w > W * 0.985 && h > H * 0.985) return Object.assign({ url:src, ar:W / H }, col);
    const o = document.createElement('canvas'); o.width = w; o.height = h;
    o.getContext('2d').drawImage(c, left, top, w, h, 0, 0, w, h);
    const blob = await new Promise(res=> o.toBlob(b=>res(b), 'image/jpeg', 0.88));
    return Object.assign(blob ? { url: URL.createObjectURL(blob), ar: w / h } : { url:src, ar:W / H }, col);
  })();
  _trimPending.set(ck, job);
  let out = null;
  try{ out = await job; } finally { _trimPending.delete(ck); }
  if(out && (size || 'thumb')==='full'){ if(out.url.startsWith('blob:')) _trimBig.push(out.url); return out; }   // las grandes no se guardan
  if(out){
    _trimCache.set(ck, out);
    // como mucho 600 (las más antiguas se sueltan)
    if(_trimCache.size > 600){ const k0 = _trimCache.keys().next().value, o0 = _trimCache.get(k0); _trimCache.delete(k0); if(o0 && o0.url.startsWith('blob:')) try{ URL.revokeObjectURL(o0.url); }catch(e){} }
  }
  return out;
}
/* Pone las fotos recortadas en las caras que las piden (data-ph="id|lado|tamaño").
   Los lomos (data-ph-avg) llevan el color de su portada, no un trozo de ella. */
function estHydratePhotos(root){
  root.querySelectorAll('[data-ph]:not([data-ph-done])').forEach(el=>{
    el.dataset.phDone = '1';
    const [pid, side, size] = el.dataset.ph.split('|');
    estTrimmedPhoto(pid, side, size).then(r=>{
      if(!r || !document.contains(el)) return;
      if(el.hasAttribute('data-ph-avg')){ if(r.avg){ el.style.backgroundColor = r.avg; el.classList.add('has-avg'); if(r.light) el.classList.add('is-light'); } return; }
      el.style.backgroundImage = `url("${r.url}")`; el.classList.add('has-ph');
    });
  });
}

/* =====================================================================
   4. DIBUJO: siempre de frente, a la altura de la estantería
   ---------------------------------------------------------------------
   No hay cámara libre. Tres niveles fijos:
     · Sala: todos los muebles, uno al lado de otro.
     · Mueble: el mueble entero, de frente. Tocas una balda y entras.
     · Balda: dentro de una balda, de cerca y a su altura; se desliza a
       los lados y se pasa a la de arriba o la de abajo con los botones.
   Cada balda es una caja con su propia perspectiva (fondo, suelo, techo y
   laterales), iluminada por la tira de luz de arriba. Las piezas, de cerca,
   son cajas con sus fotos (se ven de lado las que están a los lados); en el
   mueble entero, lomos planos (mucho más ligero en el móvil).
   ===================================================================== */
const EST = { view:'mueble', mid:null, bsid:null, night:false, doors:false, covers:false, sel:null, s:4, delAsk:false };
function estMid(){
  const E = estData();
  if(!E.muebles.length) return null;
  if(!E.muebles.some(m=>m.id===EST.mid)) EST.mid = E.muebles[0].id;
  return EST.mid;
}
/* Las superficies de un mueble, de arriba abajo: «encima» y las baldas */
function estSurfaceIds(m){ return ['top'].concat(m.baldas.map(b=>b.id)); }
/* La balda que se está viendo de cerca (si ya no existe, la primera con piezas) */
function estBsid(m){
  const ids = estSurfaceIds(m);
  if(EST.bsid && ids.includes(EST.bsid) && (EST.bsid!=='top' || estKnownCount(m.encima.items) || !m.baldas.length)) return EST.bsid;
  EST.bsid = m.baldas.find(b=>estKnownCount(b.items)) ? m.baldas.find(b=>estKnownCount(b.items)).id : (m.baldas[0] ? m.baldas[0].id : 'top');
  return EST.bsid;
}
/* Una cara (rectángulo de w × h px) con su transformación */
function estFace(w, h, tf, cls, style, inner, attrs){
  return `<div class="est-f ${cls || ''}" ${attrs || ''} style="width:${w.toFixed(1)}px;height:${h.toFixed(1)}px;margin:${(-h / 2).toFixed(1)}px 0 0 ${(-w / 2).toFixed(1)}px;transform:${tf};${style || ''}">${inner || ''}</div>`;
}
function estLightColor(m, b){
  const L = EST_LIGHTS[m.luz];
  if(!L) return null;
  if(L!=='plat') return L;
  const first = b && b.items.map(it=>PRODUCTS_BY_ID[it.pid]).find(Boolean);
  return first ? platVisual(first.platformId).color : '#ffcf8a';
}
/* ¿Cabe el código de la plataforma al pie de un lomo de w px? */
function estCodeFits(code, w){ return !!code && w >= code.length * 4.6 + 4; }
/* El nombre a lo largo del lomo: en una o dos líneas según el grosor (W) y
   el largo (L) del lomo. Si es demasiado pequeño para leerse, no se pone. */
function estSpineLabel(p, W, L, horizontal){
  if(L < 30) return '';
  const pv = platVisual(p.platformId);
  const name = String(p.name || '');
  const MIN = 7.5;                                                   // por debajo no se lee
  const need = (f)=> name.length * f * 0.55;                        // largo aproximado del nombre
  const room = (f, withCode)=> L - f * 1.2 - (withCode ? f * (pv.code.length * 0.62 + 1.5) : 0);
  const maxF = (n)=> Math.min(14, n===1 ? W * 0.6 : n===2 ? W / 2.4 : W / 3.5);
  const code0 = !!(pv.code && L >= 110 && W >= 16);
  // Se prueba en 1, 2 y 3 líneas y se queda la que muestra el nombre ENTERO
  // con la letra más grande. Para que quepa: primero se quita el código de la
  // plataforma y, si aún no cabe, la letra baja (hasta MIN). Si en ninguna
  // cabe entero, la que enseña más nombre (acaba en «…»).
  let best = null;
  for(const n of [1, 2, 3]){
    let f = maxF(n); if(f < MIN) continue;
    let code = code0 && need(f) <= n * room(f, true);
    while(f > MIN && need(f) > n * room(f, code)){ code = false; f = Math.max(MIN, f - 0.5); }
    const shown = Math.min(1, n * room(f, code) / Math.max(1, need(f)));
    const score = shown >= 1 ? 2 + f / 100 : shown;
    if(!best || score > best.score) best = { f, n, code, score };
  }
  if(!best) return '';
  return `<span class="est-sl${horizontal ? ' is-h' : ''}" style="--L:${L.toFixed(1)}px;--T:${W.toFixed(1)}px;font-size:${best.f.toFixed(1)}px"><span class="est-sl-name" style="-webkit-line-clamp:${best.n}">${escapeHTML(name)}</span>${best.code ? `<b class="est-sl-code">${escapeHTML(pv.code)}</b>` : ''}</span>`;
}
/* Foto (sin margen blanco) para una cara: se pone al hidratar */
function estPh(p, side, avg){
  if(p.possession!=='tengo') return '';
  const ph = shownPhotoId(p);
  return hasPhoto(ph, side) ? ` data-ph="${escapeHTML(ph)}|${side}|thumb"${avg ? ' data-ph-avg' : ''}` : '';
}
/* Una pieza plana (vista del mueble entero): lo que se ve de frente */
function estFlatHTML(r, s, selPid){
  const p = r.p, b = r.b, d0 = b.dims, pv = platVisual(p.platformId);
  const miss = p.possession!=='tengo';
  const w = b.fw * s, h = b.hgt * s;
  const left = (r.x - b.fw / 2) * s, bottom = r.y * s;
  const face = b.pose==='portada' ? 'cover' : b.pose==='diagonal' ? 'cover is-diag' : b.pose==='tumbado' ? 'spine is-h' : 'spine';
  const ph = estPh(p, 'front', face.startsWith('spine'));
  const lbl = face.startsWith('spine') ? estSpineLabel(p, b.pose==='tumbado' ? h : w, b.pose==='tumbado' ? w : h, b.pose==='tumbado') : '';
  return `<span class="est-sp is-${face}${miss ? ' is-ghost' : ''}${p.id===selPid ? ' is-sel' : ''}" data-pid="${escapeHTML(p.id)}"${ph} style="--plat:${pv.color};left:${left.toFixed(1)}px;bottom:${bottom.toFixed(1)}px;width:${w.toFixed(1)}px;height:${h.toFixed(1)}px">${miss ? '<span class="est-ghost-q">?</span>' : lbl}</span>`;
}
/* Una pieza como caja (de cerca): 5 caras, con sus fotos; las de detrás no se pintan */
/* Orden de pintado: primero las más alejadas de tus ojos (a los lados), así
   cada una tapa el lado de la de al lado, como en una estantería de verdad */
function estZ(x, eyeX){ return Math.max(1, 3000 - Math.round(Math.abs(x - eyeX))); }
function estBoxHTML(r, X, Y, Z, s, sel, eyeX){
  const p = r.p, b = r.b, d0 = b.dims, pv = platVisual(p.platformId);
  const miss = p.possession!=='tengo';
  const w = d0.w * s, h = d0.h * s, d = d0.d * s;
  // la postura va en cada cara (no en el contenedor): así el navegador sabe
  // siempre qué pieza tocas, también la que tienes justo delante
  const pose = b.pose==='tumbado' ? `rotateY(${r.it.rot || 0}deg) rotateZ(-90deg) rotateY(90deg)` : `rotateY(${b.ang}deg)`;
  const lift = sel ? ` translateZ(${(2 * s).toFixed(1)}px)` : '';
  const at = `translate3d(${X.toFixed(1)}px,${Y.toFixed(1)}px,${Z.toFixed(1)}px)${lift}`;
  const q = miss ? '<span class="est-ghost-q">?</span>' : '';
  const cls = `est-pz is-${b.pose}${r.it.rot ? ' is-rot' : ''}${miss ? ' is-ghost' : ''}${sel ? ' is-sel' : ''}${b.pose==='tumbado' ? ' is-flat' : ''}`;
  // la elegida: una marca encima, para verla de un vistazo
  const mark = sel ? `<span class="est-mark" style="transform:translate(-50%,-100%) translate3d(0,${(-(b.hgt * s) / 2 - 8).toFixed(1)}px,${((b.fd * s) / 2).toFixed(1)}px)" aria-hidden="true"></span>` : '';
  return `<div class="${cls}" data-pid="${escapeHTML(p.id)}" data-x="${X.toFixed(0)}" title="${escapeHTML(p.name)}" style="--plat:${pv.color};z-index:${sel ? 3100 : estZ(X, eyeX)};transform:${at}">`
    + estFace(w, h, `${pose} translateZ(${(d / 2).toFixed(1)}px)`, 'est-pc is-front', '', miss ? q : `<span class="est-cover-txt"><b>${escapeHTML(pv.code)}</b>${escapeHTML(p.name)}</span>`, estPh(p, 'front'))
    + estFace(w, h, `${pose} rotateY(180deg) translateZ(${(d / 2).toFixed(1)}px)`, 'est-pc is-back', '', '', estPh(p, 'back'))
    + estFace(d, h, `${pose} rotateY(-90deg) translateZ(${(w / 2).toFixed(1)}px)`, 'est-pc is-spine', '', estSpineLabel(p, d, h, false) || q, estPh(p, 'front', true))
    + estFace(d, h, `${pose} rotateY(90deg) translateZ(${(w / 2).toFixed(1)}px)`, 'est-pc is-edge', '', '')
    + estFace(w, d, `${pose} rotateX(90deg) translateZ(${(h / 2).toFixed(1)}px)`, 'est-pc is-top', '', '')
    + mark + `</div>`;
}
/* Una balda (o «encima»): la caja con su luz y las piezas.
   o = { lite, eyeX, eyeY (px, respecto a la balda), P (perspectiva), selPid, open } */
function estBayHTML(m, sid, sf, w, h, s, o){
  const D = m.fondo * s;
  const H = estSurfaceH(m, sid);
  const L = estLayout(sf.items, m.ancho, H);
  const b = sid==='top' ? null : estSurface(m, sid);
  const light = o.open ? null : estLightColor(m, b);
  const wood = EST_WOODS[m.madera];
  let inner = '';
  if(!o.open){
    // fondo, suelo, techo y laterales (de madera, con la luz que cae desde arriba)
    inner += `<div class="est-bk" style="width:${w.toFixed(1)}px;height:${h.toFixed(1)}px;transform:translateZ(${(-D).toFixed(1)}px);background-color:${wood.e}"></div>`;
    inner += `<div class="est-fl" style="top:${h.toFixed(1)}px;width:${w.toFixed(1)}px;height:${D.toFixed(1)}px;background-color:${wood.t}"></div>`;
    inner += `<div class="est-cl" style="width:${w.toFixed(1)}px;height:${D.toFixed(1)}px;background-color:${wood.e}"></div>`;
    inner += `<div class="est-wl" style="width:${D.toFixed(1)}px;height:${h.toFixed(1)}px;background-color:${wood.s}"></div>`;
    inner += `<div class="est-wl is-r" style="left:${w.toFixed(1)}px;width:${D.toFixed(1)}px;height:${h.toFixed(1)}px;background-color:${wood.s}"></div>`;
  }
  // piezas
  const zFront = -EST_FRONT * s;
  if(o.lite){
    inner += `<div class="est-run" style="width:${w.toFixed(1)}px;height:${h.toFixed(1)}px;transform:translateZ(${zFront.toFixed(1)}px)">${L.recs.map(r=>estFlatHTML(r, s, o.selPid)).join('')}</div>`;
  } else {
    L.recs.forEach(r=>{
      const X = r.x * s, Y = h - (r.y + r.b.hgt / 2) * s, Z = zFront - (r.b.fd / 2) * s;
      inner += estBoxHTML(r, X, Y, Z, s, r.p.id===o.selPid, o.eyeX);
    });
  }
  const glow = light ? `--glow:${light};` : '';
  return `<div class="est-bay${o.open ? ' is-open' : ''}${light ? ' has-light' : ''}" data-sid="${sid}" style="${glow}width:${w.toFixed(1)}px;height:${h.toFixed(1)}px;perspective:${o.P.toFixed(0)}px;perspective-origin:${o.eyeX.toFixed(1)}px ${o.eyeY.toFixed(1)}px">
    ${inner}${light ? '<span class="est-led" aria-hidden="true"></span>' : ''}</div>`;
}
/* El mueble entero, de frente. Devuelve { html, W, H } (px) */
function estCabinetHTML(m, s, o){
  o = o || {};
  const wood = EST_WOODS[m.madera];
  const T = EST_T * s, OW = (m.ancho + 2 * EST_T) * s, inW = m.ancho * s;
  const topCm = o.noTop ? 0 : Math.min(EST_TOP_H, estTopUsed(m));
  const topH = topCm * s, crownH = EST_CROWN * s, plinthH = EST_PLINTH * s;
  const bodyH = estMuebleHeight(m) * s;
  const H = topH + bodyH;
  const eyeY = topH + crownH + (bodyH - crownH - plinthH) * 0.42;   // a la altura de los ojos: algo por encima de la mitad
  const eyeX = OW / 2;
  const P = Math.max(500, 150 * s);
  const wst = `background-color:${wood.f}`;
  let h = `<div class="est-cab${o.lite ? ' is-lite' : ''}" data-mid="${escapeHTML(m.id)}" style="width:${OW.toFixed(1)}px;height:${H.toFixed(1)}px">`;
  // encima del mueble
  if(topH > 0){
    h += `<div class="est-on-top" style="left:${T.toFixed(1)}px;top:0;width:${inW.toFixed(1)}px;height:${topH.toFixed(1)}px">${estBayHTML(m, 'top', m.encima, inW, topH, s, { lite:true, open:true, eyeX:eyeX - T, eyeY:eyeY, P, selPid:o.selPid })}</div>`;
  }
  // copete, laterales y zócalo
  h += `<div class="est-wood est-crown" style="${wst};left:${(-1.2 * s).toFixed(1)}px;top:${topH.toFixed(1)}px;width:${(OW + 2.4 * s).toFixed(1)}px;height:${crownH.toFixed(1)}px"></div>`;
  h += `<div class="est-wood est-side" style="${wst};left:0;top:${(topH + crownH).toFixed(1)}px;width:${T.toFixed(1)}px;height:${(bodyH - crownH).toFixed(1)}px"></div>`;
  h += `<div class="est-wood est-side is-r" style="${wst};left:${(OW - T).toFixed(1)}px;top:${(topH + crownH).toFixed(1)}px;width:${T.toFixed(1)}px;height:${(bodyH - crownH).toFixed(1)}px"></div>`;
  h += `<div class="est-wood est-plinth" style="${wst};left:${(0.6 * s).toFixed(1)}px;top:${(H - plinthH).toFixed(1)}px;width:${(OW - 1.2 * s).toFixed(1)}px;height:${plinthH.toFixed(1)}px"></div>`;
  // baldas
  let y = topH + crownH;
  const plate = EST_PLATES[m.placas];
  m.baldas.forEach((b, i)=>{
    const bh = b.alto * s;
    h += `<div class="est-slot" style="left:${T.toFixed(1)}px;top:${y.toFixed(1)}px">${estBayHTML(m, b.id, b, inW, bh, s, { lite:true, eyeX:eyeX - T, eyeY:eyeY - y, P, selPid:o.selPid })}</div>`;
    y += bh;
    if(i < m.baldas.length - 1){
      h += `<div class="est-wood est-board" style="${wst};left:${T.toFixed(1)}px;top:${y.toFixed(1)}px;width:${inW.toFixed(1)}px;height:${T.toFixed(1)}px"></div>`;
    }
    // placa (en el canto de la balda)
    const txt = estPlateText(b);
    if(plate && txt && !o.lite){
      // en el canto de la balda, colgando hacia abajo (no tapa los pies de las piezas)
      const fs = Math.max(6.5, Math.min(11, 1.3 * s));
      const pw = Math.min(inW - 6, txt.length * fs * 0.72 + 12);
      h += `<span class="est-plate" style="--p1:${plate[0]};--p2:${plate[1]};--p3:${plate[2]};left:${(T + 2 * s).toFixed(1)}px;top:${(y - 0.5).toFixed(1)}px;width:${pw.toFixed(1)}px;height:${(fs + 5).toFixed(1)}px;font-size:${fs.toFixed(1)}px">${escapeHTML(txt)}</span>`;
    }
    if(i < m.baldas.length - 1) y += T;
  });
  // puertas de cristal (se abren con el botón o al entrar en una balda)
  if(m.puertas!=='sin' && m.baldas.length && !EST.doors){
    const top = topH + crownH, dh = bodyH - crownH - plinthH;
    h += `<div class="est-glass${m.puertas==='ahumado' ? ' is-smoked' : ''}" style="--frame:${wood.f};left:${T.toFixed(1)}px;top:${top.toFixed(1)}px;width:${inW.toFixed(1)}px;height:${dh.toFixed(1)}px"><i></i><i></i></div>`;
  }
  h += `</div>`;
  return { html:h, W:OW, H };
}
function estTopUsed(m){
  if(!m || !m.encima || !estKnownCount(m.encima.items)) return 0;
  const L = estLayout(m.encima.items, m.ancho, EST_TOP_H);
  return Math.max(0, ...L.cols.map(c=>c.top)) + 2;
}
/* Tamaño útil del escenario */
function estStageEl(){ return document.getElementById('estStage'); }
function estStageWidth(){ const st = estStageEl(); return st ? st.clientWidth : Math.min(innerWidth - 24, 1100); }
/* La escena según el nivel. Devuelve el HTML y fija la altura del escenario. */
function estSceneHTML(){
  const E = estData();
  const st = estStageEl();
  const W = estStageWidth();
  const maxH = Math.round(innerHeight * (innerWidth < 880 ? 0.7 : 0.74));
  if(EST.view==='sala' && E.muebles.length > 1){
    const gap = 24;
    const widths = E.muebles.map(m=> m.ancho + 2 * EST_T);
    const heights = E.muebles.map(m=> estMuebleHeight(m) + Math.min(EST_TOP_H, estTopUsed(m)));
    const totW = widths.reduce((a, b)=>a + b, 0) + gap * (E.muebles.length - 1);
    const tallest = Math.max(...heights);
    let s = (W * 0.92) / totW;
    const floor = 34;
    let stH = Math.round(tallest * s + floor + 28);
    if(stH > maxH){ s = (maxH - floor - 28) / tallest; stH = maxH; }
    stH = Math.max(stH, 260);
    if(st) st.style.height = stH + 'px';
    EST.s = s;
    let x = (W - totW * s) / 2;
    const base = stH - floor;
    let html = `<div class="est-floor" style="top:${base}px"></div>`;
    E.muebles.forEach((m, i)=>{
      const c = estCabinetHTML(m, s, { lite:true });
      html += `<div class="est-place is-tap" data-mid="${escapeHTML(m.id)}" style="left:${x.toFixed(1)}px;top:${(base - c.H).toFixed(1)}px;width:${c.W.toFixed(1)}px;height:${c.H.toFixed(1)}px" title="${escapeHTML(m.nombre)}">${c.html}<span class="est-shadow"></span><span class="est-place-name">${escapeHTML(m.nombre)}</span></div>`;
      x += (widths[i] + gap) * s;
    });
    return html;
  }
  const m = estMueble(estMid()); if(!m) return '';
  if(EST.view==='balda') return estBaldaSceneHTML(m);
  // el mueble entero: ocupa el ancho; si es muy alto, cabe de alto
  const cmW = m.ancho + 2 * EST_T + 8;
  const cmH = estMuebleHeight(m) + Math.min(EST_TOP_H, estTopUsed(m));
  const floor = 30, pad = 54;   // arriba, sitio para los botones
  let s = W / cmW;
  let stH = Math.round(cmH * s + floor + pad);
  if(stH > maxH){ s = (maxH - floor - pad) / cmH; stH = maxH; }
  if(st) st.style.height = stH + 'px';
  EST.s = s;
  const c = estCabinetHTML(m, s, { selPid: EST.sel && EST.sel.mid===m.id ? EST.sel.pid : null });
  const base = stH - floor;
  return `<div class="est-floor" style="top:${base}px"></div>
    <div class="est-place" style="left:${((W - c.W) / 2).toFixed(1)}px;top:${(base - c.H).toFixed(1)}px;width:${c.W.toFixed(1)}px;height:${c.H.toFixed(1)}px">${c.html}<span class="est-shadow"></span></div>`;
}
/* Dentro de una balda: de cerca, a su altura, deslizando a los lados.
   El escenario tiene siempre el mismo alto (no salta al cambiar de balda):
   arriba, los botones; abajo, el nombre de la pieza que tienes delante (o
   los controles de la elegida). */
const EST_BAR_H = 62;
function estBaldaSceneHTML(m){
  const st = estStageEl();
  const W = estStageWidth();
  const sid = estBsid(m);
  const sf = estSurface(m, sid);
  const top = 56, bottom = EST_BAR_H;
  const stH = Math.round(Math.max(340, Math.min(innerHeight * (innerWidth < 880 ? 0.56 : 0.64), 580)));
  if(st) st.style.height = stH + 'px';
  const Hcm = sid==='top' ? Math.max(20, estTopUsed(m) + 4) : sf.alto;
  const avail = stH - top - bottom;
  const s = Math.min(avail / (Hcm + 3.2 * EST_T), W / 22);
  EST.s = s;
  const T = EST_T * s, h = Hcm * s;
  // «Portadas» puede ser más largo que la balda: el mueble se alarga con ellas
  let w = m.ancho * s;
  if(EST.covers){ const cw = estCoversWidth(sf, h); w = Math.max(w, cw); }
  const pad = Math.max(24, W * 0.18);
  const stripW = w + 2 * T + 2 * pad;
  const yTop = top + (avail - (h + 3 * T)) / 2 + T * 1.4;
  const wood = EST_WOODS[m.madera];
  const wst = `background-color:${wood.f}`;
  const plate = EST_PLATES[m.placas];
  const b = sid==='top' ? null : sf;
  const txt = b ? estPlateText(b) : '';
  const scroll = st && st.querySelector('.est-scroll') ? st.querySelector('.est-scroll').scrollLeft : 0;
  const eyeX = Math.min(Math.max(scroll + W / 2 - pad - T, -W), w + W);
  let html = `<div class="est-strip${sid==='top' ? ' is-top' : ''}" style="width:${stripW.toFixed(1)}px;height:${stH}px">`;
  // la pared se ve detrás de «encima»; en las baldas, el mueble alrededor
  if(sid!=='top'){
    html += `<div class="est-wood est-board is-up" style="${wst};left:${pad.toFixed(1)}px;top:${(yTop - T * 1.4).toFixed(1)}px;width:${(w + 2 * T).toFixed(1)}px;height:${(T * 1.4).toFixed(1)}px"></div>`;
    html += `<div class="est-wood est-board is-down" style="${wst};left:${pad.toFixed(1)}px;top:${(yTop + h).toFixed(1)}px;width:${(w + 2 * T).toFixed(1)}px;height:${(T * 1.6).toFixed(1)}px"></div>`;
    html += `<div class="est-wood est-side" style="${wst};left:${pad.toFixed(1)}px;top:${(yTop - T * 1.4).toFixed(1)}px;width:${T.toFixed(1)}px;height:${(h + T * 3).toFixed(1)}px"></div>`;
    html += `<div class="est-wood est-side is-r" style="${wst};left:${(pad + T + w).toFixed(1)}px;top:${(yTop - T * 1.4).toFixed(1)}px;width:${T.toFixed(1)}px;height:${(h + T * 3).toFixed(1)}px"></div>`;
  } else {
    html += `<div class="est-wood est-crown" style="${wst};left:${(pad - 1.2 * s).toFixed(1)}px;top:${(yTop + h).toFixed(1)}px;width:${(w + 2 * T + 2.4 * s).toFixed(1)}px;height:${(EST_CROWN * s).toFixed(1)}px"></div>`;
  }
  html += `<div class="est-slot is-near" style="left:${(pad + T).toFixed(1)}px;top:${yTop.toFixed(1)}px">${EST.covers ? estCoversHTML(m, sf, w, h) : estBayHTML(m, sid, sf, w, h, s, { lite:false, open: sid==='top', eyeX, eyeY: h * 0.45, P: Math.max(700, 150 * s), selPid: EST.sel && EST.sel.mid===m.id ? EST.sel.pid : null })}</div>`;
  if(plate && txt && sid!=='top'){
    const fs = Math.max(9, Math.min(15, 1.3 * s));
    html += `<span class="est-plate" style="--p1:${plate[0]};--p2:${plate[1]};--p3:${plate[2]};left:${(pad + T + 2 * s).toFixed(1)}px;top:${(yTop + h + T * 0.8 - (fs + 7) / 2).toFixed(1)}px;height:${(fs + 7).toFixed(1)}px;font-size:${fs.toFixed(1)}px;padding:0 ${(fs * 0.7).toFixed(1)}px">${escapeHTML(txt)}</span>`;
  }
  html += `</div>`;
  return `<div class="est-scroll" data-pad="${pad.toFixed(1)}" data-t="${T.toFixed(1)}">${html}</div>`;
}
/* «Portadas»: las piezas de la balda de frente, una tras otra, para verlas */
const EST_CV_GAP = 16;
function estCoversItems(sf){ return sf.items.map(it=>PRODUCTS_BY_ID[it.pid]).filter(Boolean); }
function estCoversWidth(sf, h){
  const ch = h * 0.74, items = estCoversItems(sf);
  return items.reduce((a, p)=>{ const d = piezaDims(p); return a + ch * (d.w / d.h); }, 0) + EST_CV_GAP * Math.max(0, items.length - 1) + 24;
}
function estCoversHTML(m, sf, w, h){
  const items = estCoversItems(sf);
  if(!items.length) return `<div class="est-covers is-empty" style="width:${w.toFixed(1)}px;height:${h.toFixed(1)}px"><span>${escapeHTML(t('est.surf_empty'))}</span></div>`;
  const ch = h * 0.74;
  return `<div class="est-covers" style="width:${w.toFixed(1)}px;height:${h.toFixed(1)}px">${items.map(p=>{
    const d = piezaDims(p), cw = ch * (d.w / d.h), pv = platVisual(p.platformId), miss = p.possession!=='tengo';
    const sel = EST.sel && EST.sel.pid===p.id;
    return `<span class="est-cv${miss ? ' is-ghost' : ''}${sel ? ' is-sel' : ''}" data-pid="${escapeHTML(p.id)}"${estPh(p, 'front')} title="${escapeHTML(p.name)}" style="--plat:${pv.color};width:${cw.toFixed(1)}px;height:${ch.toFixed(1)}px">${miss ? '<span class="est-ghost-q">?</span>' : `<span class="est-cover-txt"><b>${escapeHTML(pv.code)}</b>${escapeHTML(p.name)}</span>`}<span class="est-cv-name">${escapeHTML(p.name)}</span></span>`;
  }).join('')}</div>`;
}
/* Pintar el nivel actual */
function estDraw(){
  const st = estStageEl(); if(!st) return;
  const sc = document.getElementById('estScene'); if(!sc) return;
  const E = estData();
  const keep = EST.view==='balda' && sc.querySelector('.est-scroll') ? sc.querySelector('.est-scroll').scrollLeft : null;
  st.dataset.view = EST.view;
  st.classList.toggle('is-night', EST.night);
  st.dataset.wall = E.pared;
  sc.innerHTML = estSceneHTML();
  const scr = sc.querySelector('.est-scroll');
  if(scr){
    if(keep!==null) scr.scrollLeft = keep;
    estBindScroll(scr);
  }
  estHydratePhotos(sc);
  estRefreshCtl();
  if(EST.view==='balda') requestAnimationFrame(estUpdateRail);
}
/* Redibujar lo que se ve de la estantería (escenario y panel), si está abierta */
function estRefresh(){
  if(view.page!=='estanteria' || view.productId) return;
  estDraw();
  estRefreshPanel();
}
/* Dentro de una balda: al deslizar, la vista se mueve contigo (los lados de
   las piezas cambian como si caminaras delante de la estantería) */
function estBindScroll(scr){
  if(scr.dataset.bound) return;
  scr.dataset.bound = '1';
  let raf = 0;
  scr.addEventListener('scroll', ()=>{
    if(raf) return;
    raf = requestAnimationFrame(()=>{
      raf = 0;
      const bay = scr.querySelector('.est-slot.is-near .est-bay'); if(!bay) return;
      const pad = Number(scr.dataset.pad) || 0, T = Number(scr.dataset.t) || 0;
      const x = scr.scrollLeft + scr.clientWidth / 2 - pad - T;
      bay.style.perspectiveOrigin = `${x.toFixed(1)}px ${bay.style.perspectiveOrigin.split(' ')[1] || '50%'}`;
      bay.querySelectorAll('.est-pz:not(.is-sel)').forEach(el=>{ el.style.zIndex = estZ(Number(el.dataset.x) || 0, x); });
    });
    clearTimeout(scr._railT); scr._railT = setTimeout(estUpdateRail, 60);
  }, { passive:true });
}
/* La pieza elegida, centrada en la balda (al entrar o al cambiarla de sitio) */
function estScrollToSel(smooth){
  const scr = document.querySelector('#estScene .est-scroll'); if(!scr || !EST.sel) return;
  const el = scr.querySelector(`[data-pid="${CSS.escape(EST.sel.pid)}"]`); if(!el) return;
  const r = el.getBoundingClientRect(), sr = scr.getBoundingClientRect();
  const target = scr.scrollLeft + (r.left + r.width / 2) - (sr.left + sr.width / 2);
  scr.scrollTo({ left: Math.max(0, target), behavior: smooth && !reducedMotion() ? 'smooth' : 'auto' });
}

/* =====================================================================
   5. TOCAR: entrar, elegir una pieza y arrastrarla por su balda
   ===================================================================== */
function estBindStage(){
  const st = estStageEl(); if(!st || st.dataset.bound) return;
  st.dataset.bound = '1';
  let g = null;
  const scroller = ()=> st.querySelector('#estScene .est-scroll');
  st.addEventListener('pointerdown', (e)=>{
    if(e.button && e.button!==0) return;
    if(e.target.closest('.est-ctl, .est-bar')) return;
    const hit = e.target.closest('[data-pid], [data-sid], [data-mid]');
    const onSel = EST.view==='balda' && hit && hit.dataset.pid && EST.sel && hit.dataset.pid===EST.sel.pid && !EST.covers;
    const scr = scroller();
    // con el ratón, arrastrar la balda la desliza (en el móvil ya lo hace el dedo)
    const pan = !onSel && e.pointerType==='mouse' && scr ? scr.scrollLeft : null;
    g = { x0:e.clientX, y0:e.clientY, hit, onSel, moved:false, id:e.pointerId, pan };
    if(onSel || pan!==null){ try{ st.setPointerCapture(e.pointerId); }catch(_){} }
  });
  st.addEventListener('pointermove', (e)=>{
    if(!g || e.pointerId!==g.id) return;
    const dx = e.clientX - g.x0, dy = e.clientY - g.y0;
    if(!g.moved && Math.hypot(dx, dy) < 10) return;
    g.moved = true;
    if(g.pan!==null){ const scr = scroller(); if(scr) scr.scrollLeft = g.pan - dx; return; }
    // la pieza elegida solo se arrastra de lado (si el gesto es de lado)
    if(g.onSel && (g.drag || Math.abs(dx) > Math.abs(dy))){
      g.drag = true; g.dx = dx;
      st.querySelectorAll(`#estScene [data-pid="${CSS.escape(EST.sel.pid)}"]`).forEach(el=>{ el.style.translate = `${dx.toFixed(1)}px 0`; });
    }
  });
  const end = (e)=>{
    if(!g || e.pointerId!==g.id) return;
    const gg = g; g = null;
    if(gg.drag){
      const cm = gg.dx / EST.s;
      // un toque algo movido (menos de medio centímetro) no mueve la pieza
      if(e.type==='pointerup' && Math.abs(cm) >= 0.5) estDragEnd(cm); else estDraw();
      return;
    }
    if(gg.moved || e.type!=='pointerup') return;
    estTap(gg.hit);
  };
  st.addEventListener('pointerup', end);
  st.addEventListener('pointercancel', end);
  // rueda del ratón dentro de una balda: la desliza a los lados (en los extremos, la página sigue)
  st.addEventListener('wheel', (e)=>{
    const scr = EST.view==='balda' ? scroller() : null; if(!scr || e.ctrlKey) return;
    const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    const max = scr.scrollWidth - scr.clientWidth;
    if((d > 0 && scr.scrollLeft < max - 1) || (d < 0 && scr.scrollLeft > 0)){ e.preventDefault(); scr.scrollLeft += d; }
  }, { passive:false });
}
/* Un toque en el escenario */
function estTap(el){
  if(EST.view==='sala'){
    const mEl = el && el.closest('[data-mid]');
    if(mEl){ estShowMueble(mEl.dataset.mid); EST.fromSala = true; }
    return;
  }
  const m = estMueble(estMid()); if(!m) return;
  const pid = el && el.dataset.pid;
  if(EST.view==='mueble'){
    // en el mueble entero: tocar una pieza o una balda es entrar en ella
    if(pid){ const f = estFind(pid); if(f){ estEnterBalda(f.sid, pid); return; } }
    const bay = el && el.closest('[data-sid]');
    if(bay) estEnterBalda(bay.dataset.sid, null);
    return;
  }
  // dentro de una balda: elegir (o soltar) una pieza
  if(pid){
    const f = estFind(pid);
    if(f) estSelect(EST.sel && EST.sel.pid===pid ? null : { mid:f.m.id, sid:f.sid, idx:f.i, pid });
  } else if(EST.sel) estSelect(null);
}
/* ---------- Niveles ---------- */
function estEnterBalda(sid, pid){
  const m = estMueble(estMid()); if(!m) return;
  EST.view = 'balda'; EST.bsid = sid; EST.covers = false;
  const f = pid ? estFind(pid) : null;
  EST.sel = f ? { mid:f.m.id, sid:f.sid, idx:f.i, pid } : null;
  estDraw(); estRefreshPanel();
  estEnterAnim();
  requestAnimationFrame(()=>{ if(EST.sel) estScrollToSel(false); const st = estStageEl(); if(st && st.getBoundingClientRect().top < 0) st.scrollIntoView({ block:'start' }); });
}
function estEnterAnim(){
  if(reducedMotion()) return;
  const sc = document.getElementById('estScene'); if(!sc) return;
  sc.classList.remove('is-enter'); void sc.offsetWidth; sc.classList.add('is-enter');
}
function estExitBalda(){ EST.view = 'mueble'; EST.sel = null; EST.covers = false; estDraw(); estRefreshPanel(); estEnterAnim(); }
/* Pasar a la balda de arriba (-1) o de abajo (+1) */
function estBaldaStep(d){
  const m = estMueble(estMid()); if(!m) return;
  const ids = estSurfaceIds(m).filter(id=> id!=='top' || estKnownCount(m.encima.items) || EST.bsid==='top');
  const i = ids.indexOf(estBsid(m)), j = i + d;
  if(j < 0 || j >= ids.length) return;
  EST.bsid = ids[j];
  if(EST.sel && EST.sel.sid!==EST.bsid) EST.sel = null;
  const sc = document.querySelector('#estScene .est-scroll'); if(sc) sc.scrollLeft = 0;
  estDraw(); estRefreshPanel(); estEnterAnim();
}
/* «Atrás» dentro de la estantería (devuelve true si lo ha hecho): primero se
   suelta la pieza elegida; después, de la balda al mueble, y del mueble a la
   sala si veníamos de ella */
function estBackLevel(){
  if(view.page!=='estanteria' || view.productId) return false;
  if(EST.view==='balda' && EST.sel){ estSelect(null); return true; }
  if(EST.view==='balda'){ estExitBalda(); return true; }
  if(EST.view==='mueble' && EST.fromSala && estData().muebles.length > 1){ estShowSala(); return true; }
  return false;
}
/* Cambiar la postura con un toque (de lomo → de frente → en diagonal → tumbada) */
function estCyclePose(){
  const x = estSelItem(); if(!x) return;
  const cur = x.it.pose || 'lomo';
  estSetPose(EST_POSES[(EST_POSES.indexOf(cur) + 1) % EST_POSES.length]);
}
/* La pieza que tienes delante (en el centro de la balda) */
function estCenterPid(){
  const scr = document.querySelector('#estScene .est-scroll'); if(!scr) return null;
  const pad = Number(scr.dataset.pad) || 0, T = Number(scr.dataset.t) || 0;
  const x = scr.scrollLeft + scr.clientWidth / 2 - pad - T;
  let best = null, bd = 1e9;
  scr.querySelectorAll('.est-pz[data-x]').forEach(el=>{ const dd = Math.abs((Number(el.dataset.x) || 0) - x); if(dd < bd){ bd = dd; best = el.dataset.pid; } });
  if(!best){
    // «Portadas»: por su posición en pantalla
    const sr = scr.getBoundingClientRect(), cx = sr.left + sr.width / 2;
    scr.querySelectorAll('.est-cv[data-pid]').forEach(el=>{ const r = el.getBoundingClientRect(), dd = Math.abs(r.left + r.width / 2 - cx); if(dd < bd){ bd = dd; best = el.dataset.pid; } });
  }
  return best;
}
/* El nombre de la que tienes delante, abajo (se lee entero aunque su lomo sea fino) */
function estUpdateRail(){
  const rail = document.getElementById('estRail'); if(!rail) return;
  const pid = estCenterPid(), p = pid && PRODUCTS_BY_ID[pid];
  rail.dataset.pid = p ? p.id : '';
  rail.hidden = !p;
  if(!p) return;
  const pv = platVisual(p.platformId);
  rail.innerHTML = `<span class="est-rail-code" style="--plat:${pv.color}">${escapeHTML(pv.code || '')}</span><span class="est-rail-name">${escapeHTML(p.name)}</span>${p.possession!=='tengo' ? `<span class="est-rail-miss">${escapeHTML(t('cover.missing'))}</span>` : ''}`;
  rail.setAttribute('aria-label', t('est.rail_pick').replace('{name}', p.name));
}
function estPickCenter(){ const rail = document.getElementById('estRail'); const pid = rail && rail.dataset.pid; if(pid) estTap(document.querySelector(`#estScene [data-pid="${CSS.escape(pid)}"]`)); }
function estToggleNight(){ EST.night = !EST.night; setUiPref('estNight', EST.night ? '1' : ''); estDraw(); }
function estToggleDoors(){ EST.doors = !EST.doors; estDraw(); }
function estToggleCovers(){ EST.covers = !EST.covers; estDraw(); }
function estSelectByEl(el){ estTap(el); }
function estSelect(sel){
  if(sel && (EST.view!=='balda' || EST.bsid!==sel.sid || EST.mid!==sel.mid)){
    // desde la lista: se entra en su balda
    EST.mid = sel.mid; estEnterBalda(sel.sid, sel.pid); return;
  }
  EST.sel = sel;
  estDraw();
  estRefreshPanel();
  if(sel) requestAnimationFrame(()=>estScrollToSel(true));
}
function estSelItem(){
  if(!EST.sel) return null;
  const m = estMueble(EST.sel.mid); const sf = estSurface(m, EST.sel.sid);
  if(!sf) return null;
  let i = sf.items.findIndex(it=>it.pid===EST.sel.pid);
  if(i < 0) return null;
  EST.sel.idx = i;
  return { m, sf, it: sf.items[i], i };
}

/* ---------- Colocación de la pieza elegida ---------- */
function estAfterEdit(){ estSave(); estDraw(); estRefreshPanel(); }
function estSetPose(pose){
  const x = estSelItem(); if(!x || !EST_POSES.includes(pose)) return;
  if(pose==='lomo') delete x.it.pose; else x.it.pose = pose;
  delete x.it.rot;
  estAfterEdit();
}
function estRotate(d){
  const x = estSelItem(); if(!x) return;
  let r = ((x.it.rot || 0) + d + 540) % 360 - 180;
  if(Math.abs(r) < 1) delete x.it.rot; else x.it.rot = r;
  estAfterEdit();
}
/* Columnas de una fila: [inicio, fin] (una pieza y las que tiene apiladas encima) */
function estColumns(arr){
  const cols = [];
  arr.forEach((it, i)=>{ if(cols.length && (it.apilado || !estKnown(it))) cols[cols.length - 1][1] = i; else cols.push([i, i]); });
  // una columna solo con piezas borradas al principio va con la siguiente
  while(cols.length > 1 && arr.slice(cols[0][0], cols[0][1] + 1).every(it=>!estKnown(it))){ cols[1][0] = cols[0][0]; cols.shift(); }
  return cols;
}
/* Mover la pieza elegida (con su pila) un sitio a la izquierda o a la derecha */
function estMove(dir){
  const x = estSelItem(); if(!x) return;
  const arr = x.sf.items;
  const cols = estColumns(arr);
  const ci = cols.findIndex(c=> x.i >= c[0] && x.i <= c[1]);
  const cj = ci + dir;
  if(ci < 0 || cj < 0 || cj >= cols.length) return;
  const [a, b] = cols[ci];
  const block = arr.splice(a, b - a + 1);
  const cols2 = estColumns(arr);
  const at = dir < 0 ? cols2[cj][0] : cols2[ci][1] + 1;
  arr.splice(at, 0, ...block);
  estAfterEdit();
}
/* Desplazar (cm) la pieza elegida por la balda (si está apilada, su pila) */
function estNudge(cm){
  const x = estSelItem(); if(!x) return;
  let i = x.i; while(i > 0 && x.sf.items[i].apilado) i--;
  const it = x.sf.items[i];
  const v = Math.round(((it.dx || 0) + cm) * 2) / 2;
  const clamped = Math.max(-EST_GAP, Math.min(300, v));
  if(Math.abs(clamped) < 0.25) delete it.dx; else it.dx = clamped;
  estAfterEdit();
}
/* Al soltar una pieza arrastrada: si pasa por encima de sus vecinas, cambia
   de sitio con ellas; lo que sobra es el hueco que deja (como al moverla 1 cm) */
function estDragEnd(dcm){
  const x = estSelItem(); if(!x) return;
  const arr = x.sf.items;
  const L = estLayout(arr, x.m.ancho, estSurfaceH(x.m, EST.sel.sid));
  const colOf = (i)=> L.cols.findIndex(c=> c.items.some(r=>r.idx===i));
  let ci = colOf(x.i); if(ci < 0){ estAfterEdit(); return; }
  let rem = dcm, steps = 0;
  const cols = L.cols;
  if(rem > 0){ let j = ci + 1; while(j < cols.length && rem > cols[j].fw / 2 + EST_GAP){ rem -= cols[j].fw + EST_GAP; steps++; j++; } }
  else { let j = ci - 1; while(j >= 0 && -rem > cols[j].fw / 2 + EST_GAP){ rem += cols[j].fw + EST_GAP; steps--; j--; } }
  // cambiar de sitio con las columnas que ha pasado
  const dir = steps > 0 ? 1 : -1;
  for(let k = 0; k < Math.abs(steps); k++){
    const cs = estColumns(arr);
    const c = cs.findIndex(cc=> x.i >= cc[0] && x.i <= cc[1]);
    const cj = c + dir; if(cj < 0 || cj >= cs.length) break;
    const [a, b] = cs[c];
    const block = arr.splice(a, b - a + 1);
    const cs2 = estColumns(arr);
    const at = dir < 0 ? cs2[cj][0] : cs2[c][1] + 1;
    arr.splice(at, 0, ...block);
    x.i = arr.indexOf(x.it);
  }
  // el resto, como hueco antes de su columna
  let base = arr.indexOf(x.it); while(base > 0 && arr[base].apilado) base--;
  const it = arr[base];
  const v = Math.round(((it.dx || 0) + rem) * 2) / 2;
  const clamped = Math.max(-EST_GAP, Math.min(300, v));
  if(Math.abs(clamped) < 0.25) delete it.dx; else it.dx = clamped;
  estAfterEdit();
}
function estToggleStack(){
  const x = estSelItem(); if(!x) return;
  if(x.it.apilado) delete x.it.apilado;
  else { if(!x.sf.items.slice(0, x.i).some(estKnown)) { showToast(t('est.stack_first')); return; } x.it.apilado = true; }
  estAfterEdit();
}
function estRemoveSel(){
  const x = estSelItem(); if(!x) return;
  const next = x.sf.items[x.i + 1];
  const unstack = !x.it.apilado && next && next.apilado;
  x.sf.items.splice(x.i, 1);
  if(unstack) delete next.apilado;
  const was = EST.sel;
  EST.sel = null;
  // se puede deshacer: vuelve al mismo sitio, con su postura
  showToast(t('est.removed'), { replace:true, action:{ label:t('common.undo'), fn: ()=>{
    if(estFind(x.it.pid)) return;
    const sf = estSurface(estMueble(was.mid), was.sid); if(!sf) return;
    const at = Math.min(x.i, sf.items.length);
    sf.items.splice(at, 0, x.it);
    if(unstack && sf.items[at + 1] && sf.items[at + 1].pid===next.pid) sf.items[at + 1].apilado = true;
    EST.sel = Object.assign({}, was, { idx:at });
    if(view.page==='estanteria'){ estAfterEdit(); } else estSave();
  } } });
  estAfterEdit();
}

/* =====================================================================
   6. PANTALLA
   ===================================================================== */
function goEstanteria(opts){
  pushHistory();
  view = { page:'estanteria' };
  EST.delAsk = false;
  if(opts && opts.pid){
    // «Verla en la estantería»: directamente dentro de su balda, elegida
    const f = estFind(opts.pid);
    if(f){ EST.mid = f.m.id; EST.view = 'balda'; EST.bsid = f.sid; EST.covers = false; EST.sel = { mid:f.m.id, sid:f.sid, idx:f.i, pid:opts.pid }; }
  } else if(EST.view==='balda'){ EST.view = 'mueble'; EST.sel = null; }
  render();
}
function estCountPlaced(){ const s = estPlacedSet(); return PRODUCTS.filter(p=>s.has(p.id)).length; }
function renderEstanteria(){
  EST.night = uiPref('estNight', '')==='1';
  const E = estData();
  let html = screenHeadHTML({ kicker:t('est.kicker'), title:t('est.title'), sub: estHas() ? t('est.sub').replace('{m}', E.muebles.length).replace('{n}', estCountPlaced()).replace('{t}', PRODUCTS.length) : '' });
  if(!estHas()){
    html += `<div class="est-empty">
      <div class="est-empty-art" aria-hidden="true">${icon('cabinet')}</div>
      <h2 class="est-empty-title">${t('est.empty.title')}</h2>
      <p>${t('est.empty.text')}</p>
      <div class="quick-actions">
        <button type="button" class="btn primary" onclick="estAutoBuild()" ${PRODUCTS.length ? '' : 'disabled'}>${icon('cabinet')} ${t('est.auto')}</button>
        <button type="button" class="btn" onclick="estAddMueble()">${icon('plus')} ${t('est.empty_one')}</button>
      </div></div>`;
    return html;
  }
  if(EST.view==='sala' && E.muebles.length < 2) EST.view = 'mueble';
  const mid = estMid();
  // muebles (y la sala)
  html += `<div class="chip-scroll est-tabs" role="group" aria-label="${escapeHTML(t('est.muebles'))}">
    ${E.muebles.length > 1 ? `<button type="button" class="chip ${EST.view==='sala' ? 'active' : ''}" aria-pressed="${EST.view==='sala'}" onclick="estShowSala()">${icon('home')} ${t('est.sala')}</button>` : ''}
    ${E.muebles.map(m=>`<button type="button" class="chip ${EST.view!=='sala' && m.id===mid ? 'active' : ''}" aria-pressed="${EST.view!=='sala' && m.id===mid}" onclick="estShowMueble('${m.id}')">${escapeHTML(m.nombre || t('est.mueble_default'))}</button>`).join('')}
    <button type="button" class="chip" onclick="estAddMueble()" aria-label="${escapeHTML(t('est.add_mueble'))}">${icon('plus')}</button>
  </div>`;
  // el escenario (siempre de frente; los botones van encima)
  html += `<div class="est-stage-wrap">
    <div class="est-stage" id="estStage" data-wall="${E.pared}" data-view="${EST.view}"><div class="est-scene" id="estScene" aria-hidden="true"></div>
      <div class="est-ctl" id="estCtl"></div><div class="est-bar" id="estBar"></div></div>
  </div>`;
  html += `<div id="estPanel">${estPanelHTML()}</div>`;
  return html;
}
/* Botones sobre el escenario, según el nivel */
function estCtlHTML(){
  const m = estMueble(estMid());
  const btn = (fn, ic, label, extra)=> `<button type="button" class="round-btn est-btn ${extra || ''}" onclick="${fn}" aria-label="${escapeHTML(label)}" title="${escapeHTML(label)}">${icon(ic)}</button>`;
  const night = `<button type="button" class="round-btn est-btn ${EST.night ? 'is-on' : ''}" onclick="estToggleNight()" aria-pressed="${EST.night}" aria-label="${escapeHTML(t('est.night'))}" title="${escapeHTML(t('est.night'))}">${icon(EST.night ? 'sun' : 'moon')}</button>`;
  if(EST.view==='balda' && m){
    const sid = estBsid(m);
    const ids = estSurfaceIds(m).filter(id=> id!=='top' || estKnownCount(m.encima.items) || sid==='top');
    const i = ids.indexOf(sid);
    const where = sid==='top' ? t('est.top') : t('est.bay_of').replace('{n}', m.baldas.findIndex(b=>b.id===sid) + 1).replace('{t}', m.baldas.length);
    return `<div class="est-ctl-l"><button type="button" class="btn btn-sm est-back" data-fk="back" onclick="estExitBalda()" aria-label="${escapeHTML(t('est.to_mueble') + ' · ' + where)}" title="${escapeHTML(t('est.to_mueble'))}">${icon('chevronLeft')} <span>${escapeHTML(m.nombre || t('est.mueble_default'))}</span> <small>${escapeHTML(where)}</small></button></div>
      <div class="est-ctl-r">
        <button type="button" class="round-btn est-btn" data-fk="up" onclick="estBaldaStep(-1)" ${i <= 0 ? 'disabled' : ''} aria-label="${escapeHTML(t('est.up'))}" title="${escapeHTML(t('est.up'))}">${icon('chevronUp')}</button>
        <button type="button" class="round-btn est-btn" data-fk="down" onclick="estBaldaStep(1)" ${i >= ids.length - 1 ? 'disabled' : ''} aria-label="${escapeHTML(t('est.down'))}" title="${escapeHTML(t('est.down'))}">${icon('chevronDown')}</button>
        <button type="button" class="round-btn est-btn ${EST.covers ? 'is-on' : ''}" onclick="estToggleCovers()" aria-pressed="${EST.covers}" aria-label="${escapeHTML(t('est.covers'))}" title="${escapeHTML(t('est.covers'))}">${icon('image')}</button>
        ${night}
      </div>`;
  }
  const doors = m && EST.view!=='sala' && m.puertas!=='sin' ? `<button type="button" class="round-btn est-btn ${EST.doors ? 'is-on' : ''}" onclick="estToggleDoors()" aria-pressed="${EST.doors}" aria-label="${escapeHTML(t('est.doors'))}" title="${escapeHTML(t('est.doors'))}">${icon('doors')}</button>` : '';
  return `<div class="est-ctl-l"><span class="est-where-chip is-hint">${escapeHTML(t(EST.view==='sala' ? 'est.sala_tap' : 'est.enter_hint'))}</span></div>
    <div class="est-ctl-r">${doors}${night}</div>`;
}
/* Abajo, dentro de una balda: el nombre de la que tienes delante o, con una
   pieza elegida, sus controles más usados (postura, mover, girar, sacarla) */
function estBarHTML(){
  if(EST.view!=='balda') return '';
  const x = estSelItem();
  if(!x) return `<button type="button" class="est-rail" id="estRail" hidden onclick="estPickCenter()"></button>`;
  const pose = x.it.pose || 'lomo';
  const btn = (fk, fn, ic, label)=> `<button type="button" class="round-btn est-btn" data-fk="${fk}" onclick="${fn}" aria-label="${escapeHTML(label)}" title="${escapeHTML(label)}">${icon(ic)}</button>`;
  return `<div class="est-qb" role="group" aria-label="${escapeHTML(t('est.place_tools'))}">
    <button type="button" class="btn btn-sm est-qb-pose" data-fk="qb-pose" onclick="estCyclePose()" aria-label="${escapeHTML(t('est.pose') + ': ' + t('est.pose.' + pose))}" title="${escapeHTML(t('est.pose'))}">${icon('rotate')} ${escapeHTML(t('est.pose_s.' + pose))}</button>
    ${btn('qb-l', 'estMove(-1)', 'chevronLeft', t('est.move_left'))}${btn('qb-r', 'estMove(1)', 'chevronRight', t('est.move_right'))}
    ${btn('qb-rl', 'estRotate(-15)', 'rotateLeft', t('est.rot_left'))}${btn('qb-rr', 'estRotate(15)', 'rotate', t('est.rot_right'))}
    ${btn('qb-out', `estInspect('${escapeHTML(x.it.pid)}')`, 'expand', t('est.take_out'))}
  </div>`;
}
/* Repinta los botones del escenario sin perder el foco del teclado */
function estRefreshCtl(){
  const a = document.activeElement;
  const fk = a && a.closest && a.closest('#estStage') && a.dataset ? a.dataset.fk : null;
  const el = document.getElementById('estCtl'); if(el) el.innerHTML = estCtlHTML();
  const bar = document.getElementById('estBar'); if(bar){ bar.innerHTML = estBarHTML(); bar.hidden = EST.view!=='balda'; }
  if(fk){ const b = document.querySelector(`#estStage [data-fk="${CSS.escape(fk)}"]`); if(b && !b.disabled) b.focus({ preventScroll:true }); }
}
function estRefreshPanel(){
  const el = document.getElementById('estPanel'); if(!el) return;
  // se conservan las baldas abiertas y el botón con el foco (teclado, lector de pantalla)
  const open = new Set([...el.querySelectorAll('details[open][data-sid]')].map(d=>d.dataset.sid));
  const a = document.activeElement;
  const fk = a && el.contains(a) && a.dataset ? a.dataset.fk : null;
  el.innerHTML = estPanelHTML();
  open.forEach(sid=>{ const d = el.querySelector(`details[data-sid="${CSS.escape(sid)}"]`); if(d) d.open = true; });
  if(fk){ const b = el.querySelector(`[data-fk="${CSS.escape(fk)}"]`); if(b) b.focus({ preventScroll:true }); }
  hydratePhotos(el);
}
/* Después de pintar la pantalla: el escenario necesita su tamaño real */
function estAfterRender(){
  if(view.page!=='estanteria' || view.productId || !estHas()) return;
  estBindStage();
  estDraw();
  if(EST.view==='balda' && EST.sel) requestAnimationFrame(()=>estScrollToSel(false));
}
function estShowSala(){ EST.view = 'sala'; EST.sel = null; EST.covers = false; EST.delAsk = false; render(); }
function estShowMueble(mid){ EST.view = 'mueble'; EST.mid = mid; EST.sel = null; EST.covers = false; EST.delAsk = false; EST.fromSala = false; render(); }

/* Panel bajo el escenario */
function estPanelHTML(){
  const E = estData();
  if(EST.view==='sala'){
    return `<p class="section-sub est-hint">${t('est.sala_hint')}</p>
      <div class="quick-actions">${estStyleBtn()}</div>${estDeleteAllHTML()}`;
  }
  const m = estMueble(estMid()); if(!m) return '';
  let html = '';
  const surf = (sid, label, sf, H, isOpen)=>{
    const L = estLayout(sf.items, m.ancho, H);
    const pct = Math.min(100, Math.round(L.used / m.ancho * 100));
    const warn = L.over.length ? ` · <span class="est-warn">${escapeHTML(t('est.over').replace('{n}', L.over.length))}</span>` : L.tall.length ? ` · <span class="est-warn">${escapeHTML(t('est.tall').replace('{n}', L.tall.length))}</span>` : '';
    const names = sf.items.map((it, i)=>{ const p = PRODUCTS_BY_ID[it.pid]; if(!p) return ''; const on = EST.sel && EST.sel.sid===sid && EST.sel.pid===it.pid;
      return `<button type="button" class="est-item-chip ${p.possession!=='tengo' ? 'is-ghost' : ''} ${on ? 'active' : ''}" aria-pressed="${on}" data-fk="chip-${escapeHTML(p.id)}" style="--plat:${platVisual(p.platformId).color}" onclick="estSelect({ mid:'${m.id}', sid:'${sid}', idx:${i}, pid:'${escapeHTML(p.id)}' })">${escapeHTML(p.name)}</button>`; }).join('');
    const n = estKnownCount(sf.items);
    const used = n ? Math.round(L.used) : 0;
    const enter = EST.view!=='balda' ? `<button type="button" class="btn btn-sm" onclick="estEnterBalda('${sid}', null)">${icon('expand')} ${t('est.enter')}</button>` : '';
    return `<details class="disclosure est-surf" data-sid="${sid}" ${isOpen ? 'open' : ''}><summary>${icon('chevronRight','chev')}<span>${escapeHTML(label)}</span><span class="sum-meta">${escapeHTML(t('est.surf_meta').replace('{n}', n).replace('{u}', used).replace('{w}', fmtCm(m.ancho)))}${warn}</span></summary>
      <div class="disclosure-body"><div class="est-cap" aria-hidden="true"><span style="width:${pct}%"></span></div>
        ${n ? `<div class="est-item-chips">${names}</div>` : `<p class="section-sub">${t('est.surf_empty')}</p>`}
        <div class="quick-actions">${enter}<button type="button" class="btn btn-sm" onclick="openEstAddSheet('${sid}')">${icon('plus')} ${t('est.add_here')}</button>
          ${n ? `<button type="button" class="btn btn-sm btn-ghost" onclick="estSortSurface('${m.id}','${sid}')">${icon('sortIcon')} ${t('est.sort')}</button><button type="button" class="btn btn-sm btn-ghost" onclick="estClearSurface('${m.id}','${sid}')">${icon('trash')} ${t('est.clear')}</button>` : ''}</div>
      </div></details>`;
  };
  const label = (sid)=> sid==='top' ? t('est.top') : (()=>{ const i = m.baldas.findIndex(b=>b.id===sid); const b = m.baldas[i]; return t('est.balda_n').replace('{n}', i + 1) + (estPlateText(b) ? ' · ' + estPlateText(b) : ''); })();
  if(EST.view==='balda'){
    // dentro de una balda: la pieza elegida (o una pista) y esa balda
    const x = estSelItem();
    if(x) html += estSelCardHTML(m, x);
    else html += `<p class="section-sub est-hint">${t('est.balda_hint')}</p>`;
    const sid = estBsid(m);
    html += `<div class="est-surfaces">${surf(sid, label(sid), estSurface(m, sid), estSurfaceH(m, sid), !x)}</div>`;
    html += `<div class="quick-actions est-actions"><button type="button" class="btn btn-sm" onclick="estExitBalda()">${icon('chevronLeft')} ${t('est.to_mueble')}</button>${estStyleBtn()}</div>`;
    return html;
  }
  html += `<div class="quick-actions est-actions">
    ${estStyleBtn()}
    <button type="button" class="btn btn-sm" onclick="openEstDesign('${m.id}')">${icon('ruler')} ${t('est.design')}</button>
    <button type="button" class="btn btn-sm" onclick="openEstAddSheet()">${icon('plus')} ${t('est.add_pieces')}</button>
  </div>`;
  // baldas (también es la forma de llegar a cada pieza con el teclado o el lector de pantalla)
  html += `<div class="est-surfaces">${surf('top', t('est.top'), m.encima, EST_TOP_H)}${m.baldas.map(b=>surf(b.id, label(b.id), b, b.alto)).join('')}</div>`;
  const unplaced = PRODUCTS.length - estCountPlaced();
  html += `<p class="section-sub est-foot">${escapeHTML(t('est.placed').replace('{n}', estCountPlaced()).replace('{t}', PRODUCTS.length))}${unplaced ? ` <button type="button" class="link-btn" onclick="estAutoAddUnplaced()">${escapeHTML(t('est.add_unplaced').replace('{n}', unplaced))}</button>` : ''}</p>
    <div class="quick-actions est-more"><button type="button" class="btn btn-sm btn-ghost" onclick="estRebuild()">${icon('refresh')} ${t('est.rebuild')}</button></div>`;
  html += estDeleteAllHTML();
  return html;
}
/* Eliminar la estantería: un botón y, para estar seguro, un segundo botón */
function estDeleteAllHTML(){
  if(!EST.delAsk){
    return `<div class="est-del"><button type="button" class="btn btn-sm btn-ghost est-danger" data-fk="del-all" onclick="estAskDeleteAll(true)">${icon('trash')} ${t('est.del_all')}</button></div>`;
  }
  return `<div class="est-del is-ask" role="group" aria-label="${escapeHTML(t('est.del_all'))}">
    <p>${t('est.del_all_q')}</p>
    <div class="quick-actions is-flush">
      <button type="button" class="btn btn-sm" data-fk="del-no" onclick="estAskDeleteAll(false)">${t('modal.cancel')}</button>
      <button type="button" class="btn btn-sm btn-danger" data-fk="del-yes" onclick="estDeleteAll()">${icon('trash')} ${t('est.del_all_yes')}</button>
    </div></div>`;
}
function estAskDeleteAll(on){
  EST.delAsk = !!on;
  estRefreshPanel();
  const b = document.querySelector(on ? '#estPanel [data-fk="del-no"]' : '#estPanel [data-fk="del-all"]'); if(b) b.focus({ preventScroll:true });
}
async function estDeleteAll(){
  const E = estEnsure();
  const before = JSON.stringify(E.muebles);
  E.muebles = [];
  EST.sel = null; EST.view = 'mueble'; EST.mid = null; EST.delAsk = false;
  await estSave(true);
  render();
  // y aún se puede deshacer unos segundos
  showToast(t('est.deleted'), { replace:true, duration:7000, action:{ label:t('common.undo'), fn: async ()=>{
    const E2 = estEnsure(); if(E2.muebles.length) return;
    E2.muebles = JSON.parse(before);
    await estSave(true);
    if(view.page==='estanteria') render();
  } } });
}
function estStyleBtn(){ return `<button type="button" class="btn btn-sm" onclick="openEstStyle()">${icon('palette')} ${t('est.style')}</button>`; }
function estSelCardHTML(m, x){
  const p = PRODUCTS_BY_ID[x.it.pid]; if(!p) return '';
  const pv = platVisual(p.platformId);
  const pose = x.it.pose || 'lomo';
  const n = copyCount(p);
  const c = shownCopy(p);
  const sub = p.possession==='tengo' ? [n > 1 ? t('est.have_n').replace('{n}', n) : t('est.have'), copyLine(p, c)].join(' · ') : t('cover.missing');
  const b = estItemBox(x.it, p);
  const ph = shownPhotoId(p);
  const thumb = hasPhoto(ph, 'front') ? photoImgHTML(p, 'front', 'thumb', 'data-eager="1"', ph) : `<span class="code-chip" aria-hidden="true">${escapeHTML(pv.code)}</span>`;
  return `<section class="est-sel" id="estSelCard" aria-label="${escapeHTML(p.name)}" style="--plat:${pv.color}">
    <div class="est-sel-head"><span class="est-sel-thumb" aria-hidden="true">${thumb}</span>
      <div class="est-sel-titles"><span class="est-sel-name">${escapeHTML(p.name)}</span><span class="est-sel-sub">${escapeHTML([p.platformName, p.year].filter(Boolean).join(' · '))}<br>${escapeHTML(sub)}</span></div>
      <button type="button" class="btn btn-ghost btn-icon" onclick="estSelect(null)" aria-label="${escapeHTML(t('common.close'))}">${icon('x')}</button></div>
    <div class="quick-actions is-flush">
      <button type="button" class="btn btn-sm primary" onclick="estInspect('${escapeHTML(p.id)}')">${icon('expand')} ${t('est.take_out')}</button>
      <button type="button" class="btn btn-sm" onclick="goProduct('${escapeHTML(p.id)}')">${icon('box')} ${t('est.open_ficha')}</button>
    </div>
    <div class="field-label est-sel-lbl">${t('est.pose')}</div>
    <div class="segmented est-poses" role="group" aria-label="${escapeHTML(t('est.pose'))}">${EST_POSES.map(k=>`<button type="button" class="seg-btn ${pose===k ? 'active' : ''}" aria-pressed="${pose===k}" data-fk="pose-${k}" onclick="estSetPose('${k}')">${t('est.pose.' + k)}</button>`).join('')}</div>
    <div class="est-tools" role="group" aria-label="${escapeHTML(t('est.place_tools'))}">
      <button type="button" class="btn btn-sm" onclick="estMove(-1)" data-fk="mv-l" aria-label="${escapeHTML(t('est.move_left'))}" title="${escapeHTML(t('est.move_left'))}">${icon('chevronLeft')}</button>
      <button type="button" class="btn btn-sm" onclick="estMove(1)" data-fk="mv-r" aria-label="${escapeHTML(t('est.move_right'))}" title="${escapeHTML(t('est.move_right'))}">${icon('chevronRight')}</button>
      <button type="button" class="btn btn-sm" onclick="estNudge(-1)" data-fk="nd-l" aria-label="${escapeHTML(t('est.nudge_left'))}" title="${escapeHTML(t('est.nudge_left'))}">−1 cm</button>
      <button type="button" class="btn btn-sm" onclick="estNudge(1)" data-fk="nd-r" aria-label="${escapeHTML(t('est.nudge_right'))}" title="${escapeHTML(t('est.nudge_right'))}">+1 cm</button>
      <button type="button" class="btn btn-sm" onclick="estRotate(-15)" data-fk="rt-l" aria-label="${escapeHTML(t('est.rot_left'))}" title="${escapeHTML(t('est.rot_left'))}">${icon('rotateLeft')}</button>
      <button type="button" class="btn btn-sm" onclick="estRotate(15)" data-fk="rt-r" aria-label="${escapeHTML(t('est.rot_right'))}" title="${escapeHTML(t('est.rot_right'))}">${icon('rotate')}</button>
      <button type="button" class="btn btn-sm ${x.it.apilado ? 'is-on' : ''}" aria-pressed="${!!x.it.apilado}" data-fk="stack" onclick="estToggleStack()">${icon('stack')} ${t('est.stack')}</button>
    </div>
    <p class="est-sel-dims">${escapeHTML((b.dims.exact ? '' : '≈ ') + [b.dims.w, b.dims.h, b.dims.d].map(fmtCm).join(' × ') + ' cm')} · ${x.it.rot ? escapeHTML(t('est.rot_deg').replace('{n}', x.it.rot)) + ' · ' : ''}<button type="button" class="link-btn" onclick="openMedidasSheet('${escapeHTML(p.id)}')">${t('est.size')}</button> · <button type="button" class="link-btn" onclick="openEstMoveTo()">${t('est.move_to')}</button> · <button type="button" class="link-btn est-danger" onclick="estRemoveSel()">${t('est.remove')}</button></p>
    <p class="settings-note">${t('est.drag_hint')}</p>
  </section>`;
}

/* ---------- Mueble nuevo, montar y ordenar ---------- */
async function estAutoBuild(){
  const E = estEnsure();
  const ms = estAutoPlan({});
  if(!ms.length){ showToast(t('est.nothing')); return; }
  E.muebles = ms;
  EST.view = 'mueble'; EST.mid = ms[0].id; EST.sel = null;
  await estSave(true);
  showToast(t('est.built').replace('{m}', ms.length).replace('{n}', estCountPlaced()), { ok:true, duration:4000 });
  render();
}
async function estRebuild(){
  if(!await showConfirmModal(t('est.rebuild_confirm'), { okLabel:t('est.rebuild') })) return;
  const E = estEnsure();
  const old = E.muebles;
  const ms = estAutoPlan({});
  // conserva el aspecto del primer mueble
  if(old[0]) ms.forEach(m=>{ m.madera = old[0].madera; m.puertas = old[0].puertas; m.luz = old[0].luz; m.placas = old[0].placas; });
  E.muebles = ms;
  EST.view = 'mueble'; EST.mid = ms.length ? ms[0].id : null; EST.sel = null;
  await estSave(true);
  render();
}
async function estAutoAddUnplaced(){
  const E = estEnsure();
  const ms = estAutoPlan({ skipPlaced:true });
  if(!ms.length){ showToast(t('est.nothing')); return; }
  const look = E.muebles[0];
  ms.forEach(m=>{ m.nombre += ' · ' + t('est.new_suffix'); if(look){ m.madera = look.madera; m.puertas = look.puertas; m.luz = look.luz; m.placas = look.placas; } });
  E.muebles = E.muebles.concat(ms);
  EST.view = 'mueble'; EST.mid = ms[0].id; EST.sel = null;
  await estSave(true);
  showToast(t('est.added_unplaced').replace('{n}', ms.reduce((a, m)=>a + m.baldas.reduce((b, x)=>b + x.items.length, 0), 0)), { ok:true });
  render();
}
async function estAddMueble(){
  const name = await showPromptModal(t('est.new_mueble_name'), t('est.mueble_default'));
  if(!name) return;
  const E = estEnsure();
  const m = estNewMueble(name);
  m.baldas = [{ id:estUid('b'), alto:22, placa:'', items:[] }, { id:estUid('b'), alto:22, placa:'', items:[] }, { id:estUid('b'), alto:22, placa:'', items:[] }];
  const look = E.muebles[0];
  if(look){ m.madera = look.madera; m.puertas = look.puertas; m.luz = look.luz; m.placas = look.placas; }
  E.muebles.push(m);
  EST.view = 'mueble'; EST.mid = m.id; EST.sel = null;
  await estSave(true);
  if(view.page!=='estanteria') goEstanteria(); else render();
}
function estSortSurface(mid, sid){
  const m = estMueble(mid), sf = estSurface(m, sid); if(!sf) return;
  const by = new Map(sortGames(sf.items.map(it=>PRODUCTS_BY_ID[it.pid]).filter(Boolean)).map((p, i)=>[p.id, i]));
  sf.items.sort((a, b)=> (by.has(a.pid) ? by.get(a.pid) : 1e9) - (by.has(b.pid) ? by.get(b.pid) : 1e9));
  sf.items.forEach(it=>{ delete it.apilado; delete it.dx; });
  EST.sel = null;
  estAfterEdit();
}
async function estClearSurface(mid, sid){
  const m = estMueble(mid), sf = estSurface(m, sid); if(!sf) return;
  if(!await showConfirmModal(t('est.clear_confirm').replace('{n}', estKnownCount(sf.items)), { danger:true, okLabel:t('est.clear') })) return;
  sf.items = [];
  EST.sel = null;
  estAfterEdit();
}

/* ---------- Hoja: añadir piezas a una balda ---------- */
let estAddState = { sid:'', q:'', plat:'', huecos:true };
function openEstAddSheet(sid){
  const m = estMueble(estMid()); if(!m) return;
  estAddState = { sid: sid || (m.baldas[0] ? m.baldas[0].id : 'top'), q:'', plat:'', huecos:true };
  openSheet({ kind:'est-add', title:t('est.add_pieces'), body:estAddBodyHTML(), foot:`<button type="button" class="btn primary" onclick="closeSheet()">${t('copy.done')}</button>` });
}
function estAddBodyHTML(){
  const m = estMueble(estMid()); if(!m) return '';
  const placed = estPlacedSet();
  const sf = estSurface(m, estAddState.sid) || m.encima;
  const H = estSurfaceH(m, estAddState.sid);
  const L = estLayout(sf.items, m.ancho, H);
  const pct = Math.min(100, Math.round(L.used / m.ancho * 100));
  const surfOpts = [['top', t('est.top')]].concat(m.baldas.map((b, i)=>[b.id, t('est.balda_n').replace('{n}', i + 1) + ' · ' + fmtCm(b.alto) + ' cm'])).map(([v, l])=>`<option value="${v}" ${v===estAddState.sid ? 'selected' : ''}>${escapeHTML(l)}</option>`).join('');
  const plats = getAllPlatforms().filter(pl=> PRODUCTS.some(p=>p.platformId===pl.id && !placed.has(p.id)));
  const tokens = searchTokens(estAddState.q);
  const cand = PRODUCTS.filter(p=> !placed.has(p.id) && (!estAddState.plat || p.platformId===estAddState.plat) && (!tokens.length || productMatchesSearch(p, tokens)));
  const shown = sortGames(cand).slice(0, 40);
  return `<div class="field"><label for="estAddSurf">${t('est.where')}</label><select id="estAddSurf" data-nosave onchange="estAddState.sid=this.value; estAddRefresh()">${surfOpts}</select></div>
    <div class="est-cap is-lg" aria-hidden="true"><span style="width:${pct}%"></span></div>
    <p class="settings-note">${escapeHTML(t('est.cap').replace('{u}', fmtCm(L.used)).replace('{w}', fmtCm(m.ancho)).replace('{h}', fmtCm(H)))}${L.over.length ? ' · ' + escapeHTML(t('est.over').replace('{n}', L.over.length)) : ''}</p>
    <div class="sheet-group"><div class="field-label">${t('est.add_platform')}</div>
      ${plats.length ? `<div class="chip-row">${plats.map(pl=>{ const pv = platVisual(pl.id); const n = PRODUCTS.filter(p=>p.platformId===pl.id && !placed.has(p.id)).length; return `<button type="button" class="chip chip-plat" onclick="estAddPlatform('${pl.id}')"><span class="chip-sw" style="--plat:${pv.color}" aria-hidden="true">${escapeHTML(pv.code)}</span>${escapeHTML(pl.name)} <span class="chip-count">${n}</span></button>`; }).join('')}</div>
      <label class="check-item"><span class="check-label">${t('est.with_gaps')}</span><input type="checkbox" ${estAddState.huecos ? 'checked' : ''} onchange="estAddState.huecos=this.checked"></label>` : `<p class="section-sub">${t('est.all_placed')}</p>`}
    </div>
    <div class="sheet-group"><div class="field-label">${t('est.add_single')}</div>
      <div class="searchbar" role="search">${icon('search','ico-search')}<input type="search" id="estAddQ" value="${escapeHTML(estAddState.q)}" placeholder="${escapeHTML(t('est.search_ph'))}" aria-label="${escapeHTML(t('est.search_ph'))}" oninput="estAddState.q=this.value; clearTimeout(window._estQ); window._estQ=setTimeout(estAddRefresh, 160)" autocomplete="off"></div>
      <div class="est-add-list">${shown.map(p=>{ const pv = platVisual(p.platformId); return `<button type="button" class="est-add-row" onclick="estAddOne('${escapeHTML(p.id)}')"><span class="code-chip" style="--plat:${pv.color}" aria-hidden="true">${escapeHTML(pv.code)}</span><span class="est-add-name">${escapeHTML(p.name)}<small>${escapeHTML([p.year, p.possession!=='tengo' ? t('cover.missing') : ''].filter(Boolean).join(' · '))}</small></span>${icon('plus')}</button>`; }).join('') || `<p class="section-sub est-add-empty">${estAddState.q.trim() ? t('filter.no_results') : t('est.all_placed')}</p>`}</div>
      ${cand.length > shown.length ? `<p class="settings-note">${escapeHTML(t('est.more_results').replace('{n}', cand.length - shown.length))}</p>` : ''}
    </div>`;
}
function estAddRefresh(){
  if(!isSheetKind('est-add')) return;
  // se conservan la posición de la lista y el foco (la fila siguiente si la elegida ya se ha colocado)
  const body = document.getElementById('sheetBody'), y = body ? body.scrollTop : 0;
  const a = document.activeElement;
  const q = document.getElementById('estAddQ'); const hadFocus = q && a===q; const pos = q ? q.selectionStart : 0;
  const kind = a && a.classList ? (a.classList.contains('est-add-row') ? '.est-add-row' : a.classList.contains('chip-plat') ? '.chip-plat' : '') : '';
  const fi = kind ? [...document.querySelectorAll('#sheetBody ' + kind)].indexOf(a) : -1;
  updateSheetBody(estAddBodyHTML());
  const b2 = document.getElementById('sheetBody'); if(b2) b2.scrollTop = y;
  if(hadFocus){ const q2 = document.getElementById('estAddQ'); if(q2){ q2.focus(); try{ q2.setSelectionRange(pos, pos); }catch(e){} } }
  else if(fi >= 0){ const list = document.querySelectorAll('#sheetBody ' + kind); const el = list[Math.min(fi, list.length - 1)] || document.getElementById('estAddQ'); if(el) el.focus({ preventScroll:true }); }
}
function estAddTo(pids){
  const m = estMueble(estMid()); if(!m) return 0;
  const sf = estSurface(m, estAddState.sid) || m.encima;
  let n = 0;
  pids.forEach(pid=>{ estUnplace(pid); sf.items.push({ pid }); n++; });
  return n;
}
function estAddPlatform(platId){
  const placed = estPlacedSet();
  const list = sortGames(PRODUCTS.filter(p=>p.platformId===platId && !placed.has(p.id) && (estAddState.huecos || p.possession==='tengo')));
  const m = estMueble(estMid()); if(!m || !list.length) return;
  const sf = estSurface(m, estAddState.sid) || m.encima;
  // solo las que caben de ancho; el resto se avisa
  const H = estSurfaceH(m, estAddState.sid);
  const take = [];
  for(const p of list){
    const L = estLayout(sf.items.concat(take.map(id=>({ pid:id })), [{ pid:p.id }]), m.ancho, H);
    if(L.over.length) break;
    take.push(p.id);
  }
  const n = estAddTo(take);
  const rest = list.length - n;
  showToast(rest ? t('est.added_some').replace('{n}', n).replace('{r}', rest) : t('est.added_n').replace('{n}', n), { ok: !rest, replace:true, duration: rest ? 5000 : 2200 });
  estAfterEdit(); estAddRefresh();
}
function estAddOne(pid){
  estAddTo([pid]);
  showToast(t('est.added_n').replace('{n}', 1), { ok:true, replace:true });
  estAfterEdit(); estAddRefresh();
}
/* Mover la pieza elegida a otra balda (u otro mueble) */
function openEstMoveTo(){
  const x = estSelItem(); if(!x) return;
  const opts = estData().muebles.map(m=>`<div class="sheet-group"><div class="field-label">${escapeHTML(m.nombre)}</div><div class="chip-row">${[['top', t('est.top')]].concat(m.baldas.map((b, i)=>[b.id, t('est.balda_n').replace('{n}', i + 1)])).map(([sid, l])=>`<button type="button" class="chip ${m.id===x.m.id && sid===EST.sel.sid ? 'active' : ''}" onclick="estMoveTo('${m.id}','${sid}')">${escapeHTML(l)}</button>`).join('')}</div></div>`).join('');
  openSheet({ kind:'est-move', title:t('est.move_to'), body:opts });
}
function estMoveTo(mid, sid){
  const x = estSelItem(); if(!x) return;
  if(mid===x.m.id && sid===EST.sel.sid){ closeSheet(); return; }
  const m = estMueble(mid), sf = estSurface(m, sid); if(!sf) return;
  const it = Object.assign({}, x.it); delete it.apilado; delete it.dx;
  estUnplace(it.pid);
  sf.items.push(it);
  // se ve ya en su sitio nuevo, de cerca
  EST.view = 'balda'; EST.mid = mid; EST.bsid = sid; EST.sel = { mid, sid, idx:sf.items.length - 1, pid:it.pid };
  closeSheet();
  estSave(); render();
}

/* ---------- Hoja: diseñar el mueble ---------- */
function openEstDesign(mid){
  openSheet({ kind:'est-design', title:t('est.design'), focus:'#estW', body:estDesignBodyHTML(mid), foot:`<button type="button" class="btn primary" onclick="closeSheet()">${t('copy.done')}</button>` });
}
function estDesignBodyHTML(mid){
  const m = estMueble(mid); if(!m) return '';
  const slider = (id, label, v, lo, hi, step, js)=> `<div class="field est-range"><label for="${id}">${label} <output id="${id}_o">${fmtCm(v)} cm</output></label><input id="${id}" type="range" min="${lo}" max="${hi}" step="${step}" value="${v}" data-nosave oninput="document.getElementById('${id}_o').textContent=fmtCm(+this.value)+' cm'; ${js}"></div>`;
  const baldas = m.baldas.map((b, i)=>`<div class="est-balda-row">
      ${slider('estB_' + b.id, t('est.balda_n').replace('{n}', i + 1), b.alto, 6, 70, 1, `estSetBalda('${mid}','${b.id}','alto',+this.value)`)}
      <div class="field"><label for="estP_${b.id}">${t('est.plate_text')}</label><input id="estP_${b.id}" type="text" data-nosave value="${escapeHTML(b.placa)}" placeholder="${escapeHTML(estAutoPlate(b) || t('est.plate_auto'))}" onchange="estSetBalda('${mid}','${b.id}','placa',this.value)"></div>
      <div class="est-balda-btns">
        <button type="button" class="btn btn-sm" onclick="estMoveBalda('${mid}','${b.id}',-1)" ${i===0 ? 'disabled' : ''} aria-label="${escapeHTML(t('est.balda_up'))}">${icon('chevronUp')}</button>
        <button type="button" class="btn btn-sm" onclick="estMoveBalda('${mid}','${b.id}',1)" ${i===m.baldas.length - 1 ? 'disabled' : ''} aria-label="${escapeHTML(t('est.balda_down'))}">${icon('chevronDown')}</button>
        <button type="button" class="btn btn-sm btn-danger" onclick="estDelBalda('${mid}','${b.id}')" aria-label="${escapeHTML(t('est.balda_del'))}">${icon('trash')}</button>
      </div></div>`).join('');
  return `<div class="field"><label for="estName">${t('est.mueble_name')}</label><input id="estName" type="text" data-nosave value="${escapeHTML(m.nombre)}" onchange="estSetMueble('${mid}','nombre',this.value)"></div>
    ${slider('estW', t('est.width'), m.ancho, 30, 300, 2, `estSetMueble('${mid}','ancho',+this.value)`)}
    ${slider('estD', t('est.depth'), m.fondo, 15, 60, 1, `estSetMueble('${mid}','fondo',+this.value)`)}
    <p class="settings-note">${escapeHTML(t('est.total_h').replace('{h}', fmtCm(estMuebleHeight(m))))}</p>
    <div class="field-label">${t('est.baldas')}</div>
    <div class="est-baldas">${baldas || `<p class="section-sub">${t('est.no_baldas')}</p>`}</div>
    <div class="quick-actions"><button type="button" class="btn btn-sm" onclick="estAddBalda('${mid}')" ${m.baldas.length >= EST_MAX_BALDAS ? 'disabled' : ''}>${icon('plus')} ${t('est.add_balda')}</button></div>
    <div class="danger-zone"><button type="button" class="btn btn-danger btn-sm" onclick="estDelMueble('${mid}')">${icon('trash')} ${t('est.del_mueble')}</button></div>`;
}
function estDesignRefresh(mid){ if(isSheetKind('est-design')){ const y = document.getElementById('sheetBody').scrollTop; updateSheetBody(estDesignBodyHTML(mid)); document.getElementById('sheetBody').scrollTop = y; } }
/* Los deslizadores mandan muchos cambios seguidos: se dibuja una vez por fotograma */
let _estRaf = 0;
function estRedrawSoon(){ if(_estRaf) return; _estRaf = requestAnimationFrame(()=>{ _estRaf = 0; estDraw(); estRefreshPanel(); }); }
function estSetMueble(mid, k, v){
  const m = estMueble(mid); if(!m) return;
  if(k==='nombre'){ m.nombre = String(v || '').trim() || m.nombre; estSave(); render(); return; }
  if(k==='ancho') v = estNum(v, 30, 400, m.ancho); else if(k==='fondo') v = estNum(v, 15, 80, m.fondo);
  m[k] = v;
  estSave(); estRedrawSoon();
  const tot = document.querySelector('#sheetBody .settings-note'); if(tot && k!=='nombre') tot.textContent = t('est.total_h').replace('{h}', fmtCm(estMuebleHeight(m)));
}
function estSetBalda(mid, bid, k, v){
  const m = estMueble(mid), b = m && m.baldas.find(x=>x.id===bid); if(!b) return;
  b[k] = k==='placa' ? String(v || '').trim().slice(0, 40) : k==='alto' ? estNum(v, 6, 80, b.alto) : v;
  estSave(); estRedrawSoon();
  const tot = document.querySelector('#sheetBody .settings-note'); if(tot) tot.textContent = t('est.total_h').replace('{h}', fmtCm(estMuebleHeight(m)));
}
function estAddBalda(mid){
  const m = estMueble(mid); if(!m || m.baldas.length >= EST_MAX_BALDAS) return;
  m.baldas.push({ id:estUid('b'), alto: m.baldas.length ? m.baldas[m.baldas.length - 1].alto : 22, placa:'', items:[] });
  estSave(); estDraw(); estRefreshPanel(); estDesignRefresh(mid);
}
function estMoveBalda(mid, bid, d){
  const m = estMueble(mid); if(!m) return;
  const i = m.baldas.findIndex(b=>b.id===bid), j = i + d;
  if(i < 0 || j < 0 || j >= m.baldas.length) return;
  [m.baldas[i], m.baldas[j]] = [m.baldas[j], m.baldas[i]];
  estSave(); estDraw(); estRefreshPanel(); estDesignRefresh(mid);
}
async function estDelBalda(mid, bid){
  const m = estMueble(mid); if(!m) return;
  const b = m.baldas.find(x=>x.id===bid); if(!b) return;
  if(estKnownCount(b.items) && !await showConfirmModal(t('est.balda_del_confirm').replace('{n}', estKnownCount(b.items)), { danger:true, okLabel:t('common.delete') })) return;
  m.baldas = m.baldas.filter(x=>x.id!==bid);
  if(EST.sel && EST.sel.sid===bid) EST.sel = null;
  estSave(); estDraw(); estRefreshPanel(); estDesignRefresh(mid);
}
async function estDelMueble(mid){
  const m = estMueble(mid); if(!m) return;
  const n = estKnownCount(m.encima.items) + m.baldas.reduce((a, b)=>a + estKnownCount(b.items), 0);
  if(!await showConfirmModal(t('est.del_mueble_confirm').replace('{name}', m.nombre).replace('{n}', n), { danger:true, okLabel:t('common.delete') })) return;
  const E = estData();
  E.muebles = E.muebles.filter(x=>x.id!==mid);
  EST.sel = null; EST.mid = E.muebles[0] ? E.muebles[0].id : null;
  if(E.muebles.length < 2) EST.view = 'mueble';
  closeSheet();
  await estSave(true);
  render();
}

/* ---------- Hoja: personalizar ---------- */
function openEstStyle(){
  openSheet({ kind:'est-style', title:t('est.style'), body:estStyleBodyHTML(), foot:`<button type="button" class="btn primary" onclick="closeSheet()">${t('copy.done')}</button>` });
}
function estStyleBodyHTML(){
  const E = estData();
  const m = EST.view==='sala' ? null : estMueble(estMid());
  const target = m || E.muebles[0]; if(!target) return '';
  const opt = (k, v, label, sw)=> `<button type="button" class="est-opt ${target[k]===v ? 'active' : ''}" aria-pressed="${target[k]===v}" onclick="estSetStyle('${k}','${v}')"><span class="est-sw${sw ? '' : ' is-none'}"${sw ? ` style="${sw}"` : ''} aria-hidden="true"></span><span>${escapeHTML(label)}</span></button>`;
  const group = (key, inner)=> `<div class="sheet-group"><div class="field-label">${t('est.style.' + key)}</div><div class="est-opts">${inner}</div></div>`;
  return (m ? '' : `<p class="settings-note">${t('est.style_all')}</p>`)
    + group('madera', Object.keys(EST_WOODS).map(k=>opt('madera', k, t('est.wood.' + k), `background:linear-gradient(135deg, ${EST_WOODS[k].t}, ${EST_WOODS[k].f} 55%, ${EST_WOODS[k].e})`)).join(''))
    + group('puertas', EST_DOORS.map(k=>opt('puertas', k, t('est.doors.' + k), k==='sin' ? '' : `background:linear-gradient(115deg, rgba(255,255,255,0.65), rgba(200,220,235,${k==='ahumado' ? '0.35' : '0.18'}) 45%, rgba(${k==='ahumado' ? '40,42,48,0.55' : '255,255,255,0.4'}))`)).join(''))
    + group('luz', Object.keys(EST_LIGHTS).map(k=>opt('luz', k, t('est.light.' + k), k==='apagada' ? 'background:#3a3a40' : k==='plataforma' ? 'background:conic-gradient(#a0413a,#3f4f93,#2c6a5e,#b8863c,#a0413a)' : `background:${EST_LIGHTS[k]};box-shadow:0 0 10px ${EST_LIGHTS[k]}`)).join(''))
    + group('placas', Object.keys(EST_PLATES).map(k=>opt('placas', k, t('est.plates.' + k), EST_PLATES[k] ? `background:linear-gradient(180deg, ${EST_PLATES[k][1]}, ${EST_PLATES[k][0]})` : '')).join(''))
    + `<div class="sheet-group"><div class="field-label">${t('est.style.pared')}</div><div class="est-opts">${EST_WALLS.map(k=>`<button type="button" class="est-opt ${E.pared===k ? 'active' : ''}" aria-pressed="${E.pared===k}" onclick="estSetWall('${k}')"><span class="est-sw est-wall-sw" data-wall="${k}" aria-hidden="true"></span><span>${escapeHTML(t('est.wall.' + k))}</span></button>`).join('')}</div></div>`;
}
function estSetStyle(k, v){
  const E = estData();
  const m = EST.view==='sala' ? null : estMueble(estMid());
  (m ? [m] : E.muebles).forEach(x=>{ x[k] = v; });
  estSave(); estDraw(); estRefreshCtl();
  if(isSheetKind('est-style')) updateSheetBody(estStyleBodyHTML());
}
function estSetWall(v){ const E = estData(); E.pared = v; estSave(); estDraw(); if(isSheetKind('est-style')) updateSheetBody(estStyleBodyHTML()); }

/* =====================================================================
   7. SACARLA: la pieza en grande, girando
   ===================================================================== */
let estInspectState = null;
function estInspectOpen(){ return !!estInspectState; }
function estInspect(pid){
  const p = PRODUCTS_BY_ID[pid]; if(!p) return;
  estCloseInspect(true);
  const pv = platVisual(p.platformId);
  const d0 = piezaDims(p);
  const ph = shownPhotoId(p);
  const n = copyCount(p), c = shownCopy(p);
  const root = document.createElement('div');
  root.id = 'estInspect'; root.className = 'est-inspect';
  root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-labelledby', 'estInsT');
  const maxS = Math.min(innerWidth * 0.62, innerHeight * 0.42);
  const s = maxS / Math.max(d0.w, d0.h);
  const w = d0.w * s, h = d0.h * s, d = Math.max(4, d0.d * s);
  const face = (cls, fw, fh, tf, side, inner)=> `<div class="est-f est-pc ${cls}"${side && hasPhoto(ph, side) ? ` data-ph="${escapeHTML(ph)}|${side}|full"` : ''} style="width:${fw}px;height:${fh}px;margin:${-fh / 2}px 0 0 ${-fw / 2}px;transform:${tf}">${inner || ''}</div>`;
  const spine = estSpineLabel(p, d, h, false);
  const sub = p.possession==='tengo' ? [n > 1 ? t('est.have_n').replace('{n}', n) : t('est.have'), copyLine(p, c)].join(' · ') : t('cover.missing');
  root.innerHTML = `<div class="est-ins-bg" onclick="estCloseInspect()"></div>
    <div class="est-ins-stage" id="estInsStage"><div class="est-ins-rot" id="estInsRot" style="--plat:${pv.color}">
      ${face('is-front', w, h, `translateZ(${d / 2}px)`, 'front', `<span class="est-cover-txt"><b>${escapeHTML(pv.code)}</b>${escapeHTML(p.name)}</span>`)}
      ${face('is-back', w, h, `rotateY(180deg) translateZ(${d / 2}px)`, 'back', '')}
      ${face('is-spine', d, h, `rotateY(-90deg) translateZ(${w / 2}px)`, '', spine)}
      ${face('is-edge', d, h, `rotateY(90deg) translateZ(${w / 2}px)`, '', '')}
      ${face('is-top', w, d, `rotateX(90deg) translateZ(${h / 2}px)`, '', '')}
      ${face('is-top', w, d, `rotateX(-90deg) translateZ(${h / 2}px)`, '', '')}
    </div></div>
    <div class="est-ins-card">
      <h2 class="est-ins-title" id="estInsT">${escapeHTML(p.name)}</h2>
      <p class="est-ins-sub">${escapeHTML([p.platformName, p.year].filter(Boolean).join(' · '))}<br>${escapeHTML(sub)}</p>
      <div class="segmented" role="group" aria-label="${escapeHTML(t('est.view_side'))}">
        <button type="button" class="seg-btn" data-deg="0" aria-pressed="false" onclick="estInsView(0)">${t('est.side.front')}</button>
        <button type="button" class="seg-btn" data-deg="90" aria-pressed="false" onclick="estInsView(90)">${t('est.side.spine')}</button>
        <button type="button" class="seg-btn" data-deg="180" aria-pressed="false" onclick="estInsView(180)">${t('est.side.back')}</button>
        <button type="button" class="seg-btn" id="estInsSpin" aria-pressed="false" onclick="estInsSpin()">${icon('rotate')} ${t('est.side.spin')}</button>
      </div>
      <div class="quick-actions">
        <button type="button" class="btn" onclick="estCloseInspect()">${icon('chevronLeft')} ${t('est.put_back')}</button>
        <button type="button" class="btn primary" onclick="estCloseInspect(); goProduct('${escapeHTML(p.id)}')">${icon('box')} ${t('est.open_ficha')}</button>
      </div>
    </div>`;
  document.body.appendChild(root);
  estInspectState = { ry:-14, rx:-5, ret: document.activeElement };
  estHydratePhotos(root);
  estInsApply();
  estInsMark(null);
  // deslizar a un lado = el lado siguiente (frente → lomo → trasera → otro lado)
  const stg = root.querySelector('#estInsStage');
  let g = null;
  stg.addEventListener('pointerdown', (e)=>{ g = { x:e.clientX }; });
  stg.addEventListener('pointerup', (e)=>{ if(!g) return; const dx = e.clientX - g.x; g = null; if(Math.abs(dx) > 36) estInsStep(dx < 0 ? 1 : -1); });
  stg.addEventListener('pointercancel', ()=>{ g = null; });
  setTimeout(()=>{ const b = root.querySelector('.est-ins-card .quick-actions .btn'); if(b) b.focus(); }, 40);
}
/* Marca el lado que se está viendo (o ninguno si se gira a mano) */
function estInsMark(deg){
  document.querySelectorAll('#estInspect .seg-btn[data-deg]').forEach(b=>{ const on = deg!==null && Number(b.dataset.deg)===deg; b.classList.toggle('active', on); b.setAttribute('aria-pressed', String(on)); });
}
function estInsApply(){ const r = document.getElementById('estInsRot'); if(r && estInspectState) r.style.transform = `rotateX(${estInspectState.rx}deg) rotateY(${estInspectState.ry}deg)`; }
function estInsStopSpin(){
  const root = document.getElementById('estInspect'); if(!root || !root.classList.contains('is-spin')) return;
  // se queda donde iba el giro
  const r = document.getElementById('estInsRot');
  const m = r ? getComputedStyle(r).transform : '';
  root.classList.remove('is-spin');
  const b = document.getElementById('estInsSpin'); if(b) b.setAttribute('aria-pressed', 'false');
  if(m && m.startsWith('matrix3d')){ const v = m.slice(9, -1).split(',').map(Number); estInspectState.ry = Math.atan2(-v[2], v[0]) * 180 / Math.PI; }
  estInsApply();
}
function estInsStep(d){
  if(!estInspectState) return;
  const sides = [0, 90, 180, 270];
  const cur = ((Math.round(estInspectState.ry / 90) * 90) % 360 + 360) % 360;
  const i = sides.indexOf(cur), j = ((i < 0 ? 0 : i) + d + 4) % 4;
  estInsView(sides[j]);
}
function estInsView(deg){ estInsStopSpin(); if(!estInspectState) return; estInsMark(deg); estInspectState.ry = deg; estInspectState.rx = -6; const r = document.getElementById('estInsRot'); if(r){ r.classList.add('is-anim'); estInsApply(); setTimeout(()=>r.classList.remove('is-anim'), 600); } }
function estInsSpin(){
  const root = document.getElementById('estInspect'); if(!root) return;
  if(root.classList.contains('is-spin')){ estInsStopSpin(); return; }
  const r = document.getElementById('estInsRot'); if(r) r.style.transform = '';
  root.classList.add('is-spin');
  estInsMark(null);
  const b = document.getElementById('estInsSpin'); if(b) b.setAttribute('aria-pressed', 'true');
}
function estCloseInspect(silent){
  const root = document.getElementById('estInspect');
  const st = estInspectState; estInspectState = null;
  if(root) root.remove();
  _trimBig.splice(0).forEach(u=>{ try{ URL.revokeObjectURL(u); }catch(e){} });
  if(!silent && st && st.ret && st.ret.focus && document.contains(st.ret)) try{ st.ret.focus(); }catch(e){}
}

/* =====================================================================
   8. ACCESOS: Dashboard y ficha
   ===================================================================== */
function estDashCardHTML(){
  if(!PRODUCTS.length) return '';
  const has = estHas();
  const E = estData();
  const sub = has ? t('est.sub').replace('{m}', E.muebles.length).replace('{n}', estCountPlaced()).replace('{t}', PRODUCTS.length) : t('est.dash_new');
  // un mueble en miniatura (dibujo plano, con los colores de tus plataformas)
  const plats = [...new Set(PRODUCTS.map(p=>p.platformId))].slice(0, 14).map(id=>platVisual(id).color);
  const spines = Array.from({ length:3 }, (_, r)=> `<span class="edc-row">${Array.from({ length:11 }, (_, i)=>`<i style="--plat:${plats[(i + r * 4) % Math.max(1, plats.length)] || '#888'};height:${62 + ((i * 7 + r * 13) % 32)}%"></i>`).join('')}</span>`).join('');
  return `<button type="button" class="est-dash vit-card is-tappable" onclick="goEstanteria()">
    <span class="edc-art" aria-hidden="true">${spines}</span>
    <span class="edc-txt"><span class="edc-kicker">${t('est.kicker')}</span><span class="edc-title">${t(has ? 'est.dash_title' : 'est.dash_title_new')}</span><span class="edc-sub">${escapeHTML(sub)}</span></span>
    ${icon('chevronRight')}
  </button>`;
}
/* En la ficha: dónde está (o «Colocarla») */
function estPieceRowHTML(p){
  if(!estHas()) return '';
  const f = estFind(p.id);
  if(f){
    const where = f.sid==='top' ? t('est.top') : t('est.balda_n').replace('{n}', f.n);
    return `<div class="est-where"><span class="est-where-ic" aria-hidden="true">${icon('cabinet')}</span><span class="est-where-txt">${escapeHTML(t('est.in_shelf').replace('{m}', f.m.nombre).replace('{b}', where))}</span>
      <button type="button" class="btn btn-sm" onclick="goEstanteria({ pid:'${escapeHTML(p.id)}' })">${t('est.see')}</button></div>`;
  }
  return `<div class="est-where is-out"><span class="est-where-ic" aria-hidden="true">${icon('cabinet')}</span><span class="est-where-txt">${t('est.not_in_shelf')}</span>
    <button type="button" class="btn btn-sm" onclick="estPlaceFromFicha('${escapeHTML(p.id)}')">${t('est.place_it')}</button></div>`;
}
function estPlaceFromFicha(pid){
  const E = estData(); if(!E.muebles.length) return;
  const body = E.muebles.map(m=>`<div class="sheet-group"><div class="field-label">${escapeHTML(m.nombre)}</div><div class="chip-row">${[['top', t('est.top')]].concat(m.baldas.map((b, i)=>[b.id, t('est.balda_n').replace('{n}', i + 1) + (estPlateText(b) ? ' · ' + estPlateText(b) : '')])).map(([sid, l])=>`<button type="button" class="chip" onclick="estPlaceIn('${escapeHTML(pid)}','${m.id}','${sid}')">${escapeHTML(l)}</button>`).join('')}</div></div>`).join('');
  openSheet({ kind:'est-place', title:t('est.place_it'), body });
}
function estPlaceIn(pid, mid, sid){
  const m = estMueble(mid), sf = estSurface(m, sid); if(!sf) return;
  estUnplace(pid);
  sf.items.push({ pid });
  closeSheet();
  estSave(true).then(()=>{ goEstanteria({ pid }); });
}

/* Al girar el móvil o cambiar el tamaño de la ventana, se vuelve a encajar */
let _estResizeT = null;
window.addEventListener('resize', ()=>{
  if(view.page!=='estanteria' || view.productId) return;
  clearTimeout(_estResizeT); _estResizeT = setTimeout(()=>{ if(view.page==='estanteria' && !view.productId) estDraw(); }, 150);
});
