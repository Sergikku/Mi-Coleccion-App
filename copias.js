/* La Colección App — copias.js (v11.11)
   Cuántas tienes de cada pieza y en qué estado está cada copia:
   · En la ficha: «Cuántas tienes» con − / + y la lista de copias.
   · Cada copia tiene su hoja: fotos propias, qué trae (las casillas de su
     categoría y el precinto), conservación (1–10, la escala de siempre),
     nota y «para cambio».
   · Siempre se enseña la mejor copia (ver shownCopy en model.js).
   · Repetidas: en el Inventario (chip «Repetidas»), con el resumen y una
     imagen «Para cambio» para compartir (sin precios).
   La copia 1 es la propia pieza (sus campos de siempre); las demás van en
   la lista nueva `copias` de la pieza. */

/* ---------- Textos ---------- */
const COND_WORDS = [[2,'copy.cond.damaged'],[4,'copy.cond.worn'],[6,'copy.cond.good'],[8,'copy.cond.verygood'],[10,'copy.cond.mint']];
function condWord(g){ if(!g) return ''; const w = COND_WORDS.find(x=> g <= x[0]); return w ? t(w[1]) : ''; }
function condText(g){ return g ? `${condWord(g)} · ${g}/10` : t('copy.cond.none'); }
function estadoLabel(e){ return t('copy.estado.' + e); }
function copyLine(p, c){ const g = copyCond(c); return estadoLabel(copyEstado(p.categoryId, c)) + (g ? ' · ' + condText(g) : ''); }

/* ---------- Ficha: «Cuántas tienes» ---------- */
function copiesSectionHTML(p){
  if(p.possession!=='tengo') return '';
  const list = copiesOf(p);
  const n = list.length;
  const shown = shownCopy(p);
  const extra = n - 1;
  const trade = list.filter(c=>c.paraCambio).length;
  const aside = n > 1 ? escapeHTML(t('copy.aside').replace('{n}', extra)) + (trade ? ' · ' + escapeHTML(t('copy.trade_n').replace('{n}', trade)) : '') : '';
  let html = `<section class="detail-section copies-section" id="copies-${escapeHTML(p.id)}" aria-labelledby="copies-t-${escapeHTML(p.id)}">
    <h2 class="section-title" id="copies-t-${escapeHTML(p.id)}">${t('copy.title')}${aside ? `<span class="section-aside">${aside}</span>` : ''}</h2>
    <div class="copies-top">
      <div class="qty-stepper" role="group" aria-label="${escapeHTML(t('copy.title'))}">
        <button type="button" class="qty-btn" data-fk="copy-rm" onclick="removeLastCopy('${p.id}')" ${n<=1 ? 'disabled' : ''} aria-label="${escapeHTML(t('copy.remove_one'))}">${icon('minus')}</button>
        <output class="qty-value" aria-live="polite">${n}</output>
        <button type="button" class="qty-btn" data-fk="copy-add" onclick="addCopy('${p.id}')" ${n>=MAX_COPIES ? 'disabled' : ''} aria-label="${escapeHTML(t('copy.add_one'))}">${icon('plus')}</button>
      </div>
      <p class="copies-hint">${n > 1 ? escapeHTML(t('copy.shown_is').replace('{n}', shown.n).replace('{s}', copyLine(p, shown))) : escapeHTML(t('copy.hint_one'))}</p>
    </div>`;
  if(n > 1){
    html += `<ol class="copy-list">${list.map(c=> copyRowHTML(p, c, c.id===shown.id)).join('')}</ol>`;
  }
  return html + `</section>`;
}
/* Al cambiar la copia 1 desde la ficha (casillas, precinto, conservación):
   la sección de copias se pone al día (cuál se enseña, su línea) */
function refreshCopiesSection(id){
  const el = document.getElementById('copies-' + id), p = PRODUCTS_BY_ID[id];
  if(!el || !p || copyCount(p) < 2) return;
  const a = document.activeElement, fk = a && el.contains(a) && a.dataset ? a.dataset.fk : null;
  el.outerHTML = copiesSectionHTML(p);
  const el2 = document.getElementById('copies-' + id);
  if(el2){ hydratePhotos(el2); if(fk){ const b = el2.querySelector(`[data-fk="${fk}"]`); if(b) b.focus({ preventScroll:true }); } }
}
function copyThumbHTML(p, c){
  const pv = platVisual(p.platformId);
  return hasPhoto(c.photoId, 'front') ? photoImgHTML(p, 'front', 'thumb', 'data-eager="1"', c.photoId)
    : `<span class="copy-thumb-code" style="--plat:${pv.color}">${escapeHTML(pv.code || '#')}</span>`;
}
function copyRowHTML(p, c, isShown){
  return `<li><button type="button" class="copy-row${isShown ? ' is-shown' : ''}" onclick="openCopySheet('${p.id}','${c.id}')">
    <span class="copy-thumb" aria-hidden="true">${copyThumbHTML(p, c)}</span>
    <span class="copy-body">
      <span class="copy-name">${escapeHTML(t('copy.n').replace('{n}', c.n))}${isShown ? `<span class="copy-shown">${icon('crown')}${t('copy.shown')}</span>` : ''}${c.paraCambio ? `<span class="copy-trade">${t('copy.trade')}</span>` : ''}</span>
      <span class="copy-meta">${escapeHTML(copyLine(p, c))}</span>
    </span>${icon('chevronRight')}
  </button></li>`;
}

/* ---------- Acciones ---------- */
function ensureCopyStore(id){
  if(!OVERRIDES.products[id]) OVERRIDES.products[id] = {};
  const o = OVERRIDES.products[id];
  if(!Array.isArray(o.copias)) o.copias = Array.isArray(PRODUCTS_BY_ID[id] && PRODUCTS_BY_ID[id].copias) ? PRODUCTS_BY_ID[id].copias.slice() : [];
  if(PRODUCTS_BY_ID[id]) PRODUCTS_BY_ID[id].copias = o.copias;
  return o.copias;
}
async function addCopy(id){
  const p = PRODUCTS_BY_ID[id]; if(!p) return;
  if(copyCount(p) >= MAX_COPIES){ showToast(t('copy.max').replace('{n}', MAX_COPIES)); return; }
  const arr = ensureCopyStore(id);
  const c = { id: nextCopyId(p), sealed:false, components:{}, conservation:{ general:null, notas:'' }, paraCambio:false };
  arr.push(c);
  await persistOverrides();
  renderKeepFocus('[data-fk="copy-add"]');
  const n = copyCount(p);
  showToast(t('copy.added').replace('{n}', n), { ok:true, replace:true, action:{ label:t('copy.edit'), fn: ()=>openCopySheet(id, c.id) } });
}
/* ¿Tiene algo apuntado esta copia? (para preguntar antes de quitarla) */
function copyHasData(c){
  return !!(c.sealed || c.paraCambio || copyCond(c) || (c.conservation && String(c.conservation.notas || '').trim())
    || Object.values(c.components || {}).some(Boolean) || hasPhoto(c.photoId, 'front') || hasPhoto(c.photoId, 'back'));
}
async function removeCopyPhotos(c){
  for(const side of ['front', 'back']){ const k = photoKeyFor(c.photoId, side); if(k) await removePhoto(k); }
}
async function removeLastCopy(id){
  const p = PRODUCTS_BY_ID[id]; if(!p) return;
  const list = copiesOf(p); if(list.length < 2) return;
  await removeCopy(id, list[list.length - 1].id, true);
}
/* Quitar una copia. La copia 1 no se puede quitar sin más (es la propia pieza):
   la siguiente pasa a ser la copia 1, con sus datos y sus fotos. */
async function removeCopy(id, copyId, fromStepper){
  const p = PRODUCTS_BY_ID[id]; if(!p) return;
  const list = copiesOf(p);
  const c = list.find(x=>x.id===copyId); if(!c || list.length < 2) return;
  if(c.base){
    if(!await showConfirmModal(t('copy.remove_first_confirm'), { danger:true, okLabel:t('copy.remove') })) return;
    if(!await promoteCopy(id, list[1])) return;
  } else {
    if(copyHasData(c) && !await showConfirmModal(t('copy.remove_confirm').replace('{n}', c.n), { danger:true, okLabel:t('copy.remove') })) return;
    const arr = ensureCopyStore(id);
    const i = arr.findIndex(x=>x && x.id===copyId);
    if(i >= 0) arr.splice(i, 1);
    await persistOverrides();
    await removeCopyPhotos(c);
  }
  // con una sola copia, «para cambio» no se ve ni se puede quitar: se quita aquí
  if(copyCount(p)===1 && p.paraCambio) await setCopyField(id, 'c1', 'paraCambio', false);
  if(isSheetKind('copy')) closeSheet();
  showToast(t('copy.removed'), { replace:true });
  renderKeepFocus('[data-fk="copy-add"]');
}
/* La copia `c` (la 2.ª) pasa a ser la copia 1: sus datos y sus fotos a la pieza */
async function promoteCopy(id, c){
  const o = OVERRIDES.products[id] || (OVERRIDES.products[id] = {});
  const p = PRODUCTS_BY_ID[id];
  const tengo = checklistHasTengoKey(p.categoryId);
  const comps = Object.assign({}, c.components || {});
  if(tengo) comps.tengo = true;
  o.sealed = !!c.sealed; o.components = comps; o.paraCambio = !!c.paraCambio;
  o.conservation = Object.assign({ caja:null, manual:null, cartucho:null, general:null, notas:'' }, p.conservation || {}, { general: copyCond(c), notas: (c.conservation && c.conservation.notas) || '' });
  // fotos: las de la copia pasan a la pieza; las de la copia 1 se quitan.
  // (las «Fotos extra» son de la pieza, no de una copia: se quedan como están)
  // Primero se copian; si alguna no se puede guardar, no se cambia nada.
  const moved = {};
  for(const side of ['front', 'back']){
    const src = photoKeyFor(c.photoId, side);
    if(!src) continue;
    const data = await loadPhoto(src);
    if(!data) continue;
    const backup = await loadPhoto('photo_' + id + '_' + side);
    if(!await storePhotoData('photo_' + id + '_' + side, data)){
      // deshacer lo ya copiado y avisar (storePhotoData ya ha avisado del fallo)
      for(const sd of Object.keys(moved)){ if(moved[sd].backup) await storePhotoData('photo_' + id + '_' + sd, moved[sd].backup); else await removePhoto('photo_' + id + '_' + sd); }
      return false;
    }
    moved[side] = { src, backup };
  }
  for(const side of ['front', 'back']){
    const own = photoKeyFor(id, side);
    if(moved[side]){
      if(own && own!=='photo_' + id + '_' + side) await removePhoto(own);
      await removePhoto(moved[side].src);
    } else if(own) await removePhoto(own);
  }
  const arr = ensureCopyStore(id);
  const i = arr.findIndex(x=>x && x.id===c.id);
  if(i >= 0) arr.splice(i, 1);
  Object.assign(p, { sealed:o.sealed, components:o.components, paraCambio:o.paraCambio, conservation:o.conservation });
  await persistOverrides();
  return true;
}
/* Cambiar un dato de una copia (la 1 usa los campos de siempre de la pieza) */
async function setCopyField(id, copyId, field, value){
  const p = PRODUCTS_BY_ID[id]; if(!p) return;
  if(copyId==='c1'){
    if(field==='sealed') await updateEditionField(id, 'sealed', !!value);
    else if(field==='paraCambio'){ p.paraCambio = !!value; await setProductField(id, 'paraCambio', !!value); }
    else if(field==='general') await updateConservation(id, 'general', value===null ? '' : String(value));
    else if(field==='notas') await updateConservation(id, 'notas', value);
    else if(field.startsWith('comp:')) await updateComponent(id, field.slice(5), !!value);
  } else {
    const arr = ensureCopyStore(id);
    const c = arr.find(x=>x && x.id===copyId); if(!c) return;
    if(field==='sealed' || field==='paraCambio') c[field] = !!value;
    else if(field==='general' || field==='notas'){ c.conservation = Object.assign({ general:null, notas:'' }, c.conservation || {}); c.conservation[field] = field==='general' ? (value===null ? null : Number(value)) : value; }
    else if(field.startsWith('comp:')){ c.components = Object.assign({}, c.components || {}); c.components[field.slice(5)] = !!value; }
    await persistOverrides();
  }
}

/* ---------- Hoja de una copia ---------- */
let copySheetState = null;   // { id, copyId }
function openCopySheet(id, copyId){
  const p = PRODUCTS_BY_ID[id]; if(!p) return;
  const c = copiesOf(p).find(x=>x.id===copyId); if(!c) return;
  copySheetState = { id, copyId };
  openSheet({ kind:'copy', title: copySheetTitle(p, c), body: copySheetBodyHTML(p, c), foot: copySheetFootHTML(p, c), onClose: ()=>{ copySheetState = null; } });
  hydratePhotos(document.getElementById('sheetOverlay'));
}
function copySheetTitle(p, c){ return t('copy.n').replace('{n}', c.n) + ' · ' + p.name; }
function refreshCopySheet(){
  if(!copySheetState || !isSheetKind('copy')) return;
  const p = PRODUCTS_BY_ID[copySheetState.id]; if(!p){ closeSheet(); return; }
  const c = copiesOf(p).find(x=>x.id===copySheetState.copyId); if(!c){ closeSheet(); return; }
  const body = document.getElementById('sheetBody');
  const y = body ? body.scrollTop : 0;
  const a = document.activeElement;
  const focusSel = a && a.closest && a.closest('#sheetOverlay') && a.dataset && a.dataset.focus ? `[data-focus="${a.dataset.focus}"]` : '';
  const title = document.getElementById('sheetTitle'); if(title) title.textContent = copySheetTitle(p, c);
  updateSheetBody(copySheetBodyHTML(p, c));
  const foot = document.querySelector('#sheetOverlay .sheet-foot'); if(foot) foot.innerHTML = copySheetFootHTML(p, c);
  if(body) body.scrollTop = y;
  if(focusSel){ const el = document.querySelector('#sheetOverlay ' + focusSel); if(el) el.focus(); }
  hydratePhotos(document.getElementById('sheetOverlay'));
}
async function copySheetSet(field, value){
  if(!copySheetState) return;
  const { id, copyId } = copySheetState;
  await setCopyField(id, copyId, field, value);
  // la nota se guarda al salir del campo, justo cuando tocas otro botón de la hoja:
  // no se redibuja la hoja (si no, ese toque se perdería); en la hoja no cambia nada más
  if(field!=='notas') refreshCopySheet();
  render();
}
function copySheetBodyHTML(p, c){
  const list = copiesOf(p);
  const shown = shownCopy(p);
  const isShown = list.length > 1 && shown.id===c.id;
  const items = copyItemsFor(p.categoryId);
  const est = copyEstado(p.categoryId, c);
  const g = copyCond(c);
  const pv = platVisual(p.platformId);
  // fotos
  let photos;
  if(c.base){
    photos = `<div class="copy-photos is-base">${['front','back'].map(side=> hasPhoto(p.id, side)
        ? `<button type="button" class="copy-photo" onclick="openPhotoViewer('${p.id}','${side}')" aria-label="${escapeHTML(t('photo.enlarge') + ' — ' + photoSideLabel(side))}">${photoImgHTML(p, side, 'thumb', 'data-eager="1"')}</button>`
        : `<span class="copy-photo is-empty" style="--plat:${pv.color}">${escapeHTML(photoSideLabel(side))}</span>`).join('')}</div>
      <p class="photo-note">${t('copy.photos_base')}</p>`;
  } else {
    photos = `<div class="copy-photos">${['front','back'].map(side=>{
      const key = 'photo_' + c.photoId + '_' + side;
      const label = photoSideLabel(side);
      if(!hasPhoto(c.photoId, side)){
        return `<label class="copy-photo is-add photo-picker" style="--plat:${pv.color}">${icon('camera')}<span>${escapeHTML(label)}</span><input type="file" accept="image/*" class="sr-only" aria-label="${escapeHTML(t(side==='back' ? 'photo.add_back' : 'photo.add_front') + ' — ' + t('copy.n').replace('{n}', c.n))}" onchange="onCopyPhotoChange(this,'${key}')"></label>`;
      }
      return `<div class="copy-photo-wrap"><button type="button" class="copy-photo" onclick="openPhotoViewer('${escapeHTML(c.photoId)}','${side}')" aria-label="${escapeHTML(t('photo.enlarge') + ' — ' + label)}">${photoImgHTML(p, side, 'thumb', 'data-eager="1"', c.photoId)}</button>
        <button type="button" class="slot-btn slot-remove copy-photo-rm" onclick="removeCopyPhoto('${photoKeyFor(c.photoId, side)}')" title="${escapeHTML(t('photo.remove'))}">${icon('trash')}<span class="sr-only">${escapeHTML(t('photo.remove') + ' — ' + label)}</span></button></div>`;
    }).join('')}</div>`;
  }
  // qué trae
  const chip = (field, label, on, ic, sealedCls)=> `<button type="button" class="chip copy-chip${sealedCls ? ' is-seal' : ''} ${on ? 'active' : ''}" aria-pressed="${on}" data-focus="${field}" onclick="copySheetSet('${field}', ${!on})">${ic ? icon(ic) : ''}${escapeHTML(label)}</button>`;
  const what = items.map(it=> chip('comp:' + it.key, checklistLabel(it), !!(c.components && c.components[it.key]), checklistIcon(it))).join('')
    + chip('sealed', t('copy.sealed'), !!c.sealed, 'shield', true);
  // conservación 1–10
  const scale = [1,2,3,4,5,6,7,8,9,10].map(v=>`<button type="button" class="cond-step${g && v<=g ? ' is-on' : ''}${g===v ? ' is-cur' : ''}" aria-pressed="${g===v}" data-focus="cond${v}" onclick="copySheetSet('general', ${g===v ? 'null' : v})" aria-label="${v}/10 — ${escapeHTML(condWord(v))}">${v}</button>`).join('');
  const ranked = rankedCopies(p);
  const order = list.length > 1 ? `<div class="sheet-group"><div class="field-label">${t('copy.order')}</div><ol class="copy-order">${ranked.map((x, i)=>`<li class="${x.id===c.id ? 'is-cur' : ''}"><span class="co-pos">${i + 1}</span><span class="co-name">${escapeHTML(t('copy.n').replace('{n}', x.n))}</span><span class="co-meta">${escapeHTML(copyLine(p, x))}</span>${i===0 ? `<span class="copy-shown">${icon('crown')}${t('copy.shown')}</span>` : ''}</li>`).join('')}</ol>
      <p class="settings-note">${t('copy.order_note')}</p></div>` : '';
  return `${isShown ? `<p class="note note-info copy-shown-note">${icon('crown')} ${t('copy.is_shown_note')}</p>` : ''}
    <div class="sheet-group"><div class="field-label">${t('copy.photos')}</div>${photos}</div>
    <div class="sheet-group"><div class="field-label" id="cwhat">${t('copy.what')}</div>
      <div class="chip-row" role="group" aria-labelledby="cwhat">${what}</div>
      <p class="copy-estado">${t('copy.stays_as')} <b>${escapeHTML(estadoLabel(est))}</b></p></div>
    <div class="sheet-group"><div class="field-label" id="ccond">${t('copy.cond')}</div>
      <div class="cond-scale" role="group" aria-labelledby="ccond">${scale}</div>
      <p class="copy-estado">${g ? `<b>${escapeHTML(condWord(g))}</b> · ${g}/10` : escapeHTML(t('copy.cond.none'))}</p></div>
    <div class="field"><label for="copyNote">${t('copy.note')}</label><textarea id="copyNote" data-nosave data-focus="note" onchange="copySheetSet('notas', this.value)">${escapeHTML((c.conservation && c.conservation.notas) || '')}</textarea></div>
    <div class="sheet-group"><label class="check-item copy-trade-check"><span class="check-ico" aria-hidden="true">${icon('swap')}</span><span class="check-label">${t('copy.trade_label')}<span class="row-sub">${t('copy.trade_sub')}</span></span><input type="checkbox" data-focus="trade" ${c.paraCambio ? 'checked' : ''} onchange="copySheetSet('paraCambio', this.checked)"></label></div>
    ${order}`;
}
function copySheetFootHTML(p, c){
  const n = copyCount(p);
  return `${n > 1 ? `<button type="button" class="btn btn-danger" onclick="removeCopy('${p.id}','${c.id}')">${icon('trash')} ${t('copy.remove')}</button>` : ''}<button type="button" class="btn primary" onclick="closeSheet()">${t('copy.done')}</button>`;
}
async function onCopyPhotoChange(input, key){
  const file = input.files[0]; input.value = '';
  if(!file) return;
  const label = input.closest('label'); if(label) label.classList.add('is-busy');
  const dataUrl = await savePhotoFile(key, file);
  if(dataUrl) showToast(t('photo.saved'), { ok:true, replace:true });
  else if(label) label.classList.remove('is-busy');
  refreshCopySheet();
  render();
}
async function removeCopyPhoto(key){
  if(!key) return;
  if(!await showConfirmModal(t('photo.remove_confirm'), { danger:true, okLabel:t('photo.remove') })) return;
  await removePhoto(key);
  showToast(t('photo.removed'));
  refreshCopySheet();
  render();
}

/* ---------- Repetidas (Inventario) ---------- */
function repeatedSummaryHTML(list){
  const r = repeatedStats(list);
  if(!r.pieces) return '';
  return `<div class="rep-summary">
    <div class="rep-nums"><span><b>${r.pieces}</b> ${escapeHTML(t(r.pieces===1 ? 'rep.pieces_one' : 'rep.pieces_many'))}</span><span><b>${r.extra}</b> ${escapeHTML(t(r.extra===1 ? 'rep.extra_one' : 'rep.extra_many'))}</span><span class="is-trade"><b>${r.trade}</b> ${escapeHTML(t('rep.trade'))}</span></div>
    ${r.trade ? `<button type="button" class="btn btn-sm" onclick="shareTradeImage()">${icon('share')} ${t('rep.share')}</button>` : `<p class="section-sub">${t('rep.no_trade')}</p>`}
  </div>`;
}

/* ---------- Imagen «Para cambio» ----------
   Una imagen (PNG) con las copias que tienes para cambio: foto, nombre,
   plataforma y estado. Sin precios. Se comparte con el menú del móvil o se
   descarga. */
function tradeItems(){
  const out = [];
  sortGames(PRODUCTS.filter(p=>copyCount(p) > 1)).forEach(p=>{
    copiesOf(p).forEach(c=>{ if(c.paraCambio) out.push({ p, c }); });
  });
  return out;
}
function loadImg(src){ return new Promise((res)=>{ if(!src){ res(null); return; } const i = new Image(); i.onload = ()=>res(i); i.onerror = ()=>res(null); i.src = src; }); }
function roundRect(ctx, x, y, w, h, r){ ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function fitText(ctx, s, maxW){
  if(ctx.measureText(s).width <= maxW) return s;
  let lo = 0, hi = s.length;
  while(lo < hi){ const m = (lo + hi + 1) >> 1; if(ctx.measureText(s.slice(0, m) + '…').width <= maxW) lo = m; else hi = m - 1; }
  return s.slice(0, lo) + '…';
}
async function buildTradeImage(){
  const items = tradeItems();
  const S = 2, W = 540, PAD = 28, ROW = 92, HEAD = 128, FOOT = 74;
  const H = HEAD + Math.max(1, items.length) * ROW + FOOT;
  const cv = document.createElement('canvas'); cv.width = W * S; cv.height = H * S;
  const ctx = cv.getContext('2d'); ctx.scale(S, S);
  try{ await document.fonts.load('600 16px "Space Grotesk"'); }catch(e){}
  const F = (w, px)=> `${w} ${px}px "Space Grotesk", system-ui, sans-serif`;
  // papel
  ctx.fillStyle = '#05060a'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#f2f1ee'; roundRect(ctx, 10, 10, W - 20, H - 20, 18); ctx.fill();
  ctx.fillStyle = '#a44a34'; ctx.font = F(600, 12); ctx.fillText(t('rep.img_kicker').toUpperCase(), PAD + 10, 54);
  ctx.fillStyle = '#14161b'; ctx.font = F(600, 30); ctx.fillText(t('rep.img_title'), PAD + 10, 90);
  ctx.fillStyle = 'rgba(20,22,27,0.64)'; ctx.font = F(400, 13);
  ctx.fillText(t('rep.img_sub').replace('{n}', items.length).replace('{d}', new Date().toLocaleDateString(numLocale())), PAD + 10, 112);
  let y = HEAD;
  for(const { p, c } of items){
    const pv = platVisual(p.platformId);
    ctx.strokeStyle = 'rgba(20,22,27,0.1)'; ctx.beginPath(); ctx.moveTo(PAD + 10, y); ctx.lineTo(W - PAD - 10, y); ctx.stroke();
    const tx = PAD + 10, ty = y + 12, ts = 68;
    // solo la foto de ESA copia (la de otra copia confundiría a quien la vea); si no tiene, el color de su plataforma
    const pid = hasPhoto(c.photoId, 'front') ? c.photoId : null;
    const img = pid ? await loadImg(await getPhotoURL(pid, 'front', 'thumb')) : null;
    ctx.save(); roundRect(ctx, tx, ty, ts, ts, 8); ctx.clip();
    if(img){ ctx.fillStyle = '#fff'; ctx.fillRect(tx, ty, ts, ts); ctx.drawImage(img, tx, ty, ts, ts); }
    else { ctx.fillStyle = pv.color; ctx.fillRect(tx, ty, ts, ts); ctx.fillStyle = '#fff'; ctx.font = F(700, 13); ctx.textAlign = 'center'; ctx.fillText(pv.code || '', tx + ts / 2, ty + ts / 2 + 5); ctx.textAlign = 'left'; }
    ctx.restore();
    const x2 = tx + ts + 14, maxW = W - PAD - 10 - x2;
    if(pv.code){
      ctx.font = F(700, 10);
      const cw = ctx.measureText(pv.code).width + 12;
      ctx.fillStyle = pv.color; roundRect(ctx, x2, ty + 2, cw, 18, 4); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillText(pv.code, x2 + 6, ty + 15);
    }
    ctx.fillStyle = '#14161b'; ctx.font = F(600, 15); ctx.fillText(fitText(ctx, p.name, maxW), x2, ty + 40);
    ctx.fillStyle = 'rgba(20,22,27,0.64)'; ctx.font = F(400, 12.5);
    const est = copyEstado(p.categoryId, c), g = copyCond(c);
    ctx.fillText(fitText(ctx, [est!=='nada' ? estadoLabel(est) : '', g ? condText(g) : '', regionShortText(p)].filter(Boolean).join(' · '), maxW), x2, ty + 60);
    y += ROW;
  }
  ctx.fillStyle = 'rgba(20,22,27,0.64)'; ctx.font = F(500, 13); ctx.fillText(t('rep.img_cta'), PAD + 10, H - 44);
  ctx.fillStyle = 'rgba(20,22,27,0.42)'; ctx.font = F(400, 11); ctx.fillText(t('rep.img_made'), PAD + 10, H - 26);
  return new Promise(res=> cv.toBlob(b=>res(b), 'image/png'));
}
async function shareTradeImage(){
  if(!tradeItems().length){ showToast(t('rep.no_trade')); return; }
  const blob = await buildTradeImage();
  if(!blob){ showToast(t('rep.img_failed')); return; }
  const name = t('rep.img_file') + '-' + new Date().toISOString().slice(0, 10) + '.png';
  try{
    const file = new File([blob], name, { type:'image/png' });
    if(navigator.canShare && navigator.canShare({ files:[file] })){ await navigator.share({ files:[file], title:t('rep.img_title') }); return; }
  }catch(e){ if(e && e.name==='AbortError') return; }
  downloadBlob(blob, name);
  showToast(t('rep.img_saved'), { ok:true });
}
