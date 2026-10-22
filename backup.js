/* La Colección App — backup.js
   Copias de seguridad: exportar (ZIP completo, JSON, CSV, fotos) e importar con confirmación, copia interna y deshacer. */

async function requestPersistentStorage(){
  await refreshStorageState(true);
  if(view.page==='backup') render();
}

/* Mensajes de estado de la pantalla Copia de seguridad: se guardan aquí para
   que no desaparezcan cuando la pantalla se vuelve a dibujar (antes, tras
   importar, el "Listo…" se borraba al instante). */
let backupStatusMsg = { everything:'', photos:'' };
function setBackupStatus(kind, text){
  backupStatusMsg[kind] = text || '';
  const el = document.getElementById(kind==='photos' ? 'photo-export-status' : 'everything-export-status');
  if(el) el.textContent = backupStatusMsg[kind];
}
/* Archivos que acompañan a la copia de la app dentro del ZIP de "Exportar
   todo" (los mismos que en v10.2). El HTML va autocontenido: su CSS y su JS
   se meten dentro (buildStandaloneAppHtml), así funciona solo al
   descomprimirlo y se puede volver a exportar desde esa copia. */
// [archivo publicado, ruta dentro del ZIP]: el ZIP conserva la estructura de siempre (fonts/)
const APP_FILES = [['jszip.min.js','jszip.min.js'], ['SpaceGrotesk-VF.woff2','fonts/SpaceGrotesk-VF.woff2'], ['OFL.txt','fonts/OFL.txt']];
async function fetchText(url){
  try{ const r = await fetch(url); return r.ok ? await r.text() : null; }catch(e){ return null; }
}
async function replaceAsync(str, re, fn){
  const jobs = []; str.replace(re, (...m)=>{ jobs.push(fn(...m)); return m[0]; });
  const out = await Promise.all(jobs); let i = 0;
  return str.replace(re, ()=>out[i++]);
}
async function buildStandaloneAppHtml(){
  // el index.html publicado (no la pantalla en marcha); si no se puede (p. ej.
  // abierto como archivo local), la página actual, que entonces ya es autocontenida
  let html = await fetchText('index.html');
  if(!html || !/<script/i.test(html)) html = '<!DOCTYPE html>\n' + document.documentElement.outerHTML;
  const missing = [];
  html = await replaceAsync(html, /<link rel="stylesheet" href="([^"]+)">/g, async (m, href)=>{
    const css = await fetchText(href);
    if(css===null){ missing.push(href.split('?')[0]); return m; }
    return '<style>\n' + css.replace(/url\('SpaceGrotesk-VF\.woff2'\)/g, "url('fonts/SpaceGrotesk-VF.woff2')") + '\n</style>';
  });
  html = html.replace('href="SpaceGrotesk-VF.woff2"', 'href="fonts/SpaceGrotesk-VF.woff2"');
  html = await replaceAsync(html, /<script src="([a-z0-9]+\.js\?v=[^"]+)"><\/script>/g, async (m, src)=>{
    const js = await fetchText(src);
    if(js===null){ missing.push(src.split('?')[0]); return m; }
    return '<script>\n' + js.replace(/<\/script/gi, '<\\/script') + '\n</script>';
  });
  return { html, missing };
}
const IMAGE_EXT = { jpg:'image/jpeg', jpeg:'image/jpeg', png:'image/png', webp:'image/webp' };

function exportJSON(){
  const blob = new Blob([JSON.stringify(buildPortableSnapshot(), null, 2)], {type:'application/json'});
  downloadBlob(blob, 'la-coleccion-app-backup-' + new Date().toISOString().slice(0,10) + '.json');
}
/* CSV (v10.2): pensado para abrirse bien en Excel en español — lleva marca
   UTF-8 (tildes correctas), separador ";" y saltos de línea de Windows; la
   categoría va por su nombre y la región sale de tus etiquetas. */
function exportCSV(){
  const eds = allEditions();
  const catName = {}; getAllCategories().forEach(c=> catName[c.id] = c.name);
  const rows = [['ID','Nombre','Categoria','Plataforma','Region','Anio','Posesion','Existencia','Completo','ValorActual']];
  eds.forEach(x=>{
    const c = isComplete(x.product, x.edition);
    rows.push([x.edition.id, x.product.name, catName[x.product.categoryId] || x.product.categoryId, x.product.platformName||'', regionShortText(x.product), x.edition.year||'', x.edition.possession, x.edition.existence, c===null?'':(c?'Si':'No'), (x.edition.valuation.valorActual??'')]);
  });
  const csv = rows.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(';')).join('\r\n');
  downloadBlob(new Blob(['﻿' + csv], {type:'text/csv;charset=utf-8'}), 'la-coleccion-app-inventario-' + new Date().toISOString().slice(0,10) + '.csv');
}
/* Instantánea portable: cada ficha se guarda ya resuelta del todo (nombre,
   año, checklist, posesión, resumen, todo) en vez de guardar solo "lo que
   cambiaste" — así funciona igual da igual si quien la reciba tiene tu
   catálogo de ejemplo cargado en el código o no tiene ninguno. Es lo que
   usa tanto "Exportar todo" como el JSON suelto. */
function buildPortableSnapshot(){
  const snapshot = {
    products: {}, editions: {},
    customCategories: getAllCategories().map(c=>({ id:c.id, name:c.name })),
    customPlatforms: getAllPlatforms().map(p=>({ id:p.id, categoryId:p.categoryId, year:p.year, name:p.name, maker:p.maker, code:p.code })),
    customProducts: [],
    folders: OVERRIDES.folders || {},
    categoryChecklist: OVERRIDES.categoryChecklist || {},
    platformFlags: OVERRIDES.platformFlags || {},
    categoryOrder: OVERRIDES.categoryOrder || {},
    theme: OVERRIDES.theme || 'light',
    dashboardTitle: OVERRIDES.dashboardTitle || '',
    // v10.1: también idioma, moneda y migraciones ya aplicadas
    lang: OVERRIDES.lang || 'es',
    currency: OVERRIDES.currency || '€',
    migrations: (OVERRIDES.migrations || []).slice(),
    tourSeen: true,
    seedEnabled: false,
  };
  // v11.11: tu estantería 3D (si la has montado)
  if(OVERRIDES.estanterias && typeof OVERRIDES.estanterias==='object') snapshot.estanterias = JSON.parse(JSON.stringify(OVERRIDES.estanterias));
  // v11.19: tus filtros guardados y cómo ha cambiado el valor de tu colección (si los hay)
  if(Array.isArray(OVERRIDES.filtrosGuardados) && OVERRIDES.filtrosGuardados.length) snapshot.filtrosGuardados = JSON.parse(JSON.stringify(OVERRIDES.filtrosGuardados));
  if(Array.isArray(OVERRIDES.valorHistorial) && OVERRIDES.valorHistorial.length) snapshot.valorHistorial = JSON.parse(JSON.stringify(OVERRIDES.valorHistorial));
  // v11.20: tus sitios de compra (solo si has cambiado la lista inicial)
  if(Array.isArray(OVERRIDES.tiendas)) snapshot.tiendas = OVERRIDES.tiendas.filter(x=> typeof x==='string');
  PRODUCTS.forEach(p=>{
    snapshot.customProducts.push(Object.assign({}, p));
    snapshot.products[p.id] = Object.assign({}, p);
  });
  return snapshot;
}
/* Paquete completo: el HTML de la app tal cual está corriendo ahora mismo
   (código incluido) + tus datos + todas tus fotos, todo en un único ZIP.
   Desde v10.2 lleva también jszip.min.js y la fuente, así la copia de la
   app que va dentro funciona por sí sola al descomprimirla. */
async function exportEverything(){
  if(typeof JSZip === 'undefined'){
    setBackupStatus('everything', t('bk.nozip'));
    return;
  }
  setBackupStatus('everything', t('bk.preparing_full'));
  const zip = new JSZip();

  // 1) La app, en un único HTML autocontenido (+ JSZip y la fuente)
  const app = await buildStandaloneAppHtml();
  zip.file('la-coleccion-app.html', app.html);
  for(const [src, dest] of APP_FILES){
    try{ const r = await fetch(src); if(r.ok) zip.file(dest, await r.arrayBuffer()); else app.missing.push(src); }catch(e){ app.missing.push(src); }
  }

  // 2) Tus datos, como instantánea completa e independiente
  zip.file('datos.json', JSON.stringify(buildPortableSnapshot(), null, 2));

  // 3) Todas tus fotos, en su propia carpeta
  const { keys, vals } = await idbGetAll(PHOTOS_STORE);
  let addedPhotos = 0;
  keys.forEach((key, i)=>{
    const dataUrl = vals[i];
    if(!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) return;
    const m = dataUrl.match(/^data:([^;]+);base64,([\s\S]*)$/);
    if(!m) return;
    const mime = m[1], base64 = m[2];
    const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
    zip.file('fotos/' + key + '.' + ext, base64, {base64:true});
    addedPhotos++;
  });

  const blob = await zip.generateAsync({type:'blob'});
  downloadBlob(blob, 'la-coleccion-app-completo-' + new Date().toISOString().slice(0,10) + '.zip');
  APP_META.lastFullBackupAt = new Date().toISOString();
  await saveAppMeta();
  setBackupStatus('everything', t('bk.full_done').replace('{n}', addedPhotos)
    + (app.missing.length ? ' ' + t('bk.app_files_missing').replace('{f}', app.missing.join(', ')) : ''));
  showToast(t('bk.full_done_short'), { ok:true });
  const st = document.getElementById('storage-status');
  if(st) st.outerHTML = storageStatusHTML();
}
async function exportAllPhotosZip(){
  if(typeof JSZip === 'undefined'){
    setBackupStatus('photos', t('bk.nozip'));
    return;
  }
  setBackupStatus('photos', t('bk.preparing_zip'));
  const { keys, vals } = await idbGetAll(PHOTOS_STORE);
  if(!keys.length){
    setBackupStatus('photos', t('bk.no_photos'));
    return;
  }
  const zip = new JSZip();
  let added = 0;
  keys.forEach((key, i)=>{
    const dataUrl = vals[i];
    if(!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) return;
    const m = dataUrl.match(/^data:([^;]+);base64,([\s\S]*)$/);
    if(!m) return;
    const mime = m[1], base64 = m[2];
    const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
    zip.file(key + '.' + ext, base64, {base64:true});
    added++;
  });
  const blob = await zip.generateAsync({type:'blob'});
  downloadBlob(blob, 'la-coleccion-app-fotos-' + new Date().toISOString().slice(0,10) + '.zip');
  setBackupStatus('photos', t('bk.photos_export_done').replace('{n}', added));
}

/* Fotos dentro de un ZIP (v10.2): acepta tanto el ZIP de "Exportar solo
   fotos" (fotos sueltas) como el de "Exportar todo" (carpeta fotos/). Solo
   se leen imágenes (jpg, png, webp); cualquier otro archivo se ignora. */
function photoEntriesInZip(zip){
  const names = Object.keys(zip.files).filter(n=>!zip.files[n].dir);
  const isFull = !!zip.file('datos.json') || names.some(n=>n.startsWith('fotos/'));
  const out = [];
  names.forEach(name=>{
    let rel = name;
    if(isFull){ if(!name.startsWith('fotos/')) return; rel = name.slice('fotos/'.length); }
    if(rel.includes('/')) return;
    const dotIdx = rel.lastIndexOf('.');
    if(dotIdx<=0) return;
    const mime = IMAGE_EXT[rel.slice(dotIdx+1).toLowerCase()];
    if(!mime) return;
    out.push({ name, key: rel.slice(0, dotIdx), mime });
  });
  return { entries: out, isFull };
}
async function writePhotoEntries(zip, entries){
  let count = 0;
  for(const e of entries){
    const base64 = await zip.files[e.name].async('base64');
    if(typeof syncNotePhoto==='function') syncNotePhoto(e.key);   // v11.9: sincronización (antes de escribir)
    if(await idbSet(PHOTOS_STORE, e.key, 'data:' + e.mime + ';base64,' + base64)){ count++; indexPhotoKey(e.key); await invalidateThumb(e.key); }
  }
  return count;
}
async function importPhotosZip(input){
  const file = input.files[0];
  input.value = '';
  if(!file) return;
  if(typeof JSZip === 'undefined'){
    setBackupStatus('photos', t('bk.nozip'));
    return;
  }
  try{
    setBackupStatus('photos', t('bk.reading_zip'));
    const zip = await JSZip.loadAsync(file);
    const { entries, isFull } = photoEntriesInZip(zip);
    if(!entries.length){ setBackupStatus('photos', t('import.no_photos')); return; }
    if(!await showConfirmModal(t('import.photos_confirm').replace('{n}', entries.length))){ setBackupStatus('photos', t('import.cancelled')); return; }
    setBackupStatus('photos', t('bk.importing_photos'));
    const count = await writePhotoEntries(zip, entries);
    let msg = t('bk.photos_import_done').replace('{n}', count);
    if(count < entries.length) msg += ' ' + t('import.photos_some_failed').replace('{n}', entries.length - count);
    if(isFull) msg += ' ' + t('import.full_zip_detected');
    setBackupStatus('photos', msg);
    render();
  }catch(err){
    setBackupStatus('photos', t('bk.import_failed') + ' ' + err.message);
  }
}

/* Antes de sustituir la colección por la de un archivo (v10.2): se pide
   confirmación y se guarda una copia interna de la colección actual
   ('overrides_before_last_import'), que "Deshacer la última importación"
   puede recuperar. Si esa copia no se puede guardar, NO se importa. */
function countPiecesInData(data){
  if(!Array.isArray(data.customProducts)) return '?';
  return data.customProducts.filter(cp=> !(data.products && data.products[cp.id] && data.products[cp.id].deleted)).length;
}
async function confirmAndSaveBeforeImport(data){
  const hasCurrent = PRODUCTS.length > 0 || getAllCategories().length > 0;
  if(!hasCurrent) return true;   // colección vacía: no hay nada que perder
  const msg = t('import.confirm').replace('{cur}', PRODUCTS.length).replace('{new}', countPiecesInData(data));
  if(!await showConfirmModal(msg)) return false;
  const savedAt = new Date().toISOString();
  const ok = await idbSet(KV_STORE, 'overrides_before_last_import', JSON.stringify({ savedAt, data: OVERRIDES }));
  if(!ok) throw new Error(t('import.save_copy_failed'));
  APP_META.undoImportAt = savedAt;
  await saveAppMeta();
  return true;
}
async function applyImportedData(data){
  const previous = OVERRIDES;
  OVERRIDES = data;
  if(!await persistOverrides()){ OVERRIDES = previous; throw new Error(t('save.error')); }
  await runMigrations();
  refreshChromeSettings();
  buildProducts();
}
async function undoLastImport(){
  if(storageReadFailed){ setBackupStatus('everything', t('load.read_failed')); return; }
  const raw = await idbGet(KV_STORE, 'overrides_before_last_import');
  let saved = null;
  try{ saved = raw ? JSON.parse(raw) : null; }catch(e){ saved = null; }
  if(!saved || !saved.data){ setBackupStatus('everything', t('import.undo_none')); return; }
  if(!await showConfirmModal(t('import.undo_confirm').replace('{d}', (saved.savedAt||'').slice(0,10)))) return;
  // intercambio: la colección actual pasa a ser la copia, por si quieres volver
  const current = { savedAt: new Date().toISOString(), data: OVERRIDES };
  if(!await idbSet(KV_STORE, 'overrides_before_last_import', JSON.stringify(current))){ setBackupStatus('everything', t('import.save_copy_failed')); return; }
  try{ await applyImportedData(saved.data); }
  catch(err){ setBackupStatus('everything', t('bk.undo_failed') + ' ' + err.message); return; }
  APP_META.undoImportAt = current.savedAt;
  await saveAppMeta();
  setBackupStatus('everything', t('import.undo_done'));
  render();
}

/* ---------- Investigación (v11.3) ----------
   Un archivo «la-coleccion-investigacion» trae, por id de pieza, fecha de
   publicación (releaseDateExact), descripción (summary) y año. Se FUSIONA con
   tu colección (v11.21: también corrige fechas, solo las que apruebes; ver
   researchPlan) y no cambia nada
   más (ni lo que ya escribiste, ni posesión, fotos, checklist…). Antes se
   guarda la copia interna de siempre, así «Deshacer la última importación»
   lo devuelve todo a como estaba. */
const RESEARCH_TYPE = 'la-coleccion-investigacion';
const RESEARCH_FIELDS = ['summary', 'releaseDateExact', 'year'];
function isResearchFile(data){ return !!data && data.tipo===RESEARCH_TYPE && data.piezas && typeof data.piezas==='object'; }
function researchChanges(data){
  const list = []; const n = { summary:0, releaseDateExact:0, year:0 }; let unknown = 0;
  Object.keys(data.piezas).forEach(id=>{
    const p = PRODUCTS_BY_ID[id]; const r = data.piezas[id];
    if(!p){ unknown++; return; }
    if(!r || typeof r!=='object') return;
    const ch = {};
    RESEARCH_FIELDS.forEach(f=>{
      const v = typeof r[f]==='string' || typeof r[f]==='number' ? String(r[f]).trim() : '';
      if(v && !String(p[f]==null ? '' : p[f]).trim()){ ch[f] = v; n[f]++; }
    });
    if(Object.keys(ch).length) list.push({ id, ch });
  });
  return { list, n, unknown };
}
/* v11.21: además de rellenar lo vacío, la investigación puede CORREGIR fechas.
   Antes de tocar nada se abre «Revisar la investigación», pieza a pieza:
   · Se rellenan: no tenía fecha ni año → marcadas.
   · Más exactas: la nueva completa la tuya (1998 → 1998-03, 1998-03 → 1998-03-21) → marcadas.
   · Distintas: la nueva no cuadra con la tuya (1998-05-01 → 1999-02) → SIN marcar: decides tú.
   · Descripciones: solo donde no hay → marcadas.
   Nunca se aplica una fecha menos exacta que la tuya ni una fecha mal escrita.
   Al cambiar la fecha, el año va con ella. Solo se tocan fecha, año y descripción,
   con la copia interna de siempre y «Deshacer». */
function rdNorm(v){   // «AAAA», «AAAA-MM» o «AAAA-MM-DD» válidas → la misma; si no, null
  const s = typeof v==='string' || typeof v==='number' ? String(v).trim() : '';
  const m = s.match(/^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/); if(!m) return null;
  const y = +m[1], mo = m[2] ? +m[2] : 1, d = m[3] ? +m[3] : 1;
  if(y < 1950 || y > 2100 || mo < 1 || mo > 12) return null;
  if(m[3]){ const dt = new Date(Date.UTC(y, mo - 1, d)); if(dt.getUTCMonth()!==mo - 1 || d < 1) return null; }
  return s;
}
function researchPlan(data){
  const items = [], skip = { same:0, less:0, bad:0 }; let unknown = 0;
  Object.keys(data.piezas).forEach(id=>{
    const p = PRODUCTS_BY_ID[id], r = data.piezas[id];
    if(!p){ unknown++; return; }
    if(!r || typeof r!=='object') return;
    // la fecha (o, si no trae fecha, el año)
    const rawD = typeof r.releaseDateExact==='string' || typeof r.releaseDateExact==='number' ? String(r.releaseDateExact).trim() : '';
    const rawY = typeof r.year==='string' || typeof r.year==='number' ? String(r.year).trim() : '';
    const nd = rawD ? rdNorm(rawD) : null, ny = rawY ? rdNorm(rawY) : null;
    if((rawD && !nd) || (rawY && (!ny || ny.length!==4))) skip.bad++;
    const nw = nd || (ny && ny.length===4 ? ny : null);
    if(nw){
      const cur = String(p.releaseDateExact==null ? '' : p.releaseDateExact).trim(), curY = String(p.year==null ? '' : p.year).trim();
      const old = cur ? (rdNorm(cur) || cur) : curY;   // (un año raro, como «1998?», cuenta como distinto: decides tú)
      let kind;
      if(!old) kind = 'fill';
      else if(old===nw) kind = 'same';
      else if(nw.startsWith(old + '-')) kind = 'precise';
      else if(old.startsWith(nw + '-')) kind = 'less';
      else kind = 'differs';
      if(kind==='same' || kind==='less') skip[kind]++;
      else {
        const ch = {}; if(nd && nd!==cur) ch.releaseDateExact = nd;
        const y = nw.slice(0, 4); if(y!==curY) ch.year = y;
        if(Object.keys(ch).length) items.push({ key:kind + ':' + id, kind, id, ch, from: old || '', to: nw });
      }
    }
    // la descripción: solo donde no hay
    const sm = typeof r.summary==='string' ? r.summary.trim() : '';
    const curSum = String(p.summary==null ? '' : p.summary).trim();
    if(sm && !curSum) items.push({ key:'desc:' + id, kind:'desc', id, ch:{ summary:sm }, from:'', to:sm });
    // v11.24: si ya tenía descripción y la nueva es distinta, se ofrece cambiarla (sin marcar: decides tú)
    else if(sm && curSum.replace(/\s+/g, ' ')!==sm.replace(/\s+/g, ' ')) items.push({ key:'descdiff:' + id, kind:'descdiff', id, ch:{ summary:sm }, from:curSum, to:sm });
  });
  return { items, skip, unknown };
}
let RIM = null;
const RIM_KINDS = ['differs', 'precise', 'fill', 'desc', 'descdiff'];
async function importResearch(data){
  const plan = researchPlan(data);
  if(!plan.items.length){
    const msg = t('rimport.nothing') + (plan.unknown ? ' ' + t('rimport.unknown').replace('{n}', plan.unknown) : '');
    setBackupStatus('photos', msg);
    showToast(msg, { duration:6000 });
    return;
  }
  RIM = { plan, sel: new Set(plan.items.filter(x=> x.kind!=='differs' && x.kind!=='descdiff').map(x=> x.key)), applied:false };
  openSheet({ kind:'rimport', title:t('rimport.title'), body:rimportBodyHTML(), foot:rimportFootHTML(), focus:'#rimApply',
    onClose: ()=>{ if(RIM && !RIM.applied) setBackupStatus('photos', t('import.cancelled')); RIM = null; } });
}
function rimportFootHTML(){
  return `<button type="button" class="btn" onclick="closeSheet()">${t('modal.cancel')}</button>
    <button type="button" class="btn primary" id="rimApply" onclick="rimportApply()" ${RIM && RIM.sel.size ? '' : 'disabled'}>${escapeHTML(t('rimport.apply').replace('{n}', RIM ? RIM.sel.size : 0))}</button>`;
}
function rimportBodyHTML(){
  const { plan, sel } = RIM;
  const by = {}; RIM_KINDS.forEach(k=> by[k] = plan.items.filter(x=> x.kind===k));
  const ign = [];
  if(plan.skip.same) ign.push(t('rimport.skip_same').replace('{n}', plan.skip.same));
  if(plan.skip.less) ign.push(t('rimport.skip_less').replace('{n}', plan.skip.less));
  if(plan.skip.bad) ign.push(t('rimport.skip_bad').replace('{n}', plan.skip.bad));
  if(plan.unknown) ign.push(t('rimport.unknown').replace('{n}', plan.unknown));
  const row = (x)=>{ const p = PRODUCTS_BY_ID[x.id], sub = [p.platformName, p.year].filter(Boolean).join(' · ');
    const cut = (v, n)=> v.length > n ? v.slice(0, n) + '…' : v;
    const what = x.kind==='desc' ? `<span class="rim-desc">${escapeHTML(cut(x.to, 140))}</span>`
      : x.kind==='descdiff' ? `<span class="rim-desc"><s>${escapeHTML(cut(x.from, 90))}</s></span><span class="rim-desc rim-new">${escapeHTML(cut(x.to, 220))}</span>`
      : `<span class="rim-dates">${x.from ? `<s>${escapeHTML(x.from)}</s> → ` : ''}<b>${escapeHTML(x.to)}</b></span>`;
    return `<label class="rim-row"><input type="checkbox" data-key="${escapeHTML(x.key)}" ${sel.has(x.key) ? 'checked' : ''} onchange="rimportToggle(this)">
      <span class="rim-txt"><span class="rim-name">${escapeHTML(p.name)}</span><small>${escapeHTML(sub)}</small>${what}</span></label>`; };
  const group = (k)=>{ const L = by[k]; if(!L.length) return ''; const n = L.filter(x=> sel.has(x.key)).length;
    return `<section class="rim-group" data-kind="${k}"><div class="rim-head"><h3>${t('rimport.g_' + k)} <span class="rim-n" id="rimN_${k}">${n}/${L.length}</span></h3>
      <div class="rim-all"><button type="button" class="btn btn-sm btn-ghost" data-fk="rim-all-${k}" onclick="rimportAll('${k}', true)">${t('rimport.all')}</button><button type="button" class="btn btn-sm btn-ghost" data-fk="rim-none-${k}" onclick="rimportAll('${k}', false)">${t('rimport.none')}</button></div></div>
      <p class="section-sub">${t('rimport.d_' + k)}</p><div class="rim-list">${L.map(row).join('')}</div></section>`; };
  return `<p class="section-sub">${t('rimport.intro')}</p>${ign.length ? `<p class="section-sub rim-ign">${escapeHTML(t('rimport.skipped') + ' ' + ign.join(' · '))}</p>` : ''}${RIM_KINDS.map(group).join('')}`;
}
function rimportCounts(){
  if(!RIM) return;
  RIM_KINDS.forEach(k=>{ const el = document.getElementById('rimN_' + k); if(!el) return; const L = RIM.plan.items.filter(x=> x.kind===k); el.textContent = L.filter(x=> RIM.sel.has(x.key)).length + '/' + L.length; });
  const b = document.getElementById('rimApply'); if(b){ b.textContent = t('rimport.apply').replace('{n}', RIM.sel.size); b.disabled = !RIM.sel.size; }
}
function rimportToggle(cb){ if(!RIM) return; if(cb.checked) RIM.sel.add(cb.dataset.key); else RIM.sel.delete(cb.dataset.key); rimportCounts(); }
function rimportAll(kind, on){
  if(!RIM) return;
  RIM.plan.items.forEach(x=>{ if(x.kind===kind){ if(on) RIM.sel.add(x.key); else RIM.sel.delete(x.key); } });
  document.querySelectorAll(`#sheetBody .rim-group[data-kind="${kind}"] input[type="checkbox"]`).forEach(c=>{ c.checked = on; });
  rimportCounts();
}
async function rimportApply(){
  if(!RIM || !RIM.sel.size) return;
  const items = RIM.plan.items.filter(x=> RIM.sel.has(x.key)), unknown = RIM.plan.unknown;
  const byId = {}; items.forEach(x=>{ byId[x.id] = Object.assign(byId[x.id] || {}, x.ch); });
  const n = { dates: items.filter(x=> x.kind!=='desc').length, fixed: items.filter(x=> x.kind==='differs' || x.kind==='precise').length, desc: items.filter(x=> x.kind==='desc' || x.kind==='descdiff').length };
  try{
    // copia interna para poder deshacer (la misma que usa cualquier importación)
    const savedAt = new Date().toISOString();
    if(!await idbSet(KV_STORE, 'overrides_before_last_import', JSON.stringify({ savedAt, data: OVERRIDES }))) throw new Error(t('import.save_copy_failed'));
    APP_META.undoImportAt = savedAt;
    await saveAppMeta();
    const before = JSON.stringify(OVERRIDES);
    Object.keys(byId).forEach(id=>{
      if(!OVERRIDES.products[id]) OVERRIDES.products[id] = {};
      Object.assign(OVERRIDES.products[id], byId[id]);
    });
    if(!await persistOverrides()){ OVERRIDES = JSON.parse(before); throw new Error(t('save.error')); }
    buildProducts();
  }catch(err){
    showToast(t('bk.import_failed') + ' ' + err.message, { duration:6000 });
    setBackupStatus('photos', t('bk.import_failed') + ' ' + err.message);
    return;
  }
  RIM.applied = true; closeSheet();
  const msg = t('rimport.done2').replace('{p}', Object.keys(byId).length).replace('{f}', n.dates).replace('{c}', n.fixed).replace('{d}', n.desc) + (unknown ? ' ' + t('rimport.unknown').replace('{n}', unknown) : '');
  setBackupStatus('photos', msg);
  showToast(msg, { ok:true, duration:8000, action:{ label:t('common.undo'), fn: undoLastImport } });
  render();
}
async function importResearchFile(input){
  const file = input.files[0];
  input.value = '';
  if(!file) return;
  if(storageReadFailed){ setBackupStatus('photos', t('load.read_failed')); return; }
  try{
    let data = null;
    try{ data = JSON.parse(await file.text()); }catch(e){ data = null; }   // otro tipo de archivo: aviso claro, sin errores técnicos
    if(!isResearchFile(data)) throw new Error(t('rimport.bad_format'));
    await importResearch(data);
  }catch(err){
    setBackupStatus('photos', t('bk.import_failed') + ' ' + err.message);
    showToast(t('bk.import_failed') + ' ' + err.message, { duration:6000 });
  }
}

async function importJSON(input){
  const file = input.files[0];
  input.value = '';
  if(!file) return;
  if(storageReadFailed){ setBackupStatus('photos', t('load.read_failed')); return; }
  try{
    const text = await file.text();
    const data = JSON.parse(text);
    // un archivo de investigación se fusiona (no sustituye tu colección)
    if(isResearchFile(data)){ await importResearch(data); return; }
    if(!data.products || !data.editions) throw new Error(t('bk.bad_format'));
    if(!await confirmAndSaveBeforeImport(data)){ setBackupStatus('photos', t('import.cancelled')); return; }
    await applyImportedData(data);
    setBackupStatus('photos', t('bk.json_done'));
    showToast(t('bk.json_done'), { ok:true });
    render();
  }catch(err){
    setBackupStatus('photos', t('bk.import_failed') + ' ' + err.message);
    showToast(t('bk.import_failed') + ' ' + err.message);
  }
}
/* Importar el paquete completo (ZIP de "Exportar TODO"): lee datos.json y
   la carpeta fotos/ de dentro, y restaura los dos de golpe. El HTML de la
   app que también lleva el ZIP no hace falta importarlo — es una copia
   de la que ya tienes abierta. Las fotos del ZIP se añaden a las que ya
   tienes (las del mismo nombre se sustituyen). */
async function importEverything(input){
  const file = input.files[0];
  input.value = '';
  if(!file) return;
  if(storageReadFailed){ setBackupStatus('everything', t('load.read_failed')); return; }
  if(typeof JSZip === 'undefined'){
    setBackupStatus('everything', t('bk.nozip'));
    return;
  }
  try{
    setBackupStatus('everything', t('bk.reading_full'));
    const zip = await JSZip.loadAsync(file);

    const dataFile = zip.file('datos.json');
    if(!dataFile) throw new Error(t('bk.no_datos'));
    const dataText = await dataFile.async('string');
    const data = JSON.parse(dataText);
    if(!data.products || !data.editions) throw new Error(t('bk.bad_format'));
    if(!await confirmAndSaveBeforeImport(data)){ setBackupStatus('everything', t('import.cancelled')); return; }
    setBackupStatus('everything', t('bk.importing_full'));
    await applyImportedData(data);

    const { entries } = photoEntriesInZip(zip);
    const photoCount = await writePhotoEntries(zip, entries);

    let msg = t('bk.full_import_done').replace('{n}', photoCount);
    if(photoCount < entries.length) msg += ' ' + t('import.photos_some_failed').replace('{n}', entries.length - photoCount);
    setBackupStatus('everything', msg);
    render();
  }catch(err){
    setBackupStatus('everything', t('bk.import_failed') + ' ' + err.message);
  }
}

/* Mantenimiento (v11): borra las miniaturas guardadas; se vuelven a crear
   solas al ver las fotos. No toca tus fotos originales. */
async function regenerateThumbs(){
  if(!await showConfirmModal(t('backup.regen_confirm'))) return;
  await clearAllThumbs();
  await loadPhotoIndex();
  showToast(t('backup.regen_done'), { ok:true });
  render();
}
