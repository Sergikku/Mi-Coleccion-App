/* ==========================================================================
   v11.26 · Compras desde Japón
   - Moneda original (idea 18): el precio en yenes, dólares… y su cambio a tu
     moneda. El cambio se busca SOLO, el del Banco Central Europeo del día de
     la compra (servicio gratuito Frankfurter, sin clave). Solo se envían la
     fecha y las monedas, nada de tu colección. Sin conexión queda «pendiente»
     y se completa al volver la red. Se puede poner a mano, y un recargo de tu
     banco (%) opcional, en Ajustes.
   - Coste real (idea 19): precio + envío + comisión + aduana. Un pedido con
     varias piezas reparte sus gastos entre ellas según su precio. El total
     pasa a «Pagado».
   - Seguimiento de envíos (idea 14): cada pedido lleva su número de
     seguimiento, la empresa, la fecha prevista y los pasos (comprado, en el
     almacén del proxy, enviado, en aduana, entregado).
   - Reservas (idea 13): fecha de salida, tienda y señal; el día que sale, la
     pieza pasa sola a «En camino» (con «Deshacer»).
   Datos nuevos (opcionales; si no se usan no se guarda nada):
     en cada pieza `coste` y `reserva`; arriba `pedidos` y `compraAjustes`.
   ========================================================================== */

const CUR_ISO = { '€':'EUR', '$':'USD', '£':'GBP', '¥':'JPY' };
const BUY_CURRENCIES = ['JPY', 'EUR', 'USD', 'GBP', 'CNY', 'KRW'];
const ORDER_STEPS = ['comprado', 'almacen', 'enviado', 'aduana', 'entregado'];
const CARRIERS = ['Japan Post / EMS', 'DHL', 'FedEx', 'UPS', 'Correos', 'SEUR', 'GLS'];
const FX_HOST = 'https://api.frankfurter.dev';
function localIso(){ return CUR_ISO[currencySymbol()] || 'EUR'; }
function todayISO(){ const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function buyAjustes(){ const a = OVERRIDES.compraAjustes && typeof OVERRIDES.compraAjustes==='object' ? OVERRIDES.compraAjustes : {}; return { recargo: typeof a.recargo==='number' && isFinite(a.recargo) ? a.recargo : 0, moneda: BUY_CURRENCIES.includes(a.moneda) ? a.moneda : 'JPY' }; }
function curSymbol(iso){ return { EUR:'€', JPY:'¥', USD:'$', GBP:'£', CNY:'元', KRW:'₩' }[iso] || iso; }
function fmtCur(v, iso){
  if(v===null || v===undefined || !isFinite(v)) return '—';
  try{ return v.toLocaleString(numLocale(), { style:'currency', currency:iso, maximumFractionDigits: iso==='JPY' || iso==='KRW' ? 0 : 2 }); }catch(e){ return v.toLocaleString(numLocale()) + ' ' + curSymbol(iso); }
}
function numOrNull(v){ if(v===null || v===undefined || String(v).trim()==='') return null; const n = Number(String(v).replace(',', '.')); return isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : NaN; }
function round2(v){ return Math.round(v * 100) / 100; }

/* ---------- El cambio de moneda (BCE vía Frankfurter) ---------- */
const _fxMem = {};
function fxCacheGet(k){ if(_fxMem[k]) return _fxMem[k]; try{ const s = localStorage.getItem('fx:' + k); if(s){ const v = JSON.parse(s); _fxMem[k] = v; return v; } }catch(e){} return null; }
function fxCacheSet(k, v){ _fxMem[k] = v; try{ localStorage.setItem('fx:' + k, JSON.stringify(v)); }catch(e){} }
async function fxFetchJSON(url){
  const ctl = typeof AbortController==='function' ? new AbortController() : null;
  const tm = ctl ? setTimeout(()=> ctl.abort(), 9000) : null;
  try{ const r = await fetch(url, { cache:'no-store', signal: ctl ? ctl.signal : undefined }); if(!r.ok) return null; return await r.json(); }
  catch(e){ return null; } finally{ if(tm) clearTimeout(tm); }
}
/* Devuelve { rate, fecha } o null. fecha = día de la tabla del BCE (el laborable anterior si cae en fin de semana) */
async function fxRate(from, to, date){
  if(from===to) return { rate:1, fecha: date || todayISO() };
  const hoy = todayISO(), d = date && /^\d{4}-\d{2}-\d{2}$/.test(date) && date < hoy ? date : '';
  const key = from + ':' + to + ':' + (d || 'hoy:' + hoy);
  const c = fxCacheGet(key); if(c) return c;
  let out = null;
  const j = await fxFetchJSON(`${FX_HOST}/v1/${d || 'latest'}?base=${from}&symbols=${to}`);
  if(j && j.rates && typeof j.rates[to]==='number') out = { rate:j.rates[to], fecha: j.date || d || hoy };
  if(!out){
    const k = await fxFetchJSON(`${FX_HOST}/v2/rate/${from.toLowerCase()}/${to.toLowerCase()}${d ? '?date=' + d : ''}`);
    const r = k && (typeof k.rate==='number' ? k.rate : k.rates && typeof k.rates[to]==='number' ? k.rates[to] : null);
    if(typeof r==='number') out = { rate:r, fecha: k.date || d || hoy };
  }
  if(out && out.rate > 0){ fxCacheSet(key, out); return out; }
  return null;
}
/* Pone el cambio a un objeto con moneda (coste de una pieza o un pedido). Devuelve true si ha cambiado algo. */
async function fxEnsure(obj, fecha){
  if(!obj || !obj.moneda) return false;
  const loc = localIso();
  if(obj.moneda===loc){ const ch = obj.cambio!==1 || obj.pendiente; obj.cambio = 1; obj.cambioFuente = 'igual'; delete obj.cambioFecha; delete obj.pendiente; return ch; }
  if(obj.cambioFuente==='manual' && typeof obj.cambio==='number') { if(obj.pendiente){ delete obj.pendiente; return true; } return false; }
  const want = fecha || '';
  if(obj.cambioFuente==='bce' && typeof obj.cambio==='number' && obj.cambioPara===(want || 'hoy') && obj.cambioA===loc && !obj.pendiente) return false;
  const r = await fxRate(obj.moneda, loc, want);
  if(!r){ const ch = !obj.pendiente; obj.pendiente = true; return ch; }
  obj.cambio = r.rate; obj.cambioFecha = r.fecha; obj.cambioFuente = 'bce'; obj.cambioPara = want || 'hoy'; obj.cambioA = loc; delete obj.pendiente;
  return true;
}

/* ---------- Pedidos ---------- */
function pedidosList(){ return Array.isArray(OVERRIDES.pedidos) ? OVERRIDES.pedidos.filter(o=> o && typeof o==='object' && o.id) : []; }
function pedidoById(id){ return pedidosList().find(o=> o.id===id) || null; }
function pedidoOf(pid){ return pedidosList().find(o=> Array.isArray(o.piezas) && o.piezas.includes(pid)) || null; }
function pedidoPiezas(o){ return (o.piezas || []).map(id=> PRODUCTS_BY_ID[id]).filter(Boolean); }
function pedidoPaso(o){ const ps = o.pasos || {}; let last = null; ORDER_STEPS.forEach(s=>{ if(ps[s]) last = s; }); return last; }
function pedidoEntregado(o){ return !!(o.pasos && o.pasos.entregado); }
function pedidoNombre(o){ return String(o.nombre || '').trim() || [o.tienda, o.fecha].filter(Boolean).join(' · ') || t('ped.untitled'); }
function costeOf(p){ return p && p.coste && typeof p.coste==='object' ? p.coste : null; }
/* Coste real de una pieza en tu moneda: { total, precio, gastos, aduana, falta } (falta = el cambio aún no está) */
function costeReal(p){
  const c = costeOf(p) || {}, o = pedidoOf(p.id), aj = buyAjustes(), loc = localIso();
  const base = o || c, mon = base.moneda || c.moneda || loc;
  const cambio = mon===loc ? 1 : (typeof base.cambio==='number' ? base.cambio : null);
  const factor = cambio===null ? null : cambio * (mon===loc ? 1 : 1 + aj.recargo / 100);
  const precio = typeof c.precio==='number' ? c.precio : null;
  let gastosMon = 0, aduana = 0;
  if(o){
    const ps = pedidoPiezas(o), conPrecio = ps.filter(x=> costeOf(x) && typeof x.coste.precio==='number'), suma = conPrecio.reduce((s, x)=> s + x.coste.precio, 0);
    const share = suma > 0 ? (precio || 0) / suma : (ps.length ? 1 / ps.length : 0);
    gastosMon = ((+o.envio || 0) + (+o.comision || 0)) * share; aduana = (+o.aduana || 0) * share;
  } else { gastosMon = (+c.envio || 0) + (+c.comision || 0); aduana = +c.aduana || 0; }
  if(precio===null && !gastosMon && !aduana) return null;
  if(factor===null) return { total:null, precioMon:precio, gastosMon, aduana, moneda:mon, falta:true };
  const pr = (precio || 0) * factor, ga = gastosMon * factor;
  return { total: round2(pr + ga + aduana), precio: round2(pr), gastos: round2(ga), aduana: round2(aduana), precioMon:precio, gastosMon, moneda:mon, cambio, factor, falta:false };
}
/* «Pagado» sigue al coste real */
async function costeSyncPaid(ids){
  for(const id of ids){
    const p = PRODUCTS_BY_ID[id]; if(!p) continue;
    const r = costeReal(p); if(!r || r.total===null) continue;
    if(valuePaid(p)===r.total) continue;
    p.valuation = Object.assign({}, p.valuation || {}, { valorAdquisicion: r.total });
    if(!OVERRIDES.products[id]) OVERRIDES.products[id] = {};
    OVERRIDES.products[id].valuation = Object.assign({}, OVERRIDES.products[id].valuation || {}, { valorAdquisicion: r.total });
  }
}
function compraFecha(p){ return p && p.compra && /^\d{4}-\d{2}-\d{2}$/.test(p.compra.fecha || '') ? p.compra.fecha : ''; }

/* ---------- En la ficha: «Lo que te costó» ---------- */
function costeSectionHTML(p){
  const c = costeOf(p) || {}, o = pedidoOf(p.id), aj = buyAjustes(), loc = localIso();
  const mon = (o && o.moneda) || c.moneda || aj.moneda;
  const r = costeReal(p), base = o || c;
  const id = escapeHTML(p.id);
  const num = (f, label, v, ph)=> `<div class="field"><label for="cst_${f}_${id}">${label}</label><input id="cst_${f}_${id}" type="text" inputmode="decimal" value="${v===null || v===undefined ? '' : v}" placeholder="${escapeHTML(ph || '')}" onchange="costeSet('${id}','${f}',this)"></div>`;
  let body = '';
  if(o){
    body += `<div class="note cst-order">${icon('box')} <span>${escapeHTML(t('cst.in_order').replace('{s}', pedidoNombre(o)).replace('{n}', (o.piezas || []).length))}</span>
      <button type="button" class="btn btn-sm" data-fk="cst-order" onclick="openPedido('${escapeHTML(o.id)}')">${t('cst.open_order')}</button></div>`;
    body += `<div class="field-grid">${num('precio', t('cst.price') + ' (' + curSymbol(mon) + ')', c.precio)}</div>`;
  } else {
    body += `<div class="field-grid"><div class="field"><label for="cst_mon_${id}">${t('cst.currency')}</label><select id="cst_mon_${id}" onchange="costeSet('${id}','moneda',this)">${BUY_CURRENCIES.map(k=>`<option value="${k}" ${k===mon ? 'selected' : ''}>${k} · ${escapeHTML(curSymbol(k))}</option>`).join('')}</select></div>
      ${num('precio', t('cst.price') + ' (' + curSymbol(mon) + ')', c.precio)}</div>
      <div class="field-grid">${num('envio', t('cst.shipping') + ' (' + curSymbol(mon) + ')', c.envio)}${num('comision', t('cst.fee') + ' (' + curSymbol(mon) + ')', c.comision)}${num('aduana', t('cst.customs') + ' (' + curSymbol(loc) + ')', c.aduana)}</div>`;
  }
  body += costeCambioHTML(p, base, mon, o);
  if(r && r.total!==null){
    body += `<div class="cst-total" role="status"><span class="cst-total-label">${t('cst.total')}</span><b>${escapeHTML(fmtCur(r.total, loc))}</b>
      <small>${escapeHTML(t('cst.breakdown').replace('{p}', fmtCur(r.precio, loc)).replace('{g}', fmtCur(r.gastos, loc)).replace('{a}', fmtCur(r.aduana, loc)))}</small>
      <small>${escapeHTML(t('cst.to_paid'))}</small></div>`;
  }
  body += `<div class="quick-actions is-flush">${o ? `<button type="button" class="btn btn-sm btn-ghost" data-fk="cst-leave" onclick="pedidoQuitar('${escapeHTML(o.id)}','${id}')">${t('cst.leave_order')}</button>`
    : `<button type="button" class="btn btn-sm" data-fk="cst-add-order" onclick="pedidoElegir('${id}')">${icon('box')} ${t('cst.add_order')}</button>`}</div>`;
  const meta = r && r.total!==null ? fmtCur(r.total, loc) : r && r.falta ? t('cst.pending_short') : '';
  return disclosureHTML('coste', t('cst.title'), body, productSectionsOpen, escapeHTML(meta));
}
function costeCambioHTML(p, base, mon, o){
  const loc = localIso(), id = escapeHTML(p.id), where = o ? `pedido:${escapeHTML(o.id)}` : `pieza:${id}`;
  if(mon===loc) return '';
  const aj = buyAjustes(), fecha = o ? (o.fecha || '') : compraFecha(p);
  let line;
  if(base.pendiente || typeof base.cambio!=='number'){
    line = `<p class="cst-fx is-pending">${icon('cloudOff')} <span>${escapeHTML(t('cst.fx_pending'))}</span> <button type="button" class="btn btn-sm" data-fk="cst-fx-retry" onclick="costeFxRetry('${where}')">${t('cst.fx_retry')}</button></p>`;
  } else {
    const src = base.cambioFuente==='manual' ? t('cst.fx_manual') : t('cst.fx_bce').replace('{d}', base.cambioFecha || '');
    line = `<p class="cst-fx">${escapeHTML(t('cst.fx_line').replace('{a}', '1 ' + curSymbol(mon)).replace('{b}', base.cambio.toLocaleString(numLocale(), { maximumSignificantDigits:5 }) + ' ' + curSymbol(loc)))} <small>· ${escapeHTML(src)}${aj.recargo ? ' · ' + escapeHTML(t('cst.fx_fee').replace('{n}', aj.recargo.toLocaleString(numLocale()))) : ''}</small></p>`;
  }
  const note = fecha ? t('cst.fx_date').replace('{d}', fecha) : t(o ? 'cst.fx_nodate_order' : 'cst.fx_nodate');
  return `<div class="cst-fx-box">${line}<p class="section-sub">${escapeHTML(note)}</p>
    <div class="quick-actions is-flush"><button type="button" class="btn btn-sm btn-ghost" data-fk="cst-fx-manual" onclick="costeFxManual('${where}')">${t('cst.fx_set')}</button>${base.cambioFuente==='manual' ? `<button type="button" class="btn btn-sm btn-ghost" data-fk="cst-fx-auto" onclick="costeFxAuto('${where}')">${t('cst.fx_use_bce')}</button>` : ''}</div></div>`;
}
function costeTarget(where){
  const [kind, id] = String(where).split(/:(.+)/);
  if(kind==='pedido'){ const o = pedidoById(id); return o ? { obj:o, fecha:o.fecha || '', ids:(o.piezas || []).slice(), save: ()=>{} } : null; }
  const p = PRODUCTS_BY_ID[id]; if(!p) return null;
  const c = Object.assign({}, costeOf(p) || {});
  return { obj:c, fecha:compraFecha(p), ids:[id], save: ()=>{ p.coste = c; if(!OVERRIDES.products[id]) OVERRIDES.products[id] = {}; OVERRIDES.products[id].coste = c; } };
}
async function costeAfter(ids, focus){
  await costeSyncPaid(ids); await persistOverrides();
  if(isSheetKind('pedido')) pedidoRefresh(focus); else await renderKeepFocus(focus);
}
async function costeSet(id, f, input){
  const p = PRODUCTS_BY_ID[id]; if(!p) return;
  const c = Object.assign({}, costeOf(p) || {});
  if(f==='moneda'){ c.moneda = input.value; delete c.cambio; delete c.cambioFuente; delete c.cambioFecha; delete c.cambioPara; }
  else { const v = numOrNull(input.value); if(Number.isNaN(v)){ input.setAttribute('aria-invalid', 'true'); showToast(t('cst.bad_number'), { replace:true }); return; } input.removeAttribute('aria-invalid'); if(v===null) delete c[f]; else c[f] = v; }
  if(!c.moneda) c.moneda = (pedidoOf(id) || {}).moneda || buyAjustes().moneda;
  const empty = c.precio===undefined && c.envio===undefined && c.comision===undefined && c.aduana===undefined;
  if(empty && !pedidoOf(id)){ p.coste = null; if(OVERRIDES.products[id]) OVERRIDES.products[id].coste = null; await persistOverrides(); return renderKeepFocus(); }
  if(!pedidoOf(id)) await fxEnsure(c, compraFecha(p));
  p.coste = c; if(!OVERRIDES.products[id]) OVERRIDES.products[id] = {}; OVERRIDES.products[id].coste = c;
  const o = pedidoOf(id);
  await costeAfter(o ? o.piezas : [id]);
  if(c.pendiente) showToast(t('cst.fx_pending_toast'), { replace:true });
}
async function costeFxRetry(where){
  const tg = costeTarget(where); if(!tg) return;
  delete tg.obj.pendiente; if(tg.obj.cambioFuente==='bce') delete tg.obj.cambioPara;
  await fxEnsure(tg.obj, tg.fecha); tg.save();
  showToast(tg.obj.pendiente ? t('cst.fx_still') : t('cst.fx_ok'), { ok: !tg.obj.pendiente, replace:true });
  await costeAfter(tg.ids, '[data-fk="cst-fx-retry"], [data-fk="cst-fx-manual"]');
}
async function costeFxManual(where){
  const tg = costeTarget(where); if(!tg) return;
  const loc = localIso(), mon = tg.obj.moneda || buyAjustes().moneda;
  const raw = await askText(t('cst.fx_ask').replace('{a}', curSymbol(mon)).replace('{b}', curSymbol(loc)), typeof tg.obj.cambio==='number' ? String(tg.obj.cambio) : '');
  if(raw===null) return renderKeepFocus('[data-fk="cst-fx-manual"]');
  const v = Number(String(raw).replace(',', '.'));
  if(!(v > 0)){ showToast(t('cst.bad_number'), { replace:true }); return renderKeepFocus('[data-fk="cst-fx-manual"]'); }
  tg.obj.cambio = v; tg.obj.cambioFuente = 'manual'; delete tg.obj.pendiente; delete tg.obj.cambioFecha; tg.save();
  await costeAfter(tg.ids, '[data-fk="cst-fx-manual"]');
}
async function costeFxAuto(where){
  const tg = costeTarget(where); if(!tg) return;
  delete tg.obj.cambioFuente; delete tg.obj.cambio; delete tg.obj.cambioPara;
  await fxEnsure(tg.obj, tg.fecha); tg.save();
  await costeAfter(tg.ids, '[data-fk="cst-fx-manual"]');
}
/* Si cambia la fecha de compra, el cambio se vuelve a buscar (el del nuevo día) */
async function costeFechaCambiada(id){
  const p = PRODUCTS_BY_ID[id]; const c = costeOf(p); if(!c || pedidoOf(id) || c.cambioFuente==='manual' || c.moneda===localIso()) return;
  const cc = Object.assign({}, c); delete cc.cambioPara;
  await fxEnsure(cc, compraFecha(p));
  p.coste = cc; OVERRIDES.products[id].coste = cc;
  await costeSyncPaid([id]); await persistOverrides();
}

/* ---------- Pedido: la hoja ---------- */
let pedOpenId = '';
function pedidoNuevoId(){ return 'ped-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
async function pedidoCrear(ids, opts){
  opts = opts || {};
  const aj = buyAjustes(), first = ids.map(id=> PRODUCTS_BY_ID[id]).find(Boolean);
  const o = { id: pedidoNuevoId(), nombre:'', tienda: (first && first.compra && first.compra.tienda) || '', fecha: (first && compraFecha(first)) || todayISO(), moneda: aj.moneda, piezas: [], pasos: { comprado: todayISO() } };
  const list = pedidosList();
  // una pieza solo puede estar en un pedido: si estaba en otro, se mueve
  ids.forEach(id=> list.forEach(x=>{ if(Array.isArray(x.piezas)) x.piezas = x.piezas.filter(y=> y!==id); }));
  o.piezas = ids.filter(id=> PRODUCTS_BY_ID[id]);
  o.piezas.forEach(id=>{ const p = PRODUCTS_BY_ID[id]; const c = Object.assign({}, costeOf(p) || {}); c.moneda = o.moneda; p.coste = c; if(!OVERRIDES.products[id]) OVERRIDES.products[id] = {}; OVERRIDES.products[id].coste = c; });
  OVERRIDES.pedidos = list.concat([o]);
  await fxEnsure(o, o.fecha);
  await costeSyncPaid(o.piezas); await persistOverrides();
  if(opts.open!==false) openPedido(o.id);
  return o;
}
function openPedido(id){
  pedOpenId = id;
  const o = pedidoById(id); if(!o) return;
  openSheet({ kind:'pedido', title:t('ped.title'), body:pedidoBodyHTML(o), foot:`<button type="button" class="btn primary" onclick="closeSheet()">${t('copy.done')}</button>`, focus:'#pedName', onClose: ()=> renderKeepFocus() });
}
function pedidoRefresh(focusSel){
  if(!isSheetKind('pedido')) return;
  const o = pedidoById(pedOpenId); if(!o){ closeSheet(); return; }
  const a = document.activeElement, fk = a && a.dataset ? a.dataset.fk : null, aid = a && a.id;
  const body = document.getElementById('sheetBody'), y = body ? body.scrollTop : 0;
  updateSheetBody(pedidoBodyHTML(o));
  if(body) body.scrollTop = y;
  const b = (focusSel && document.querySelector('#sheetBody ' + focusSel.split(',')[0])) || (fk && document.querySelector(`#sheetBody [data-fk="${fk}"]`)) || (aid && document.getElementById(aid));
  if(b) b.focus({ preventScroll:true });
}
function trackingUrl(num){ const n = String(num || '').trim(); return n ? 'https://t.17track.net/es#nums=' + encodeURIComponent(n) : ''; }
function pedidoBodyHTML(o){
  const loc = localIso(), mon = o.moneda || buyAjustes().moneda, ps = pedidoPiezas(o), oid = escapeHTML(o.id);
  const f = (k, label, v, attrs)=> `<div class="field"><label for="ped_${k}">${label}</label><input id="ped_${k}" type="text" value="${escapeHTML(v===null || v===undefined ? '' : String(v))}" onchange="pedidoSet('${k}',this)" ${attrs || ''}></div>`;
  const totalPed = ps.reduce((s, p)=>{ const r = costeReal(p); return s + (r && r.total!==null ? r.total : 0); }, 0);
  const paso = pedidoPaso(o);
  let html = `<div class="field"><label for="pedName">${t('ped.name')}</label><input id="pedName" type="text" maxlength="80" value="${escapeHTML(o.nombre || '')}" placeholder="${escapeHTML(t('ped.name_ph'))}" onchange="pedidoSet('nombre',this)"></div>
    <div class="field-grid">${f('tienda', t('loan.store'), o.tienda, 'list="pedStores" maxlength="80" autocomplete="off"')}<div class="field"><label for="ped_fecha">${t('ped.date')}</label><input id="ped_fecha" type="date" value="${escapeHTML(o.fecha || '')}" onchange="pedidoSet('fecha',this)"></div></div>${storeDatalistHTML('pedStores')}
    <h3 class="ped-h">${t('ped.costs')}</h3>
    <div class="field-grid"><div class="field"><label for="ped_moneda">${t('cst.currency')}</label><select id="ped_moneda" onchange="pedidoSet('moneda',this)">${BUY_CURRENCIES.map(k=>`<option value="${k}" ${k===mon ? 'selected' : ''}>${k} · ${escapeHTML(curSymbol(k))}</option>`).join('')}</select></div>
      ${f('envio', t('cst.shipping') + ' (' + curSymbol(mon) + ')', o.envio, 'inputmode="decimal"')}${f('comision', t('cst.fee') + ' (' + curSymbol(mon) + ')', o.comision, 'inputmode="decimal"')}${f('aduana', t('cst.customs') + ' (' + curSymbol(loc) + ')', o.aduana, 'inputmode="decimal"')}</div>
    ${costeCambioHTML({ id:'' }, o, mon, o)}
    <p class="section-sub">${escapeHTML(t('ped.split_note'))}</p>
    <h3 class="ped-h">${escapeHTML(fmtCount(ps.length, 'ped.pieces1', 'ped.pieces'))}</h3>
    <ul class="ped-items">${ps.map((p, i)=>{ const r = costeReal(p), c = costeOf(p) || {}, pid = escapeHTML(p.id);
      return `<li class="ped-item"><button type="button" class="ped-name" onclick="dupOpen('${pid}')"><b>${escapeHTML(p.name)}</b><small>${escapeHTML([p.platformName, possessionLabel(p.possession)].filter(Boolean).join(' · '))}</small></button>
        <div class="ped-price"><label class="vb-in"><span>${t('cst.price')}</span><span class="vb-box"><input type="text" inputmode="decimal" value="${typeof c.precio==='number' ? c.precio : ''}" aria-label="${escapeHTML(t('cst.price') + ' — ' + p.name)}" data-fk="ped-pr-${i}" onchange="costeSet('${pid}','precio',this)"><i aria-hidden="true">${escapeHTML(curSymbol(mon))}</i></span></label>
        <span class="ped-real">${r && r.total!==null ? escapeHTML(t('ped.real').replace('{s}', fmtCur(r.total, loc))) : r && r.falta ? escapeHTML(t('cst.pending_short')) : ''}</span>
        <button type="button" class="btn btn-ghost btn-icon" data-fk="ped-rm-${i}" onclick="pedidoQuitar('${oid}','${pid}')" aria-label="${escapeHTML(t('ped.remove').replace('{s}', p.name))}" title="${escapeHTML(t('ped.remove').replace('{s}', p.name))}">${icon('x')}</button></div></li>`; }).join('')}</ul>
    <button type="button" class="btn btn-sm" data-fk="ped-add" onclick="pedidoAddPieces('${oid}')">${icon('plus')} ${t('ped.add_pieces')}</button>
    ${totalPed ? `<div class="cst-total"><span class="cst-total-label">${t('ped.total')}</span><b>${escapeHTML(fmtCur(round2(totalPed), loc))}</b></div>` : ''}
    <h3 class="ped-h">${t('ped.tracking')}</h3>
    <div class="field-grid">${f('seguimiento', t('ped.track_num'), o.seguimiento, 'maxlength="60" autocomplete="off" autocapitalize="characters"')}
      <div class="field"><label for="ped_empresa">${t('ped.carrier')}</label><input id="ped_empresa" type="text" list="pedCarriers" maxlength="40" value="${escapeHTML(o.empresa || '')}" onchange="pedidoSet('empresa',this)"></div>
      <div class="field"><label for="ped_estimada">${t('ped.eta')}</label><input id="ped_estimada" type="date" value="${escapeHTML(o.estimada || '')}" onchange="pedidoSet('estimada',this)"></div></div>
    <datalist id="pedCarriers">${CARRIERS.map(c=>`<option value="${escapeHTML(c)}"></option>`).join('')}</datalist>
    ${o.seguimiento ? `<a class="btn btn-sm" href="${escapeHTML(trackingUrl(o.seguimiento))}" target="_blank" rel="noopener">${icon('external')} ${t('ped.track_open')}</a>` : ''}
    <ol class="ped-steps" aria-label="${escapeHTML(t('ped.steps'))}">${ORDER_STEPS.map((s, i)=>{ const d = (o.pasos || {})[s] || ''; const cur = s===paso;
      return `<li class="ped-step ${d ? 'is-done' : ''} ${cur ? 'is-current' : ''}"><span class="ped-dot" aria-hidden="true">${d ? icon('check') : i + 1}</span>
        <label for="ped_paso_${s}">${t('ped.step.' + s)}</label><input id="ped_paso_${s}" type="date" value="${escapeHTML(d)}" onchange="pedidoPasoSet('${s}',this.value)">
        ${d ? '' : `<button type="button" class="btn btn-sm btn-ghost" data-fk="ped-today-${s}" onclick="pedidoPasoSet('${s}', todayISO())">${t('ped.today')}</button>`}</li>`; }).join('')}</ol>
    ${pedidoEntregado(o) && ps.some(p=> p.possession!=='tengo') ? `<button type="button" class="btn btn-sm primary" data-fk="ped-have" onclick="pedidoMarcarTengo('${oid}')">${icon('check')} ${escapeHTML(t('ped.mark_have').replace('{n}', ps.filter(p=> p.possession!=='tengo').length))}</button>` : ''}
    <div class="ped-danger"><button type="button" class="btn btn-sm btn-danger" data-fk="ped-del" onclick="pedidoBorrar('${oid}')">${icon('trash')} ${t('ped.delete')}</button></div>`;
  return html;
}
async function pedidoSet(k, input){
  const o = pedidoById(pedOpenId); if(!o) return;
  if(['envio', 'comision', 'aduana'].includes(k)){
    const v = numOrNull(input.value); if(Number.isNaN(v)){ input.setAttribute('aria-invalid', 'true'); showToast(t('cst.bad_number'), { replace:true }); return; }
    input.removeAttribute('aria-invalid'); if(v===null) delete o[k]; else o[k] = v;
  } else if(k==='tienda'){ const v = storeCanonical(input.value); input.value = v; o.tienda = v; if(v && storeRemember(v)) showToast(t('stores.added').replace('{s}', v), { ok:true, replace:true }); }
  else o[k] = String(input.value || '').trim();
  if(k==='moneda'){ delete o.cambio; delete o.cambioFuente; delete o.cambioPara; (o.piezas || []).forEach(id=>{ const p = PRODUCTS_BY_ID[id]; if(!p) return; const c = Object.assign({}, costeOf(p) || {}, { moneda:o.moneda }); p.coste = c; if(!OVERRIDES.products[id]) OVERRIDES.products[id] = {}; OVERRIDES.products[id].coste = c; }); }
  if(k==='moneda' || k==='fecha'){ if(o.cambioFuente!=='manual') delete o.cambioPara; await fxEnsure(o, o.fecha); if(o.pendiente) showToast(t('cst.fx_pending_toast'), { replace:true }); }
  await costeAfter(o.piezas || [], '#ped_' + k);
}
async function pedidoPasoSet(step, val){
  const o = pedidoById(pedOpenId); if(!o) return;
  o.pasos = Object.assign({}, o.pasos || {});
  if(val) o.pasos[step] = val; else delete o.pasos[step];
  // los pasos anteriores sin fecha se dan por hechos ese mismo día
  if(val) ORDER_STEPS.slice(0, ORDER_STEPS.indexOf(step)).forEach(s=>{ if(!o.pasos[s]) o.pasos[s] = val; });
  await persistOverrides();
  pedidoRefresh(`#ped_paso_${step}`);
  if(step==='entregado' && val){ const n = pedidoPiezas(o).filter(p=> p.possession!=='tengo').length; if(n) showToast(t('ped.delivered_q').replace('{n}', n), { replace:true, duration:8000, action:{ label:t('ped.mark_have_short'), fn: ()=> pedidoMarcarTengo(o.id) } }); }
}
async function pedidoMarcarTengo(id){
  const o = pedidoById(id); if(!o) return;
  const ids = pedidoPiezas(o).filter(p=> p.possession!=='tengo').map(p=> p.id); if(!ids.length) return;
  const snap = bulkSnap(ids, false);
  ids.forEach(pid=> setPossessionOv(PRODUCTS_BY_ID[pid], 'tengo'));
  await persistOverrides(); buildProducts();
  if(isSheetKind('pedido')) pedidoRefresh('[data-fk="ped-del"]'); else await renderKeepFocus();
  showToast((ids.length===1 ? t('bulk.done_n1') : t('bulk.done_n').replace('{n}', ids.length)), { ok:true, replace:true, duration:7000, action:{ label:t('common.undo'), fn: async ()=>{ await bulkRestore(snap); if(isSheetKind('pedido')) pedidoRefresh(); } } });
}
/* Al salir de un pedido, la pieza se queda con su cambio (el del pedido) para poder calcularse sola */
function costeHeredar(pid, o){
  const p = PRODUCTS_BY_ID[pid]; if(!p || !o) return;
  const c = Object.assign({}, costeOf(p) || {});
  if(typeof c.cambio!=='number' && typeof o.cambio==='number'){ ['moneda', 'cambio', 'cambioFecha', 'cambioFuente', 'cambioPara', 'cambioA'].forEach(k=>{ if(o[k]!==undefined) c[k] = o[k]; }); if(o.pendiente) c.pendiente = true; }
  p.coste = c; if(!OVERRIDES.products[pid]) OVERRIDES.products[pid] = {}; OVERRIDES.products[pid].coste = c;
}
async function pedidoQuitar(oid, pid){
  const o = pedidoById(oid); if(!o) return;
  const before = (o.piezas || []).slice();
  costeHeredar(pid, o);
  o.piezas = before.filter(x=> x!==pid);
  await costeSyncPaid(before); await persistOverrides();
  if(isSheetKind('pedido')) pedidoRefresh('[data-fk="ped-add"]'); else await renderKeepFocus('[data-fk="cst-add-order"]');
  showToast(t('ped.removed'), { replace:true, action:{ label:t('common.undo'), fn: async ()=>{ const q = pedidoById(oid); if(!q) return; q.piezas = before; await costeSyncPaid(before); await persistOverrides(); if(isSheetKind('pedido')) pedidoRefresh(); else renderKeepFocus(); } } });
}
async function pedidoBorrar(oid){
  const o = pedidoById(oid); if(!o) return;
  if(!await showConfirmModal(t('ped.delete_q'), { okLabel:t('ped.delete'), danger:true })) return pedidoRefresh('[data-fk="ped-del"]');
  const prev = JSON.stringify(OVERRIDES.pedidos);
  (o.piezas || []).forEach(pid=> costeHeredar(pid, o));
  OVERRIDES.pedidos = pedidosList().filter(x=> x.id!==oid); if(!OVERRIDES.pedidos.length) delete OVERRIDES.pedidos;
  await costeSyncPaid(o.piezas || []); await persistOverrides();
  closeSheet();
  showToast(t('ped.deleted'), { replace:true, action:{ label:t('common.undo'), fn: async ()=>{ OVERRIDES.pedidos = JSON.parse(prev); await costeSyncPaid(o.piezas || []); await persistOverrides(); renderKeepFocus(); } } });
}
/* Añadir piezas a un pedido: un buscador con tus piezas (las que están en camino, reservadas o sin tener primero) */
let pedPickQ = '';
function pedidoAddPieces(oid){
  pedOpenId = oid; pedPickQ = '';
  openSheet({ kind:'pedido-add', title:t('ped.add_pieces'), body:pedidoPickBodyHTML(), foot:`<button type="button" class="btn primary" onclick="closeSheet()">${t('copy.done')}</button>`, focus:'#pedPickQ', onClose: ()=> openPedido(oid) });
}
function pedidoPickList(){
  const o = pedidoById(pedOpenId); const inside = new Set(o ? o.piezas : []);
  const tk = searchTokens(pedPickQ), rank = { en_camino:0, reservado:1, no:2 };
  return PRODUCTS.filter(p=> !inside.has(p.id) && productMatchesSearch(p, tk)).sort((a, b)=> ((rank[a.possession] ?? 3) - (rank[b.possession] ?? 3)) || compareNames(a.name, b.name)).slice(0, 30);
}
function pedidoPickBodyHTML(){
  return `${searchbarHTML({ id:'pedPickQ', placeholder:t('vb.search_ph'), value:pedPickQ, oninput:'pedPickQ=this.value; clearTimeout(window._ppT); window._ppT=setTimeout(pedidoPickRefresh,140)' })}
    <div id="pedPickRes">${pedidoPickResHTML()}</div>`;
}
function pedidoPickResHTML(){
  const list = pedidoPickList();
  return list.length ? `<ul class="dup-list ped-pick">${list.map(p=>{ const other = pedidoOf(p.id);
    return `<li><button type="button" class="dup-open" onclick="pedidoPick('${escapeHTML(p.id)}', this)"><b>${escapeHTML(p.name)}</b><small>${escapeHTML([p.platformName, possessionLabel(p.possession), other ? t('ped.in_other').replace('{s}', pedidoNombre(other)) : ''].filter(Boolean).join(' · '))}</small></button></li>`; }).join('')}</ul>` : `<p class="section-sub">${t('vb.no_match')}</p>`;
}
function pedidoPickRefresh(){ const r = document.getElementById('pedPickRes'); if(r) r.innerHTML = pedidoPickResHTML(); }
async function pedidoPick(pid, btn){
  const o = pedidoById(pedOpenId); if(!o) return;
  const old = pedidoOf(pid); if(old){ costeHeredar(pid, old); old.piezas = old.piezas.filter(x=> x!==pid); }
  o.piezas = (o.piezas || []).concat([pid]);
  const p = PRODUCTS_BY_ID[pid]; const c = Object.assign({}, costeOf(p) || {}, { moneda:o.moneda }); p.coste = c; if(!OVERRIDES.products[pid]) OVERRIDES.products[pid] = {}; OVERRIDES.products[pid].coste = c;
  await costeSyncPaid(o.piezas.concat(old ? old.piezas : [])); await persistOverrides();
  const li = btn && btn.closest('li'), next = li && (li.nextElementSibling || li.previousElementSibling);
  pedidoPickRefresh();
  const nb = next ? document.querySelector(`#pedPickRes button[onclick*="${CSS.escape(next.querySelector('button').getAttribute('onclick').split("'")[1])}"]`) : null;
  (nb || document.getElementById('pedPickQ')).focus({ preventScroll:true });
  showToast(t('ped.added').replace('{s}', p.name), { ok:true, replace:true });
}
/* Desde la ficha: añadir a un pedido (uno de los que están en curso, o uno nuevo) */
function pedidoElegir(pid){
  const list = pedidosList().filter(o=> !pedidoEntregado(o));
  if(!list.length) return pedidoCrear([pid]);
  openSheet({ kind:'pedido-pick', title:t('cst.add_order'), body:`<ul class="dup-list">${list.map(o=>`<li><button type="button" class="dup-open" onclick="pedidoMeter('${escapeHTML(o.id)}','${escapeHTML(pid)}')"><b>${escapeHTML(pedidoNombre(o))}</b><small>${escapeHTML(fmtCount((o.piezas || []).length, 'ped.pieces1', 'ped.pieces'))}</small></button></li>`).join('')}</ul>
    <button type="button" class="btn btn-sm" data-fk="ped-new" onclick="closeSheet(); pedidoCrear(['${escapeHTML(pid)}'])">${icon('plus')} ${t('ped.new')}</button>` });
}
async function pedidoMeter(oid, pid){
  pedOpenId = oid; closeSheet();
  await pedidoPick(pid, null);
  openPedido(oid);
}
/* Mis pedidos: los que están en curso arriba */
function openPedidos(){
  openSheet({ kind:'pedidos', title:t('ped.list_title'), body:pedidosBodyHTML(), foot:`<button type="button" class="btn primary" onclick="closeSheet()">${t('copy.done')}</button>`, onClose: ()=> renderKeepFocus() });
}
function pedidosBodyHTML(){
  const list = pedidosList().slice().sort((a, b)=> (pedidoEntregado(a) - pedidoEntregado(b)) || String(b.fecha || '').localeCompare(String(a.fecha || '')));
  const aj = buyAjustes(), pend = comprasPendientesN();
  return `${list.length ? `<ul class="dup-list ped-list">${list.map((o, i)=>{ const paso = pedidoPaso(o);
      return `<li><button type="button" class="dup-open" data-fk="ped-open-${i}" onclick="closeSheet(); openPedido('${escapeHTML(o.id)}')"><b>${escapeHTML(pedidoNombre(o))}</b><small>${escapeHTML([fmtCount((o.piezas || []).length, 'ped.pieces1', 'ped.pieces'), paso ? t('ped.step.' + paso) + (o.pasos[paso] ? ' · ' + o.pasos[paso] : '') : '', o.seguimiento || ''].filter(Boolean).join(' · '))}</small>${pedidoBarHTML(o)}</button></li>`; }).join('')}</ul>`
      : `<p class="section-sub">${t('ped.none')}</p>`}
    <button type="button" class="btn btn-sm" data-fk="ped-create" onclick="closeSheet(); pedidoCrear([])">${icon('plus')} ${t('ped.new')}</button>
    <h3 class="ped-h">${t('buy.settings')}</h3>
    <div class="field-grid"><div class="field"><label for="buyMon">${t('buy.usual')}</label><select id="buyMon" onchange="buyAjusteSet('moneda', this.value)">${BUY_CURRENCIES.map(k=>`<option value="${k}" ${k===aj.moneda ? 'selected' : ''}>${k} · ${escapeHTML(curSymbol(k))}</option>`).join('')}</select></div>
      <div class="field"><label for="buyFee">${t('buy.fee')}</label><input id="buyFee" type="text" inputmode="decimal" value="${aj.recargo || ''}" placeholder="0" onchange="buyAjusteSet('recargo', this.value, this)"></div></div>
    <p class="section-sub">${escapeHTML(t('buy.fee_note'))}</p>
    <p class="section-sub">${escapeHTML(t('buy.fx_note'))}</p>
    ${pend ? `<button type="button" class="btn btn-sm" data-fk="buy-pend" onclick="comprasPendientes(true)">${icon('refresh')} ${escapeHTML(t('buy.pending_btn').replace('{n}', pend))}</button>` : ''}`;
}
function pedidoBarHTML(o){
  const paso = pedidoPaso(o), i = paso ? ORDER_STEPS.indexOf(paso) + 1 : 0;
  return `<span class="ped-bar" aria-hidden="true">${ORDER_STEPS.map((s, j)=>`<span class="${j < i ? 'is-on' : ''}"></span>`).join('')}</span>`;
}
async function buyAjusteSet(k, v, input){
  const a = Object.assign({}, OVERRIDES.compraAjustes || {});
  if(k==='recargo'){ const n = numOrNull(v); if(Number.isNaN(n) || (n!==null && n > 50)){ if(input) input.setAttribute('aria-invalid', 'true'); showToast(t('cst.bad_number'), { replace:true }); return; } if(input) input.removeAttribute('aria-invalid'); a.recargo = n || 0; }
  else a.moneda = v;
  OVERRIDES.compraAjustes = a;
  // el recargo cambia el coste real de todo lo que está en otra moneda
  const ids = PRODUCTS.filter(p=> costeOf(p)).map(p=> p.id);
  await costeSyncPaid(ids); await persistOverrides();
  showToast(t('buy.saved'), { ok:true, replace:true });
}

/* ---------- Cambios pendientes: al arrancar y al volver la conexión ---------- */
function comprasPendientesN(){
  return PRODUCTS.filter(p=> costeOf(p) && p.coste.pendiente && !pedidoOf(p.id)).length + pedidosList().filter(o=> o.pendiente).length;
}
let _buyBusy = false;
async function comprasPendientes(manual){
  if(_buyBusy) return; _buyBusy = true;
  let done = 0, left = 0;
  try{
    for(const p of PRODUCTS){
      const c = costeOf(p); if(!c || !c.pendiente || pedidoOf(p.id)) continue;
      const cc = Object.assign({}, c); await fxEnsure(cc, compraFecha(p));
      p.coste = cc; if(!OVERRIDES.products[p.id]) OVERRIDES.products[p.id] = {}; OVERRIDES.products[p.id].coste = cc;
      if(cc.pendiente) left++; else { done++; await costeSyncPaid([p.id]); }
    }
    for(const o of pedidosList()){
      if(!o.pendiente) continue;
      await fxEnsure(o, o.fecha);
      if(o.pendiente) left++; else { done++; await costeSyncPaid(o.piezas || []); }
    }
    if(done) await persistOverrides();
  } finally { _buyBusy = false; }
  if(manual || done){
    if(done) showToast((done===1 ? t('buy.pending_done1') : t('buy.pending_done').replace('{n}', done)), { ok:true, replace:true });
    else if(manual && left) showToast(t('cst.fx_still'), { replace:true });
    if(isSheetKind('pedidos')) updateSheetBody(pedidosBodyHTML()); else if(done && !isSheetOpen() && !isModalOpen()) renderKeepFocus();
  }
}

/* ---------- Reservas ---------- */
function reservaOf(p){ return p && p.reserva && typeof p.reserva==='object' ? p.reserva : null; }
function reservaSectionHTML(p){
  const r = reservaOf(p) || {}, id = escapeHTML(p.id);
  if(p.possession!=='reservado' && !reservaOf(p)) return '';
  const days = r.salida ? Math.round((Date.parse(r.salida) - Date.parse(todayISO())) / 864e5) : null;
  const meta = r.salida ? (days > 1 ? t('res.in_days').replace('{n}', days) : days===1 ? t('res.in_day1') : days===0 ? t('res.today') : t('res.out')) : '';
  const body = `<div class="field-grid">
      <div class="field"><label for="res_salida_${id}">${t('res.date')}</label><input id="res_salida_${id}" type="date" value="${escapeHTML(r.salida || '')}" onchange="reservaSet('${id}','salida',this)"></div>
      <div class="field"><label for="res_tienda_${id}">${t('loan.store')}</label><input id="res_tienda_${id}" type="text" list="resStores" maxlength="80" autocomplete="off" value="${escapeHTML(r.tienda || '')}" onchange="reservaSet('${id}','tienda',this)"></div>
      <div class="field"><label for="res_senal_${id}">${t('res.deposit')} (${escapeHTML(currencySymbol())})</label><input id="res_senal_${id}" type="text" inputmode="decimal" value="${typeof r.senal==='number' ? r.senal : ''}" onchange="reservaSet('${id}','senal',this)"></div>
    </div>${storeDatalistHTML('resStores')}<p class="section-sub">${escapeHTML(t('res.note'))}</p>`;
  return disclosureHTML('reserva', t('res.title'), body, productSectionsOpen, escapeHTML(meta));
}
async function reservaSet(id, f, input){
  const p = PRODUCTS_BY_ID[id]; if(!p) return;
  const r = Object.assign({}, reservaOf(p) || {});
  if(f==='senal'){ const v = numOrNull(input.value); if(Number.isNaN(v)){ input.setAttribute('aria-invalid', 'true'); showToast(t('cst.bad_number'), { replace:true }); return; } input.removeAttribute('aria-invalid'); if(v===null) delete r.senal; else r.senal = v; }
  else if(f==='tienda'){ const v = storeCanonical(input.value); input.value = v; if(v) r.tienda = v; else delete r.tienda; if(v) storeRemember(v); }
  else { const v = String(input.value || '').trim(); if(v) r[f] = v; else delete r[f]; if(f==='salida') delete r.avisada; }
  const v = Object.keys(r).length ? r : null;
  p.reserva = v; await setProductField(id, 'reserva', v);
  // al poner una fecha de salida, si no la tenías, pasa a «Reservado»
  if(f==='salida' && v && v.salida && !['tengo', 'reservado', 'en_camino'].includes(p.possession)){ setPossessionOv(p, 'reservado'); await persistOverrides(); buildProducts(); }
  renderKeepFocus();
}
/* Al abrir la app: las reservas que ya han salido pasan a «En camino» */
async function reservasAlDia(){
  const hoy = todayISO();
  const list = PRODUCTS.filter(p=> p.possession==='reservado' && reservaOf(p) && p.reserva.salida && p.reserva.salida <= hoy && !p.reserva.avisada);
  if(!list.length) return;
  const snap = bulkSnap(list.map(p=> p.id), false);
  list.forEach(p=>{ setPossessionOv(p, 'en_camino'); const o = OVERRIDES.products[p.id]; o.reserva = Object.assign({}, p.reserva, { avisada: hoy }); });
  await persistOverrides(); buildProducts(); await renderKeepFocus();
  const msg = list.length===1 ? t('res.out_one').replace('{s}', list[0].name) : t('res.out_many').replace('{n}', list.length);
  showToast(msg, { ok:true, replace:true, duration:9000, action:{ label:t('common.undo'), fn: ()=> bulkRestore(snap) } });
}

/* ---------- Dashboard: «En camino» (pedidos en curso y próximas reservas) ---------- */
function dashBuyHTML(){
  const peds = pedidosList().filter(o=> !pedidoEntregado(o) && (o.piezas || []).length).sort((a, b)=> String(a.fecha || '').localeCompare(String(b.fecha || ''))).slice(0, 3);
  const hoy = todayISO();
  const res = PRODUCTS.filter(p=> p.possession==='reservado' && reservaOf(p) && p.reserva.salida).sort((a, b)=> a.reserva.salida.localeCompare(b.reserva.salida)).slice(0, 3);
  const loose = PRODUCTS.filter(p=> p.possession==='en_camino' && !pedidoOf(p.id)).length;
  if(!peds.length && !res.length && !loose) return '';
  return `<section class="vit-section dash-buy">${sectionTitleHTML(t('buy.dash_title'), `<button type="button" class="link-btn" data-fk="dash-peds" onclick="openPedidos()">${t('ped.list_title')}</button>`)}
    <div class="dash-buy-list">
      ${peds.map(o=>{ const paso = pedidoPaso(o), d = paso && o.pasos[paso] ? Math.max(0, Math.round((Date.parse(hoy) - Date.parse(o.pasos[paso])) / 864e5)) : null;
        return `<button type="button" class="db-row" onclick="openPedido('${escapeHTML(o.id)}')">${icon('box')}<span class="db-main"><b>${escapeHTML(pedidoNombre(o))}</b><small>${escapeHTML([fmtCount(o.piezas.length, 'ped.pieces1', 'ped.pieces'), paso ? t('ped.step.' + paso) + (d!==null ? ' · ' + (d===0 ? t('res.today') : (d===1 ? t('buy.days_ago1') : t('buy.days_ago').replace('{n}', d))) : '') : ''].filter(Boolean).join(' · '))}</small>${pedidoBarHTML(o)}</span>${icon('chevronRight')}</button>`; }).join('')}
      ${res.map(p=>{ const days = Math.round((Date.parse(p.reserva.salida) - Date.parse(hoy)) / 864e5);
        return `<button type="button" class="db-row" onclick="goProduct('${escapeHTML(p.id)}')">${icon('calendar')}<span class="db-main"><b>${escapeHTML(p.name)}</b><small>${escapeHTML(t('res.release').replace('{d}', p.reserva.salida) + ' · ' + (days > 1 ? t('res.in_days').replace('{n}', days) : days===1 ? t('res.in_day1') : days===0 ? t('res.today') : t('res.out')))}</small></span>${icon('chevronRight')}</button>`; }).join('')}
      ${loose ? `<button type="button" class="db-row" onclick="goInventory('en_camino')">${icon('shuffle')}<span class="db-main"><b>${escapeHTML(fmtCount(loose, 'buy.loose1', 'buy.loose'))}</b><small>${escapeHTML(t('buy.loose_sub'))}</small></span>${icon('chevronRight')}</button>` : ''}
    </div></section>`;
}

/* ---------- Al arrancar ---------- */
async function comprasAlArrancar(){
  try{ await reservasAlDia(); }catch(e){ console.warn(e); }
  // si la fecha de compra cambió (p. ej. desde otro dispositivo o una versión anterior), el cambio se vuelve a buscar
  const loc = localIso(); let marc = 0;
  PRODUCTS.forEach(p=>{ const c = costeOf(p); if(!c || pedidoOf(p.id) || c.cambioFuente!=='bce' || c.moneda===loc || c.pendiente) return;
    if(c.cambioPara!==(compraFecha(p) || 'hoy') || c.cambioA!==loc){ const cc = Object.assign({}, c, { pendiente:true }); p.coste = cc; if(!OVERRIDES.products[p.id]) OVERRIDES.products[p.id] = {}; OVERRIDES.products[p.id].coste = cc; marc++; } });
  pedidosList().forEach(o=>{ if(o.cambioFuente==='bce' && o.moneda!==loc && !o.pendiente && (o.cambioPara!==(o.fecha || 'hoy') || o.cambioA!==loc)){ o.pendiente = true; marc++; } });
  if(marc) await persistOverrides();
  if(comprasPendientesN() && navigator.onLine!==false) comprasPendientes(false);
}
window.addEventListener('online', ()=>{ if(typeof PRODUCTS!=='undefined' && PRODUCTS.length && comprasPendientesN()) comprasPendientes(false); });
