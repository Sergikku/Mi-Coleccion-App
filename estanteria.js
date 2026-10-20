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
                   de dentro no están en ninguna balda.
   v11.16 (se añaden; nada se quita ni se renombra):
     item.apoyo  = la cara en la que se apoya: de pie ('abajo', por defecto),
                   'arriba' (al revés) o, tumbada (pose 'tumbado'), 'trasera'
                   (boca arriba, por defecto), 'portada' (boca abajo), 'lomo'
                   (sobre el lomo) o 'canto' (sobre el otro lado).
     item.z      = su fondo en la balda (cm desde el borde de delante); sin z,
                   delante o detrás según su fila (y se sigue guardando la fila).
     item.sobre  = true: va encima de lo que tenga debajo (una o varias piezas),
                   en su x y su z; si debajo no hay nada, en la balda.
     mueble.hueco = cm libres a su izquierda en la sala (sin él, como siempre).
     sala        = { items:[…] }: piezas en el suelo de la sala, fuera de los
                   muebles (x desde la izquierda de la sala, z desde delante).
     piso        = el suelo de la sala: 'tarima' | 'tarima-oscura' | 'baldosa' | 'moqueta'. */

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
const EST_APOYOS = ['abajo', 'trasera', 'portada', 'lomo', 'canto', 'arriba'];   // v11.16: la cara en la que se apoya
const EST_PISOS = ['tarima', 'tarima-oscura', 'baldosa', 'moqueta'];              // v11.16: el suelo de la sala
const EST_T = 1.8;            // grosor de tableros (cm)
const EST_PLINTH = 8, EST_CROWN = 6, EST_GAP = 0.35, EST_FRONT = 1.5;
const EST_TOP_H = 60;         // alto útil encima del mueble (cm)
const EST_MAX_BALDAS = 12;
/* v11.16: la sala (el suelo, fuera de los muebles) */
const EST_FLOOR = 'suelo';     // el «mueble» del suelo de la sala (no se guarda como mueble)
const EST_SALA_D = 90;         // fondo del suelo que se usa (cm, desde delante hasta la pared)
const EST_SALA_GAP = 24;       // entre dos muebles, si no se ha cambiado (cm)
const EST_SALA_PAD = 30;       // suelo libre a cada lado, si no se ha cambiado (cm)
const EST_FLOOR_H = 200;       // alto útil en el suelo (cm)
const EST_MAX_HUECO = 400;
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
    // v11.16
    if('apoyo' in it){ const ok = it.pose==='tumbado' ? ['portada', 'lomo', 'canto'].includes(it.apoyo) : it.apoyo==='arriba'; if(!ok) delete it.apoyo; }
    if('z' in it){ const z = Number(it.z); if(isFinite(z)) it.z = Math.round(Math.min(300, Math.max(0, z)) * 10) / 10; else delete it.z; }
    if('sobre' in it && it.sobre!==true) delete it.sobre;
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
    // v11.16: el hueco a su izquierda en la sala (solo si se ha cambiado)
    if('hueco' in m){ const h = Number(m.hueco); if(isFinite(h)) m.hueco = Math.round(Math.min(EST_MAX_HUECO, Math.max(0, h))); else delete m.hueco; }
  });
  // v11.16: el suelo de la sala y su estilo (solo si ya los hay)
  if('sala' in E){
    if(!estIsObj(E.sala)) E.sala = { items:[] };
    E.sala.items = estCleanItems(E.sala.items);
    if('derecha' in E.sala){ const h = Number(E.sala.derecha); if(isFinite(h)) E.sala.derecha = Math.round(Math.min(EST_MAX_HUECO, Math.max(0, h))); else delete E.sala.derecha; }
    // (cada pieza en un solo sitio: si además está en un mueble, manda el mueble)
    if(E.sala.items.length){
      const inMueble = new Set();
      E.muebles.forEach(m=> [m.encima].concat(m.baldas).forEach(sf=> sf.items.forEach(it=> inMueble.add(it.pid))));
      for(let i = E.sala.items.length - 1; i >= 0; i--) if(inMueble.has(E.sala.items[i].pid)) estSpliceItem(E.sala, i);
    }
  }
  if('piso' in E && !EST_PISOS.includes(E.piso)) delete E.piso;
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
    if(inside.size && estIsObj(E.sala)) for(let i = E.sala.items.length - 1; i >= 0; i--) if(inside.has(E.sala.items[i].pid)) estSpliceItem(E.sala, i);
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
  estSettleAll();
  _estGen++;
  if(_estUndo && _estUndo.gen!==_estGen){ dismissToast(_estUndo.el); _estUndo = null; }
  clearTimeout(_estSaveTimer);
  if(now) return estFlush();
  _estSaveTimer = setTimeout(estFlush, 450);
}
/* v11.16: la que iba encima de algo y se ha quedado en la balda (sin nada debajo) vuelve a
   ser una pieza de la balda, en el mismo sitio: así choca con las demás como siempre y
   nada se le mete debajo (lo que lleve encima sigue encima) */
function estSettleAll(){
  const E = estData(); if(!E.muebles.length) return;
  const todo = [];
  E.muebles.forEach(m=> [['top', m.encima]].concat(m.baldas.map(b=>[b.id, b])).forEach(([sid, sf])=>{ if(sf.items.some(it=> it.sobre)) todo.push([m, sid]); }));
  if(estSalaItems().some(it=> it.sobre)) todo.push([estFloorM(), 'top']);
  todo.forEach(([m, sid])=> estSettle(m, sid));
}
function estSettle(m, sid){
  const sf = estSurface(m, sid); if(!sf || !sf.items.some(it=> it.sobre)) return;
  const L = estSurfLayout(m, sid);
  L.recs.filter(r=> r.free && r.y < 0.01).forEach(r=>{
    const it = r.it, deps = estRiders(L, [r], true).map(q=> q.it);
    delete it.sobre; delete it.apilado; it.x = estR1(r.x0); it.z = estR1(r.z0);
    if(r.z0 + r.b.fd / 2 > m.fondo / 2) it.fila = 'detras'; else delete it.fila;
    estInsertAfter(sf, [it].concat(deps), []);
  });
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
function estMueble(mid){ if(mid===EST_FLOOR) return estFloorM(); return estData().muebles.find(m=>m.id===mid) || null; }
/* ---------- La sala (v11.16) ---------- */
/* ¿Hay piezas en el suelo? */
function estSalaItems(){ const E = estData(); return estIsObj(E.sala) && Array.isArray(E.sala.items) ? E.sala.items : []; }
function estSalaHas(){ return estKnownCount(estSalaItems()) > 0; }
/* ¿Se ve la sala? (con dos muebles o más, o con algo en el suelo) */
function estSalaOn(){ const E = estData(); return E.muebles.length > 1 || (E.muebles.length > 0 && estSalaHas()); }
function estEnsureSala(){ const E = estEnsure(); if(!estIsObj(E.sala)) E.sala = { items:[] }; if(!Array.isArray(E.sala.items)) E.sala.items = []; return E.sala; }
/* El hueco a la izquierda de cada mueble (cm) y el suelo libre a la derecha del último */
function estHueco(m, i){ return typeof m.hueco==='number' ? m.hueco : (i ? EST_SALA_GAP : EST_SALA_PAD); }
function estSalaRight(){ const E = estData(); return estIsObj(E.sala) && typeof E.sala.derecha==='number' ? E.sala.derecha : EST_SALA_PAD; }
/* La sala en cm: dónde empieza cada mueble (x), su ancho por fuera y el ancho total */
function estRoom(){
  const E = estData(); let x = 0;
  const cabs = E.muebles.map((m, i)=>{ x += estHueco(m, i); const c = { m, x, w: m.ancho + 2 * EST_T }; x += c.w; return c; });
  // (el fondo del suelo: siempre medio metro libre por delante del mueble más hondo)
  return { cabs, end:x, W: x + estSalaRight(), D: Math.max(EST_SALA_D, ...E.muebles.map(m=> m.fondo + EST_T + 50)) };
}
/* El suelo como si fuera un mueble más (una sola superficie, «encima»): así se
   coloca, se elige y se edita como cualquier balda. Los muebles son lo que no se mueve. */
function estFloorM(){
  const R = estRoom(), E = estData();
  return { id:EST_FLOOR, isFloor:true, nombre:t('est.floor'), ancho:Math.max(30, R.W), fondo:R.D, madera:(E.muebles[0] || {}).madera || 'nogal', puertas:'sin', luz:'apagada', placas:'sin',
    encima: estIsObj(E.sala) && Array.isArray(E.sala.items) ? E.sala : { items:[] }, baldas:[] };
}
/* Lo que ocupan los muebles en el suelo (contra la pared) */
function estFloorObst(){
  const R = estRoom();
  return R.cabs.map(c=>({ x0:c.x, x1:c.x + c.w, z0:Math.max(0, R.D - c.m.fondo - EST_T), z1:R.D, ref:c.m.id }));
}
/* El nombre de dónde está algo (la balda, «encima» o el suelo) */
function estSurfName(m, sid, n){
  if(m && m.isFloor) return t('est.floor_s');
  return sid==='top' ? t('est.top') : t('est.balda_n').replace('{n}', n);
}
/* Superficie: 'top' (encima) o el id de una balda */
function estSurface(m, sid){ return !m ? null : sid==='top' ? m.encima : (m.baldas.find(b=>b.id===sid) || null); }
/* ¿Dónde está una pieza? */
function estFind(pid){
  for(const m of estData().muebles){
    let i = m.encima.items.findIndex(it=>it.pid===pid);
    if(i >= 0) return { m, sid:'top', i, n:0 };
    for(let k=0;k<m.baldas.length;k++){ i = m.baldas[k].items.findIndex(it=>it.pid===pid); if(i >= 0) return { m, sid:m.baldas[k].id, i, n:k + 1 }; }
  }
  // v11.16: en el suelo de la sala
  const i = estSalaItems().findIndex(it=>it.pid===pid);
  if(i >= 0) return { m:estFloorM(), sid:'top', i, n:0 };
  return null;
}
/* Lo que está en la estantería: lo colocado en las baldas y lo que hay dentro
   de las carpetas colocadas */
function estPlacedSet(){
  const s = new Set();
  const add = (it)=>{ s.add(it.pid); if(estIsFolderPid(it.pid)){ const f = estFolder(it.pid.slice(EST_FOLDER.length)); if(f) f.pids.forEach(p=>s.add(p)); } };
  estData().muebles.forEach(m=>{ m.encima.items.forEach(add); m.baldas.forEach(b=>b.items.forEach(add)); });
  estSalaItems().forEach(add);
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
  if(was && !was.apilado && !was.sobre && nx && nx.apilado && !nx.sobre){
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
  const S = estSalaItems();
  if(S.some(it=>it.pid===pid)){ const fm = estFloorM(); estFreeze(fm, 'top'); const i = S.findIndex(it=>it.pid===pid); if(i >= 0) estSpliceItem(fm.encima, i); }
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
  const apoyo = estApoyo(it);
  // lo que mide a lo ancho (ex), de alto y de fondo (ez) antes de girarla
  const [ex, ey, ez] = apoyo==='trasera' || apoyo==='portada' ? [d0.h, d0.d, d0.w] : apoyo==='lomo' || apoyo==='canto' ? [d0.h, d0.w, d0.d] : [d0.w, d0.h, d0.d];
  return { fw: ex * c + ez * s, fd: ex * s + ez * c, hgt: ey, dims:d0, pose, apoyo, ang: base + (it.rot || 0) };
}
/* v11.16: la cara en la que se apoya (de pie, al revés o, tumbada, sobre cualquiera de sus caras) */
function estApoyo(it){
  const a = it && it.apoyo;
  if(it && it.pose==='tumbado') return a==='portada' || a==='lomo' || a==='canto' ? a : 'trasera';
  return a==='arriba' ? 'arriba' : 'abajo';
}
/* El giro que la deja sobre esa cara: [rotateZ, rotateY] (antes de girarla a los lados) */
const EST_APOYO_TF = { abajo:[0, 0], arriba:[180, 0], trasera:[-90, 90], portada:[90, 90], lomo:[-90, 0], canto:[90, 0] };
/* (al revés: de lomo, el lomo sigue mirando hacia fuera, cabeza abajo; de frente, la portada) */
function estApoyoZY(b){ return b.apoyo==='arriba' && b.pose==='lomo' ? [180, 180] : (EST_APOYO_TF[b.apoyo] || [0, 0]); }
function estPoseTf(b){ const [z, y] = estApoyoZY(b); return `rotateX(0deg) rotateY(${b.ang}deg) rotateZ(${z}deg) rotateY(${y}deg)`; }
/* De fondo (cm desde el borde de delante): la fila de delante va pegada al
   frente; la de detrás, al fondo de la balda */
function estZRange(row, fd, D){
  if(!row) return [EST_FRONT, EST_FRONT + fd];
  const z0 = Math.max(EST_FRONT, D - 0.5 - fd);
  return [z0, z0 + fd];
}
function estZHit(a, b){ return a[1] > b[0] + 0.01 && b[1] > a[0] + 0.01; }
/* v11.16: el fondo de una columna con su propio z (si no, el de su fila) */
function estColZ(base, row, fd, D){
  if(base && typeof base.z==='number'){ const z0 = Math.min(Math.max(0, base.z), Math.max(0, D - fd)); return [z0, z0 + fd]; }
  return estZRange(row, fd, D);
}
/* Coloca una fila: columnas (una pieza y las apiladas encima). Cada columna va
   en su sitio (x) o, si no tiene, a continuación de la anterior de su fila.
   Dos columnas no pueden pisarse (choque): si una pisa a otra en su fila (o en
   la otra fila, si no caben las dos de fondo), se corre a la derecha.
   W = ancho, H = alto, D = fondo de la balda (cm). Devuelve la posición de
   cada pieza y lo que no cabe. */
function estLayout(items, W, H, D, obst){
  D = D || 32;
  const cols = [], out = [], free = [];
  items.forEach((it, idx)=>{
    const p = estP(it.pid); if(!p) return;
    const b = estItemBox(it, p);
    const rec = { it, idx, p, b, y:0 };
    // v11.16: «encima de lo que haya debajo»: se coloca después, sobre todo lo demás
    if(it.sobre){ free.push(rec); out.push(rec); return; }
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
    c.z = estColZ(c.base, c.row, c.fd, D);
    // (con su propio fondo, su fila es la mitad en la que está)
    if(typeof c.base.z==='number') c.row = (c.z[0] + c.z[1]) / 2 > D / 2 ? 1 : 0;
    cur[c.row] = c.want + c.fw + EST_GAP;
  });
  // sin pisarse: de izquierda a derecha, la que pisa a otra ya colocada se corre
  // (v11.16: lo que no se mueve, como los muebles en el suelo de la sala, ya está colocado)
  const fixed = (obst || []).map(o=>({ x:o.x0, fw:o.x1 - o.x0, z:[o.z0, o.z1], fixed:true, ref:o.ref }));
  const done = fixed.slice();
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
    c.items.forEach(r=>{
      r.x = c.x + c.fw / 2; r.colW = c.fw; r.row = c.row; r.col = c;
      const z = typeof c.base.z==='number' ? [c.z[0], c.z[0] + r.b.fd] : estZRange(c.row, r.b.fd, D);
      r.zc = (z[0] + z[1]) / 2; r.x0 = r.x - r.b.fw / 2; r.x1 = r.x + r.b.fw / 2; r.z0 = z[0]; r.z1 = z[1];
    });
    used = Math.max(used, c.x + c.fw + EST_GAP);
    if(c.x + c.fw > W + 0.06) c.items.forEach(r=> over.push(r.p.id));   // (v11.17: medio milímetro de redondeo no es salirse)
    else if(c.top > H + 0.01) c.items.forEach(r=> tall.push(r.p.id));
  });
  // v11.16: las que van «encima de lo que haya debajo», por su orden en la lista (como si
  // se fueran dejando caer): cada una, sobre lo más alto que tenga debajo (una o varias
  // piezas; si no hay nada, en la balda). La app mantiene ese orden al moverlas
  const placed = out.filter(r=> !r.it.sobre);
  const yAt = (r)=>{ let y = 0; placed.forEach(q=>{ if(r.x0 < q.x1 - 0.01 && q.x0 < r.x1 - 0.01 && r.z0 < q.z1 - 0.01 && q.z0 < r.z1 - 0.01) y = Math.max(y, q.y + q.b.hgt); }); return y; };
  free.forEach(r=>{
    const it = r.it, fw = r.b.fw, fd = r.b.fd;
    let x0 = Math.min(Math.max(0, typeof it.x==='number' ? it.x : 0), Math.max(0, W - fw));
    const z0 = Math.min(Math.max(0, typeof it.z==='number' ? it.z : EST_FRONT), Math.max(0, D - fd));
    // (nunca dentro de lo que no se mueve: se corre a su derecha)
    for(let g = 0, mv = true; mv && g < 50; g++){ mv = false; fixed.forEach(q=>{ if(estZHit([z0, z0 + fd], q.z) && x0 < q.x + q.fw - 0.01 && q.x < x0 + fw - 0.01){ x0 = q.x + q.fw + EST_GAP; mv = true; } }); }
    r.x0 = x0; r.x1 = x0 + fw; r.z0 = z0; r.z1 = z0 + fd;
  });
  for(const r of free){
    const fw = r.b.fw, fd = r.b.fd, x0 = r.x0, z0 = r.z0, y = yAt(r);
    r.free = true; r.y = y; r.x = x0 + fw / 2; r.zc = z0 + fd / 2;
    r.row = r.zc > D / 2 ? 1 : 0; r.colW = fw; r.col = null;
    placed.push(r);
    used = Math.max(used, x0 + fw + EST_GAP);
    if(x0 + fw > W + 0.06) over.push(r.p.id);
    else if(y + r.b.hgt > H + 0.01) tall.push(r.p.id);
  }
  return { recs:out, cols, used, over, tall, free, fixed };
}
function estR1(v){ return Math.round(v * 10) / 10; }
/* Fija el sitio de cada columna tal y como se ve (al tocar una balda por
   primera vez y antes de cada cambio): así mover una no corre las demás. Si
   una se ensanchó y empujó a sus vecinas, ese es ya su sitio (no vuelven
   solas a donde estaban cuando luego cambias otra cosa). Deja la fila
   ordenada (delante y luego detrás, de izquierda a derecha). */
function estFreeze(m, sid){
  const sf = estSurface(m, sid); if(!sf) return null;
  estSettle(m, sid);   // v11.16: (antes de cambiar nada, lo que se quedó en la balda vuelve a ser de la balda)
  const L = estSurfLayout(m, sid);
  L.cols.forEach(c=>{ c.base.x = estR1(c.x); delete c.base.dx; if(c.row) c.base.fila = 'detras'; else delete c.base.fila; });
  estSortRow(sf, L);
  return sf;
}
/* Ordena la fila: delante y luego detrás, de izquierda a derecha (según se
   ven, si se pasa L; si no, según su sitio guardado) */
function estSortRow(sf, L){
  const groups = estColumns(sf.items).map(([a, b])=> sf.items.slice(a, b + 1));
  const shown = new Map(); if(L) L.cols.forEach(c=> shown.set(c.base, c.x));
  const key = (g, i)=>{ const base = g.find(it=> estKnown(it) && !it.apilado) || g[0];
    return [base.fila==='detras' ? 1 : 0, shown.has(base) ? shown.get(base) : typeof base.x==='number' ? base.x : 1e6]; };
  const keyed = groups.map((g, i)=>({ g, i, k:key(g, i) }));
  keyed.sort((a, b)=> a.k[0] - b.k[0] || a.k[1] - b.k[1] || a.i - b.i);
  const flat = [].concat(...keyed.map(o=>o.g));
  sf.items.splice(0, sf.items.length, ...flat);
}
/* Lo que ocupa sitio para la columna c en una fila (las de su fila y, si no
   caben de fondo, las de la otra): [[desde, hasta], …] */
function estObstacles(L, c, row, D){
  // (en su misma fila, con su propio fondo si lo tiene)
  const z = row===c.row && c.base && typeof c.base.z==='number' && c.z ? c.z : estZRange(row, c.fd, D);
  return L.cols.concat(L.fixed || []).filter(q=> q!==c && estZHit(z, q.z)).map(q=>[q.x, q.x + q.fw])
    .concat(estLowFree(L, c.top, z, [c]).map(r=>[r.x0, r.x1])).sort((a, b)=> a[0] - b[0]);
}
/* v11.16: las de encima de algo que están más bajas que lo alto de una columna (top cm): no
   se puede meter debajo de ellas (salvo lo que va encima de las columnas de «own», que se
   mueve con ellas) */
function estLowFree(L, top, z, own){
  if(!L.free || !L.free.length) return [];
  const base = [].concat(...(own || []).filter(q=> q && q.items).map(q=> q.items));
  const ex = new Set(base.length ? estRiders(L, base, true) : []);
  return L.free.filter(r=> !ex.has(r) && r.y < top - 0.01 && estZHit(z, [r.z0, r.z1]));
}
/* v11.16: lo mismo para una pieza que aún no tiene sitio en esa fila (b = lo que ocupa),
   mirando dónde están las demás AHORA (sin que ella las empuje); skip = la columna suya */
function estObstaclesFor(L, b, row, D, skip){
  const z = estZRange(row, b.fd, D);
  return L.cols.concat(L.fixed || []).filter(q=> q!==skip && estZHit(z, q.z)).map(q=>[q.x, q.x + q.fw])
    .concat(estLowFree(L, skip ? skip.top : b.hgt, z, skip ? [skip] : []).map(r=>[r.x0, r.x1])).sort((a, c)=> a[0] - c[0]);
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
  const z = c.z || estZRange(c.row, c.fd, D);
  return L.cols.concat(L.fixed || []).every(q=> q===c || (skip && skip.includes(q)) || !estZHit(z, q.z) || x + c.fw <= q.x + 0.01 || x >= q.x + q.fw - 0.01)
    && estLowFree(L, c.top, z, [c].concat(skip || [])).every(r=> x + c.fw <= r.x0 + 0.01 || x >= r.x1 - 0.01);
}
function estSurfaceH(m, sid){ if(m && m.isFloor) return EST_FLOOR_H; if(sid==='top') return EST_TOP_H; const b = estSurface(m, sid); return b ? b.alto : 0; }
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
  if(EST.mid===EST_FLOOR && estSalaOn()) return EST.mid;   // v11.16: el suelo de la sala
  if(EST.mid===EST_FLOOR){ EST.mid = E.muebles[0].id; if(EST.view==='balda'){ EST.view = 'mueble'; EST.sel = null; } }   // (ya no hay sala: al mueble)
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
/* v11.16: qué cara se ve de frente con la pieza apoyada así (y cuánto va girada): { face, rot } */
function estFrontFace(b){
  const [Z, Y] = estApoyoZY(b), A = Math.round(b.ang / 90) * 90;
  const rad = (d)=> d * Math.PI / 180;
  const rY = (v, a)=>{ const c = Math.cos(rad(a)), s = Math.sin(rad(a)); return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c]; };
  const rZ = (v, a)=>{ const c = Math.cos(rad(a)), s = Math.sin(rad(a)); return [v[0] * c - v[1] * s, v[0] * s + v[1] * c, v[2]]; };
  const T = (v)=> rY(rZ(rY(v, Y), Z), A);
  const F = { front:{ n:[0, 0, 1], up:[0, -1, 0] }, back:{ n:[0, 0, -1], up:[0, -1, 0] }, spine:{ n:[-1, 0, 0], up:[0, -1, 0] }, edge:{ n:[1, 0, 0], up:[0, -1, 0] }, top:{ n:[0, -1, 0], up:[0, 0, -1] }, bottom:{ n:[0, 1, 0], up:[0, 0, 1] } };
  let face = 'front', bz = -2;
  Object.keys(F).forEach(k=>{ const n = T(F[k].n); if(n[2] > bz + 1e-6){ bz = n[2]; face = k; } });
  const u = T(F[face].up);
  return { face, rot: ((Math.round(Math.atan2(u[0], -u[1]) * 180 / Math.PI / 90) * 90) % 360 + 360) % 360 };
}
/* v11.16: plana (mueble entero), apoyada sobre una cara que no es la de siempre: la cara
   que se ve de frente, con su foto o su color, girada como esté */
function estFlatAnyHTML(r, s, selPid){
  const p = r.p, b = r.b, d0 = b.dims, pv = platVisual(p.platformId);
  const miss = p.possession!=='tengo';
  const w = b.fw * s, h = b.hgt * s;
  const left = (r.x - b.fw / 2) * s, bottom = r.y * s;
  const { face, rot } = estFrontFace(b);
  const tex = { front:[d0.w, d0.h], back:[d0.w, d0.h], spine:[d0.d, d0.h], edge:[d0.d, d0.h], top:[d0.w, d0.d], bottom:[d0.w, d0.d] }[face];
  const tw = tex[0] * s, th = tex[1] * s;
  let attrs = '', style = '', cls = '', inner = '';
  if(miss) inner = '';
  else if(p.isFolder){ style = `background-color:${p.folder.color};`; cls = estLum(p.folder.color) > 0.62 ? ' is-light' : ''; if(face==='front') inner = estFolderCoverHTML(p.folder); else if(face==='spine') inner = estFolderSpineLabel(p, tw, th, false); }
  else if(face==='front') attrs = estPh(p, 'front', false);
  else if(face==='back') attrs = estPh(p, 'back', false);
  else if(face==='spine'){
    const f = estSpineFill(p, { ar: tw / Math.max(1, th) });
    attrs = f.attrs; style = f.style; cls = f.cls + ' is-spine-in';
    const bh = f.band ? estBandPx(th, s) : 0;
    inner = estBandHTML(f.band, bh, false) + estSpineLabel(p, tw, th - bh, false, bh / 2);
  }
  else attrs = estSidePh(p, face==='edge' ? 'canto' : face==='top' ? 'arriba' : 'abajo', tw / Math.max(1, th));
  const sel = p.id===selPid, film = !miss && estSealed(p) ? EST_FILM : '';
  return `<span class="est-sp is-any is-f-${face}${p.isFolder ? ' is-folder' : ''}${film ? ' is-sealed' : ''}${r.row ? ' is-back' : ''}${miss ? ' is-ghost' : ''}${sel ? ' is-sel' : ''}${estIsMsel(p.id) ? ' is-msel' : ''}" data-pid="${escapeHTML(p.id)}" style="--plat:${pv.color};${film ? `--h:${estFilmH0(p.id)};` : ''}left:${left.toFixed(1)}px;bottom:${bottom.toFixed(1)}px;width:${w.toFixed(1)}px;height:${h.toFixed(1)}px">`
    + (miss ? '<span class="est-ghost-q">?</span>' : `<span class="est-sp-in${cls}"${attrs} style="${style}width:${tw.toFixed(1)}px;height:${th.toFixed(1)}px;transform:translate(-50%,-50%) rotate(${rot}deg)">${inner}</span>`) + film + `</span>`;
}
/* Una pieza plana (vista del mueble entero): lo que se ve de frente */
function estFlatHTML(r, s, selPid){
  if(r.b.apoyo!=='abajo' && r.b.apoyo!=='trasera') return estFlatAnyHTML(r, s, selPid);   // v11.16
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
  const film = !miss && estSealed(p) ? EST_FILM : '';   // v11.18
  return `<span class="est-sp is-${face}${p.isFolder ? ' is-folder' : ''}${film ? ' is-sealed' : ''}${r.row ? ' is-back' : ''}${miss ? ' is-ghost' : ''}${p.id===selPid ? ' is-sel' : ''}${estIsMsel(p.id) ? ' is-msel' : ''}${cls}" data-pid="${escapeHTML(p.id)}"${attrs} style="--plat:${pv.color};${film ? `--h:${estFilmH0(p.id)};` : ''}${style}left:${left.toFixed(1)}px;bottom:${bottom.toFixed(1)}px;width:${w.toFixed(1)}px;height:${h.toFixed(1)}px">${inner}${film}</span>`;
}
/* Una pieza como caja (de cerca): 5 caras, con sus fotos; las de detrás no se pintan */
/* Orden de pintado: primero las más alejadas de tus ojos (a los lados), así
   cada una tapa el lado de la de al lado, como en una estantería de verdad */
/* (las de la fila de detrás, siempre antes que las de delante) */
/* v11.18: las precintadas llevan su film: una capa encima de cada cara, con un brillo de
   plástico y un reflejo de luz (v11.18.1: blanco) que cambia de sitio según dónde la mires (--h, de −1
   a 1: en la balda, lo lejos que está de ti; sacada, cómo la giras; en el mueble entero,
   quieto, en un sitio distinto en cada una). No cambia ningún dato. */
const EST_FILM = '<i class="est-film" aria-hidden="true"></i>';
function estSealed(p){ return !!p && !p.isFolder && p.possession==='tengo' && typeof shownSealed==='function' && shownSealed(p); }
function estFilmH(d){ return Math.max(-1, Math.min(1, d / 260)).toFixed(2); }
function estFilmH0(id){ let h = 0; for(let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0; return ((Math.abs(h) % 161) / 100 - 0.8).toFixed(2); }
function estZ(x, eyeX, back, up){ return Math.max(1, 3000 - Math.round(Math.abs(x - eyeX)) - (back ? 1500 : 0) + Math.min(80, Math.round((up || 0) * 2))); }
function estBoxHTML(r, X, Y, Z, s, sel, eyeX){
  const p = r.p, b = r.b, d0 = b.dims, pv = platVisual(p.platformId);
  const fill = estSpineFill(p, { ar: d0.d / Math.max(0.1, d0.h) });
  const bh = fill.band ? estBandPx(d0.h * s, s) : 0;
  const folder = p.isFolder ? p.folder : null;
  const miss = p.possession!=='tengo';
  const w = d0.w * s, h = d0.h * s, d = d0.d * s;
  // la postura va en cada cara (no en el contenedor): así el navegador sabe
  // siempre qué pieza tocas, también la que tienes justo delante
  // (v11.16: sobre la cara en la que se apoya; de pie o tumbada boca arriba, como siempre)
  const pose = b.apoyo==='abajo' ? `rotateY(${b.ang}deg)` : b.apoyo==='trasera' ? `rotateY(${r.it.rot || 0}deg) rotateZ(-90deg) rotateY(90deg)` : estPoseTf(b).replace('rotateX(0deg) ', '');
  const lift = sel ? ` translateZ(${(2 * s).toFixed(1)}px)` : '';
  const at = `translate3d(${X.toFixed(1)}px,${Y.toFixed(1)}px,${Z.toFixed(1)}px)${lift}`;
  const q = miss ? '<span class="est-ghost-q">?</span>' : '';
  const msel = estIsMsel(p.id);
  const film = !miss && estSealed(p) ? EST_FILM : '';
  const cls = `est-pz is-${b.pose}${film ? ' is-sealed' : ''}${r.it.rot ? ' is-rot' : ''}${miss ? ' is-ghost' : ''}${sel ? ' is-sel' : ''}${msel ? ' is-msel' : ''}${b.pose==='tumbado' ? ' is-flat' : ''}${b.apoyo!=='abajo' && b.apoyo!=='trasera' ? ' is-ap-' + b.apoyo : ''}${folder ? ' is-folder' : ''}${r.row ? ' is-back' : ''}${r.y > 0.01 ? ' is-up' : ''}`;
  // la elegida: una marca encima, para verla de un vistazo
  const mark = sel || msel ? `<span class="est-mark${msel ? ' is-check' : ''}" style="transform:translate(-50%,-100%) translate3d(0,${(-(b.hgt * s) / 2 - 8).toFixed(1)}px,${((b.fd * s) / 2).toFixed(1)}px)" aria-hidden="true"></span>` : '';
  // una carpeta: su color en todas las caras; de frente, su nombre
  const fst = folder ? `background-color:${folder.color};` : '';
  const fcl = folder && estLum(folder.color) > 0.62 ? ' is-light' : '';
  const front = folder ? estFolderCoverHTML(folder) : miss ? q : `<span class="est-cover-txt"><b>${escapeHTML(pv.code)}</b>${escapeHTML(p.name)}</span>`;
  return `<div class="${cls}" data-pid="${escapeHTML(p.id)}" data-x="${X.toFixed(0)}" data-row="${r.row ? 1 : 0}" data-up="${Math.round(r.y || 0)}" title="${escapeHTML(p.name)}" style="--plat:${pv.color};${film ? `--h:${Number.isFinite(eyeX) ? estFilmH(X - eyeX) : estFilmH0(p.id)};` : ''}z-index:${sel ? 3100 : estZ(X, eyeX, r.row, r.y)};transform:${at}">`
    + estFace(w, h, `${pose} translateZ(${(d / 2).toFixed(1)}px)`, 'est-pc is-front' + fcl, fst, front + film, estPh(p, 'front'))
    + estFace(w, h, `${pose} rotateY(180deg) translateZ(${(d / 2).toFixed(1)}px)`, 'est-pc is-back', fst, film, estPh(p, 'back'))
    + estFace(d, h, `${pose} rotateY(-90deg) translateZ(${(w / 2).toFixed(1)}px)`, 'est-pc is-spine' + fill.cls, fill.style, (miss ? q : estBandHTML(fill.band, bh, false) + (folder ? estFolderSpineLabel(p, d, h) : estSpineLabel(p, d, h - bh, false, bh / 2) || q)) + film, fill.attrs)
    + estFace(d, h, `${pose} rotateY(90deg) translateZ(${(w / 2).toFixed(1)}px)`, 'est-pc is-edge', fst, film, estSidePh(p, 'canto', d0.d / Math.max(0.1, d0.h)))
    + estFace(w, d, `${pose} rotateX(90deg) translateZ(${(h / 2).toFixed(1)}px)`, 'est-pc is-top', fst, film, estSidePh(p, 'arriba', d0.w / Math.max(0.1, d0.d)))
    // v11.14: la base solo si tiene foto (sin ella no se ve: está apoyada)
    + (folder || miss || !hasPhoto(shownPhotoId(p), 'abajo') ? '' : estFace(w, d, `${pose} rotateX(-90deg) translateZ(${(h / 2).toFixed(1)}px)`, 'est-pc is-top is-bottom', '', film, estSidePh(p, 'abajo', d0.w / Math.max(0.1, d0.d))))
    + mark + `</div>`;
}
/* Una balda (o «encima»): la caja con su luz y las piezas.
   o = { lite, eyeX, eyeY (px, respecto a la balda), P (perspectiva), selPid, open } */
function estBayHTML(m, sid, sf, w, h, s, o){
  const D = m.fondo * s;
  const H = estSurfaceH(m, sid);
  const L = estLayout(sf.items, m.ancho, H, m.fondo, estSurfObst(m, sid));
  const b = sid==='top' || m.isFloor ? null : estSurface(m, sid);
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
  if(o.floor){
    // v11.16: el suelo de la sala: la pared al fondo, el suelo, y los muebles (no se mueven)
    inner += `<div class="est-bk is-wall" style="width:${w.toFixed(1)}px;height:${(h * 3).toFixed(1)}px;top:${(-h * 2).toFixed(1)}px;transform:translateZ(${(-D).toFixed(1)}px)"></div>`;
    // (el suelo sigue hacia ti, por delante de la balda)
    const E = o.P * 0.7;
    inner += `<div class="est-fl is-room" data-piso="${estData().piso || 'tarima'}" style="top:${h.toFixed(1)}px;width:${w.toFixed(1)}px;height:${(D + E).toFixed(1)}px;transform:translateZ(${E.toFixed(1)}px) rotateX(-90deg)"></div>`;
    (L.fixed || []).forEach(q=> inner += estObstBoxHTML(q, h, s, o.eyeX));
  }
  // piezas (las de la fila de detrás, primero)
  const zFront = -EST_FRONT * s;
  const recs = L.recs.filter(r=>r.row).concat(L.recs.filter(r=>!r.row)).sort((a, b)=> (b.row - a.row) || ((a.y > 0.01) - (b.y > 0.01)));
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
/* v11.16: un mueble visto desde el suelo de la sala: una caja de madera (no se mueve) */
function estObstBoxHTML(q, h, s, eyeX){
  const m = estMueble(q.ref); if(!m) return '';
  const wood = EST_WOODS[m.madera];
  const H = estMuebleHeight(m), w = q.fw * s, d = (q.z[1] - q.z[0]) * s, hh = H * s;
  const X = (q.x + q.fw / 2) * s, Y = h - hh / 2, Z = -((q.z[0] + q.z[1]) / 2) * s;
  const pl = EST_PLINTH * s;
  return `<div class="est-obst" data-x="${X.toFixed(0)}" data-row="1" style="z-index:${estZ(X, eyeX, true, 0)};transform:translate3d(${X.toFixed(1)}px,${Y.toFixed(1)}px,${Z.toFixed(1)}px)" aria-hidden="true">`
    // (de frente, el mueble tal cual, con lo que tiene: solo para verlo, no se toca desde aquí)
    + estFace(w, hh, `translateZ(${(d / 2).toFixed(1)}px)`, 'est-obst-f', `background-color:${wood.f};--pl:${pl.toFixed(1)}px;--e:${wood.e}`, estCabinetHTML(m, s, { lite:true, noTop:true }).html.replace(/ data-(pid|sid|mid)="[^"]*"/g, ''))
    + estFace(d, hh, `rotateY(-90deg) translateZ(${(w / 2).toFixed(1)}px)`, 'est-obst-s', `background-color:${wood.s}`, '')
    + estFace(d, hh, `rotateY(90deg) translateZ(${(w / 2).toFixed(1)}px)`, 'est-obst-s', `background-color:${wood.s}`, '')
    + `</div>`;
}
/* Lo más alto que hay en el suelo (para verlo de cerca) */
function estFloorUsedH(){
  const fm = estFloorM(), L = estSurfLayout(fm, 'top');
  return Math.max(30, Math.min(EST_FLOOR_H, Math.max(0, ...L.recs.map(r=> r.y + r.b.hgt)) + 8));
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
  return Math.max(0, ...L.recs.map(r=> r.y + r.b.hgt)) + 2;
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
  if(EST.view==='sala' && estSalaOn()) return estSalaSceneHTML(W, IMM, H0, TOPI, BOTI, maxH);
  const m = estMueble(estMid()); if(!m) return '';
  if(EST.view==='balda') return estBaldaSceneHTML(m);
  if(m.isFloor){ EST.view = 'sala'; return estSceneHTML(); }   // (el suelo se ve en la sala)
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
  // v11.16: la pared con su luz y su rodapié, y el suelo que se aleja hasta ella
  const yWall = base - m.fondo * EST_SALA_K * s, skirt = Math.max(3, 7 * s * 0.6);
  return `<div class="est-wall-light" style="height:${yWall.toFixed(1)}px" aria-hidden="true"></div><div class="est-floor is-room" data-piso="${E.piso || 'tarima'}" style="top:${yWall.toFixed(1)}px;--fh:${Math.max(20, (IMM ? H0 : stH) - yWall).toFixed(0)}px"><i class="est-floor-tex"></i></div><div class="est-skirt" style="top:${(yWall - skirt).toFixed(1)}px;height:${skirt.toFixed(1)}px" aria-hidden="true"></div>
    <div class="est-place" style="left:${((W - c.W) / 2).toFixed(1)}px;top:${(base - c.H).toFixed(1)}px;width:${c.W.toFixed(1)}px;height:${c.H.toFixed(1)}px">${c.html}<span class="est-shadow"></span></div>`;
}
/* v11.16: la sala, más real: la pared con su rodapié y su luz, el suelo (según su
   estilo) que se aleja hacia la pared, y en él los muebles (cada uno con su hueco a
   la izquierda) y lo que hayas puesto en el suelo, cada cosa a su fondo.
   (1 cm de fondo del suelo se ve como EST_SALA_K cm de alto) */
const EST_SALA_K = 0.3;
function estSalaSceneHTML(W, IMM, H0, TOPI, BOTI, maxH){
  const E = estData(), st = estStageEl(), K = EST_SALA_K;
  const R = estRoom(), fm = estFloorM(), FL = estSurfLayout(fm, 'top');
  const D = R.D;
  // lo más alto (en cm, desde el borde de delante del suelo)
  const cabH = R.cabs.map(c=> estMuebleHeight(c.m) + Math.min(EST_TOP_H, estTopUsed(c.m)));
  const tallest = Math.max(40, ...R.cabs.map((c, i)=> (D - c.m.fondo) * K + cabH[i]), ...FL.recs.map(r=> r.z0 * K + r.y + r.b.hgt));
  const FRONT = 16, TOPM = 30;
  let s = (W * 0.94) / R.W;
  let stH = Math.round(tallest * s + TOPM + FRONT);
  if(IMM){
    // pantalla completa: los muebles grandes (casi uno por pantalla en el móvil) y la sala se desliza
    const room = H0 - TOPI - BOTI;
    s = Math.min((room - FRONT - 10) / tallest, Math.max(s, (W * 0.8) / Math.max(...R.cabs.map(c=> c.w))));
    stH = H0;
  } else {
    if(stH > maxH){ s = (maxH - TOPM - FRONT) / tallest; stH = maxH; }
    stH = Math.max(stH, 260);
    if(st) st.style.height = stH + 'px';
  }
  EST.s = s;
  const stripW = IMM ? Math.max(W, R.W * s + W * 0.16) : W;
  const x0 = (stripW - R.W * s) / 2;
  const yF = IMM ? Math.round(TOPI + (H0 - TOPI - BOTI - tallest * s) / 2 + tallest * s + 4) : stH - FRONT;
  const yWall = yF - D * K * s;
  const skirt = Math.max(3, 7 * s * 0.6);
  const edit = EST.mode==='editar';
  let html = `<div class="est-wall-light" style="height:${yWall.toFixed(1)}px" aria-hidden="true"></div>`
    + `<div class="est-floor is-room" data-floor="1" data-piso="${E.piso || 'tarima'}" style="top:${yWall.toFixed(1)}px;--fh:${Math.max(20, (IMM ? H0 : stH) - yWall).toFixed(0)}px"><i class="est-floor-tex"></i></div>`
    + `<div class="est-skirt" style="top:${(yWall - skirt).toFixed(1)}px;height:${skirt.toFixed(1)}px" aria-hidden="true"></div>`;
  R.cabs.forEach((c, i)=>{
    const m = c.m, cab = estCabinetHTML(m, s, { lite:true });
    const bottom = yWall + m.fondo * K * s;
    html += `<div class="est-place is-tap${edit ? ' is-drag' : ''}" data-mid="${escapeHTML(m.id)}" data-i="${i}" style="left:${(x0 + c.x * s).toFixed(1)}px;top:${(bottom - cab.H).toFixed(1)}px;width:${cab.W.toFixed(1)}px;height:${cab.H.toFixed(1)}px" title="${escapeHTML(m.nombre)}">${cab.html}<span class="est-shadow"></span><span class="est-place-name">${escapeHTML(m.nombre)}</span></div>`;
  });
  // lo que hay en el suelo: lo de más al fondo, primero
  if(FL.recs.length){
    const recs = FL.recs.slice().sort((a, b)=> (b.z0 - a.z0) || (a.y - b.y));
    html += `<div class="est-floor-run" style="left:${x0.toFixed(1)}px;top:0;width:${(R.W * s).toFixed(1)}px;height:${yF.toFixed(1)}px">${recs.map(r=> estFlatHTML(Object.assign({}, r, { y: r.y + r.z0 * K, row:0 }), s, null).replace('class="est-sp', 'class="est-sp is-onfloor')).join('')}</div>`;
  }
  if(stripW > W + 1) return `<div class="est-scroll is-sala"><div class="est-strip" style="width:${stripW.toFixed(1)}px;height:${stH}px">${html}</div></div>`;
  return html;
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
  const Hcm = m.isFloor ? estFloorUsedH() : sid==='top' ? Math.max(20, estTopUsed(m) + 4) : sf.alto;
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
  let html = `<div class="est-strip${sid==='top' ? ' is-top' : ''}${m.isFloor ? ' is-floor' : ''}" style="width:${stripW.toFixed(1)}px;height:${stH}px">`;
  // la pared se ve detrás de «encima»; en las baldas, el mueble alrededor; en el suelo, el suelo
  if(m.isFloor){
    html += `<div class="est-floor is-room is-near" data-piso="${estData().piso || 'tarima'}" style="top:${(yTop + h).toFixed(1)}px;--fh:${Math.max(20, stH - yTop - h).toFixed(0)}px"><i class="est-floor-tex"></i></div>`;
  } else if(sid!=='top'){
    html += `<div class="est-wood est-board is-up" style="${wst};left:${pad.toFixed(1)}px;top:${(yTop - T * 1.4).toFixed(1)}px;width:${(w + 2 * T).toFixed(1)}px;height:${(T * 1.4).toFixed(1)}px"></div>`;
    html += `<div class="est-wood est-board is-down" style="${wst};left:${pad.toFixed(1)}px;top:${(yTop + h).toFixed(1)}px;width:${(w + 2 * T).toFixed(1)}px;height:${(T * 1.6).toFixed(1)}px"></div>`;
    html += `<div class="est-wood est-side" style="${wst};left:${pad.toFixed(1)}px;top:${(yTop - T * 1.4).toFixed(1)}px;width:${T.toFixed(1)}px;height:${(h + T * 3).toFixed(1)}px"></div>`;
    html += `<div class="est-wood est-side is-r" style="${wst};left:${(pad + T + w).toFixed(1)}px;top:${(yTop - T * 1.4).toFixed(1)}px;width:${T.toFixed(1)}px;height:${(h + T * 3).toFixed(1)}px"></div>`;
  } else {
    html += `<div class="est-wood est-crown" style="${wst};left:${(pad - 1.2 * s).toFixed(1)}px;top:${(yTop + h).toFixed(1)}px;width:${(w + 2 * T + 2.4 * s).toFixed(1)}px;height:${(EST_CROWN * s).toFixed(1)}px"></div>`;
  }
  html += `<div class="est-slot is-near" style="left:${(pad + T).toFixed(1)}px;top:${yTop.toFixed(1)}px">${EST.covers ? estCoversHTML(m, sf, w, h) : estBayHTML(m, sid, sf, w, h, s, { lite:false, open: sid==='top', floor: !!m.isFloor, eyeX, eyeY: h * 0.45, P: Math.max(700, 150 * s), selPid: EST.sel && EST.sel.mid===m.id ? EST.sel.pid : null })}</div>`;
  if(plate && txt && sid!=='top' && !m.isFloor){
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
    const film = !miss && estSealed(p) ? EST_FILM : '';   // v11.18
    return `<span class="est-cv${film ? ' is-sealed' : ''}${miss ? ' is-ghost' : ''}${sel ? ' is-sel' : ''}" data-pid="${escapeHTML(p.id)}"${estPh(p, 'front')} title="${escapeHTML(p.name)}" style="--plat:${pv.color};${film ? `--h:${estFilmH0(p.id)};` : ''}width:${cw.toFixed(1)}px;height:${ch.toFixed(1)}px">${miss ? '<span class="est-ghost-q">?</span>' : `<span class="est-cover-txt"><b>${escapeHTML(pv.code)}</b>${escapeHTML(p.name)}</span>`}<span class="est-cv-name">${escapeHTML(p.name)}</span>${film}</span>`;
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
  if(estBookState && estBookState.src){
    const el = sc.querySelector(`[data-pid="${CSS.escape(EST_FOLDER + estBookState.cid)}"]`);
    estBookState.src = el ? (el.closest('.est-pz, .est-cv, .est-sp') || el) : null;
    if(estBookState.src) estBookState.src.classList.add('is-out');
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
      bay.querySelectorAll('.est-pz:not(.is-sel), .est-obst').forEach(el=>{ el.style.zIndex = estZ(Number(el.dataset.x) || 0, x, el.dataset.row==='1', Number(el.dataset.up) || 0); });
    });
    clearTimeout(scr._railT); scr._railT = setTimeout(estUpdateRail, 60);
    // v11.18: el reflejo de las precintadas va a su sitio nuevo al parar (deslizando, nada se repinta)
    clearTimeout(scr._filmT); scr._filmT = setTimeout(()=> estFilmFollow(scr), 90);
  }, { passive:true });
}
/* v11.18: el reflejo de cada precintada de la balda, según lo lejos que está de ti */
function estFilmFollow(scr){
  const bay = scr.querySelector('.est-slot.is-near .est-bay'); if(!bay) return;
  const pad = Number(scr.dataset.pad) || 0, T = Number(scr.dataset.t) || 0, x = scr.scrollLeft + scr.clientWidth / 2 - pad - T;
  bay.querySelectorAll('.est-pz.is-sealed').forEach(el=>{ const h = estFilmH((Number(el.dataset.x) || 0) - x); if(el.style.getPropertyValue('--h')!==h) el.style.setProperty('--h', h); });
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
/* v11.16: el suelo de cerca, centrado en una pieza (o junto al último mueble) */
function estScrollFloor(pid){
  const scr = document.querySelector('#estScene .est-scroll'); if(!scr) return;
  const el = pid ? scr.querySelector(`[data-pid="${CSS.escape(pid)}"]`) : null;
  if(el){ scr.scrollLeft = estScrollTargetFor(el, scr); return; }
  const pad = Number(scr.dataset.pad) || 0, T = Number(scr.dataset.t) || 0;
  scr.scrollLeft = Math.max(0, estRoom().end * EST.s + pad + T - scr.clientWidth / 2);
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
    const hit = e.target.closest('[data-pid], [data-sid], [data-mid], [data-floor]');
    const onSel = EST.view==='balda' && hit && hit.dataset.pid && EST.sel && hit.dataset.pid===EST.sel.pid && !EST.covers;
    // v11.16: editando, en la sala, un mueble se arrastra a los lados (más junto o más separado)
    const cab = !onSel && EST.view==='sala' && EST.mode==='editar' && hit ? hit.closest('.est-place.is-drag') : null;
    const scr = scroller();
    // con el ratón, arrastrar la balda la desliza (en el móvil ya lo hace el dedo)
    const pan = !onSel && !cab && e.pointerType==='mouse' && scr ? scr.scrollLeft : null;
    g = { x0:e.clientX, y0:e.clientY, hit, onSel, cab, moved:false, id:e.pointerId, pan };
    if(onSel || cab || pan!==null){ try{ st.setPointerCapture(e.pointerId); }catch(_){} }
  });
  st.addEventListener('pointermove', (e)=>{
    if(!g || e.pointerId!==g.id) return;
    const dx = e.clientX - g.x0, dy = e.clientY - g.y0;
    if(!g.moved && Math.hypot(dx, dy) < 10) return;
    g.moved = true;
    if(g.pan!==null){ const scr = scroller(); if(scr) scr.scrollLeft = g.pan - dx; return; }
    // v11.16: la pieza elegida se arrastra a los lados y, de arriba abajo, hacia el fondo o hacia delante
    if(g.onSel){
      g.drag = true; g.dx = dx; g.dy = dy;
      const [ux, uz] = estDragAxes(dx, dy);
      st.querySelectorAll(`#estScene [data-pid="${CSS.escape(EST.sel.pid)}"]`).forEach(el=>{ el.style.translate = `${ux.toFixed(1)}px 0 ${uz.toFixed(1)}px`; });
    }
    if(g.cab && (g.cdrag || Math.abs(dx) > Math.abs(dy))){ g.cdrag = true; g.dx = dx; g.cab.style.translate = `${dx.toFixed(1)}px 0`; }
  });
  const end = (e)=>{
    if(!g || e.pointerId!==g.id) return;
    const gg = g; g = null;
    if(gg.drag){
      const [ux, uz] = estDragAxes(gg.dx, gg.dy);
      const cm = ux / EST.s, dz = -uz / EST.s;
      // un toque algo movido (menos de medio centímetro) no mueve la pieza
      if(e.type==='pointerup' && (Math.abs(cm) >= 0.5 || Math.abs(dz) >= 0.5)) estDragEnd(Math.abs(cm) >= 0.5 ? cm : 0, Math.abs(dz) >= 0.5 ? dz : 0); else estDraw();
      return;
    }
    if(gg.cdrag){
      const cm = gg.dx / EST.s;
      if(e.type==='pointerup' && Math.abs(cm) >= 1) estSalaDragEnd(Number(gg.cab.dataset.i), cm); else estDraw();
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
/* El arrastre de la pieza elegida: a los lados (x) y, de arriba abajo, de fondo (z, en px;
   hacia arriba = hacia el fondo). Si el gesto es casi solo de un lado, solo ese. */
function estDragAxes(dx, dy){
  if(Math.abs(dy) < Math.abs(dx) * 0.35) dy = 0;
  else if(Math.abs(dx) < Math.abs(dy) * 0.35) dx = 0;
  return [dx, dy * 1.4];
}
/* v11.16: un mueble arrastrado en la sala: cambia su hueco; el de su derecha se queda donde estaba (si cabe) */
function estSalaDragEnd(i, cm){ if(estSalaGuard(()=> estSalaDragEnd_(i, cm))===false) estDraw(); }
function estSalaDragEnd_(i, cm){
  const M = estData().muebles, m = M[i]; if(!m) return;
  const h = estHueco(m, i), v = Math.round(Math.max(0, Math.min(EST_MAX_HUECO, h + cm)));
  const d = v - h; if(!d){ estDraw(); return; }
  m.hueco = v;
  const nx = M[i + 1];
  if(nx) nx.hueco = Math.max(0, estHueco(nx, i + 1) - d);
  else { const S = estEnsureSala(); S.derecha = Math.max(0, estSalaRight() - d); }
  estSalaRedraw();
}
/* Un toque en el escenario */
function estTap(el){
  if(EST.view==='sala'){
    // v11.16: lo que hay en el suelo (o el suelo): se ve de cerca
    const fEl = el && el.closest('.est-floor-run [data-pid]');
    if(fEl || (el && el.closest('[data-floor]'))){ EST.mid = EST_FLOOR; EST.fromSala = true; estEnterBalda('top', fEl ? fEl.dataset.pid : null); return; }
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
    if(pid){ const f = estFind(pid); if(f){ estEnterBalda(f.sid, pid); if(estIsFolderPid(pid)){ const cid = pid.slice(EST_FOLDER.length); requestAnimationFrame(()=> requestAnimationFrame(()=>{ if(estFolder(cid) && !estInspectOpen()) estOpenBook(cid, null, ver); })); } return; } }
    const bay = el && el.closest('[data-sid]');
    if(bay) estEnterBalda(bay.dataset.sid, null);
    return;
  }
  // pantalla completa: tocar una pieza la saca de la balda (una carpeta se abre)
  if(ver){
    if(pid && estFind(pid)){ if(estIsFolderPid(pid)) estOpenBook(pid.slice(EST_FOLDER.length), null, true, el); else estPullOut(pid, el); }
    return;
  }
  // dentro de una balda: elegir (o soltar) una pieza; una carpeta se abre
  // (y queda elegida, para moverla al cerrarla)
  if(pid){
    const f = estFind(pid);
    if(f && estIsFolderPid(pid)){ if(!EST.sel || EST.sel.pid!==pid) estSelect({ mid:f.m.id, sid:f.sid, idx:f.i, pid }); estOpenBook(pid.slice(EST_FOLDER.length), null, false, el); return; }
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
  // (en el suelo, sin ninguna en concreto: donde está lo que hay en él o, si no hay nada, junto al último mueble)
  const floorTo = m.isFloor && !EST.sel && !EST.focusPid ? (estSalaItems().find(estKnown) || {}).pid || '' : null;
  requestAnimationFrame(()=>{
    if(EST.sel) estScrollToSel(false); else if(floorTo!==null) estScrollFloor(floorTo); else estShowFocus();
    const st = estStageEl(); if(st && !estImm() && st.getBoundingClientRect().top < 0) st.scrollIntoView({ block:'start' });
  });
}
function estEnterAnim(){
  if(reducedMotion()) return;
  const sc = document.getElementById('estScene'); if(!sc) return;
  sc.classList.remove('is-enter'); void sc.offsetWidth; sc.classList.add('is-enter');
}
function estExitBalda(){
  if(EST.mid===EST_FLOOR){ EST.mid = null; estMid(); EST.view = 'sala'; EST.sel = null; EST.covers = false; render(); estEnterAnim(); return; }   // v11.16: del suelo, a la sala
  EST.view = 'mueble'; EST.sel = null; EST.covers = false; estDraw(); estRefreshPanel(); estEnterAnim();
}
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
  if(EST.view==='mueble' && EST.fromSala && estSalaOn()){ estShowSala(); return true; }
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
function estAfterEdit(){ if(_estHold){ _estHeld = true; return; } estSave(); estDraw(); estRefreshPanel(); }
/* v11.16: lo que va encima de otra cosa se mueve con ella. Mientras se cambia algo, se
   guarda lo que lleva encima cada columna (y cada pieza de encima); después, lo que
   llevaba encima se corre lo mismo que se ha corrido ella. Se dibuja una sola vez. */
let _estHold = 0, _estHeld = false;
function estRiding(fn, groups){ return estInside(()=> estRiding_(fn, groups)); }
function estRiding_(fn, groups){
  const gs = groups || (()=>{ const x = estSelItem(); return x ? [{ m:x.m, sid:EST.sel.sid }] : []; })();
  const snaps = gs.map(g=> ({ g, s: estRiderSnap(g.m, g.sid) }));
  _estHold++;
  let r;
  try{ r = fn(); } finally { _estHold--; }
  snaps.forEach(o=> estRiderApply(o.g.m, o.g.sid, o.s));
  if(_estHeld && !_estHold){ _estHeld = false; estAfterEdit(); }
  return r;
}
/* Pone its (en ese orden) en la lista de la balda justo después del grupo (la pila) de
   la última de «after»; sin «after» (no va encima de nada), al final, en un grupo suyo */
function estInsertAfter(sf, its, after){
  its.forEach(it=>{ const k = sf.items.indexOf(it); if(k >= 0) sf.items.splice(k, 1); });
  let at = sf.items.length;
  const idx = after.map(it=> sf.items.indexOf(it)).filter(k=> k >= 0);
  if(idx.length){ const k = Math.max(...idx), g = estColumns(sf.items).find(([a, b])=> a <= k && k <= b); at = (g ? g[1] : k) + 1; }
  sf.items.splice(at, 0, ...its);
}
/* =====================================================================
   v11.17: nada se sale de la balda por los lados
   Cada cambio se comprueba: si deja alguna pieza (que antes no lo estaba) fuera
   de su balda, no se hace y se avisa (o, con fit, se le busca sitio en su balda:
   delante, detrás o encima; si no hay, en el suelo de la sala). Lo que ya
   estaba fuera no impide nada: «Meter las que se salen» lo coloca.
   ===================================================================== */
function estAllSurfaces(){
  const out = [];
  estData().muebles.forEach(m=> estSurfaceIds(m).forEach(sid=> out.push({ m, sid, key: m.id + '|' + sid })));
  if(estSalaItems().length) out.push({ m: estFloorM(), sid:'top', key: EST_FLOOR + '|top' });
  return out;
}
/* Las que se salen, por balda: Map('mueble|balda' → Set de piezas) */
function estOverMap(){
  const o = new Map();
  estAllSurfaces().forEach(S=>{ const sf = estSurface(S.m, S.sid); if(!sf || !sf.items.length) return; const L = estSurfLayout(S.m, S.sid); if(L.over.length) o.set(S.key, new Set(L.over)); });
  return o;
}
function estNewOver(before){
  const out = [];
  estOverMap().forEach((set, key)=>{ const b = before.get(key); set.forEach(pid=>{ if(!b || !b.has(pid)) out.push({ key, pid }); }); });
  return out;
}
let _estGuard = 0;
/* Hace fn; si deja alguna fuera de su balda, lo deshace todo y avisa (devuelve false).
   opts: pids (piezas cuyas medidas pueden cambiar), fit (buscarles sitio en vez de
   deshacer), msg (el aviso). fn puede devolver { revert:'clave' } para deshacerlo. */
function estInside(fn, opts){
  if(_estGuard) return fn();
  opts = opts || {};
  const before = estOverMap(), snap = JSON.stringify(OVERRIDES.estanterias || null), med = opts.pids && opts.pids.length ? estSnapMed(opts.pids) : null;
  _estGuard++; _estHold++;
  let r, moved = null;
  try{ r = fn(); }
  finally { _estGuard--; _estHold--; }
  let bad = r && r.revert ? [] : estNewOver(before);
  if(bad.length && opts.fit){ moved = estFitNewOver(bad, opts.fit!=='shelf'); bad = estNewOver(before); }
  if((r && r.revert) || bad.length){
    OVERRIDES.estanterias = JSON.parse(snap); _estClean = null; if(med) estRestoreMed(med);
    _estHeld = false;
    estSave(); if(view.page==='estanteria' && !view.productId){ estDraw(); estRefreshPanel(); }
    showToast(t(r && r.revert ? r.revert : opts.msg || 'est.no_room_edge'), { replace:true, duration:4500 });
    return false;
  }
  if(moved && (moved.shelf || moved.floor)){ _estHeld = true; _estLastFit = moved; showToast(estFitMsg(moved), { replace:true, duration:6000 }); }
  if(_estHeld && !_estHold){ _estHeld = false; estAfterEdit(); }
  return r;
}
function estFitMsg(mv){ return [mv.shelf ? estN('est.fit_shelf_n', mv.shelf) : '', mv.floor ? estN('est.fit_floor_n', mv.floor) : ''].filter(Boolean).join(' '); }
/* El texto con {n}, en singular si es 1 (clave + '1') */
function estN(key, n){ return (n===1 && I18N.es[key + '1'] ? t(key + '1') : t(key)).replace('{n}', n); }
/* Les busca sitio a las que se han salido: en su balda o (floor) en el suelo de la sala */
function estFitNewOver(list, floor){
  const res = { shelf:0, floor:0, left:0 };
  const overNow = (m, sid)=> estSurfLayout(m, sid).over.length;
  list.forEach(({ key, pid })=>{
    const i = key.lastIndexOf('|'), mid = key.slice(0, i), sid = key.slice(i + 1), m = estMueble(mid);
    if(!m || !estSurface(m, sid)) return;
    const n0 = overNow(m, sid), st = estFitOne(m, sid, pid);
    if(st==='ok') res.shelf += Math.max(1, n0 - overNow(m, sid));   // (las piezas, no las columnas)
    else if(st==='out' && floor && !m.isFloor){ estFitToFloor(pid); res.floor++; }
    else if(st==='out') res.left++;
  });
  return res;
}
/* Una pieza (con su columna) que se sale: a un hueco de su fila, de la otra fila o encima
   de otra pieza, dentro de la balda. 'in' si no se salía, 'ok' si ya cabe, 'out' si no */
function estFitOne(m, sid, pid){
  const sf = estSurface(m, sid), H = estSurfaceH(m, sid), W = m.ancho, D = m.fondo;
  let L = estSurfLayout(m, sid);
  if(!L.over.includes(pid)) return 'in';
  const r = L.recs.find(q=> q.p.id===pid), c = r && r.col; if(!c) return 'in';
  const its = c.items.map(q=> q.it), save = its.map(it=> JSON.stringify(it)), order = sf.items.slice();
  const restore = ()=>{ its.forEach((it, k)=>{ Object.keys(it).forEach(f=> delete it[f]); Object.assign(it, JSON.parse(save[k])); }); sf.items.splice(0, sf.items.length, ...order); };
  const okNow = ()=>{ const L2 = estSurfLayout(m, sid); return !its.some(it=> L2.over.includes(it.pid) || L2.tall.includes(it.pid)) && !L2.over.some(id=> !L.over.includes(id)) && !L2.tall.some(id=> !L.tall.includes(id)); };
  // 1) un hueco en su fila o en la otra (sin moverse de fondo)
  for(const row of [c.row, 1 - c.row]){
    const spot = estFreeSpot(estObstaclesFor(L, { fw:c.fw, fd:c.fd, hgt:c.top }, row, D, c), c.fw, Math.max(0, W - c.fw), W);
    if(spot!==null && spot + c.fw <= W + 0.01){
      c.base.x = spot; delete c.base.z; delete c.base.dx; if(row) c.base.fila = 'detras'; else delete c.base.fila;
      estSortRow(sf);
      if(okNow()) return 'ok';
      restore(); L = estSurfLayout(m, sid);
    }
  }
  // 2) encima de otra (centrada), donde quepa de alto, empezando por la más cercana al borde
  const cands = L.recs.filter(q=> !its.includes(q.it) && !L.over.includes(q.p.id) && q.y + q.b.hgt + c.top <= H + 0.01).sort((a, b)=> b.x - a.x);
  for(const q of cands){
    const cx = q.x0 + q.b.fw / 2, cz = q.z0 + q.b.fd / 2;
    its.forEach(it=>{ const b = estItemBox(it, estP(it.pid)); it.sobre = true; it.apilado = true; delete it.fila; delete it.dx;
      it.x = estR1(Math.min(Math.max(0, cx - b.fw / 2), Math.max(0, W - b.fw))); it.z = estR1(Math.min(Math.max(0, cz - b.fd / 2), Math.max(0, D - b.fd))); });
    estInsertAfter(sf, its, [q.it]);
    if(okNow()) return 'ok';
    restore();
  }
  return 'out';
}
/* Al suelo de la sala (si en él tampoco cabe, se amplía el suelo libre de la derecha) */
function estFitToFloor(pid){
  const f = estFind(pid); if(!f) return;
  const it = Object.assign({}, estSurface(f.m, f.sid).items[f.i]);
  estUnplace(pid); estFloorAdd([it]);
  const fm = estFloorM(), L = estSurfLayout(fm, 'top');
  if(L.over.includes(pid)){ const r = L.recs.find(q=> q.p.id===pid); const S = estEnsureSala(); S.derecha = Math.min(EST_MAX_HUECO, Math.ceil(estSalaRight() + (r.x1 - fm.ancho) + 2 * EST_GAP)); }
}
/* v11.17: si algo del suelo queda fuera de la sala (al quitar un mueble), se amplía el suelo libre de la derecha */
function estSalaKeepIn(){
  if(!estSalaItems().length) return;
  const fm = estFloorM(), L = estSurfLayout(fm, 'top'); if(!L.over.length) return;
  const x1 = Math.max(...L.recs.filter(r=> L.over.includes(r.p.id)).map(r=> r.x1));
  const S = estEnsureSala(); S.derecha = Math.min(EST_MAX_HUECO, Math.ceil(estSalaRight() + (x1 - fm.ancho) + 2 * EST_GAP));
}
/* Una pieza nueva en una balda: al final de la fila de delante o, si ahí no cabe, en el
   hueco libre más cercano (delante y, si no, detrás). Si no cabe en ningún sitio, al
   final (y el guardia dirá que no cabe) */
function estPlaceNew(m, sid, it){
  const sf = estSurface(m, sid); if(!sf) return;
  ['x', 'z', 'fila', 'sobre', 'apilado', 'dx'].forEach(k=> delete it[k]);
  if(m.isFloor){ estFloorAdd([it]); return; }
  const p = estP(it.pid), L = estSurfLayout(m, sid), W = m.ancho, D = m.fondo;
  sf.items.push(it);
  if(!p) return;
  const b = estItemBox(it, p);
  for(const row of [0, 1]){
    const end = L.cols.filter(c=> c.row===row && c.x + c.fw <= W + 0.01).reduce((a, c)=> Math.max(a, c.x + c.fw + EST_GAP), EST_GAP);
    const spot = estFreeSpot(estObstaclesFor(L, b, row, D), b.fw, end, W);
    if(spot!==null && spot + b.fw <= W + 0.01){ it.x = spot; if(row) it.fila = 'detras'; return; }
  }
}
/* Tras cambiar medidas de verdad (de una plataforma, una categoría o una pieza): las que
   ahora se salgan de su balda van a otro sitio de ella o, si no hay, al suelo de la sala.
   before = estOverMap() de antes. Devuelve lo que se ha movido (o null) */
function estKeepInside(before){
  if(!before) return null;
  const nw = estNewOver(before); if(!nw.length) return null;
  const mv = estFitNewOver(nw, true);
  return mv.shelf || mv.floor ? mv : null;
}
/* «Meter las que se salen» de una balda (con «Deshacer») */
function estFitSurface(mid, sid){
  const m = estMueble(mid); if(!estSurface(m, sid)) return;
  const est = JSON.stringify(OVERRIDES.estanterias);
  estFreeze(m, sid);
  const over = estSurfLayout(m, sid).over.slice();
  over.forEach(pid=>{ if(estSurfLayout(m, sid).over.includes(pid)) estFitOne(m, sid, pid); });
  const left = estSurfLayout(m, sid).over.length, ok = over.length - left;   // (piezas)
  estAfterEdit();
  const msg = [ok ? estN('est.fit_done', ok) : '', left ? estN('est.fit_left', left) : ''].filter(Boolean).join(' ');
  if(ok) estUndoToast(msg, est, [], null); else showToast(msg, { replace:true, duration:5000 });
}
/* Las de encima que se apoyan solo en estas (y las que van encima de ellas); con
   any, también las que se apoyan en ellas solo en parte */
function estRiders(L, base, any){
  const set = new Set(base), out = [];
  L.recs.forEach(r=>{
    if(!r.free || set.has(r) || r.y < 0.01) return;
    const sup = L.recs.filter(q=> q!==r && Math.abs(q.y + q.b.hgt - r.y) < 0.05 && q.x0 < r.x1 - 0.01 && r.x0 < q.x1 - 0.01 && q.z0 < r.z1 - 0.01 && r.z0 < q.z1 - 0.01);
    if(sup.length && (any ? sup.some(q=> set.has(q)) : sup.every(q=> set.has(q)))){ set.add(r); out.push(r); }
  });
  return out;
}
function estRiderSnap(m, sid){
  const sf = estSurface(m, sid); if(!sf) return null;
  const L = estSurfLayout(m, sid);
  const pick = (rs)=> rs.map(r=>({ it:r.it, x0:r.x0, z0:r.z0, fw:r.b.fw, fd:r.b.fd }));
  // cada pieza (de una columna o de encima), con su sitio, lo que lleva encima (solo
  // sobre ella: se mueve con ella) y lo que se apoya en ella aunque sea en parte. En una
  // pila de antes, las de encima de ella cuentan como suyas (por si dejan de ser pila)
  return L.recs.filter(r=> r.x0!=null).map(r=>{
    const up = r.col ? r.col.items.slice(r.col.items.indexOf(r) + 1) : [];
    const base = [r].concat(up);
    return { it:r.it, x0:r.x0, z0:r.z0, riders: pick(up.concat(estRiders(L, base))), deps: up.map(q=> q.it).concat(estRiders(L, base, true).map(q=> q.it)) };
  });
}
function estRiderApply(m, sid, S){
  if(!S || !S.length) return;
  const sf = estSurface(m, sid); if(!sf) return;
  const L = estSurfLayout(m, sid), W = m.ancho, D = m.fondo, done = new Set();
  const shift = (o, dx, dz)=> o.riders.forEach(q=>{
    if(done.has(q.it) || !sf.items.includes(q.it) || !q.it.sobre) return; done.add(q.it);
    q.it.x = estR1(Math.min(Math.max(0, q.x0 + dx), Math.max(0, W - q.fw)));
    q.it.z = estR1(Math.min(Math.max(0, q.z0 + dz), Math.max(0, D - q.fd)));
  });
  // (por orden; lo que ya se ha corrido con otra no se vuelve a mirar)
  const moved = new Set();
  S.forEach(o=>{
    if(done.has(o.it)) return;
    const r = L.recs.find(q=> q.it===o.it); if(!r) return;
    const dx = r.x0 - o.x0, dz = r.z0 - o.z0;
    if(Math.abs(dx) > 0.01 || Math.abs(dz) > 0.01){ shift(o, dx, dz); if(r.free) moved.add(o.it); }
  });
  done.forEach(it=> moved.add(it));
  // cada pieza de encima que ha cambiado de sitio (la que has movido y lo que llevaba
  // encima) va en la lista detrás de todo lo que tiene debajo en su sitio nuevo: así se
  // apoya en ello, lo que no has tocado no salta encima de ella y lo suyo sigue encima
  if(moved.size){
    const L2 = estSurfLayout(m, sid);
    S.forEach(o=>{
      if(!moved.has(o.it) || !sf.items.includes(o.it)) return;
      const r = L2.recs.find(q=> q.it===o.it); if(!r || !r.free) return;
      const its = [o.it].concat(o.deps.slice().sort((a, b)=> sf.items.indexOf(a) - sf.items.indexOf(b))).filter(it=> sf.items.includes(it));
      const set = new Set(its);
      const under = L2.recs.filter(q=> !set.has(q.it) && q.x0 < r.x1 - 0.01 && r.x0 < q.x1 - 0.01 && q.z0 < r.z1 - 0.01 && r.z0 < q.z1 - 0.01).map(q=> q.it);
      if(under.length) o.it.apilado = true; else delete o.it.apilado;
      estInsertAfter(sf, its, under);
    });
  }
  if(done.size || moved.size){ _estHeld = true; if(!_estHold){ _estHeld = false; estSave(); estDraw(); estRefreshPanel(); } }
}
/* La pieza elegida y su columna, con todo fijado en su sitio (para editar
   sin que se muevan las demás) */
function estSelCol(){
  if(!estSelItem()) return null;
  estFreeze(estMueble(EST.sel.mid), EST.sel.sid);
  const x = estSelItem(); if(!x) return null;
  const L = estSurfLayout(x.m, EST.sel.sid);
  // v11.16: la que va «encima de lo que haya debajo» no es de ninguna columna
  if(x.it.sobre){ const fr = L.recs.find(r=> r.it===x.it); return fr ? Object.assign(x, { L, c:null, fr }) : null; }
  const c = L.cols.find(cc=> cc.items.some(r=> r.it===x.it)); if(!c) return null;
  return Object.assign(x, { L, c });
}
/* La colocación de una superficie (con lo que no se mueve, si lo hay) */
function estSurfLayout(m, sid){ const sf = estSurface(m, sid); return estLayout(sf.items, m.ancho, estSurfaceH(m, sid), m.fondo, estSurfObst(m, sid)); }
function estSurfObst(m, sid){ return m && m.isFloor && typeof estFloorObst==='function' ? estFloorObst() : null; }
/* v11.16: una pieza de una pila de antes (o la base que se sube encima de otra) pasa a
   ir «encima de lo que haya debajo», en el sitio exacto en el que se ve; las de encima
   de ella, también (y siguen encima). Vuelve a calcular la elegida. */
function estToFree(x){
  if(x.fr) return x;
  const recs = x.c.items, i = recs.findIndex(r=> r.it===x.it); if(i < 0) return x;
  const moving = recs.slice(i);
  // (siguen en la lista donde estaban y con «apilado»: una versión anterior las sigue viendo en su pila)
  moving.forEach(r=>{
    const it = r.it; it.sobre = true; delete it.fila; delete it.dx;
    it.x = estR1(r.x0); it.z = estR1(r.z0);
  });
  return estSelCol();
}
/* v11.17: la pieza de abajo de la pila en la que está r (bajando por lo que tiene debajo) */
function estBaseRec(L, r){
  let cur = r;
  for(let k = 0; cur && k < 64; k++){
    if(cur.col) return cur.col.items[0];
    if(cur.y < 0.01) return cur;
    const c = cur, under = L.recs.filter(q=> q!==c && q.y + q.b.hgt <= c.y + 0.01 && q.x0 < c.x1 - 0.01 && c.x0 < q.x1 - 0.01 && q.z0 < c.z1 - 0.01 && c.z0 < q.z1 - 0.01).sort((a, b)=> (b.y + b.b.hgt) - (a.y + a.b.hgt))[0];
    if(!under) return cur;
    cur = under;
  }
  return cur || r;
}
/* La fila (delante 0 / detrás 1) de una pieza que va encima: según su fondo */
function estFreeZ(x, z){ const fd = x.fr.b.fd; return estR1(Math.min(Math.max(0, z), Math.max(0, x.m.fondo - fd))); }
function estSetPose(pose){ return estInside(()=> estSetPose_(pose)); }
function estSetPose_(pose){
  const x = estSelCol(); if(!x || !EST_POSES.includes(pose)) return;
  estPoseInto(x.it, pose);
  estAfterEdit();
}
/* Cambia la postura de un item, sin dejar una cara de apoyo que ya no le va */
function estPoseInto(it, pose){
  const was = estApoyo(it);
  if(pose==='lomo') delete it.pose; else it.pose = pose;
  delete it.rot;
  if(pose==='tumbado'){ if(!['portada', 'lomo', 'canto'].includes(was)) delete it.apoyo; }
  else if(was!=='arriba') delete it.apoyo;
}
/* v11.16: en qué cara se apoya (de pie, al revés, boca arriba, boca abajo, sobre el lomo o sobre el otro lado) */
function estApoyoInto(it, ap){
  if(!EST_APOYOS.includes(ap)) return;
  const lying = ap==='trasera' || ap==='portada' || ap==='lomo' || ap==='canto';
  if(lying){ if(it.pose!=='tumbado'){ it.pose = 'tumbado'; delete it.rot; } if(ap==='trasera') delete it.apoyo; else it.apoyo = ap; }
  else { if(it.pose==='tumbado'){ delete it.pose; delete it.rot; } if(ap==='arriba') it.apoyo = 'arriba'; else delete it.apoyo; }
}
function estSetApoyo(ap){ return estInside(()=> estSetApoyo_(ap)); }
function estSetApoyo_(ap){
  const x = estSelCol(); if(!x) return;
  estApoyoInto(x.it, ap);
  estAfterEdit();
}
function estRotate(d){ return estInside(()=> estRotate_(d)); }
function estRotate_(d){
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
function estMove(dir){ return estRiding(()=> estMove_(dir)); }
function estMove_(dir){
  let x = estSelCol(); if(!x) return;
  if(!x.fr && x.c.base!==x.it) x = estToFree(x);   // (de una pila de antes: ahora se mueve sola)
  if(x.fr){
    // encima: hasta la siguiente de debajo (su centro sobre el de ella)
    const cx = x.fr.x, cands = x.L.recs.filter(r=> !r.free && (dir > 0 ? r.x > cx + 0.5 : r.x < cx - 0.5)).sort((a, b)=> dir > 0 ? a.x - b.x : b.x - a.x);
    if(!cands.length){ showToast(t(dir > 0 ? 'est.no_room_right' : 'est.no_room_left'), { replace:true }); estAfterEdit(); return; }
    x.it.x = estR1(Math.min(Math.max(0, cands[0].x - x.fr.b.fw / 2), Math.max(0, x.m.ancho - x.fr.b.fw)));
    estAfterEdit(); return;
  }
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
function estNudge(cm){ return estRiding(()=> estNudge_(cm)); }
function estNudge_(cm){
  let x = estSelCol(); if(!x || !cm) return;
  if(!x.fr && x.c.base!==x.it) x = estToFree(x);
  if(x.fr){
    const want = Math.min(Math.max(0, x.fr.x0 + cm), Math.max(0, x.m.ancho - x.fr.b.fw));
    if(Math.abs(want - x.fr.x0) < 0.05){ showToast(t(cm > 0 ? 'est.no_room_right' : 'est.no_room_left'), { replace:true }); estAfterEdit(); return; }
    x.it.x = estR1(want); estAfterEdit(); return;
  }
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
function estDragEnd(dcm, dz){ return estRiding(()=> estDragEnd_(dcm, dz)); }
function estDragEnd_(dcm, dz){
  let x = estSelCol(); if(!x) return;
  if(!x.fr && x.c.base!==x.it) x = estToFree(x);
  dcm = dcm || 0;
  if(x.fr){
    // encima: donde la sueltes (cae sobre lo que tenga debajo)
    x.it.x = estR1(Math.min(Math.max(0, x.fr.x0 + dcm), Math.max(0, x.m.ancho - x.fr.b.fw)));
    if(dz) x.it.z = estFreeZ(x, x.fr.z0 + dz);
    estAfterEdit(); return;
  }
  if(Math.abs(dcm) < 0.5 && dz){ estDepthCol(x, dz); estSortRow(x.sf); estAfterEdit(); return; }
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
  // v11.16: y hacia el fondo (o hacia delante), si se arrastró también de arriba abajo
  if(dz){ const y = estSelCol(); if(y && y.c) estDepthCol(y, dz); }
  estSortRow(x.sf);
  estAfterEdit();
}
/* v11.16: hacia el fondo (+) o hacia delante (−), en cm, hasta donde haya sitio */
function estDepth(cm){ return estRiding(()=> estDepth_(cm)); }
function estDepth_(cm){
  let x = estSelCol(); if(!x || !cm) return;
  if(!x.fr && x.c.base!==x.it) x = estToFree(x);
  if(x.fr){
    const z = estFreeZ(x, x.fr.z0 + cm);
    if(Math.abs(z - x.fr.z0) < 0.05){ showToast(t(cm > 0 ? 'est.no_room_deeper' : 'est.no_room_closer'), { replace:true }); estAfterEdit(); return; }
    x.it.z = z; estAfterEdit(); return;
  }
  if(!estDepthCol(x, cm)) showToast(t(cm > 0 ? 'est.no_room_deeper' : 'est.no_room_closer'), { replace:true });
  estSortRow(x.sf);
  estAfterEdit();
}
/* Mueve en fondo una columna: choca con las que tiene delante o detrás (en su mismo ancho) */
function estDepthCol(x, cm){
  const c = x.c, D = x.m.fondo, z0 = c.z[0];
  let lo = 0, hi = Math.max(0, D - c.fd);
  x.L.cols.concat(x.L.fixed || [], estLowFree(x.L, c.top, [0, D], [c]).map(r=>({ x:r.x0, fw:r.b.fw, z:[r.z0, r.z1] }))).forEach(q=>{
    if(q===c || !(c.x < q.x + q.fw - 0.01 && q.x < c.x + c.fw - 0.01)) return;
    if(q.z[1] <= z0 + 0.01) lo = Math.max(lo, q.z[1] + 0.2);
    else if(q.z[0] >= z0 + c.fd - 0.01) hi = Math.min(hi, q.z[0] - 0.2 - c.fd);
  });
  lo = Math.min(lo, z0); hi = Math.max(hi, z0);
  const z = estR1(Math.min(Math.max(z0 + cm, lo), hi));
  if(Math.abs(z - z0) < 0.05) return false;
  c.base.z = z;
  if(z + c.fd / 2 > D / 2) c.base.fila = 'detras'; else delete c.base.fila;
  return true;
}
/* Delante (0) o detrás (1): va a su misma altura de la balda o, si ahí no
   cabe, al sitio libre más cercano de esa fila */
function estSetFila(row){ return estRiding(()=> estSetFila_(row)); }
function estSetFila_(row){
  let x = estSelCol(); if(!x) return;
  if(!x.fr && x.c.base!==x.it) x = estToFree(x);
  if(x.fr){ x.it.z = estFreeZ(x, row ? x.m.fondo : EST_FRONT); estAfterEdit(); return; }
  if(typeof x.c.base.z==='number'){
    // (tenía su propio fondo: vuelve a la fila de delante o de detrás)
    const spot = estFreeSpot(estObstaclesFor(x.L, x.c, row, x.m.fondo, x.c), x.c.fw, x.c.x, x.m.ancho);
    if(spot===null){ showToast(t(row ? 'est.no_room_back' : 'est.no_room_front'), { replace:true }); estAfterEdit(); return; }
    delete x.c.base.z; if(row) x.c.base.fila = 'detras'; else delete x.c.base.fila;
    x.c.base.x = spot;
    estSortRow(x.sf); estAfterEdit(); return;
  }
  if(x.c.row===row){ estAfterEdit(); return; }
  const spot = estFreeSpot(estObstacles(x.L, x.c, row, x.m.fondo), x.c.fw, x.c.x, x.m.ancho);
  if(spot===null){ showToast(t(row ? 'est.no_room_back' : 'est.no_room_front'), { replace:true }); estAfterEdit(); return; }
  x.c.base.x = spot;
  if(row) x.c.base.fila = 'detras'; else delete x.c.base.fila;
  estSortRow(x.sf);
  estAfterEdit();
}
function estToggleStack(){
  // v11.17: al bajarla de una pila, lo de encima no va con ella: baja y la pila se cierra
  // (también la de una pila de antes)
  const x = estSelItem(); if(x && (x.it.sobre || x.it.apilado)) return estInside(()=> estToggleStack_());
  return estRiding(()=> estToggleStack_());
}
function estToggleStack_(){
  let x = estSelCol(); if(!x) return;
  // v11.17: una de en medio (o de arriba) de una pila de antes: pasa a ir encima, en su sitio,
  // con lo de encima; así se baja ella sola y lo de encima baja a cerrar la pila
  if(!x.fr && x.it.apilado && x.c.base!==x.it) x = estToFree(x) || x;
  if(x.fr){
    // v11.16: se baja: a la balda, en su fila (la de delante o la de detrás, según su fondo),
    // junto a la que tenía debajo (a su derecha) o en el hueco más cercano
    const fr = x.fr, D = x.m.fondo, row = fr.z0 + fr.b.fd / 2 > D / 2 ? 1 : 0;
    const under = x.L.recs.filter(r=> r!==fr && r.y + r.b.hgt <= fr.y + 0.01 && r.x0 < fr.x1 - 0.01 && fr.x0 < r.x1 - 0.01 && r.z0 < fr.z1 - 0.01 && fr.z0 < r.z1 - 0.01).sort((a, b)=> (b.y + b.b.hgt) - (a.y + a.b.hgt))[0];
    delete x.it.sobre; delete x.it.apilado; delete x.it.z; if(row) x.it.fila = 'detras'; else delete x.it.fila;
    estInsertAfter(x.sf, [x.it], []);   // (sale de la pila en la que estaba; lo de encima se queda y baja: la pila se cierra)
    // (el sitio, mirando dónde están las demás ahora: x.L, de antes de bajarla)
    const b = estItemBox(x.it, fr.p), obs = estObstaclesFor(x.L, b, row, D);
    let spot = under ? estFreeSpot(obs, b.fw, under.x1 + EST_GAP, x.m.ancho, 6) : null;
    if(spot===null) spot = estFreeSpot(obs, b.fw, fr.x0, x.m.ancho);
    if(spot!==null) x.it.x = spot;
    estSortRow(x.sf); estAfterEdit(); return;
  }
  if(x.it.apilado){
    // se baja de la pila: a su lado (en su misma fila), en el hueco más cercano (si no hay, empuja)
    delete x.it.apilado;
    if(x.c.row) x.it.fila = 'detras'; else delete x.it.fila;
    const L = estSurfLayout(x.m, EST.sel.sid);
    const c = L.cols.find(cc=> cc.base===x.it);
    if(c){ const spot = estFreeSpot(estObstacles(L, c, c.row, x.m.fondo), c.fw, c.want, x.m.ancho, 3); if(spot!==null) x.it.x = spot; }
  } else {
    // v11.16: encima de la de su izquierda (o, si no hay, de la de su derecha); luego
    // se puede mover por encima de las demás y se apoya en todo lo que tenga debajo
    const row = estRowCols(x.L, x.c), k = row.indexOf(x.c), prev = row[k - 1] || row[k + 1];
    if(!prev){ showToast(t('est.stack_first')); return; }
    const chain = x.c.items.slice(1).map(r=> r.it);   // (lo que tenía encima, se queda encima)
    const fw = x.c.items[0].b.fw;
    x.it.sobre = true; x.it.apilado = true; delete x.it.fila; delete x.it.dx;
    // (v11.17: centrada sobre ella, también de fondo)
    const cx = prev.x + prev.fw / 2, cz = (prev.z[0] + prev.z[1]) / 2, D = x.m.fondo;
    const ctr = (it, b)=>{ it.x = estR1(Math.min(Math.max(0, cx - b.fw / 2), Math.max(0, x.m.ancho - b.fw))); it.z = estR1(Math.min(Math.max(0, cz - b.fd / 2), Math.max(0, D - b.fd))); };
    ctr(x.it, x.c.items[0].b);
    chain.forEach(it=>{ it.sobre = true; it.apilado = true; ctr(it, x.c.items.find(q=> q.it===it).b); });
    // en la lista, justo después de la de debajo (y de lo que ya tenga encima): así se
    // apoya en todo eso y una versión anterior la ve en esa pila; lo suyo, detrás de ella
    const deps = estRiders(x.L, x.c.items, true).map(r=> r.it);
    estInsertAfter(x.sf, [x.it].concat(chain, deps), [prev.base]);
    // v11.17: si así llegaría al techo de la balda, no se apila
    const L2 = estSurfLayout(x.m, EST.sel.sid);
    if(L2.tall.some(id=> !x.L.tall.includes(id))) return { revert:'est.stack_tall' };
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
  showToast(t('est.removed'), { replace:true, action:{ label:t('common.undo'), fn: ()=> estInside(()=>{
    // (v11.17: si entretanto algo ya no cabe, va a otro sitio de su balda o al suelo; nada se sale)
    if(estLocate(x.it.pid)) return;
    const sf = estSurface(estMueble(was.mid), was.sid); if(!sf) return;
    const at = Math.min(i, sf.items.length);
    sf.items.splice(at, 0, x.it);
    if(freed && sf.items[at + 1]===freed){ freed.apilado = true; delete freed.x; delete freed.fila; }
    EST.sel = Object.assign({}, was, { idx:at });
    if(was.mid===EST_FLOOR){ EST.mid = EST_FLOOR; EST.view = 'balda'; EST.bsid = 'top'; }   // v11.16: vuelve al suelo, a verla
    if(view.page==='estanteria'){ estAfterEdit(); } else estSave();
  }, { fit:true }) } });
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
    if(EST.mode==='ver') EST.view = estSalaOn() ? 'sala' : 'mueble';
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
/* v11.18: lo que queda por colocar es solo lo que tienes (lo que te falta no cuenta):
   n = las que tienes y están colocadas, t = las que tienes, left = las que tienes sin colocar */
function estOwnCounts(){ const s = estPlacedSet(), own = PRODUCTS.filter(p=> p.possession==='tengo'), n = own.filter(p=> s.has(p.id)).length; return { n, t: own.length, left: own.length - n }; }
function renderEstanteria(){
  EST.night = uiPref('estNight', '')==='1';
  const E = estData();
  // v11.13: para mirarla, a pantalla completa (sin editar nada); «Editar», la de siempre
  if(estHas() && EST.mode==='ver'){
    if(EST.view==='sala' && !estSalaOn()) EST.view = 'mueble';
    estMid();
    return `<div class="est-imm" id="estImm" role="region" aria-label="${escapeHTML(t('est.title'))}">
      <div class="est-stage is-imm" id="estStage" data-wall="${E.pared}" data-view="${EST.view}"><div class="est-scene" id="estScene" aria-hidden="true"></div>
        <div class="est-ctl is-imm" id="estCtl"></div><div class="est-bar is-imm" id="estBar"></div></div></div>`;
  }
  let html = (estHas() ? `<div class="est-modebar" role="group" aria-label="${escapeHTML(t('est.editing'))}"><span class="est-modebar-t">${icon('pencil')} ${t('est.editing')}</span>
      <button type="button" class="btn btn-sm primary" data-fk="mode-done" onclick="estSetMode('ver')">${icon('check')} ${t('est.done_edit')}</button></div>` : '') + screenHeadHTML({ kicker:t('est.kicker'), title:t('est.title'), sub: estHas() ? (()=>{ const c = estOwnCounts(); return t('est.sub').replace('{m}', E.muebles.length).replace('{n}', c.n).replace('{t}', c.t); })() : '' });
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
  if(EST.view==='sala' && !estSalaOn()) EST.view = 'mueble';
  const mid = estMid();
  // muebles (y la sala)
  html += `<div class="chip-scroll est-tabs" role="group" aria-label="${escapeHTML(t('est.muebles'))}">
    ${estSalaOn() ? `<button type="button" class="chip ${EST.view==='sala' || mid===EST_FLOOR ? 'active' : ''}" aria-pressed="${EST.view==='sala' || mid===EST_FLOOR}" onclick="estShowSala()">${icon('home')} ${t('est.sala')}</button>` : ''}
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
    const where = m.isFloor ? t('est.floor') : sid==='top' ? t('est.top') : t('est.bay_of').replace('{n}', m.baldas.findIndex(b=>b.id===sid) + 1).replace('{t}', m.baldas.length);
    const to = m.isFloor ? t('est.sala') : t('est.to_mueble');
    return `<div class="est-ctl-l"><button type="button" class="btn btn-sm est-back" data-fk="back" onclick="estExitBalda()" aria-label="${escapeHTML(to + ' · ' + where)}" title="${escapeHTML(to)}">${icon('chevronLeft')} <span>${escapeHTML(m.isFloor ? t('est.sala') : m.nombre || t('est.mueble_default'))}</span> <small>${escapeHTML(where)}</small></button></div>
      <div class="est-ctl-r">${m.isFloor ? '' : `
        <button type="button" class="round-btn est-btn" data-fk="up" onclick="estBaldaStep(-1)" ${i <= 0 ? 'disabled' : ''} aria-label="${escapeHTML(t('est.up'))}" title="${escapeHTML(t('est.up'))}">${icon('chevronUp')}</button>
        <button type="button" class="round-btn est-btn" data-fk="down" onclick="estBaldaStep(1)" ${i >= ids.length - 1 ? 'disabled' : ''} aria-label="${escapeHTML(t('est.down'))}" title="${escapeHTML(t('est.down'))}">${icon('chevronDown')}</button>`}
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
    if(EST.view==='balda' && m.isFloor){ title = t('est.sala'); sub = t('est.floor'); }
    else if(EST.view==='balda'){
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
  const backLabel = EST.view==='balda' ? (m && m.isFloor ? t('est.sala') : t('est.to_mueble')) : (EST.view==='mueble' && EST.fromSala && estSalaOn()) ? t('est.sala') : t('est.imm_exit');
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
    if(estSalaHas()) list.push({ name: t('est.floor'), fn:`estKbdGo('f','')`, hi:'.est-floor.is-room' });
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
  else if(kind==='f'){ EST.mid = EST_FLOOR; EST.fromSala = true; estEnterBalda('top', null); }
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
      ${estSalaPanelHTML()}
      <div class="quick-actions">${estStyleBtn()}${estMedColBtn()}</div>${estFoldersHTML()}${estDeleteAllHTML()}`;
  }
  const m = estMueble(estMid()); if(!m) return '';
  let html = '';
  const surf = (sid, label, sf, H, isOpen)=>{
    const L = estLayout(sf.items, m.ancho, H, m.fondo, estSurfObst(m, sid));
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
        ${L.over.length ? `<div class="est-over-row" role="status"><span>${escapeHTML(estN('est.over_note', L.over.length))}</span><button type="button" class="btn btn-sm primary" data-fk="fit-${sid}" onclick="estFitSurface('${m.id}','${sid}')">${icon('fit')} ${t('est.fit_btn')}</button></div>` : ''}
        <div class="quick-actions">${enter}<button type="button" class="btn btn-sm" onclick="openEstAddSheet('${sid}')">${icon('plus')} ${t('est.add_here')}</button>
          <button type="button" class="btn btn-sm" onclick="openEstFolderSheet(null, '${sid}')">${icon('folder')} ${t('est.folder_new_here')}</button>
          ${k ? `${gaps}<button type="button" class="btn btn-sm btn-ghost" onclick="estSortSurface('${m.id}','${sid}')">${icon('sortIcon')} ${t('est.sort')}</button><button type="button" class="btn btn-sm btn-ghost" onclick="estClearSurface('${m.id}','${sid}')">${icon('trash')} ${t('est.clear')}</button>` : ''}</div>
      </div></details>`;
  };
  const label = (sid)=> m.isFloor ? t('est.floor') : sid==='top' ? t('est.top') : (()=>{ const i = m.baldas.findIndex(b=>b.id===sid); const b = m.baldas[i]; return t('est.balda_n').replace('{n}', i + 1) + (estPlateText(b) ? ' · ' + estPlateText(b) : ''); })();
  if(EST.view==='balda'){
    // dentro de una balda: la pieza elegida (o una pista) y esa balda
    const x = EST.multi ? null : estSelItem();
    if(EST.multi) html += estMultiCardHTML();
    else if(x) html += estSelCardHTML(m, x);
    else html += `<div class="est-hint-row"><p class="section-sub est-hint">${t('est.balda_hint')}</p><button type="button" class="btn btn-sm" data-fk="multi-on" onclick="estMultiOn(true)">${icon('multi')} ${t('est.multi')}</button></div>`;
    const sid = estBsid(m);
    html += `<div class="est-surfaces">${surf(sid, label(sid), estSurface(m, sid), estSurfaceH(m, sid), !x)}</div>`;
    html += `<div class="quick-actions est-actions"><button type="button" class="btn btn-sm" onclick="estExitBalda()">${icon('chevronLeft')} ${t(m.isFloor ? 'est.sala' : 'est.to_mueble')}</button>${estStyleBtn()}${estMedColBtn()}</div>`;
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
  const own = estOwnCounts(), unplaced = own.left;   // v11.18: lo que tienes (lo que te falta no se coloca solo)
  html += `<p class="section-sub est-foot">${escapeHTML(t('est.placed').replace('{n}', own.n).replace('{t}', own.t))}${unplaced ? ` <button type="button" class="link-btn" onclick="estAutoAddUnplaced()">${escapeHTML(t('est.add_unplaced').replace('{n}', unplaced))}</button>` : ''}</p>
    <div class="quick-actions est-more"><button type="button" class="btn btn-sm btn-ghost" onclick="estRebuild()">${icon('refresh')} ${t('est.rebuild')}</button></div>`;
  html += estDeleteAllHTML();
  return html;
}
/* v11.16: la sala: el hueco a la izquierda de cada mueble (más juntos o más separados),
   su orden, el suelo libre a la derecha y lo que hay en el suelo */
function estSalaPanelHTML(){
  const E = estData(), R = estRoom(), n = E.muebles.length;
  const step = (fk, fn, v, label)=> `<span class="est-step"><button type="button" class="btn btn-sm" data-fk="${fk}-m" onclick="${fn.replace('#', '-5')}" aria-label="${escapeHTML(label + ': ' + t('est.gap_less'))}" title="${escapeHTML(t('est.gap_less'))}">${icon('minus')}</button><output aria-live="polite">${escapeHTML(fmtCm(v))} cm</output><button type="button" class="btn btn-sm" data-fk="${fk}-p" onclick="${fn.replace('#', '5')}" aria-label="${escapeHTML(label + ': ' + t('est.gap_more'))}" title="${escapeHTML(t('est.gap_more'))}">${icon('plus')}</button></span>`;
  const rows = R.cabs.map((c, i)=>{
    const name = c.m.nombre || t('est.mueble_default');
    const gl = i ? t('est.gap_between').replace('{a}', E.muebles[i - 1].nombre || t('est.mueble_default')).replace('{b}', name) : t('est.gap_left').replace('{b}', name);
    return `<div class="est-gap-row"><span class="est-gap-l">${escapeHTML(gl)}</span>${step('gap-' + i, `estSalaGap(${i}, #)`, estHueco(c.m, i), gl)}</div>`
      + `<div class="est-gap-cab"><span class="est-gap-name">${icon('cabinet')} ${escapeHTML(name)}</span>${n > 1 ? `<span class="est-gap-ord"><button type="button" class="btn btn-sm btn-ghost btn-icon" data-fk="ord-${i}-l" onclick="estSalaOrder(${i}, -1)" ${i ? '' : 'disabled'} aria-label="${escapeHTML(t('est.order_left').replace('{name}', name))}" title="${escapeHTML(t('est.order_left').replace('{name}', name))}">${icon('chevronLeft')}</button><button type="button" class="btn btn-sm btn-ghost btn-icon" data-fk="ord-${i}-r" onclick="estSalaOrder(${i}, 1)" ${i < n - 1 ? '' : 'disabled'} aria-label="${escapeHTML(t('est.order_right').replace('{name}', name))}" title="${escapeHTML(t('est.order_right').replace('{name}', name))}">${icon('chevronRight')}</button></span>` : ''}</div>`;
  }).join('');
  const rl = t('est.gap_right');
  const fl = estKnownCount(estSalaItems());
  return `<section class="est-sala" aria-labelledby="estSalaT">
    <h3 class="sub-title" id="estSalaT">${t('est.sala_place')}</h3>
    <p class="settings-note">${t('est.sala_place_note')}</p>
    <div class="est-gaps">${rows}<div class="est-gap-row"><span class="est-gap-l">${escapeHTML(rl)}</span>${step('gap-r', 'estSalaRightGap(#)', estSalaRight(), rl)}</div></div>
    <div class="quick-actions is-flush">${n > 1 ? `<button type="button" class="btn btn-sm btn-ghost" data-fk="gap-join" onclick="estSalaJoin()">${icon('fit')} ${t('est.gap_join')}</button>` : ''}${E.muebles.some(m=> typeof m.hueco==='number') || (estIsObj(E.sala) && typeof E.sala.derecha==='number') ? `<button type="button" class="btn btn-sm btn-ghost" data-fk="gap-reset" onclick="estSalaGapReset()">${icon('refresh')} ${t('est.gap_reset')}</button>` : ''}</div>
    <h3 class="sub-title">${t('est.floor')}</h3>
    <p class="settings-note">${escapeHTML(fl ? t('est.floor_n').replace('{n}', fl) : t('est.floor_note'))}</p>
    <div class="quick-actions is-flush">${fl ? `<button type="button" class="btn btn-sm" data-fk="floor-enter" onclick="estKbdGo('f','')">${icon('expand')} ${t('est.floor_enter')}</button>` : ''}<button type="button" class="btn btn-sm" data-fk="floor-add" onclick="openEstFloorAdd()">${icon('plus')} ${t('est.floor_add')}</button></div>
  </section>`;
}
function estSalaRedraw(){ if(_estHold){ _estHeld = true; return; } estSave(); estDraw(); estRefreshPanel(); }
/* v11.17: lo que hay en el suelo tampoco se sale de la sala al mover los muebles */
function estSalaGuard(fn){ return estInside(fn, { msg:'est.no_room_floor' }); }
function estSalaGap(i, d){ if(estSalaGuard(()=> estSalaGap_(i, d))===false) estDraw(); }
function estSalaGap_(i, d){
  const m = estData().muebles[i]; if(!m) return;
  const v = Math.max(0, Math.min(EST_MAX_HUECO, estHueco(m, i) + d));
  m.hueco = v; estSalaRedraw();
}
function estSalaRightGap(d){ if(estSalaGuard(()=> estSalaRightGap_(d))===false) estDraw(); }
function estSalaRightGap_(d){
  const S = estEnsureSala();
  S.derecha = Math.max(0, Math.min(EST_MAX_HUECO, estSalaRight() + d)); estSalaRedraw();
}
function estSalaJoin(){ if(estSalaGuard(()=>{ estData().muebles.forEach((m, i)=>{ if(i) m.hueco = 0; }); estSalaRedraw(); })===false) return; showToast(t('est.gap_joined'), { ok:true, replace:true }); }
function estSalaGapReset(){
  if(estSalaGuard(()=>{ const E = estData(); E.muebles.forEach(m=>{ delete m.hueco; }); if(estIsObj(E.sala)) delete E.sala.derecha; estSalaRedraw(); })===false) return;
  const b = document.querySelector('#estPanel [data-fk="gap-join"]') || document.querySelector('#estPanel .est-gaps button'); if(b) b.focus({ preventScroll:true });   // (el botón ya no está)
}
/* Cambiar un mueble de sitio en la sala (con el de al lado); cada uno se lleva su hueco */
function estSalaOrder(i, d){
  const j = i + d; if(j < 0 || j >= estData().muebles.length) return;
  if(estSalaGuard(()=>{
    const M = estData().muebles;
    const hi = estHueco(M[i], i), hj = estHueco(M[j], j);
    [M[i], M[j]] = [M[j], M[i]];
    // los huecos se quedan donde estaban (entre los mismos sitios)
    M[i].hueco = hi; M[j].hueco = hj;
    estSalaRedraw();
  })===false) return;
  const b = document.querySelector(`#estPanel [data-fk="ord-${j}-${d < 0 ? 'l' : 'r'}"]`) || document.querySelector(`#estPanel [data-fk="ord-${j}-${d < 0 ? 'r' : 'l'}"]`);
  if(b) b.focus({ preventScroll:true });
}
/* Añadir piezas al suelo de la sala (la hoja de siempre, con el suelo elegido) */
function openEstFloorAdd(){
  estAddState = { sid:EST_FLOOR, q:'', plat:'', huecos:true };
  openSheet({ kind:'est-add', title:t('est.floor_add'), body:estAddBodyHTML(), foot:`<button type="button" class="btn primary" onclick="closeSheet()">${t('copy.done')}</button>` });
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
    const where = g ? (g.m.isFloor ? t('est.floor') : g.m.nombre + ' · ' + estSurfName(g.m, g.sid, g.n)) : t('est.folder_unplaced');
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
  const before = JSON.stringify(E.muebles), salaBefore = estIsObj(E.sala) ? JSON.stringify(E.sala.items || []) : null;
  E.muebles = [];
  if(estIsObj(E.sala)) E.sala.items = [];   // v11.16: y lo del suelo de la sala
  EST.sel = null; EST.view = 'mueble'; EST.mid = null; EST.delAsk = false;
  await estSave(true);
  render();
  // y aún se puede deshacer unos segundos
  showToast(t('est.deleted'), { replace:true, duration:7000, action:{ label:t('common.undo'), fn: async ()=>{
    const E2 = estEnsure(); if(E2.muebles.length) return;
    E2.muebles = JSON.parse(before);
    if(salaBefore!==null && estIsObj(E2.sala) && !E2.sala.items.length){ E2.sala.items = JSON.parse(salaBefore); _estClean = null; }
    await estSave(true);
    if(view.page==='estanteria') render();
  } } });
}
function estStyleBtn(){ return `<button type="button" class="btn btn-sm" onclick="openEstStyle()">${icon('palette')} ${t('est.style')}</button>`; }
/* v11.16: sobre qué cara se apoya (6 botones; cur = la de ahora o null con varias) */
function estApoyoRowHTML(cur, fn, fk){
  return `<div class="field-label est-sel-lbl">${t('est.apoyo')}</div>
    <div class="segmented est-apoyos" role="group" aria-label="${escapeHTML(t('est.apoyo'))}">${EST_APOYOS.map(k=>`<button type="button" class="seg-btn ${cur===k ? 'active' : ''}"${cur ? ` aria-pressed="${cur===k}"` : ''} data-fk="${fk}-${k}" onclick="${fn}('${k}')">${t('est.apoyo.' + k)}</button>`).join('')}</div>`;
}
function estSelCardHTML(m, x){
  const p = estP(x.it.pid); if(!p) return '';
  const folder = p.isFolder ? p.folder : null;
  const pv = platVisual(p.platformId);
  const pose = x.it.pose || 'lomo';
  const b = estItemBox(x.it, p);
  const L = estSurfLayout(m, EST.sel.sid);
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
    ${estApoyoRowHTML(b.apoyo, 'estSetApoyo', 'ap')}
    <div class="est-tools" role="group" aria-label="${escapeHTML(t('est.place_tools'))}">
      <button type="button" class="btn btn-sm" onclick="estMove(-1)" data-fk="mv-l" aria-label="${escapeHTML(t('est.move_left'))}" title="${escapeHTML(t('est.move_left'))}">${icon('chevronLeft')}</button>
      <button type="button" class="btn btn-sm" onclick="estMove(1)" data-fk="mv-r" aria-label="${escapeHTML(t('est.move_right'))}" title="${escapeHTML(t('est.move_right'))}">${icon('chevronRight')}</button>
      <button type="button" class="btn btn-sm" onclick="estNudge(-1)" data-fk="nd-l" aria-label="${escapeHTML(t('est.nudge_left'))}" title="${escapeHTML(t('est.nudge_left'))}">−1 cm</button>
      <button type="button" class="btn btn-sm" onclick="estNudge(1)" data-fk="nd-r" aria-label="${escapeHTML(t('est.nudge_right'))}" title="${escapeHTML(t('est.nudge_right'))}">+1 cm</button>
      <button type="button" class="btn btn-sm" onclick="estRotate(-15)" data-fk="rt-l" aria-label="${escapeHTML(t('est.rot_left'))}" title="${escapeHTML(t('est.rot_left'))}">${icon('rotateLeft')}</button>
      <button type="button" class="btn btn-sm" onclick="estRotate(15)" data-fk="rt-r" aria-label="${escapeHTML(t('est.rot_right'))}" title="${escapeHTML(t('est.rot_right'))}">${icon('rotate')}</button>
      <button type="button" class="btn btn-sm ${x.it.apilado || x.it.sobre ? 'is-on' : ''}" aria-pressed="${!!(x.it.apilado || x.it.sobre)}" data-fk="stack" onclick="estToggleStack()" title="${escapeHTML(t('est.stack_hint'))}">${icon('stack')} ${t('est.stack')}</button>
    </div>
    <div class="field-label est-sel-lbl">${t('est.row')}</div>
    <div class="segmented est-rows" role="group" aria-label="${escapeHTML(t('est.row'))}">
      <button type="button" class="seg-btn ${back ? '' : 'active'}" aria-pressed="${!back}" data-fk="row-0" onclick="estSetFila(0)">${t('est.row_front')}</button>
      <button type="button" class="seg-btn ${back ? 'active' : ''}" aria-pressed="${back}" data-fk="row-1" onclick="estSetFila(1)">${t('est.row_back')}</button>
    </div>
    ${rec ? `<div class="est-dimq est-depthq"><span class="est-dimq-item"><span class="est-dimq-l">${t('est.depth')}</span>
      <span class="est-step"><button type="button" class="btn btn-sm" data-fk="dp-m" onclick="estDepth(-1)" aria-label="${escapeHTML(t('est.depth_closer'))}" title="${escapeHTML(t('est.depth_closer'))}">${icon('minus')}</button><output aria-live="polite">${escapeHTML(t('est.depth_v').replace('{n}', fmtCm(estR1(rec.z0))))}</output><button type="button" class="btn btn-sm" data-fk="dp-p" onclick="estDepth(1)" aria-label="${escapeHTML(t('est.depth_deeper'))}" title="${escapeHTML(t('est.depth_deeper'))}">${icon('plus')}</button></span></span>
      ${rec.y > 0.01 ? `<span class="est-depth-on">${icon('stack')} ${escapeHTML(t('est.on_top_of'))}</span>` : ''}</div>` : ''}
    <div class="field-label est-sel-lbl">${t(folder ? 'est.dims_folder' : 'est.dims_piece')}</div>
    <div class="est-dimq">${dimq('d', t('est.thick'), b.dims.d, t('est.thick_hint'))}${dimq('h', t('est.height'), b.dims.h, t('est.height'))}</div>
    ${lomo}${sides}
    <p class="est-sel-dims">${escapeHTML((b.dims.exact ? '' : '≈ ') + [b.dims.w, b.dims.h, b.dims.d].map(fmtCm).join(' × ') + ' cm')} · ${x.it.rot ? escapeHTML(t('est.rot_deg').replace('{n}', x.it.rot)) + ' · ' : ''}${folder ? '' : `<button type="button" class="link-btn" onclick="openMedidasSheet('${id}')">${t('est.size')}</button> · `}<button type="button" class="link-btn" data-fk="sel-move" onclick="openEstMoveTo()">${t('est.move_to')}</button>${folder ? '' : ` · <button type="button" class="link-btn" onclick="openEstToFolder('${id}')">${t('est.to_folder')}</button>`} · <button type="button" class="link-btn est-danger" onclick="estRemoveSel()">${t('est.remove')}</button></p>
    <p class="settings-note">${t('est.drag_hint')}</p>
  </section>`;
}
/* Grosor o alto de la pieza elegida, al momento (pasan a ser sus medidas) */
function estPieceDim(k, delta){ const x = estSelItem(); return estInside(()=> estPieceDim_(k, delta), { pids: x ? [x.it.pid] : [] }); }
function estPieceDim_(k, delta){
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
  if(estIsObj(E.sala)) E.sala.items = [];   // v11.16: (lo del suelo también va a los muebles: si no, estaría dos veces)
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
  if(estIsObj(E.sala)) E.sala.items = [];   // v11.16: lo del suelo vuelve a los muebles (si no, estaría dos veces)
  EST.view = 'mueble'; EST.mid = ms.length ? ms[0].id : null; EST.sel = null;
  await estSave(true);
  render();
}
async function estAutoAddUnplaced(){
  const E = estEnsure();
  const ms = estAutoPlan({ skipPlaced:true, huecos:false });   // v11.18: solo lo que tienes
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
  // v11.17: ordenadas en la fila de delante; las que ahí no quepan, detrás o encima (dentro de la balda)
  if(!estSurface(estMueble(mid), sid)) return;
  estInside(()=> estSortSurface_(mid, sid), { fit:'shelf', msg:'est.no_room_sort' });
}
function estSortSurface_(mid, sid){
  const m = estMueble(mid), sf = estSurface(m, sid); if(!sf) return;
  // (las carpetas, detrás de las piezas, en el orden en que estaban)
  const by = new Map(sortGames(sf.items.map(it=>PRODUCTS_BY_ID[it.pid]).filter(Boolean)).map((p, i)=>[p.id, i]));
  const rank = (it, i)=> by.has(it.pid) ? by.get(it.pid) : estIsFolderPid(it.pid) ? 1e6 + i : 1e9 + i;
  const order = new Map(sf.items.map((it, i)=>[it, rank(it, i)]));
  sf.items.sort((a, b)=> order.get(a) - order.get(b));
  sf.items.forEach(it=>{ delete it.apilado; delete it.dx; delete it.x; delete it.fila; delete it.z; delete it.sobre; });
  EST.sel = null;
  estAfterEdit();
}
/* «Juntar»: cierra los huecos (cada fila, de izquierda a derecha, sin cambiar el orden) */
function estCompactSurface(mid, sid){
  const m = estMueble(mid); if(!estSurface(m, sid)) return;
  const ok = estRiding(()=>{
    const sf = estFreeze(m, sid); if(!sf) return;
    sf.items.forEach(it=>{ if(it.sobre) return; delete it.x; delete it.dx; });
    estAfterEdit();
  }, [{ m, sid }]);
  if(ok===false) return;
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
let estAddState = { sid:'', q:'', plat:'', huecos:false };
function openEstAddSheet(sid){
  const m = estMueble(estMid()); if(!m) return;
  // v11.18: lo que te falta no está en la lista; «Dejar hueco para lo que te falta» lo añade a las plataformas
  estAddState = { sid: m.isFloor ? EST_FLOOR : sid || (m.baldas[0] ? m.baldas[0].id : 'top'), q:'', plat:'', huecos:false };
  openSheet({ kind:'est-add', title:t('est.add_pieces'), body:estAddBodyHTML(), foot:`<button type="button" class="btn primary" onclick="closeSheet()">${t('copy.done')}</button>` });
}
/* Dónde se añade: una superficie del mueble que se ve o (v11.16) el suelo de la sala */
function estAddTarget(ensure){
  if(estAddState.sid===EST_FLOOR){ if(ensure) estEnsureSala(); const fm = estFloorM(); return { m:fm, sid:'top', sf:fm.encima }; }
  const m0 = estMueble(estMid()), m = m0 && m0.isFloor ? estData().muebles[0] : m0; if(!m) return null;
  return { m, sid:estAddState.sid, sf: estSurface(m, estAddState.sid) || m.encima };
}
function estAddBodyHTML(){
  const T = estAddTarget(); if(!T) return '';
  const { m, sf } = T, sid = T.sid;
  const placed = estTakenSet();
  const H = estSurfaceH(m, sid);
  const L = estLayout(sf.items, m.ancho, H, m.fondo, estSurfObst(m, sid));
  const pct = Math.min(100, Math.round(L.used / m.ancho * 100));
  const cm = m.isFloor ? estData().muebles[0] : m;
  const surfOpts = (cm ? [['top', t('est.top')]].concat(cm.baldas.map((b, i)=>[b.id, t('est.balda_n').replace('{n}', i + 1) + ' · ' + fmtCm(b.alto) + ' cm'])) : []).concat([[EST_FLOOR, t('est.floor')]]).map(([v, l])=>`<option value="${v}" ${v===estAddState.sid ? 'selected' : ''}>${escapeHTML(l)}</option>`).join('');
  // v11.18: por colocar, solo lo que tienes; lo que te falta, solo con «Dejar hueco» (en las plataformas)
  const pend = (p)=> !placed.has(p.id) && (estAddState.huecos || p.possession==='tengo');
  const plats = getAllPlatforms().filter(pl=> PRODUCTS.some(p=>p.platformId===pl.id && pend(p)));
  const anyMiss = PRODUCTS.some(p=> !placed.has(p.id) && p.possession!=='tengo');
  const tokens = searchTokens(estAddState.q);
  const cand = PRODUCTS.filter(p=> !placed.has(p.id) && p.possession==='tengo' && (!estAddState.plat || p.platformId===estAddState.plat) && (!tokens.length || productMatchesSearch(p, tokens)));
  const shown = sortGames(cand).slice(0, 40);
  return `<div class="field"><label for="estAddSurf">${t('est.where')}</label><select id="estAddSurf" data-nosave onchange="estAddState.sid=this.value; estAddRefresh()">${surfOpts}</select></div>
    <div class="est-cap is-lg" aria-hidden="true"><span style="width:${pct}%"></span></div>
    <p class="settings-note">${escapeHTML(m.isFloor ? t('est.floor_cap') : t('est.cap').replace('{u}', fmtCm(L.used)).replace('{w}', fmtCm(m.ancho)).replace('{h}', fmtCm(H)))}${L.over.length ? ' · ' + escapeHTML(t('est.over').replace('{n}', L.over.length)) : ''}</p>
    <div class="sheet-group"><div class="field-label">${t('est.add_platform')}</div>
      ${plats.length ? `<div class="chip-row">${plats.map(pl=>{ const pv = platVisual(pl.id); const n = PRODUCTS.filter(p=>p.platformId===pl.id && pend(p)).length; return `<button type="button" class="chip chip-plat" onclick="estAddPlatform('${pl.id}')"><span class="chip-sw" style="--plat:${pv.color}" aria-hidden="true">${escapeHTML(pv.code)}</span>${escapeHTML(pl.name)} <span class="chip-count">${n}</span></button>`; }).join('')}</div>` : `<p class="section-sub">${t('est.all_placed')}</p>`}
      ${anyMiss ? `<label class="check-item"><span class="check-label">${t('est.with_gaps')}</span><input type="checkbox" data-fk="add-gaps" ${estAddState.huecos ? 'checked' : ''} onchange="estAddState.huecos=this.checked; estAddRefresh()"></label>` : ''}
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
  const fk = a && a.dataset ? a.dataset.fk : null;   // (v11.18: «Dejar hueco», tras cambiarlo)
  updateSheetBody(estAddBodyHTML());
  if(fk){ const b = document.querySelector(`#sheetBody [data-fk="${CSS.escape(fk)}"]`); if(b) b.focus({ preventScroll:true }); }
  const b2 = document.getElementById('sheetBody'); if(b2) b2.scrollTop = y;
  if(hadFocus){ const q2 = document.getElementById('estAddQ'); if(q2){ q2.focus(); try{ q2.setSelectionRange(pos, pos); }catch(e){} } }
  else if(fi >= 0){ const list = document.querySelectorAll('#sheetBody ' + kind); const el = list[Math.min(fi, list.length - 1)] || document.getElementById('estAddQ'); if(el) el.focus({ preventScroll:true }); }
}
function estAddTo(pids){
  const T = estAddTarget(true); if(!T) return 0;
  if(T.m.isFloor){ pids.forEach(pid=> estUnplace(pid)); return estFloorAdd(pids.map(pid=>({ pid }))); }
  let n = 0;
  pids.forEach(pid=>{ estUnplace(pid); estPlaceNew(T.m, T.sid, { pid }); n++; });
  return n;
}
/* v11.16: piezas al suelo de la sala: contra la pared, en el primer sitio libre
   junto al último mueble (si no cabe, delante). Las que ya hay no se mueven. */
function estFloorAdd(its){
  estEnsureSala();
  const fm = estFloorM(); estFreeze(fm, 'top');
  const R = estRoom();
  its.forEach(it=>{
    delete it.apilado; delete it.dx; delete it.x; delete it.fila; delete it.z; delete it.sobre;
    const p = estP(it.pid);
    const L = estSurfLayout(fm, 'top');   // (dónde están las demás, antes de ponerla)
    it.fila = 'detras'; fm.encima.items.push(it);
    if(!p) return;
    const b = estItemBox(it, p);
    let spot = estFreeSpot(estObstaclesFor(L, b, 1, fm.fondo), b.fw, R.end + EST_GAP, fm.ancho);
    if(spot!==null){ it.x = spot; return; }
    spot = estFreeSpot(estObstaclesFor(L, b, 0, fm.fondo), b.fw, R.end + EST_GAP, fm.ancho);
    if(spot!==null){ it.x = spot; delete it.fila; }
  });
  estSortRow(fm.encima);
  return its.length;
}
function estAddPlatform(platId){
  const placed = estTakenSet();
  const list = sortGames(PRODUCTS.filter(p=>p.platformId===platId && !placed.has(p.id) && (estAddState.huecos || p.possession==='tengo')));
  const T = estAddTarget(); if(!T || !list.length) return;
  // solo las que caben (donde haya sitio, sin salirse de la balda); el resto se avisa
  const T2 = estAddTarget(true), before = estOverMap();
  let n = 0;
  for(const p of list){
    const it = { pid:p.id };
    estPlaceNew(T2.m, T2.sid, it);
    if(estNewOver(before).length){ const i = T2.sf.items.indexOf(it); if(i >= 0) T2.sf.items.splice(i, 1); break; }
    n++;
  }
  const rest = list.length - n;
  showToast(rest ? t('est.added_some').replace('{n}', n).replace('{r}', rest) : t('est.added_n').replace('{n}', n), { ok: !rest, replace:true, duration: rest ? 5000 : 2200 });
  estAfterEdit(); estAddRefresh();
}
function estAddOne(pid){
  // v11.17: solo si cabe (no se sale de la balda)
  if(estInside(()=>{ estAddTo([pid]); estAfterEdit(); }, { msg:'est.no_room_here' })===false){ estAddRefresh(); return; }
  showToast(t('est.added_n').replace('{n}', 1), { ok:true, replace:true });
  estAddRefresh();
}
/* Las baldas de cada mueble y (v11.16) el suelo de la sala, como botones: fn(mid, sid) */
function estWhereChipsHTML(fn, cur, plates){
  const cls = (mid, sid)=> cur && cur.mid===mid && cur.sid===sid ? 'chip active' : 'chip';
  return estData().muebles.map(m=>`<div class="sheet-group"><div class="field-label">${escapeHTML(m.nombre)}</div><div class="chip-row">${[['top', t('est.top')]].concat(m.baldas.map((b, i)=>[b.id, t('est.balda_n').replace('{n}', i + 1) + (plates && estPlateText(b) ? ' · ' + estPlateText(b) : '')])).map(([sid, l])=>`<button type="button" class="${cls(m.id, sid)}" onclick="${fn}('${m.id}','${sid}')">${escapeHTML(l)}</button>`).join('')}</div></div>`).join('')
    + `<div class="sheet-group"><div class="field-label">${escapeHTML(t('est.sala'))}</div><div class="chip-row"><button type="button" class="${cls(EST_FLOOR, 'top')}" data-fk="to-floor" onclick="${fn}('${EST_FLOOR}','top')">${icon('home')} ${escapeHTML(t('est.floor'))}</button></div></div>`;
}
/* Mover la pieza elegida a otra balda (u otro mueble) */
function openEstMoveTo(){
  const x = estSelItem(); if(!x) return;
  openSheet({ kind:'est-move', title:t('est.move_to'), body:estWhereChipsHTML('estMoveTo', { mid:x.m.id, sid:EST.sel.sid }) });
}
function estMoveTo(mid, sid){
  const x0 = estSelItem(); if(!x0) return;
  if(mid===x0.m.id && sid===EST.sel.sid){ closeSheet(); return; }
  if(!estSurface(estMueble(mid), sid)) return;
  // v11.17: donde haya sitio; si no cabe, no se mueve y se avisa
  const sel = Object.assign({}, EST.sel), view0 = [EST.view, EST.mid, EST.bsid];
  const ok = estInside(()=>{
    const x = estSelCol(); if(!x) return;   // (las que se quedan, en su sitio)
    const it = Object.assign({}, x.it);
    estUnplace(it.pid);
    estPlaceNew(estMueble(mid), sid, it);
    const f = estFind(it.pid);
    EST.view = 'balda'; EST.mid = mid; EST.bsid = sid; EST.sel = { mid, sid, idx:f ? f.i : 0, pid:it.pid };
  }, { msg:'est.no_room_there' });
  closeSheet();
  if(ok===false){ EST.sel = sel; [EST.view, EST.mid, EST.bsid] = view0; render().then(()=>{ const b = document.querySelector('#estPanel [data-fk="sel-move"]'); if(b) b.focus({ preventScroll:true }); }); return; }
  estSave(); render();   // se ve ya en su sitio nuevo, de cerca
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
/* El ancho mínimo de un mueble: lo que ocupan las piezas de sus baldas que caben ahora */
function estMinWidth(m){
  let need = 30;
  estSurfaceIds(m).forEach(sid=>{ const sf = estSurface(m, sid); if(!sf || !sf.items.length) return; const L = estSurfLayout(m, sid);
    L.cols.forEach(c=>{ if(c.x + c.fw <= m.ancho + 0.01) need = Math.max(need, c.x + c.fw); }); });
  return Math.ceil(need / 2) * 2;   // (de 2 en 2 cm, como el control)
}
function estSyncRange(id, v){ const el = document.getElementById(id); if(el){ el.value = v; const o = document.getElementById(id + '_o'); if(o) o.textContent = fmtCm(v) + ' cm'; } }
let _estRaf = 0;
function estRedrawSoon(){ if(_estRaf) return; _estRaf = requestAnimationFrame(()=>{ _estRaf = 0; estDraw(); estRefreshPanel(); }); }
function estSetMueble(mid, k, v){
  const m = estMueble(mid); if(!m) return;
  if(k==='nombre'){ m.nombre = String(v || '').trim() || m.nombre; estSave(); render(); return; }
  if(k==='ancho') v = estNum(v, 30, 400, m.ancho); else if(k==='fondo') v = estNum(v, 15, 80, m.fondo);
  // v11.17: nada se sale por los lados: no más estrecho que lo que tiene; de fondo, si nada se sale
  if(k==='ancho'){ const min = estMinWidth(m); if(v < min){ v = min; estSyncRange('estW', v); showToast(t('est.width_min').replace('{n}', fmtCm(min)), { replace:true }); } }
  if((k==='fondo' || k==='ancho') && v!==m[k]){
    // (también lo que hay en el suelo de la sala, junto a él)
    const old = m[k]; if(estInside(()=>{ const mm = estMueble(mid); if(mm) mm[k] = v; }, { msg: k==='fondo' ? 'est.no_room_depth' : 'est.no_room_edge' })===false){ estSyncRange(k==='fondo' ? 'estD' : 'estW', old); return; }
    estSave(); estRedrawSoon(); const tot = document.querySelector('#sheetBody .settings-note'); if(tot) tot.textContent = t('est.total_h').replace('{h}', fmtCm(estMuebleHeight(estMueble(mid))));
    return;
  }
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
  const last = estData().muebles.length===1;
  const n = estKnownCount(m.encima.items) + m.baldas.reduce((a, b)=>a + estKnownCount(b.items), 0) + (last ? estKnownCount(estSalaItems()) : 0);
  if(!await showConfirmModal(t('est.del_mueble_confirm').replace('{name}', m.nombre).replace('{n}', n), { danger:true, okLabel:t('common.delete') })) return;
  const E = estData();
  E.muebles = E.muebles.filter(x=>x.id!==mid);
  if(!E.muebles.length && estIsObj(E.sala)) E.sala.items = [];   // (sin muebles no hay sala)
  else estSalaKeepIn();   // v11.17: lo del suelo no se queda fuera de la sala
  EST.sel = null; EST.mid = E.muebles[0] ? E.muebles[0].id : null;
  if(!estSalaOn()) EST.view = 'mueble';
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
  const m0 = EST.view==='sala' ? null : estMueble(estMid()), m = m0 && m0.isFloor ? null : m0;
  const target = m || E.muebles[0]; if(!target) return '';
  const opt = (k, v, label, sw)=> `<button type="button" class="est-opt ${target[k]===v ? 'active' : ''}" aria-pressed="${target[k]===v}" onclick="estSetStyle('${k}','${v}')"><span class="est-sw${sw ? '' : ' is-none'}"${sw ? ` style="${sw}"` : ''} aria-hidden="true"></span><span>${escapeHTML(label)}</span></button>`;
  const group = (key, inner)=> `<div class="sheet-group"><div class="field-label">${t('est.style.' + key)}</div><div class="est-opts">${inner}</div></div>`;
  return (m ? '' : `<p class="settings-note">${t('est.style_all')}</p>`)
    + group('madera', Object.keys(EST_WOODS).map(k=>opt('madera', k, t('est.wood.' + k), `background:linear-gradient(135deg, ${EST_WOODS[k].t}, ${EST_WOODS[k].f} 55%, ${EST_WOODS[k].e})`)).join(''))
    + group('puertas', EST_DOORS.map(k=>opt('puertas', k, t('est.doors.' + k), k==='sin' ? '' : `background:linear-gradient(115deg, rgba(255,255,255,0.65), rgba(200,220,235,${k==='ahumado' ? '0.35' : '0.18'}) 45%, rgba(${k==='ahumado' ? '40,42,48,0.55' : '255,255,255,0.4'}))`)).join(''))
    + group('luz', Object.keys(EST_LIGHTS).map(k=>opt('luz', k, t('est.light.' + k), k==='apagada' ? 'background:#3a3a40' : k==='plataforma' ? 'background:conic-gradient(#a0413a,#3f4f93,#2c6a5e,#b8863c,#a0413a)' : `background:${EST_LIGHTS[k]};box-shadow:0 0 10px ${EST_LIGHTS[k]}`)).join(''))
    + group('placas', Object.keys(EST_PLATES).map(k=>opt('placas', k, t('est.plates.' + k), EST_PLATES[k] ? `background:linear-gradient(180deg, ${EST_PLATES[k][1]}, ${EST_PLATES[k][0]})` : '')).join(''))
    + `<div class="sheet-group"><div class="field-label">${t('est.style.pared')}</div><div class="est-opts">${EST_WALLS.map(k=>`<button type="button" class="est-opt ${E.pared===k ? 'active' : ''}" aria-pressed="${E.pared===k}" onclick="estSetWall('${k}')"><span class="est-sw est-wall-sw" data-wall="${k}" aria-hidden="true"></span><span>${escapeHTML(t('est.wall.' + k))}</span></button>`).join('')}</div></div>`
    // v11.16: el suelo de la sala
    + `<div class="sheet-group"><div class="field-label">${t('est.style.piso')}</div><div class="est-opts">${EST_PISOS.map(k=>{ const on = (E.piso || 'tarima')===k; return `<button type="button" class="est-opt ${on ? 'active' : ''}" aria-pressed="${on}" data-fk="piso-${k}" onclick="estSetPiso('${k}')"><span class="est-sw est-floor-sw" data-piso="${k}" aria-hidden="true"></span><span>${escapeHTML(t('est.piso.' + k))}</span></button>`; }).join('')}</div></div>`;
}
function estSetPiso(v){ if(!EST_PISOS.includes(v)) return; const E = estEnsure(); E.piso = v; estSave(); estDraw(); if(isSheetKind('est-style')) updateSheetBody(estStyleBodyHTML()); }
function estSetStyle(k, v){
  const E = estData();
  const m0 = EST.view==='sala' ? null : estMueble(estMid()), m = m0 && m0.isFloor ? null : m0;
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
  const own = has ? estOwnCounts() : null;
  const sub = has ? t('est.sub').replace('{m}', E.muebles.length).replace('{n}', own.n).replace('{t}', own.t) : t('est.dash_new');
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
    const where = loc.m ? (loc.m.isFloor ? t('est.on_floor') : t('est.in_shelf').replace('{m}', loc.m.nombre).replace('{b}', estSurfName(loc.m, loc.sid, loc.n))) : t('est.folder_unplaced');
    return `<div class="est-where"><span class="est-where-ic" aria-hidden="true">${icon('folder')}</span><span class="est-where-txt">${escapeHTML(t('est.in_folder').replace('{f}', fn) + ' · ' + where)}</span>
      <button type="button" class="btn btn-sm" onclick="${loc.m ? `goEstanteria({ pid:'${escapeHTML(p.id)}' })` : `estOpenBook('${loc.folder.id}','${escapeHTML(p.id)}')`}">${t(loc.m ? 'est.see' : 'est.folder_open')}</button></div>`;
  }
  if(f){
    const where = estSurfName(f.m, f.sid, f.n);
    return `<div class="est-where"><span class="est-where-ic" aria-hidden="true">${icon(f.m.isFloor ? 'home' : 'cabinet')}</span><span class="est-where-txt">${escapeHTML(f.m.isFloor ? t('est.on_floor') : t('est.in_shelf').replace('{m}', f.m.nombre).replace('{b}', where))}</span>
      <button type="button" class="btn btn-sm" onclick="goEstanteria({ pid:'${escapeHTML(p.id)}' })">${t('est.see')}</button></div>`;
  }
  return `<div class="est-where is-out"><span class="est-where-ic" aria-hidden="true">${icon('cabinet')}</span><span class="est-where-txt">${t('est.not_in_shelf')}</span>
    <button type="button" class="btn btn-sm" onclick="estPlaceFromFicha('${escapeHTML(p.id)}')">${t('est.place_it')}</button></div>`;
}
function estPlaceFromFicha(pid){
  const E = estData(); if(!E.muebles.length) return;
  estPlacePid = pid;
  openSheet({ kind:'est-place', title:t('est.place_it'), body:estWhereChipsHTML('estPlaceHere', null, true) });
}
let estPlacePid = null;
function estPlaceHere(mid, sid){ if(estPlacePid) estPlaceIn(estPlacePid, mid, sid); }
function estPlaceIn(pid, mid, sid){
  const m = estMueble(mid), sf = estSurface(m, sid); if(!sf) return;
  // v11.17: donde haya sitio; si no cabe en esa balda, se dice y se puede elegir otra
  if(estInside(()=>{ estUnplace(pid); estPlaceNew(estMueble(mid), sid, { pid }); }, { msg:'est.no_room_there' })===false) return;
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
  const est0 = JSON.stringify(OVERRIDES.estanterias), fit0 = estOverMap();
  if(S.touched==='reset') delete E.medidasPlataforma[S.pl];
  else if(S.touched) E.medidasPlataforma[S.pl] = { ancho:S.w, alto:S.h, fondo:S.d };
  if(S.own==='use') estPlatProducts(S.pl).filter(p=> medidasValidas(p.medidas)).forEach(p=>{ before.own.push([p.id, p.medidas]); estSetOwnDims(p, null); });
  estSetColor('plat', S.pl, 'lomo', S.lomo==='portada' ? undefined : S.lomo);
  estSetColor('plat', S.pl, 'banda', S.banda ? S.banda : undefined);
  const mv = estKeepInside(fit0);   // v11.17: las que ahora no quepan, a otro sitio de su balda (o al suelo)
  await estSave(true);
  const gen = _estGen;   // (si después cambias otra cosa de la estantería, «Deshacer» no la pisa)
  const name = (getAllPlatforms().find(x=>x.id===S.pl) || {}).name || '';
  estPS = null;
  openEstMedCol();
  estRefresh();
  showToast(t('est.saved_for').replace('{p}', name) + (mv ? ' ' + estFitMsg(mv) : ''), { ok:true, replace:true, duration:mv ? 9000 : 6000, action:{ label:t('common.undo'), fn: async ()=>{
    if(mv && gen===_estGen){ OVERRIDES.estanterias = JSON.parse(est0); _estClean = null; }   // (también vuelven a su sitio)
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
  const est0 = JSON.stringify(OVERRIDES.estanterias), fit0 = estOverMap();
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
  const mv = estKeepInside(fit0);   // v11.17: las que ahora no quepan, a otro sitio de su balda (o al suelo)
  await estSave(true);
  const gen = _estGen;   // (si después cambias otra cosa de la estantería, «Deshacer» no la pisa)
  estCS = null;
  openEstMedCol();
  estRefresh();
  showToast(t('est.cat_done').replace('{n}', P.pieces) + (mv ? ' ' + estFitMsg(mv) : ''), { ok:true, replace:true, duration:mv ? 9000 : 7000, action:{ label:t('common.undo'), fn: async ()=>{
    if(mv && gen===_estGen){ OVERRIDES.estanterias = JSON.parse(est0); _estClean = null; }   // (también vuelven a su sitio)
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
  if(m.isFloor) return `<option value="top" ${cur==='top' ? 'selected' : ''}>${escapeHTML(t('est.floor'))}</option>`;
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
    // v11.17: más grande, solo si sigue cabiendo todo en su balda (si no, se marca la medida que has cambiado)
    const ch = ['ancho', 'alto', 'fondo'].filter(k=> dims[k]!==f[k]), mark = ch.find(k=> dims[k] > f[k]) || ch[0] || 'ancho';
    if(estInside(()=>{ Object.assign(estFolder(S.cid), { nombre, color:S.color }, dims); }, { msg:'est.no_room_folder' })===false){ const el = document.getElementById('estFs_' + mark); if(el){ el.setAttribute('aria-invalid', 'true'); el.focus(); } return; }
    estFS = null;
    closeSheet();
    estAfterEdit();
    return;
  }
  const fromMulti = !!(S.fromPid && S.more && S.more.length);
  const undo = fromMulti ? { est: JSON.stringify(OVERRIDES.estanterias), sel:[S.fromPid].concat(S.more) } : null;
  const cid = estUid('c');
  const item = { pid:EST_FOLDER + cid };
  let placedAt = null;
  // v11.17: la carpeta nueva, solo si cabe sin que nada se salga de la balda
  const okFit = estInside(()=>{
  const F = estEnsureFolders();
  F[cid] = { id:cid, nombre, ancho:dims.ancho, alto:dims.alto, fondo:dims.fondo, color:S.color, pids:[] };
  if(S.fromPid){
    // desde una pieza: la carpeta ocupa su sitio y la pieza va dentro
    const loc = estFind(S.fromPid);
    if(loc){
      estFreeze(loc.m, loc.sid);
      const sf = estSurface(loc.m, loc.sid), i = sf.items.findIndex(it=>it.pid===S.fromPid), it = sf.items[i];
      // (v11.16: si iba encima de lo que tuviera debajo, la carpeta también, en su mismo sitio)
      if(it.sobre){ item.sobre = true; if(it.apilado) item.apilado = true; if(typeof it.x==='number') item.x = it.x; if(typeof it.z==='number') item.z = it.z; }
      else if(it.apilado) item.apilado = true;   // estaba encima de otra: la carpeta, también
      else { if(typeof it.x==='number') item.x = it.x; if(it.fila) item.fila = it.fila; if(typeof it.z==='number') item.z = it.z; }
      if(it.pose) item.pose = it.pose;
      if(it.apoyo) item.apoyo = it.apoyo;
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
    if(sf){ estPlaceNew(m, sid, item); placedAt = { mid:m.id, sid }; }
  }
  }, { msg:'est.no_room_folder' });
  if(okFit===false){ if(S.fromPid && S.more && S.more.length) EST.multi = new Set([S.fromPid].concat(S.more)); return; }
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
    estInside(()=>{   // (v11.17: si entretanto algo ya no cabe, va a otro sitio de su balda o al suelo)
    estEnsureFolders()[cid] = saved;
    if(at){
      const sf = estSurface(estMueble(at.mid), at.sid);
      if(sf){
        const k = Math.min(at.i, sf.items.length);
        sf.items.splice(k, 0, at.item);
        if(at.freed && sf.items[k + 1]===at.freed){ at.freed.apilado = true; delete at.freed.x; delete at.freed.fila; }
      }
    }
    }, { fit:true });
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
  return estSurfName(loc.m, loc.sid, loc.n);
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
function estOpenBook(cid, pid, readOnly, srcEl){
  const f = estFolder(cid); if(!f) return;
  estCloseInspect(true);
  if(document.querySelector('#estBookOut, .est-fly')){ document.querySelectorAll('#estBookOut, .est-fly').forEach(e=> e.remove()); estFolderShown(); }
  const pieces = estFolderPieces(f);
  const root = document.createElement('div');
  root.id = 'estBook'; root.className = 'est-book';
  root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-labelledby', 'estBookT');
  document.body.appendChild(root);
  estBookState = { cid, page: pid ? Math.max(0, pieces.findIndex(p=>p.id===pid)) : 0, index:false, ret: document.activeElement, anim:'', ro: !!readOnly || (view.page==='estanteria' && !view.productId && EST.mode==='ver') };   // solo para mirar: a pantalla completa (no desde la ficha)
  estBookRender();
  // v11.16: sale de su sitio en la balda, se le abre la tapa y aparece el libro
  const src = estFolderSrc(cid, srcEl);
  if(src){ estBookState.src = src; src.classList.add('is-out'); estBookFly(root, f, src, true); }
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
  // (si aún se estaba cerrando otra, se acaba ya)
  if(document.querySelector('#estBookOut, .est-fly')){ document.querySelectorAll('#estBookOut, .est-fly').forEach(e=> e.remove()); estFolderShown(); }
  const f = st ? estFolder(st.cid) : null;
  const ret = ()=>{ if(!silent && st && st.ret && st.ret.focus && document.contains(st.ret)) try{ st.ret.focus(); }catch(e){} };
  // v11.16: se cierra la tapa y vuelve a su sitio (el de ahora, por si se ha repintado)
  const src = !silent && st && f && root ? estFolderSrc(st.cid) : null;
  if(src && root.querySelector('.est-book-wrap')){
    root.id = 'estBookOut'; root.classList.add('is-closing');
    if(estBookFly(root, f, src, false, ()=>{ root.remove(); estFolderShown(st.cid); })){ ret(); return; }
  }
  if(root) root.remove();
  if(st) estFolderShown(st.cid);
  ret();
}
/* v11.16: el sitio de una carpeta en el escenario (lo que se ve de ella), si se ve */
function estFolderSrc(cid, el){
  if(view.page!=='estanteria' || view.productId) return null;
  const pid = EST_FOLDER + cid;
  const own = el && el.closest && document.contains(el) && el.closest('[data-pid]');
  const cand = own && own.dataset.pid===pid ? own : document.querySelector(`#estScene [data-pid="${CSS.escape(pid)}"]`);
  const src = cand ? (cand.closest('.est-pz, .est-cv, .est-sp') || null) : null;
  if(!src || !document.contains(src)) return null;
  const r = estElRect(src);
  return r && r.width > 1 && r.height > 1 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth ? src : null;
}
/* Lo que ocupa algo en pantalla (una pieza de cerca es un punto en 3D: la suma de sus caras) */
function estElRect(el){
  let r = el.getBoundingClientRect();
  if(r.width && r.height) return r;
  let l = Infinity, tp = Infinity, rt = -Infinity, bt = -Infinity;
  el.querySelectorAll('.est-pc').forEach(f=>{ const q = f.getBoundingClientRect(); if(!q.width && !q.height) return; l = Math.min(l, q.left); tp = Math.min(tp, q.top); rt = Math.max(rt, q.right); bt = Math.max(bt, q.bottom); });
  return isFinite(l) ? { left:l, top:tp, right:rt, bottom:bt, width:rt - l, height:bt - tp } : null;
}
/* Vuelve a verse en su sitio */
function estFolderShown(cid){ document.querySelectorAll(cid ? `#estScene [data-pid="${CSS.escape(EST_FOLDER + cid)}"]` : `#estScene [data-pid^="${EST_FOLDER}"]`).forEach(el=> (el.closest('.est-pz, .est-cv, .est-sp') || el).classList.remove('is-out')); }
/* La carpeta en 3D que sale de la balda y se abre (o se cierra y vuelve). Devuelve
   false si no hay animación (sin movimiento o sin dónde). done: al terminar */
function estBookFly(root, f, src, opening, done){
  const wrap = root.querySelector('.est-book-wrap');
  if(!wrap || reducedMotion() || !wrap.animate || !src){ if(done) done(); return false; }
  const r = estElRect(src), wr = wrap.getBoundingClientRect();
  if(!r || !r.width || !wr.width){ if(done) done(); return false; }
  // su tamaño en el centro: como el libro, sin pasarse de la pantalla
  let H = Math.max(140, Math.min(wr.height * 0.74, innerHeight * 0.6)), W = H * f.ancho / Math.max(1, f.alto);
  if(W > innerWidth * 0.7){ H *= innerWidth * 0.7 / W; W = innerWidth * 0.7; }
  const Dp = Math.max(5, Math.min(H * 0.22, H * f.fondo / Math.max(1, f.alto)));
  const px = (v)=> v.toFixed(1) + 'px';
  const face = (cls, w, h, tf, inner)=> `<div class="est-fly-f ${cls}" style="width:${px(w)};height:${px(h)};margin:${px(-h / 2)} 0 0 ${px(-w / 2)};transform:${tf}">${inner || ''}</div>`;
  const light = estLum(f.color) > 0.62 ? ' is-light' : '';
  const fly = document.createElement('div');
  fly.className = 'est-fly' + light; fly.setAttribute('aria-hidden', 'true');
  const cx = wr.left + wr.width / 2, cy = wr.top + wr.height / 2;
  fly.style.left = px(cx); fly.style.top = px(cy); fly.style.setProperty('--fc', f.color);
  fly.innerHTML = `<div class="est-fly-obj"><div class="est-fly-rot">
    ${face('is-back', W, H, `rotateY(180deg) translateZ(${px(Dp / 2)})`)}
    ${face('is-spine', Dp, H, `rotateY(-90deg) translateZ(${px(W / 2)})`)}
    ${face('is-edge', Dp, H, `rotateY(90deg) translateZ(${px(W / 2)})`)}
    ${face('is-top', W, Dp, `rotateX(90deg) translateZ(${px(H / 2)})`)}
    ${face('is-top', W, Dp, `rotateX(-90deg) translateZ(${px(H / 2)})`)}
    ${face('is-page', W - 6, H - 6, `translateZ(${px(Dp / 2 - 1)})`, '<i></i><i></i><i></i>')}
    <div class="est-fly-cover" style="width:${px(W)};height:${px(H)};margin:${px(-H / 2)} 0 0 ${px(-W / 2)};transform:translateZ(${px(Dp / 2)})"><div class="est-fly-cv">${estFolderCoverHTML(f)}</div><div class="est-fly-in"></div></div>
  </div></div>`;
  document.body.appendChild(fly);
  const obj = fly.querySelector('.est-fly-obj'), rot = fly.querySelector('.est-fly-rot'), cov = fly.querySelector('.est-fly-cover');
  // de dónde sale: su sitio y cómo está puesta en la balda
  const loc = estFind(EST_FOLDER + f.id), it = loc ? estSurface(loc.m, loc.sid).items[loc.i] : { pid:EST_FOLDER + f.id };
  const p = estP(it.pid), b = p ? estItemBox(it, p) : null;
  const pose = b ? estPullPoseRot(it, b, src.classList.contains('est-cv')).tf : 'rotateX(0deg) rotateY(90deg) rotateZ(0deg) rotateY(0deg)';
  const s0 = Math.max(0.04, Math.min(1, Math.max(r.height, r.width * f.alto / Math.max(1, f.ancho)) / H));
  const away = `translate(${px(r.left + r.width / 2 - cx)}, ${px(r.top + r.height / 2 - cy)}) scale(${s0.toFixed(4)})`;
  const here = 'translate(0px, 0px) scale(1)', flat = 'rotateX(0deg) rotateY(0deg) rotateZ(0deg) rotateY(0deg)';
  const closedC = `translateZ(${px(Dp / 2)}) rotateY(0deg)`, openC = `translateZ(${px(Dp / 2)}) rotateY(-168deg)`;
  const ease = 'cubic-bezier(.3,.6,.3,1)';
  let ended = false;
  const end = ()=>{ if(ended) return; ended = true; fly.remove(); root.classList.remove('is-opening'); if(done) done(); };
  if(opening){
    const T = 1050;
    root.classList.add('is-opening');   // (hasta que se ve, no se puede tocar)
    obj.animate([{ transform:away, easing:ease }, { transform:here, offset:0.5 }, { transform:here }], { duration:T, fill:'forwards' });
    rot.animate([{ transform:pose, easing:ease }, { transform:flat, offset:0.5 }, { transform:flat }], { duration:T, fill:'forwards' });
    cov.animate([{ transform:closedC }, { transform:closedC, offset:0.46, easing:'cubic-bezier(.45,0,.25,1)' }, { transform:openC, offset:0.82 }, { transform:openC }], { duration:T, fill:'forwards' });
    fly.animate([{ opacity:1 }, { opacity:1, offset:0.8 }, { opacity:0 }], { duration:T, fill:'forwards' }).onfinish = end;
    wrap.animate([{ opacity:0, transform:'scale(0.94)' }, { opacity:0, transform:'scale(0.94)', offset:0.74, easing:'ease-out' }, { opacity:1, transform:'none' }], { duration:T });
  } else {
    const T = 900;
    root.style.pointerEvents = 'none';
    wrap.animate([{ opacity:1 }, { opacity:0, offset:0.18 }, { opacity:0 }], { duration:T, fill:'forwards' });
    const bg = root.querySelector('.est-ins-bg'); if(bg) bg.animate([{ opacity:1 }, { opacity:1, offset:0.6 }, { opacity:0 }], { duration:T, fill:'forwards' });
    fly.animate([{ opacity:0 }, { opacity:1, offset:0.14 }, { opacity:1 }], { duration:T, fill:'forwards' });
    cov.animate([{ transform:openC }, { transform:openC, offset:0.14, easing:'cubic-bezier(.45,0,.4,1)' }, { transform:closedC, offset:0.46 }, { transform:closedC }], { duration:T, fill:'forwards' });
    rot.animate([{ transform:flat }, { transform:flat, offset:0.46, easing:'cubic-bezier(.45,0,.3,1)' }, { transform:pose }], { duration:T, fill:'forwards' });
    obj.animate([{ transform:here }, { transform:here, offset:0.46, easing:'cubic-bezier(.45,0,.3,1)' }, { transform:away }], { duration:T, fill:'forwards' }).onfinish = end;
  }
  setTimeout(end, 1500);
  return true;
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
  // v11.16: y las del suelo de la sala
  if(estSalaItems().length){ const fm = estFloorM(); fm.encima.items.forEach(it=>{ if(!EST.multi.has(it.pid)) return; const p = estP(it.pid); if(p) out.push({ pid:it.pid, p, it, m:fm, sid:'top', sf:fm.encima }); }); }
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
let _estLastFit = null;
function estBulk(fn, okKey, opts){
  const items = estMultiItems();
  if(!items.length){ showToast(t('est.multi_pick_first'), { replace:true }); return; }
  const pids = items.filter(x=>!x.p.isFolder).map(x=>x.pid);
  const est = JSON.stringify(OVERRIDES.estanterias), med = estSnapMed(pids), sel = items.map(x=>x.pid);
  // v11.17: si alguna se saliera de su balda, no se hace (o, con fit, se les busca sitio)
  _estLastFit = null;
  const res = estInside(()=> fn(items), Object.assign({ pids }, opts || {}));
  if(res===false) return false;
  if(res && res.go) Object.assign(EST, res.go);   // (v11.17: la vista cambia solo si se ha hecho)
  estAfterEdit();
  let msg = res && res.msg ? res.msg : t(okKey).replace('{n}', res && res.n!=null ? res.n : items.length);
  if(_estLastFit) msg += ' ' + estFitMsg(_estLastFit);
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
  estBulk(items=>{ estFreezeOnce(items); items.forEach(x=> estPoseInto(x.it, pose)); return { n:items.length }; }, 'est.multi_done_n');
}
function estMultiApoyo(ap){
  if(!EST_APOYOS.includes(ap)) return;
  estBulk(items=>{ estFreezeOnce(items); items.forEach(x=> estApoyoInto(x.it, ap)); return { n:items.length }; }, 'est.multi_done_n');
}
function estMultiRotate(d){
  estBulk(items=>{ estFreezeOnce(items); items.forEach(x=>{ const r = ((x.it.rot || 0) + d + 540) % 360 - 180; if(Math.abs(r) < 1) delete x.it.rot; else x.it.rot = r; }); return { n:items.length }; }, 'est.multi_done_n');
}
/* Delante o detrás: cada una a su misma altura de la balda o al sitio libre más cercano de esa fila */
function estMultiFila(row){
  estBulk(items=> estRiding(()=> estMultiFila_(items, row), estMultiGroups(items)), 'est.multi_done_n');
}
function estMultiFila_(items, row){
  {
    estFreezeOnce(items);
    let moved = 0, stuck = 0;
    estMultiGroups(items).forEach(g=>{
      const H = estSurfaceH(g.m, g.sid), D = g.m.fondo, W = g.m.ancho;
      const bases = estLayout(g.sf.items, W, H, D, estSurfObst(g.m, g.sid)).cols.filter(c=> c.items.some(r=> g.pids.has(r.p.id))).sort((a, b)=> a.x - b.x).map(c=> c.base);
      bases.forEach(base=>{
        const L = estLayout(g.sf.items, W, H, D, estSurfObst(g.m, g.sid));
        const c = L.cols.find(q=> q.base===base); if(!c || c.row===row) return;
        const spot = estFreeSpot(estObstacles(L, c, row, D), c.fw, c.x, W);
        if(spot===null){ stuck++; return; }
        base.x = spot; if(row) base.fila = 'detras'; else delete base.fila; delete base.z; moved++;
      });
      // v11.16: las que van encima, a delante o al fondo
      estLayout(g.sf.items, W, H, D, estSurfObst(g.m, g.sid)).recs.filter(r=> r.free && g.pids.has(r.p.id)).forEach(r=>{
        const z = row ? Math.max(0, D - 0.5 - r.b.fd) : EST_FRONT;
        if(Math.abs(z - r.z0) > 0.05){ r.it.z = estR1(z); moved++; }
      });
      estSortRow(g.sf);
    });
    if(!moved){ showToast(t(row ? 'est.no_room_back' : 'est.no_room_front'), { replace:true }); return false; }
    return { n:moved, msg: stuck ? t('est.multi_some_stuck').replace('{n}', moved).replace('{r}', stuck) : null };
  }
}
/* Mover las elegidas juntas (cm): todas a la vez, sin pisar a las demás */
function estMultiNudge(cm){
  estBulk(items=> estRiding(()=> estMultiNudge_(items, cm), estMultiGroups(items)), 'est.multi_moved_n');
}
function estMultiNudge_(items, cm){
  {
    estFreezeOnce(items);
    let ok = 0, blocked = 0;
    estMultiGroups(items).forEach(g=>{
      const L = estSurfLayout(g.m, g.sid);
      const sel = L.cols.filter(c=> c.items.some(r=> g.pids.has(r.p.id)));
      const frs = L.recs.filter(r=> r.free && g.pids.has(r.p.id));   // v11.16: las que van encima (por encima de las demás)
      const fits = sel.every(c=> (cm > 0 ? c.x + cm + c.fw <= g.m.ancho + 0.01 : c.x + cm >= -0.01) && estFitsAt(L, c, c.x + cm, g.m.fondo, sel))
        && frs.every(r=> cm > 0 ? r.x1 + cm <= g.m.ancho + 0.01 : r.x0 + cm >= -0.01);
      if(!fits || !(sel.length + frs.length)){ blocked++; return; }
      sel.forEach(c=>{ c.base.x = estR1(c.x + cm); });
      frs.forEach(r=>{ r.it.x = estR1(r.x0 + cm); });
      estSortRow(g.sf); ok++;
    });
    if(!ok){ showToast(t(cm > 0 ? 'est.no_room_right' : 'est.no_room_left'), { replace:true }); return false; }
    return { n:items.length, msg: blocked ? t('est.multi_nudge_some') : null };
  }
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
/* v11.17: «Apilarlas»: todas en una pila, en el sitio de la primera (como están en la
   balda: la de más a la izquierda abajo), cada una centrada sobre ella; sin pasar del
   techo de la balda. Las que estaban en otra balda vienen a esta. */
function estMultiStack(){
  estBulk(items=>{
    if(items.length < 2){ showToast(t('est.mstack_two'), { replace:true }); return false; }
    estFreezeOnce(items);
    // el orden de la balda: por mueble y balda (el de la lista) y, dentro, de izquierda a derecha
    // según la pieza de abajo de su pila (así una pila que ya está no se da la vuelta) y, en ella, de abajo arriba
    const surfIdx = new Map(), pos = new Map(), base = new Map(), sel = new Set(items.map(x=> x.pid));
    items.forEach(x=>{ const k = x.m.id + '|' + x.sid; if(!surfIdx.has(k)) surfIdx.set(k, surfIdx.size); });
    estMultiGroups(items).forEach(g=>{
      const L = estSurfLayout(g.m, g.sid);
      L.recs.forEach(r=>{ if(g.pids.has(r.p.id)){ pos.set(r.p.id, r); base.set(r.p.id, estBaseRec(L, r)); } });
      // (lo que no se ha elegido y va encima de una elegida en una pila de antes: se queda en su sitio y baja
      // a cerrar la pila, en vez de irse a otra columna)
      L.cols.forEach(c=>{ const k = c.items.findIndex(r=> sel.has(r.p.id)); if(k < 0) return;
        c.items.slice(k + 1).forEach(r=>{ if(sel.has(r.p.id) || r.it.sobre) return; r.it.sobre = true; delete r.it.fila; delete r.it.dx; r.it.x = estR1(r.x0); r.it.z = estR1(r.z0); }); });
    });
    const order = items.slice().sort((a, b)=> surfIdx.get(a.m.id + '|' + a.sid) - surfIdx.get(b.m.id + '|' + b.sid)
      || (base.get(a.pid).x0 - base.get(b.pid).x0) || (base.get(a.pid).row - base.get(b.pid).row) || (pos.get(a.pid).y - pos.get(b.pid).y));
    const first = order[0], m = first.m, sid = first.sid, sf = estSurface(m, sid), W = m.ancho, D = m.fondo;
    // ¿cabe de alto?
    const r0 = pos.get(first.pid), H = estSurfaceH(m, sid);
    const tot = r0.y + order.reduce((a, x)=> a + estItemBox(x.it, x.p).hgt, 0);
    if(tot > H + 0.01) return { revert:'est.mstack_tall' };
    const cx = r0.x0 + r0.b.fw / 2, cz = r0.z0 + r0.b.fd / 2;
    let prev = first.it;
    order.slice(1).forEach(x=>{
      let it = x.it;
      if(x.m.id!==m.id || x.sid!==sid){ it = Object.assign({}, x.it); estUnplace(x.pid); sf.items.push(it); }   // (de otra balda: viene a esta)
      const b = estItemBox(it, x.p);
      it.sobre = true; it.apilado = true; delete it.fila; delete it.dx;
      it.x = estR1(Math.min(Math.max(0, cx - b.fw / 2), Math.max(0, W - b.fw)));
      it.z = estR1(Math.min(Math.max(0, cz - b.fd / 2), Math.max(0, D - b.fd)));
      estInsertAfter(sf, [it], [prev]);
      prev = it;
    });
    const L = estSurfLayout(m, sid);
    if(order.some(x=> L.tall.includes(x.pid))) return { revert:'est.mstack_tall' };
    // (y se ve: la balda de la pila, con todas elegidas)
    return { n:items.length, go:{ mid:m.id, view:'balda', bsid:sid, covers:false } };
  }, 'est.mstack_done');
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
    ${estApoyoRowHTML(null, 'estMultiApoyo', 'ma')}
    <div class="est-tools" role="group" aria-label="${escapeHTML(t('est.place_tools'))}">
      ${b('mn-l', 'estMultiNudge(-1)', '−1 cm', t('est.nudge_left'))}${b('mn-r', 'estMultiNudge(1)', '+1 cm', t('est.nudge_right'))}
      ${b('mr-l', 'estMultiRotate(-15)', icon('rotateLeft'), t('est.rot_left'))}${b('mr-r', 'estMultiRotate(15)', icon('rotate'), t('est.rot_right'))}
      ${n > 1 ? b('mc-stack', 'estMultiStack()', icon('stack') + ' ' + t('est.mstack'), '', '') : ''}
    </div>
    <div class="field-label est-sel-lbl">${t('est.row')}</div>
    <div class="segmented est-rows" role="group" aria-label="${escapeHTML(t('est.row'))}">
      <button type="button" class="seg-btn" data-fk="mf-0" onclick="estMultiFila(0)">${t('est.row_front')}</button>
      <button type="button" class="seg-btn" data-fk="mf-1" onclick="estMultiFila(1)">${t('est.row_back')}</button></div>
    <div class="field-label est-sel-lbl">${t('est.multi_dims')}</div>
    <div class="est-dimq">${dimq('d', t('est.thick'))}${dimq('h', t('est.height'))}</div>
    <p class="est-sel-dims"><button type="button" class="link-btn" data-fk="ml-dims" onclick="openEstMultiDims()">${t('est.multi_dims_exact')}</button>${hasProd ? ` · <button type="button" class="link-btn" data-fk="ml-clear" onclick="estMultiClearDims()">${t('est.multi_dims_clear')}</button>` : ''}</p>
    ${hasProd ? `<div class="est-sel-lomo"><span class="est-lomo-sw" style="background:linear-gradient(90deg, ${EST_PORTADA_MIX.join(', ')})" aria-hidden="true"></span><span class="est-lomo-txt">${escapeHTML(t('est.lomo_color_t'))}</span>${b('mc-color', 'openEstMultiColor()', icon('palette') + ' ' + t('est.change'), t('est.change') + ' — ' + t('est.lomo_color_t'))}</div>` : ''}
    ${estMSTargets().length ? `<div class="est-sel-lomo est-sel-sides"><span class="est-lomo-sw est-sides-sw" aria-hidden="true">${icon('camera')}</span><span class="est-lomo-txt">${escapeHTML(t('est.side_photos'))}</span>${b('mc-sides', 'openEstMultiSides()', icon('camera') + ' ' + t('est.ms_open'), t('est.ms_open') + ' — ' + t('est.side_photos'))}</div>` : ''}
    <p class="est-sel-dims"><button type="button" class="link-btn" data-fk="ml-move" onclick="openEstMultiMoveTo()">${t('est.multi_move_to')}</button>${hasProd ? ` · <button type="button" class="link-btn" data-fk="ml-folder" onclick="openEstMultiToFolder()">${t('est.multi_to_folder')}</button>` : ''} · <button type="button" class="link-btn est-danger" data-fk="ml-remove" onclick="estMultiRemove()">${t('est.multi_remove')}</button> · <button type="button" class="link-btn" data-fk="ml-none" onclick="estMultiNone()">${t('est.multi_none')}</button></p>
  </section>`;
}
/* Hoja: otra balda (o mueble) para todas */
function openEstMultiMoveTo(){
  openSheet({ kind:'est-mmove', title:t('est.multi_move_to'), body:estWhereChipsHTML('estMultiMoveTo', null, true) });
}
function estMultiMoveTo(mid, sid){
  if(!estSurface(estMueble(mid), sid)) return;
  closeSheet();
  estBulk(items=>{
    let n = 0;
    const floor = mid===EST_FLOOR, toFloor = [];
    items.forEach(x=>{
      if(x.m.id===mid && x.sid===sid) return;
      const it = Object.assign({}, x.it); delete it.apilado; delete it.dx; delete it.x; delete it.fila; delete it.z; delete it.sobre;
      estUnplace(x.pid);
      if(floor) toFloor.push(it); else estPlaceNew(estMueble(mid), sid, it);
      n++;
    });
    if(toFloor.length) estFloorAdd(toFloor);
    if(!n) return false;
    // y se ven ya allí
    return { n, go:{ mid, view:'balda', bsid:sid, covers:false } };
  }, 'est.multi_moved_to', { msg:'est.no_room_there' });
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
  }, 'est.multi_done_n', { fit:true });   // (medidas de verdad: las que no quepan, a otro sitio de su balda o al suelo)
}
/* Hoja: las fotos de los lados de todas (v11.15)
   ---------------------------------------------------------------------
   Para cada lado (lomo, lado contrario, arriba, abajo): hacer o elegir una
   foto (pasa una vez por el editor), usar la de una de las elegidas que ya
   la tenga, o quitarla a todas. Cada pieza guarda su copia de la foto (las
   mismas claves de siempre: photo_<pieza>_canto…), así que luego se puede
   cambiar una sola. Las que ya tienen foto de ese lado se quedan con la suya
   o se cambian, como elijas. Todo se puede deshacer. Son las de la copia que
   se ve (como en su hoja). Solo para las que tienes. */
let estMS = null;
/* Lo que está en marcha (poner o quitar) y el último «Deshacer»: fuera de la hoja, para
   que cerrarla y abrirla de nuevo no deje empezar otra cosa a la vez */
let estMSBusy = null, estMSUndo = null;
/* Las elegidas que pueden llevar fotos de los lados (las que tienes; no carpetas) */
function estMSTargets(){ return estMultiProducts().filter(p=> p.possession==='tengo'); }
/* Sus fotos: una por copia que se ve (sin repetir) */
function estMSPhotoIds(){ const out = []; estMSTargets().forEach(p=>{ const ph = shownPhotoId(p); if(!out.includes(ph)) out.push(ph); }); return out; }
/* ¿Se sabe ya qué fotos tiene cada pieza? (si no, «se quedan con la suya» no se podría cumplir) */
function estMSReady(){ if(PHOTO_INDEX.ready) return true; showToast(t('est.ms_wait'), { duration:5000 }); return false; }
function openEstMultiSides(){
  const all = estMultiProducts(); if(!all.length) return;
  if(!estMSReady()) return;
  estMS = { keep:true };
  openSheet({ kind:'est-msides', title:t('est.side_photos') + ' · ' + t('est.multi_n').replace('{n}', all.length), body:estMultiSidesBodyHTML(),
    foot:`<button type="button" class="btn primary" onclick="closeSheet()">${t('copy.done')}</button>`,
    onClose: ()=>{ estMS = null; estMSUndo = null; const a = document.activeElement; if(a && a!==document.body && document.contains(a)) return; const b = document.querySelector('#estPanel [data-fk="mc-sides"]'); if(b) b.focus({ preventScroll:true }); } });
  const sb = document.getElementById('sheetBody'); if(sb) hydratePhotos(sb);
}
function estMultiSidesBodyHTML(){
  const all = estMultiProducts(), own = estMSTargets(), miss = all.length - own.length;
  const S = estMS || { keep:true }, busy = !!estMSBusy;
  const dis = busy ? ' aria-disabled="true"' : '';
  const anyHave = own.some(p=> SIDE_SLOTS.some(sd=> hasPhoto(shownPhotoId(p), sd)));
  const rows = SIDE_SLOTS.map(side=>{
    const have = own.filter(p=> hasPhoto(shownPhotoId(p), side));
    const label = photoSideLabel(side);
    const srcs = have.slice(0, 4).map((p, i)=>{ const ph = shownPhotoId(p);
      return `<button type="button" class="est-ms-src" data-fk="ms-src-${side}-${i}"${dis} onclick="estMultiSideFrom('${side}','${escapeHTML(p.id)}')" aria-label="${escapeHTML(t('est.ms_from_aria').replace('{s}', label).replace('{name}', p.name))}" title="${escapeHTML(p.name)}"><span class="est-ms-src-ph">${photoImgHTML(p, side, 'thumb', 'data-eager="1"', ph)}</span><span class="est-ms-src-name">${escapeHTML(p.name)}</span></button>`; }).join('');
    return `<section class="est-ms-side" aria-labelledby="estMs-${side}">
      <div class="est-ms-head"><span class="side-glyph is-${side}" aria-hidden="true"></span><b id="estMs-${side}">${escapeHTML(label)}</b><span class="est-ms-count">${escapeHTML(t(have.length===1 ? 'est.ms_have1' : 'est.ms_have').replace('{n}', have.length).replace('{t}', own.length))}</span></div>
      <div class="est-ms-acts">
        <label class="btn btn-sm photo-picker${busy ? ' is-disabled' : ''}" data-fk="ms-pick-${side}">${icon('camera')} ${t('est.ms_pick')}<input type="file" accept="image/*" class="sr-only"${busy ? ' disabled' : ''} aria-label="${escapeHTML(t('est.ms_pick') + ' — ' + label)}" onchange="estMultiSidePick(this,'${side}')"></label>
        ${have.length ? `<button type="button" class="btn btn-sm btn-ghost" data-fk="ms-rm-${side}"${dis} onclick="estMultiSideRemove('${side}')">${icon('trash')} ${escapeHTML(t(have.length===1 ? 'est.ms_remove1' : 'est.ms_remove').replace('{n}', have.length))}</button>` : ''}
      </div>
      ${have.length ? `<div class="est-ms-from"><span class="est-ms-from-l">${t('est.ms_from_label')}</span><div class="est-ms-srcs">${srcs}${have.length > 4 ? `<span class="est-ms-more">${escapeHTML(t('est.ms_more').replace('{n}', have.length - 4))}</span>` : ''}</div></div>` : ''}
    </section>`;
  }).join('');
  const keep = anyHave ? `<div class="sheet-group"><div class="field-label" id="estMsKeepL">${t('est.ms_keep_label')}</div>
    <div class="segmented" role="group" aria-labelledby="estMsKeepL"><button type="button" class="seg-btn ${S.keep ? 'active' : ''}" aria-pressed="${!!S.keep}" data-fk="ms-keep" onclick="estMS.keep=true; estMultiSidesRefresh()">${t('est.ms_keep')}</button><button type="button" class="seg-btn ${S.keep ? '' : 'active'}" aria-pressed="${!S.keep}" data-fk="ms-replace" onclick="estMS.keep=false; estMultiSidesRefresh()">${t('est.ms_replace')}</button></div></div>` : '';
  // el último cambio se puede deshacer también desde aquí (con el teclado, el aviso de abajo queda fuera de la hoja)
  const U = estMSUndo && !estMSUndo.done ? estMSUndo : null;
  const undo = U && !busy ? `<div class="est-book-undo est-ms-undo" role="status"><span>${escapeHTML(U.msg)}</span><button type="button" class="btn btn-sm" data-fk="ms-undo" onclick="estMSDoUndo()">${icon('undo')} ${t('common.undo')}</button></div>` : '';
  return `<p class="settings-note">${t('est.ms_note')}</p>
    ${miss ? `<p class="settings-note">${escapeHTML(t(miss===1 ? 'est.ms_missing1' : 'est.ms_missing').replace('{n}', miss))}</p>` : ''}
    ${undo}
    ${own.length ? keep + `<div class="est-ms-list">${rows}</div>` : ''}
    <p class="est-ms-status" id="estMsStatus" aria-live="polite">${busy && estMSBusy.msg ? escapeHTML(estMSBusy.msg) : ''}</p>`;
}
function estMultiSidesRefresh(){
  if(!isSheetKind('est-msides')) return;
  const sb = document.getElementById('sheetBody'); if(!sb) return;
  const a = document.activeElement;
  const host = a && sb.contains(a) ? (a.closest('[data-fk]') || a) : null;
  const fk = host && host.dataset ? host.dataset.fk : null;
  const y = sb.scrollTop;
  updateSheetBody(estMultiSidesBodyHTML());
  sb.scrollTop = y;
  hydratePhotos(sb);
  if(fk){
    let el = sb.querySelector(`[data-fk="${CSS.escape(fk)}"]`);
    // (si ya no está, p. ej. «Quitarla a todas» o «Deshacer», el de hacer o elegir de ese lado, o el primero)
    if(!el){ const m = /^ms-(?:rm|src)-([a-z]+)/.exec(fk); if(m) el = sb.querySelector(`[data-fk="ms-pick-${m[1]}"]`); }
    if(!el) el = sb.querySelector('[data-fk^="ms-pick-"]');
    if(el && el.tagName==='LABEL') el = el.querySelector('input');
    if(el) el.focus({ preventScroll:true });
  }
}
/* Tras poner, quitar o deshacer (con el editor y la pregunta de por medio), el foco vuelve a la hoja */
function estMSFocusAfter(fk){
  if(!isSheetKind('est-msides')) return;
  const sb = document.getElementById('sheetBody'); if(!sb) return;
  const a = document.activeElement; if(a && a!==document.body && sb.closest('#sheetOverlay').contains(a)) return;
  let el = fk ? sb.querySelector(`[data-fk="${CSS.escape(fk)}"]`) : null;
  if(!el && fk){ const m = /^ms-(?:rm|src|pick)-([a-z]+)/.exec(fk); if(m) el = sb.querySelector(`[data-fk="ms-pick-${m[1]}"]`); }
  if(!el) el = sb.querySelector('[data-fk="ms-undo"]') || sb.querySelector('[data-fk^="ms-pick-"]');
  if(el && el.tagName==='LABEL') el = el.querySelector('input');
  if(el) el.focus({ preventScroll:true });
}
function estMSStatus(txt){ if(estMSBusy) estMSBusy.msg = txt || ''; const el = document.getElementById('estMsStatus'); if(el) el.textContent = txt || ''; }
/* Empieza algo (poner o quitar); si ya hay algo en marcha, se avisa y no se empieza */
function estMSStart(kind){
  if(estMSBusy){ showToast(t('est.ms_busy'), { duration:3000 }); return false; }
  estMSBusy = { kind, msg:'' }; estMultiSidesRefresh(); return true;
}
function estMSEnd(){ estMSBusy = null; }
async function estMultiSidePick(input, side){
  const file = input.files[0]; input.value = '';
  if(!file) return;
  if(estMSBusy){ showToast(t('est.ms_busy'), { duration:3000 }); return; }
  let r = null;
  try{ r = await photoDataFromFile(file); }catch(err){ showToast(t('photo.read_failed') + ' ' + (err && err.message || ''), { replace:true, duration:6000 }); return; }
  if(!r || r.cancelled || !r.dataUrl) return;
  await estMultiSideApply(side, r.dataUrl, null, 'ms-pick-' + side);
}
async function estMultiSideFrom(side, pid){
  if(estMSBusy){ showToast(t('est.ms_busy'), { duration:3000 }); return; }
  const p = PRODUCTS_BY_ID[pid]; if(!p) return;
  const ph = shownPhotoId(p), key = photoKeyFor(ph, side); if(!key) return;
  let data = null; try{ data = await idbGetStrict(PHOTOS_STORE, key); }catch(e){ data = null; }
  if(!data){ showToast(t('photo.read_failed'), { duration:5000 }); return; }
  const a = document.activeElement;
  await estMultiSideApply(side, data, ph, a && a.dataset && a.dataset.fk || 'ms-pick-' + side);
}
/* Lee la foto que hay ahora en una clave (null si no hay; false si no se ha podido leer) */
async function estMSRead(key){ try{ const v = await idbGetStrict(PHOTOS_STORE, key); return v || null; }catch(e){ return false; } }
/* Pone la foto a todas (menos a la que la da, y a las que ya tienen la suya si así lo eliges).
   Si falla al guardar alguna, se deja todo como estaba. */
async function estMultiSideApply(side, dataUrl, srcPh, fk){
  if(!dataUrl || !SIDE_SLOTS.includes(side)) return;
  if(estMSBusy){ showToast(t('est.ms_busy'), { duration:3000 }); return; }
  if(!estMSReady()) return;
  const S = estMS || { keep:true };
  const others = estMSPhotoIds().filter(ph=> ph!==srcPh);
  const targets = others.filter(ph=> !(S.keep && hasPhoto(ph, side)));
  if(!targets.length){ showToast(t(others.length ? 'est.ms_none' : 'est.ms_none_src'), { duration:5000 }); return; }
  const label = photoSideLabel(side), prev = [];
  // antes de poner nada: a cuántas y cuánto ocupa (una copia en cada una)
  const kept = others.length - targets.length;
  const mb = Math.max(0.1, dataUrl.length * targets.length / 1048576);
  const q = t(targets.length===1 ? 'est.ms_apply_q1' : 'est.ms_apply_q').replace('{s}', label).replace('{n}', targets.length).replace('{mb}', mb.toLocaleString(numLocale(), { maximumFractionDigits:1, minimumFractionDigits:1 }))
    + (kept ? ' ' + t(kept===1 ? 'est.ms_apply_kept1' : 'est.ms_apply_kept').replace('{n}', kept) : '');
  if(!await showConfirmModal(q, { okLabel:t('est.ms_apply_ok') })) return;
  if(!estMSStart('apply')) return;
  let failed = false;
  try{
    for(let i = 0; i < targets.length; i++){
      const ph = targets[i], key = 'photo_' + ph + '_' + side;
      if(i % 4===0) estMSStatus(t('est.ms_saving').replace('{i}', i + 1).replace('{n}', targets.length));
      // (si la de ahora no se puede leer, esa pieza no se toca: no se perdería al deshacer)
      const old = hasPhoto(ph, side) ? await estMSRead(key) : null;
      if(old===false) continue;
      if(!await storePhotoData(key, dataUrl)){ failed = true; break; }
      prev.push({ key, old });
    }
    if(failed){ estMSStatus(t('est.ms_rollback')); await estMSRestore(prev, dataUrl); }
  } finally { estMSStatus(''); estMSEnd(); }
  estMultiSidesRefresh(); estRefresh();
  if(!failed && prev.length) estMSOffer(t('est.ms_done').replace('{s}', label).replace('{n}', prev.length), async ()=>{ const bad = await estMSRestore(prev, dataUrl); return bad; });   // (si falla, storePhotoData ya avisa)
  setTimeout(()=> estMSFocusAfter(fk || 'ms-pick-' + side), 80);
}
/* Deshacer: cada una vuelve a como estaba, salvo si después la has cambiado tú.
   Devuelve cuántas no se han podido devolver (sin espacio, p. ej.) */
async function estMSRestore(list, applied){
  let bad = 0;
  for(const x of list){
    const cur = await estMSRead(x.key);
    if(cur===false){ bad++; continue; }
    if(applied!=null && cur!==applied) continue;
    if(x.old){ if(!await storePhotoData(x.key, x.old)) bad++; }
    else await removePhoto(x.key);
  }
  return bad;
}
/* El «Deshacer» del último cambio: en el aviso y dentro de la hoja; solo se hace una vez */
function estMSOffer(msg, fn){
  const U = estMSUndo = { msg, fn, done:false };
  estMultiSidesRefresh();
  showToast(msg, { replace:true, duration:8000, action:{ label:t('common.undo'), fn: ()=> estMSDoUndo(U) } });
}
async function estMSDoUndo(U){
  U = U || estMSUndo;
  if(!U || U.done) return;
  if(!estMSStart('undo')) return;
  U.done = true;
  let bad = 0;
  try{ estMSStatus(t('est.ms_undoing')); bad = await U.fn(); } finally { estMSStatus(''); estMSEnd(); }
  if(estMSUndo===U) estMSUndo = null;
  estMultiSidesRefresh(); estRefresh();
  setTimeout(()=> estMSFocusAfter(null), 80);
  showToast(bad ? t('est.ms_undo_failed').replace('{n}', bad) : t('est.ms_undone'), bad ? { duration:8000 } : { replace:true });
}
async function estMultiSideRemove(side){
  if(estMSBusy){ showToast(t('est.ms_busy'), { duration:3000 }); return; }
  if(!estMSReady()) return;
  const have = estMSPhotoIds().filter(ph=> hasPhoto(ph, side));
  if(!have.length) return;
  const label = photoSideLabel(side);
  if(!await showConfirmModal(t(have.length===1 ? 'est.ms_remove_q1' : 'est.ms_remove_q').replace('{s}', label).replace('{n}', have.length), { danger:true, okLabel:t('photo.remove') })) return;
  if(!estMSStart('remove')) return;
  const prev = [];
  try{
    for(let i = 0; i < have.length; i++){
      const ph = have[i], key = photoKeyFor(ph, side); if(!key) continue;
      if(i % 4===0) estMSStatus(t('est.ms_removing').replace('{i}', i + 1).replace('{n}', have.length));
      // (si no se puede leer, no se quita: así siempre se puede deshacer)
      const old = await estMSRead(key); if(!old) continue;
      await removePhoto(key); prev.push({ key, old });
    }
  } finally { estMSStatus(''); estMSEnd(); }
  estMultiSidesRefresh(); estRefresh();
  setTimeout(()=> estMSFocusAfter('ms-rm-' + side), 80);
  if(!prev.length) return;
  estMSOffer(t('est.ms_removed').replace('{s}', label).replace('{n}', prev.length), async ()=>{
    let bad = 0;
    for(const x of prev){ const cur = await estMSRead(x.key); if(cur===false){ bad++; continue; } if(cur) continue; if(!await storePhotoData(x.key, x.old)) bad++; }   // (si después pusiste otra, se queda)
    return bad;
  });
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
  return { tf: estPoseTf(b), ry: b.ang };   // (v11.16: con la cara en la que se apoya)
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
  const film = !miss && estSealed(p) ? EST_FILM : '';   // v11.18: su film
  const sub = p.possession==='tengo' ? [n > 1 ? t('est.have_n').replace('{n}', n) : t('est.have'), copyLine(p, c)].join(' · ') : t('cover.missing');
  const root = document.createElement('div');
  root.id = 'estPull'; root.className = 'est-pull is-start';
  root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-labelledby', 'estPullT');
  root.innerHTML = `<div class="est-pull-bg" aria-hidden="true"></div>
    <div class="est-pull-stage" id="estPullStage" aria-hidden="true"><div class="est-pull-obj" id="estPullObj"><div class="est-pull-rot${miss ? ' is-ghost' : ''}${film ? ' is-sealed' : ''}" id="estPullRot" style="--plat:${pv.color}"></div></div></div>
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
  rot.innerHTML = `${face('is-front' + (miss ? ' is-miss' : ''), w, h, `translateZ(${(d / 2).toFixed(1)}px)`, phA('front'), front + film)}
      ${face('is-back', w, h, `rotateY(180deg) translateZ(${(d / 2).toFixed(1)}px)`, phA('back'), film)}
      ${face('is-spine' + fill.cls, d, h, `rotateY(-90deg) translateZ(${(w / 2).toFixed(1)}px)`, fill.attrs, (miss ? '' : estBandHTML(fill.band, bh, false) + estSpineLabel(p, d, h - bh, false, bh / 2)) + film, fill.style)}
      ${face('is-edge', d, h, `rotateY(90deg) translateZ(${(w / 2).toFixed(1)}px)`, estSidePh(p, 'canto', arT), film)}
      ${face('is-top', w, d, `rotateX(90deg) translateZ(${(h / 2).toFixed(1)}px)`, estSidePh(p, 'arriba', arW), film)}
      ${face('is-top is-bottom', w, d, `rotateX(-90deg) translateZ(${(h / 2).toFixed(1)}px)`, estSidePh(p, 'abajo', arW), film)}`;
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
  if(rot.classList.contains('is-sealed')) rot.style.setProperty('--h', Math.max(-1, Math.min(1, (S.ry + S.rx * 0.5) / 40)).toFixed(3));   // v11.18: el reflejo, según la giras
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
