/* ==========================================================================
   v11.27 · Dónde está y qué es
   - Cajas y almacén (idea 39): además de los muebles, cajas (del trastero,
     del armario…) con lo que guarda cada una. En la ficha, «Dónde está» dice
     el mueble y la balda o la caja. La caja entra en la búsqueda.
   - Colecciones inteligentes (idea 4): un filtro del Inventario convertido en
     colección, con su anillo de progreso aunque mezcle plataformas.
   - Gradeo profesional (idea 6): empresa, nota, nº de certificado y su foto.
   - Historia de la pieza (idea 5): una línea de tiempo en la ficha con el
     alta, la compra, el pedido, los cambios de estado, préstamos, valores,
     fotos… y tus notas con fecha.
   Datos nuevos (opcionales): arriba `cajas` y `colecciones`; en cada pieza
   `caja`, `gradeo`, `historia` y `alta` (la fecha de alta, desde esta versión).
   ========================================================================== */

/* ---------- Historia de la pieza ---------- */
const HIST_MAX = 150;
function histToday(){ return typeof todayISO==='function' ? todayISO() : new Date().toISOString().slice(0, 10); }
/* Apunta un suceso (no guarda: lo guarda quien llama, con su persistOverrides de siempre).
   Si ese mismo día ya había uno del mismo tipo, se sustituye (p. ej. varios cambios de valor). */
function histAdd(id, tipo, v){
  const p = PRODUCTS_BY_ID[id]; if(!p || !id) return;
  const ov = OVERRIDES.products[id] || (OVERRIDES.products[id] = {});
  const list = Array.isArray(ov.historia) ? ov.historia.slice() : (Array.isArray(p.historia) ? p.historia.slice() : []);
  const f = histToday(), e = { f, t: tipo };
  if(v!==undefined && v!==null && v!=='') e.v = typeof v==='number' ? v : String(v).slice(0, 200);
  const i = tipo==='nota' ? -1 : list.findIndex(x=> x && x.f===f && x.t===tipo);
  if(i >= 0) list[i] = e; else list.push(e);
  const out = list.slice(-HIST_MAX);
  ov.historia = out; p.historia = out;
}
function histPossession(id, v){ histAdd(id, 'estado', v); }
function histEvents(p){
  const ev = [];
  const add = (f, tipo, txt, extra)=>{ if(f && /^\d{4}-\d{2}-\d{2}/.test(f)) ev.push(Object.assign({ f:f.slice(0, 10), tipo, txt }, extra || {})); };
  if(p.alta) add(p.alta, 'alta', t('his.alta'));
  if(p.compra && p.compra.fecha) add(p.compra.fecha, 'compra', p.compra.tienda ? t('his.compra_en').replace('{s}', p.compra.tienda) : t('his.compra'));
  if(typeof reservaOf==='function' && reservaOf(p) && p.reserva.salida) add(p.reserva.salida, 'reserva', t('his.salida'));
  const o = typeof pedidoOf==='function' ? pedidoOf(p.id) : null;
  if(o && o.pasos) ['enviado', 'entregado'].forEach(s=>{ if(o.pasos[s]) add(o.pasos[s], 'pedido', t('ped.step.' + s) + ' · ' + pedidoNombre(o)); });
  const own = Array.isArray(p.historia) ? p.historia : [];
  let hasValor = false;
  own.forEach((x, i)=>{
    if(!x || !x.t) return;
    if(x.t==='nota') add(x.f, 'nota', x.v || '', { idx:i });
    else if(x.t==='estado') add(x.f, 'estado', t('his.estado').replace('{s}', possessionLabel(x.v)));
    else if(x.t==='valor'){ hasValor = true; add(x.f, 'valor', t('his.valor').replace('{s}', fmtMoney(+x.v))); }
    else if(x.t==='presta') add(x.f, 'presta', t('his.presta').replace('{s}', x.v || ''));
    else if(x.t==='devuelta') add(x.f, 'presta', t('his.devuelta'));
    else if(x.t==='cons') add(x.f, 'cons', t('his.cons').replace('{s}', x.v));
    else if(x.t==='foto') add(x.f, 'foto', t('his.foto'));
    else if(x.t==='caja') add(x.f, 'caja', x.v ? t('his.caja').replace('{s}', x.v) : t('his.caja_out'));
    else if(x.t==='gradeo') add(x.f, 'gradeo', t('his.gradeo').replace('{s}', x.v || ''));
  });
  if(!hasValor && p.valuation && p.valuation.fechaActualizacion && typeof p.valuation.valorActual==='number') add(p.valuation.fechaActualizacion, 'valor', t('his.valor').replace('{s}', fmtMoney(p.valuation.valorActual)));
  return ev.sort((a, b)=> b.f.localeCompare(a.f) || (a.tipo==='alta' ? 1 : b.tipo==='alta' ? -1 : 0));
}
const HIST_ICON = { alta:'plusCircle', compra:'coins', reserva:'calendar', pedido:'box', nota:'pencil', estado:'checkCircle', valor:'chart', presta:'loan', cons:'shield', foto:'camera', caja:'archive', gradeo:'crown' };
function histFmtDate(f){ try{ const [y, m, d] = f.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString(numLocale(), { day:'numeric', month:'short', year:'numeric' }); }catch(e){ return f; } }
function historiaSectionHTML(p){
  const ev = histEvents(p), id = escapeHTML(p.id);
  const body = `${ev.length ? `<ol class="his-list">${ev.map(e=>`<li class="his-item is-${e.tipo}"><span class="his-ic" aria-hidden="true">${icon(HIST_ICON[e.tipo] || 'info')}</span>
      <span class="his-main"><time datetime="${escapeHTML(e.f)}">${escapeHTML(histFmtDate(e.f))}</time><span class="his-txt">${escapeHTML(e.txt)}</span></span>
      ${e.tipo==='nota' ? `<button type="button" class="btn btn-ghost btn-icon" data-fk="his-rm-${e.idx}" onclick="histNoteRemove('${id}', ${e.idx})" aria-label="${escapeHTML(t('his.note_rm'))}" title="${escapeHTML(t('his.note_rm'))}">${icon('x')}</button>` : ''}</li>`).join('')}</ol>`
      : `<p class="section-sub">${t('his.empty')}</p>`}
    <button type="button" class="btn btn-sm" data-fk="his-add" onclick="histNoteAdd('${id}')">${icon('plus')} ${t('his.note_add')}</button>`;
  return disclosureHTML('historia', t('his.title'), body, productSectionsOpen, ev.length ? String(ev.length) : '');
}
async function histNoteAdd(id){
  const p = PRODUCTS_BY_ID[id]; if(!p) return;
  const r = await showFormModal(t('his.note_add'), [
    { name:'texto', label:t('his.note_text') },
    { name:'fecha', label:t('his.note_date'), type:'date', value: histToday(), required:false },
  ], { okLabel:t('pe.save') });
  if(!r || !String(r.texto || '').trim()) return renderKeepFocus('[data-fk="his-add"]');
  histAdd(id, 'nota', String(r.texto).trim());
  const f = /^\d{4}-\d{2}-\d{2}$/.test(r.fecha || '') ? r.fecha : histToday();
  const ov = OVERRIDES.products[id]; ov.historia[ov.historia.length - 1].f = f; p.historia = ov.historia;
  await persistOverrides();
  productSectionsOpen.historia = true;
  await renderKeepFocus('[data-fk="his-add"]');
}
async function histNoteRemove(id, idx){
  const p = PRODUCTS_BY_ID[id]; if(!p) return;
  const ov = OVERRIDES.products[id] || (OVERRIDES.products[id] = {});
  const list = (Array.isArray(ov.historia) ? ov.historia : p.historia || []).slice(), gone = list[idx]; if(!gone) return;
  list.splice(idx, 1); ov.historia = list; p.historia = list; await persistOverrides();
  await renderKeepFocus('[data-fk="his-add"]');
  showToast(t('his.note_removed'), { replace:true, action:{ label:t('common.undo'), fn: async ()=>{ const l = (OVERRIDES.products[id].historia || []).slice(); l.splice(idx, 0, gone); OVERRIDES.products[id].historia = l; PRODUCTS_BY_ID[id].historia = l; await persistOverrides(); renderKeepFocus(); } } });
}

/* ---------- Cajas y almacén ---------- */
function cajasList(){ return Array.isArray(OVERRIDES.cajas) ? OVERRIDES.cajas.filter(c=> c && typeof c.id==='string') : []; }
function cajaById(id){ return cajasList().find(c=> c.id===id) || null; }
function cajaOf(p){ return p && p.caja ? cajaById(p.caja) : null; }
function cajaNombre(c){ return String(c && c.nombre || '').trim() || t('box.untitled'); }
function cajaPiezas(id){ return sortGames(PRODUCTS.filter(p=> p.caja===id)); }
function cajaLugares(){ const s = new Map(); cajasList().forEach(c=>{ const l = String(c.lugar || '').trim(); if(l && !s.has(normText(l))) s.set(normText(l), l); }); return [...s.values()].sort(compareNames); }
function cajaSearchText(p){ const c = cajaOf(p); return c ? cajaNombre(c) + ' ' + (c.lugar || '') : ''; }
function cajaRowHTML(p){
  const c = cajaOf(p), id = escapeHTML(p.id);
  if(c) return `<div class="est-where box-where"><span class="est-where-ic" aria-hidden="true">${icon('archive')}</span><span class="est-where-txt">${escapeHTML(t('box.in').replace('{s}', cajaNombre(c)) + (c.lugar ? ' · ' + c.lugar : ''))}</span>
    <button type="button" class="btn btn-sm" data-fk="box-open" onclick="openCaja('${escapeHTML(c.id)}')">${t('box.see')}</button></div>`;
  return `<div class="est-where box-where is-out"><span class="est-where-ic" aria-hidden="true">${icon('archive')}</span><span class="est-where-txt">${t('box.not_in')}</span>
    <button type="button" class="btn btn-sm" data-fk="box-put" onclick="cajaElegir(['${id}'])">${t('box.put')}</button></div>`;
}
async function cajaPoner(ids, cid){
  const c = cid ? cajaById(cid) : null;
  const snap = bulkSnap(ids, false);
  ids.forEach(id=>{ const p = PRODUCTS_BY_ID[id]; if(!p) return; const o = bulkOv(id); o.caja = cid || null; p.caja = cid || null; histAdd(id, 'caja', c ? cajaNombre(c) : ''); });
  await persistOverrides(); buildProducts();
  return snap;
}
let cajaPickIds = [];
function cajaElegir(ids){
  cajaPickIds = ids.slice();
  const list = cajasList();
  openSheet({ kind:'caja-pick', title:t('box.put'), body:`${list.length ? `<ul class="dup-list">${list.map(c=>`<li><button type="button" class="dup-open" onclick="cajaElegida('${escapeHTML(c.id)}')"><b>${escapeHTML(cajaNombre(c))}</b><small>${escapeHTML([c.lugar, fmtCount(cajaPiezas(c.id).length, 'ped.pieces1', 'ped.pieces')].filter(Boolean).join(' · '))}</small></button></li>`).join('')}</ul>` : `<p class="section-sub">${t('box.none')}</p>`}
    <button type="button" class="btn btn-sm" data-fk="box-new" onclick="cajaNuevaYPoner()">${icon('plus')} ${t('box.new')}</button>` });
}
async function cajaElegida(cid){
  const ids = cajaPickIds.slice(); closeSheet();
  const snap = await cajaPoner(ids, cid);
  if(isSheetKind('inv-bulk')) closeSheet();
  await renderKeepFocus('[data-fk="box-open"], [data-fk="bulk-go"]');
  const c = cajaById(cid);
  showToast((ids.length===1 ? t('box.put_done1') : t('box.put_done').replace('{n}', ids.length)).replace('{s}', cajaNombre(c)), { ok:true, replace:true, action:{ label:t('common.undo'), fn: ()=> bulkRestore(snap) } });
}
async function cajaNuevaYPoner(){
  const ids = cajaPickIds.slice(); closeSheet();
  const c = await cajaCrear(); if(!c) return renderKeepFocus();
  cajaPickIds = ids; await cajaElegida(c.id);
}
async function cajaCrear(){
  const r = await showFormModal(t('box.new'), [
    { name:'nombre', label:t('box.name') },
    { name:'lugar', label:t('box.place'), required:false },
  ], { okLabel:t('common.create') });
  if(!r || !String(r.nombre || '').trim()) return null;
  const c = { id:'caja-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), nombre:String(r.nombre).trim().slice(0, 60), lugar:String(r.lugar || '').trim().slice(0, 60) };
  OVERRIDES.cajas = cajasList().concat([c]); await persistOverrides();
  return c;
}
function openCajas(){
  openSheet({ kind:'cajas', title:t('box.list_title'), body:cajasBodyHTML(), foot:`<button type="button" class="btn primary" onclick="closeSheet()">${t('copy.done')}</button>`, onClose: ()=> renderKeepFocus() });
}
function cajasBodyHTML(){
  const list = cajasList(), byPlace = new Map();
  list.forEach(c=>{ const k = String(c.lugar || '').trim() || t('box.no_place'); if(!byPlace.has(k)) byPlace.set(k, []); byPlace.get(k).push(c); });
  return `<p class="section-sub">${t('box.sub')}</p>
    ${list.length ? [...byPlace.entries()].map(([pl, cs])=>`<h3 class="ped-h">${escapeHTML(pl)}</h3><ul class="dup-list">${cs.map(c=>`<li><button type="button" class="dup-open" data-fk="box-${escapeHTML(c.id)}" onclick="closeSheet(); openCaja('${escapeHTML(c.id)}')"><b>${escapeHTML(cajaNombre(c))}</b><small>${escapeHTML(fmtCount(cajaPiezas(c.id).length, 'ped.pieces1', 'ped.pieces'))}</small></button></li>`).join('')}</ul>`).join('')
      : `<p class="section-sub">${t('box.none')}</p>`}
    <button type="button" class="btn btn-sm" data-fk="box-create" onclick="cajaCrearDesdeLista()">${icon('plus')} ${t('box.new')}</button>`;
}
async function cajaCrearDesdeLista(){ closeSheet(); const c = await cajaCrear(); if(c) openCaja(c.id); else openCajas(); }
let cajaOpenId = '';
function openCaja(id){
  cajaOpenId = id; if(!cajaById(id)) return;
  openSheet({ kind:'caja', title:t('box.title'), body:cajaBodyHTML(), foot:`<button type="button" class="btn primary" onclick="closeSheet()">${t('copy.done')}</button>`, focus:'[data-fk="box-add"]', onClose: ()=> renderKeepFocus() });
}
function cajaRefresh(focusSel){
  if(!isSheetKind('caja')) return;
  const body = document.getElementById('sheetBody'), y = body ? body.scrollTop : 0;
  updateSheetBody(cajaBodyHTML()); if(body) body.scrollTop = y;
  const b = focusSel ? document.querySelector('#sheetBody ' + focusSel) : null; (b || document.querySelector('#sheetBody [data-fk="box-add"]')).focus({ preventScroll:true });
}
function cajaBodyHTML(){
  const c = cajaById(cajaOpenId); if(!c) return '';
  const ps = cajaPiezas(c.id), cid = escapeHTML(c.id);
  return `<div class="field-grid"><div class="field"><label for="boxName">${t('box.name')}</label><input id="boxName" type="text" maxlength="60" value="${escapeHTML(c.nombre || '')}" onchange="cajaSet('nombre', this.value)"></div>
      <div class="field"><label for="boxPlace">${t('box.place')}</label><input id="boxPlace" type="text" maxlength="60" list="boxPlaces" value="${escapeHTML(c.lugar || '')}" placeholder="${escapeHTML(t('box.place_ph'))}" onchange="cajaSet('lugar', this.value)"></div></div>
    <datalist id="boxPlaces">${cajaLugares().map(l=>`<option value="${escapeHTML(l)}"></option>`).join('')}</datalist>
    <div class="field"><label for="boxNotes">${t('box.notes')}</label><input id="boxNotes" type="text" maxlength="140" value="${escapeHTML(c.notas || '')}" onchange="cajaSet('notas', this.value)"></div>
    <h3 class="ped-h">${escapeHTML(fmtCount(ps.length, 'ped.pieces1', 'ped.pieces'))}</h3>
    ${ps.length ? `<ul class="ped-items">${ps.map((p, i)=>`<li class="ped-item box-item"><button type="button" class="ped-name" onclick="dupOpen('${escapeHTML(p.id)}')"><b>${escapeHTML(p.name)}</b><small>${escapeHTML([p.platformName, p.year].filter(Boolean).join(' · '))}</small></button>
      <button type="button" class="btn btn-ghost btn-icon" data-fk="box-rm-${i}" onclick="cajaSacar('${escapeHTML(p.id)}', ${i})" aria-label="${escapeHTML(t('box.remove').replace('{s}', p.name))}" title="${escapeHTML(t('box.remove').replace('{s}', p.name))}">${icon('x')}</button></li>`).join('')}</ul>` : `<p class="section-sub">${t('box.empty')}</p>`}
    <button type="button" class="btn btn-sm" data-fk="box-add" onclick="cajaAddPieces('${cid}')">${icon('plus')} ${t('ped.add_pieces')}</button>
    <div class="ped-danger"><button type="button" class="btn btn-sm btn-danger" data-fk="box-del" onclick="cajaBorrar('${cid}')">${icon('trash')} ${t('box.delete')}</button></div>`;
}
async function cajaSet(k, v){
  const c = cajaById(cajaOpenId); if(!c) return;
  c[k] = String(v || '').trim().slice(0, k==='notas' ? 140 : 60);
  await persistOverrides();
}
async function cajaSacar(pid, i){
  const snap = await cajaPoner([pid], null);
  cajaRefresh(`[data-fk="box-rm-${i}"], [data-fk="box-rm-${Math.max(0, i - 1)}"]`);
  showToast(t('box.removed'), { replace:true, action:{ label:t('common.undo'), fn: async ()=>{ await bulkRestore(snap); cajaRefresh(); } } });
}
async function cajaBorrar(cid){
  const c = cajaById(cid); if(!c) return;
  const ps = cajaPiezas(cid);
  if(!await showConfirmModal((ps.length ? t('box.delete_q_n').replace('{n}', ps.length) : t('box.delete_q')), { okLabel:t('box.delete'), danger:true })) return cajaRefresh('[data-fk="box-del"]');
  const prev = JSON.stringify(OVERRIDES.cajas), snap = bulkSnap(ps.map(p=> p.id), false);
  ps.forEach(p=>{ bulkOv(p.id).caja = null; histAdd(p.id, 'caja', ''); });
  OVERRIDES.cajas = cajasList().filter(x=> x.id!==cid); if(!OVERRIDES.cajas.length) delete OVERRIDES.cajas;
  await persistOverrides(); buildProducts(); closeSheet();
  showToast(t('box.deleted'), { replace:true, action:{ label:t('common.undo'), fn: async ()=>{ OVERRIDES.cajas = JSON.parse(prev); await bulkRestore(snap); } } });
}
let cajaAddQ = '';
function cajaAddPieces(cid){
  cajaOpenId = cid; cajaAddQ = '';
  openSheet({ kind:'caja-add', title:t('ped.add_pieces'), body:`${searchbarHTML({ id:'boxAddQ', placeholder:t('vb.search_ph'), value:'', oninput:'cajaAddQ=this.value; clearTimeout(window._caT); window._caT=setTimeout(cajaAddRefresh,140)' })}<div id="boxAddRes">${cajaAddResHTML()}</div>`,
    foot:`<button type="button" class="btn primary" onclick="closeSheet()">${t('copy.done')}</button>`, focus:'#boxAddQ', onClose: ()=> openCaja(cid) });
}
function cajaAddResHTML(){
  const tk = searchTokens(cajaAddQ);
  const list = PRODUCTS.filter(p=> p.caja!==cajaOpenId && p.possession==='tengo' && productMatchesSearch(p, tk)).sort((a, b)=> (a.caja ? 1 : 0) - (b.caja ? 1 : 0) || compareNames(a.name, b.name)).slice(0, 30);
  return list.length ? `<ul class="dup-list">${list.map(p=>{ const o = cajaOf(p); return `<li><button type="button" class="dup-open" onclick="cajaAddOne('${escapeHTML(p.id)}', this)"><b>${escapeHTML(p.name)}</b><small>${escapeHTML([p.platformName, o ? t('box.in').replace('{s}', cajaNombre(o)) : ''].filter(Boolean).join(' · '))}</small></button></li>`; }).join('')}</ul>` : `<p class="section-sub">${t('vb.no_match')}</p>`;
}
function cajaAddRefresh(){ const r = document.getElementById('boxAddRes'); if(r) r.innerHTML = cajaAddResHTML(); }
async function cajaAddOne(pid){
  await cajaPoner([pid], cajaOpenId);
  cajaAddRefresh();
  const q = document.getElementById('boxAddQ'), first = document.querySelector('#boxAddRes button');
  (first || q).focus({ preventScroll:true });
  showToast(t('box.added').replace('{s}', PRODUCTS_BY_ID[pid].name), { ok:true, replace:true });
}
function cajasCardHTML(){
  const list = cajasList(), n = PRODUCTS.filter(p=> cajaOf(p)).length;
  return `<button type="button" class="create-btn box-card" data-fk="box-card" onclick="openCajas()"><span class="create-btn-icon">${icon('archive')}</span>
    <span><span class="create-btn-label">${t('box.list_title')}</span><span class="create-btn-sub">${escapeHTML(list.length ? t('box.card_sub').replace('{c}', list.length).replace('{n}', n) : t('box.card_empty'))}</span></span></button>`;
}

/* ---------- Colecciones inteligentes ---------- */
function coleccionesList(){ return Array.isArray(OVERRIDES.colecciones) ? OVERRIDES.colecciones.filter(c=> c && typeof c.id==='string' && c.s && typeof c.s==='object') : []; }
/* El progreso cuenta todas las piezas del filtro (tenga o no tenga): si el filtro era «Tengo» o «Me falta», se quita */
function coleccionState(c){ const s = sfNorm(c.s); if(s.filter==='tengo' || s.filter==='falta') s.filter = 'todos'; return Object.assign({}, invState, s, { flags:s.flags.slice() }); }
function coleccionStats(c){
  const list = inventoryFilteredEditions(coleccionState(c)).map(x=> x.product);
  const have = list.filter(p=> p.possession==='tengo').length, total = list.length;
  return { have, total, pct: total ? Math.round(have / total * 100) : 0 };
}
function colNormState(s){ const n = sfNorm(s); return Object.assign({}, n, { filter: n.filter==='tengo' || n.filter==='falta' ? 'todos' : n.filter, sort:'anio' }); }
function colCanCreate(){ const ss = colNormState(sfState()); return !sfSame(ss, SF_DEFAULT) && !coleccionesList().some(c=> sfSame(colNormState(c.s), ss)); }
async function colCreate(){
  const s = sfState();
  const name = await showPromptModal(t('col.name_q'), sfAutoName(Object.assign({}, s, { filter: s.filter==='tengo' || s.filter==='falta' ? 'todos' : s.filter })));
  if(!name || !String(name).trim()) return renderKeepFocus('[data-fk="col-make"]');
  const c = { id:'col' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), nombre:String(name).trim().slice(0, 40), s };
  OVERRIDES.colecciones = coleccionesList().concat([c]); await persistOverrides();
  const st = coleccionStats(c);
  showToast(t('col.created').replace('{s}', c.nombre).replace('{h}', st.have).replace('{t}', st.total), { ok:true, replace:true, action:{ label:t('col.see'), fn: ()=> goPage('coleccion') } });
  renderKeepFocus('[data-fk="col-make"]');
}
function colOpen(id){
  const c = coleccionesList().find(x=> x.id===id); if(!c) return;
  invState = Object.assign({}, coleccionState(c), { limit:60, search: sfNorm(c.s).search });
  goPage('inventario');
}
function coleccionesSectionHTML(){
  const list = coleccionesList(); if(!list.length) return '';
  return `<section class="vit-section col-section">${sectionTitleHTML(t('col.title'), `<button type="button" class="link-btn" data-fk="col-edit" onclick="openColecciones()">${t('sf.edit')}</button>`)}
    <div class="col-grid">${list.map(c=>{ const s = coleccionStats(c);
      return `<button type="button" class="col-card" data-fk="col-${escapeHTML(c.id)}" onclick="colOpen('${escapeHTML(c.id)}')" aria-label="${escapeHTML(c.nombre + ' — ' + t('dash.ring_label').replace('{pct}', s.pct).replace('{have}', s.have).replace('{total}', s.total))}">
        <span class="ring ring-sm" data-pct="${s.pct}" style="--p:${s.pct}%" aria-hidden="true"><span class="ring-hole">${s.pct}<small>%</small></span></span>
        <span class="col-txt"><b>${escapeHTML(c.nombre)}</b><small>${escapeHTML(t('dash.have_of_total').replace('{have}', s.have).replace('{total}', s.total))}</small></span></button>`; }).join('')}</div></section>`;
}
function openColecciones(){
  openSheet({ kind:'colecciones', title:t('col.title'), body:coleccionesBodyHTML(), foot:`<button type="button" class="btn primary" onclick="closeSheet()">${t('copy.done')}</button>`, onClose: ()=> renderKeepFocus('[data-fk="col-edit"]') });
}
function coleccionesBodyHTML(){
  const list = coleccionesList();
  return `<p class="section-sub">${t('col.sub')}</p>${list.length ? `<ul class="st-list">${list.map((c, i)=>`<li class="st-row"><span class="st-name"><b>${escapeHTML(c.nombre)}</b><small>${escapeHTML(sfAutoName(c.s))}</small></span>
      ${typeof printColeccionChecklist==='function' ? `<button type="button" class="btn btn-ghost btn-icon" data-fk="col-chk-${i}" onclick="printColeccionChecklist('${escapeHTML(c.id)}')" aria-label="${escapeHTML(t('chk.print_col').replace('{s}', c.nombre))}" title="${escapeHTML(t('chk.print_col').replace('{s}', c.nombre))}">${icon('printer')}</button>` : ''}
      <button type="button" class="btn btn-ghost btn-icon" data-fk="col-ren-${i}" onclick="colRename('${escapeHTML(c.id)}', ${i})" aria-label="${escapeHTML(t('stores.rename').replace('{s}', c.nombre))}" title="${escapeHTML(t('stores.rename').replace('{s}', c.nombre))}">${icon('pencil')}</button>
      <button type="button" class="btn btn-ghost btn-icon" data-fk="col-rm-${i}" onclick="colRemove('${escapeHTML(c.id)}', ${i})" aria-label="${escapeHTML(t('stores.remove').replace('{s}', c.nombre))}" title="${escapeHTML(t('stores.remove').replace('{s}', c.nombre))}">${icon('trash')}</button></li>`).join('')}</ul>` : `<p class="section-sub">${t('col.none')}</p>`}`;
}
function colRefresh(sel){ if(!isSheetKind('colecciones')) return; updateSheetBody(coleccionesBodyHTML()); const b = sel && document.querySelector('#sheetBody ' + sel); (b || document.querySelector('.sheet-foot .btn')).focus({ preventScroll:true }); }
async function colRename(id, i){
  const c = coleccionesList().find(x=> x.id===id); if(!c) return;
  const v = await askText(t('stores.rename_q').replace('{s}', c.nombre), c.nombre);
  if(v!==null && String(v).trim()){ c.nombre = String(v).trim().slice(0, 40); await persistOverrides(); }
  colRefresh(`[data-fk="col-ren-${i}"]`);
}
async function colRemove(id, i){
  const list = coleccionesList(), k = list.findIndex(x=> x.id===id); if(k < 0) return;
  const gone = list[k];
  OVERRIDES.colecciones = list.filter(x=> x.id!==id); if(!OVERRIDES.colecciones.length) delete OVERRIDES.colecciones;
  await persistOverrides();
  colRefresh(`[data-fk="col-rm-${Math.max(0, i - 1)}"]`);
  showToast(t('col.removed'), { replace:true, action:{ label:t('common.undo'), fn: async ()=>{ const cur = coleccionesList().slice(); cur.splice(k, 0, gone); OVERRIDES.colecciones = cur; await persistOverrides(); colRefresh(); renderKeepFocus(); } } });
}

/* ---------- Gradeo profesional ---------- */
const GRADERS = ['WATA', 'VGA', 'CGC', 'UKG', 'PSA', 'BGS', 'CGA'];
function gradeoOf(p){ return p && p.gradeo && typeof p.gradeo==='object' && (p.gradeo.empresa || p.gradeo.nota) ? p.gradeo : null; }
function gradeoText(g){ return [g.empresa, g.nota].filter(Boolean).join(' '); }
function gradeoBadgeHTML(p){ const g = gradeoOf(p); return g ? `<span class="badge badge-grade" title="${escapeHTML(t('gr.title') + ': ' + gradeoText(g) + (g.cert ? ' · ' + g.cert : ''))}">${icon('crown')} ${escapeHTML(gradeoText(g))}</span>` : ''; }
function gradeoSectionHTML(p){
  const g = (p.gradeo && typeof p.gradeo==='object') ? p.gradeo : {}, id = escapeHTML(p.id);
  const slot = g.foto && hasPhoto(id, g.foto) ? g.foto : null;
  const free = typeof freeExtraSlot==='function' ? freeExtraSlot(p.id) : null;
  const body = `<div class="field-grid">
      <div class="field"><label for="gr_emp_${id}">${t('gr.company')}</label><input id="gr_emp_${id}" type="text" list="grCompanies" maxlength="30" value="${escapeHTML(g.empresa || '')}" onchange="gradeoSet('${id}','empresa',this.value)"></div>
      <div class="field"><label for="gr_nota_${id}">${t('gr.grade')}</label><input id="gr_nota_${id}" type="text" maxlength="20" value="${escapeHTML(g.nota || '')}" placeholder="${escapeHTML(t('gr.grade_ph'))}" onchange="gradeoSet('${id}','nota',this.value)"></div>
      <div class="field"><label for="gr_cert_${id}">${t('gr.cert')}</label><input id="gr_cert_${id}" type="text" maxlength="40" value="${escapeHTML(g.cert || '')}" onchange="gradeoSet('${id}','cert',this.value)"></div>
    </div><datalist id="grCompanies">${GRADERS.map(x=>`<option value="${x}"></option>`).join('')}</datalist>
    ${slot ? `<p class="section-sub">${icon('camera')} ${escapeHTML(t('gr.photo_saved').replace('{s}', photoSideLabel(slot)))}</p>`
      : free ? `<label class="btn btn-sm photo-picker" data-fk="gr-photo">${icon('camera')} ${t('gr.photo')}<input type="file" accept="image/*" class="sr-only" aria-label="${escapeHTML(t('gr.photo'))}" onchange="gradeoFoto(this,'${id}')"></label>`
      : `<p class="section-sub">${escapeHTML(t('gr.photo_full'))}</p>`}`;
  const gg = gradeoOf(p);
  return disclosureHTML('gradeo', t('gr.title'), body, productSectionsOpen, gg ? escapeHTML(gradeoText(gg)) : '');
}
async function gradeoSet(id, k, v){
  const p = PRODUCTS_BY_ID[id]; if(!p) return;
  const g = Object.assign({}, p.gradeo && typeof p.gradeo==='object' ? p.gradeo : {});
  const s = String(v || '').trim(); if(s) g[k] = s; else delete g[k];
  const out = Object.keys(g).length ? g : null;
  p.gradeo = out; if(!OVERRIDES.products[id]) OVERRIDES.products[id] = {}; OVERRIDES.products[id].gradeo = out;
  if(out && (k==='empresa' || k==='nota') && gradeoOf(p)) histAdd(id, 'gradeo', gradeoText(out));
  await persistOverrides();
  if(typeof refreshProductMeta==='function') refreshProductMeta(id);
}
async function gradeoFoto(input, id){
  const file = input.files[0]; input.value = ''; if(!file) return;
  const slot = freeExtraSlot(id); if(!slot) return;
  const ok = await savePhotoFile('photo_' + id + '_' + slot, file);
  if(!ok) return;
  await setPhotoMeta(id, slot, 'fotoNotas', t('gr.cert_caption'));
  const p = PRODUCTS_BY_ID[id]; const g = Object.assign({}, p.gradeo || {}, { foto:slot });
  p.gradeo = g; OVERRIDES.products[id].gradeo = g; histAdd(id, 'foto');
  await persistOverrides();
  showToast(t('photo.saved'), { ok:true, replace:true });
  renderKeepFocus('[data-fk="gr-photo"]');
}
