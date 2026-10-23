/* ==========================================================================
   v11.25 · Tus datos a mano
   - Editar en serie cualquier campo (idea 2): como «Valorar en serie», pero
     eliges el dato (año, fecha, región, idioma, códigos, estado, nombre o un
     campo propio). Se puede limitar a las piezas elegidas o a lo que ves en el
     Inventario. Al cerrar, «Deshacer» devuelve todo lo cambiado en la sesión.
   - Revisión de la colección (idea 52): en «Investigar», lo que conviene
     mirar (sin año, sin región, fechas mal escritas o que no cuadran con el
     año, códigos de barras repetidos, nombres casi iguales, nombres con
     espacios o saltos de línea de más y fotos de piezas que ya no existen),
     con el arreglo a mano desde ahí.
   - Aviso de duplicados (idea 10): al crear una pieza o poner un código de
     barras, avisa si ya hay una con el mismo código o un nombre casi igual.
   Datos: solo una clave nueva de primer nivel, `revisionIgnorar` (lo que has
   marcado como «Está bien»), que va también en la copia de seguridad.
   ========================================================================== */

/* ---------- Ayudantes comunes ---------- */
function revNameKey(s){ return normText(String(s || '')).replace(/[^a-z0-9぀-ヿ㐀-鿿가-힯]+/g, ''); }
function revBarcodeKey(s){ return String(s || '').replace(/\D/g, ''); }
/* Distancia de edición (para «casi igual»); corta en cuanto pasa de max */
function revLev(a, b, max){
  if(Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length:b.length + 1 }, (_, j)=> j);
  for(let i = 1; i <= a.length; i++){
    const cur = [i]; let best = i;
    for(let j = 1; j <= b.length; j++){
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1]===b[j - 1] ? 0 : 1));
      if(cur[j] < best) best = cur[j];
    }
    if(best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}
/* Nombre parecido = misma clave, mismas palabras en otro orden, o una errata pequeña.
   No cuenta si lo que cambia es un número o una palabra de 1–2 letras: «Vol. 1 / Vol. 2»,
   «Negro / Negro 2» o «X / Y» son piezas distintas de una serie. */
function revNameInfo(name){
  const toks = normText(String(name || '')).split(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]+/).filter(Boolean);
  return { k: toks.join(''), toks };
}
function revNamesClose(a, b){
  if(!a.k || !b.k) return false;
  if(a.k===b.k) return true;
  if(a.toks.length===b.toks.length && a.toks.slice().sort().join(' ')===b.toks.slice().sort().join(' ')) return true;
  const cnt = (list)=>{ const m = new Map(); list.forEach(x=> m.set(x, (m.get(x) || 0) + 1)); return m; };
  const ma = cnt(a.toks), mb = cnt(b.toks), diff = [];
  ma.forEach((n, x)=>{ if((mb.get(x) || 0) < n) diff.push(x); }); mb.forEach((n, x)=>{ if((ma.get(x) || 0) < n) diff.push(x); });
  if(diff.some(x=> /\d/.test(x) || x.length <= 2)) return false;
  const n = Math.min(a.k.length, b.k.length);
  return n >= 10 && revLev(a.k, b.k, 2) <= (n >= 14 ? 2 : 1);
}
/* El nombre sin espacios dobles, saltos de línea ni espacios antes de «: , . ; )» */
function revCleanName(s){
  return String(s || '').replace(/[ \t\r\n]+/g, ' ').replace(/ {2,}/g, ' ').replace(/\s+([:;,.)])/g, '$1').replace(/\(\s+/g, '(').trim();
}
function revPieceMeta(p){ return [p.platformName, p.year].filter(Boolean).join(' · '); }
function revIgnored(key){ return !!(OVERRIDES.revisionIgnorar && OVERRIDES.revisionIgnorar[key]); }
async function revIgnore(key){
  if(!OVERRIDES.revisionIgnorar || typeof OVERRIDES.revisionIgnorar!=='object') OVERRIDES.revisionIgnorar = {};
  OVERRIDES.revisionIgnorar[key] = new Date().toISOString().slice(0, 10);
  await persistOverrides();
}
async function revUnignore(key){
  if(!OVERRIDES.revisionIgnorar) return;
  delete OVERRIDES.revisionIgnorar[key];
  if(!Object.keys(OVERRIDES.revisionIgnorar).length) delete OVERRIDES.revisionIgnorar;
  await persistOverrides();
}
function revYearOk(v){ const s = String(v===null || v===undefined ? '' : v).trim(); return /^\d{4}$/.test(s) && +s >= 1950 && +s <= 2100; }
function revDateOk(v){ return typeof rdNorm==='function' ? rdNorm(v)!==null : /^\d{4}(-\d{2}(-\d{2})?)?$/.test(String(v || '').trim()); }
/* «5/10/1999», «05-10-1999», «10/1999» → «1999-10-05», «1999-10»; si no se entiende, null */
function revParseDate(raw){
  const s = String(raw || '').trim(); if(!s) return '';
  if(revDateOk(s)) return s;
  let m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/);
  if(m){ const v = m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0'); return revDateOk(v) ? v : null; }
  m = s.match(/^(\d{1,2})[\/.\-](\d{4})$/);
  if(m){ const v = m[2] + '-' + m[1].padStart(2, '0'); return revDateOk(v) ? v : null; }
  m = s.match(/^(\d{4})[\/.](\d{1,2})(?:[\/.](\d{1,2}))?$/);
  if(m){ const v = m[1] + '-' + m[2].padStart(2, '0') + (m[3] ? '-' + m[3].padStart(2, '0') : ''); return revDateOk(v) ? v : null; }
  return null;
}

/* ---------- Aviso de duplicados (idea 10) ---------- */
/* Piezas que ya hay con el mismo código de barras (en cualquier plataforma) o con
   un nombre igual o casi igual (casi igual, solo en la misma plataforma). */
function dupCandidates(name, platId, barcode, exceptId){
  const out = [], info = revNameInfo(name), k = info.k, bc = revBarcodeKey(barcode);
  PRODUCTS.forEach(p=>{
    if(p.id===exceptId) return;
    let why = '';
    if(bc.length >= 8 && revBarcodeKey(p.barcode)===bc) why = 'barcode';
    else if(k && k.length >= 3){
      const pi = revNameInfo(p.name);
      if(pi.k===k) why = p.platformId===platId ? 'same' : 'other';
      else if(p.platformId===platId && revNamesClose(pi, info)) why = 'close';
    }
    if(why) out.push({ p, why });
  });
  const rank = { barcode:0, same:1, close:2, other:3 };
  return out.sort((a, b)=> rank[a.why] - rank[b.why] || compareNames(a.p.name, b.p.name)).slice(0, 4);
}
function dupWhyText(why){ return t(why==='barcode' ? 'dup.why_code' : why==='other' ? 'dup.why_other' : why==='close' ? 'dup.why_close' : 'dup.why_same'); }
function dupListHTML(list){
  return `<ul class="dup-list">${list.map(({ p, why })=>`<li><button type="button" class="dup-open" onclick="dupOpen('${escapeHTML(p.id)}')"><b>${escapeHTML(p.name)}</b><small>${escapeHTML([revPieceMeta(p), dupWhyText(why)].filter(Boolean).join(' · '))}</small></button></li>`).join('')}</ul>`;
}
function dupOpen(id){ closeSheet(); if(typeof closeModal==='function') try{ closeModal(); }catch(e){} goProduct(id); }
/* En «Añadir pieza», el aviso aparece mientras escribes el nombre */
let _dupQaT = null, _dupQaShown = '';
function dupQuickAddCheck(){
  clearTimeout(_dupQaT);
  _dupQaT = setTimeout(()=>{
    const box = document.getElementById('qaDup'), nameEl = document.getElementById('qaName'), platEl = document.getElementById('qaPlat');
    if(!box || !nameEl) return;
    const list = dupCandidates(nameEl.value, platEl ? platEl.value : '', typeof quickAddBarcode==='string' ? quickAddBarcode : '');
    _dupQaShown = list.length ? revNameKey(nameEl.value) + '|' + (platEl ? platEl.value : '') : '';
    box.hidden = !list.length;
    box.innerHTML = list.length ? `<p class="dup-title">${icon('info')} ${escapeHTML(t('dup.title'))}</p>${dupListHTML(list)}<p class="dup-note">${escapeHTML(t('dup.note'))}</p>` : '';
  }, 160);
}
/* Al crear: si hay parecidas y no se han visto ya en «Añadir pieza», se pregunta */
async function dupConfirmCreate(name, platId, barcode){
  const list = dupCandidates(name, platId, barcode).filter(x=> x.why!=='other');
  if(!list.length) return true;
  if(_dupQaShown && _dupQaShown===revNameKey(name) + '|' + platId){ _dupQaShown = ''; return true; }
  const msg = t('dup.confirm').replace('{s}', list.map(x=> '«' + x.p.name + '»' + (x.p.platformName ? ' (' + x.p.platformName + ')' : '')).join(', '));
  const ok = await showConfirmModal(msg, { okLabel:t('dup.create_anyway') });
  if(!ok){ const first = list[0].p; showToast(t('dup.not_created'), { replace:true, action:{ label:t('dup.see'), fn: ()=> goProduct(first.id) } }); }
  return ok;
}
/* Código de barras escrito a mano (ficha y «Editar en serie»): se guarda y, si otra pieza
   ya lo tiene, se avisa con un enlace a ella */
async function updateBarcodeField(id, value){
  const v = String(value || '').trim();
  await updateEditionField(id, 'barcode', v);
  dupBarcodeWarn(id, v);
}
function dupBarcodeWarn(id, v){
  const bc = revBarcodeKey(v); if(bc.length < 8) return;
  const other = PRODUCTS.find(p=> p.id!==id && revBarcodeKey(p.barcode)===bc);
  if(other) showToast(t('dup.code_taken').replace('{s}', other.name), { replace:true, duration:7000, action:{ label:t('dup.see'), fn: ()=>{ closeSheet(); goProduct(other.id); } } });
}

/* ---------- Editar en serie (idea 2) ---------- */
const ED_BASE_FIELDS = ['year', 'releaseDateExact', 'region', 'nameJp', 'language', 'catalogNumber', 'productCode', 'barcode', 'general', 'name'];
const ED_LABEL = { year:'p.year', releaseDateExact:'p.exact_date', region:'p.region', nameJp:'p.name_jp', language:'p.language', catalogNumber:'p.catalog_num', productCode:'p.product_code', barcode:'p.barcode', general:'p.condition_general', name:'ed.f_name' };
let edState = { field:'year', show:'empty', plat:'', poss:'', q:'', limit:40, ids:null, from:'' };
let edUndo = null;   // Map id → copia de OVERRIDES.products[id] antes del primer cambio de la sesión
function edCustomLabels(){
  const seen = new Map();
  PRODUCTS.forEach(p=> (p.customFields || []).forEach(cf=>{ const l = String(cf && cf.label || '').trim(); if(l && !seen.has(normText(l))) seen.set(normText(l), l); }));
  return [...seen.values()].sort(compareNames);
}
function edIsCustom(f){ return typeof f==='string' && f.startsWith('cf:'); }
function edFieldLabel(f){ return edIsCustom(f) ? f.slice(3) : t(ED_LABEL[f] || f); }
function edCustomIdx(p, label){ return (p.customFields || []).findIndex(cf=> cf && normText(String(cf.label || '').trim())===normText(label)); }
function edGet(p, f){
  if(f==='region') return (p.regionTags || []).filter(Boolean).length ? p.regionTags.join(',') : (regionKeysFor(p).length ? '·' : '');
  if(f==='general') return p.conservation && p.conservation.general ? String(p.conservation.general) : '';
  if(edIsCustom(f)){ const i = edCustomIdx(p, f.slice(3)); return i >= 0 ? String(p.customFields[i].value || '').trim() : ''; }
  const v = p[f]; return v===null || v===undefined ? '' : String(v).trim();
}
function edHasBadMode(f){ return f==='year' || f==='releaseDateExact' || f==='name'; }
function edIsBad(p, f){
  const v = edGet(p, f); if(!v) return false;
  if(f==='year') return !revYearOk(v);
  if(f==='releaseDateExact') return !revDateOk(v);
  if(f==='name') return revCleanName(p.name)!==p.name;
  return false;
}
function openEdBulk(opts){
  opts = opts || {};
  const keepField = edState.field;
  edState = { field: opts.field || uiPref('edField', keepField || 'year'), show: opts.show || 'empty', plat:'', poss:'', q:'', limit:40, ids: Array.isArray(opts.ids) && opts.ids.length ? opts.ids.slice() : null, from: opts.from || '' };
  if(!edFieldExists(edState.field)) edState.field = 'year';
  if(edState.show==='bad' && !edHasBadMode(edState.field)) edState.show = 'empty';
  edUndo = new Map();
  openSheet({ kind:'ed-bulk', title:t('ed.title'), body:edBodyHTML(), foot:`<button type="button" class="btn primary" onclick="closeSheet()">${t('copy.done')}</button>`,
    focus:'#edField', onClose: edClosed });
}
function edFieldExists(f){ return ED_BASE_FIELDS.includes(f) || (edIsCustom(f) && edCustomLabels().some(l=> normText(l)===normText(f.slice(3)))); }
function edList(){
  const tk = searchTokens(edState.q || ''), f = edState.field;
  const only = edState.ids ? new Set(edState.ids) : null;
  return sortGames(PRODUCTS.filter(p=> (!only || only.has(p.id)) && (!edState.plat || p.platformId===edState.plat)
    && (!edState.poss || (edState.poss==='tengo' ? p.possession==='tengo' : p.possession!=='tengo'))
    && (edState.show!=='empty' || !edGet(p, f)) && (edState.show!=='bad' || edIsBad(p, f)) && productMatchesSearch(p, tk)));
}
function edBodyHTML(){
  const list = edList(), f = edState.field;
  const base = edState.ids ? PRODUCTS.filter(p=> edState.ids.includes(p.id)) : PRODUCTS;
  const plats = getAllPlatforms().filter(pl=> base.some(p=> p.platformId===pl.id));
  const cust = edCustomLabels();
  const chip = (k, label)=> `<button type="button" class="chip ${edState.show===k ? 'active' : ''}" aria-pressed="${edState.show===k}" data-fk="ed-${k}" onclick="edState.show='${k}'; edState.limit=40; edRefresh()">${label}</button>`;
  return `${edState.ids ? `<p class="ed-scope">${icon('multi')} <span>${escapeHTML((edState.ids.length===1 ? t('ed.scope1') : t('ed.scope')).replace('{n}', edState.ids.length.toLocaleString(numLocale())))}</span> <button type="button" class="btn btn-sm btn-ghost" data-fk="ed-allpieces" onclick="edState.ids=null; edState.limit=40; edRefresh()">${t('ed.scope_all')}</button></p>` : ''}
    <div class="field ed-field-pick" data-nosave><label for="edField">${t('ed.field')}</label><select id="edField" onchange="edSetField(this.value)">
      <optgroup label="${escapeHTML(t('ed.group_data'))}">${ED_BASE_FIELDS.map(k=>`<option value="${k}" ${k===f ? 'selected' : ''}>${escapeHTML(edFieldLabel(k))}</option>`).join('')}</optgroup>
      ${cust.length ? `<optgroup label="${escapeHTML(t('p.custom_fields'))}">${cust.map(l=>`<option value="cf:${escapeHTML(l)}" ${f===('cf:' + l) ? 'selected' : ''}>${escapeHTML(l)}</option>`).join('')}</optgroup>` : ''}
    </select></div>
    ${searchbarHTML({ id:'edQ', placeholder:t('vb.search_ph'), value:edState.q, oninput:'edQuery(this.value)' })}
    <div class="chip-row vb-chips" role="group" aria-label="${escapeHTML(t('ed.title'))}">${chip('empty', t('ed.show_empty'))}${edHasBadMode(f) ? chip('bad', t(f==='name' ? 'ed.show_badname' : 'ed.show_bad')) : ''}${chip('all', t('val.all'))}</div>
    <div class="vb-tools ed-tools">
      <div class="field" data-nosave><label for="edPlat">${t('filter.platform')}</label><select id="edPlat" onchange="edState.plat=this.value; edState.limit=40; edRefresh()"><option value="">${t('val.platform_all')}</option>${plats.map(pl=>`<option value="${pl.id}" ${edState.plat===pl.id ? 'selected' : ''}>${escapeHTML(pl.name)}</option>`).join('')}</select></div>
      <div class="field" data-nosave><label for="edPoss">${t('ed.poss')}</label><select id="edPoss" onchange="edState.poss=this.value; edState.limit=40; edRefresh()"><option value="">${t('ed.poss_all')}</option><option value="tengo" ${edState.poss==='tengo' ? 'selected' : ''}>${t('inv.chip.have')}</option><option value="falta" ${edState.poss==='falta' ? 'selected' : ''}>${t('inv.chip.missing')}</option></select></div>
    </div>
    ${edFieldHintHTML(f)}
    <p class="section-sub vb-count" id="edCount" role="status">${escapeHTML(vbCountText(list.length))}</p>
    <div id="edRes">${edResultsHTML(list)}</div>`;
}
function edFieldHintHTML(f){
  const k = f==='releaseDateExact' ? 'ed.hint_date' : f==='year' ? 'ed.hint_year' : f==='region' ? 'ed.hint_region' : f==='name' ? 'ed.hint_name' : f==='barcode' ? 'ed.hint_barcode' : edIsCustom(f) ? 'ed.hint_custom' : '';
  return k ? `<p class="section-sub ed-hint">${escapeHTML(t(k))}</p>` : '';
}
function edResultsHTML(list){
  const shown = list.slice(0, edState.limit), f = edState.field;
  const empty = edState.q.trim() ? t('vb.no_match') + (edState.show!=='all' ? ' ' + t('vb.try_all') : '') : t(edState.show==='empty' ? 'ed.none_empty' : edState.show==='bad' ? 'ed.none_bad' : 'val.empty_sel');
  return `${shown.length ? `<div class="vb-list ed-list" data-nosave>${shown.map(p=> edRowHTML(p, f)).join('')}</div>` : `<p class="section-sub">${escapeHTML(empty)}</p>`}
    ${list.length > shown.length ? `<button type="button" class="btn btn-sm load-more" data-fk="ed-more" onclick="edState.limit+=40; edRefreshList()">${t('val.more').replace('{n}', list.length - shown.length)}</button>` : ''}`;
}
function edRowHTML(p, f){
  const id = escapeHTML(p.id), lbl = escapeHTML(edFieldLabel(f) + ' — ' + p.name);
  let input;
  if(f==='region'){
    const tags = p.regionTags || [], legacy = !tags.length && regionKeysFor(p).length ? regionKeysFor(p)[0].label : '';
    input = `<div class="ed-regions" role="group" aria-label="${lbl}">${REGION_OPTIONS.map(([code, key])=>{ const on = tags.includes(code); return `<button type="button" class="chip ${on ? 'active' : ''}" aria-pressed="${on}" onclick="edToggleRegion('${id}','${code}',this)">${escapeHTML(REGION_CODES[code] || code)}<span class="sr-only"> ${escapeHTML(t(key))}</span></button>`; }).join('')}${legacy ? `<small class="ed-legacy">${escapeHTML(t('ed.region_text').replace('{s}', legacy))}</small>` : ''}</div>`;
  } else if(f==='general'){
    const v = edGet(p, f);
    input = `<span class="vb-box is-text"><select aria-label="${lbl}" onchange="edSet('${id}',this)"><option value="">—</option>${[10,9,8,7,6,5,4,3,2,1].map(n=>`<option value="${n}" ${String(n)===v ? 'selected' : ''}>${n}/10</option>`).join('')}</select></span>`;
  } else {
    const v = f==='name' ? p.name : edGet(p, f);
    const attrs = f==='year' ? 'inputmode="numeric" maxlength="4"' : f==='barcode' ? 'inputmode="numeric" maxlength="20"' : f==='releaseDateExact' ? `maxlength="10" placeholder="${escapeHTML(t('p.date_ph'))}"` : f==='nameJp' ? 'lang="ja" maxlength="200"' : 'maxlength="200"';
    input = `<span class="vb-box is-text"><input type="text" autocomplete="off" enterkeyhint="next" ${attrs} value="${escapeHTML(v)}" aria-label="${lbl}" onchange="edSet('${id}',this)"></span>`;
  }
  const extra = f==='name' && revCleanName(p.name)!==p.name ? `<small class="ed-fix">${escapeHTML(t('ed.name_fix'))} <button type="button" class="btn btn-sm btn-ghost" onclick="edFixName('${id}',this)">${t('rev.fix')}</button></small>` : '';
  return `<div class="vb-row ed-row ${f==='region' ? 'is-wide' : ''}" data-id="${id}" onfocusout="edRowLeft(this, event)"><div class="vb-name"><b>${escapeHTML(f==='name' ? revPieceMeta(p) || p.name : p.name)}</b><small>${escapeHTML(f==='name' ? (p.categoryId ? (getAllCategories().find(c=> c.id===p.categoryId) || {}).name || '' : '') : revPieceMeta(p))}</small>${extra}</div>
    <div class="ed-in">${input}</div></div>`;
}
async function edSetField(f){
  edState.field = f; edState.limit = 40;
  if(edState.show==='bad' && !edHasBadMode(f)) edState.show = 'empty';
  await setUiPref('edField', f);
  edRefresh();
}
function edQuery(v){ edState.q = String(v || ''); edState.limit = 40; clearTimeout(window._edQT); window._edQT = setTimeout(edRefreshList, 140); }
function edRefreshList(){
  if(!isSheetKind('ed-bulk')) return;
  const r = document.getElementById('edRes'); if(!r) return;
  const a = document.activeElement, more = a && a.dataset && a.dataset.fk==='ed-more';
  const list = edList();
  r.innerHTML = edResultsHTML(list);
  const c = document.getElementById('edCount'); if(c) c.textContent = vbCountText(list.length);
  if(more){ const b = r.querySelector('[data-fk="ed-more"]'); if(b) b.focus({ preventScroll:true }); }
}
function edRefresh(){
  if(!isSheetKind('ed-bulk')) return;
  const a = document.activeElement, fk = a && a.dataset ? a.dataset.fk : null, id = a && a.id;
  const pos = a && a.id==='edQ' ? a.selectionStart : null;
  const body = document.getElementById('sheetBody'), y = body ? body.scrollTop : 0;
  updateSheetBody(edBodyHTML());
  if(body) body.scrollTop = y;
  const b = fk ? document.querySelector(`#sheetBody [data-fk="${fk}"]`) : id ? document.getElementById(id) : null;
  (b || document.getElementById('edField')).focus({ preventScroll:true });
  if(b && pos!==null) try{ b.setSelectionRange(pos, pos); }catch(e){}
}
function edRemember(id){
  if(!edUndo || edUndo.has(id)) return;
  edUndo.set(id, OVERRIDES.products[id] ? JSON.stringify(OVERRIDES.products[id]) : null);
}
async function edSet(id, input){
  const p = PRODUCTS_BY_ID[id]; if(!p) return;
  const f = edState.field, raw = String(input.value || '').trim();
  let v = raw;
  if(f==='year' && raw && !revYearOk(raw)){ input.setAttribute('aria-invalid', 'true'); showToast(t('ed.bad_year'), { replace:true }); return; }
  if(f==='releaseDateExact'){ v = revParseDate(raw); if(v===null){ input.setAttribute('aria-invalid', 'true'); showToast(t('ed.bad_date'), { replace:true }); return; } input.value = v; }
  if(f==='name' && !raw){ input.setAttribute('aria-invalid', 'true'); input.value = p.name; showToast(t('ed.name_empty'), { replace:true }); return; }
  if(f==='barcode') v = raw.replace(/\s+/g, '');
  input.removeAttribute('aria-invalid');
  edRemember(id);
  if(f==='general') await updateConservation(id, 'general', v);
  else if(f==='year' || f==='name' || f==='nameJp') await updateProductField(id, f, v);
  else if(edIsCustom(f)) await edSetCustom(p, f.slice(3), v);
  else await updateEditionField(id, f, v);
  if(f==='barcode') dupBarcodeWarn(id, v);
  edRowSaved(input.closest('.vb-row'));
}
async function edSetCustom(p, label, v){
  const list = (p.customFields || []).map(cf=> Object.assign({}, cf));
  const i = list.findIndex(cf=> cf && normText(String(cf.label || '').trim())===normText(label));
  if(i >= 0) list[i].value = v; else if(v) list.push({ label, value:v });
  p.customFields = list;
  await setProductField(p.id, 'customFields', list);
}
async function edToggleRegion(id, code, btn){
  const p = PRODUCTS_BY_ID[id]; if(!p) return;
  edRemember(id);
  const arr = (p.regionTags || []).slice(), i = arr.indexOf(code);
  if(i >= 0) arr.splice(i, 1); else arr.push(code);
  p.regionTags = arr;
  await setProductField(id, 'regionTags', arr);
  const on = arr.includes(code); btn.classList.toggle('active', on); btn.setAttribute('aria-pressed', String(on));
  edRowSaved(btn.closest('.vb-row'));
}
async function edFixName(id, btn){
  const p = PRODUCTS_BY_ID[id]; if(!p) return;
  const row = btn.closest('.vb-row'), nv = revCleanName(p.name);
  edRemember(id);
  await updateProductField(id, 'name', nv);
  const inp = row && row.querySelector('input'); if(inp) inp.value = nv;
  const fx = row && row.querySelector('.ed-fix'); if(fx) fx.remove();
  if(inp) inp.focus({ preventScroll:true });
  edRowSaved(row);
}
function edRowDone(row){
  const p = row && PRODUCTS_BY_ID[row.dataset.id]; if(!p) return false;
  return (edState.show==='empty' && !!edGet(p, edState.field)) || (edState.show==='bad' && !edIsBad(p, edState.field));
}
function edRowSaved(row){
  if(!row) return;
  row.classList.add('is-saved');
  if(edRowDone(row) && !row.contains(document.activeElement)) edRowRemove(row);
}
function edRowLeft(row, e){
  if(e.relatedTarget && row.contains(e.relatedTarget)) return;
  if(edRowDone(row)) edRowRemove(row);
}
function edRowRemove(row){
  if(!row || row.classList.contains('is-leaving') || !isSheetKind('ed-bulk')) return;
  const done = ()=>{
    if(!row.isConnected) return;
    const body = document.getElementById('sheetBody'), a = document.activeElement, r = a && a.closest ? a.closest('.vb-row') : null;
    const y0 = r && r!==row ? r.getBoundingClientRect().top : null;
    row.remove();
    if(y0!==null && body){ const dy = r.getBoundingClientRect().top - y0; if(dy) body.scrollTop += dy; }
    const list = edList(), c = document.getElementById('edCount'); if(c) c.textContent = vbCountText(list.length);
    const left = document.querySelectorAll('#edRes .vb-row').length, more = document.querySelector('#edRes [data-fk="ed-more"]');
    if(more){ const n = list.length - left; if(n > 0) more.textContent = t('val.more').replace('{n}', n); else more.remove(); }
    if(!left) edRefreshList();
  };
  row.classList.add('is-leaving');
  if(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) done(); else setTimeout(done, 220);
}
/* Al cerrar: cuántas piezas has cambiado y «Deshacer» para todas */
async function edClosed(){
  const undo = edUndo; edUndo = null;
  await renderKeepFocus('[data-fk="ed-open"], [data-fk="inv-ed"]');
  if(!undo || !undo.size) return;
  const n = undo.size, snap = [...undo.entries()];
  showToast((n===1 ? t('ed.done1') : t('ed.done').replace('{n}', n.toLocaleString(numLocale()))), { ok:true, replace:true, duration:8000, action:{ label:t('common.undo'), fn: async ()=>{
    snap.forEach(([id, js])=>{ if(js===null) delete OVERRIDES.products[id]; else OVERRIDES.products[id] = JSON.parse(js); });
    await persistOverrides(); buildProducts(); await renderKeepFocus();
    showToast(t('ed.undone'), { ok:true, replace:true });
  } } });
}

/* ---------- Revisión de la colección (idea 52) ---------- */
const REV_KEYS = ['noyear', 'noregion', 'baddate', 'datemismatch', 'dupbarcode', 'dupname', 'badname', 'orphanphotos'];
function revOrphanPhotos(){
  if(typeof PHOTO_INDEX==='undefined' || !PHOTO_INDEX.ready) return [];
  const out = [];
  PHOTO_SIDES.forEach(s=> PHOTO_INDEX[s].forEach((key, id)=>{ if(!productForPhotoId(id)) out.push(key); }));
  return out;
}
function revDupGroups(keyFn, prefix){
  const m = new Map();
  PRODUCTS.forEach(p=>{ const k = keyFn(p); if(!k) return; if(!m.has(k)) m.set(k, []); m.get(k).push(p); });
  return [...m.entries()].filter(([k, list])=> list.length > 1 && !revIgnored(prefix + k)).map(([k, list])=> ({ key:k, list: sortGames(list) }));
}
function revNameGroups(){
  // nombres iguales o casi iguales dentro de la misma plataforma
  const byPlat = new Map();
  PRODUCTS.forEach(p=>{ const k = p.platformId || ''; if(!byPlat.has(k)) byPlat.set(k, []); byPlat.get(k).push(p); });
  const groups = [];
  byPlat.forEach(list=>{
    const infos = list.map(p=> revNameInfo(p.name)), used = new Set();
    for(let i = 0; i < list.length; i++){
      if(used.has(i) || !infos[i].k) continue;
      const g = [i];
      for(let j = i + 1; j < list.length; j++) if(!used.has(j) && revNamesClose(infos[i], infos[j])) g.push(j);
      if(g.length > 1){
        g.forEach(x=> used.add(x));
        const items = sortGames(g.map(x=> list[x])), key = items.map(p=> p.id).sort().join('|');
        if(!revIgnored('dupname:' + key)) groups.push({ key, list: items });
      }
    }
  });
  return groups;
}
function reviewData(){
  const d = {};
  d.noyear = PRODUCTS.filter(p=> !String(p.year || '').trim());
  d.noregion = PRODUCTS.filter(p=> !regionKeysFor(p).length);
  d.baddate = PRODUCTS.filter(p=> String(p.releaseDateExact || '').trim() && !revDateOk(p.releaseDateExact));
  d.datemismatch = PRODUCTS.filter(p=> revDateOk(p.releaseDateExact) && String(p.releaseDateExact || '').trim() && revYearOk(p.year) && String(p.year).trim()!==String(p.releaseDateExact).slice(0, 4) && !revIgnored('datemismatch:' + p.id));
  d.dupbarcode = revDupGroups(p=>{ const b = revBarcodeKey(p.barcode); return b.length >= 8 ? b : ''; }, 'dupbarcode:');
  d.dupname = revNameGroups();
  d.badname = PRODUCTS.filter(p=> revCleanName(p.name)!==p.name && revCleanName(p.name));
  d.orphanphotos = revOrphanPhotos();
  return d;
}
function revCount(d, k){ return d[k].length; }
function reviewSectionHTML(){
  const d = reviewData(), rows = REV_KEYS.filter(k=> revCount(d, k));
  const ign = OVERRIDES.revisionIgnorar ? Object.keys(OVERRIDES.revisionIgnorar).length : 0;
  const editBtn = `<button type="button" class="btn btn-sm" data-fk="ed-open" onclick="openEdBulk({ from:'rev' })">${icon('rows')} ${t('ed.open')}</button>`;
  return `<section class="vit-section rev-section" id="revSection">${sectionTitleHTML(t('rev.title'), rows.length ? fmtCount(rows.length, 'rev.n1', 'rev.n') : '')}
    <p class="section-sub">${escapeHTML(t('rev.sub'))}</p>
    ${rows.length ? `<div class="rev-list">${rows.map(k=>{ const n = revCount(d, k);
      return `<button type="button" class="rev-row" data-fk="rev-${k}" onclick="openReview('${k}')"><span class="rev-main"><b>${escapeHTML(t('rev.' + k))}</b><small>${escapeHTML(t('rev.' + k + '_d'))}</small></span><span class="rev-n">${n.toLocaleString(numLocale())}</span>${icon('chevronRight')}</button>`; }).join('')}</div>`
      : `<p class="rev-ok">${icon('checkCircle')} ${escapeHTML(t('rev.all_ok'))}</p>`}
    <div class="rev-actions">${editBtn}${ign ? `<button type="button" class="btn btn-sm btn-ghost" data-fk="rev-ign" onclick="revResetIgnored()">${escapeHTML((ign===1 ? t('rev.ignored1') : t('rev.ignored')).replace('{n}', ign))}</button>` : ''}</div></section>`;
}
async function revResetIgnored(){
  const prev = OVERRIDES.revisionIgnorar ? Object.assign({}, OVERRIDES.revisionIgnorar) : null; if(!prev) return;
  delete OVERRIDES.revisionIgnorar; await persistOverrides();
  await renderKeepFocus('[data-fk="ed-open"]');
  showToast(t('rev.ignored_reset'), { ok:true, replace:true, action:{ label:t('common.undo'), fn: async ()=>{ OVERRIDES.revisionIgnorar = prev; await persistOverrides(); await renderKeepFocus(); } } });
}
let revOpenKey = '';
function openReview(k){
  // los de un solo dato se arreglan en «Editar en serie», ya filtrado
  if(k==='noyear') return openEdBulk({ field:'year', show:'empty', from:'rev' });
  if(k==='noregion') return openEdBulk({ field:'region', show:'empty', from:'rev' });
  if(k==='baddate') return openEdBulk({ field:'releaseDateExact', show:'bad', from:'rev' });
  revOpenKey = k;
  openSheet({ kind:'rev', title:t('rev.' + k), body:revBodyHTML(k), foot:`<button type="button" class="btn primary" onclick="closeSheet()">${t('copy.done')}</button>`, onClose: ()=> renderKeepFocus(`[data-fk="rev-${k}"]`) });
}
function revRefresh(focusSel){
  if(!isSheetKind('rev')) return;
  const body = document.getElementById('sheetBody'), y = body ? body.scrollTop : 0;
  updateSheetBody(revBodyHTML(revOpenKey));
  if(body) body.scrollTop = y;
  const b = focusSel ? document.querySelector('#sheetBody ' + focusSel) : null;
  (b || document.querySelector('#sheetBody button') || document.querySelector('.sheet-foot .btn')).focus({ preventScroll:true });
}
function revPieceBtn(p){ return `<button type="button" class="dup-open" onclick="dupOpen('${escapeHTML(p.id)}')"><b>${escapeHTML(p.name)}</b><small>${escapeHTML(revPieceMeta(p))}</small></button>`; }
function revBodyHTML(k){
  const d = reviewData(), list = d[k];
  const sub = `<p class="section-sub">${escapeHTML(t('rev.' + k + '_help'))}</p>`;
  if(!list.length) return `<p class="rev-ok">${icon('checkCircle')} ${escapeHTML(t('rev.none_left'))}</p>`;
  if(k==='datemismatch') return sub + `<button type="button" class="btn btn-sm" data-fk="rev-all" onclick="revDatesAll()">${icon('calendar')} ${escapeHTML(t('rev.date_all').replace('{n}', list.length))}</button>
    <ul class="rev-items">${list.map((p, i)=>{ const y = String(p.releaseDateExact).slice(0, 4);
      return `<li class="rev-item">${revPieceBtn(p)}<p class="rev-what">${escapeHTML(t('rev.date_is').replace('{y}', p.year).replace('{d}', p.releaseDateExact))}</p>
        <div class="rev-btns"><button type="button" class="btn btn-sm" data-fk="rev-y-${i}" onclick="revDateFix('${escapeHTML(p.id)}', ${i})">${escapeHTML(t('rev.date_use').replace('{y}', y))}</button><button type="button" class="btn btn-sm btn-ghost" data-fk="rev-ok-${i}" onclick="revIgnoreItem('datemismatch:${escapeHTML(p.id)}', ${i})">${t('rev.its_ok')}</button></div></li>`; }).join('')}</ul>`;
  if(k==='dupbarcode' || k==='dupname') return sub + `<ul class="rev-items">${list.map((g, i)=>`<li class="rev-item rev-group">
      ${k==='dupbarcode' ? `<p class="rev-what">${icon('barcode')} ${escapeHTML(typeof formatBarcode==='function' ? formatBarcode(g.key) : g.key)}</p>` : ''}
      <ul class="dup-list">${g.list.map(p=>`<li>${revPieceBtn(p)}</li>`).join('')}</ul>
      <div class="rev-btns"><button type="button" class="btn btn-sm btn-ghost" data-fk="rev-ok-${i}" onclick="revIgnoreItem('${k}:${escapeHTML(g.key)}', ${i})">${t('rev.not_error')}</button></div></li>`).join('')}</ul>`;
  if(k==='badname') return sub + `<button type="button" class="btn btn-sm" data-fk="rev-all" onclick="revNamesAll()">${icon('check')} ${escapeHTML(t('rev.name_all').replace('{n}', list.length))}</button>
    <ul class="rev-items">${list.map((p, i)=>`<li class="rev-item"><p class="rev-name-old"><span class="sr-only">${t('rev.before')}: </span>${escapeHTML(p.name).replace(/\n/g, '<span class="rev-nl" aria-hidden="true">↵</span>').replace(/ (?= |$)/g, '<span class="rev-sp" aria-hidden="true">·</span>')}</p>
      <p class="rev-name-new"><span class="sr-only">${t('rev.after')}: </span>${escapeHTML(revCleanName(p.name))}</p><small class="rev-meta">${escapeHTML(revPieceMeta(p))}</small>
      <div class="rev-btns"><button type="button" class="btn btn-sm" data-fk="rev-fx-${i}" onclick="revNameFix('${escapeHTML(p.id)}', ${i})">${t('rev.fix')}</button><button type="button" class="btn btn-sm btn-ghost" onclick="dupOpen('${escapeHTML(p.id)}')">${t('rev.open')}</button></div></li>`).join('')}</ul>`;
  if(k==='orphanphotos') return sub + `<p class="rev-what">${escapeHTML((list.length===1 ? t('rev.photos1') : t('rev.photos')).replace('{n}', list.length))}</p>
    <button type="button" class="btn btn-sm btn-danger" data-fk="rev-photos" onclick="revPhotosDelete()">${icon('trash')} ${escapeHTML(t('rev.photos_delete'))}</button>`;
  return sub;
}
async function revIgnoreItem(key, i){
  await revIgnore(key);
  revRefresh(`[data-fk="rev-ok-${i}"], [data-fk="rev-ok-${Math.max(0, i - 1)}"]`);
  showToast(t('rev.ignored_one'), { ok:true, replace:true, action:{ label:t('common.undo'), fn: async ()=>{ await revUnignore(key); if(isSheetKind('rev')) revRefresh(); else renderKeepFocus(); } } });
}
async function revSetMany(changes, msgKey){
  // changes: [[id, campo, valor]] · todo de una vez, con «Deshacer»
  const snap = changes.map(([id])=> [id, OVERRIDES.products[id] ? JSON.stringify(OVERRIDES.products[id]) : null]);
  changes.forEach(([id, f, v])=>{ if(!OVERRIDES.products[id]) OVERRIDES.products[id] = {}; OVERRIDES.products[id][f] = v; const p = PRODUCTS_BY_ID[id]; if(p) p[f] = v; });
  await persistOverrides(); buildProducts();
  if(typeof _catalogPos!=='undefined') _catalogPos = null;
  const n = changes.length;
  showToast(t(msgKey).replace('{n}', n.toLocaleString(numLocale())), { ok:true, replace:true, duration:7000, action:{ label:t('common.undo'), fn: async ()=>{
    snap.forEach(([id, js])=>{ if(js===null) delete OVERRIDES.products[id]; else OVERRIDES.products[id] = JSON.parse(js); });
    await persistOverrides(); buildProducts(); if(isSheetKind('rev')) revRefresh(); else await renderKeepFocus();
  } } });
}
async function revDateFix(id, i){
  const p = PRODUCTS_BY_ID[id]; if(!p) return;
  await revSetMany([[id, 'year', String(p.releaseDateExact).slice(0, 4)]], 'rev.done_year');
  revRefresh(`[data-fk="rev-y-${i}"], [data-fk="rev-y-${Math.max(0, i - 1)}"]`);
}
async function revDatesAll(){
  const list = reviewData().datemismatch; if(!list.length) return;
  await revSetMany(list.map(p=> [p.id, 'year', String(p.releaseDateExact).slice(0, 4)]), 'rev.done_year');
  revRefresh();
}
async function revNameFix(id, i){
  const p = PRODUCTS_BY_ID[id]; if(!p) return;
  await revSetMany([[id, 'name', revCleanName(p.name)]], 'rev.done_name');
  revRefresh(`[data-fk="rev-fx-${i}"], [data-fk="rev-fx-${Math.max(0, i - 1)}"]`);
}
async function revNamesAll(){
  const list = reviewData().badname; if(!list.length) return;
  await revSetMany(list.map(p=> [p.id, 'name', revCleanName(p.name)]), 'rev.done_name');
  revRefresh();
}
async function revPhotosDelete(){
  const keys = revOrphanPhotos(); if(!keys.length) return;
  if(!await showConfirmModal((keys.length===1 ? t('rev.photos_q1') : t('rev.photos_q')).replace('{n}', keys.length), { okLabel:t('rev.photos_delete'), danger:true })) return revRefresh('[data-fk="rev-photos"]');
  let total = 0;
  for(let pass = 0; pass < 3; pass++){   // (si una pieza borrada tenía también claves antiguas, salen en la siguiente vuelta)
    const ks = pass ? revOrphanPhotos() : keys; if(!ks.length) break;
    for(const k of ks){ try{ await removePhoto(k); total++; }catch(e){} }
  }
  try{ await loadPhotoIndex(); }catch(e){}
  revRefresh();
  showToast((total===1 ? t('rev.photos_done1') : t('rev.photos_done')).replace('{n}', total), { ok:true, replace:true });
}
