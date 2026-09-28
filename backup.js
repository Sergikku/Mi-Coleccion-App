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

async function importJSON(input){
  const file = input.files[0];
  input.value = '';
  if(!file) return;
  if(storageReadFailed){ setBackupStatus('photos', t('load.read_failed')); return; }
  try{
    const text = await file.text();
    const data = JSON.parse(text);
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
