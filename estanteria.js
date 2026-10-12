/* La Colección App — estanteria.js (v11.11 · v11.12)
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
   estándar (plano.js, piezaDims).
   v11.12 (se añaden; nada se quita ni se renombra):
     item.x      = su sitio en la balda (cm desde la izquierda). Una vez que
                   tocas una balda, cada pieza guarda el suyo: mover una ya
                   no corre las demás. Sin x, va a continuación de la anterior.
     item.fila   = 'detras' si está en la fila de atrás (si no, delante).
     coloresLomo = { plataformas:{ <plataforma>:{ lomo, banda } },
                     piezas:{ <pieza>:{ lomo, banda } } }
                   lomo: 'portada' | 'app' | '#rrggbb'; banda: '' | '#rrggbb'
     carpetas    = { <id>:{ id, nombre, ancho, alto, fondo, color, pids:[…] } }
                   En una balda, una carpeta es un item con pid 'carpeta:<id>'
                   (una versión anterior lo conserva sin verlo). Las piezas
                   de dentro no están en ninguna balda. */

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
    if('x' in it){ const x = Number(it.x); if(isFinite(x)) it.x = Math.round(Math.min(800, Math.max(0, x)) * 10) / 10; else delete it.x; }
    if('fila' in it && it.fila!=='detras') delete it.fila;
  });
  return out.length===arr.length ? arr : out;
}
const EST_HEX = /^#[0-9a-f]{6}$/i;
const EST_FOLDER = 'carpeta:';
/* Colores del lomo de una plataforma o una pieza: { lomo, banda } */
function estCleanColor(c){
  if(!estIsObj(c)) return null;
  if('lomo' in c && !(c.lomo==='portada' || c.lomo==='app' || EST_HEX.test(String(c.lomo)))) delete c.lomo;
  if('banda' in c && !(c.banda==='' || EST_HEX.test(String(c.banda)))) delete c.banda;
  return ('lomo' in c || 'banda' in c) ? c : null;
}
function estCleanColorMap(o){
  if(!estIsObj(o)) return {};
  Object.keys(o).forEach(k=>{ if(!estCleanColor(o[k])) delete o[k]; });
  return o;
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
  // v11.12: colores del lomo y carpetas (solo si ya los hay: no se escribe nada nuevo al abrir)
  if('coloresLomo' in E){
    if(!estIsObj(E.coloresLomo)) E.coloresLomo = {};
    E.coloresLomo.plataformas = estCleanColorMap(E.coloresLomo.plataformas);
    E.coloresLomo.piezas = estCleanColorMap(E.coloresLomo.piezas);
  }
  if('carpetas' in E){
    if(!estIsObj(E.carpetas)) E.carpetas = {};
    const inside = new Set();
    Object.keys(E.carpetas).forEach(k=>{
      const f = E.carpetas[k];
      if(!estIsObj(f) || !estOkId(k)){ delete E.carpetas[k]; return; }
      f.id = k;
      f.nombre = String(f.nombre || '').slice(0, 60);
      f.ancho = estNum(f.ancho, 1, 120, 23); f.alto = estNum(f.alto, 1, 120, 31); f.fondo = estNum(f.fondo, 0.2, 60, 3);
      if(!EST_HEX.test(String(f.color || ''))) f.color = '#2f5fa8';
      if(!Array.isArray(f.pids)) f.pids = [];
      // cada pieza, en una sola carpeta (y una sola vez)
      const ok = [];
      f.pids.forEach(p=>{ if(typeof p==='string' && p && !p.startsWith(EST_FOLDER) && !inside.has(p)){ inside.add(p); ok.push(p); } });
      if(ok.length!==f.pids.length) f.pids = ok;
    });
    // manda la carpeta: si una de sus piezas aparece además en una balda, se quita de la balda
    if(inside.size) E.muebles.forEach(m=> [m.encima].concat(m.baldas).forEach(sf=>{
      for(let i = sf.items.length - 1; i >= 0; i--) if(inside.has(sf.items[i].pid)) estSpliceItem(sf, i);
    }));
  }
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
function estKnown(it){ return !!(it && estP(it.pid)); }
function estKnownCount(items){ return items.reduce((a, it)=> a + (estKnown(it) ? 1 : 0), 0); }
/* Piezas de verdad de una fila (lo que hay dentro de las carpetas cuenta) */
function estPieceCount(items){ return items.reduce((a, it)=>{ const p = estP(it.pid); return a + (!p ? 0 : p.isFolder ? estFolderPieces(p.folder).length : 1); }, 0); }
/* ---------- Carpetas (v11.12) ---------- */
function estFolders(){ const E = estData(); return estIsObj(E.carpetas) ? E.carpetas : {}; }
function estEnsureFolders(){ const E = estEnsure(); if(!estIsObj(E.carpetas)) E.carpetas = {}; return E.carpetas; }
function estIsFolderPid(pid){ return typeof pid==='string' && pid.startsWith(EST_FOLDER); }
function estFolder(cid){ const F = estFolders(); return Object.prototype.hasOwnProperty.call(F, cid) ? F[cid] : null; }
function estFolderPieces(f){ return f.pids.map(id=>PRODUCTS_BY_ID[id]).filter(Boolean); }
/* Una carpeta se comporta en la estantería como una pieza más (con sus medidas) */
function estFolderP(f){
  return { id:EST_FOLDER + f.id, isFolder:true, folder:f, name: f.nombre || t('est.folder_default'), possession:'tengo', platformId:'', platformName:t('est.folder'), year:'',
    medidas:{ ancho:f.ancho, alto:f.alto, fondo:f.fondo } };
}
/* La pieza (o la carpeta) de un item */
function estP(pid){
  if(estIsFolderPid(pid)){ const f = estFolder(pid.slice(EST_FOLDER.length)); return f ? estFolderP(f) : null; }
  return PRODUCTS_BY_ID[pid] || null;
}
function estFolderOf(pid){ const F = estFolders(); for(const k in F){ if(F[k].pids.includes(pid)) return F[k]; } return null; }
/* ¿Dónde está? Como estFind, pero también dentro de una carpeta: { …, folder } */
function estLocate(pid){
  const f = estFind(pid); if(f) return f;
  const c = estFolderOf(pid); if(!c) return null;
  const g = estFind(EST_FOLDER + c.id);
  return g ? Object.assign({ folder:c }, g) : { folder:c, m:null };
}
/* ---------- Colores del lomo (v11.12) ---------- */
function estColors(){ const E = estData(); const C = estIsObj(E.coloresLomo) ? E.coloresLomo : {}; return { plataformas: estIsObj(C.plataformas) ? C.plataformas : {}, piezas: estIsObj(C.piezas) ? C.piezas : {} }; }
function estEnsureColors(){
  const E = estEnsure();
  if(!estIsObj(E.coloresLomo)) E.coloresLomo = {};
  if(!estIsObj(E.coloresLomo.plataformas)) E.coloresLomo.plataformas = {};
  if(!estIsObj(E.coloresLomo.piezas)) E.coloresLomo.piezas = {};
  return E.coloresLomo;
}
/* Cambia (o quita, con undefined) lomo / banda de una plataforma o de una pieza */
function estSetColor(scope, id, part, v){
  const C = estEnsureColors();
  const map = scope==='plat' ? C.plataformas : C.piezas;
  const o = estIsObj(map[id]) ? map[id] : {};
  if(v===undefined) delete o[part]; else o[part] = v;
  if(estCleanColor(o)) map[id] = o; else delete map[id];
}
function estLum(hex){ const n = parseInt(String(hex).slice(1), 16); return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255; }
/* El lomo de una pieza: { color (o null = el medio de su foto), banda ('' = sin) } */
function estLomo(p){
  if(p.isFolder) return { color: p.folder.color, banda:'' };
  const C = estColors();
  const pc = C.piezas[p.id] || {}, pl = (p.platformId && C.plataformas[p.platformId]) || {};
  const lomo = pc.lomo!==undefined ? pc.lomo : (pl.lomo || 'portada');
  const banda = pc.banda!==undefined ? pc.banda : (pl.banda || '');
  return { color: lomo==='app' ? platVisual(p.platformId).color : EST_HEX.test(lomo) ? lomo : null, banda };
}
/* Guardado: al momento en memoria; en disco, agrupando cambios seguidos */
let _estSaveTimer = null;
let _estGen = 0, _estUndo = null;   // v11.13: cada cambio cuenta; el «Deshacer» de varias solo vale hasta el siguiente
function estSave(now){
  _estGen++;
  if(_estUndo && _estUndo.gen!==_estGen){ dismissToast(_estUndo.el); _estUndo = null; }
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
/* Lo que está en la estantería: lo colocado en las baldas y lo que hay dentro
   de las carpetas colocadas */
function estPlacedSet(){
  const s = new Set();
  const add = (it)=>{ s.add(it.pid); if(estIsFolderPid(it.pid)){ const f = estFolder(it.pid.slice(EST_FOLDER.length)); if(f) f.pids.forEach(p=>s.add(p)); } };
  estData().muebles.forEach(m=>{ m.encima.items.forEach(add); m.baldas.forEach(b=>b.items.forEach(add)); });
  return s;
}
/* Lo que ya tiene sitio: lo colocado y todo lo que está en alguna carpeta */
function estTakenSet(){
  const s = estPlacedSet();
  Object.values(estFolders()).forEach(f=> f.pids.forEach(p=> s.add(p)));
  return s;
}
/* Quita el item i de una fila. Si era la base de una pila, la de encima se
   queda en su sitio (hereda su x y su fila). Devuelve esa pieza o null. */
function estSpliceItem(sf, i){
  const was = sf.items[i]; sf.items.splice(i, 1);
  const nx = sf.items[i];
  if(was && !was.apilado && nx && nx.apilado){
    delete nx.apilado;
    if(typeof was.x==='number') nx.x = was.x;
    if(was.fila) nx.fila = was.fila;
    return nx;
  }
  return null;
}
/* Quita una pieza de donde esté (cada pieza va en un solo sitio: una balda o una carpeta) */
function estUnplace(pid){
  estData().muebles.forEach(m=>{
    [m.encima].concat(m.baldas).forEach(sf=>{
      if(!sf.items.some(it=>it.pid===pid)) return;
      estFreeze(m, sf===m.encima ? 'top' : sf.id);   // las que se quedan, en su sitio
      const i = sf.items.findIndex(it=>it.pid===pid);
      if(i >= 0) estSpliceItem(sf, i);
    });
  });
  const F = estFolders();
  for(const k in F){ const i = F[k].pids.indexOf(pid); if(i >= 0) F[k].pids.splice(i, 1); }
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
/* De fondo (cm desde el borde de delante): la fila de delante va pegada al
   frente; la de detrás, al fondo de la balda */
function estZRange(row, fd, D){
  if(!row) return [EST_FRONT, EST_FRONT + fd];
  const z0 = Math.max(EST_FRONT, D - 0.5 - fd);
  return [z0, z0 + fd];
}
function estZHit(a, b){ return a[1] > b[0] + 0.01 && b[1] > a[0] + 0.01; }
/* Coloca una fila: columnas (una pieza y las apiladas encima). Cada columna va
   en su sitio (x) o, si no tiene, a continuación de la anterior de su fila.
   Dos columnas no pueden pisarse (choque): si una pisa a otra en su fila (o en
   la otra fila, si no caben las dos de fondo), se corre a la derecha.
   W = ancho, H = alto, D = fondo de la balda (cm). Devuelve la posición de
   cada pieza y lo que no cabe. */
function estLayout(items, W, H, D){
  D = D || 32;
  const cols = [], out = [];
  items.forEach((it, idx)=>{
    const p = estP(it.pid); if(!p) return;
    const b = estItemBox(it, p);
    const rec = { it, idx, p, b, y:0 };
    const last = cols[cols.length - 1];
    if(it.apilado && last){
      rec.y = last.top; last.top += b.hgt; last.items.push(rec);
      last.fw = Math.max(last.fw, b.fw); last.fd = Math.max(last.fd, b.fd);
    } else cols.push({ base:it, idx, items:[rec], fw:b.fw, fd:b.fd, top:b.hgt, row: it.fila==='detras' ? 1 : 0 });
    out.push(rec);
  });
  // dónde quiere ir cada una
  const cur = [EST_GAP, EST_GAP];
  cols.forEach(c=>{
    c.want = Math.max(0, typeof c.base.x==='number' ? c.base.x : cur[c.row] + Math.max(-EST_GAP, c.base.dx || 0));
    cur[c.row] = c.want + c.fw + EST_GAP;
    c.z = estZRange(c.row, c.fd, D);
  });
  // sin pisarse: de izquierda a derecha, la que pisa a otra ya colocada se corre
  const done = [];
  cols.slice().sort((a, b)=> a.want - b.want || a.idx - b.idx).forEach(c=>{
    let x = c.want, moved = true, guard = 0;
    while(moved && guard++ < 500){
      moved = false;
      for(const q of done){
        if(!estZHit(c.z, q.z)) continue;
        if(x < q.x + q.fw - 0.01 && x + c.fw > q.x + 0.01){ x = q.x + q.fw + EST_GAP; moved = true; }
      }
    }
    c.x = x; done.push(c);
  });
  const over = [], tall = [];
  let used = EST_GAP;
  cols.forEach(c=>{
    c.items.forEach(r=>{ r.x = c.x + c.fw / 2; r.colW = c.fw; r.row = c.row; r.col = c; const z = estZRange(c.row, r.b.fd, D); r.zc = (z[0] + z[1]) / 2; });
    used = Math.max(used, c.x + c.fw + EST_GAP);
    if(c.x + c.fw > W + 0.01) c.items.forEach(r=> over.push(r.p.id));
    else if(c.top > H + 0.01) c.items.forEach(r=> tall.push(r.p.id));
  });
  return { recs:out, cols, used, over, tall };
}
function estR1(v){ return Math.round(v * 10) / 10; }
/* Fija el sitio de cada columna tal y como se ve (al tocar una balda por
   primera vez y antes de cada cambio): así mover una no corre las demás. Si
   una se ensanchó y empujó a sus vecinas, ese es ya su sitio (no vuelven
   solas a donde estaban cuando luego cambias otra cosa). Deja la fila
   ordenada (delante y luego detrás, de izquierda a derecha). */
function estFreeze(m, sid){
  const sf = estSurface(m, sid); if(!sf) return null;
  const L = estLayout(sf.items, m.ancho, estSurfaceH(m, sid), m.fondo);
  L.cols.forEach(c=>{ c.base.x = estR1(c.x); delete c.base.dx; if(c.row) c.base.fila = 'detras'; else delete c.base.fila; });
  estSortRow(sf, L);
  return sf;
}
/* Ordena la fila: delante y luego detrás, de izquierda a derecha (según se
   ven, si se pasa L; si no, según su sitio guardado) */
function estSortRow(sf, L){
  const groups = estColumns(sf.items).map(([a, b])=> sf.items.slice(a, b + 1));
  const shown = new Map(); if(L) L.cols.forEach(c=> shown.set(c.base, c.x));
  const key = (g)=>{ const base = g.find(it=> estKnown(it) && !it.apilado) || g[0]; return [base.fila==='detras' ? 1 : 0, shown.has(base) ? shown.get(base) : typeof base.x==='number' ? base.x : 1e6]; };
  const keyed = groups.map((g, i)=>({ g, i, k:key(g) }));
  keyed.sort((a, b)=> a.k[0] - b.k[0] || a.k[1] - b.k[1] || a.i - b.i);
  const flat = [].concat(...keyed.map(o=>o.g));
  sf.items.splice(0, sf.items.length, ...flat);
}
/* Lo que ocupa sitio para la columna c en una fila (las de su fila y, si no
   caben de fondo, las de la otra): [[desde, hasta], …] */
function estObstacles(L, c, row, D){
  const z = estZRange(row, c.fd, D);
  return L.cols.filter(q=> q!==c && estZHit(z, q.z)).map(q=>[q.x, q.x + q.fw]).sort((a, b)=> a[0] - b[0]);
}
/* El sitio libre más cercano a `want` donde cabe algo de ancho fw (o null si
   no hay ninguno a menos de maxDist) */
function estFreeSpot(obs, fw, want, W, maxDist){
  const ivs = []; let s = 0;
  obs.forEach(([a, b])=>{ if(a - EST_GAP > s) ivs.push([s, a - EST_GAP]); s = Math.max(s, b + EST_GAP); });
  ivs.push([s, Math.max(W, s)]);
  let best = null, bd = Infinity;
  ivs.forEach(([a, b])=>{
    if(b - a + 0.001 < fw) return;
    const x = Math.min(Math.max(want, a), b - fw), d = Math.abs(x - want);
    if(d < bd){ bd = d; best = x; }
  });
  if(best===null || bd > (maxDist===undefined ? Infinity : maxDist)) return null;
  return estR1(best);
}
/* ¿Cabe la columna c en x (en su fila) sin pisar a ninguna otra, salvo las
   de `skip` (las que se mueven a la vez)? Cuenta también la otra fila si no
   caben las dos de fondo. */
function estFitsAt(L, c, x, D, skip){
  const z = estZRange(c.row, c.fd, D);
  return L.cols.every(q=> q===c || (skip && skip.includes(q)) || !estZHit(z, q.z) || x + c.fw <= q.x + 0.01 || x >= q.x + q.fw - 0.01);
}
function estSurfaceH(m, sid){ if(sid==='top') return EST_TOP_H; const b = estSurface(m, sid); return b ? b.alto : 0; }
/* Placa automática: las plataformas de la balda (y lo que tienes de ellas ahí) */
function estAutoPlate(b){
  const codes = [], seen = new Set(); let have = 0, tot = 0;
  // (lo que hay dentro de una carpeta cuenta como si estuviera en la balda)
  const list = [];
  b.items.forEach(it=>{ const p = estP(it.pid); if(!p) return; if(p.isFolder) list.push(...estFolderPieces(p.folder)); else list.push(p); });
  list.forEach(p=>{ tot++; if(p.possession==='tengo') have++; const c = platVisual(p.platformId).code || '—'; if(!seen.has(c)){ seen.add(c); codes.push(p); } });
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
  // v11.12: las piezas de una carpeta no van sueltas: va la carpeta (una vez),
  // en el sitio de la primera de ellas
  const folderOf = new Map();
  Object.values(estFolders()).forEach(f=> f.pids.forEach(pid=> folderOf.set(pid, f)));
  const doneF = new Set();
  if(opts.skipPlaced) placed.forEach(pid=>{ if(estIsFolderPid(pid)) doneF.add(pid.slice(EST_FOLDER.length)); });
  const muebles = [];
  getAllCategories().forEach(cat=>{
    const plats = orderedPlatformsForCategory(cat.id, getAllPlatforms().filter(p=>p.categoryId===cat.id));
    let m = null, cur = null, part = 1;
    const newM = ()=>{ m = estNewMueble(cat.name + (part > 1 ? ' ' + part : '')); m.ancho = ancho; m._cat = cat.id; muebles.push(m); part++; };
    const newB = (alto)=>{ if(!m || m.baldas.length >= maxB) newM(); cur = { id:estUid('b'), alto, placa:'', items:[], _used:EST_GAP, _plats:0 }; m.baldas.push(cur); };
    plats.forEach(pl=>{
      const list0 = sortGames(PRODUCTS.filter(p=>p.platformId===pl.id && !placed.has(p.id) && (huecos || p.possession==='tengo')));
      const list = [];
      list0.forEach(p=>{ const f = folderOf.get(p.id); if(!f) list.push(p); else if(!doneF.has(f.id)){ doneF.add(f.id); list.push(estFolderP(f)); } });
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
/* v11.14: la foto de un lado (lomo, canto, arriba, abajo) para su cara.
   Las fotos se guardan cuadradas, con la pieza en el centro (con o sin margen
   blanco); de ahí se saca la tira de la cara (ar = ancho / alto de la cara).
   Si la pieza se distingue del blanco y tiene más o menos la forma de la cara,
   se usa su borde (si está tumbada en la foto, se pone de pie: girada a la
   derecha, como se lee un lomo); si no (p. ej. un lomo blanco), la tira
   centrada con las proporciones de la cara.
   rot = 1: girada 90° a la izquierda (el lomo de una tumbada, en el mueble entero).
   Se hacen de dos en dos y se guardan (son pequeñas). */
const _stripCache = new Map(), _stripPending = new Map(), _stripWait = [];
let _stripBusy = 0;
function estStripSlot(){ return new Promise(res=>{ if(_stripBusy < 2){ _stripBusy++; res(); } else _stripWait.push(res); }); }
function estStripDone(){ const n = _stripWait.shift(); if(n) n(); else _stripBusy--; }
function estSideStrip(photoId, side, ar, rot){
  const key = photoKeyFor(photoId, side); if(!key || !(ar > 0)) return Promise.resolve(null);
  const ck = key + '|' + ar.toFixed(3) + '|' + (rot ? 1 : 0) + '|' + (typeof thumbGen==='function' ? thumbGen(key) : 0);
  if(_stripCache.has(ck)){ const hit = _stripCache.get(ck); _stripCache.delete(ck); _stripCache.set(ck, hit); return Promise.resolve(hit); }
  if(_stripPending.has(ck)) return _stripPending.get(ck);
  const job = (async ()=>{
    await estStripSlot();
    try{
      const src = await getPhotoURL(photoId, side, 'full'); if(!src) return null;
      const img = await new Promise(res=>{ const i = new Image(); i.onload = ()=>res(i); i.onerror = ()=>res(null); i.src = src; });
      if(!img) return null;
      const W = img.naturalWidth, H = img.naturalHeight; if(!W || !H) return null;
      // lo que debería ocupar (la cara, a lo largo de todo el lado largo de la foto)
      const tall = ar <= W / H;
      let box = tall ? { x:(W - Math.min(W, H * ar)) / 2, y:0, w:Math.min(W, H * ar), h:H } : { x:0, y:(H - Math.min(H, W / ar)) / 2, w:W, h:Math.min(H, W / ar) };
      let turn = 0;   // 1: girarla a la derecha (un lado alto que salió tumbado); -1: a la izquierda (arriba o abajo hechas en vertical)
      // y lo que de verdad ocupa la pieza (lo que no es blanco), medido en pequeño
      const k = Math.min(1, 360 / Math.max(W, H)), sw = Math.max(1, Math.round(W * k)), sh = Math.max(1, Math.round(H * k));
      const c = document.createElement('canvas'); c.width = sw; c.height = sh;
      const x = c.getContext('2d', { willReadFrequently:true }); x.drawImage(img, 0, 0, sw, sh);
      let d = null; try{ d = x.getImageData(0, 0, sw, sh).data; }catch(e){ d = null; }
      if(d){
        const white = (i)=> d[i] > 236 && d[i + 1] > 236 && d[i + 2] > 236;
        const rowInk = (yy)=>{ let n = 0; for(let xx = 0; xx < sw; xx++) if(!white((yy * sw + xx) * 4)) n++; return n; };
        const colInk = (xx)=>{ let n = 0; for(let yy = 0; yy < sh; yy++) if(!white((yy * sw + xx) * 4)) n++; return n; };
        let t0 = 0, b0 = sh - 1, l0 = 0, r0 = sw - 1;
        while(t0 < sh - 1 && rowInk(t0) < 2) t0++;
        while(b0 > t0 && rowInk(b0) < 2) b0--;
        while(l0 < sw - 1 && colInk(l0) < 2) l0++;
        while(r0 > l0 && colInk(r0) < 2) r0--;
        // (medido en pequeño: se entra un punto por cada lado para no dejar un filo blanco)
        const m = { x:(l0 + 1) / k, y:(t0 + 1) / k, w:Math.max(1, r0 - l0 - 1) / k, h:Math.max(1, b0 - t0 - 1) / k };
        // ocupa al menos media foto a lo largo y tiene la forma de la cara (de pie o tumbada)
        const big = Math.max(m.w / W, m.h / H) >= 0.5, q = (m.w / Math.max(1, m.h)) / ar, q2 = (m.h / Math.max(1, m.w)) / ar;
        if(big && q >= 0.55 && q <= 1.8) box = m;
        else if(big && q2 >= 0.55 && q2 <= 1.8 && (ar < 0.8 || ar > 1.25)){ box = m; turn = ar < 1 ? 1 : -1; }
      }
      // la tira, de pie (si estaba tumbada en la foto, girada a la derecha)
      const bw = Math.max(1, Math.round(box.w)), bh = Math.max(1, Math.round(box.h));
      const up = document.createElement('canvas');
      if(turn){ up.width = bh; up.height = bw; const g = up.getContext('2d'); if(turn > 0){ g.translate(bh, 0); g.rotate(Math.PI / 2); } else { g.translate(0, bw); g.rotate(-Math.PI / 2); } g.drawImage(img, box.x, box.y, box.w, box.h, 0, 0, bw, bh); }
      else { up.width = bw; up.height = bh; up.getContext('2d').drawImage(img, box.x, box.y, box.w, box.h, 0, 0, bw, bh); }
      // y, para una cara tumbada, girada a la izquierda
      let o = up;
      if(rot){ o = document.createElement('canvas'); o.width = up.height; o.height = up.width; const g = o.getContext('2d'); g.translate(0, up.width); g.rotate(-Math.PI / 2); g.drawImage(up, 0, 0); }
      const blob = await new Promise(res=> o.toBlob(b=>res(b), 'image/jpeg', 0.88));
      return blob ? { url: URL.createObjectURL(blob) } : null;
    } finally { estStripDone(); }
  })();
  _stripPending.set(ck, job);
  return job.then(out=>{
    _stripPending.delete(ck);
    if(out){
      _stripCache.set(ck, out);
      if(_stripCache.size > 600){ const k0 = _stripCache.keys().next().value, o0 = _stripCache.get(k0); _stripCache.delete(k0); if(o0) try{ URL.revokeObjectURL(o0.url); }catch(e){} }
    }
    return out;
  }, ()=>{ _stripPending.delete(ck); return null; });
}
/* La foto de un lado para una cara (si la tiene): atributos para hidratar.
   ar = ancho / alto de la cara, rot = 1 si la cara va girada (tumbada, en plano) */
function estSidePh(p, side, ar, rot){
  if(!p || p.isFolder || p.possession!=='tengo') return '';
  const ph = shownPhotoId(p);
  return hasPhoto(ph, side) && ar > 0 ? ` data-ph="${escapeHTML(ph)}|${side}|full" data-ph-strip="${ar.toFixed(4)}|${rot ? 1 : 0}"` : '';
}
/* Pone las fotos recortadas en las caras que las piden (data-ph="id|lado|tamaño").
   Los lomos (data-ph-avg) llevan el color de su portada, no un trozo de ella.
   v11.14: las de los lados (data-ph-strip), su tira. */
function estHydratePhotos(root){
  root.querySelectorAll('[data-ph]:not([data-ph-done])').forEach(el=>{
    el.dataset.phDone = '1';
    const [pid, side, size] = el.dataset.ph.split('|');
    if(el.hasAttribute('data-ph-strip')){
      const [ar, rot] = el.getAttribute('data-ph-strip').split('|');
      estSideStrip(pid, side, Number(ar), rot==='1').then(r=>{
        if(!r){ el.classList.add('ph-failed'); return; }   // no se ha podido abrir: se queda como sin foto (con su nombre)
        if(!document.contains(el)) return;
        el.style.backgroundImage = `url("${r.url}")`; el.classList.add('has-sideph');
      });
      return;
    }
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
const EST = { view:'mueble', mid:null, bsid:null, night:false, doors:false, covers:false, sel:null, s:4, delAsk:false,
  mode:'ver',        // v11.13: 'ver' (pantalla completa, sin editar) o 'editar'
  multi:null,        // v11.13: varias elegidas a la vez (Set de pids) o null
  focusPid:null,     // v11.13: la pieza que hay que enseñar al entrar en su balda
  railPin:null };    //   y la que gana en el nombre de abajo si está igual de centrada
/* ¿Pantalla completa (ver, sin editar)? */
function estImm(){ const st = estStageEl(); return !!(st && st.classList.contains('is-imm')); }
function estIsMsel(pid){ return !!(EST.multi && EST.multi.has(pid)); }
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
function estSpineLabel(p, W, L, horizontal, off){
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
  return `<span class="est-sl${horizontal ? ' is-h' : ''}" style="--L:${L.toFixed(1)}px;--T:${W.toFixed(1)}px;${off ? `--off:${off.toFixed(1)}px;` : ''}font-size:${best.f.toFixed(1)}px"><span class="est-sl-name" style="-webkit-line-clamp:${best.n}">${escapeHTML(name)}</span>${best.code ? `<b class="est-sl-code">${escapeHTML(pv.code)}</b>` : ''}</span>`;
}
/* Foto (sin margen blanco) para una cara: se pone al hidratar */
function estPh(p, side, avg){
  if(p.isFolder || p.possession!=='tengo') return '';
  const ph = shownPhotoId(p);
  return hasPhoto(ph, side) ? ` data-ph="${escapeHTML(ph)}|${side}|thumb"${avg ? ' data-ph-avg' : ''}` : '';
}
/* El color de un lomo: el que hayas elegido (pieza o plataforma) o, si no, el
   medio de su foto (al hidratar). Devuelve atributos, estilo, clases y banda. */
function estSpineFill(p, o){
  if(p.possession!=='tengo') return { attrs:'', style:'', cls:'', band:'' };
  // v11.14: con foto del lomo, la foto (sin nombre ni banda encima)
  if(o && o.ar > 0){ const a = estSidePh(p, 'lomo', o.ar, o.rot); if(a) return { attrs:a, style:'', cls:' is-sidephoto', band:'', photo:true }; }
  const L = estLomo(p);
  if(L.color) return { attrs:'', style:`background-color:${L.color};`, cls:` has-avg is-custom${estLum(L.color) > 0.62 ? ' is-light' : ''}`, band:L.banda };
  return { attrs: estPh(p, 'front', true), style:'', cls:'', band:L.banda };
}
/* La banda de arriba del lomo (alto en px; en una tumbada, a la izquierda) */
function estBandPx(len, s){ return Math.max(2, Math.min(1.8 * s, len * 0.22)); }
function estBandHTML(color, px, horizontal){ return color ? `<span class="est-band${horizontal ? ' is-h' : ''}" style="--band:${color};--bh:${px.toFixed(1)}px" aria-hidden="true"></span>` : ''; }
/* El lomo de una carpeta: el nombre en la parte de arriba (abajo va el
   agujero para sacarla, como en un archivador) */
function estFolderSpineLabel(p, W, L, horizontal){ return estSpineLabel(p, W, L * 0.8, horizontal, -L * 0.08); }
/* La portada de una carpeta: su color, su nombre y cuántas piezas lleva */
function estFolderCoverHTML(f){
  const n = estFolderPieces(f).length;
  return `<span class="est-folder-txt"><b>${escapeHTML(f.nombre || t('est.folder_default'))}</b><small>${escapeHTML(t('est.folder_n').replace('{n}', n))}</small></span>`;
}
/* Una pieza plana (vista del mueble entero): lo que se ve de frente */
function estFlatHTML(r, s, selPid){
  const p = r.p, b = r.b, pv = platVisual(p.platformId);
  const miss = p.possession!=='tengo';
  const w = b.fw * s, h = b.hgt * s;
  const left = (r.x - b.fw / 2) * s, bottom = r.y * s;
  const face = b.pose==='portada' ? 'cover' : b.pose==='diagonal' ? 'cover is-diag' : b.pose==='tumbado' ? 'spine is-h' : 'spine';
  const spine = face.startsWith('spine'), horiz = b.pose==='tumbado';
  let attrs = '', style = '', cls = '', inner = '';
  if(spine){
    const len = horiz ? w : h, th = horiz ? h : w;
    const f = estSpineFill(p, { ar: th / Math.max(1, len), rot: horiz ? 1 : 0 });
    attrs = f.attrs; style = f.style; cls = f.cls;
    const bh = f.band ? estBandPx(len, s) : 0;
    inner = miss ? '<span class="est-ghost-q">?</span>' : p.isFolder ? estFolderSpineLabel(p, th, len, horiz) : estBandHTML(f.band, bh, horiz) + estSpineLabel(p, th, len - bh, horiz, bh / 2);   // (con foto, el nombre no se ve: solo si la foto no se puede abrir)
  } else if(p.isFolder){
    style = `background-color:${p.folder.color};`; cls = estLum(p.folder.color) > 0.62 ? ' is-light' : '';
    inner = estFolderCoverHTML(p.folder);
  } else {
    attrs = estPh(p, 'front', false);
    inner = miss ? '<span class="est-ghost-q">?</span>' : '';
  }
  return `<span class="est-sp is-${face}${p.isFolder ? ' is-folder' : ''}${r.row ? ' is-back' : ''}${miss ? ' is-ghost' : ''}${p.id===selPid ? ' is-sel' : ''}${estIsMsel(p.id) ? ' is-msel' : ''}${cls}" data-pid="${escapeHTML(p.id)}"${attrs} style="--plat:${pv.color};${style}left:${left.toFixed(1)}px;bottom:${bottom.toFixed(1)}px;width:${w.toFixed(1)}px;height:${h.toFixed(1)}px">${inner}</span>`;
}
/* Una pieza como caja (de cerca): 5 caras, con sus fotos; las de detrás no se pintan */
/* Orden de pintado: primero las más alejadas de tus ojos (a los lados), así
   cada una tapa el lado de la de al lado, como en una estantería de verdad */
/* (las de la fila de detrás, siempre antes que las de delante) */
function estZ(x, eyeX, back){ return Math.max(1, 3000 - Math.round(Math.abs(x - eyeX)) - (back ? 1500 : 0)); }
function estBoxHTML(r, X, Y, Z, s, sel, eyeX){
  const p = r.p, b = r.b, d0 = b.dims, pv = platVisual(p.platformId);
  const fill = estSpineFill(p, { ar: d0.d / Math.max(0.1, d0.h) });
  const bh = fill.band ? estBandPx(d0.h * s, s) : 0;
  const folder = p.isFolder ? p.folder : null;
  const miss = p.possession!=='tengo';
  const w = d0.w * s, h = d0.h * s, d = d0.d * s;
  // la postura va en cada cara (no en el contenedor): así el navegador sabe
  // siempre qué pieza tocas, también la que tienes justo delante
  const pose = b.pose==='tumbado' ? `rotateY(${r.it.rot || 0}deg) rotateZ(-90deg) rotateY(90deg)` : `rotateY(${b.ang}deg)`;
  const lift = sel ? ` translateZ(${(2 * s).toFixed(1)}px)` : '';
  const at = `translate3d(${X.toFixed(1)}px,${Y.toFixed(1)}px,${Z.toFixed(1)}px)${lift}`;
  const q = miss ? '<span class="est-ghost-q">?</span>' : '';
  const msel = estIsMsel(p.id);
  const cls = `est-pz is-${b.pose}${r.it.rot ? ' is-rot' : ''}${miss ? ' is-ghost' : ''}${sel ? ' is-sel' : ''}${msel ? ' is-msel' : ''}${b.pose==='tumbado' ? ' is-flat' : ''}${folder ? ' is-folder' : ''}${r.row ? ' is-back' : ''}`;
  // la elegida: una marca encima, para verla de un vistazo
  const mark = sel || msel ? `<span class="est-mark${msel ? ' is-check' : ''}" style="transform:translate(-50%,-100%) translate3d(0,${(-(b.hgt * s) / 2 - 8).toFixed(1)}px,${((b.fd * s) / 2).toFixed(1)}px)" aria-hidden="true"></span>` : '';
  // una carpeta: su color en todas las caras; de frente, su nombre
  const fst = folder ? `background-color:${folder.color};` : '';
  const fcl = folder && estLum(folder.color) > 0.62 ? ' is-light' : '';
  const front = folder ? estFolderCoverHTML(folder) : miss ? q : `<span class="est-cover-txt"><b>${escapeHTML(pv.code)}</b>${escapeHTML(p.name)}</span>`;
  return `<div class="${cls}" data-pid="${escapeHTML(p.id)}" data-x="${X.toFixed(0)}" data-row="${r.row ? 1 : 0}" title="${escapeHTML(p.name)}" style="--plat:${pv.color};z-index:${sel ? 3100 : estZ(X, eyeX, r.row)};transform:${at}">`
    + estFace(w, h, `${pose} translateZ(${(d / 2).toFixed(1)}px)`, 'est-pc is-front' + fcl, fst, front, estPh(p, 'front'))
    + estFace(w, h, `${pose} rotateY(180deg) translateZ(${(d / 2).toFixed(1)}px)`, 'est-pc is-back', fst, '', estPh(p, 'back'))
    + estFace(d, h, `${pose} rotateY(-90deg) translateZ(${(w / 2).toFixed(1)}px)`, 'est-pc is-spine' + fill.cls, fill.style, miss ? q : estBandHTML(fill.band, bh, false) + (folder ? estFolderSpineLabel(p, d, h) : estSpineLabel(p, d, h - bh, false, bh / 2) || q), fill.attrs)
    + estFace(d, h, `${pose} rotateY(90deg) translateZ(${(w / 2).toFixed(1)}px)`, 'est-pc is-edge', fst, '', estSidePh(p, 'canto', d0.d / Math.max(0.1, d0.h)))
    + estFace(w, d, `${pose} rotateX(90deg) translateZ(${(h / 2).toFixed(1)}px)`, 'est-pc is-top', fst, '', estSidePh(p, 'arriba', d0.w / Math.max(0.1, d0.d)))
    // v11.14: la base solo si tiene foto (sin ella no se ve: está apoyada)
    + (folder || miss || !hasPhoto(shownPhotoId(p), 'abajo') ? '' : estFace(w, d, `${pose} rotateX(-90deg) translateZ(${(h / 2).toFixed(1)}px)`, 'est-pc is-top is-bottom', '', '', estSidePh(p, 'abajo', d0.w / Math.max(0.1, d0.d))))
    + mark + `</div>`;
}
/* Una balda (o «encima»): la caja con su luz y las piezas.
   o = { lite, eyeX, eyeY (px, respecto a la balda), P (perspectiva), selPid, open } */
function estBayHTML(m, sid, sf, w, h, s, o){
  const D = m.fondo * s;
  const H = estSurfaceH(m, sid);
  const L = estLayout(sf.items, m.ancho, H, m.fondo);
  const b = sid==='top' ? null : estSurface(m, sid);
  // la elegida está detrás: las de delante se ven medio transparentes
  const backSel = !!(o.selPid && L.recs.some(r=> r.p.id===o.selPid && r.row));
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
  // piezas (las de la fila de detrás, primero)
  const zFront = -EST_FRONT * s;
  const recs = L.recs.filter(r=>r.row).concat(L.recs.filter(r=>!r.row));
  if(o.lite){
    inner += `<div class="est-run" style="width:${w.toFixed(1)}px;height:${h.toFixed(1)}px;transform:translateZ(${zFront.toFixed(1)}px)">${recs.map(r=>estFlatHTML(r, s, o.selPid)).join('')}</div>`;
  } else {
    recs.forEach(r=>{
      const X = r.x * s, Y = h - (r.y + r.b.hgt / 2) * s, Z = -r.zc * s;
      inner += estBoxHTML(r, X, Y, Z, s, r.p.id===o.selPid, o.eyeX);
    });
  }
  const glow = light ? `--glow:${light};` : '';
  return `<div class="est-bay${o.open ? ' is-open' : ''}${light ? ' has-light' : ''}${backSel ? ' is-back-sel' : ''}" data-sid="${sid}" style="${glow}width:${w.toFixed(1)}px;height:${h.toFixed(1)}px;perspective:${o.P.toFixed(0)}px;perspective-origin:${o.eyeX.toFixed(1)}px ${o.eyeY.toFixed(1)}px">
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
  const L = estLayout(m.encima.items, m.ancho, EST_TOP_H, m.fondo);
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
  const IMM = estImm(), H0 = IMM ? st.clientHeight : 0;
  const TOPI = 84, BOTI = 28;   // pantalla completa: arriba, la barra con los botones
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
    if(IMM){
      // pantalla completa: los muebles grandes (casi uno por pantalla en el móvil) y la sala se desliza
      const room = H0 - TOPI - BOTI;
      s = Math.min((room - floor - 28) / tallest, Math.max(s, (W * 0.8) / Math.max(...widths)));
      stH = H0;
    }
    else {
      if(stH > maxH){ s = (maxH - floor - 28) / tallest; stH = maxH; }
      stH = Math.max(stH, 260);
      if(st) st.style.height = stH + 'px';
    }
    EST.s = s;
    const stripW = IMM ? Math.max(W, totW * s + W * 0.16) : W;
    let x = (stripW - totW * s) / 2;
    const base = IMM ? Math.round(TOPI + (H0 - TOPI - BOTI - (tallest * s + floor)) / 2 + tallest * s + 14) : stH - floor;
    let html = `<div class="est-floor" style="top:${base}px"></div>`;
    E.muebles.forEach((m, i)=>{
      const c = estCabinetHTML(m, s, { lite:true });
      html += `<div class="est-place is-tap" data-mid="${escapeHTML(m.id)}" style="left:${x.toFixed(1)}px;top:${(base - c.H).toFixed(1)}px;width:${c.W.toFixed(1)}px;height:${c.H.toFixed(1)}px" title="${escapeHTML(m.nombre)}">${c.html}<span class="est-shadow"></span><span class="est-place-name">${escapeHTML(m.nombre)}</span></div>`;
      x += (widths[i] + gap) * s;
    });
    if(stripW > W + 1) return `<div class="est-scroll is-sala"><div class="est-strip" style="width:${stripW.toFixed(1)}px;height:${stH}px">${html}</div></div>`;
    return html;
  }
  const m = estMueble(estMid()); if(!m) return '';
  if(EST.view==='balda') return estBaldaSceneHTML(m);
  // el mueble entero: ocupa el ancho; si es muy alto, cabe de alto
  const cmW = m.ancho + 2 * EST_T + 8;
  const cmH = estMuebleHeight(m) + Math.min(EST_TOP_H, estTopUsed(m));
  const floor = 30, pad = IMM ? TOPI : 54;   // arriba, sitio para los botones
  let s = W / cmW;
  let stH = Math.round(cmH * s + floor + pad);
  if(IMM){ const room = H0 - pad - BOTI; if(cmH * s + floor > room) s = (room - floor) / cmH; stH = H0; }
  else {
    if(stH > maxH){ s = (maxH - floor - pad) / cmH; stH = maxH; }
    if(st) st.style.height = stH + 'px';
  }
  EST.s = s;
  const c = estCabinetHTML(m, s, { selPid: EST.sel && EST.sel.mid===m.id ? EST.sel.pid : null });
  const base = IMM ? Math.round(pad + (H0 - pad - BOTI - (cmH * s + floor)) / 2 + cmH * s) : stH - floor;
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
  const IMM = estImm();
  // en pantalla completa la balda se ve más grande (y de alto, toda la pantalla)
  const top = IMM ? 84 : 56, bottom = IMM ? EST_BAR_H + 18 : EST_BAR_H;
  const stH = IMM ? st.clientHeight : Math.round(Math.max(340, Math.min(innerHeight * (innerWidth < 880 ? 0.56 : 0.64), 580)));
  if(st && !IMM) st.style.height = stH + 'px';
  const Hcm = sid==='top' ? Math.max(20, estTopUsed(m) + 4) : sf.alto;
  const avail = stH - top - bottom;
  const s = Math.min(avail / (Hcm + 3.2 * EST_T), W / (IMM ? 14 : 22));
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
function estCoversItems(sf){ return sf.items.map(it=>estP(it.pid)).filter(Boolean); }
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
    const sel = (EST.sel && EST.sel.pid===p.id) || estIsMsel(p.id);
    if(p.isFolder) return `<span class="est-cv is-folder${estLum(p.folder.color) > 0.62 ? ' is-light' : ''}${sel ? ' is-sel' : ''}" data-pid="${escapeHTML(p.id)}" title="${escapeHTML(p.name)}" style="--plat:${p.folder.color};background-color:${p.folder.color};width:${cw.toFixed(1)}px;height:${ch.toFixed(1)}px">${estFolderCoverHTML(p.folder)}</span>`;
    return `<span class="est-cv${miss ? ' is-ghost' : ''}${sel ? ' is-sel' : ''}" data-pid="${escapeHTML(p.id)}"${estPh(p, 'front')} title="${escapeHTML(p.name)}" style="--plat:${pv.color};width:${cw.toFixed(1)}px;height:${ch.toFixed(1)}px">${miss ? '<span class="est-ghost-q">?</span>' : `<span class="est-cover-txt"><b>${escapeHTML(pv.code)}</b>${escapeHTML(p.name)}</span>`}<span class="est-cv-name">${escapeHTML(p.name)}</span></span>`;
  }).join('')}</div>`;
}
/* Pintar el nivel actual */
function estDraw(){
  const st = estStageEl(); if(!st) return;
  const sc = document.getElementById('estScene'); if(!sc) return;
  const E = estData();
  const keep = (EST.view==='balda' || EST.view==='sala') && sc.querySelector('.est-scroll') ? sc.querySelector('.est-scroll').scrollLeft : null;
  st.dataset.view = EST.view;
  st.classList.toggle('is-night', EST.night);
  st.dataset.wall = E.pared;
  sc.innerHTML = estSceneHTML();
  const scr = sc.querySelector('.est-scroll');
  if(scr){
    if(keep!==null) scr.scrollLeft = keep;
    estBindScroll(scr);
  }
  // el escenario es solo para la vista (aria-hidden): sus zonas de desplazamiento no reciben el foco
  sc.querySelectorAll('.est-scroll').forEach(x=>{ x.tabIndex = -1; });
  estHydratePhotos(sc);
  // si se repinta mientras miras una pieza sacada, su sitio sigue vacío (y «Salir» vuelve ahí)
  if(estPullState && !estPullState.closing){
    const el = sc.querySelector(`[data-pid="${CSS.escape(estPullState.pid)}"]`);
    estPullState.src = el ? (el.closest('.est-pz, .est-cv, .est-sp') || el) : null;
    if(estPullState.src) estPullState.src.classList.add('is-out');
  }
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
      bay.querySelectorAll('.est-pz:not(.is-sel)').forEach(el=>{ el.style.zIndex = estZ(Number(el.dataset.x) || 0, x, el.dataset.row==='1'); });
    });
    clearTimeout(scr._railT); scr._railT = setTimeout(estUpdateRail, 60);
  }, { passive:true });
}
/* La pieza que se quería ver (desde su ficha o al tocarla en el mueble),
   centrada en la balda y con un destello */
function estShowFocus(){
  const pid = EST.focusPid; EST.focusPid = null; if(!pid) return;
  const scr = document.querySelector('#estScene .est-scroll'); if(!scr) return;
  const el = scr.querySelector(`[data-pid="${CSS.escape(pid)}"]`); if(!el) return;
  EST.railPin = pid;
  scr.scrollTo({ left: estScrollTargetFor(el, scr), behavior:'auto' });
  if(!reducedMotion()){ el.classList.add('is-found'); setTimeout(()=> el.classList.remove('is-found'), 1600); }
  setTimeout(estUpdateRail, 80);
}
/* Cuánto desplazar la balda para que una pieza quede en el centro.
   (Las piezas son un punto en 3D y su perspectiva sigue al desplazamiento:
   se usa su sitio en la balda, no lo que se ve en ese momento) */
function estScrollTargetFor(el, scr){
  if(el.dataset.x != null && el.dataset.x !== ''){
    const pad = Number(scr.dataset.pad) || 0, T = Number(scr.dataset.t) || 0;
    return Math.max(0, Math.min(scr.scrollWidth - scr.clientWidth, (Number(el.dataset.x) || 0) + pad + T - scr.clientWidth / 2));
  }
  const r = el.getBoundingClientRect(), sr = scr.getBoundingClientRect();
  return Math.max(0, scr.scrollLeft + (r.left + r.width / 2) - (sr.left + sr.width / 2));
}
/* La pieza elegida, centrada en la balda (al entrar o al cambiarla de sitio) */
function estScrollToSel(smooth){
  const scr = document.querySelector('#estScene .est-scroll'); if(!scr || !EST.sel) return;
  const el = scr.querySelector(`[data-pid="${CSS.escape(EST.sel.pid)}"]`); if(!el) return;
  scr.scrollTo({ left: estScrollTargetFor(el, scr), behavior: smooth && !reducedMotion() ? 'smooth' : 'auto' });
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
  const ver = EST.mode==='ver';
  // editando con «Elegir varias»: tocar una pieza la elige (o la suelta)
  if(!ver && EST.multi && pid && estFind(pid)){ estMultiToggle(pid); return; }
  if(EST.view==='mueble'){
    // en el mueble entero: tocar una pieza o una balda es entrar en ella
    if(pid){ const f = estFind(pid); if(f){ estEnterBalda(f.sid, pid); if(estIsFolderPid(pid)) estOpenBook(pid.slice(EST_FOLDER.length), null, ver); return; } }
    const bay = el && el.closest('[data-sid]');
    if(bay) estEnterBalda(bay.dataset.sid, null);
    return;
  }
  // pantalla completa: tocar una pieza la saca de la balda (una carpeta se abre)
  if(ver){
    if(pid && estFind(pid)){ if(estIsFolderPid(pid)) estOpenBook(pid.slice(EST_FOLDER.length), null, true); else estPullOut(pid, el); }
    return;
  }
  // dentro de una balda: elegir (o soltar) una pieza; una carpeta se abre
  // (y queda elegida, para moverla al cerrarla)
  if(pid){
    const f = estFind(pid);
    if(f && estIsFolderPid(pid)){ if(!EST.sel || EST.sel.pid!==pid) estSelect({ mid:f.m.id, sid:f.sid, idx:f.i, pid }); estOpenBook(pid.slice(EST_FOLDER.length)); return; }
    if(f) estSelect(EST.sel && EST.sel.pid===pid ? null : { mid:f.m.id, sid:f.sid, idx:f.i, pid });
  } else if(EST.sel) estSelect(null);
}
/* ---------- Niveles ---------- */
function estEnterBalda(sid, pid){
  const m = estMueble(estMid()); if(!m) return;
  EST.view = 'balda'; EST.bsid = sid; EST.covers = false;
  const f = pid ? estFind(pid) : null;
  // en pantalla completa no se elige: se enseña (centrada)
  if(EST.mode==='ver'){ EST.sel = null; EST.focusPid = f ? pid : null; }
  else if(!EST.multi) EST.sel = f ? { mid:f.m.id, sid:f.sid, idx:f.i, pid } : null;
  estDraw(); estRefreshPanel();
  estEnterAnim();
  requestAnimationFrame(()=>{ if(EST.sel) estScrollToSel(false); else estShowFocus(); const st = estStageEl(); if(st && !estImm() && st.getBoundingClientRect().top < 0) st.scrollIntoView({ block:'start' }); });
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
  if(EST.mode==='editar' && EST.multi){ estMultiOn(false); return true; }   // primero se dejan de elegir varias
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
  // (a igual distancia, la de delante)
  let pinD = null;
  scr.querySelectorAll('.est-pz[data-x]').forEach(el=>{ const dd = Math.abs((Number(el.dataset.x) || 0) - x) + (el.dataset.row==='1' ? 6 : 0); if(EST.railPin && el.dataset.pid===EST.railPin) pinD = dd; if(dd < bd){ bd = dd; best = el.dataset.pid; } });
  // la que se buscó (desde su ficha) gana si está igual de centrada (p. ej. en una pila)
  if(pinD != null && pinD <= bd + 0.5) best = EST.railPin;
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
  const pid = estCenterPid(), p = pid && estP(pid);
  rail.dataset.pid = p ? p.id : '';
  rail.hidden = !p;
  if(!p) return;
  const pv = platVisual(p.platformId);
  const code = p.isFolder ? `<span class="est-rail-code is-folder" style="--plat:${p.folder.color}">${icon('folder')}</span>` : `<span class="est-rail-code" style="--plat:${pv.color}">${escapeHTML(pv.code || '')}</span>`;
  const extra = p.isFolder ? `<span class="est-rail-miss is-n">${escapeHTML(t('est.folder_n').replace('{n}', estFolderPieces(p.folder).length))}</span>` : p.possession!=='tengo' ? `<span class="est-rail-miss">${escapeHTML(t('cover.missing'))}</span>` : '';
  rail.innerHTML = `${code}<span class="est-rail-name">${escapeHTML(p.name)}</span>${extra}`;
  rail.setAttribute('aria-label', t(EST.mode==='ver' ? (p.isFolder ? 'est.rail_open' : 'est.rail_pull') : 'est.rail_pick').replace('{name}', p.name));
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
/* La pieza elegida y su columna, con todo fijado en su sitio (para editar
   sin que se muevan las demás) */
function estSelCol(){
  if(!estSelItem()) return null;
  estFreeze(estMueble(EST.sel.mid), EST.sel.sid);
  const x = estSelItem(); if(!x) return null;
  const L = estLayout(x.sf.items, x.m.ancho, estSurfaceH(x.m, EST.sel.sid), x.m.fondo);
  const c = L.cols.find(cc=> cc.items.some(r=> r.it===x.it)); if(!c) return null;
  return Object.assign(x, { L, c });
}
function estSetPose(pose){
  const x = estSelCol(); if(!x || !EST_POSES.includes(pose)) return;
  if(pose==='lomo') delete x.it.pose; else x.it.pose = pose;
  delete x.it.rot;
  estAfterEdit();
}
function estRotate(d){
  const x = estSelCol(); if(!x) return;
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
/* Las columnas de la misma fila que c, de izquierda a derecha */
function estRowCols(L, c){ return L.cols.filter(q=> q.row===c.row).sort((a, b)=> a.x - b.x); }
/* Mover la pieza elegida (con su pila) un sitio a la izquierda o a la derecha:
   se cambia de sitio con la de al lado (cada una ocupa el sitio de la otra) */
function estMove(dir){
  const x = estSelCol(); if(!x) return;
  const row = estRowCols(x.L, x.c);
  const i = row.indexOf(x.c), j = i + dir;
  if(j < 0 || j >= row.length){ estAfterEdit(); return; }
  const A = dir > 0 ? x.c : row[j], B = dir > 0 ? row[j] : x.c;   // A, la de la izquierda
  const gap = B.x - (A.x + A.fw), ax = A.x;
  const bx = ax, axn = ax + B.fw + gap;
  // (si así pisaría a una de la otra fila, no se mueve)
  if(!estFitsAt(x.L, B, bx, x.m.fondo, [A, B]) || !estFitsAt(x.L, A, axn, x.m.fondo, [A, B])){ showToast(t(dir > 0 ? 'est.no_room_right' : 'est.no_room_left'), { replace:true }); estAfterEdit(); return; }
  B.base.x = estR1(bx);
  A.base.x = estR1(axn);
  estSortRow(x.sf);
  estAfterEdit();
}
/* Desplazar (cm) la pieza elegida, hasta donde haya sitio: no empuja a las
   de al lado (choca con ellas); las demás no se mueven */
function estNudge(cm){
  const x = estSelCol(); if(!x || !cm) return;
  const obs = estObstacles(x.L, x.c, x.c.row, x.m.fondo);
  // el hueco en el que está: de la de su izquierda a la de su derecha (o el final)
  let lo = 0, hi = Math.max(x.m.ancho, x.c.x + x.c.fw);
  obs.forEach(([a, b])=>{ if(b <= x.c.x + 0.01) lo = Math.max(lo, b + EST_GAP); else if(a >= x.c.x + x.c.fw - 0.01) hi = Math.min(hi, a - EST_GAP); });
  lo = Math.min(lo, x.c.x); hi = Math.max(hi, x.c.x + x.c.fw);
  const want = Math.min(Math.max(x.c.x + cm, lo), Math.max(lo, hi - x.c.fw));
  if(Math.abs(want - x.c.x) < 0.05){ showToast(t(cm > 0 ? 'est.no_room_right' : 'est.no_room_left'), { replace:true }); estAfterEdit(); return; }
  x.c.base.x = estR1(want);
  estSortRow(x.sf);
  estAfterEdit();
}
/* Al soltar una pieza arrastrada dcm centímetros:
   · si cae en un hueco donde cabe, se queda ahí (las demás no se mueven);
   · si pasa por encima de sus vecinas, se mete entre ellas: solo se corren
     las que estaban entre su sitio viejo y el nuevo;
   · si solo las roza, va al hueco más cercano (o se queda donde estaba). */
function estDragEnd(dcm){
  const x = estSelCol(); if(!x) return;
  const c = x.c, W = x.m.ancho;
  const want = Math.max(0, c.x + dcm);
  const others = estRowCols(x.L, c).filter(q=> q!==c);
  const passed = dcm > 0 ? others.filter(q=> q.x > c.x && c.x + c.fw + dcm > q.x + q.fw / 2)
                         : others.filter(q=> q.x < c.x && want < q.x + q.fw / 2);
  const obs = estObstacles(x.L, c, c.row, x.m.fondo);
  const exact = estFreeSpot(obs, c.fw, want, W, 0.05);
  if(exact!==null) c.base.x = exact;
  else {
    let done = false;
    if(passed.length){
      // se mete entre ellas: solo se corren las que ha pasado (si nadie pisa a nadie de la otra fila)
      const sh = c.fw + EST_GAP, moves = new Map();
      if(dcm > 0){ const last = passed[passed.length - 1], end = last.x + last.fw; passed.forEach(q=> moves.set(q, q.x - sh)); moves.set(c, end - c.fw); }
      else { const start = passed[0].x; passed.forEach(q=> moves.set(q, q.x + sh)); moves.set(c, start); }
      const movers = [...moves.keys()];
      if(movers.every(q=> estFitsAt(x.L, q, moves.get(q), x.m.fondo, movers))){ moves.forEach((nx, q)=>{ q.base.x = estR1(nx); }); done = true; }
    }
    if(!done){
      const near = estFreeSpot(obs, c.fw, want, W, 3);
      if(near!==null) c.base.x = near;
      // no ha podido ir a ningún sitio: se queda donde estaba (y se dice por qué)
      else showToast(t(dcm > 0 ? 'est.no_room_right' : 'est.no_room_left'), { replace:true });
    }
  }
  estSortRow(x.sf);
  estAfterEdit();
}
/* Delante (0) o detrás (1): va a su misma altura de la balda o, si ahí no
   cabe, al sitio libre más cercano de esa fila */
function estSetFila(row){
  const x = estSelCol(); if(!x) return;
  if(x.c.row===row){ estAfterEdit(); return; }
  const spot = estFreeSpot(estObstacles(x.L, x.c, row, x.m.fondo), x.c.fw, x.c.x, x.m.ancho);
  if(spot===null){ showToast(t(row ? 'est.no_room_back' : 'est.no_room_front'), { replace:true }); estAfterEdit(); return; }
  x.c.base.x = spot;
  if(row) x.c.base.fila = 'detras'; else delete x.c.base.fila;
  estSortRow(x.sf);
  estAfterEdit();
}
function estToggleStack(){
  const x = estSelCol(); if(!x) return;
  if(x.it.apilado){
    // se baja de la pila: a su lado (en su misma fila), en el hueco más cercano (si no hay, empuja)
    delete x.it.apilado;
    if(x.c.row) x.it.fila = 'detras'; else delete x.it.fila;
    const L = estLayout(x.sf.items, x.m.ancho, estSurfaceH(x.m, EST.sel.sid), x.m.fondo);
    const c = L.cols.find(cc=> cc.base===x.it);
    if(c){ const spot = estFreeSpot(estObstacles(L, c, c.row, x.m.fondo), c.fw, c.want, x.m.ancho, 3); if(spot!==null) x.it.x = spot; }
  } else {
    // encima de la de su izquierda (de su misma fila; la fila está ordenada,
    // así que es la columna de justo antes)
    const row = estRowCols(x.L, x.c), prev = row[row.indexOf(x.c) - 1];
    if(x.c.base!==x.it || !prev){ showToast(t('est.stack_first')); return; }
    x.it.apilado = true; delete x.it.x; delete x.it.fila; delete x.it.dx;
  }
  estAfterEdit();
}
function estRemoveSel(){
  const x = estSelCol(); if(!x) return;
  const i = x.sf.items.indexOf(x.it);
  const freed = estSpliceItem(x.sf, i);
  const was = EST.sel;
  EST.sel = null;
  // se puede deshacer: vuelve al mismo sitio, con su postura
  showToast(t('est.removed'), { replace:true, action:{ label:t('common.undo'), fn: ()=>{
    if(estLocate(x.it.pid)) return;
    const sf = estSurface(estMueble(was.mid), was.sid); if(!sf) return;
    const at = Math.min(i, sf.items.length);
    sf.items.splice(at, 0, x.it);
    if(freed && sf.items[at + 1]===freed){ freed.apilado = true; delete freed.x; delete freed.fila; }
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
  EST.delAsk = false; EST.multi = null; EST.focusPid = null;
  // v11.13: se entra a pantalla completa (para mirarla); «Editar» lleva a la de siempre
  EST.mode = opts && opts.edit ? 'editar' : 'ver';
  if(opts && opts.pid){
    // «Verla en la estantería»: directamente dentro de su balda (editando, elegida; si no, centrada)
    let f = estFind(opts.pid), book = null;
    if(!f){ const loc = estLocate(opts.pid); if(loc && loc.m){ f = loc; book = { cid:loc.folder.id, pid:opts.pid }; } }
    if(f){
      const target = book ? EST_FOLDER + book.cid : opts.pid;
      EST.mid = f.m.id; EST.view = 'balda'; EST.bsid = f.sid; EST.covers = false;
      if(EST.mode==='editar'){ EST.sel = { mid:f.m.id, sid:f.sid, idx:f.i, pid:target }; } else { EST.sel = null; EST.focusPid = target; }
      EST.bookAfter = book;
    }
  } else {
    EST.sel = null; EST.covers = false; EST.fromSala = false;
    if(EST.mode==='ver') EST.view = estData().muebles.length > 1 ? 'sala' : 'mueble';
    else if(EST.view==='balda') EST.view = 'mueble';
  }
  render();
}
/* Pasar de mirar (pantalla completa) a editar, y al revés (se queda en el mismo sitio) */
function estSetMode(mode){
  EST.mode = mode==='editar' ? 'editar' : 'ver';
  EST.multi = null; EST.delAsk = false;
  if(EST.mode==='ver') EST.sel = null;
  pendingScrollY = 0;
  render();
}
/* «Atrás» de la pantalla completa: sube un nivel o, arriba del todo, sale */
function estImmBack(){ if(!estBackLevel()) navBack(); }
function estCountPlaced(){ const s = estPlacedSet(); return PRODUCTS.filter(p=>s.has(p.id)).length; }
function renderEstanteria(){
  EST.night = uiPref('estNight', '')==='1';
  const E = estData();
  // v11.13: para mirarla, a pantalla completa (sin editar nada); «Editar», la de siempre
  if(estHas() && EST.mode==='ver'){
    if(EST.view==='sala' && E.muebles.length < 2) EST.view = 'mueble';
    estMid();
    return `<div class="est-imm" id="estImm" role="region" aria-label="${escapeHTML(t('est.title'))}">
      <div class="est-stage is-imm" id="estStage" data-wall="${E.pared}" data-view="${EST.view}"><div class="est-scene" id="estScene" aria-hidden="true"></div>
        <div class="est-ctl is-imm" id="estCtl"></div><div class="est-bar is-imm" id="estBar"></div></div></div>`;
  }
  let html = (estHas() ? `<div class="est-modebar" role="group" aria-label="${escapeHTML(t('est.editing'))}"><span class="est-modebar-t">${icon('pencil')} ${t('est.editing')}</span>
      <button type="button" class="btn btn-sm primary" data-fk="mode-done" onclick="estSetMode('ver')">${icon('check')} ${t('est.done_edit')}</button></div>` : '') + screenHeadHTML({ kicker:t('est.kicker'), title:t('est.title'), sub: estHas() ? t('est.sub').replace('{m}', E.muebles.length).replace('{n}', estCountPlaced()).replace('{t}', PRODUCTS.length) : '' });
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
  const night = `<button type="button" class="round-btn est-btn ${EST.night ? 'is-on' : ''}" data-fk="night" onclick="estToggleNight()" aria-pressed="${EST.night}" aria-label="${escapeHTML(t('est.night'))}" title="${escapeHTML(t('est.night'))}">${icon(EST.night ? 'sun' : 'moon')}</button>`;
  if(EST.mode==='ver') return estImmCtlHTML(m, night);
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
        <button type="button" class="round-btn est-btn ${EST.multi ? 'is-on' : ''}" data-fk="multi" onclick="estMultiOn(!EST.multi)" aria-pressed="${!!EST.multi}" aria-label="${escapeHTML(t('est.multi'))}" title="${escapeHTML(t('est.multi'))}">${icon('multi')}</button>
        ${night}
      </div>`;
  }
  const doors = m && EST.view!=='sala' && m.puertas!=='sin' ? `<button type="button" class="round-btn est-btn ${EST.doors ? 'is-on' : ''}" onclick="estToggleDoors()" aria-pressed="${EST.doors}" aria-label="${escapeHTML(t('est.doors'))}" title="${escapeHTML(t('est.doors'))}">${icon('doors')}</button>` : '';
  return `<div class="est-ctl-l"><span class="est-where-chip is-hint">${escapeHTML(t(EST.view==='sala' ? 'est.sala_tap' : 'est.enter_hint'))}</span></div>
    <div class="est-ctl-r">${doors}${night}</div>`;
}
/* Pantalla completa: atrás, dónde estás, y a la derecha (en una balda) ▲ ▼ y
   portadas, la noche y «Editar» */
function estImmCtlHTML(m, night){
  let title = t('est.title'), sub = t('est.sala_tap'), right = '', lift = '';
  if(EST.view!=='sala' && m){
    title = m.nombre || t('est.mueble_default');
    sub = t('est.enter_hint');
    if(EST.view==='balda'){
      const sid = estBsid(m);
      const ids = estSurfaceIds(m).filter(id=> id!=='top' || estKnownCount(m.encima.items) || sid==='top');
      const i = ids.indexOf(sid);
      const b = sid==='top' ? null : estSurface(m, sid);
      sub = (sid==='top' ? t('est.top') : t('est.bay_of').replace('{n}', m.baldas.findIndex(x=>x.id===sid) + 1).replace('{t}', m.baldas.length) + (b && estPlateText(b) ? ' · ' + estPlateText(b) : ''));
      right = `<button type="button" class="round-btn est-btn ${EST.covers ? 'is-on' : ''}" data-fk="covers" onclick="estToggleCovers()" aria-pressed="${EST.covers}" aria-label="${escapeHTML(t('est.covers'))}" title="${escapeHTML(t('est.covers'))}">${icon('image')}</button>`;
      // ▲ ▼, como los botones de un ascensor, a la derecha
      lift = `<div class="est-imm-lift" role="group" aria-label="${escapeHTML(t('est.baldas'))}"><button type="button" class="round-btn est-btn" data-fk="up" onclick="estBaldaStep(-1)" ${i <= 0 ? 'disabled' : ''} aria-label="${escapeHTML(t('est.up'))}" title="${escapeHTML(t('est.up'))}">${icon('chevronUp')}</button>
        <button type="button" class="round-btn est-btn" data-fk="down" onclick="estBaldaStep(1)" ${i >= ids.length - 1 ? 'disabled' : ''} aria-label="${escapeHTML(t('est.down'))}" title="${escapeHTML(t('est.down'))}">${icon('chevronDown')}</button></div>`;
    }
  }
  const backLabel = EST.view==='balda' ? t('est.to_mueble') : (EST.view==='mueble' && EST.fromSala && estData().muebles.length > 1) ? t('est.sala') : t('est.imm_exit');
  return `<div class="est-imm-l"><button type="button" class="round-btn est-btn" data-fk="imm-back" onclick="estImmBack()" aria-label="${escapeHTML(backLabel)}" title="${escapeHTML(backLabel)}">${icon('chevronLeft')}</button>
      <div class="est-imm-t"><b>${escapeHTML(title)}</b><small>${escapeHTML(sub)}</small></div></div>
    <div class="est-ctl-r">${right}${night}<button type="button" class="btn btn-sm est-edit-btn" data-fk="imm-edit" onclick="estSetMode('editar')">${icon('pencil')}<span> ${t('est.edit')}</span></button></div>${lift}`;
}
/* Abajo, dentro de una balda: el nombre de la que tienes delante o, con una
   pieza elegida, sus controles más usados (postura, mover, girar, sacarla);
   eligiendo varias, cuántas y «Hecho» */
function estBarHTML(){
  if(EST.mode==='ver' && EST.view!=='balda') return estKbdHTML();
  if(EST.view!=='balda') return '';
  if(EST.mode==='ver') return `<button type="button" class="est-rail" id="estRail" hidden onclick="estPickCenter()" onkeydown="estRailKey(event)" aria-keyshortcuts="ArrowLeft ArrowRight"></button><span class="sr-only" id="estRailLive" aria-live="polite"></span>`;
  if(EST.multi){
    const n = EST.multi.size;
    return `<div class="est-qb est-mbar" role="group" aria-label="${escapeHTML(t('est.multi'))}">
      <span class="est-mbar-n" aria-live="polite">${escapeHTML(t('est.multi_n').replace('{n}', n))}</span>
      <button type="button" class="btn btn-sm" data-fk="mb-all" onclick="estMultiAll('${escapeHTML(EST.bsid || '')}', true)">${t('est.multi_all_here')}</button>
      <button type="button" class="btn btn-sm primary" data-fk="mb-done" onclick="estMultiOn(false)">${icon('check')} ${t('est.multi_done')}</button>
    </div>`;
  }
  const x = estSelItem();
  if(!x) return `<button type="button" class="est-rail" id="estRail" hidden onclick="estPickCenter()"></button>`;
  const pose = x.it.pose || 'lomo';
  const btn = (fk, fn, ic, label)=> `<button type="button" class="round-btn est-btn" data-fk="${fk}" onclick="${fn}" aria-label="${escapeHTML(label)}" title="${escapeHTML(label)}">${icon(ic)}</button>`;
  return `<div class="est-qb" role="group" aria-label="${escapeHTML(t('est.place_tools'))}">
    <button type="button" class="btn btn-sm est-qb-pose" data-fk="qb-pose" onclick="estCyclePose()" aria-label="${escapeHTML(t('est.pose') + ': ' + t('est.pose.' + pose))}" title="${escapeHTML(t('est.pose'))}">${icon('rotate')} ${escapeHTML(t('est.pose_s.' + pose))}</button>
    ${btn('qb-l', 'estMove(-1)', 'chevronLeft', t('est.move_left'))}${btn('qb-r', 'estMove(1)', 'chevronRight', t('est.move_right'))}
    ${btn('qb-rl', 'estRotate(-15)', 'rotateLeft', t('est.rot_left'))}${btn('qb-rr', 'estRotate(15)', 'rotate', t('est.rot_right'))}
    ${estIsFolderPid(x.it.pid) ? btn('qb-out', `estOpenBook('${escapeHTML(x.it.pid.slice(EST_FOLDER.length))}')`, 'book', t('est.folder_open')) : btn('qb-out', `estInspect('${escapeHTML(x.it.pid)}')`, 'expand', t('est.take_out'))}
  </div>`;
}
/* Pantalla completa con el teclado (o un lector de pantalla): los muebles de la sala y
   las baldas del mueble como botones. No se ven hasta que tienen el foco (entonces
   aparecen abajo y el mueble o la balda se marca en el escenario) */
function estKbdHTML(){
  const E = estData();
  let list = [], label = '';
  if(EST.view==='sala'){
    label = t('est.muebles');
    list = E.muebles.map(m=>({ name: m.nombre || t('est.mueble_default'), fn:`estKbdGo('m','${m.id}')`, hi:`[data-mid="${m.id}"]` }));
  } else {
    const m = estMueble(estMid()); if(!m) return '';
    label = t('est.baldas');
    if(estKnownCount(m.encima.items)) list.push({ name: t('est.top'), fn:`estKbdGo('b','top')`, hi:'' });
    m.baldas.forEach((b, i)=> list.push({ name: t('est.balda_n').replace('{n}', i + 1) + (estPlateText(b) ? ' · ' + estPlateText(b) : ''), fn:`estKbdGo('b','${b.id}')`, hi:`.est-bay[data-sid="${b.id}"]` }));
  }
  if(!list.length) return '';
  return `<div class="est-kbd" role="group" aria-label="${escapeHTML(label)}">${list.map((x, i)=>`<button type="button" class="est-kbd-b" data-fk="kb-${i}" aria-label="${escapeHTML(t('est.rail_open').replace('{name}', x.name))}" onclick="${x.fn}" onfocus="estKbdHi('${escapeHTML(x.hi)}')" onblur="estKbdHi('')">${escapeHTML(x.name)}</button>`).join('')}</div>`;
}
function estKbdHi(sel){
  document.querySelectorAll('#estScene .is-kbd').forEach(e=> e.classList.remove('is-kbd'));
  if(sel){ const el = document.querySelector('#estScene ' + sel); if(el) el.classList.add('is-kbd'); }
}
function estKbdGo(kind, id){
  EST.kbd = true;
  if(kind==='m'){ estShowMueble(id); EST.fromSala = true; }
  else estEnterBalda(id, null);
}
/* Tras ir a otro nivel con el teclado, el foco sigue en lo de abajo (o en el nombre de la que tienes delante) */
function estKbdFocusNext(){
  if(!EST.kbd) return; EST.kbd = false;
  setTimeout(()=>{
    const rail = document.getElementById('estRail');
    const b = document.querySelector('#estBar .est-kbd-b') || (rail && !rail.hidden ? rail : null) || document.querySelector('#estCtl [data-fk="imm-back"]');
    if(b) b.focus({ preventScroll:true });
  }, 160);
}
/* En la barra del nombre: ◀ ▶ pasan a la anterior o la siguiente */
function estRailKey(e){
  if(e.key!=='ArrowLeft' && e.key!=='ArrowRight') return;
  e.preventDefault();
  const scr = document.querySelector('#estScene .est-scroll'), rail = document.getElementById('estRail'); if(!scr || !rail) return;
  const els = [...scr.querySelectorAll('.est-pz[data-x]')].sort((a, b)=> (Number(a.dataset.x) - Number(b.dataset.x)) || (Number(a.dataset.row || 0) - Number(b.dataset.row || 0)));
  const i = els.findIndex(el=> el.dataset.pid===rail.dataset.pid);
  const el = els[Math.max(0, Math.min(els.length - 1, (i < 0 ? 0 : i) + (e.key==='ArrowRight' ? 1 : -1)))]; if(!el) return;
  EST.railPin = el.dataset.pid;
  scr.scrollTo({ left: estScrollTargetFor(el, scr), behavior:'auto' });
  estUpdateRail();
  const live = document.getElementById('estRailLive'), p = estP(el.dataset.pid);
  if(live && p) live.textContent = p.name;
}
/* Repinta los botones del escenario sin perder el foco del teclado */
function estRefreshCtl(){
  const a = document.activeElement;
  const fk = a && a.closest && a.closest('#estStage') && a.dataset ? a.dataset.fk : null;
  const el = document.getElementById('estCtl'); if(el) el.innerHTML = estCtlHTML();
  const bar = document.getElementById('estBar'); if(bar){ bar.innerHTML = estBarHTML(); bar.hidden = !bar.innerHTML.trim(); }
  if(fk){ const b = document.querySelector(`#estStage [data-fk="${CSS.escape(fk)}"]`); if(b && !b.disabled) b.focus({ preventScroll:true }); }
  estKbdFocusNext();
}
function estRefreshPanel(){
  const el = document.getElementById('estPanel'); if(!el) return;
  // se conservan las baldas abiertas y el botón con el foco (teclado, lector de pantalla)
  const open = new Set([...el.querySelectorAll('details[open][data-sid]')].map(d=>d.dataset.sid));
  const a = document.activeElement;
  const fk = a && el.contains(a) && a.dataset ? a.dataset.fk : null;
  el.innerHTML = estPanelHTML();
  open.forEach(sid=>{ const d = el.querySelector(`details[data-sid="${CSS.escape(sid)}"]`); if(d) d.open = true; });
  if(fk){
    // si el botón ya no está (p. ej. al quitarlas todas), el foco va a la tarjeta y no se pierde
    const b = el.querySelector(`[data-fk="${CSS.escape(fk)}"]`) || el.querySelector('.est-multi [data-fk="mc-done"], [data-fk="multi-on"]');
    if(b) b.focus({ preventScroll:true });
  }
  hydratePhotos(el);
  estHydratePhotos(el);   // v11.14: el lomo con foto en la tarjeta
}
/* Después de pintar la pantalla: el escenario necesita su tamaño real */
function estAfterRender(){
  const imm = view.page==='estanteria' && !view.productId && EST.mode==='ver' && estHas() && !!document.getElementById('estImm');
  document.documentElement.classList.toggle('est-imm-on', imm);
  // lo que queda tapado (barra de arriba, pestañas, la de abajo) no recibe el foco ni lo lee el lector
  document.querySelectorAll('.shell > .topbar, #topnav, #subbar, #bottomnav, #fab').forEach(el=>{ el.inert = imm; });
  // (la entrada animada de la pantalla mueve el panel, y con él la pantalla completa: aquí no)
  if(imm){ const pn = document.getElementById('panel'); if(pn) pn.classList.remove('screen-enter'); }
  if(view.page!=='estanteria' || view.productId || !estHas()) return;
  estBindStage();
  estDraw();
  { const pn = document.getElementById('estPanel'); if(pn) estHydratePhotos(pn); }   // v11.14: el lomo con foto en la tarjeta
  if(imm && !estInspectOpen() && !(typeof isSheetOpen==='function' && isSheetOpen())){ const b = document.querySelector('#estCtl [data-fk="imm-back"]'); if(b && !document.activeElement.closest('#estImm')) b.focus({ preventScroll:true }); }
  if(EST.view==='balda' && EST.sel) requestAnimationFrame(()=>estScrollToSel(false));
  else if(EST.view==='balda' && EST.focusPid) requestAnimationFrame(estShowFocus);
  if(EST.bookAfter){ const b = EST.bookAfter; EST.bookAfter = null; setTimeout(()=>estOpenBook(b.cid, b.pid), 60); }
}
function estShowSala(){ EST.view = 'sala'; EST.sel = null; EST.covers = false; EST.delAsk = false; render(); }
function estShowMueble(mid){ EST.view = 'mueble'; EST.mid = mid; EST.sel = null; EST.covers = false; EST.delAsk = false; EST.fromSala = false; render(); }

/* Panel bajo el escenario */
function estPanelHTML(){
  const E = estData();
  if(EST.view==='sala'){
    return `<p class="section-sub est-hint">${t('est.sala_hint')}</p>
      <div class="quick-actions">${estStyleBtn()}${estMedColBtn()}</div>${estFoldersHTML()}${estDeleteAllHTML()}`;
  }
  const m = estMueble(estMid()); if(!m) return '';
  let html = '';
  const surf = (sid, label, sf, H, isOpen)=>{
    const L = estLayout(sf.items, m.ancho, H, m.fondo);
    const pct = Math.min(100, Math.round(L.used / m.ancho * 100));
    const warn = L.over.length ? ` · <span class="est-warn">${escapeHTML(t('est.over').replace('{n}', L.over.length))}</span>` : L.tall.length ? ` · <span class="est-warn">${escapeHTML(t('est.tall').replace('{n}', L.tall.length))}</span>` : '';
    const names = sf.items.map((it, i)=>{
      const p = estP(it.pid); if(!p) return '';
      const on = EST.multi ? EST.multi.has(it.pid) : !!(EST.sel && EST.sel.sid===sid && EST.sel.pid===it.pid);
      const rec = L.recs.find(r=>r.it===it);
      const back = rec && rec.row ? ' is-back' : '';
      const color = p.isFolder ? p.folder.color : platVisual(p.platformId).color;
      const txt = p.isFolder ? `${icon('folder')} ${escapeHTML(p.name)} <small>${estFolderPieces(p.folder).length}</small>` : escapeHTML(p.name);
      return `<button type="button" class="est-item-chip${p.isFolder ? ' is-folder' : ''}${p.possession!=='tengo' ? ' is-ghost' : ''}${back}${on ? ' active' : ''}" aria-pressed="${on}" data-fk="chip-${escapeHTML(p.id)}" style="--plat:${color}"${back ? ` title="${escapeHTML(t('est.row_back'))}"` : ''} onclick="${EST.multi ? `estMultiToggle('${escapeHTML(p.id)}')` : `estSelect({ mid:'${m.id}', sid:'${sid}', idx:${i}, pid:'${escapeHTML(p.id)}' })`}">${EST.multi ? `<span class="est-chip-box" aria-hidden="true">${on ? icon('check') : ''}</span>` : ''}${txt}</button>`; }).join('');
    const k = estKnownCount(sf.items);
    const n = estPieceCount(sf.items);
    const used = k ? Math.round(L.used) : 0;
    const enter = EST.view!=='balda' ? `<button type="button" class="btn btn-sm" onclick="estEnterBalda('${sid}', null)">${icon('expand')} ${t('est.enter')}</button>` : '';
    const gaps = estHasGaps(L) ? `<button type="button" class="btn btn-sm btn-ghost" onclick="estCompactSurface('${m.id}','${sid}')">${icon('fit')} ${t('est.compact')}</button>` : '';
    return `<details class="disclosure est-surf" data-sid="${sid}" ${isOpen ? 'open' : ''}><summary>${icon('chevronRight','chev')}<span>${escapeHTML(label)}</span><span class="sum-meta">${escapeHTML(t('est.surf_meta').replace('{n}', n).replace('{u}', used).replace('{w}', fmtCm(m.ancho)))}${warn}</span></summary>
      <div class="disclosure-body"><div class="est-cap" aria-hidden="true"><span style="width:${pct}%"></span></div>
        ${k ? `<div class="est-item-chips${EST.multi ? ' is-multi' : ''}">${names}</div>` : `<p class="section-sub">${t('est.surf_empty')}</p>`}
        ${EST.multi && k ? `<div class="quick-actions is-flush est-multi-surf"><button type="button" class="btn btn-sm" data-fk="ms-all-${sid}" onclick="estMultiAll('${sid}', true)">${icon('check')} ${t('est.multi_all_surf')}</button><button type="button" class="btn btn-sm btn-ghost" data-fk="ms-none-${sid}" onclick="estMultiAll('${sid}', false)">${t('est.multi_none_surf')}</button></div>` : ''}
        <div class="quick-actions">${enter}<button type="button" class="btn btn-sm" onclick="openEstAddSheet('${sid}')">${icon('plus')} ${t('est.add_here')}</button>
          <button type="button" class="btn btn-sm" onclick="openEstFolderSheet(null, '${sid}')">${icon('folder')} ${t('est.folder_new_here')}</button>
          ${k ? `${gaps}<button type="button" class="btn btn-sm btn-ghost" onclick="estSortSurface('${m.id}','${sid}')">${icon('sortIcon')} ${t('est.sort')}</button><button type="button" class="btn btn-sm btn-ghost" onclick="estClearSurface('${m.id}','${sid}')">${icon('trash')} ${t('est.clear')}</button>` : ''}</div>
      </div></details>`;
  };
  const label = (sid)=> sid==='top' ? t('est.top') : (()=>{ const i = m.baldas.findIndex(b=>b.id===sid); const b = m.baldas[i]; return t('est.balda_n').replace('{n}', i + 1) + (estPlateText(b) ? ' · ' + estPlateText(b) : ''); })();
  if(EST.view==='balda'){
    // dentro de una balda: la pieza elegida (o una pista) y esa balda
    const x = EST.multi ? null : estSelItem();
    if(EST.multi) html += estMultiCardHTML();
    else if(x) html += estSelCardHTML(m, x);
    else html += `<div class="est-hint-row"><p class="section-sub est-hint">${t('est.balda_hint')}</p><button type="button" class="btn btn-sm" data-fk="multi-on" onclick="estMultiOn(true)">${icon('multi')} ${t('est.multi')}</button></div>`;
    const sid = estBsid(m);
    html += `<div class="est-surfaces">${surf(sid, label(sid), estSurface(m, sid), estSurfaceH(m, sid), !x)}</div>`;
    html += `<div class="quick-actions est-actions"><button type="button" class="btn btn-sm" onclick="estExitBalda()">${icon('chevronLeft')} ${t('est.to_mueble')}</button>${estStyleBtn()}${estMedColBtn()}</div>`;
    return html;
  }
  if(EST.multi) html += estMultiCardHTML();
  html += `<div class="quick-actions est-actions">
    ${estStyleBtn()}
    <button type="button" class="btn btn-sm" onclick="openEstDesign('${m.id}')">${icon('ruler')} ${t('est.design')}</button>
    ${estMedColBtn()}
    <button type="button" class="btn btn-sm" onclick="openEstAddSheet()">${icon('plus')} ${t('est.add_pieces')}</button>
    ${EST.multi ? '' : `<button type="button" class="btn btn-sm" data-fk="multi-on" onclick="estMultiOn(true)">${icon('multi')} ${t('est.multi')}</button>`}
  </div>`;
  // baldas (también es la forma de llegar a cada pieza con el teclado o el lector de pantalla)
  html += `<div class="est-surfaces">${surf('top', t('est.top'), m.encima, EST_TOP_H)}${m.baldas.map(b=>surf(b.id, label(b.id), b, b.alto)).join('')}</div>`;
  html += estFoldersHTML();
  const unplaced = PRODUCTS.length - estCountPlaced();
  html += `<p class="section-sub est-foot">${escapeHTML(t('est.placed').replace('{n}', estCountPlaced()).replace('{t}', PRODUCTS.length))}${unplaced ? ` <button type="button" class="link-btn" onclick="estAutoAddUnplaced()">${escapeHTML(t('est.add_unplaced').replace('{n}', unplaced))}</button>` : ''}</p>
    <div class="quick-actions est-more"><button type="button" class="btn btn-sm btn-ghost" onclick="estRebuild()">${icon('refresh')} ${t('est.rebuild')}</button></div>`;
  html += estDeleteAllHTML();
  return html;
}
/* ¿Hay huecos en alguna fila? (para ofrecer «Juntar») */
function estHasGaps(L){
  return [0, 1].some(row=>{
    const cs = L.cols.filter(c=>c.row===row).sort((a, b)=>a.x - b.x);
    let end = EST_GAP;
    return cs.some(c=>{ const gap = c.x - end > 0.3; end = c.x + c.fw + EST_GAP; return gap; });
  });
}
function estMedColBtn(){ return `<button type="button" class="btn btn-sm" onclick="openEstMedCol()">${icon('ruler')} ${t('est.medcol')}</button>`; }
/* Las carpetas: dónde está cada una (o «sin colocar») */
function estFoldersHTML(){
  const F = Object.values(estFolders());
  const rows = F.map(f=>{
    const g = estFind(EST_FOLDER + f.id);
    const where = g ? (g.m.nombre + ' · ' + (g.sid==='top' ? t('est.top') : t('est.balda_n').replace('{n}', g.n))) : t('est.folder_unplaced');
    return `<div class="est-folder-row">
      <span class="est-folder-sw${estLum(f.color) > 0.62 ? ' is-light' : ''}" style="background:${f.color}" aria-hidden="true">${icon('folder')}</span>
      <span class="est-folder-info"><b>${escapeHTML(f.nombre || t('est.folder_default'))}</b><small>${escapeHTML(t('est.folder_n').replace('{n}', estFolderPieces(f).length) + ' · ' + where)}</small></span>
      <span class="est-folder-btns">
        <button type="button" class="btn btn-sm" onclick="estOpenBook('${f.id}')" aria-label="${escapeHTML(t('est.folder_open') + ': ' + (f.nombre || t('est.folder_default')))}">${icon('book')}<span class="est-hide-xs"> ${t('est.folder_open')}</span></button>
        ${g ? '' : `<button type="button" class="btn btn-sm" onclick="estPlaceFromFicha('${EST_FOLDER}${f.id}')">${t('est.place_it')}</button>`}
        <button type="button" class="btn btn-sm btn-ghost btn-icon" onclick="openEstFolderSheet('${f.id}')" aria-label="${escapeHTML(t('est.folder_edit') + ': ' + (f.nombre || t('est.folder_default')))}" title="${escapeHTML(t('est.folder_edit'))}">${icon('pencil')}</button>
      </span></div>`;
  }).join('');
  return `<section class="est-folders" aria-labelledby="estFoldT">
    <div class="est-folders-head"><h3 class="sub-title" id="estFoldT">${t('est.folders')}</h3><button type="button" class="btn btn-sm" onclick="openEstFolderSheet()">${icon('plus')} ${t('est.folder_new')}</button></div>
    ${rows || `<p class="settings-note">${t('est.folders_note')}</p>`}
  </section>`;
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
  const p = estP(x.it.pid); if(!p) return '';
  const folder = p.isFolder ? p.folder : null;
  const pv = platVisual(p.platformId);
  const pose = x.it.pose || 'lomo';
  const b = estItemBox(x.it, p);
  const L = estLayout(x.sf.items, m.ancho, estSurfaceH(m, EST.sel.sid), m.fondo);
  const rec = L.recs.find(r=>r.it===x.it);
  const back = !!(rec && rec.row);
  const id = escapeHTML(p.id);
  let head, actions;
  if(folder){
    const n = estFolderPieces(folder).length;
    head = `<span class="est-sel-thumb est-folder-thumb${estLum(folder.color) > 0.62 ? ' is-light' : ''}" style="background:${folder.color}" aria-hidden="true">${icon('folder')}</span>
      <div class="est-sel-titles"><span class="est-sel-name">${escapeHTML(p.name)}</span><span class="est-sel-sub">${escapeHTML(t('est.folder'))}<br>${escapeHTML(t('est.folder_n').replace('{n}', n))}</span></div>`;
    actions = `<button type="button" class="btn btn-sm primary" onclick="estOpenBook('${folder.id}')">${icon('book')} ${t('est.folder_open')}</button>
      <button type="button" class="btn btn-sm" onclick="openEstFolderAdd('${folder.id}')">${icon('plus')} ${t('est.folder_add')}</button>
      <button type="button" class="btn btn-sm" onclick="openEstFolderSheet('${folder.id}')">${icon('pencil')} ${t('est.folder_edit')}</button>`;
  } else {
    const n = copyCount(p), c = shownCopy(p);
    const sub = p.possession==='tengo' ? [n > 1 ? t('est.have_n').replace('{n}', n) : t('est.have'), copyLine(p, c)].join(' · ') : t('cover.missing');
    const ph = shownPhotoId(p);
    const thumb = hasPhoto(ph, 'front') ? photoImgHTML(p, 'front', 'thumb', 'data-eager="1"', ph) : `<span class="code-chip" aria-hidden="true">${escapeHTML(pv.code)}</span>`;
    head = `<span class="est-sel-thumb" aria-hidden="true">${thumb}</span>
      <div class="est-sel-titles"><span class="est-sel-name">${escapeHTML(p.name)}</span><span class="est-sel-sub">${escapeHTML([p.platformName, p.year].filter(Boolean).join(' · '))}<br>${escapeHTML(sub)}</span></div>`;
    actions = `<button type="button" class="btn btn-sm primary" onclick="estInspect('${id}')">${icon('expand')} ${t('est.take_out')}</button>
      <button type="button" class="btn btn-sm" onclick="goProduct('${id}')">${icon('box')} ${t('est.open_ficha')}</button>`;
  }
  // medidas rápidas: grosor (fondo) y alto, de 1 en 1 mm
  const dimq = (k, label, v, hint)=> `<span class="est-dimq-item"><span class="est-dimq-l" title="${escapeHTML(hint)}">${label}</span>
      <span class="est-step"><button type="button" class="btn btn-sm" data-fk="dq-${k}-m" onclick="estPieceDim('${k}', -0.1)" aria-label="${escapeHTML(label + ': ' + t('est.less'))}">${icon('minus')}</button><output aria-live="polite">${escapeHTML(fmtCm(v))} cm</output><button type="button" class="btn btn-sm" data-fk="dq-${k}-p" onclick="estPieceDim('${k}', 0.1)" aria-label="${escapeHTML(label + ': ' + t('est.more'))}">${icon('plus')}</button></span></span>`;
  const sph = !folder && p.possession==='tengo' ? shownPhotoId(p) : null;
  const lomoPh = !!(sph && hasPhoto(sph, 'lomo'));
  const lomo = sph ? `<div class="est-sel-lomo"><span class="est-lomo-sw${lomoPh ? ' has-photo' : ''}"${lomoPh ? estSidePh(p, 'lomo', (()=>{ const d = piezaDims(p); return d.d / Math.max(0.1, d.h); })()) : ` style="${estLomoSwatchStyle(p)}"`} aria-hidden="true"></span><span class="est-lomo-txt">${escapeHTML(t('est.lomo') + ': ' + estLomoDesc(p))}</span><button type="button" class="btn btn-sm" data-fk="lomo" onclick="openEstPieceColor('${id}')" aria-label="${escapeHTML(t('est.change') + ' — ' + t('est.lomo'))}">${icon('palette')} ${t('est.change')}</button></div>` : '';
  // v11.14: las fotos de sus lados (para que la caja sea como la tuya)
  const nSides = sph ? sideSlotsFor(sph).length : 0;
  const sides = sph ? `<div class="est-sel-lomo est-sel-sides"><span class="est-lomo-sw est-sides-sw" aria-hidden="true">${icon('camera')}</span><span class="est-lomo-txt">${escapeHTML(t('est.side_photos') + ' · ' + nSides + ' / ' + SIDE_SLOTS.length)}</span><button type="button" class="btn btn-sm" data-fk="sides" onclick="openEstSidePhotos('${id}')" aria-label="${escapeHTML(t(nSides ? 'est.change' : 'photo.add_extra_short') + ' — ' + t('est.side_photos'))}">${icon('camera')} ${t(nSides ? 'est.change' : 'photo.add_extra_short')}</button></div>` : '';
  return `<section class="est-sel${folder ? ' is-folder' : ''}" id="estSelCard" aria-label="${escapeHTML(p.name)}" style="--plat:${folder ? folder.color : pv.color}">
    <div class="est-sel-head">${head}
      <button type="button" class="btn btn-ghost btn-icon" onclick="estSelect(null)" aria-label="${escapeHTML(t('common.close'))}">${icon('x')}</button></div>
    <div class="quick-actions is-flush">${actions}</div>
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
    <div class="field-label est-sel-lbl">${t('est.row')}</div>
    <div class="segmented est-rows" role="group" aria-label="${escapeHTML(t('est.row'))}">
      <button type="button" class="seg-btn ${back ? '' : 'active'}" aria-pressed="${!back}" data-fk="row-0" onclick="estSetFila(0)">${t('est.row_front')}</button>
      <button type="button" class="seg-btn ${back ? 'active' : ''}" aria-pressed="${back}" data-fk="row-1" onclick="estSetFila(1)">${t('est.row_back')}</button>
    </div>
    <div class="field-label est-sel-lbl">${t(folder ? 'est.dims_folder' : 'est.dims_piece')}</div>
    <div class="est-dimq">${dimq('d', t('est.thick'), b.dims.d, t('est.thick_hint'))}${dimq('h', t('est.height'), b.dims.h, t('est.height'))}</div>
    ${lomo}${sides}
    <p class="est-sel-dims">${escapeHTML((b.dims.exact ? '' : '≈ ') + [b.dims.w, b.dims.h, b.dims.d].map(fmtCm).join(' × ') + ' cm')} · ${x.it.rot ? escapeHTML(t('est.rot_deg').replace('{n}', x.it.rot)) + ' · ' : ''}${folder ? '' : `<button type="button" class="link-btn" onclick="openMedidasSheet('${id}')">${t('est.size')}</button> · `}<button type="button" class="link-btn" onclick="openEstMoveTo()">${t('est.move_to')}</button>${folder ? '' : ` · <button type="button" class="link-btn" onclick="openEstToFolder('${id}')">${t('est.to_folder')}</button>`} · <button type="button" class="link-btn est-danger" onclick="estRemoveSel()">${t('est.remove')}</button></p>
    <p class="settings-note">${t('est.drag_hint')}</p>
  </section>`;
}
/* Grosor o alto de la pieza elegida, al momento (pasan a ser sus medidas) */
function estPieceDim(k, delta){
  const x = estSelCol(); if(!x) return;
  const p = estP(x.it.pid); if(!p) return;
  const d = piezaDims(p);
  const v = { w:d.w, h:d.h, d:d.d };
  v[k] = Math.max(0.1, Math.min(400, Math.round((v[k] + delta) * 10) / 10));
  if(p.isFolder){ v.w = estNum(v.w, 1, 120, 23); v.h = estNum(v.h, 1, 120, 31); v.d = estNum(v.d, 0.2, 60, 3); }
  if(p.isFolder){ const f = p.folder; f.ancho = v.w; f.alto = v.h; f.fondo = v.d; estAfterEdit(); return; }
  const real = PRODUCTS_BY_ID[p.id]; if(!real) return;
  const med = { ancho:v.w, alto:v.h, fondo:v.d };
  real.medidas = med;
  if(!OVERRIDES.products[real.id]) OVERRIDES.products[real.id] = {};
  OVERRIDES.products[real.id].medidas = med;
  estAfterEdit();
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
  // (las carpetas, detrás de las piezas, en el orden en que estaban)
  const by = new Map(sortGames(sf.items.map(it=>PRODUCTS_BY_ID[it.pid]).filter(Boolean)).map((p, i)=>[p.id, i]));
  const rank = (it, i)=> by.has(it.pid) ? by.get(it.pid) : estIsFolderPid(it.pid) ? 1e6 + i : 1e9 + i;
  const order = new Map(sf.items.map((it, i)=>[it, rank(it, i)]));
  sf.items.sort((a, b)=> order.get(a) - order.get(b));
  sf.items.forEach(it=>{ delete it.apilado; delete it.dx; delete it.x; delete it.fila; });
  EST.sel = null;
  estAfterEdit();
}
/* «Juntar»: cierra los huecos (cada fila, de izquierda a derecha, sin cambiar el orden) */
function estCompactSurface(mid, sid){
  const m = estMueble(mid), sf = estFreeze(m, sid); if(!sf) return;
  sf.items.forEach(it=>{ delete it.x; delete it.dx; });
  estAfterEdit();
  showToast(t('est.compacted'), { ok:true, replace:true });
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
  const placed = estTakenSet();
  const sf = estSurface(m, estAddState.sid) || m.encima;
  const H = estSurfaceH(m, estAddState.sid);
  const L = estLayout(sf.items, m.ancho, H, m.fondo);
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
  const placed = estTakenSet();
  const list = sortGames(PRODUCTS.filter(p=>p.platformId===platId && !placed.has(p.id) && (estAddState.huecos || p.possession==='tengo')));
  const m = estMueble(estMid()); if(!m || !list.length) return;
  const sf = estSurface(m, estAddState.sid) || m.encima;
  // solo las que caben de ancho; el resto se avisa
  const H = estSurfaceH(m, estAddState.sid);
  const take = [];
  for(const p of list){
    const L = estLayout(sf.items.concat(take.map(id=>({ pid:id })), [{ pid:p.id }]), m.ancho, H, m.fondo);
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
  const x = estSelCol(); if(!x) return;   // (las que se quedan, en su sitio)
  if(mid===x.m.id && sid===EST.sel.sid){ closeSheet(); return; }
  const m = estMueble(mid), sf = estSurface(m, sid); if(!sf) return;
  const it = Object.assign({}, x.it); delete it.apilado; delete it.dx; delete it.x; delete it.fila;
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
   7. SACARLA (v11.13: es la de la sección 12) y el cierre de los diálogos
   ===================================================================== */
let estInspectState = null;
function estInspectOpen(){ return !!estInspectState || !!estBookState || !!estPullState; }
/* v11.13: «Sacarla» es lo mismo que en pantalla completa: sale de su sitio,
   se pone delante, se gira en 3D y «Salir» la devuelve (sección 12) */
function estInspect(pid){
  if(estIsFolderPid(pid)){ estOpenBook(pid.slice(EST_FOLDER.length)); return; }
  if(!PRODUCTS_BY_ID[pid]) return;
  estPullOut(pid, document.querySelector(`#estScene [data-pid="${CSS.escape(pid)}"]`));
}
function estCloseInspect(silent){
  // (sacada: vuelve a su sitio con su animación; sus fotos se sueltan al terminar)
  if(estPullState || document.getElementById('estPull')){ if(silent) estPullClose(true); else { estPullBack(); return; } }
  if(estBookState || document.getElementById('estBook')) estCloseBook(silent);
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
  const loc = f ? null : estLocate(p.id);
  if(loc && loc.folder){
    const fn = loc.folder.nombre || t('est.folder_default');
    const where = loc.m ? t('est.in_shelf').replace('{m}', loc.m.nombre).replace('{b}', loc.sid==='top' ? t('est.top') : t('est.balda_n').replace('{n}', loc.n)) : t('est.folder_unplaced');
    return `<div class="est-where"><span class="est-where-ic" aria-hidden="true">${icon('folder')}</span><span class="est-where-txt">${escapeHTML(t('est.in_folder').replace('{f}', fn) + ' · ' + where)}</span>
      <button type="button" class="btn btn-sm" onclick="${loc.m ? `goEstanteria({ pid:'${escapeHTML(p.id)}' })` : `estOpenBook('${loc.folder.id}','${escapeHTML(p.id)}')`}">${t(loc.m ? 'est.see' : 'est.folder_open')}</button></div>`;
  }
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
  estSave(true).then(()=>{ goEstanteria({ pid, edit:true }); });   // recién colocada: editando, para ajustarla
}

/* =====================================================================
   9. MEDIDAS Y COLORES (v11.12)
   ---------------------------------------------------------------------
   Por plataforma (todas sus piezas), por categoría (varias plataformas a
   la vez, solo lo que actives) y por pieza (en su tarjeta). El color del
   lomo: el medio de su portada (como hasta ahora), uno elegido, el de la
   app o tomado de una foto; y, si quieres, una banda arriba.
   ===================================================================== */
const EST_SWATCHES = [['#c8312b','rojo'], ['#f3f2ee','blanco'], ['#1d1e22','negro'], ['#8d9096','gris'], ['#2f5fa8','azul'], ['#5aa9d6','azul_claro'], ['#2f7d4f','verde'], ['#e2b93b','amarillo'], ['#d9dee4','transparente']];
const EST_PORTADA_MIX = ['#c9473d', '#e8dcd2', '#5d7fa8'];
function estColorName(hex){ const s = EST_SWATCHES.find(x=> x[0].toLowerCase()===String(hex).toLowerCase()); return s ? t('est.sw.' + s[1]) : String(hex).toUpperCase(); }
function estLomoText(lomo, banda){
  let s = lomo==='app' ? t('est.lomo_app') : EST_HEX.test(String(lomo || '')) ? estColorName(lomo) : t('est.lomo_cover');
  if(banda) s += ' · ' + t('est.band_of').replace('{c}', estColorName(banda));
  return s;
}
function estLomoDesc(p){
  if(p.possession==='tengo' && !p.isFolder && hasPhoto(shownPhotoId(p), 'lomo')) return t('est.lomo_photo');   // v11.14
  const C = estColors();
  const pc = C.piezas[p.id] || {}, pl = (p.platformId && C.plataformas[p.platformId]) || {};
  const lomo = pc.lomo!==undefined ? pc.lomo : (pl.lomo || 'portada');
  const banda = pc.banda!==undefined ? pc.banda : (pl.banda || '');
  const own = pc.lomo!==undefined || pc.banda!==undefined;
  return estLomoText(lomo, banda) + (!own && (pl.lomo || pl.banda) ? ' (' + t('est.as_platform') + ')' : '');
}
function estLomoSwatchStyle(p){
  const L = estLomo(p);
  const bg = L.color || `linear-gradient(90deg, ${EST_PORTADA_MIX.join(', ')})`;
  return `background:${bg};${L.banda ? `box-shadow:inset 0 6px 0 ${L.banda}, inset 0 0 0 1px rgba(0,0,0,0.15);` : ''}`;
}
/* Medidas de una plataforma: las que pusiste o las aproximadas (de su formato más habitual) */
function estPlatProducts(plId){ return PRODUCTS.filter(p=>p.platformId===plId); }
function estPlatDims(plId){
  const E = estData(), pd = E.medidasPlataforma && E.medidasPlataforma[plId];
  if(medidasValidas(pd)) return { w:pd.ancho, h:pd.alto, d:pd.fondo, src:'platform' };
  const list = estPlatProducts(plId);
  if(!list.length) return { w:13, h:18, d:2.5, src:'std' };
  const byF = new Map(); list.forEach(p=>{ const f = formatoDe(p); byF.set(f, (byF.get(f) || 0) + 1); });
  const f = [...byF.entries()].sort((a, b)=> b[1] - a[1])[0][0];
  const rep = list.find(p=>formatoDe(p)===f) || list[0];
  const d = piezaStdDims(rep);
  return { w:d.w, h:d.h, d:d.d, src:'std' };
}
function estDimsText(d){ return [d.w, d.h, d.d].map(fmtCm).join(' × ') + ' cm'; }
/* Tres lomos de muestra (para las listas) */
function estMiniSpines(lomo, banda, dims, plId){
  const color = lomo==='app' ? platVisual(plId).color : EST_HEX.test(String(lomo || '')) ? lomo : null;
  const h = Math.max(14, Math.min(34, dims.h * 1.5)), w = Math.max(3, Math.min(11, dims.d * 4.5));
  return EST_PORTADA_MIX.map(c=>`<i style="width:${w.toFixed(1)}px;height:${h.toFixed(1)}px;background:${color || c};${banda ? `box-shadow:inset 0 ${Math.max(3, h * 0.18).toFixed(1)}px 0 ${banda}` : ''}"></i>`).join('');
}

/* ---------- Hoja: Medidas y colores (todas las plataformas) ---------- */
function estCatPlats(catId){
  return orderedPlatformsForCategory(catId, getAllPlatforms().filter(p=>p.categoryId===catId)).filter(pl=> PRODUCTS.some(p=>p.platformId===pl.id));
}
function openEstMedCol(){
  openSheet({ kind:'est-medcol', title:t('est.medcol'), body:estMedColBodyHTML(), foot:`<button type="button" class="btn primary" onclick="closeSheet()">${t('copy.done')}</button>` });
}
function estMedColBodyHTML(){
  const C = estColors();
  const cats = getAllCategories().map(c=>({ c, plats: estCatPlats(c.id) })).filter(x=>x.plats.length);
  return `<p class="settings-note">${t('est.medcol_note')}</p>` + cats.map(({ c, plats }, i)=>{
    const n = plats.reduce((a, pl)=> a + estPlatProducts(pl.id).length, 0);
    const rows = plats.map(pl=>{
      const d = estPlatDims(pl.id), col = C.plataformas[pl.id] || {};
      const pv = platVisual(pl.id);
      return `<button type="button" class="est-mc-row" onclick="openEstPlatSheet('${pl.id}')">
        <span class="est-mc-sp" aria-hidden="true">${estMiniSpines(col.lomo, col.banda, d, pl.id)}</span>
        <span class="est-mc-txt"><b>${escapeHTML(pl.name)}</b><small>${escapeHTML(estDimsText(d))} <span class="est-tag${d.src==='platform' ? ' is-own' : ''}">${escapeHTML(t(d.src==='platform' ? 'est.dims_yours' : 'dims.approx'))}</span></small><small>${escapeHTML(t('est.lomo') + ': ' + estLomoText(col.lomo, col.banda))}</small></span>
        <span class="est-mc-n"><span class="code-chip" style="--plat:${pv.color}">${escapeHTML(pv.code)}</span>${estPlatProducts(pl.id).length}</span>${icon('chevronRight')}</button>`;
    }).join('');
    return `<details class="disclosure est-mc-cat" data-cat="${escapeHTML(c.id)}" ${i===0 ? 'open' : ''}><summary>${icon('chevronRight','chev')}<span>${escapeHTML(c.name)}</span><span class="sum-meta">${escapeHTML(t('est.mc_meta').replace('{p}', plats.length).replace('{n}', n))}</span></summary>
      <div class="disclosure-body"><div class="quick-actions is-flush"><button type="button" class="btn btn-sm" onclick="openEstCatSheet('${escapeHTML(c.id)}')">${icon('layers')} ${t('est.cat_all')}</button></div>
        <div class="est-mc-list">${rows}</div></div></details>`;
  }).join('');
}

/* ---------- Editor de color (de una plataforma o de una pieza) ---------- */
let estPS = null;   // plataforma: { pl, w, h, d, src, lomo, banda, own, touched }
let estPCid = null; // pieza
function estColorState(scope){
  if(scope==='plat') return { lomo: estPS.lomo, banda: estPS.banda, inherit:false };
  if(scope==='multi') return { lomo: estMC.lomo, banda: estMC.banda, inherit:true };
  const pc = estColors().piezas[estPCid] || {};
  return { lomo: pc.lomo, banda: pc.banda, inherit:true };
}
function estColorEditorHTML(scope){
  const st = estColorState(scope);
  const mode = st.lomo===undefined ? 'inherit' : st.lomo==='app' ? 'app' : EST_HEX.test(String(st.lomo)) ? 'color' : 'portada';
  const modes = (scope!=='plat' ? [['inherit', 'est.as_platform_s']] : []).concat([['portada', 'est.lomo_cover_s'], ['color', 'est.lomo_color'], ['app', 'est.lomo_app_s']]);
  const seg = (list, cur, fn)=> list.map(([k, key])=>`<button type="button" class="seg-btn ${cur===k ? 'active' : ''}" aria-pressed="${cur===k}" data-fk="ce-${fn}-${k}" onclick="estCE('${scope}','${fn}','${k}')">${t(key)}</button>`).join('');
  const sw = (part, cur)=> EST_SWATCHES.map(([hex, k])=>`<button type="button" class="est-swatch${String(cur || '').toLowerCase()===hex ? ' active' : ''}" style="--sw:${hex}" aria-pressed="${String(cur || '').toLowerCase()===hex}" aria-label="${escapeHTML(t('est.sw.' + k))}" title="${escapeHTML(t('est.sw.' + k))}" data-fk="sw-${part}-${k}" onclick="estCE('${scope}','${part}','${hex}')"></button>`).join('')
    + `<label class="est-swatch is-other" title="${escapeHTML(t('est.sw_other'))}"><input type="color" value="${EST_HEX.test(String(cur || '')) ? cur : '#888888'}" aria-label="${escapeHTML(t('est.sw_other'))}" onchange="estCE('${scope}','${part}', this.value)"><span aria-hidden="true">${icon('plus')}</span></label>`;
  const notes = { inherit: t('est.lomo_note_inherit'), portada: t('est.lomo_note_cover'), color: t('est.lomo_note_color'), app: t('est.lomo_note_app') };
  const pickFrom = scope==='piece' ? estPCid : scope==='multi' ? (estMultiProducts().find(p=> hasPhoto(shownPhotoId(p), 'front')) || {}).id : (estPlatProducts(estPS.pl).find(p=> hasPhoto(shownPhotoId(p), 'front')) || {}).id;
  const pick = pickFrom ? `<button type="button" class="btn btn-sm" onclick="estPickOpen('${escapeHTML(pickFrom)}','${scope}')">${icon('pipette')} ${t('est.pick')}</button>` : '';
  const bandMode = st.banda===undefined ? 'inherit' : st.banda ? 'on' : 'off';
  const band = scope!=='plat'
    ? `<div class="segmented" role="group" aria-label="${escapeHTML(t('est.band'))}">${seg([['inherit', 'est.as_platform_s'], ['off', 'est.band_off'], ['on', 'est.band_on']], bandMode, 'band')}</div>`
    : `<label class="check-item est-band-check"><span class="check-label">${t('est.band')}<small>${t('est.band_hint')}</small></span><input type="checkbox" role="switch" data-fk="ce-band-chk" ${st.banda ? 'checked' : ''} onchange="estCE('plat','band', this.checked ? 'on' : 'off')"></label>`;
  return `<div class="segmented est-ce-modes${modes.length===4 ? ' is-4' : ''}" role="group" aria-label="${escapeHTML(t('est.lomo'))}">${seg(modes, mode, 'mode')}</div>
    <p class="settings-note">${notes[mode]}</p>
    ${mode==='color' ? `<div class="est-swatches" role="group" aria-label="${escapeHTML(t('est.lomo_color'))}">${sw('lomo', st.lomo)}</div>` : ''}
    <div class="quick-actions is-flush">${pick}</div>
    ${scope!=='plat' ? `<div class="field-label est-sel-lbl">${t('est.band')}</div>` : ''}
    ${band}
    ${st.banda ? `<div class="est-swatches is-sm" role="group" aria-label="${escapeHTML(t('est.band'))}">${sw('banda', st.banda)}</div>` : ''}
    <p class="settings-note">${t('est.lomo_text_note')}</p>`;
}
/* Un cambio en el editor de color */
function estCE(scope, what, v){
  if(scope==='plat'){
    const S = estPS; if(!S) return;
    if(what==='mode') S.lomo = v==='color' ? (EST_HEX.test(String(S.lomo)) ? S.lomo : EST_SWATCHES[0][0]) : v;
    else if(what==='lomo') S.lomo = v;
    else if(what==='band') S.banda = v==='on' ? (S.banda || EST_SWATCHES[0][0]) : '';
    else if(what==='banda') S.banda = v;
    estPlatRefresh(true);
    return;
  }
  if(scope==='multi'){
    const S = estMC; if(!S) return;
    if(what==='mode') S.lomo = v==='inherit' ? undefined : v==='color' ? (EST_HEX.test(String(S.lomo)) ? S.lomo : EST_SWATCHES[0][0]) : v;
    else if(what==='lomo') S.lomo = v;
    else if(what==='band') S.banda = v==='inherit' ? undefined : v==='on' ? (S.banda || EST_SWATCHES[0][0]) : '';
    else if(what==='banda') S.banda = v;
    estMultiColorRefresh();
    return;
  }
  const pid = estPCid; const p = PRODUCTS_BY_ID[pid]; if(!p) return;
  const cur = estColors().piezas[pid] || {};
  if(what==='mode') estSetColor('piece', pid, 'lomo', v==='inherit' ? undefined : v==='color' ? (EST_HEX.test(String(cur.lomo)) ? cur.lomo : (estLomo(p).color || EST_SWATCHES[0][0])) : v);
  else if(what==='lomo') estSetColor('piece', pid, 'lomo', v);
  else if(what==='band') estSetColor('piece', pid, 'banda', v==='inherit' ? undefined : v==='on' ? (cur.banda || estLomo(p).banda || EST_SWATCHES[0][0]) : '');
  else if(what==='banda') estSetColor('piece', pid, 'banda', v);
  estSave(); estDraw(); estRefreshPanel();
  estPieceColorRefresh();
}
/* Repinta una parte de la hoja sin perder el foco */
function estSheetPart(id, html){
  const el = document.getElementById(id); if(!el) return;
  const a = document.activeElement, fk = a && el.contains(a) && a.dataset ? a.dataset.fk : null;
  el.innerHTML = html;
  if(fk){ const b = el.querySelector(`[data-fk="${CSS.escape(fk)}"]`); if(b) b.focus({ preventScroll:true }); }
}

/* ---------- Hoja: una plataforma entera ---------- */
function openEstPlatSheet(plId, keep){
  const pl = getAllPlatforms().find(x=>x.id===plId); if(!pl) return;
  if(!keep || !estPS || estPS.pl!==plId){
    const d = estPlatDims(plId), col = estColors().plataformas[plId] || {};
    estPS = { pl:plId, w:d.w, h:d.h, d:d.d, src:d.src, lomo: col.lomo || 'portada', banda: col.banda || '', own:'keep', touched:false };
  }
  const n = estPlatProducts(plId).length;
  openSheet({ kind:'est-plat', title:pl.name, body:estPlatBodyHTML(), focus:'#estPsH',
    foot:`<button type="button" class="btn" onclick="openEstMedCol()">${t('modal.cancel')}</button><button type="button" class="btn primary" onclick="estPlatSave()">${escapeHTML(t('est.save_for_n').replace('{n}', n))}</button>` });
  estHydratePhotos(document.getElementById('sheetBody'));
}
function estPlatBodyHTML(){
  const S = estPS;
  const own = estPlatProducts(S.pl).filter(p=> medidasValidas(p.medidas));
  const f = (k, label, hint)=> `<div class="field"><label for="estPs${k.toUpperCase()}">${label}<small class="est-field-hint">${hint}</small></label><input id="estPs${k.toUpperCase()}" type="number" inputmode="decimal" step="0.1" min="0.1" max="400" value="${S[k]}" data-nosave oninput="estPsDim('${k}', this)"></div>`;
  return `<div class="est-ms-prev" id="estPsPrev">${estPlatPrevHTML()}</div>
    <div class="field-label">${t('est.ps_dims')}</div>
    <div class="dims-grid est-ps-dims">${f('h', t('est.height'), t('est.height_hint'))}${f('d', t('est.thick'), t('est.thick_hint'))}${f('w', t('dims.w').replace(/\s*\(.*\)$/, ''), t('est.width_hint'))}</div>
    <p class="settings-note" id="estPsNote">${t(S.src==='platform' ? 'est.ps_note_own' : 'est.ps_note_std')}</p>
    ${S.src==='platform' ? `<div class="quick-actions is-flush"><button type="button" class="btn btn-sm btn-ghost" onclick="estPsReset()">${icon('undo')} ${t('est.ps_reset')}</button></div>` : ''}
    ${own.length ? `<div class="est-ps-own"><p>${escapeHTML(t('est.ps_own').replace('{n}', own.length))}</p>
      <div class="segmented" role="group" aria-label="${escapeHTML(t('est.ps_own').replace('{n}', own.length))}">
        <button type="button" class="seg-btn ${S.own==='keep' ? 'active' : ''}" aria-pressed="${S.own==='keep'}" data-fk="ps-own-keep" onclick="estPS.own='keep'; estPlatRefreshOwn()">${t('est.ps_own_keep')}</button>
        <button type="button" class="seg-btn ${S.own==='use' ? 'active' : ''}" aria-pressed="${S.own==='use'}" data-fk="ps-own-use" onclick="estPS.own='use'; estPlatRefreshOwn()">${t('est.ps_own_use')}</button></div></div>` : ''}
    <div class="field-label">${t('est.lomo_color_t')}</div>
    <div id="estPsColor">${estColorEditorHTML('plat')}</div>`;
}
/* Cómo quedan (hasta 16 de esa plataforma, con estas medidas y este color) */
function estPlatPrevHTML(){
  const S = estPS;
  const list = estPlatProducts(S.pl).slice().sort((a, b)=> (a.possession==='tengo' ? 0 : 1) - (b.possession==='tengo' ? 0 : 1)).slice(0, 16);
  const s = Math.min(9, 150 / Math.max(10, S.h));
  const color = S.lomo==='app' ? platVisual(S.pl).color : EST_HEX.test(String(S.lomo)) ? S.lomo : null;
  const h = S.h * s, w = Math.max(3, S.d * s);
  const bh = S.banda ? estBandPx(h, s) : 0;
  const pv = platVisual(S.pl);
  return `<div class="est-ms-shelf" aria-hidden="true">${list.map(p=>{
    const miss = p.possession!=='tengo';
    const style = miss ? '' : color ? `background-color:${color};` : '';
    const cls = miss ? ' is-ghost' : color ? ` has-avg is-custom${estLum(color) > 0.62 ? ' is-light' : ''}` : '';
    const attrs = miss || color ? '' : estPh(p, 'front', true);
    return `<span class="est-sp is-spine${cls}"${attrs} style="--plat:${pv.color};${style}position:relative;width:${w.toFixed(1)}px;height:${h.toFixed(1)}px">${miss ? '' : estBandHTML(S.banda, bh, false) + estSpineLabel(p, w, h - bh, false, bh / 2)}</span>`;
  }).join('')}</div><p class="est-ms-cap">${escapeHTML(t('est.ps_prev').replace('{d}', estDimsText(S)))}</p>`;
}
function estPlatRefresh(color){
  estSheetPart('estPsPrev', estPlatPrevHTML());
  if(color) estSheetPart('estPsColor', estColorEditorHTML('plat'));
  estHydratePhotos(document.getElementById('sheetBody') || document.body);
}
function estPlatRefreshOwn(){
  const a = document.activeElement, fk = a && a.dataset ? a.dataset.fk : null;
  const y = (document.getElementById('sheetBody') || {}).scrollTop || 0;
  updateSheetBody(estPlatBodyHTML());
  const b = document.getElementById('sheetBody'); if(b) b.scrollTop = y;
  if(fk && b){ const el = b.querySelector(`[data-fk="${CSS.escape(fk)}"]`); if(el) el.focus({ preventScroll:true }); }
  estHydratePhotos(b);
}
function estPsDim(k, el){
  const v = Number(String(el.value).replace(',', '.'));
  if(!(isFinite(v) && v > 0 && v <= 400)){ el.setAttribute('aria-invalid', 'true'); return; }
  el.removeAttribute('aria-invalid');
  estPS[k] = Math.round(v * 10) / 10; estPS.touched = true;
  estPlatRefresh(false);
}
function estPsReset(){
  const S = estPS;
  const E = estData(), keep = E.medidasPlataforma[S.pl];
  delete E.medidasPlataforma[S.pl];
  const d = estPlatDims(S.pl);
  if(keep) E.medidasPlataforma[S.pl] = keep;   // (se quita de verdad al guardar)
  Object.assign(S, { w:d.w, h:d.h, d:d.d, touched:'reset' });
  ['h', 'd', 'w'].forEach(k=>{ const el = document.getElementById('estPs' + k.toUpperCase()); if(el){ el.value = S[k]; el.removeAttribute('aria-invalid'); } });
  const note = document.getElementById('estPsNote'); if(note) note.textContent = t('est.ps_note_std');
  estPlatRefresh(false);
}
async function estPlatSave(){
  const S = estPS; if(!S) return;
  const bad = ['h', 'd', 'w'].find(k=>{ const el = document.getElementById('estPs' + k.toUpperCase()); return el && el.getAttribute('aria-invalid')==='true'; });
  if(bad){ document.getElementById('estPs' + bad.toUpperCase()).focus(); return; }
  const E = estEnsure(), C = estEnsureColors();
  const before = { mp: E.medidasPlataforma[S.pl] ? Object.assign({}, E.medidasPlataforma[S.pl]) : null, col: C.plataformas[S.pl] ? Object.assign({}, C.plataformas[S.pl]) : null, own: [] };
  if(S.touched==='reset') delete E.medidasPlataforma[S.pl];
  else if(S.touched) E.medidasPlataforma[S.pl] = { ancho:S.w, alto:S.h, fondo:S.d };
  if(S.own==='use') estPlatProducts(S.pl).filter(p=> medidasValidas(p.medidas)).forEach(p=>{ before.own.push([p.id, p.medidas]); estSetOwnDims(p, null); });
  estSetColor('plat', S.pl, 'lomo', S.lomo==='portada' ? undefined : S.lomo);
  estSetColor('plat', S.pl, 'banda', S.banda ? S.banda : undefined);
  await estSave(true);
  const name = (getAllPlatforms().find(x=>x.id===S.pl) || {}).name || '';
  estPS = null;
  openEstMedCol();
  estRefresh();
  showToast(t('est.saved_for').replace('{p}', name), { ok:true, replace:true, duration:6000, action:{ label:t('common.undo'), fn: async ()=>{
    const E2 = estEnsure(), C2 = estEnsureColors();
    if(before.mp) E2.medidasPlataforma[S.pl] = before.mp; else delete E2.medidasPlataforma[S.pl];
    if(before.col) C2.plataformas[S.pl] = before.col; else delete C2.plataformas[S.pl];
    before.own.forEach(([id, m])=>{ const p = PRODUCTS_BY_ID[id]; if(p) estSetOwnDims(p, m); });
    await estSave(true); estRefresh();
    if(isSheetKind('est-medcol')) updateSheetBody(estMedColBodyHTML());
  } } });
}
/* Las medidas propias de una pieza (null = las de su plataforma) */
function estSetOwnDims(p, m){
  p.medidas = m;
  if(!OVERRIDES.products[p.id]) OVERRIDES.products[p.id] = {};
  OVERRIDES.products[p.id].medidas = m;
}

/* ---------- Hoja: toda una categoría (varias plataformas a la vez) ---------- */
let estCS = null;
function openEstCatSheet(catId){
  const cat = getAllCategories().find(c=>c.id===catId); if(!cat) return;
  const plats = estCatPlats(catId);
  estCS = { cat:catId, sel:new Set(plats.map(p=>p.id)), on:{ h:false, d:false, w:false }, v:{ h:'', d:'', w:'' }, lomo:'keep', color:EST_SWATCHES[0][0], own:false };
  openSheet({ kind:'est-cat', title:t('est.cat_title').replace('{c}', cat.name), body:estCatBodyHTML(),
    foot:`<button type="button" class="btn" onclick="openEstMedCol()">${t('modal.cancel')}</button><button type="button" class="btn primary" id="estCsApply" onclick="estCatApply()">${t('est.apply')}</button>` });
  estCatRefresh();
}
function estCatPlatsHTML(){
  const S = estCS;
  return estCatPlats(S.cat).map(pl=>{ const on = S.sel.has(pl.id), pv = platVisual(pl.id);
    return `<button type="button" class="chip est-cs-chip ${on ? 'active' : ''}" aria-pressed="${on}" data-fk="cs-${escapeHTML(pl.id)}" onclick="estCsToggle('${pl.id}')"><span class="chip-sw" style="--plat:${pv.color}" aria-hidden="true">${escapeHTML(pv.code)}</span>${escapeHTML(pl.name)} <span class="chip-count">${estPlatProducts(pl.id).length}</span></button>`; }).join('');
}
function estCatBodyHTML(){
  const S = estCS;
  const dim = (k, label, hint)=> `<div class="est-cs-dim"><label class="est-cs-sw"><input type="checkbox" role="switch" ${S.on[k] ? 'checked' : ''} onchange="estCsOn('${k}', this.checked)"><span>${label}<small>${hint}</small></span></label>
    <input id="estCs${k.toUpperCase()}" class="input" type="number" inputmode="decimal" step="0.1" min="0.1" max="400" value="${S.v[k]}" placeholder="${escapeHTML(t('est.no_change'))}" aria-label="${escapeHTML(label + ' (cm)')}" ${S.on[k] ? '' : 'disabled'} data-nosave oninput="estCsVal('${k}', this)"><span class="est-cs-u" aria-hidden="true">cm</span></div>`;
  const modes = [['keep', 'est.no_change'], ['portada', 'est.lomo_cover_s'], ['color', 'est.lomo_color'], ['app', 'est.lomo_app_s']];
  return `<p class="settings-note">${t('est.cat_note')}</p>
    <div class="sheet-group"><div class="est-cs-head"><span class="field-label">${t('est.apply_to')}</span><button type="button" class="link-btn" onclick="estCsAll(true)">${t('est.all')}</button><button type="button" class="link-btn" onclick="estCsAll(false)">${t('est.none')}</button></div>
      <div class="chip-row" id="estCsPlats" role="group" aria-label="${escapeHTML(t('est.apply_to'))}">${estCatPlatsHTML()}</div></div>
    <div class="sheet-group"><div class="field-label">${t('est.ps_dims')}</div>
      ${dim('h', t('est.height'), t('est.height_hint'))}${dim('d', t('est.thick'), t('est.thick_hint'))}${dim('w', t('dims.w').replace(/\s*\(.*\)$/, ''), t('est.width_hint'))}
      <label class="check-item"><span class="check-label" id="estCsOwnL">${t('est.cat_own')}</span><input type="checkbox" ${S.own ? 'checked' : ''} onchange="estCS.own=this.checked; estCatRefresh()"></label></div>
    <div class="sheet-group"><div class="field-label">${t('est.lomo_color_t')}</div>
      <div class="chip-row" role="group" aria-label="${escapeHTML(t('est.lomo_color_t'))}" id="estCsModes">${modes.map(([k, key])=>`<button type="button" class="chip ${S.lomo===k ? 'active' : ''}" aria-pressed="${S.lomo===k}" data-fk="csm-${k}" onclick="estCsMode('${k}')">${t(key)}</button>`).join('')}</div>
      <div id="estCsSw">${estCsSwHTML()}</div>
      <p class="settings-note">${t('est.cat_band_note')}</p></div>
    <div class="est-cs-sum" role="status" id="estCsSum"></div>`;
}
function estCsSwHTML(){
  const S = estCS; if(S.lomo!=='color') return '';
  return `<div class="est-swatches">${EST_SWATCHES.map(([hex, k])=>`<button type="button" class="est-swatch${S.color===hex ? ' active' : ''}" style="--sw:${hex}" aria-pressed="${S.color===hex}" aria-label="${escapeHTML(t('est.sw.' + k))}" title="${escapeHTML(t('est.sw.' + k))}" data-fk="css-${k}" onclick="estCS.color='${hex}'; estCsMode('color')"></button>`).join('')}
    <label class="est-swatch is-other" title="${escapeHTML(t('est.sw_other'))}"><input type="color" value="${S.color}" aria-label="${escapeHTML(t('est.sw_other'))}" onchange="estCS.color=this.value; estCsMode('color')"><span aria-hidden="true">${icon('plus')}</span></label></div>`;
}
function estCsToggle(pl){ const S = estCS; if(S.sel.has(pl)) S.sel.delete(pl); else S.sel.add(pl); estSheetPart('estCsPlats', estCatPlatsHTML()); estCatRefresh(); }
function estCsAll(on){ const S = estCS; S.sel = new Set(on ? estCatPlats(S.cat).map(p=>p.id) : []); estSheetPart('estCsPlats', estCatPlatsHTML()); estCatRefresh(); }
function estCsMode(k){
  estCS.lomo = k;
  estSheetPart('estCsModes', [['keep', 'est.no_change'], ['portada', 'est.lomo_cover_s'], ['color', 'est.lomo_color'], ['app', 'est.lomo_app_s']].map(([m, key])=>`<button type="button" class="chip ${k===m ? 'active' : ''}" aria-pressed="${k===m}" data-fk="csm-${m}" onclick="estCsMode('${m}')">${t(key)}</button>`).join(''));
  estSheetPart('estCsSw', estCsSwHTML());
  estCatRefresh();
}
function estCsOn(k, on){
  const S = estCS; S.on[k] = on;
  const el = document.getElementById('estCs' + k.toUpperCase());
  if(el){
    el.disabled = !on;
    // al activarla, empieza con la medida de la primera plataforma elegida
    if(on && !S.v[k]){ const first = [...S.sel][0] || (estCatPlats(S.cat)[0] || {}).id; if(first){ const d = estPlatDims(first); S.v[k] = d[k]; el.value = d[k]; } }
    if(on) el.focus();
  }
  estCatRefresh();
}
function estCsVal(k, el){
  const v = Number(String(el.value).replace(',', '.'));
  if(el.value!=='' && !(isFinite(v) && v > 0 && v <= 400)){ el.setAttribute('aria-invalid', 'true'); estCS.v[k] = ''; }
  else { el.removeAttribute('aria-invalid'); estCS.v[k] = el.value==='' ? '' : Math.round(v * 10) / 10; }
  estCatRefresh();
}
/* Lo que va a cambiar (para el resumen y el botón) */
function estCatPlan(){
  const S = estCS;
  const dims = ['h', 'd', 'w'].filter(k=> S.on[k] && S.v[k]!=='');
  const pieces = PRODUCTS.filter(p=> S.sel.has(p.platformId));
  const own = dims.length ? pieces.filter(p=> medidasValidas(p.medidas)).length : 0;
  return { dims, pieces: pieces.length, own, plats: S.sel.size, color: S.lomo!=='keep', badDim: ['h', 'd', 'w'].some(k=> S.on[k] && S.v[k]==='') };
}
function estCatRefresh(){
  const S = estCS; if(!S) return;
  const P = estCatPlan();
  const sum = document.getElementById('estCsSum'), btn = document.getElementById('estCsApply');
  const own = document.getElementById('estCsOwnL');
  if(own) own.textContent = P.own ? t('est.cat_own_n').replace('{n}', P.own) : t('est.cat_own');
  const nothing = !P.plats || (!P.dims.length && !P.color);
  if(sum){
    const parts = [];
    const lbl = { h:t('est.height'), d:t('est.thick'), w:t('dims.w').replace(/\s*\(.*\)$/, '') };
    P.dims.forEach(k=> parts.push(lbl[k].toLowerCase() + ' ' + fmtCm(S.v[k]) + ' cm'));
    if(P.color) parts.push(t('est.lomo').toLowerCase() + ' ' + (S.lomo==='color' ? estColorName(S.color) : S.lomo==='app' ? t('est.lomo_app') : t('est.lomo_cover')));
    sum.textContent = !P.plats ? t('est.cat_pick_one') : nothing ? t('est.cat_pick_what')
      : t('est.cat_sum').replace('{n}', P.pieces).replace('{p}', P.plats).replace('{w}', parts.join(', ')) + (P.own && !S.own ? ' ' + t('est.cat_sum_own').replace('{n}', P.own) : '') + ' ' + t('est.can_undo');
    sum.classList.toggle('is-ok', !nothing);
  }
  if(btn){ btn.disabled = nothing || P.badDim; btn.textContent = nothing ? t('est.apply') : t('est.apply_n').replace('{n}', P.pieces); }
}
async function estCatApply(){
  const S = estCS; if(!S) return;
  const P = estCatPlan(); if(!P.plats || (!P.dims.length && !P.color) || P.badDim) return;
  const E = estEnsure(), C = estEnsureColors();
  const before = { mp:{}, cp:{}, own: [] };
  [...S.sel].forEach(pl=>{ before.mp[pl] = E.medidasPlataforma[pl] ? Object.assign({}, E.medidasPlataforma[pl]) : null; before.cp[pl] = C.plataformas[pl] ? Object.assign({}, C.plataformas[pl]) : null; });
  const key = { h:'alto', d:'fondo', w:'ancho' };
  [...S.sel].forEach(pl=>{
    if(P.dims.length){
      const cur = estPlatDims(pl);
      const m = { ancho:cur.w, alto:cur.h, fondo:cur.d };
      P.dims.forEach(k=>{ m[key[k]] = S.v[k]; });
      E.medidasPlataforma[pl] = m;
    }
    if(P.color) estSetColor('plat', pl, 'lomo', S.lomo==='portada' ? undefined : S.lomo==='app' ? 'app' : S.color);
  });
  if(P.dims.length && S.own) PRODUCTS.filter(p=> S.sel.has(p.platformId) && medidasValidas(p.medidas)).forEach(p=>{
    before.own.push([p.id, p.medidas]);
    const m = Object.assign({}, p.medidas); P.dims.forEach(k=>{ m[key[k]] = S.v[k]; });
    estSetOwnDims(p, m);
  });
  await estSave(true);
  estCS = null;
  openEstMedCol();
  estRefresh();
  showToast(t('est.cat_done').replace('{n}', P.pieces), { ok:true, replace:true, duration:7000, action:{ label:t('common.undo'), fn: async ()=>{
    const E2 = estEnsure(), C2 = estEnsureColors();
    Object.keys(before.mp).forEach(pl=>{ if(before.mp[pl]) E2.medidasPlataforma[pl] = before.mp[pl]; else delete E2.medidasPlataforma[pl]; });
    Object.keys(before.cp).forEach(pl=>{ if(before.cp[pl]) C2.plataformas[pl] = before.cp[pl]; else delete C2.plataformas[pl]; });
    before.own.forEach(([id, m])=>{ const p = PRODUCTS_BY_ID[id]; if(p) estSetOwnDims(p, m); });
    await estSave(true); estRefresh();
    if(isSheetKind('est-medcol')) updateSheetBody(estMedColBodyHTML());
  } } });
}

/* ---------- Hoja: el color del lomo de una pieza ---------- */
function openEstPieceColor(pid){
  const p = PRODUCTS_BY_ID[pid]; if(!p) return;
  estPCid = pid;
  const photoNote = p.possession==='tengo' && hasPhoto(shownPhotoId(p), 'lomo') ? `<p class="settings-note est-photo-note">${icon('camera')} ${t('est.lomo_photo_note')}</p>` : '';
  openSheet({ kind:'est-pcolor', title:t('est.lomo') + ' · ' + p.name, body:`${photoNote}<div class="est-pc-prev" id="estPcPrev">${estPieceColorPrevHTML()}</div><div id="estPcEd">${estColorEditorHTML('piece')}</div>`,
    foot:`<button type="button" class="btn primary" onclick="closeSheet()">${t('copy.done')}</button>` });
  estHydratePhotos(document.getElementById('sheetBody'));
}
function estPieceColorPrevHTML(){
  const p = PRODUCTS_BY_ID[estPCid]; if(!p) return '';
  const d = piezaDims(p), s = Math.min(12, 170 / Math.max(10, d.h));
  const h = d.h * s, w = Math.max(14, d.d * s * 1.6);
  const f = estSpineFill(p), bh = f.band ? estBandPx(h, s) : 0;
  return `<div class="est-ms-shelf is-one" aria-hidden="true"><span class="est-sp is-spine${f.cls}"${f.attrs} style="--plat:${platVisual(p.platformId).color};${f.style}position:relative;width:${w.toFixed(1)}px;height:${h.toFixed(1)}px">${estBandHTML(f.band, bh, false)}${estSpineLabel(p, w, h - bh, false, bh / 2)}</span></div>
    <p class="est-ms-cap">${escapeHTML(t('est.lomo') + ': ' + estLomoDesc(p))}</p>`;
}
function estPieceColorRefresh(){
  if(!isSheetKind('est-pcolor')) return;
  estSheetPart('estPcPrev', estPieceColorPrevHTML());
  estSheetPart('estPcEd', estColorEditorHTML('piece'));
  estHydratePhotos(document.getElementById('sheetBody'));
}

/* ---------- Hoja: las fotos de los lados (v11.14) ----------
   Arriba, la caja con sus fotos vista desde dos lados; debajo, los 4 huecos
   (lomo, lado contrario, arriba, abajo). Lo que añades o quitas se ve al
   momento en la caja y en la estantería. Son de la copia que se ve. */
let estSPid = null;
function openEstSidePhotos(pid){
  const p = PRODUCTS_BY_ID[pid]; if(!p) return;
  estSPid = pid;
  openSheet({ kind:'est-sides', title:t('est.side_photos') + ' · ' + p.name, body:estSidesBodyHTML(),
    foot:`<button type="button" class="btn primary" onclick="closeSheet()">${t('copy.done')}</button>`,
    onClose: ()=>{ const a = document.activeElement; if(a && a!==document.body && document.contains(a)) return; const b = document.querySelector('#estPanel [data-fk="sides"]'); if(b) b.focus({ preventScroll:true }); } });
  estSidesHydrate();
}
function estSidesBodyHTML(){
  const p = PRODUCTS_BY_ID[estSPid]; if(!p) return '';
  const ph = shownPhotoId(p), c = ph!==p.id ? copyForPhotoId(ph) : null;
  return `${estSidesPreviewHTML(p)}${c ? `<p class="settings-note">${escapeHTML(t('est.sides_copy').replace('{n}', c.n))}</p>` : ''}${sidePhotosHTML(p, ph, 'est')}`;
}
/* La caja con sus fotos, por delante (portada, lomo y arriba) y por detrás (contraportada, lado contrario y abajo) */
function estSidesPreviewHTML(p){
  const d0 = piezaDims(p), S = 118 / Math.max(d0.w, d0.h, 0.1);
  const w = d0.w * S, h = d0.h * S, d = Math.max(3, d0.d * S), pv = platVisual(p.platformId);
  const arT = d0.d / Math.max(0.1, d0.h), arW = d0.w / Math.max(0.1, d0.d);
  const fill = estSpineFill(p, { ar: arT }), bh = fill.band ? estBandPx(h, S) : 0;
  const faces = estFace(w, h, `translateZ(${(d / 2).toFixed(1)}px)`, 'est-pc is-front', '', `<span class="est-cover-txt"><b>${escapeHTML(pv.code)}</b>${escapeHTML(p.name)}</span>`, estPh(p, 'front'))
    + estFace(w, h, `rotateY(180deg) translateZ(${(d / 2).toFixed(1)}px)`, 'est-pc is-back', '', '', estPh(p, 'back'))
    + estFace(d, h, `rotateY(-90deg) translateZ(${(w / 2).toFixed(1)}px)`, 'est-pc is-spine' + fill.cls, fill.style, estBandHTML(fill.band, bh, false) + estSpineLabel(p, d, h - bh, false, bh / 2), fill.attrs)
    + estFace(d, h, `rotateY(90deg) translateZ(${(w / 2).toFixed(1)}px)`, 'est-pc is-edge', '', '', estSidePh(p, 'canto', arT))
    + estFace(w, d, `rotateX(90deg) translateZ(${(h / 2).toFixed(1)}px)`, 'est-pc is-top', '', '', estSidePh(p, 'arriba', arW))
    + estFace(w, d, `rotateX(-90deg) translateZ(${(h / 2).toFixed(1)}px)`, 'est-pc is-top is-bottom', '', '', estSidePh(p, 'abajo', arW));
  const box = (tf, cap)=> `<figure class="est-sides-box"><div class="est-sides-stage"><div class="est-sides-obj" style="--plat:${pv.color};transform:${tf}">${faces}</div></div><figcaption>${escapeHTML(cap)}</figcaption></figure>`;
  return `<div class="est-sides-prev" aria-hidden="true">${box('rotateX(-16deg) rotateY(36deg)', t('est.sides_front'))}${box('rotateX(16deg) rotateY(216deg)', t('est.sides_back'))}</div>`;
}
function estSidesHydrate(){
  const b = document.getElementById('sheetBody'); if(!b) return;
  estHydratePhotos(b);
  if(typeof hydratePhotos==='function') hydratePhotos(b);
}
function estSidesRefresh(){
  if(!isSheetKind('est-sides')) return;
  updateSheetBody(estSidesBodyHTML());
  estSidesHydrate();
}
async function estSidePhotoChange(input, key){
  const file = input.files[0]; input.value = '';
  if(!file) return;
  const label = input.closest('label'); if(label) label.classList.add('is-busy');
  const ok = await savePhotoFile(key, file);
  if(!ok){ if(label) label.classList.remove('is-busy'); return; }
  showToast(t('photo.saved'), { ok:true, replace:true });
  estSidesRefresh(); estRefresh();
  const side = key.slice(key.lastIndexOf('_') + 1);
  const b = document.querySelector(`#sheetBody [data-fk="sd-${CSS.escape(side)}"]`); if(b) b.focus({ preventScroll:true });
  const info = parsePhotoKey(key);
  if(info && typeof autoBarcodeFromFile==='function') autoBarcodeFromFile(info.id, file);   // como en la ficha: ¿se ve un código?
}
async function estSidePhotoRemove(key){
  if(!key) return;
  if(!await showConfirmModal(t('photo.remove_confirm'), { danger:true, okLabel:t('photo.remove') })) return;
  await removePhoto(key);
  showToast(t('photo.removed'));
  estSidesRefresh(); estRefresh();
  const side = key.slice(key.lastIndexOf('_') + 1);
  const b = document.querySelector(`#sheetBody [data-fk="sd-add-${CSS.escape(side)}"] input`); if(b) b.focus({ preventScroll:true });
}

/* ---------- Hoja: tomar el color de una foto (cuentagotas) ---------- */
let estPick = null;
async function estPickOpen(pid, scope){
  const p = PRODUCTS_BY_ID[pid]; if(!p) return;
  const others = scope==='plat' ? estPlatProducts(p.platformId).filter(q=> hasPhoto(shownPhotoId(q), 'front')).map(q=>q.id)
    : scope==='multi' ? estMultiProducts().filter(q=> hasPhoto(shownPhotoId(q), 'front')).map(q=>q.id) : [pid];
  estPick = { pid, scope, part:'lomo', target: scope==='plat' ? 'plat' : 'piece', color:null, pt:null, others };
  const plat = getAllPlatforms().find(x=>x.id===p.platformId);
  const seg = (name, list, cur)=> `<div class="segmented" role="group" aria-label="${escapeHTML(t(name))}">${list.map(([k, label])=>`<button type="button" class="seg-btn ${cur===k ? 'active' : ''}" aria-pressed="${cur===k}" data-v="${k}" onclick="estPickSet('${name==='est.pick_part' ? 'part' : 'target'}','${k}', this)">${escapeHTML(label)}</button>`).join('')}</div>`;
  const body = `<p class="settings-note">${t('est.pick_note')}</p>
    <div class="est-pick"><div class="est-pick-wrap" id="estPickWrap"><canvas id="estPickCv" tabindex="0" aria-label="${escapeHTML(t('est.pick_canvas'))}"></canvas><span class="est-loupe" id="estPickLoupe" hidden></span></div>
      <p class="est-pick-who" id="estPickWho">${escapeHTML(p.name)}</p>
      ${others.length > 1 ? `<button type="button" class="btn btn-sm btn-ghost" onclick="estPickNext()">${icon('shuffle')} ${t('est.pick_other')}</button>` : ''}</div>
    <div class="est-pick-res"><span class="est-pick-sw" id="estPickSw" aria-hidden="true"></span><span id="estPickHex" aria-live="polite">${t('est.pick_none')}</span></div>
    <div class="field-label est-sel-lbl">${t('est.pick_part')}</div>
    ${seg('est.pick_part', [['lomo', t('est.pick_all')], ['banda', t('est.band')]], 'lomo')}
    ${scope==='piece' ? `<div class="field-label est-sel-lbl">${t('est.pick_for')}</div>${seg('est.pick_for', [['piece', t('est.pick_this')], ['plat', t('est.pick_plat').replace('{p}', plat ? plat.name : '')]], 'piece')}` : ''}`;
  openSheet({ kind:'est-pick', title:t('est.pick_title'), body, focus:'#estPickCv',
    foot:`<button type="button" class="btn" onclick="estPickBack()">${t('modal.cancel')}</button><button type="button" class="btn primary" id="estPickOk" disabled onclick="estPickUse()">${t('est.pick_use')}</button>` });
  await estPickLoad(pid);
}
async function estPickLoad(pid){
  const p = PRODUCTS_BY_ID[pid], cv = document.getElementById('estPickCv'); if(!p || !cv) return;
  estPick.pid = pid;
  const who = document.getElementById('estPickWho'); if(who) who.textContent = p.name;
  const ph = shownPhotoId(p);
  const r = hasPhoto(ph, 'front') ? await estTrimmedPhoto(ph, 'front', 'thumb') : null;
  const wrap = document.getElementById('estPickWrap');
  if(!r){ if(wrap) wrap.innerHTML = `<p class="section-sub">${t('est.pick_no_photo')}</p>`; return; }
  const img = await new Promise(res=>{ const i = new Image(); i.onload = ()=>res(i); i.onerror = ()=>res(null); i.src = r.url; });
  if(!img || !document.contains(cv)) return;
  const maxW = Math.min(300, (wrap ? wrap.clientWidth : 300) || 300), maxH = 300;
  const k = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight);
  const W = Math.max(40, Math.round(img.naturalWidth * k)), H = Math.max(40, Math.round(img.naturalHeight * k));
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px';
  const ctx = cv.getContext('2d', { willReadFrequently:true });
  ctx.drawImage(img, 0, 0, cv.width, cv.height);
  if(!cv.dataset.bound){
    cv.dataset.bound = '1';
    let down = false;
    const at = (e)=>{ const b = cv.getBoundingClientRect(); estPickAt(e.clientX - b.left, e.clientY - b.top); };
    cv.addEventListener('pointerdown', (e)=>{ down = true; try{ cv.setPointerCapture(e.pointerId); }catch(_){} at(e); });
    cv.addEventListener('pointermove', (e)=>{ if(down) at(e); });
    cv.addEventListener('pointerup', ()=>{ down = false; });
    cv.addEventListener('pointercancel', ()=>{ down = false; });
    cv.addEventListener('keydown', (e)=>{
      const mv = { ArrowLeft:[-6,0], ArrowRight:[6,0], ArrowUp:[0,-6], ArrowDown:[0,6] }[e.key]; if(!mv) return;
      e.preventDefault();
      const b = cv.getBoundingClientRect(), pt = estPick.pt || { x:b.width / 2, y:b.height / 2 };
      estPickAt(Math.min(b.width - 1, Math.max(0, pt.x + mv[0])), Math.min(b.height - 1, Math.max(0, pt.y + mv[1])));
    });
  }
  estPick.pt = null;
  const lp = document.getElementById('estPickLoupe'); if(lp) lp.hidden = true;
}
function estPickAt(x, y){
  const cv = document.getElementById('estPickCv'); if(!cv || !estPick) return;
  const k = cv.width / cv.getBoundingClientRect().width;
  const cx = Math.round(x * k), cy = Math.round(y * k), rr = Math.max(1, Math.round(2 * k));
  let d; try{ d = cv.getContext('2d', { willReadFrequently:true }).getImageData(Math.max(0, cx - rr), Math.max(0, cy - rr), rr * 2 + 1, rr * 2 + 1).data; }catch(e){ return; }
  let r = 0, g = 0, b = 0, n = 0; for(let i = 0; i < d.length; i += 4){ if(d[i + 3] < 10) continue; r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
  if(!n) return;
  const hex = '#' + [r, g, b].map(v=> Math.round(v / n).toString(16).padStart(2, '0')).join('');
  estPick.color = hex; estPick.pt = { x, y };
  const lp = document.getElementById('estPickLoupe');
  if(lp){ lp.hidden = false; lp.style.left = x + 'px'; lp.style.top = y + 'px'; lp.style.background = hex; lp.classList.toggle('is-light', estLum(hex) > 0.62); }
  const sw = document.getElementById('estPickSw'); if(sw) sw.style.background = hex;
  const hx = document.getElementById('estPickHex'); if(hx) hx.textContent = t('est.pick_got').replace('{c}', hex.toUpperCase());
  const ok = document.getElementById('estPickOk'); if(ok) ok.disabled = false;
}
function estPickNext(){
  if(!estPick || estPick.others.length < 2) return;
  const i = estPick.others.indexOf(estPick.pid);
  estPickLoad(estPick.others[(i + 1) % estPick.others.length]);
}
function estPickSet(k, v, el){
  if(!estPick) return;
  estPick[k] = v;
  if(el) el.parentElement.querySelectorAll('.seg-btn').forEach(b=>{ const on = b===el; b.classList.toggle('active', on); b.setAttribute('aria-pressed', String(on)); });
}
function estPickBack(){
  const P = estPick; estPick = null;
  if(P && P.scope==='multi') openEstMultiColor(true);
  else if(P && P.scope==='plat' && estPS) openEstPlatSheet(estPS.pl, true);
  else if(P && P.scope==='piece') openEstPieceColor(P.scope==='piece' ? estPCid || P.pid : P.pid);
  else closeSheet();
}
function estPickUse(){
  const P = estPick; if(!P || !P.color) return;
  if(P.scope==='multi' && estMC){
    if(P.part==='banda') estMC.banda = P.color; else estMC.lomo = P.color;
    estPick = null;
    openEstMultiColor(true);
    return;
  }
  if(P.scope==='plat' && estPS){
    if(P.part==='banda') estPS.banda = P.color; else estPS.lomo = P.color;
    estPick = null;
    openEstPlatSheet(estPS.pl, true);
    return;
  }
  const p = PRODUCTS_BY_ID[estPCid || P.pid]; if(!p){ closeSheet(); return; }
  if(P.target==='plat' && p.platformId) estSetColor('plat', p.platformId, P.part, P.color);
  else estSetColor('piece', p.id, P.part, P.color);
  estPick = null;
  estSave(); estDraw(); estRefreshPanel();
  openEstPieceColor(p.id);
}

/* =====================================================================
   10. CARPETAS (v11.12)
   ---------------------------------------------------------------------
   Para lo que casi no tiene grosor (códigos, postales, papeles): una
   carpeta con sus medidas ocupa su sitio en la balda como una pieza más;
   al tocarla se abre como un libro, una pieza por página.
   ===================================================================== */
let estFS = null;
function estSurfOptions(m, cur){
  return [['top', t('est.top')]].concat(m.baldas.map((b, i)=>[b.id, t('est.balda_n').replace('{n}', i + 1) + (estPlateText(b) ? ' · ' + estPlateText(b) : '')]))
    .map(([v, l])=>`<option value="${v}" ${v===cur ? 'selected' : ''}>${escapeHTML(l)}</option>`).join('');
}
function openEstFolderSheet(cid, sid, fromPid, morePids){
  const f = cid ? estFolder(cid) : null;
  const m = estMueble(estMid());
  if(f) estFS = { cid, nombre:f.nombre, ancho:f.ancho, alto:f.alto, fondo:f.fondo, color:f.color };
  else {
    const where = fromPid ? null : sid || (EST.view==='balda' && m ? estBsid(m) : (m && m.baldas[0] ? m.baldas[0].id : 'top'));
    estFS = { cid:null, sid:where, fromPid: fromPid || null, more: morePids || [], nombre:'', ancho:23, alto:31, fondo:3, color:EST_SWATCHES[4][0] };
  }
  const S = estFS;
  const num = (k, label, hint)=> `<div class="field"><label for="estFs_${k}">${label}<small class="est-field-hint">${hint}</small></label><input id="estFs_${k}" type="number" inputmode="decimal" step="0.1" min="${k==='fondo' ? 0.2 : 1}" max="${k==='fondo' ? 60 : 120}" value="${S[k]}" data-nosave oninput="this.removeAttribute('aria-invalid')"></div>`;
  const body = `${f ? '' : `<p class="settings-note">${t('est.folder_note')}</p>`}
    <div class="field"><label for="estFs_nombre">${t('est.folder_name')}</label><input id="estFs_nombre" type="text" maxlength="60" value="${escapeHTML(S.nombre)}" placeholder="${escapeHTML(t('est.folder_name_ph'))}" data-nosave></div>
    <div class="field-label">${t('est.folder_dims')}</div>
    <div class="dims-grid">${num('ancho', t('dims.w').replace(/\s*\(.*\)$/, ''), t('est.width_hint'))}${num('alto', t('est.height'), t('est.height_hint'))}${num('fondo', t('est.thick'), t('est.thick_hint'))}</div>
    <div class="field-label">${t('est.folder_color')}</div>
    <div class="est-swatches" id="estFsSw">${estFolderSwHTML()}</div>
    ${!f && !S.fromPid && m ? `<div class="field"><label for="estFs_sid">${t('est.folder_where')}</label><select id="estFs_sid" data-nosave>${estSurfOptions(m, S.sid)}<option value="" ${S.sid ? '' : 'selected'}>${escapeHTML(t('est.folder_unplaced'))}</option></select></div>` : ''}
    ${f ? `<div class="danger-zone"><button type="button" class="btn btn-danger btn-sm" onclick="estDeleteFolder('${cid}')">${icon('trash')} ${t('est.folder_delete')}</button></div>` : ''}`;
  openSheet({ kind:'est-folder', title: f ? t('est.folder_edit') + ' · ' + (f.nombre || t('est.folder_default')) : t('est.folder_new'), body, focus:'#estFs_nombre',
    foot:`<button type="button" class="btn" onclick="closeSheet()">${t('modal.cancel')}</button><button type="button" class="btn primary" onclick="estFolderSave()">${t(f ? 'est.folder_save' : 'est.folder_create')}</button>` });
}
function estFolderSwHTML(){
  const S = estFS;
  return EST_SWATCHES.map(([hex, k])=>`<button type="button" class="est-swatch${S.color===hex ? ' active' : ''}" style="--sw:${hex}" aria-pressed="${S.color===hex}" aria-label="${escapeHTML(t('est.sw.' + k))}" title="${escapeHTML(t('est.sw.' + k))}" data-fk="fs-${k}" onclick="estFS.color='${hex}'; estSheetPart('estFsSw', estFolderSwHTML())"></button>`).join('')
    + `<label class="est-swatch is-other" title="${escapeHTML(t('est.sw_other'))}"><input type="color" value="${S.color}" aria-label="${escapeHTML(t('est.sw_other'))}" onchange="estFS.color=this.value; estSheetPart('estFsSw', estFolderSwHTML())"><span aria-hidden="true">${icon('plus')}</span></label>`;
}
async function estFolderSave(){
  const S = estFS; if(!S) return;
  const LIM = { ancho:[1, 120], alto:[1, 120], fondo:[0.2, 60] };
  const read = (k)=>{ const el = document.getElementById('estFs_' + k); const v = el ? Number(String(el.value).replace(',', '.')) : NaN; return isFinite(v) && v >= LIM[k][0] && v <= LIM[k][1] ? Math.round(v * 10) / 10 : null; };
  const dims = { ancho:read('ancho'), alto:read('alto'), fondo:read('fondo') };
  const bad = Object.keys(dims).find(k=> dims[k]===null);
  if(bad){ const el = document.getElementById('estFs_' + bad); if(el){ el.setAttribute('aria-invalid', 'true'); el.focus(); } return; }
  const nameEl = document.getElementById('estFs_nombre');
  const nombre = String(nameEl ? nameEl.value : S.nombre).trim().slice(0, 60);
  if(S.cid){
    const f = estFolder(S.cid); if(!f) return;
    Object.assign(f, { nombre, color:S.color }, dims);
    estFS = null;
    closeSheet();
    estAfterEdit();
    return;
  }
  const fromMulti = !!(S.fromPid && S.more && S.more.length);
  const undo = fromMulti ? { est: JSON.stringify(OVERRIDES.estanterias), sel:[S.fromPid].concat(S.more) } : null;
  const F = estEnsureFolders();
  const cid = estUid('c');
  F[cid] = { id:cid, nombre, ancho:dims.ancho, alto:dims.alto, fondo:dims.fondo, color:S.color, pids:[] };
  const item = { pid:EST_FOLDER + cid };
  let placedAt = null;
  if(S.fromPid){
    // desde una pieza: la carpeta ocupa su sitio y la pieza va dentro
    const loc = estFind(S.fromPid);
    if(loc){
      estFreeze(loc.m, loc.sid);
      const sf = estSurface(loc.m, loc.sid), i = sf.items.findIndex(it=>it.pid===S.fromPid), it = sf.items[i];
      if(it.apilado) item.apilado = true;   // estaba encima de otra: la carpeta, también
      else { if(typeof it.x==='number') item.x = it.x; if(it.fila) item.fila = it.fila; }
      if(it.pose) item.pose = it.pose;
      const freed = estSpliceItem(sf, i);
      sf.items.splice(i, 0, item);
      if(freed){ freed.apilado = true; delete freed.x; delete freed.fila; }   // lo que tenía encima, sigue encima
      placedAt = { mid:loc.m.id, sid:loc.sid };
    }
    estUnplace(S.fromPid);
    F[cid].pids.push(S.fromPid);
    if(fromMulti){ estIntoFolder(cid, S.more); EST.multi = null; }
  } else {
    const sidEl = document.getElementById('estFs_sid');
    const sid = sidEl ? sidEl.value : S.sid;
    const m = estMueble(estMid()), sf = sid ? estSurface(m, sid) : null;
    if(sf){ sf.items.push(item); placedAt = { mid:m.id, sid }; }
  }
  estFS = null;
  if(placedAt){ EST.mid = placedAt.mid; EST.view = 'balda'; EST.bsid = placedAt.sid; EST.covers = false; EST.sel = { mid:placedAt.mid, sid:placedAt.sid, idx:0, pid:EST_FOLDER + cid }; }
  await estSave(true);
  closeSheet();
  if(view.page==='estanteria') render();
  // con las elegidas ya dentro: se puede deshacer (vuelven a su sitio, elegidas)
  if(undo){ estUndoToast(t('est.folder_created') + ' · ' + t('est.folder_n').replace('{n}', undo.sel.length), undo.est, [], undo.sel, true); return; }
  showToast(t('est.folder_created'), { ok:true, replace:true });
  // y ahora, a llenarla
  openEstFolderAdd(cid);
}
async function estDeleteFolder(cid){
  const f = estFolder(cid); if(!f) return;
  const n = estFolderPieces(f).length;
  if(!await showConfirmModal(t('est.folder_delete_q').replace('{name}', f.nombre || t('est.folder_default')).replace('{n}', n), { danger:true, okLabel:t('est.folder_delete') })) return;
  const F = estEnsureFolders();
  const saved = JSON.parse(JSON.stringify(f));
  const loc = estFind(EST_FOLDER + cid);
  let at = null;
  if(loc){
    // las demás, en su sitio; lo que tuviera encima se queda donde estaba
    const sf = estFreeze(loc.m, loc.sid);
    const i = sf.items.findIndex(it=> it.pid===EST_FOLDER + cid);
    at = { mid:loc.m.id, sid:loc.sid, i, item:JSON.parse(JSON.stringify(sf.items[i])) };
    at.freed = estSpliceItem(sf, i);
  }
  delete F[cid];
  if(EST.sel && EST.sel.pid===EST_FOLDER + cid) EST.sel = null;
  closeSheet();
  await estSave(true);
  if(view.page==='estanteria') render();
  showToast(t('est.folder_deleted').replace('{n}', n), { replace:true, duration:7000, action:{ label:t('common.undo'), fn: async ()=>{
    const F2 = estEnsureFolders(); if(F2[cid]) return;
    // las que entretanto has colocado en otro sitio se quedan allí (antes de
    // volver a meter la carpeta: si no, se encontrarían dentro de ella misma)
    saved.pids = saved.pids.filter(p=> !estLocate(p));
    F2[cid] = saved;
    if(at){
      const sf = estSurface(estMueble(at.mid), at.sid);
      if(sf){
        const k = Math.min(at.i, sf.items.length);
        sf.items.splice(k, 0, at.item);
        if(at.freed && sf.items[k + 1]===at.freed){ at.freed.apilado = true; delete at.freed.x; delete at.freed.fila; }
      }
    }
    await estSave(true);
    if(view.page==='estanteria') render();
  } } });
}

/* ---------- Hoja: meter piezas en una carpeta ---------- */
let estFA = { cid:'', q:'' };
function openEstFolderAdd(cid){
  const f = estFolder(cid); if(!f) return;
  estFA = { cid, q:'' };
  openSheet({ kind:'est-fadd', title:t('est.folder_add') + ' · ' + (f.nombre || t('est.folder_default')), body:estFolderAddBodyHTML(), focus:'#estFaQ',
    foot:`<button type="button" class="btn primary" onclick="closeSheet()">${t('copy.done')}</button>` });
}
function estWhereText(pid){
  const loc = estLocate(pid);
  if(!loc) return t('est.not_placed');
  if(loc.folder) return t('est.in_folder').replace('{f}', loc.folder.nombre || t('est.folder_default'));
  return loc.sid==='top' ? t('est.top') : t('est.balda_n').replace('{n}', loc.n);
}
function estFolderAddBodyHTML(){
  const f = estFolder(estFA.cid); if(!f) return '';
  const inside = new Set(f.pids);
  const plats = getAllPlatforms().map(pl=>({ pl, n: PRODUCTS.filter(p=>p.platformId===pl.id && !inside.has(p.id)).length })).filter(x=>x.n);
  const tokens = searchTokens(estFA.q);
  const cand = PRODUCTS.filter(p=> !inside.has(p.id) && (!tokens.length || productMatchesSearch(p, tokens)));
  // primero, las que aún no están en la estantería
  const placed = estPlacedSet();
  const shown = sortGames(cand).sort((a, b)=> (placed.has(a.id) ? 1 : 0) - (placed.has(b.id) ? 1 : 0)).slice(0, 40);
  return `<p class="settings-note">${escapeHTML(t('est.folder_inside').replace('{n}', estFolderPieces(f).length))}</p>
    <div class="sheet-group"><div class="field-label">${t('est.folder_add_plat')}</div>
      <div class="chip-row">${plats.map(({ pl, n })=>{ const pv = platVisual(pl.id); return `<button type="button" class="chip chip-plat" onclick="estFolderAddPlatform('${pl.id}')"><span class="chip-sw" style="--plat:${pv.color}" aria-hidden="true">${escapeHTML(pv.code)}</span>${escapeHTML(pl.name)} <span class="chip-count">${n}</span></button>`; }).join('')}</div></div>
    <div class="sheet-group"><div class="field-label">${t('est.add_single')}</div>
      <div class="searchbar" role="search">${icon('search','ico-search')}<input type="search" id="estFaQ" value="${escapeHTML(estFA.q)}" placeholder="${escapeHTML(t('est.folder_search_ph'))}" aria-label="${escapeHTML(t('est.folder_search_ph'))}" oninput="estFA.q=this.value; clearTimeout(window._estFaT); window._estFaT=setTimeout(estFolderAddRefresh, 160)" autocomplete="off"></div>
      <div class="est-add-list">${shown.map(p=>{ const pv = platVisual(p.platformId); return `<button type="button" class="est-add-row" onclick="estFolderAddOne('${escapeHTML(p.id)}')"><span class="code-chip" style="--plat:${pv.color}" aria-hidden="true">${escapeHTML(pv.code)}</span><span class="est-add-name">${escapeHTML(p.name)}<small>${escapeHTML([p.year, estWhereText(p.id)].filter(Boolean).join(' · '))}</small></span>${icon('plus')}</button>`; }).join('') || `<p class="section-sub est-add-empty">${t('filter.no_results')}</p>`}</div>
      ${cand.length > shown.length ? `<p class="settings-note">${escapeHTML(t('est.more_results').replace('{n}', cand.length - shown.length))}</p>` : ''}</div>`;
}
function estFolderAddRefresh(){
  if(!isSheetKind('est-fadd')) return;
  const body = document.getElementById('sheetBody'), y = body ? body.scrollTop : 0;
  const a = document.activeElement, q = document.getElementById('estFaQ'), hadFocus = q && a===q, pos = q ? q.selectionStart : 0;
  const kind = a && a.classList ? (a.classList.contains('est-add-row') ? '.est-add-row' : a.classList.contains('chip-plat') ? '.chip-plat' : '') : '';
  const fi = kind ? [...document.querySelectorAll('#sheetBody ' + kind)].indexOf(a) : -1;
  updateSheetBody(estFolderAddBodyHTML());
  const b2 = document.getElementById('sheetBody'); if(b2) b2.scrollTop = y;
  if(hadFocus){ const q2 = document.getElementById('estFaQ'); if(q2){ q2.focus(); try{ q2.setSelectionRange(pos, pos); }catch(e){} } }
  else if(fi >= 0){ const list = document.querySelectorAll('#sheetBody ' + kind); const el = list[Math.min(fi, list.length - 1)] || document.getElementById('estFaQ'); if(el) el.focus({ preventScroll:true }); }
}
function estIntoFolder(cid, pids){
  const f = estFolder(cid); if(!f) return 0;
  let n = 0;
  pids.forEach(pid=>{ if(f.pids.includes(pid) || !PRODUCTS_BY_ID[pid]) return; estUnplace(pid); f.pids.push(pid); n++; });
  return n;
}
function estFolderAddOne(pid){
  const n = estIntoFolder(estFA.cid, [pid]);
  if(EST.sel && EST.sel.pid===pid) EST.sel = null;
  estSave(); estDraw(); estRefreshPanel(); estFolderAddRefresh();
  if(n) showToast(t('est.folder_added').replace('{n}', n), { ok:true, replace:true });
}
async function estFolderAddPlatform(plId){
  const f = estFolder(estFA.cid); if(!f) return;
  const list = sortGames(PRODUCTS.filter(p=>p.platformId===plId && !f.pids.includes(p.id)));
  if(!list.length) return;
  const placed = list.filter(p=> estLocate(p.id)).length;
  if(placed && !await showConfirmModal(t('est.folder_add_q').replace('{n}', list.length).replace('{m}', placed), { okLabel:t('est.folder_add') })) return;
  const n = estIntoFolder(estFA.cid, list.map(p=>p.id));
  if(EST.sel && !estLocate(EST.sel.pid) && !estFind(EST.sel.pid)) EST.sel = null;
  await estSave(true);
  estDraw(); estRefreshPanel();
  if(isSheetKind('est-fadd')) estFolderAddRefresh(); else openEstFolderAdd(estFA.cid);
  showToast(t('est.folder_added').replace('{n}', n), { ok:true, replace:true });
}
/* La pieza elegida, a una carpeta (o a una nueva, que ocupa su sitio) */
function openEstToFolder(pid){
  const p = PRODUCTS_BY_ID[pid]; if(!p) return;
  const F = Object.values(estFolders());
  const body = `${F.length ? `<div class="est-add-list">${F.map(f=>`<button type="button" class="est-add-row" onclick="estToFolder('${escapeHTML(pid)}','${f.id}')"><span class="est-folder-sw${estLum(f.color) > 0.62 ? ' is-light' : ''}" style="background:${f.color}" aria-hidden="true">${icon('folder')}</span><span class="est-add-name">${escapeHTML(f.nombre || t('est.folder_default'))}<small>${escapeHTML(t('est.folder_n').replace('{n}', estFolderPieces(f).length))}</small></span>${icon('plus')}</button>`).join('')}</div>` : `<p class="settings-note">${t('est.folders_note')}</p>`}
    <div class="quick-actions"><button type="button" class="btn" onclick="openEstFolderSheet(null, null, '${escapeHTML(pid)}')">${icon('folder')} ${t('est.folder_new_from')}</button></div>`;
  openSheet({ kind:'est-tofolder', title:t('est.to_folder') + ' · ' + p.name, body });
}
function estToFolder(pid, cid){
  const loc = estFind(pid);
  if(loc) estFreeze(loc.m, loc.sid);
  estIntoFolder(cid, [pid]);
  if(EST.sel && EST.sel.pid===pid) EST.sel = null;
  closeSheet();
  estAfterEdit();
  const f = estFolder(cid);
  showToast(t('est.folder_put').replace('{f}', f ? f.nombre || t('est.folder_default') : ''), { ok:true, replace:true, action:{ label:t('est.folder_open'), fn: ()=> estOpenBook(cid, pid) } });
}

/* ---------- La carpeta abierta, como un libro ---------- */
let estBookState = null;
function estDialogEl(){ return document.getElementById('estPull') || document.getElementById('estBook') || document.getElementById('estInspect'); }
function estOpenBook(cid, pid, readOnly){
  const f = estFolder(cid); if(!f) return;
  estCloseInspect(true);
  const pieces = estFolderPieces(f);
  const root = document.createElement('div');
  root.id = 'estBook'; root.className = 'est-book';
  root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-labelledby', 'estBookT');
  document.body.appendChild(root);
  estBookState = { cid, page: pid ? Math.max(0, pieces.findIndex(p=>p.id===pid)) : 0, index:false, ret: document.activeElement, anim:'', ro: !!readOnly || (view.page==='estanteria' && !view.productId && EST.mode==='ver') };   // solo para mirar: a pantalla completa (no desde la ficha)
  estBookRender();
  // pasar las páginas: deslizando o con las flechas
  let g = null;
  root.addEventListener('pointerdown', (e)=>{ if(e.target.closest('button, a, input')) return; g = { x:e.clientX, y:e.clientY }; });
  root.addEventListener('pointerup', (e)=>{ if(!g) return; const dx = e.clientX - g.x, dy = e.clientY - g.y; g = null; if(Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) estBookTurn(dx < 0 ? 1 : -1); });
  root.addEventListener('pointercancel', ()=>{ g = null; });
  root.addEventListener('keydown', (e)=>{ if(e.key==='ArrowRight'){ e.preventDefault(); estBookTurn(1); } else if(e.key==='ArrowLeft'){ e.preventDefault(); estBookTurn(-1); } });
  setTimeout(()=>{ const b = root.querySelector('.est-book-nav .btn:not([disabled])') || root.querySelector('.est-book-head .btn'); if(b) b.focus(); }, 40);
}
function estBookPer(){ return innerWidth >= 760 ? 2 : 1; }
function estBookRender(){
  const S = estBookState, root = document.getElementById('estBook'); if(!S || !root) return;
  const f = estFolder(S.cid); if(!f){ estCloseBook(); return; }
  const pieces = estFolderPieces(f), n = pieces.length, per = estBookPer();
  S.page = Math.max(0, Math.min(S.page, Math.max(0, n - 1)));
  if(per===2) S.page -= S.page % 2;
  const name = f.nombre || t('est.folder_default');
  const a = document.activeElement, fk = a && root.contains(a) && a.dataset ? a.dataset.fk : null;
  let body;
  if(!n) body = `<div class="est-book-empty"><span class="est-folder-sw is-big${estLum(f.color) > 0.62 ? ' is-light' : ''}" style="background:${f.color}" aria-hidden="true">${icon('folder')}</span><p>${t('est.folder_empty')}</p>${S.ro ? '' : `<button type="button" class="btn primary" onclick="estBookAdd()">${icon('plus')} ${t('est.folder_add')}</button>`}</div>`;
  else if(S.index) body = `<div class="est-book-index" role="list">${pieces.map((p, i)=>{ const pv = platVisual(p.platformId), ph = shownPhotoId(p), miss = p.possession!=='tengo';
      return `<div role="listitem" class="est-bi-li"><button type="button" class="est-bi-item${miss ? ' is-ghost' : ''}" data-fk="bi-${i}" onclick="estBookGoto(${i})"><span class="est-bi-pic">${!miss && hasPhoto(ph, 'front') ? photoImgHTML(p, 'front', 'thumb', 'data-eager="1"', ph) : `<span class="code-chip" style="--plat:${pv.color}">${escapeHTML(pv.code)}</span>`}</span><span class="est-bi-name">${escapeHTML(p.name)}</span><span class="est-bi-n">${i + 1}</span></button></div>`; }).join('')}</div>`;
  else {
    const pages = pieces.slice(S.page, S.page + per).map((p, k)=> estBookPageHTML(p, S.page + k, n, k, S.ro)).join('');
    body = `<div class="est-book-spread${per===2 ? ' is-two' : ''}${S.anim ? ' is-turn-' + S.anim : ''}" style="--fc:${f.color}">${pages}${per===2 && S.page + 1 >= n ? '<div class="est-page is-blank" aria-hidden="true"></div>' : ''}</div>`;
  }
  S.anim = '';
  const last = Math.min(n, S.page + per);
  root.innerHTML = `<div class="est-ins-bg" onclick="estCloseBook()"></div>
    <div class="est-book-wrap${estLum(f.color) > 0.62 ? ' is-light' : ''}" style="--fc:${f.color}">
      <div class="est-book-head">
        <span class="est-folder-sw${estLum(f.color) > 0.62 ? ' is-light' : ''}" style="background:${f.color}" aria-hidden="true">${icon('book')}</span>
        <div class="est-book-titles"><h2 id="estBookT">${escapeHTML(name)}</h2><span>${escapeHTML(t('est.folder_n').replace('{n}', n))}</span></div>
        <span class="est-book-tools">${n ? `<button type="button" class="btn btn-sm ${S.index ? 'is-on' : ''}" data-fk="bk-index" aria-pressed="${S.index}" onclick="estBookIndex()">${icon('grid')} ${t('est.book_index')}</button>` : ''}
        ${S.ro ? '' : `<button type="button" class="btn btn-sm" data-fk="bk-add" onclick="estBookAdd()" aria-label="${escapeHTML(t('est.folder_add'))}" title="${escapeHTML(t('est.folder_add'))}">${icon('plus')}</button>
        <button type="button" class="btn btn-sm" data-fk="bk-edit" onclick="estBookEdit()" aria-label="${escapeHTML(t('est.folder_edit'))}" title="${escapeHTML(t('est.folder_edit'))}">${icon('pencil')}</button>`}</span>
        <button type="button" class="btn btn-ghost btn-icon est-book-x" data-fk="bk-x" onclick="estCloseBook()" aria-label="${escapeHTML(t('common.close'))}">${icon('x')}</button>
      </div>
      ${S.undo ? `<div class="est-book-undo" role="status"><span>${escapeHTML(t('est.folder_out').replace('{name}', S.undo.name))}</span><button type="button" class="btn btn-sm" data-fk="bk-undo" onclick="estBookUndo()">${icon('undo')} ${t('common.undo')}</button></div>` : ''}
      <div class="est-book-body">${body}</div>
      ${n && !S.index ? `<div class="est-book-nav">
        <button type="button" class="btn" data-fk="bk-prev" onclick="estBookTurn(-1)" ${S.page <= 0 ? 'disabled' : ''} aria-label="${escapeHTML(t('est.book_prev'))}">${icon('chevronLeft')}</button>
        <span class="est-book-pg" aria-live="polite">${escapeHTML(t('est.book_page').replace('{a}', per===2 && last > S.page + 1 ? (S.page + 1) + '–' + last : String(S.page + 1)).replace('{n}', n))}</span>
        <button type="button" class="btn" data-fk="bk-next" onclick="estBookTurn(1)" ${S.page + per >= n ? 'disabled' : ''} aria-label="${escapeHTML(t('est.book_next'))}">${icon('chevronRight')}</button>
      </div>` : ''}
    </div>`;
  hydratePhotos(root);
  if(fk){ const b = root.querySelector(`[data-fk="${CSS.escape(fk)}"]`); if(b && !b.disabled) b.focus({ preventScroll:true }); else { const nb = root.querySelector('.est-book-nav .btn:not([disabled])'); if(nb) nb.focus({ preventScroll:true }); } }
}
function estBookPageHTML(p, i, n, k, ro){
  const miss = p.possession!=='tengo', pv = platVisual(p.platformId), ph = shownPhotoId(p);
  const pic = !miss && hasPhoto(ph, 'front') ? photoImgHTML(p, 'front', 'full', 'data-eager="1"', ph)
    : miss && typeof planoCoverHTML==='function' ? planoCoverHTML(p) : `<span class="code-chip est-page-code" style="--plat:${pv.color}">${escapeHTML(pv.code)}</span>`;
  return `<article class="est-page${miss ? ' is-miss' : ''}" aria-label="${escapeHTML(p.name)}" style="--plat:${pv.color}">
    <div class="est-page-pic">${pic}</div>
    <div class="est-page-txt"><b>${escapeHTML(p.name)}</b><small>${escapeHTML([p.platformName, p.year].filter(Boolean).join(' · '))}</small><span class="est-page-st">${escapeHTML(miss ? t('cover.missing') : t('est.have'))}</span></div>
    <div class="est-page-btns"><button type="button" class="btn btn-sm" data-fk="pg-ficha-${k || 0}" onclick="estBookGo('${escapeHTML(p.id)}')">${icon('box')} ${t('est.open_ficha')}</button>${ro ? '' : `<button type="button" class="btn btn-sm btn-ghost" data-fk="pg-out-${k || 0}" onclick="estBookTakeOut('${escapeHTML(p.id)}')">${t('est.folder_take_out')}</button>`}</div>
    <span class="est-page-num" aria-hidden="true">${i + 1}</span>
  </article>`;
}
function estBookTurn(d){
  const S = estBookState; if(!S || S.index) return;
  const f = estFolder(S.cid); if(!f) return;
  const n = estFolderPieces(f).length, per = estBookPer();
  const np = S.page + d * per;
  if(np < 0 || np >= n) return;
  S.page = np; S.anim = reducedMotion() ? '' : (d > 0 ? 'next' : 'prev'); S.undo = null;
  estBookRender();
}
function estBookIndex(){ const S = estBookState; if(!S) return; S.index = !S.index; estBookRender(); }
function estBookGoto(i){ const S = estBookState; if(!S) return; S.index = false; S.page = i; estBookRender(); }
function estBookGo(pid){ estCloseBook(true); goProduct(pid); }
function estBookAdd(){ const S = estBookState; if(!S) return; const cid = S.cid; estCloseBook(true); openEstFolderAdd(cid); _estSheetBook(cid); }
function estBookEdit(){ const S = estBookState; if(!S) return; const cid = S.cid; estCloseBook(true); openEstFolderSheet(cid); _estSheetBook(cid); }
/* Al cerrar la hoja, vuelve a abrirse el libro (si la carpeta sigue ahí) */
function _estSheetBook(cid){ _sheetOnClose = ()=>{ if(estFolder(cid) && !estBookState) setTimeout(()=>estOpenBook(cid), 30); }; }
function estBookTakeOut(pid){
  const S = estBookState; if(!S) return;
  const f = estFolder(S.cid); if(!f) return;
  const i = f.pids.indexOf(pid); if(i < 0) return;
  f.pids.splice(i, 1);
  const p = PRODUCTS_BY_ID[pid];
  const undo = ()=>{
    const f2 = estFolder(f.id); if(!f2 || estLocate(pid)) return;
    f2.pids.splice(Math.min(i, f2.pids.length), 0, pid);
    if(estBookState && estBookState.cid===f.id){ estBookState.undo = null; estBookState.page = Math.min(i, f2.pids.length - 1); }
    estSave(); if(estBookState) estBookRender(); estRefresh();
  };
  // «Deshacer», dentro del propio libro (un aviso abajo taparía las páginas y quedaría fuera del diálogo)
  S.undo = { name: p ? p.name : '', fn: undo };
  estSave(); estBookRender(); estRefresh();
}
function estBookUndo(){ const S = estBookState; if(S && S.undo){ const fn = S.undo.fn; S.undo = null; fn(); } }
function estCloseBook(silent){
  const root = document.getElementById('estBook');
  const st = estBookState; estBookState = null;
  if(root) root.remove();
  if(!silent && st && st.ret && st.ret.focus && document.contains(st.ret)) try{ st.ret.focus(); }catch(e){}
}
let _estBookRz = null;
window.addEventListener('resize', ()=>{ if(!estBookState) return; clearTimeout(_estBookRz); _estBookRz = setTimeout(()=>{ if(estBookState) estBookRender(); }, 150); });

/* Al girar el móvil o cambiar el tamaño de la ventana, se vuelve a encajar */
let _estResizeT = null;
window.addEventListener('resize', ()=>{
  if(view.page!=='estanteria' || view.productId) return;
  clearTimeout(_estResizeT); _estResizeT = setTimeout(()=>{ if(view.page==='estanteria' && !view.productId) estDraw(); }, 150);
});

/* =====================================================================
   11. VARIAS A LA VEZ (v11.13, editando)
   ---------------------------------------------------------------------
   «Elegir varias»: tocas las piezas (en la balda o en la lista) y lo que
   cambias se aplica a todas: postura, giro, fila, mover, medidas, color
   del lomo, otra balda, una carpeta o quitarlas. Cada cambio se puede
   deshacer. Las de cada balda siguen sin correr a las demás.
   ===================================================================== */
function estMultiOn(on){
  if(on){ EST.multi = new Set(EST.sel && estFind(EST.sel.pid) ? [EST.sel.pid] : []); EST.sel = null; }
  else EST.multi = null;
  estDraw(); estRefreshPanel();
  const b = document.querySelector(on ? '#estPanel .est-multi [data-fk="mc-done"]' : '#estPanel [data-fk="multi-on"]');
  if(b && !estStageEl().contains(document.activeElement)) b.focus({ preventScroll:true });
}
function estMultiNone(){
  if(!EST.multi) return;
  EST.multi.clear(); estDraw(); estRefreshPanel();
  const b = document.querySelector('#estPanel .est-multi [data-fk="mc-done"]'); if(b) b.focus({ preventScroll:true });
}
function estMultiToggle(pid){
  if(!EST.multi) return;
  if(EST.multi.has(pid)) EST.multi.delete(pid); else EST.multi.add(pid);
  estDraw(); estRefreshPanel();
}
function estMultiAll(sid, on){
  if(!EST.multi) return;
  const m = estMueble(estMid()), sf = m && estSurface(m, sid); if(!sf) return;
  sf.items.forEach(it=>{ if(!estKnown(it)) return; if(on) EST.multi.add(it.pid); else EST.multi.delete(it.pid); });
  estDraw(); estRefreshPanel();
}
/* Las elegidas que están en la estantería, en orden (mueble, balda, sitio): [{ pid, p, it, m, sid, sf }] */
function estMultiItems(){
  if(!EST.multi || !EST.multi.size) return [];
  const out = [];
  estData().muebles.forEach(m=> [['top', m.encima]].concat(m.baldas.map(b=>[b.id, b])).forEach(([sid, sf])=> sf.items.forEach(it=>{
    if(!EST.multi.has(it.pid)) return;
    const p = estP(it.pid); if(p) out.push({ pid:it.pid, p, it, m, sid, sf });
  })));
  return out;
}
function estMultiProducts(){ return estMultiItems().map(x=>x.p).filter(p=> !p.isFolder); }
/* Agrupadas por balda: [{ m, sid, sf, pids:Set }] */
function estMultiGroups(items){
  const g = new Map();
  items.forEach(x=>{ const k = x.m.id + '|' + x.sid; if(!g.has(k)) g.set(k, { m:x.m, sid:x.sid, sf:x.sf, pids:new Set() }); g.get(k).pids.add(x.pid); });
  return [...g.values()];
}
/* Cada balda tocada, fijada en su sitio (una vez) antes de cambiar nada */
function estFreezeOnce(items){ estMultiGroups(items).forEach(g=> estFreeze(g.m, g.sid)); }
/* Un cambio a todas, con «Deshacer» (vuelve la estantería y las medidas de esas piezas) */
function estBulk(fn, okKey){
  const items = estMultiItems();
  if(!items.length){ showToast(t('est.multi_pick_first'), { replace:true }); return; }
  const est = JSON.stringify(OVERRIDES.estanterias), med = estSnapMed(items.filter(x=>!x.p.isFolder).map(x=>x.pid)), sel = items.map(x=>x.pid);
  const res = fn(items);
  if(res===false) return;
  estAfterEdit();
  const msg = res && res.msg ? res.msg : t(okKey).replace('{n}', res && res.n!=null ? res.n : items.length);
  estUndoToast(msg, est, med, sel);
}
/* Las medidas propias de unas piezas, tal cual (con o sin la clave), para dejarlas igual al deshacer */
function estSnapMed(pids){
  const js = (v)=> v===undefined ? undefined : JSON.stringify(v);
  return pids.map(id=>{ const p = PRODUCTS_BY_ID[id]; if(!p) return null; const ov = OVERRIDES.products[id];
    return { id, pm: js(p.medidas), ov: !!ov, key: !!ov && Object.prototype.hasOwnProperty.call(ov, 'medidas'), om: ov ? js(ov.medidas) : undefined }; }).filter(Boolean);
}
function estRestoreMed(list){
  list.forEach(s=>{
    const p = PRODUCTS_BY_ID[s.id]; if(!p) return;
    if((p.medidas===undefined ? undefined : JSON.stringify(p.medidas))===s.pm) return;   // no cambió: no se toca
    if(s.pm===undefined) delete p.medidas; else p.medidas = JSON.parse(s.pm);
    let ov = OVERRIDES.products[s.id];
    if(!s.ov){ if(ov){ delete ov.medidas; if(!Object.keys(ov).length) delete OVERRIDES.products[s.id]; } return; }
    if(!ov) ov = OVERRIDES.products[s.id] = {};
    if(!s.key) delete ov.medidas; else ov.medidas = s.om===undefined ? undefined : JSON.parse(s.om);
  });
}
/* Aviso con «Deshacer»: vuelve la estantería (y esas medidas) a como estaban, con las mismas elegidas.
   Si antes cambias otra cosa de la estantería, el aviso se va (deshacer ya no sería solo esto) */
function estUndoToast(msg, est, med, sel, reenter){
  const gen = _estGen;
  const el = showToast(msg, { replace:true, duration:6000, action:{ label:t('common.undo'), fn: ()=>{
    if(gen!==_estGen) return;
    _estUndo = null;
    OVERRIDES.estanterias = JSON.parse(est);
    estRestoreMed(med || []);
    if(sel && reenter && !EST.multi && EST.mode==='editar') EST.multi = new Set();
    if(EST.multi && sel) sel.forEach(id=>{ if(estFind(id)) EST.multi.add(id); });
    if(reenter) EST.sel = null;
    estSave(true);
    if(view.page==='estanteria' && !view.productId){ estDraw(); estRefreshPanel(); }
  } } });
  _estUndo = el ? { el, gen } : null;
}
function estMultiPose(pose){
  if(!EST_POSES.includes(pose)) return;
  estBulk(items=>{ estFreezeOnce(items); items.forEach(x=>{ if(pose==='lomo') delete x.it.pose; else x.it.pose = pose; delete x.it.rot; }); return { n:items.length }; }, 'est.multi_done_n');
}
function estMultiRotate(d){
  estBulk(items=>{ estFreezeOnce(items); items.forEach(x=>{ const r = ((x.it.rot || 0) + d + 540) % 360 - 180; if(Math.abs(r) < 1) delete x.it.rot; else x.it.rot = r; }); return { n:items.length }; }, 'est.multi_done_n');
}
/* Delante o detrás: cada una a su misma altura de la balda o al sitio libre más cercano de esa fila */
function estMultiFila(row){
  estBulk(items=>{
    estFreezeOnce(items);
    let moved = 0, stuck = 0;
    estMultiGroups(items).forEach(g=>{
      const H = estSurfaceH(g.m, g.sid), D = g.m.fondo, W = g.m.ancho;
      const bases = estLayout(g.sf.items, W, H, D).cols.filter(c=> c.items.some(r=> g.pids.has(r.p.id))).sort((a, b)=> a.x - b.x).map(c=> c.base);
      bases.forEach(base=>{
        const L = estLayout(g.sf.items, W, H, D);
        const c = L.cols.find(q=> q.base===base); if(!c || c.row===row) return;
        const spot = estFreeSpot(estObstacles(L, c, row, D), c.fw, c.x, W);
        if(spot===null){ stuck++; return; }
        base.x = spot; if(row) base.fila = 'detras'; else delete base.fila; moved++;
      });
      estSortRow(g.sf);
    });
    if(!moved){ showToast(t(row ? 'est.no_room_back' : 'est.no_room_front'), { replace:true }); return false; }
    return { n:moved, msg: stuck ? t('est.multi_some_stuck').replace('{n}', moved).replace('{r}', stuck) : null };
  }, 'est.multi_done_n');
}
/* Mover las elegidas juntas (cm): todas a la vez, sin pisar a las demás */
function estMultiNudge(cm){
  estBulk(items=>{
    estFreezeOnce(items);
    let ok = 0, blocked = 0;
    estMultiGroups(items).forEach(g=>{
      const L = estLayout(g.sf.items, g.m.ancho, estSurfaceH(g.m, g.sid), g.m.fondo);
      const sel = L.cols.filter(c=> c.items.some(r=> g.pids.has(r.p.id)));
      const fits = sel.every(c=> (cm > 0 ? c.x + cm + c.fw <= g.m.ancho + 0.01 : c.x + cm >= -0.01) && estFitsAt(L, c, c.x + cm, g.m.fondo, sel));
      if(!fits){ blocked++; return; }
      sel.forEach(c=>{ c.base.x = estR1(c.x + cm); });
      estSortRow(g.sf); ok++;
    });
    if(!ok){ showToast(t(cm > 0 ? 'est.no_room_right' : 'est.no_room_left'), { replace:true }); return false; }
    return { n:items.length, msg: blocked ? t('est.multi_nudge_some') : null };
  }, 'est.multi_moved_n');
}
/* Grosor o alto de todas (± lo mismo a cada una; pasan a ser sus medidas) */
function estMultiDim(k, delta){
  estBulk(items=>{
    estFreezeOnce(items);
    items.forEach(x=>{
      const d = piezaDims(x.p), v = { w:d.w, h:d.h, d:d.d };
      v[k] = Math.max(0.1, Math.min(400, Math.round((v[k] + delta) * 10) / 10));
      if(x.p.isFolder){ const f = x.p.folder; f.ancho = estNum(v.w, 1, 120, 23); f.alto = estNum(v.h, 1, 120, 31); f.fondo = estNum(v.d, 0.2, 60, 3); }
      else { const real = PRODUCTS_BY_ID[x.pid]; if(real) estSetOwnDims(real, { ancho:v.w, alto:v.h, fondo:v.d }); }
    });
    return { n:items.length };
  }, 'est.multi_done_n');
}
function estMultiClearDims(){
  estBulk(items=>{
    const prods = items.filter(x=> !x.p.isFolder && medidasValidas(x.p.medidas));
    if(!prods.length){ showToast(t('est.multi_no_own'), { replace:true }); return false; }
    estFreezeOnce(items);
    prods.forEach(x=>{ const real = PRODUCTS_BY_ID[x.pid]; if(real) estSetOwnDims(real, null); });
    return { n:prods.length };
  }, 'est.multi_done_n');
}
function estMultiRemove(){
  estBulk(items=>{ items.forEach(x=> estUnplace(x.pid)); EST.multi.clear(); return { n:items.length }; }, 'est.multi_removed');
}
/* La tarjeta de las elegidas (en el panel) */
function estMultiCardHTML(){
  const items = estMultiItems(), n = items.length;
  const surfs = new Set(items.map(x=> x.m.id + '|' + x.sid)).size;
  const hasProd = items.some(x=> !x.p.isFolder);
  const head = `<div class="est-sel-head"><span class="est-sel-thumb est-multi-ic" aria-hidden="true">${icon('multi')}</span>
      <div class="est-sel-titles"><span class="est-sel-name" aria-live="polite">${escapeHTML(n ? t('est.multi_n').replace('{n}', n) : t('est.multi'))}</span><span class="est-sel-sub">${escapeHTML(n ? (surfs > 1 ? t('est.multi_in').replace('{n}', surfs) : t('est.multi_same')) : t('est.multi_hint'))}</span></div>
      <button type="button" class="btn btn-sm primary" data-fk="mc-done" onclick="estMultiOn(false)">${icon('check')} ${t('est.multi_done')}</button></div>`;
  if(!n) return `<section class="est-sel est-multi" aria-label="${escapeHTML(t('est.multi'))}">${head}</section>`;
  const b = (fk, fn, inner, label, extra)=> `<button type="button" class="btn btn-sm ${extra || ''}" data-fk="${fk}" onclick="${fn}"${label ? ` aria-label="${escapeHTML(label)}" title="${escapeHTML(label)}"` : ''}>${inner}</button>`;
  const dimq = (k, label)=> `<span class="est-dimq-item"><span class="est-dimq-l">${label}</span><span class="est-step">${b('mq-' + k + '-m', `estMultiDim('${k}', -0.1)`, icon('minus'), label + ': ' + t('est.less'))}<output>±0,1 cm</output>${b('mq-' + k + '-p', `estMultiDim('${k}', 0.1)`, icon('plus'), label + ': ' + t('est.more'))}</span></span>`;
  return `<section class="est-sel est-multi" aria-label="${escapeHTML(t('est.multi'))}">${head}
    <div class="field-label est-sel-lbl">${t('est.pose')}</div>
    <div class="segmented est-poses" role="group" aria-label="${escapeHTML(t('est.pose'))}">${EST_POSES.map(k=> `<button type="button" class="seg-btn" data-fk="mp-${k}" onclick="estMultiPose('${k}')">${t('est.pose.' + k)}</button>`).join('')}</div>
    <div class="est-tools" role="group" aria-label="${escapeHTML(t('est.place_tools'))}">
      ${b('mn-l', 'estMultiNudge(-1)', '−1 cm', t('est.nudge_left'))}${b('mn-r', 'estMultiNudge(1)', '+1 cm', t('est.nudge_right'))}
      ${b('mr-l', 'estMultiRotate(-15)', icon('rotateLeft'), t('est.rot_left'))}${b('mr-r', 'estMultiRotate(15)', icon('rotate'), t('est.rot_right'))}
    </div>
    <div class="field-label est-sel-lbl">${t('est.row')}</div>
    <div class="segmented est-rows" role="group" aria-label="${escapeHTML(t('est.row'))}">
      <button type="button" class="seg-btn" data-fk="mf-0" onclick="estMultiFila(0)">${t('est.row_front')}</button>
      <button type="button" class="seg-btn" data-fk="mf-1" onclick="estMultiFila(1)">${t('est.row_back')}</button></div>
    <div class="field-label est-sel-lbl">${t('est.multi_dims')}</div>
    <div class="est-dimq">${dimq('d', t('est.thick'))}${dimq('h', t('est.height'))}</div>
    <p class="est-sel-dims"><button type="button" class="link-btn" data-fk="ml-dims" onclick="openEstMultiDims()">${t('est.multi_dims_exact')}</button>${hasProd ? ` · <button type="button" class="link-btn" data-fk="ml-clear" onclick="estMultiClearDims()">${t('est.multi_dims_clear')}</button>` : ''}</p>
    ${hasProd ? `<div class="est-sel-lomo"><span class="est-lomo-sw" style="background:linear-gradient(90deg, ${EST_PORTADA_MIX.join(', ')})" aria-hidden="true"></span><span class="est-lomo-txt">${escapeHTML(t('est.lomo_color_t'))}</span>${b('mc-color', 'openEstMultiColor()', icon('palette') + ' ' + t('est.change'))}</div>` : ''}
    <p class="est-sel-dims"><button type="button" class="link-btn" data-fk="ml-move" onclick="openEstMultiMoveTo()">${t('est.multi_move_to')}</button>${hasProd ? ` · <button type="button" class="link-btn" data-fk="ml-folder" onclick="openEstMultiToFolder()">${t('est.multi_to_folder')}</button>` : ''} · <button type="button" class="link-btn est-danger" data-fk="ml-remove" onclick="estMultiRemove()">${t('est.multi_remove')}</button> · <button type="button" class="link-btn" data-fk="ml-none" onclick="estMultiNone()">${t('est.multi_none')}</button></p>
  </section>`;
}
/* Hoja: otra balda (o mueble) para todas */
function openEstMultiMoveTo(){
  const body = estData().muebles.map(m=>`<div class="sheet-group"><div class="field-label">${escapeHTML(m.nombre)}</div><div class="chip-row">${[['top', t('est.top')]].concat(m.baldas.map((b, i)=>[b.id, t('est.balda_n').replace('{n}', i + 1) + (estPlateText(b) ? ' · ' + estPlateText(b) : '')])).map(([sid, l])=>`<button type="button" class="chip" onclick="estMultiMoveTo('${m.id}','${sid}')">${escapeHTML(l)}</button>`).join('')}</div></div>`).join('');
  openSheet({ kind:'est-mmove', title:t('est.multi_move_to'), body });
}
function estMultiMoveTo(mid, sid){
  const m = estMueble(mid), sf = estSurface(m, sid); if(!sf) return;
  closeSheet();
  estBulk(items=>{
    let n = 0;
    items.forEach(x=>{
      if(x.m.id===mid && x.sid===sid) return;
      const it = Object.assign({}, x.it); delete it.apilado; delete it.dx; delete it.x; delete it.fila;
      estUnplace(x.pid); sf.items.push(it); n++;
    });
    if(!n) return false;
    // y se ven ya allí
    EST.mid = mid; EST.view = 'balda'; EST.bsid = sid; EST.covers = false;
    return { n };
  }, 'est.multi_moved_to');
}
/* Hoja: a una carpeta (o a una nueva, en el sitio de la primera) */
function openEstMultiToFolder(){
  const ids = estMultiProducts().map(p=>p.id); if(!ids.length) return;
  const F = Object.values(estFolders());
  const body = `${F.length ? `<div class="est-add-list">${F.map(f=>`<button type="button" class="est-add-row" onclick="estMultiToFolder('${f.id}')"><span class="est-folder-sw${estLum(f.color) > 0.62 ? ' is-light' : ''}" style="background:${f.color}" aria-hidden="true">${icon('folder')}</span><span class="est-add-name">${escapeHTML(f.nombre || t('est.folder_default'))}<small>${escapeHTML(t('est.folder_n').replace('{n}', estFolderPieces(f).length))}</small></span>${icon('plus')}</button>`).join('')}</div>` : `<p class="settings-note">${t('est.folders_note')}</p>`}
    <div class="quick-actions"><button type="button" class="btn" onclick="openEstFolderSheet(null, null, '${escapeHTML(ids[0])}', ${escapeHTML(JSON.stringify(ids.slice(1)))})">${icon('folder')} ${t('est.multi_new_folder')}</button></div>`;
  openSheet({ kind:'est-mfolder', title:t('est.multi_to_folder') + ' · ' + t('est.multi_n').replace('{n}', ids.length), body });
}
function estMultiToFolder(cid){
  closeSheet();
  estBulk(items=>{
    const ids = items.filter(x=> !x.p.isFolder).map(x=>x.pid);
    estFreezeOnce(items);
    const n = estIntoFolder(cid, ids);
    ids.forEach(id=> EST.multi.delete(id));
    return { n };
  }, 'est.folder_added');
}
/* Hoja: medidas exactas para todas (solo las que actives) */
let estMD = null;
function openEstMultiDims(){
  const items = estMultiItems(); if(!items.length) return;
  const d0 = piezaDims(items[0].p);
  estMD = { on:{ h:false, d:false, w:false }, v:{ h:d0.h, d:d0.d, w:d0.w } };
  const dim = (k, label, hint)=> `<div class="est-cs-dim"><label class="est-cs-sw"><input type="checkbox" role="switch" onchange="estMD.on.${k}=this.checked; document.getElementById('estMd${k.toUpperCase()}').disabled=!this.checked; estMultiDimsRefresh()"><span>${label}<small>${hint}</small></span></label>
    <input id="estMd${k.toUpperCase()}" class="input" type="number" inputmode="decimal" step="0.1" min="0.1" max="400" value="${estMD.v[k]}" aria-label="${escapeHTML(label + ' (cm)')}" disabled data-nosave oninput="const v=Number(String(this.value).replace(',','.')); if(isFinite(v) && v>0 && v<=400){ estMD.v.${k}=Math.round(v*10)/10; this.removeAttribute('aria-invalid'); } else this.setAttribute('aria-invalid','true'); estMultiDimsRefresh()"><span class="est-cs-u" aria-hidden="true">cm</span></div>`;
  const body = `<p class="settings-note">${escapeHTML(t('est.multi_dims_note').replace('{n}', items.length))}</p>
    <div class="sheet-group">${dim('h', t('est.height'), t('est.height_hint'))}${dim('d', t('est.thick'), t('est.thick_hint'))}${dim('w', t('dims.w').replace(/\s*\(.*\)$/, ''), t('est.width_hint'))}</div>`;
  openSheet({ kind:'est-mdims', title:t('est.multi_dims_exact'), body,
    foot:`<button type="button" class="btn" onclick="closeSheet()">${t('modal.cancel')}</button><button type="button" class="btn primary" id="estMdApply" disabled onclick="estMultiDimsApply()">${escapeHTML(t('est.apply_n').replace('{n}', items.length))}</button>` });
}
function estMultiDimsRefresh(){
  const btn = document.getElementById('estMdApply'); if(!btn || !estMD) return;
  const any = ['h', 'd', 'w'].some(k=> estMD.on[k]);
  const bad = !!document.querySelector('#sheetBody .est-cs-dim input[aria-invalid="true"]:not([disabled])');
  btn.disabled = !any || bad;
}
function estMultiDimsApply(){
  const S = estMD; if(!S) return;
  const key = { h:'h', d:'d', w:'w' };
  closeSheet();
  estBulk(items=>{
    estFreezeOnce(items);
    items.forEach(x=>{
      const d = piezaDims(x.p), v = { w:d.w, h:d.h, d:d.d };
      ['h', 'd', 'w'].forEach(k=>{ if(S.on[k]) v[key[k]] = S.v[k]; });
      if(x.p.isFolder){ const f = x.p.folder; f.ancho = estNum(v.w, 1, 120, 23); f.alto = estNum(v.h, 1, 120, 31); f.fondo = estNum(v.d, 0.2, 60, 3); }
      else { const real = PRODUCTS_BY_ID[x.pid]; if(real) estSetOwnDims(real, { ancho:v.w, alto:v.h, fondo:v.d }); }
    });
    return { n:items.length };
  }, 'est.multi_done_n');
}
/* Hoja: el color del lomo de todas (se aplica con «Aplicar a N») */
let estMC = null;
function openEstMultiColor(keep){
  const prods = estMultiProducts(); if(!prods.length) return;
  if(!keep || !estMC) estMC = { lomo:undefined, banda:undefined };
  openSheet({ kind:'est-mcolor', title:t('est.lomo_color_t') + ' · ' + t('est.multi_n').replace('{n}', prods.length),
    body:`<div class="est-ms-prev" id="estMcPrev">${estMultiColorPrevHTML()}</div><div id="estMcEd">${estColorEditorHTML('multi')}</div>`,
    foot:`<button type="button" class="btn" onclick="estMC=null; closeSheet()">${t('modal.cancel')}</button><button type="button" class="btn primary" onclick="estMultiColorApply()">${escapeHTML(t('est.apply_n').replace('{n}', prods.length))}</button>` });
  estHydratePhotos(document.getElementById('sheetBody'));
}
/* Cómo quedan (hasta 16 de las elegidas) */
function estMultiColorPrevHTML(){
  const S = estMC, C = estColors();
  const list = estMultiProducts().slice(0, 16);
  return `<div class="est-ms-shelf" aria-hidden="true">${list.map(p=>{
    const pl = (p.platformId && C.plataformas[p.platformId]) || {};
    const lomo = S.lomo!==undefined ? S.lomo : (pl.lomo || 'portada'), banda = S.banda!==undefined ? S.banda : (pl.banda || '');
    const color = lomo==='app' ? platVisual(p.platformId).color : EST_HEX.test(String(lomo)) ? lomo : null;
    const d = piezaDims(p), s = Math.min(9, 150 / Math.max(10, d.h)), h = d.h * s, w = Math.max(4, d.d * s);
    const miss = p.possession!=='tengo', bh = banda ? estBandPx(h, s) : 0;
    const style = miss ? '' : color ? `background-color:${color};` : '';
    const cls = miss ? ' is-ghost' : color ? ` has-avg is-custom${estLum(color) > 0.62 ? ' is-light' : ''}` : '';
    const attrs = miss || color ? '' : estPh(p, 'front', true);
    return `<span class="est-sp is-spine${cls}"${attrs} style="--plat:${platVisual(p.platformId).color};${style}position:relative;width:${w.toFixed(1)}px;height:${h.toFixed(1)}px">${miss ? '' : estBandHTML(banda, bh, false) + estSpineLabel(p, w, h - bh, false, bh / 2)}</span>`;
  }).join('')}</div><p class="est-ms-cap">${escapeHTML(t('est.lomo') + ': ' + (S.lomo===undefined && S.banda===undefined ? t('est.as_platform') : estLomoText(S.lomo===undefined ? 'portada' : S.lomo, S.banda || '')))}</p>`;
}
function estMultiColorRefresh(){
  if(!isSheetKind('est-mcolor')) return;
  estSheetPart('estMcPrev', estMultiColorPrevHTML());
  estSheetPart('estMcEd', estColorEditorHTML('multi'));
  estHydratePhotos(document.getElementById('sheetBody'));
}
function estMultiColorApply(){
  const S = estMC; if(!S) return;
  estMC = null;
  closeSheet();
  estBulk(items=>{
    const prods = items.filter(x=> !x.p.isFolder);
    prods.forEach(x=>{ estSetColor('piece', x.pid, 'lomo', S.lomo); estSetColor('piece', x.pid, 'banda', S.banda); });
    return { n:prods.length };
  }, 'est.multi_done_n');
}

/* =====================================================================
   12. SACARLA DE LA BALDA (v11.13, pantalla completa)
   ---------------------------------------------------------------------
   Al tocar una pieza, sale de su sitio y se pone delante, en grande; con
   el dedo (o el ratón) se gira en 3D, con dos dedos o la rueda se acerca,
   y «Salir» la devuelve a su sitio con la misma animación.
   ===================================================================== */
let estPullState = null;
/* La postura que tiene en la balda (misma forma de giro que la de delante, para que la animación sea limpia) */
function estPullPoseRot(it, b, cover){
  if(cover) return { tf:'rotateX(0deg) rotateY(0deg) rotateZ(0deg) rotateY(0deg)', ry:0 };
  if(b.pose==='tumbado') return { tf:`rotateX(0deg) rotateY(${it.rot || 0}deg) rotateZ(-90deg) rotateY(90deg)`, ry:it.rot || 0 };
  return { tf:`rotateX(0deg) rotateY(${b.ang}deg) rotateZ(0deg) rotateY(0deg)`, ry:b.ang };
}
function estPullOut(pid, srcEl){
  const p = PRODUCTS_BY_ID[pid]; if(!p) return;
  estCloseInspect(true);
  const loc = estFind(pid), it = loc ? estSurface(loc.m, loc.sid).items[loc.i] : { pid };
  const b = estItemBox(it, p), d0 = b.dims;
  const pv = platVisual(p.platformId), ph = shownPhotoId(p), miss = p.possession!=='tengo';
  const face = (cls, fw, fh, tf, attrs, inner, style)=> `<div class="est-f est-pc ${cls}"${attrs || ''} style="width:${fw.toFixed(1)}px;height:${fh.toFixed(1)}px;margin:${(-fh / 2).toFixed(1)}px 0 0 ${(-fw / 2).toFixed(1)}px;transform:${tf};${style || ''}">${inner || ''}</div>`;
  const phA = (side)=> !miss && hasPhoto(ph, side) ? ` data-ph="${escapeHTML(ph)}|${side}|full"` : '';
  const front = miss ? (typeof planoCoverHTML==='function' ? planoCoverHTML(p) : '<span class="est-ghost-q">?</span>') : `<span class="est-cover-txt"><b>${escapeHTML(pv.code)}</b>${escapeHTML(p.name)}</span>`;
  const n = copyCount(p), c = shownCopy(p);
  const sub = p.possession==='tengo' ? [n > 1 ? t('est.have_n').replace('{n}', n) : t('est.have'), copyLine(p, c)].join(' · ') : t('cover.missing');
  const root = document.createElement('div');
  root.id = 'estPull'; root.className = 'est-pull is-start';
  root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-labelledby', 'estPullT');
  root.innerHTML = `<div class="est-pull-bg" aria-hidden="true"></div>
    <div class="est-pull-stage" id="estPullStage" aria-hidden="true"><div class="est-pull-obj" id="estPullObj"><div class="est-pull-rot${miss ? ' is-ghost' : ''}" id="estPullRot" style="--plat:${pv.color}"></div></div></div>
    <div class="est-pull-info"><h2 id="estPullT">${escapeHTML(p.name)}</h2><p>${escapeHTML([p.platformName, p.year].filter(Boolean).join(' · '))}<br>${escapeHTML(sub)}</p><p class="est-pull-tip">${t('est.pull_tip')}</p></div>
    <div class="est-pull-foot">
      <button type="button" class="btn est-pull-ficha" onclick="estPullFicha()">${icon('box')} ${t('est.open_ficha')}</button>
      <button type="button" class="btn primary est-pull-exit" data-fk="pull-exit" onclick="estPullBack()">${t('est.pull_exit')}</button>
    </div>`;
  document.body.appendChild(root);
  // su tamaño: el del sitio que queda para ella (en horizontal y en pantallas bajas, también cabe)
  const S = estPullScaleFor(d0);
  const w = d0.w * S, h = d0.h * S, d = Math.max(4, d0.d * S);
  const arT = d0.d / Math.max(0.1, d0.h), arW = d0.w / Math.max(0.1, d0.d);
  const fill = estSpineFill(p, { ar: arT }), bh = fill.band ? estBandPx(h, S) : 0;
  const obj = root.querySelector('#estPullObj'), rot = root.querySelector('#estPullRot');
  rot.innerHTML = `${face('is-front' + (miss ? ' is-miss' : ''), w, h, `translateZ(${(d / 2).toFixed(1)}px)`, phA('front'), front)}
      ${face('is-back', w, h, `rotateY(180deg) translateZ(${(d / 2).toFixed(1)}px)`, phA('back'), '')}
      ${face('is-spine' + fill.cls, d, h, `rotateY(-90deg) translateZ(${(w / 2).toFixed(1)}px)`, fill.attrs, miss ? '' : estBandHTML(fill.band, bh, false) + estSpineLabel(p, d, h - bh, false, bh / 2), fill.style)}
      ${face('is-edge', d, h, `rotateY(90deg) translateZ(${(w / 2).toFixed(1)}px)`, estSidePh(p, 'canto', arT), '')}
      ${face('is-top', w, d, `rotateX(90deg) translateZ(${(h / 2).toFixed(1)}px)`, estSidePh(p, 'arriba', arW), '')}
      ${face('is-top is-bottom', w, d, `rotateX(-90deg) translateZ(${(h / 2).toFixed(1)}px)`, estSidePh(p, 'abajo', arW), '')}`;
  // de dónde sale: su sitio en la balda (se queda vacío mientras está fuera)
  const src = srcEl && srcEl.closest ? (srcEl.closest('.est-pz, .est-cv, .est-sp') || null) : null;
  const pose = estPullPoseRot(it, b, !!(src && src.classList.contains('est-cv')));
  const st = { pid, rx:-10, ry:-28, z:1, fit:1, S0:S, d0, bigH: b.hgt * S, src, pose, ret: document.activeElement, closing:false };
  estPullState = st;
  st.start = estPullStartFor(st, st.bigH);
  estHydratePhotos(root);
  estPullApply();
  // si gira la pantalla o cambia de tamaño, se ajusta a lo que hay
  st.onResize = ()=>{ if(estPullState!==st || st.closing) return; st.fit = estPullScaleFor(st.d0) / st.S0; estPullApply(); };
  addEventListener('resize', st.onResize);
  if(st.start && !reducedMotion() && obj.animate){
    // primero sale de la balda hacia ti (algo más grande) y luego viene al centro girando
    const f = estPullFrames(st);
    root.classList.add('is-opening');
    st.anims = [
      obj.animate([{ transform:f.s0, easing:'cubic-bezier(.3,.55,.45,1)' }, { transform:f.s1, offset:0.3, easing:'cubic-bezier(.25,.8,.25,1)' }, { transform:obj.style.transform }], { duration:860 }),
      rot.animate([{ transform:pose.tf, easing:'cubic-bezier(.3,.55,.45,1)' }, { transform:f.r1, offset:0.3, easing:'cubic-bezier(.25,.8,.25,1)' }, { transform:rot.style.transform }], { duration:860 })
    ];
    st.anims[0].onfinish = ()=>{ if(st.anims){ st.anims = null; } root.classList.remove('is-opening'); };
  }
  void root.offsetWidth;
  root.classList.remove('is-start');
  if(src) src.classList.add('is-out');
  estPullBind(root, st);
  setTimeout(()=>{ const bt = root.querySelector('.est-pull-exit'); if(bt) bt.focus({ preventScroll:true }); }, 60);
}
/* Escala (px por cm) para que quepa en el escenario de la pieza sacada */
function estPullScaleFor(d0){
  const stg = document.getElementById('estPullStage');
  const r = stg ? stg.getBoundingClientRect() : { width:innerWidth, height:innerHeight * 0.6 };
  const room = Math.max(60, Math.min(r.width * 0.7, r.height * 0.74));
  return room / Math.max(d0.w, d0.h, 0.1);
}
/* Dónde y de qué tamaño se ve en la balda (para salir de ahí y volver ahí) */
function estPullStartFor(st, bigH){
  if(!st.src || !document.contains(st.src)) return null;
  // la pieza es un punto en 3D: lo que ocupa en pantalla es la suma de sus caras
  let r = st.src.getBoundingClientRect();
  if(!r.width || !r.height){
    let l = Infinity, tp = Infinity, rt = -Infinity, bt = -Infinity;
    st.src.querySelectorAll('.est-pc').forEach(f=>{ const q = f.getBoundingClientRect(); if(!q.width && !q.height) return; l = Math.min(l, q.left); tp = Math.min(tp, q.top); rt = Math.max(rt, q.right); bt = Math.max(bt, q.bottom); });
    if(!isFinite(l)) return null;
    r = { left:l, top:tp, width:rt - l, height:bt - tp };
  }
  if(!r.width || !r.height) return null;
  const stage = document.getElementById('estPullStage'); if(!stage) return null;
  const sr = stage.getBoundingClientRect();
  const cx = sr.left + sr.width / 2, cy = sr.top + sr.height * 0.5;
  return { tx: r.left + r.width / 2 - cx, ty: r.top + r.height / 2 - cy, k: Math.max(0.03, Math.min(1, r.height / Math.max(1, bigH))) };
}
/* Los pasos de la animación: en la balda (s0), recién sacada hacia ti (s1, un poco
   más grande y con un leve giro) y, al final, delante y de tres cuartos */
function estPullFrames(st){
  const s = st.start, at = (tx, ty, z)=> `translate(${tx.toFixed(1)}px, ${ty.toFixed(1)}px) scale(${z.toFixed(4)})`;
  return { s0: at(s.tx, s.ty, s.k), s1: at(s.tx * 0.9, s.ty * 0.9 - 8, Math.min(1.3, s.k * 1.16)), r1: st.pose.tf.replace('rotateX(0deg)', 'rotateX(-7deg)') };
}
/* Si estaba saliendo y la tocas, termina de salir al momento */
function estPullSettle(st){
  if(!st || !st.anims) return;
  st.anims.forEach(a=>{ try{ a.finish(); }catch(e){} }); st.anims = null;
}
function estPullApply(){
  const S = estPullState; if(!S) return;
  const obj = document.getElementById('estPullObj'), rot = document.getElementById('estPullRot'); if(!obj || !rot) return;
  obj.style.transform = `translate(0px, 0px) scale(${(S.z * (S.fit || 1)).toFixed(4)})`;
  rot.style.transform = `rotateX(${S.rx.toFixed(2)}deg) rotateY(${S.ry.toFixed(2)}deg) rotateZ(0deg) rotateY(0deg)`;
}
/* Girar (arrastrando, con inercia), acercar (dos dedos, rueda) y volver a como salió (doble toque) */
function estPullBind(root, st){
  const stg = root.querySelector('#estPullStage');
  const pts = new Map();
  let drag = null, pinch = null, vel = { x:0, y:0 }, raf = 0;
  const stopInertia = ()=>{ if(raf){ cancelAnimationFrame(raf); raf = 0; } };
  const touched = ()=> root.classList.add('is-touched');
  stg.addEventListener('pointerdown', (e)=>{
    if(st.closing) return;
    estPullSettle(st); stopInertia(); touched();
    pts.set(e.pointerId, { x:e.clientX, y:e.clientY });
    try{ stg.setPointerCapture(e.pointerId); }catch(_){}
    if(pts.size===2){ const [a, b] = [...pts.values()]; pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, z0: st.z }; drag = null; }
    else if(pts.size===1) drag = { x:e.clientX, y:e.clientY, t:performance.now() };
  });
  stg.addEventListener('pointermove', (e)=>{
    if(!pts.has(e.pointerId) || st.closing) return;
    pts.set(e.pointerId, { x:e.clientX, y:e.clientY });
    if(pinch && pts.size >= 2){ const [a, b] = [...pts.values()]; st.z = Math.min(2.6, Math.max(0.5, pinch.z0 * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d0)); estPullApply(); return; }
    if(!drag) return;
    const now = performance.now(), dt = Math.max(8, now - drag.t);
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    st.ry += dx * 0.5; st.rx = Math.max(-89, Math.min(89, st.rx - dy * 0.5));
    vel = { x: dx / dt, y: dy / dt };
    drag = { x:e.clientX, y:e.clientY, t:now };
    estPullApply();
  });
  const up = (e)=>{
    pts.delete(e.pointerId);
    if(pts.size < 2) pinch = null;
    if(pts.size===1){ const [a] = [...pts.values()]; drag = { x:a.x, y:a.y, t:performance.now() }; return; }
    if(pts.size || !drag) { drag = null; return; }
    drag = null;
    if(reducedMotion() || st.closing) return;
    // sigue girando un poco y se para sola
    let vx = vel.x * 16, vy = vel.y * 16;
    const step = ()=>{ if(estPullState!==st || st.closing){ raf = 0; return; } vx *= 0.93; vy *= 0.93; st.ry += vx * 0.5; st.rx = Math.max(-89, Math.min(89, st.rx - vy * 0.5)); estPullApply(); raf = Math.abs(vx) + Math.abs(vy) > 0.05 ? requestAnimationFrame(step) : 0; };
    raf = requestAnimationFrame(step);
  };
  stg.addEventListener('pointerup', up);
  stg.addEventListener('pointercancel', up);
  stg.addEventListener('dblclick', ()=>{ estPullReset(); });
  stg.addEventListener('wheel', (e)=>{ e.preventDefault(); estPullSettle(st); touched(); st.z = Math.min(2.6, Math.max(0.5, st.z * Math.exp(-e.deltaY * 0.0015))); estPullApply(); }, { passive:false });
  root.addEventListener('keydown', (e)=>{
    if(st.closing) return;
    const k = e.key;
    if(/^(Arrow|\+|=|-|_|0)/.test(k)) estPullSettle(st);
    const rotk = { ArrowLeft:[0, -15], ArrowRight:[0, 15], ArrowUp:[15, 0], ArrowDown:[-15, 0] }[k];
    if(rotk){ e.preventDefault(); touched(); st.rx = Math.max(-89, Math.min(89, st.rx + rotk[0])); st.ry += rotk[1]; estPullAnimTo(); return; }
    if(k==='+' || k==='='){ e.preventDefault(); st.z = Math.min(2.6, st.z * 1.2); estPullApply(); return; }
    if(k==='-' || k==='_'){ e.preventDefault(); st.z = Math.max(0.5, st.z / 1.2); estPullApply(); return; }
    if(k==='0'){ e.preventDefault(); estPullReset(); }
  });
}
function estPullAnimTo(){
  const root = document.getElementById('estPull'); if(!root) return;
  if(!reducedMotion()){ root.classList.add('is-anim'); clearTimeout(root._animT); root._animT = setTimeout(()=> root.classList.remove('is-anim'), 700); }
  estPullApply();
}
function estPullReset(){ const S = estPullState; if(!S || S.closing) return; S.rx = -10; S.ry = -28; S.z = 1; estPullAnimTo(); }
/* «Salir»: vuelve a su sitio en la balda con la misma animación, al revés */
function estPullBack(){
  const S = estPullState; if(!S || S.closing) return;
  const root = document.getElementById('estPull'); if(!root){ estPullState = null; return; }
  S.closing = true;
  const obj = root.querySelector('#estPullObj'), rot = root.querySelector('#estPullRot');
  // si aún estaba saliendo, vuelve desde donde esté
  let curObj = null, curRot = null;
  if(S.anims){ curObj = getComputedStyle(obj).transform; curRot = getComputedStyle(rot).transform; S.anims.forEach(a=>{ try{ a.cancel(); }catch(e){} }); S.anims = null; }
  S.start = estPullStartFor(S, S.bigH);
  if(!S.start || reducedMotion() || !obj.animate){ estPullClose(); return; }
  root.classList.remove('is-anim', 'is-opening');
  // el giro más corto de vuelta a su postura
  const base = S.pose.ry, ry = base + ((((S.ry - base) % 360) + 540) % 360 - 180);
  curObj = curObj || `translate(0px, 0px) scale(${(S.z * (S.fit || 1)).toFixed(4)})`;
  curRot = curRot || `rotateX(${S.rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) rotateZ(0deg) rotateY(0deg)`;
  const f = estPullFrames(S);
  obj.style.transform = f.s0; rot.style.transform = S.pose.tf;
  root.classList.add('is-end');
  const opt = { duration:780, fill:'forwards' };
  const a = obj.animate([{ transform:curObj, easing:'cubic-bezier(.45,0,.3,1)' }, { transform:f.s1, offset:0.7, easing:'cubic-bezier(.4,0,.6,1)' }, { transform:f.s0 }], opt);
  rot.animate([{ transform:curRot, easing:'cubic-bezier(.45,0,.3,1)' }, { transform:f.r1, offset:0.7, easing:'cubic-bezier(.4,0,.6,1)' }, { transform:S.pose.tf }], opt);
  let done = false;
  const finish = ()=>{ if(done) return; done = true; if(estPullState===S) estPullClose(); };
  a.onfinish = finish;
  setTimeout(finish, 1100);
}
function estPullClose(silent){
  const S = estPullState; estPullState = null;
  if(S && S.onResize) removeEventListener('resize', S.onResize);
  const root = document.getElementById('estPull'); if(root) root.remove();
  if(S && S.src) S.src.classList.remove('is-out');
  _trimBig.splice(0).forEach(u=>{ try{ URL.revokeObjectURL(u); }catch(e){} });
  if(!silent && S){
    const back = S.ret && S.ret!==document.body && document.contains(S.ret) ? S.ret : document.getElementById('estRail');
    if(back && back.focus) try{ back.focus({ preventScroll:true }); }catch(e){}
  }
}
function estPullFicha(){ const S = estPullState; if(!S) return; const pid = S.pid; estPullClose(true); goProduct(pid); }
