/* La Colección App — actions.js
   Acciones del usuario que modifican la colección: crear, renombrar, mover, borrar, marcar, editar campos. Mutan, guardan y refrescan lo necesario. */

async function addChecklistItem(catId){
  const label = await showPromptModal(t('dlg.new_component'));
  if(!label) return;
  const current = checklistForCategory(catId).slice();
  const key = 'c' + Math.random().toString(36).slice(2,8);
  current.push({ key, label });
  if(!OVERRIDES.categoryChecklist) OVERRIDES.categoryChecklist = {};
  OVERRIDES.categoryChecklist[catId] = current;
  await persistOverrides();
  buildProducts();
  render();
}
async function renameChecklistItemPrompt(catId, idx){
  const items = checklistForCategory(catId);
  const item = items[idx]; if(!item) return;
  const newLabel = await showPromptModal(t('dlg.rename_component'), item.label);
  if(!newLabel) return;
  const current = items.slice();
  current[idx] = Object.assign({}, current[idx], { label: newLabel.trim() });
  if(!OVERRIDES.categoryChecklist) OVERRIDES.categoryChecklist = {};
  OVERRIDES.categoryChecklist[catId] = current;
  await persistOverrides();
  render();
}
async function removeChecklistItem(catId, idx){
  const current = checklistForCategory(catId).slice();
  if(current.length<=1){ showToast(t('checklist.keep_one')); return; }
  current.splice(idx,1);
  if(!OVERRIDES.categoryChecklist) OVERRIDES.categoryChecklist = {};
  OVERRIDES.categoryChecklist[catId] = current;
  await persistOverrides();
  buildProducts();
  render();
}
async function resetChecklist(catId){
  if(!await showConfirmModal(t('dlg.reset_checklist_confirm'), { okLabel:t('checklist.reset_short') })) return;
  if(OVERRIDES.categoryChecklist) delete OVERRIDES.categoryChecklist[catId];
  await persistOverrides();
  buildProducts();
  render();
}
async function toggleRegionTag(id, code){
  const p = PRODUCTS_BY_ID[id]; if(!p) return;
  const arr = (p.regionTags||[]).slice();
  const idx = arr.indexOf(code);
  if(idx>=0) arr.splice(idx,1); else arr.push(code);
  p.regionTags = arr;
  await setProductField(id, 'regionTags', arr);
  refreshProductMeta(id);
}
async function togglePlatformCounts(platId){
  if(!OVERRIDES.platformFlags) OVERRIDES.platformFlags = {};
  if(!OVERRIDES.platformFlags[platId]) OVERRIDES.platformFlags[platId] = {};
  OVERRIDES.platformFlags[platId].countsInCollection = !platformCountsInCollection(platId);
  await persistOverrides();
  render();
}
async function movePlatform(catId, platId, dir){
  const plats = orderedPlatformsForCategory(catId, getAllPlatforms().filter(p=>p.categoryId===catId));
  const idx = plats.findIndex(p=>p.id===platId);
  const newIdx = idx + dir;
  if(idx<0 || newIdx<0 || newIdx>=plats.length) return;
  const arr = plats.map(p=>p.id);
  const tmp = arr[idx]; arr[idx] = arr[newIdx]; arr[newIdx] = tmp;
  if(!OVERRIDES.categoryOrder) OVERRIDES.categoryOrder = {};
  OVERRIDES.categoryOrder[catId] = arr;
  await persistOverrides();
  render();
}
async function deletePlatform(catId, platId){
  const plat = getAllPlatforms().find(p=>p.id===platId);
  if(!plat) return;
  const prods = PRODUCTS.filter(p=>p.platformId===platId);
  if(!await showConfirmModal(t('dlg.delete_platform_confirm').replace('{name}', plat.name).replace('{n}', prods.length), { danger:true, okLabel:t('common.delete') })) return;
  for(const p of prods){ await setProductField(p.id, 'deleted', true); }
  if(!OVERRIDES.platformFlags) OVERRIDES.platformFlags = {};
  if(!OVERRIDES.platformFlags[platId]) OVERRIDES.platformFlags[platId] = {};
  OVERRIDES.platformFlags[platId].deleted = true;
  await persistOverrides();
  buildProducts();
  showToast(t('toast.platform_deleted').replace('{name}', plat.name));
  goCategory(catId);
}
async function addFolder(catId, platId){
  const name = await showPromptModal(t('dlg.new_folder'));
  if(!name) return;
  if(!OVERRIDES.folders) OVERRIDES.folders = {};
  if(!OVERRIDES.folders[platId]) OVERRIDES.folders[platId] = [];
  const id = 'folder-' + slugify(name) + '-' + Math.random().toString(36).slice(2,7);
  OVERRIDES.folders[platId].push({ id, name });
  await persistOverrides();
  goFolder(catId, platId, id);
}
async function renameFolder(platId, folderId, newName){
  newName = (newName||'').trim();
  if(!newName) return;
  const f = foldersForPlatform(platId).find(x=>x.id===folderId);
  if(!f) return;
  f.name = newName;
  await persistOverrides();
  render();
}
async function deleteFolder(catId, platId, folderId){
  const prods = PRODUCTS.filter(p=>p.platformId===platId && p.folderId===folderId);
  if(!await showConfirmModal(`${t('dlg.delete_folder_q')} ${prods.length ? t('dlg.delete_folder_has').replace('{n}', prods.length) : t('dlg.delete_folder_empty')}`, { danger:true, okLabel:t('common.delete') })) return;
  for(const p of prods){ p.folderId = null; await setProductField(p.id, 'folderId', null); }
  const arr = foldersForPlatform(platId);
  const idx = arr.findIndex(x=>x.id===folderId);
  if(idx>=0) arr.splice(idx,1);
  await persistOverrides();
  goPlatform(catId, platId);
}
async function addCategory(){
  const name = await showPromptModal(t('dlg.new_category'));
  if(!name) return;
  if(!OVERRIDES.customCategories) OVERRIDES.customCategories = [];
  const id = 'cat-' + slugify(name) + '-' + Math.random().toString(36).slice(2,7);
  OVERRIDES.customCategories.push({ id, name });
  await persistOverrides();
  goCategory(id);
}
async function deleteCategory(catId){
  const cat = getAllCategories().find(c=>c.id===catId);
  if(!cat) return;
  const plats = getAllPlatforms().filter(p=>p.categoryId===catId);
  const prods = PRODUCTS.filter(p=>p.categoryId===catId);
  if(!await showConfirmModal(t('dlg.delete_category_confirm').replace('{name}', cat.name).replace('{p}', plats.length).replace('{n}', prods.length), { danger:true, okLabel:t('common.delete') })) return;
  for(const p of prods){ await setProductField(p.id, 'deleted', true); }
  if(!OVERRIDES.platformFlags) OVERRIDES.platformFlags = {};
  plats.forEach(pl=>{
    if(!OVERRIDES.platformFlags[pl.id]) OVERRIDES.platformFlags[pl.id] = {};
    OVERRIDES.platformFlags[pl.id].deleted = true;
  });
  if(!OVERRIDES.categoryFlags) OVERRIDES.categoryFlags = {};
  if(!OVERRIDES.categoryFlags[catId]) OVERRIDES.categoryFlags[catId] = {};
  OVERRIDES.categoryFlags[catId].deleted = true;
  await persistOverrides();
  buildProducts();
  showToast(t('toast.category_deleted').replace('{name}', cat.name));
  goPage('coleccion');
}
async function renameCategory(catId, newName){
  newName = (newName||'').trim();
  if(!newName) return;
  if(!OVERRIDES.categoryNames) OVERRIDES.categoryNames = {};
  OVERRIDES.categoryNames[catId] = newName;
  await persistOverrides();
  render();
}
async function renamePlatform(platId, newName){
  newName = (newName||'').trim();
  if(!newName) return;
  if(!OVERRIDES.platformNames) OVERRIDES.platformNames = {};
  OVERRIDES.platformNames[platId] = newName;
  await persistOverrides();
  buildProducts();
  render();
}
/* Ajustes (desde la hoja de Ajustes): se aplican al momento */
async function setCurrency(sym){
  OVERRIDES.currency = sym;
  await persistOverrides();
  refreshSettingsSheet();
  render();
}
async function setLang(lang){
  OVERRIDES.lang = lang;
  await persistOverrides();
  document.documentElement.lang = lang;
  refreshChromeSettings();
  refreshSettingsSheet();
  render();
}
async function updateDashboardTitle(value){
  value = (value||'').trim();
  // vacío o igual al título por defecto → se guarda vacío (= "por defecto", en el idioma que toque)
  OVERRIDES.dashboardTitle = (!value || value===t('dash.default_title')) ? '' : value;
  await persistOverrides();
}

/* Botón de posesión grande — la acción más habitual, disponible sin tener
   que entrar en la ficha a editar. Alterna entre tengo/no lo tengo; los
   estados intermedios (en camino, reservado…) se afinan dentro de la ficha. */
async function quickTogglePossession(id){
  const rec = EDITIONS_BY_ID[id]; if(!rec) return;
  const next = rec.edition.possession === 'tengo' ? 'no' : 'tengo';
  rec.edition.possession = next;
  await setEditionField(id, 'possession', next);
  // v10.1: la casilla "Lo tengo" (si la categoría la tiene) sigue al botón
  if(checklistHasTengoKey(rec.edition.categoryId)){
    rec.edition.components.tengo = (next==='tengo');
    await setEditionNested(id, 'components', 'tengo', next==='tengo');
    const chk = document.getElementById('chk_'+id+'_tengo'); if(chk) chk.checked = (next==='tengo');
  }
  refreshPossessButton(id);
  refreshCompletoBadge(id);
}
async function confirmMoveProduct(productId){
  const catSel = document.getElementById('movecat_'+productId);
  const platSel = document.getElementById('moveplat_'+productId);
  const folderSel = document.getElementById('movefolder_'+productId);
  const catId = catSel.value;
  const platId = platSel.value || null;
  const folderId = folderSel ? (folderSel.value || null) : null;
  const p = PRODUCTS_BY_ID[productId];
  if(!p) return;
  const plat = platId ? getAllPlatforms().find(x=>x.id===platId) : null;
  const newCategoryId = catId;
  const newPlatformId = plat ? plat.id : null;
  const newPlatformName = plat ? plat.name : '';
  const newFolderId = (plat && folderId) ? folderId : null;
  p.categoryId = newCategoryId; p.platformId = newPlatformId; p.platformName = newPlatformName; p.folderId = newFolderId;
  await setProductField(productId, 'categoryId', newCategoryId);
  await setProductField(productId, 'platformId', newPlatformId);
  await setProductField(productId, 'platformName', newPlatformName);
  await setProductField(productId, 'folderId', newFolderId);
  buildProducts();
  showToast(t('toast.moved'), { ok:true });
  render();
}

async function onPhotoSlotChange(input, key){
  const file = input.files[0]; input.value = '';
  if(!file) return;
  const label = input.closest('label');
  if(label) label.classList.add('is-busy');   // el hueco «late» mientras se procesa (v11.4: sin aviso encima del editor)
  const dataUrl = await savePhotoFile(key, file);
  if(dataUrl){ showToast(t('photo.saved'), { ok:true, replace:true }); render(); }
  else if(label) label.classList.remove('is-busy');
}
/* v11.3: fotos extra (hasta 4). Se pueden elegir varias a la vez; van a los
   huecos libres por orden y las que no caben se avisan. */
async function onExtraPhotosChange(input, id){
  const files = [...(input.files || [])]; input.value = '';
  if(!files.length) return;
  const label = input.closest('label');
  if(label) label.classList.add('is-busy');
  const free = EXTRA_SLOTS.filter(s=>!hasPhoto(id, s));
  const take = files.slice(0, free.length);
  let saved = 0;   // las que no son cuadradas pasan por el editor, una detrás de otra
  for(let i=0; i<take.length; i++){ if(await savePhotoFile('photo_' + id + '_' + free[i], take[i])) saved++; }
  if(!saved){ if(label) label.classList.remove('is-busy'); return; }
  let msg = saved===1 ? t('photo.saved') : t('photo.saved_n').replace('{n}', saved);
  if(files.length > take.length) msg += ' · ' + t('photo.extras_limit').replace('{n}', files.length - take.length);
  showToast(msg, { ok:true, replace:true, duration: files.length > take.length ? 6000 : undefined });
  render();
}
async function removePhotoSlot(key){
  if(!await showConfirmModal(t('photo.remove_confirm'), { danger:true, okLabel:t('photo.remove') })) return;
  await removePhoto(key);
  showToast(t('photo.removed'));
  render();
}

/* ----- Field update handlers: mutan en memoria + guardan, y solo refrescan
   en pantalla lo estrictamente necesario — nunca recargan toda la página,
   así que puedes ir marcando checks sin que se te cierre nada. ----- */
async function updateProductField(id, field, value){
  const p = PRODUCTS_BY_ID[id]; if(p) p[field]=value;
  await setProductField(id, field, value);
  if(['existence','standalone','dlc','special'].includes(field)) refreshProductMeta(id);
}
async function toggleProductFlag(id, field, checked){
  await updateProductField(id, field, checked);
}
async function updateResearchField(id, field, value){
  const p = PRODUCTS_BY_ID[id]; if(!p) return;
  const r = Object.assign({sabemos:'',falta:'',fuentes:'',notas:''}, p.research||{}, {[field]:value});
  p.research = r;
  await setProductField(id, 'research', r);
}
async function updateEditionField(id, field, value){
  const rec = EDITIONS_BY_ID[id]; if(rec) rec.edition[field]=value;
  await setEditionField(id, field, value);
  if(field==='possession'){
    refreshCompletoBadge(id);
    refreshPossessButton(id);
  } else if(field==='sealed'){
    await syncPossessionFromChecklist(id);
    refreshPossessButton(id);
  }
}
/* Posesión a partir del checklist (v10.1):
   - Marcar cualquier casilla (o "Está sellado") → pasa a "lo tengo".
   - Desmarcar casillas de componentes NO quita la posesión (antes sí, y con
     casillas antiguas ocultas podía dejar como "no lo tengo" una pieza que
     sí tienes). Para quitarla, el botón grande "Lo tengo".
   - Excepción: la casilla "Lo tengo" (clave 'tengo') ES la posesión, así que
     desmarcarla sí pasa la pieza a "no lo tengo". */
async function syncPossessionFromChecklist(id, changedKey, changedValue){
  const rec = EDITIONS_BY_ID[id]; if(!rec) return;
  const e = rec.edition;
  let next = e.possession;
  if(changedKey==='tengo' && changedValue===false) next = 'no';
  else {
    const anyChecked = checklistForCategory(e.categoryId).some(item=> !!e.components[item.key]) || !!e.sealed;
    if(anyChecked) next = 'tengo';
  }
  if(e.possession === next) return;
  e.possession = next;
  await setEditionField(id, 'possession', next);
  refreshPossessButton(id);
  refreshCompletoBadge(id);
}
async function updateComponent(id, field, value){
  const rec = EDITIONS_BY_ID[id]; if(rec) rec.edition.components[field]=value;
  await setEditionNested(id,'components',field,value);
  refreshCompletoBadge(id);
  await syncPossessionFromChecklist(id, field, value);
}
async function updateConservation(id, field, value){
  const v = (field==='notas') ? value : (value===''?null:Number(value));
  const rec = EDITIONS_BY_ID[id]; if(rec) rec.edition.conservation[field]=v;
  await setEditionNested(id,'conservation',field,v);
}
async function updateValuation(id, field, value){
  const numeric = ['valorAdquisicion','valorActual'].includes(field);
  const v = numeric ? (value===''?null:Number(value)) : value;
  const rec = EDITIONS_BY_ID[id]; if(rec) rec.edition.valuation[field]=v;
  await setEditionNested(id,'valuation',field,v);
  if(field==='valorActual'){
    const hoy = new Date().toISOString().slice(0,10);
    if(rec) rec.edition.valuation.fechaActualizacion = hoy;
    await setEditionNested(id,'valuation','fechaActualizacion',hoy);
    render();
  }
}
async function updateObjetivo(id, field, value){
  const v = (field==='precioMax') ? (value===''?null:Number(value)) : value;
  const rec = EDITIONS_BY_ID[id]; if(rec) rec.edition.objetivo[field]=v;
  await setEditionNested(id,'objetivo',field,v);
}

async function markComplete(id){
  const rec = EDITIONS_BY_ID[id]; if(!rec) return;
  const e = rec.edition;
  const fields = checklistForCategory(e.categoryId).map(item=>item.key);
  fields.forEach(f=> e.components[f]=true);
  e.possession = 'tengo';
  if(!OVERRIDES.products[id]) OVERRIDES.products[id] = {};
  OVERRIDES.products[id].components = Object.assign({}, OVERRIDES.products[id].components||{}, e.components);
  OVERRIDES.products[id].possession = 'tengo';
  await persistOverrides();
  fields.forEach(f=>{ const el=document.getElementById('chk_'+id+'_'+f); if(el) el.checked=true; });
  refreshCompletoBadge(id);
  refreshPossessButton(id);
  showToast(t('toast.marked_complete'), { ok:true, replace:true });
}
async function addProductToPlatform(catId, platId, folderId){
  const r = await showFormModal(t('dlg.new_product_title'), [
    { name:'name', label:t('dlg.product_name') },
    { name:'year', label:t('dlg.year_optional'), inputmode:'numeric', required:false },
  ], { okLabel:t('common.create') });
  if(!r || !r.name) return;
  await createProductIn(catId, platId, folderId, r.name, r.year || '');
}
/* Una sola forma de crear una pieza dentro de una plataforma (y carpeta):
   la usan el "+" de siempre y «Añadir pieza» (v11.2). Mismos datos que antes. */
async function createProductIn(catId, platId, folderId, name, year){
  const plat = getAllPlatforms().find(p=>p.id===platId);
  if(!plat) return;
  const id = slugify(name) + '-' + Math.random().toString(36).slice(2,7);
  await addCustomProduct({ id, name, year: year||'', categoryId:catId, platformId:platId, platformName:plat.name, platformCode:plat.code, maker:plat.maker, folderId: folderId||null });
}

/* ---------- «＋ Añadir pieza» (v11.2) ----------
   Desde el Dashboard, la Colección, el Inventario, Estadísticas o Investigación:
   una hoja con el nombre, el año y dónde va (categoría → plataforma → carpeta).
   Propone lo que estás mirando (filtros del Inventario) o lo último que usaste. */
let quickAddLast = { cat:'', plat:'', folder:'' };
function qaPlatformsFor(catId){ return orderedPlatformsForCategory(catId, getAllPlatforms().filter(p=>p.categoryId===catId)); }
function quickAddDefaults(){
  const cats = getAllCategories();
  const plats = getAllPlatforms();
  let plat = (view.page==='inventario' && invState.plat) || '';
  let cat = (view.page==='inventario' && invState.cat) || '';
  if(plat){ const pl = plats.find(x=>x.id===plat); cat = pl ? pl.categoryId : cat; if(!pl) plat = ''; }
  if(!cat && !plat){ cat = quickAddLast.cat; plat = quickAddLast.plat; }
  if(!cats.some(c=>c.id===cat)) cat = (cats[0] || {}).id || '';
  const list = qaPlatformsFor(cat);
  if(!list.some(p=>p.id===plat)) plat = (list[0] || {}).id || '';
  const folder = plat && plat===quickAddLast.plat && foldersForPlatform(plat).some(f=>f.id===quickAddLast.folder) ? quickAddLast.folder : '';
  return { cat, plat, folder };
}
function qaPlatOptionsHTML(catId, platId){
  const list = qaPlatformsFor(catId);
  if(!list.length) return `<option value="">${t('qa.no_platforms')}</option>`;
  return list.map(p=>`<option value="${p.id}" ${p.id===platId?'selected':''}>${escapeHTML(p.name)}</option>`).join('');
}
function qaFolderOptionsHTML(platId, folderId){
  return `<option value="">${t('qa.no_folder')}</option>` + foldersForPlatform(platId).map(f=>`<option value="${f.id}" ${f.id===folderId?'selected':''}>${escapeHTML(f.name)}</option>`).join('');
}
function quickAddBodyHTML(d){
  const hasPlats = qaPlatformsFor(d.cat).length > 0;
  const hasFolders = !!(d.plat && foldersForPlatform(d.plat).length);
  return `<div class="field"><label for="qaName">${t('dlg.product_name')}</label>
      <input id="qaName" type="text" autocomplete="off" enterkeyhint="done" aria-describedby="qaNameErr" onkeydown="if(event.key==='Enter'){event.preventDefault(); quickAddSubmit();}" oninput="this.removeAttribute('aria-invalid'); document.getElementById('qaNameErr').hidden=true;">
      <p class="field-error" id="qaNameErr" hidden>${t('qa.name_required')}</p></div>
    <div class="field"><label for="qaYear">${t('dlg.year_optional')}</label>
      <input id="qaYear" type="text" inputmode="numeric" autocomplete="off" maxlength="10" onkeydown="if(event.key==='Enter'){event.preventDefault(); quickAddSubmit();}"></div>
    <div class="qa-where">
      <div class="field-label qa-where-title">${t('qa.where')}</div>
      <div class="field-grid">
        <div class="field"><label for="qaCat">${t('filter.category')}</label><select id="qaCat" onchange="quickAddCatChanged()">
          ${getAllCategories().map(c=>`<option value="${c.id}" ${c.id===d.cat?'selected':''}>${escapeHTML(c.name)}</option>`).join('')}</select></div>
        <div class="field"><label for="qaPlat">${t('filter.platform')}</label><select id="qaPlat" onchange="quickAddPlatChanged()" ${hasPlats?'':'disabled'}>${qaPlatOptionsHTML(d.cat, d.plat)}</select></div>
      </div>
      <div class="field" id="qaFolderField" ${hasFolders?'':'hidden'}><label for="qaFolder">${t('qa.folder')}</label><select id="qaFolder">${hasFolders ? qaFolderOptionsHTML(d.plat, d.folder) : ''}</select></div>
      <div id="qaNoPlat" class="note note-warn qa-noplat" ${hasPlats?'hidden':''}>${t('qa.no_platforms_text')}
        <div class="note-actions"><button type="button" class="btn btn-sm" onclick="quickAddCreatePlatform()">${icon('plus')} ${t('fab.add_platform')}</button></div></div>
    </div>`;
}
function quickAddFootHTML(){
  return `<button type="button" class="btn" onclick="closeSheet()">${t('modal.cancel')}</button><button type="button" class="btn primary" id="qaSubmit" onclick="quickAddSubmit()">${icon('plus')} ${t('fab.add_product')}</button>`;
}
function openQuickAdd(){
  if(!getAllCategories().length){ goPage('coleccion'); return; }
  const d = quickAddDefaults();
  openSheet({ kind:'quickadd', title:t('qa.title'), body:quickAddBodyHTML(d), foot:quickAddFootHTML() });
  quickAddSyncSubmit();
}
function quickAddSyncSubmit(){
  const plat = document.getElementById('qaPlat'); const btn = document.getElementById('qaSubmit');
  if(btn) btn.disabled = !(plat && plat.value);
}
function quickAddCatChanged(){
  const cat = document.getElementById('qaCat').value;
  const platSel = document.getElementById('qaPlat');
  const has = qaPlatformsFor(cat).length > 0;
  platSel.innerHTML = qaPlatOptionsHTML(cat, '');
  platSel.disabled = !has;
  document.getElementById('qaNoPlat').hidden = has;
  quickAddPlatChanged();
}
function quickAddPlatChanged(){
  const plat = document.getElementById('qaPlat').value;
  const field = document.getElementById('qaFolderField');
  const has = !!(plat && foldersForPlatform(plat).length);
  field.hidden = !has;
  document.getElementById('qaFolder').innerHTML = has ? qaFolderOptionsHTML(plat, '') : '';
  quickAddSyncSubmit();
}
function quickAddCreatePlatform(){
  const cat = document.getElementById('qaCat').value;
  closeSheet();
  goCategory(cat);
  addPlatformToCategory(cat);
}
async function quickAddSubmit(){
  const nameEl = document.getElementById('qaName');
  if(!nameEl) return;
  const name = nameEl.value.trim();
  if(!name){ nameEl.setAttribute('aria-invalid','true'); document.getElementById('qaNameErr').hidden = false; nameEl.focus(); return; }
  const cat = document.getElementById('qaCat').value;
  const plat = document.getElementById('qaPlat').value;
  if(!plat) return;
  const folderSel = document.getElementById('qaFolder');
  const folder = folderSel && !document.getElementById('qaFolderField').hidden ? folderSel.value : '';
  const year = document.getElementById('qaYear').value.trim();
  quickAddLast = { cat, plat, folder };
  closeSheet();
  await createProductIn(cat, plat, folder || null, name, year);
}
async function addProductToCategory(catId){
  const r = await showFormModal(t('dlg.new_product_title'), [
    { name:'name', label:t('dlg.product_name') },
    { name:'year', label:t('dlg.year_optional'), inputmode:'numeric', required:false },
  ], { okLabel:t('common.create') });
  if(!r || !r.name) return;
  const name = r.name, year = r.year || '';
  const id = slugify(name) + '-' + Math.random().toString(36).slice(2,7);
  await addCustomProduct({ id, name, year, categoryId:catId, platformCode:'X' });
}
async function addCustomProduct(custom){
  if(!OVERRIDES.customProducts) OVERRIDES.customProducts = [];
  OVERRIDES.customProducts.push(custom);
  await persistOverrides();
  buildProducts();
  showToast(t('toast.product_created'), { ok:true });
  goProduct(custom.id);
}
/* Nueva plataforma/consola dentro de una categoría (Videojuegos, Contenido
   media…) — para cuando lo que falta no es un juego dentro de una consola
   existente, sino la consola/serie entera. */
async function addPlatformToCategory(catId){
  const r = await showFormModal(t('dlg.new_platform_title'), [
    { name:'name', label:t('dlg.platform_name') },
    { name:'year', label:t('dlg.year_optional'), inputmode:'numeric', required:false },
    { name:'maker', label:t('dlg.maker_optional'), required:false },
  ], { okLabel:t('common.create') });
  if(!r || !r.name) return;
  const name = r.name, year = r.year || '—', maker = r.maker || '';
  const id = 'custom-' + slugify(name) + '-' + Math.random().toString(36).slice(2,7);
  if(!OVERRIDES.customPlatforms) OVERRIDES.customPlatforms = [];
  OVERRIDES.customPlatforms.push({ id, categoryId:catId, year, name, maker, code: slugify(name).slice(0,4).toUpperCase() || 'X' });
  await persistOverrides();
  buildProducts();
  goPlatform(catId, id);
}
/* Borrar pieza: se marca como borrada (como siempre) y se ofrece
   "Deshacer" durante unos segundos. */
async function deleteProduct(id){
  const p = PRODUCTS_BY_ID[id];
  if(!await showConfirmModal(t('dlg.delete_product_confirm'), { danger:true, okLabel:t('common.delete') })) return;
  // estado exacto previo, para que "Deshacer" deje los datos guardados idénticos
  const had = !!OVERRIDES.products[id];
  const prev = had && Object.prototype.hasOwnProperty.call(OVERRIDES.products[id], 'deleted') ? { v: OVERRIDES.products[id].deleted } : null;
  await setProductField(id, 'deleted', true);
  buildProducts();
  navBack();
  showToast(t('toast.product_deleted').replace('{name}', p ? p.name : ''), { action:{ label:t('common.undo'), fn: ()=>undoDeleteProduct(id, had, prev) } });
}
async function undoDeleteProduct(id, had, prev){
  const o = OVERRIDES.products[id];
  if(o){
    if(prev) o.deleted = prev.v; else delete o.deleted;
    if(had === false && !Object.keys(o).length) delete OVERRIDES.products[id];
  }
  await persistOverrides();
  buildProducts();
  showToast(t('toast.restored'), { ok:true, replace:true });
  render();
}
async function addCustomField(productId){
  const label = await showPromptModal(t('dlg.new_field'));
  if(!label) return;
  const p = PRODUCTS_BY_ID[productId]; if(!p) return;
  const arr = (p.customFields||[]).concat([{label, value:''}]);
  p.customFields = arr;
  await setProductField(productId, 'customFields', arr);
  render();
}
async function renameCustomField(productId, idx){
  const p = PRODUCTS_BY_ID[productId];
  if(!p || !p.customFields || !p.customFields[idx]) return;
  const nuevo = await showPromptModal(t('dlg.rename_field'), p.customFields[idx].label);
  if(!nuevo || nuevo===p.customFields[idx].label) return;
  p.customFields[idx].label = nuevo;
  await setProductField(productId, 'customFields', p.customFields);
  render();
}
async function updateCustomField(productId, idx, value){
  const p = PRODUCTS_BY_ID[productId];
  if(!p || !p.customFields || !p.customFields[idx]) return;
  p.customFields[idx].value = value;
  await setProductField(productId, 'customFields', p.customFields);
}
async function removeCustomField(productId, idx){
  const p = PRODUCTS_BY_ID[productId];
  if(!p || !p.customFields) return;
  p.customFields.splice(idx,1);
  await setProductField(productId, 'customFields', p.customFields);
  render();
}
