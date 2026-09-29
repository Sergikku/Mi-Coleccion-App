/* La Colección App — model.js
   Modelo de la colección: construcción de las piezas (buildProducts), checklist y migraciones, regiones, categorías/plataformas/carpetas, estadísticas y búsqueda. Sin DOM. */

/* =========================================================================
   ARCHIVO · SERGIO — v2
   Arquitectura: PRODUCTO (el juego/objeto en sí) → EDICIÓN (región/idioma/
   versión concreta) → UNIDAD (la pieza física que posee Sergio: posesión,
   checklist de componentes, conservación, procedencia, valoración, fotos).
   Los datos ya investigados (categorías, plataformas, títulos, variantes)
   se conservan tal cual como "semilla" de solo lectura; encima se aplican
   los "overrides" (tus ediciones), guardados en IndexedDB del navegador.
   ========================================================================= */

/* ---------- 1. DATOS SEMILLA (todo lo investigado hasta ahora) ---------- */

const SEED_CATEGORIES = [];

const SEED_PLATFORMS = [];

// Productos "sueltos" de Juguetes electrónicos (sin plataforma intermedia)
const SEED_JUGUETES = [];

// title: {id, name, year, jp, standalone, dlc}
const SEED_PRODUCTS = {};

// ediciones por producto: {name, region, year, tags, src, have}
const SEED_EDITIONS = {};

function seedDefaultEdition(prod){
  return [{ name:"Edición estándar", region: prod.jp ? "Japón" : "", year:prod.year, tags:[], src:"pendiente de tu volcado", have:false }];
}

/* ---------- 3. CONSTRUCCIÓN DEL MODELO: PRODUCTOS con EDICIONES ---------- */

const DEFAULT_REQUIRED = ['tengo'];
/* La lista de componentes del checklist por defecto — a partir de ahora,
   de fábrica, solo trae "Lo tengo" (además de "Está sellado", que es fijo
   y aparte). Marcar cualquier casilla (o "Está sellado") pone la posesión
   en "tengo". Desde v10.1, DESMARCAR casillas de componentes ya no quita
   la posesión (para eso está el botón grande "Lo tengo"); la única casilla
   que va siempre a la par con la posesión es la propia "Lo tengo" (clave
   'tengo'), en los dos sentidos. Cada categoría puede ampliar la lista. */
const DEFAULT_CHECKLIST_ITEMS = [
  { key:'tengo', label:'Lo tengo' },
];
function checklistForCategory(catId){
  return (OVERRIDES.categoryChecklist && OVERRIDES.categoryChecklist[catId]) || DEFAULT_CHECKLIST_ITEMS;
}
function checklistHasTengoKey(catId){
  return checklistForCategory(catId).some(item=>item.key==='tengo');
}

/* ---------- Migraciones de datos (v10.1) ----------
   Se ejecutan al arrancar y tras cada importación. Son ADITIVAS e
   idempotentes: solo marcan casillas (nunca desmarcan ni borran claves),
   así que repetirlas no cambia nada. Antes de la primera, se guarda una
   copia intacta de los datos en IndexedDB (kv 'overrides_backup_pre_10.1').

   'checklist-v10.1': los checklists personalizados usan claves nuevas
   (p. ej. 'c77is9a' = "Caja") mientras que las piezas antiguas guardan sus
   casillas con las claves de siempre ('caja', 'manual'…). Aquí se traslada
   cada casilla antigua marcada a la casilla visible con el mismo nombre, y
   en las categorías con "Lo tengo" se marca esa casilla si la pieza ya
   figura como que la tienes. */
const LEGACY_COMPONENT_BY_LABEL = {
  'juego':'juego', 'insert':'inserto', 'inserto':'inserto', 'caja':'caja',
  'manual':'manual', 'manuales':'manual', 'folleto':'folleto', 'registro':'registro', 'otros':'otros',
};
function migrateChecklistComponents(){
  let changed = 0;
  const all = (OVERRIDES.customProducts||[]).map(cp=>cp.id).concat(Object.keys(OVERRIDES.products||{}));
  const seen = new Set();
  all.forEach(id=>{
    if(seen.has(id)) return; seen.add(id);
    const base = (OVERRIDES.customProducts||[]).find(cp=>cp.id===id) || {};
    const ov = OVERRIDES.products[id] || {};
    const catId = ov.categoryId || base.categoryId;
    if(!catId) return;
    const comps = Object.assign({}, base.components||{}, ov.components||{});
    const possession = ov.possession || base.possession;
    let touched = false;
    checklistForCategory(catId).forEach(item=>{
      if(comps[item.key]) return;
      const legacy = LEGACY_COMPONENT_BY_LABEL[normText(item.label).trim()];
      if(legacy && legacy!==item.key && comps[legacy]){ comps[item.key] = true; touched = true; }
      if(item.key==='tengo' && possession==='tengo'){ comps.tengo = true; touched = true; }
    });
    if(touched){
      if(!OVERRIDES.products[id]) OVERRIDES.products[id] = {};
      OVERRIDES.products[id].components = comps;
      changed++;
    }
  });
  return changed;
}
async function runMigrations(){
  if(unreadableDataOnLoad) return;   // no tocar nada si los datos guardados no se pudieron leer
  const done = OVERRIDES.migrations || [];
  if(!done.includes('checklist-v10.1')){
    // copia intacta de los datos tal como estaban antes de la primera
    // migración real (si la app está vacía no hay nada que guardar). Se
    // toma ANTES de tocar nada, para que sea idéntica al original.
    const hasData = (OVERRIDES.customProducts||[]).length || Object.keys(OVERRIDES.products||{}).length;
    const hadBackup = hasData ? await idbGet(KV_STORE, 'overrides_backup_pre_10.1') : true;
    if(!hadBackup) await idbSet(KV_STORE, 'overrides_backup_pre_10.1', JSON.stringify(OVERRIDES));
    if(!OVERRIDES.products) OVERRIDES.products = {};
    if(!OVERRIDES.migrations) OVERRIDES.migrations = [];
    migrateChecklistComponents();
    OVERRIDES.migrations.push('checklist-v10.1');
    await persistOverrides();
  }
}
/* ---------- Datos investigados: fecha exacta, resumen y rareza estimada ----------
   Primera pasada: sagas principales (RPG numerados). El resto de fichas
   (spin-offs, CD-ROMs, juguetes) se irán completando en pasadas futuras. */
/* Etiquetas de región disponibles para marcar en cada juego */
const REGION_OPTIONS = [['jp','region.jp'],['eu','region.eu'],['us','region.us'],['cn','region.cn'],['es','region.es']];
const REGION_CODES = { jp:'JAP', eu:'EUR', us:'USA', cn:'CHN', es:'ESP' };
/* Región de una pieza (v10.1): la fuente actual son las etiquetas que se
   marcan en la ficha (regionTags). Solo si una pieza no tiene ninguna se
   usa el texto libre antiguo del campo 'region' (datos de versiones
   anteriores), traduciendo los casos claros a su etiqueta equivalente. */
function legacyRegionCode(text){
  const r = normText(text);
  if(!r.trim()) return null;
  if(r.includes('japon')) return 'jp';
  if(r.includes('espana')) return 'es';
  if(r.includes('ee.uu') || r.includes('eeuu') || r.includes('estados unidos')) return 'us';
  if(r.includes('europa')) return 'eu';
  if(r.includes('china')) return 'cn';
  return null;
}
function regionKeysFor(p){
  const tags = (p.regionTags||[]).filter(Boolean);
  if(tags.length) return tags.map(code=>({ code, label: REGION_OPTIONS.some(o=>o[0]===code) ? t('region.'+code) : code }));
  const txt = (p.region||'').trim();
  if(!txt) return [];
  const code = legacyRegionCode(txt);
  return [ code ? { code, label: t('region.'+code) } : { code:null, label: txt } ];
}
function regionShortText(p){
  const tags = (p.regionTags||[]).filter(Boolean);
  if(tags.length) return tags.map(c=>REGION_CODES[c]||c).join('/');
  return (p.region||'').trim();
}

const SEED_RESEARCH = {};

/* "Completo" = todas las casillas VISIBLES del checklist de su categoría
   marcadas. Desde v10.1 se calcula siempre en vivo (antes se guardaba una
   lista fija que se quedaba desfasada al cambiar el checklist o al
   importar una copia, y había casos especiales para DLC y para piezas
   japonesas de 'media' que exigían una casilla que no se veía). */
function requiredComponentsFor(prod){
  return checklistForCategory(prod.categoryId).map(item=>item.key);
}

let PRODUCTS = []; // se rellena en buildProducts()
let PRODUCTS_BY_ID = {};
let EDITIONS_BY_ID = {};

function buildProducts(){
  PRODUCTS = [];
  const seqByCode = {};

  function pushProduct(base){
    const catId = base.categoryId;
    const requiredComponents = requiredComponentsFor(base);
    const rawEditions = (base.editions && base.editions.length) ? base.editions : seedDefaultEdition(base);
    const multi = rawEditions.length > 1;
    const code = base.platformCode || 'X';
    const sharedOverride = getProductOverride(base.id);
    if(sharedOverride.deleted) return; // borrar el juego entero borra también sus variantes
    const research = SEED_RESEARCH[base.id] || {};

    rawEditions.forEach((e, idx)=>{
      const flatId = multi ? (base.id + '__e' + idx) : base.id;
      const legacyEditionId = base.id + '__e' + idx;
      if(getProductOverride(flatId).deleted) return; // borrar solo esta variante concreta

      seqByCode[code] = (seqByCode[code]||0) + 1;
      const displayId = 'PKM-' + code + '-' + String(seqByCode[code]).padStart(3,'0');
      const seedExistence = e.existence || base.existence || (base.flagged ? 'sin_confirmar' : 'confirmado');
      const name = multi ? (base.name + ' — ' + e.name) : base.name;

      const catChecklist = checklistForCategory(catId);
      const componentsDefault = {};
      catChecklist.forEach(item=>{ componentsDefault[item.key] = false; });
      if(e.have && catChecklist===DEFAULT_CHECKLIST_ITEMS){
        componentsDefault.tengo = true;
      }
      const defaults = {
        id: flatId, displayId, name, nameJp:'', categoryId: catId,
        platformId: base.platformId || null, platformName: base.platformName || '',
        year: e.year || base.year,
        genre:'', developer:'', publisher:'', manufacturer: base.maker || '',
        existence: seedExistence,
        standalone: !!base.standalone, dlc: !!base.dlc, jp: !!base.jp, special: !!base.special,
        regionTags: base.jp ? ['jp'] : [],
        summary: research.summary || '', notes:'', research: base.research || null,
        rareza: research.rareza || '',
        requiredComponents,
        region: e.region, language:null,
        tags: e.tags || [], src: e.src,
        catalogNumber:'', productCode:'', barcode:'', releaseDateExact: research.releaseDateExact || '',
        possession: e.have ? 'tengo' : 'no',
        components: componentsDefault,
        sealed:false,
        conservation: { caja:null, manual:null, cartucho:null, general:null, notas:'' },
        valuation: { valorAdquisicion:null, valorActual:null, fechaActualizacion:'', fuente:'', notas:'' },
        customFields: [], folderId: base.folderId || null,
      };
      const legacyEditionOverride = getEditionOverride(legacyEditionId);
      const ownOverride = getProductOverride(flatId);
      const item = Object.assign({}, defaults, legacyEditionOverride, sharedOverride, ownOverride);
      delete item.deleted;
      // se recalcula con la categoría FINAL (la pieza puede haberse movido)
      item.requiredComponents = requiredComponentsFor(item);
      if(!item.components) item.components = {};
      PRODUCTS.push(item);
    });
  }

  // videojuegos + media: productos agrupados por plataforma (el catálogo de
  // ejemplo no se carga en una copia recién estrenada — solo cuando ya
  // tienes datos propios, o los has importado desde una copia de seguridad)
  if(OVERRIDES.seedEnabled !== false){
    SEED_PLATFORMS.forEach(plat=>{
      const list = SEED_PRODUCTS[plat.id] || [];
      list.forEach(t=>{
        pushProduct(Object.assign({}, t, {
          categoryId: plat.categoryId, platformId: plat.id, platformName: plat.name,
          platformCode: plat.code, maker: plat.maker,
          editions: SEED_EDITIONS[t.id],
        }));
      });
    });

    // juguetes: productos sueltos
    SEED_JUGUETES.forEach(j=>{
      pushProduct(Object.assign({}, j, { platformCode:'TOY', editions: SEED_EDITIONS[j.id] }));
    });
  }

  // productos añadidos manualmente por Sergio (juegos, CD-ROMs, DVDs, lo que sea)
  (OVERRIDES.customProducts || []).forEach(cp=> pushProduct(cp));

  // el nombre de la plataforma de cada producto se resuelve SIEMPRE en vivo
  // aquí al final, para que un renombre posterior (renamePlatform) se vea
  // reflejado en todas partes sin quedarse con el nombre antiguo guardado.
  const platformsById = {};
  getAllPlatforms().forEach(pl=> platformsById[pl.id] = pl);
  PRODUCTS.forEach(item=>{
    if(item.platformId && platformsById[item.platformId]){
      item.platformName = platformsById[item.platformId].name;
    }
  });

  PRODUCTS_BY_ID = {};
  PRODUCTS.forEach(p=> PRODUCTS_BY_ID[p.id] = p);
  EDITIONS_BY_ID = {};
  PRODUCTS.forEach(p=> EDITIONS_BY_ID[p.id] = { product:p, edition:p });
}

function allEditions(){
  return PRODUCTS.map(p=> ({ product:p, edition:p }));
}
/* Igual que allEditions(), pero sin las piezas de plataformas marcadas como
   "no cuenta para la colección" (solo inventario/logística) — se usa para
   los totales globales y por categoría, nunca para las páginas propias de
   cada plataforma ni para Inventario/búsqueda, que siguen mostrándolo todo. */
function allEditionsForStats(){
  return PRODUCTS.filter(p => platformCountsInCollection(p.platformId)).map(p=> ({ product:p, edition:p }));
}
function platformCountsInCollection(platId){
  if(!platId) return true;
  return !(OVERRIDES.platformFlags && OVERRIDES.platformFlags[platId] && OVERRIDES.platformFlags[platId].countsInCollection === false);
}

/* año de salida primero, alfabético después — se aplica en toda la app */
function sortGames(list){
  return list.slice().sort((a,b)=>{
    const ya = parseInt(a.year, 10); const yb = parseInt(b.year, 10);
    const na = isNaN(ya) ? 9999 : ya;
    const nb = isNaN(yb) ? 9999 : yb;
    if(na !== nb) return na - nb;
    return compareNames(a.name, b.name);
  });
}

/* plataformas/consolas propias de Sergio, sumadas a las de serie, con
   posibles renombres aplicados encima */
function getAllPlatforms(){
  const seedPart = OVERRIDES.seedEnabled === false ? [] : SEED_PLATFORMS;
  const all = seedPart.concat(OVERRIDES.customPlatforms || []);
  return all
    .filter(p => !(OVERRIDES.platformFlags && OVERRIDES.platformFlags[p.id] && OVERRIDES.platformFlags[p.id].deleted))
    .map(p => (OVERRIDES.platformNames && OVERRIDES.platformNames[p.id]) ? Object.assign({}, p, {name: OVERRIDES.platformNames[p.id]}) : p);
}
/* Orden de plataformas dentro de una categoría: las que tienen año se
   ordenan siempre de más antigua a más nueva; las que no tienen año
   (ej. "PC", "CD-ROM") se quedan fijas en la posición que el usuario les
   haya dado a mano con las flechas ▲▼, sin desordenar a las demás. */
function platformHasYear(p){
  return !isNaN(parseInt(p.year, 10));
}
function orderedPlatformsForCategory(catId, plats){
  const savedOrder = (OVERRIDES.categoryOrder && OVERRIDES.categoryOrder[catId]) || null;
  let base = plats.slice();
  if(savedOrder){
    const byId = {}; base.forEach(p=> byId[p.id]=p);
    let ordered = savedOrder.map(id=> byId[id]).filter(Boolean);
    const seen = new Set(ordered.map(p=>p.id));
    base.forEach(p=>{ if(!seen.has(p.id)) ordered.push(p); });
    base = ordered;
  }
  const datedSorted = base.filter(platformHasYear).slice().sort((a,b)=> parseInt(a.year,10)-parseInt(b.year,10));
  let di = 0;
  return base.map(p=> platformHasYear(p) ? datedSorted[di++] : p);
}

/* Carpetas — un nivel extra dentro de una plataforma, para cuando se llena
   de cosas muy distintas entre sí. Se usan mucho menos que añadir un
   producto, así que su botón de creación vive abajo del todo, discreto. */
function foldersForPlatform(platId){
  return (OVERRIDES.folders && OVERRIDES.folders[platId]) || [];
}
/* categorías: las de serie + las que crees tú, con posibles renombres
   aplicados encima, y sin las que hayas borrado */
function getAllCategories(){
  const seedPart = OVERRIDES.seedEnabled === false ? [] : SEED_CATEGORIES;
  const all = seedPart.concat(OVERRIDES.customCategories || []);
  return all
    .filter(c => !(OVERRIDES.categoryFlags && OVERRIDES.categoryFlags[c.id] && OVERRIDES.categoryFlags[c.id].deleted))
    .map(c => (OVERRIDES.categoryNames && OVERRIDES.categoryNames[c.id]) ? Object.assign({}, c, {name: OVERRIDES.categoryNames[c.id]}) : c);
}

function isComplete(product, edition){
  if(edition.possession !== 'tengo') return null;
  return product.requiredComponents.every(c => !!edition.components[c]);
}

/* ---------- 4. ESTADÍSTICAS CALCULADAS (nunca hardcodeadas) ---------- */

function computeGlobalStats(){
  const eds = allEditionsForStats();
  const total = eds.length;
  let have = 0, sealed = 0, valor = 0, valued = 0, lastUpdate = null;
  eds.forEach(x=>{
    const e = x.edition;
    if(e.possession==='tengo'){
      have++;
      if(e.sealed) sealed++;
      if(e.valuation && typeof e.valuation.valorActual === 'number'){ valor += e.valuation.valorActual; valued++; }
    }
    const f = e.valuation && e.valuation.fechaActualizacion;
    if(f && (!lastUpdate || f > lastUpdate)) lastUpdate = f;
  });
  const pending = total - have;
  const pct = total ? Math.round((have/total)*100) : 0;
  return { total, have, pending, pct, valor, valued, sealed, lastUpdate };
}
function computeStatsFor(editionsSubset){
  const total = editionsSubset.length;
  const have = editionsSubset.filter(x=>x.edition.possession==='tengo').length;
  return { total, have, pct: total? Math.round((have/total)*100):0 };
}
/* v11: estadísticas agrupadas en UNA sola pasada por la colección (antes se
   recorría la colección entera por cada categoría/plataforma/carpeta). Mismos
   resultados: categorías sin las plataformas que "no cuentan"; plataformas y
   carpetas con todas sus piezas. */
function groupCounts(list, keyFn){
  const m = new Map();
  for(const p of list){
    const k = keyFn(p);
    let s = m.get(k);
    if(!s){ s = { total:0, have:0 }; m.set(k, s); }
    s.total++;
    if(p.possession==='tengo') s.have++;
  }
  m.forEach(s=>{ s.pct = s.total ? Math.round((s.have/s.total)*100) : 0; s.missing = s.total - s.have; });
  return m;
}
const EMPTY_COUNTS = Object.freeze({ total:0, have:0, pct:0, missing:0 });
function statsByCategory(){
  const m = groupCounts(PRODUCTS.filter(p=>platformCountsInCollection(p.platformId)), p=>p.categoryId);
  return getAllCategories().map(c=> Object.assign({ id:c.id, name:c.name }, m.get(c.id) || EMPTY_COUNTS));
}
function platformCountsMap(){ return groupCounts(PRODUCTS, p=>p.platformId); }
function folderCountsMap(){ return groupCounts(PRODUCTS.filter(p=>p.folderId), p=>p.platformId+'\u0000'+p.folderId); }
function statsByPlatform(){
  const m = platformCountsMap();
  return getAllPlatforms().map(p=> Object.assign({ id:p.id, name:p.name, categoryId:p.categoryId }, m.get(p.id) || EMPTY_COUNTS)).filter(s=>s.total>0);
}
/* Plataformas con más piezas pendientes (solo las que cuentan para la
   colección), para el Dashboard: dónde te falta más. */
function platformsWithMostMissing(limit){
  const m = groupCounts(PRODUCTS.filter(p=>p.platformId && platformCountsInCollection(p.platformId)), p=>p.platformId);
  const cats = new Map(getAllCategories().map(c=>[c.id, c.name]));
  return getAllPlatforms()
    .map(p=> Object.assign({ id:p.id, name:p.name, categoryId:p.categoryId, categoryName: cats.get(p.categoryId)||'' }, m.get(p.id) || EMPTY_COUNTS))
    .filter(s=>s.missing>0)
    .sort((a,b)=> b.missing-a.missing || a.pct-b.pct || compareNames(a.name,b.name))
    .slice(0, limit||5);
}
/* Por región (v10.1): usa las etiquetas de región de cada pieza. Una pieza
   con dos etiquetas (p. ej. JAP y USA) cuenta en las dos. Sin etiquetas, se
   usa el texto antiguo del campo 'region'; sin nada, "Sin especificar".
   Orden: las 5 regiones fijas, luego otros textos antiguos, luego sin región. */
function statsByRegion(){
  const eds = allEditions();
  const map = {};
  const order = [];
  const add = (key, sortKey, have)=>{
    if(!map[key]){ map[key] = {total:0, have:0, sortKey}; order.push(key); }
    map[key].total++;
    if(have) map[key].have++;
  };
  eds.forEach(x=>{
    const have = x.edition.possession==='tengo';
    const keys = regionKeysFor(x.product);
    if(!keys.length){ add(t('p.fact.no_region'), 3, have); return; }   // v11.1: "Sin especificar" en el idioma elegido
    keys.forEach(k=>{
      if(k.code){ add(k.label, 1 + REGION_OPTIONS.findIndex(o=>o[0]===k.code)/10, have); }
      else { add(k.label.split(' — ')[0].split(' (')[0], 2, have); }
    });
  });
  return order.slice().sort((a,b)=> map[a].sortKey - map[b].sortKey || compareNames(a,b))
    .map(k=>({ name:k, total:map[k].total, have:map[k].have, pct: Math.round((map[k].have/map[k].total)*100) }));
}

/* Búsqueda local del Dashboard — actualiza solo el bloque de resultados,
   sin recargar toda la página, para que se sienta instantánea al teclear. */
/* Búsqueda común (v10.1) — la usan el Dashboard y el Inventario.
   Ignora tildes y mayúsculas ("pokemon" = "Pokémon") y, si escribes varias
   palabras, exige que estén todas ("rojo game boy"). Busca en: nombre,
   plataforma, región (etiquetas y texto antiguo), etiquetas, resumen y notas. */
function searchTokens(q){
  return normText(q).split(/\s+/).filter(Boolean);
}
function productSearchText(p){
  const regionTxt = (p.regionTags||[]).map(c=>(REGION_CODES[c]||c)+' '+t('region.'+c)).join(' ');
  return normText([p.name, p.platformName, p.region, regionTxt, (p.tags||[]).join(' '), p.summary, p.notes].join(' '));
}
function productMatchesSearch(p, tokens){
  if(!tokens.length) return true;
  const hay = productSearchText(p);
  return tokens.every(tok=> hay.includes(tok));
}
const BACKUP_REMINDER_DAYS = 14;
