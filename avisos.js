/* =====================================================================
   v11.29 · AVISOS
   Lo que conviene mirar, en un solo sitio. No hay servidor: los avisos se
   calculan con la app abierta (al abrirla y cada media hora).
   - Copia de seguridad pendiente (lo mismo que el recordatorio del Dashboard).
   - Reservas que salen en los próximos 7 días.
   - Pedidos que tenían que haber llegado (fecha prevista pasada) o que llevan
     21 días o más en el mismo paso.
   - Préstamos de 60 días o más.
   Cada aviso tiene una clave con lo que lo provoca (la pieza y la fecha): si lo
   ocultas, no vuelve hasta que cambie (otra fecha, otro paso…). La copia vuelve
   a avisar a los 7 días.
   Datos: OVERRIDES.avisosOcultos = { clave: 'AAAA-MM-DD' } (va en la copia y
   se sincroniza). En este móvil (localStorage): si avisar al abrir, si avisar
   con notificaciones del sistema, y qué avisos ya se te han dicho.
   ===================================================================== */
const AVISO_DIAS = { reserva:7, parado:21, prestamo:60, copia:7 };
function avOcultos(){ return OVERRIDES.avisosOcultos && typeof OVERRIDES.avisosOcultos==='object' ? OVERRIDES.avisosOcultos : {}; }
function avLS(k, def){ try{ const v = localStorage.getItem('avisos:' + k); return v===null ? def : JSON.parse(v); }catch(e){ return def; } }
function avLSSet(k, v){ try{ localStorage.setItem('avisos:' + k, JSON.stringify(v)); }catch(e){} }
function avDias(iso){ const d = Math.round((Date.parse(iso) - Date.parse(todayISOAv())) / 864e5); return isNaN(d) ? null : d; }
function todayISOAv(){ return typeof todayISO==='function' ? todayISO() : new Date().toISOString().slice(0, 10); }
function avFecha(f){ return typeof histFmtDate==='function' ? histFmtDate(f) : f; }
function avDaysTxt(n){ return n===1 ? t('av.day1') : t('av.days').replace('{n}', n.toLocaleString(numLocale())); }
/* Todos los avisos de ahora, ocultos incluidos (con .oculto) */
function avisosAll(){
  const out = [], hoy = todayISOAv(), oc = avOcultos();
  if(typeof PRODUCTS==='undefined' || !PRODUCTS.length) return out;
  // 1. Copia de seguridad
  const bd = daysSince(APP_META.lastFullBackupAt);
  if(bd===null || bd >= BACKUP_REMINDER_DAYS){
    out.push({ key:'copia', kind:'copia', ico:'archive', go:"goPage('backup')", goLabel:t('backup.reminder.cta'),
      text: bd===null ? t('backup.reminder.never') : t('backup.reminder.days').replace('{n}', bd), sub:t('av.copia_sub') });
  }
  // 2. Reservas que salen pronto
  PRODUCTS.filter(p=> p.possession==='reservado' && p.reserva && typeof p.reserva==='object' && p.reserva.salida).forEach(p=>{
    const d = avDias(p.reserva.salida); if(d===null || d < 0 || d > AVISO_DIAS.reserva) return;
    out.push({ key:'reserva:' + p.id + ':' + p.reserva.salida, kind:'reserva', ico:'calendar', go:`goProduct('${escapeHTML(p.id)}')`, goLabel:t('av.see_piece'),
      text: (d===0 ? t('av.res_today') : t('av.res_in').replace('{d}', avDaysTxt(d))).replace('{s}', p.name),
      sub: [avFecha(p.reserva.salida), p.reserva.tienda].filter(Boolean).join(' · '), when:p.reserva.salida });
  });
  // 3. Pedidos: llegada prevista pasada, o parados
  if(typeof pedidosList==='function') pedidosList().filter(o=> !pedidoEntregado(o) && (o.piezas || []).length).forEach(o=>{
    const nm = pedidoNombre(o), paso = pedidoPaso(o), desde = paso && o.pasos[paso];
    if(o.estimada && /^\d{4}-\d{2}-\d{2}$/.test(o.estimada) && avDias(o.estimada) < 0){
      out.push({ key:'llegada:' + o.id + ':' + o.estimada, kind:'llegada', ico:'box', go:`openPedido('${escapeHTML(o.id)}')`, goLabel:t('av.see_order'),
        text: t('av.late').replace('{s}', nm), sub: t('av.late_sub').replace('{d}', avFecha(o.estimada)) + (paso ? ' · ' + t('ped.step.' + paso) : ''), when:o.estimada });
      return;
    }
    if(desde){ const d = -avDias(desde);
      if(d >= AVISO_DIAS.parado) out.push({ key:'parado:' + o.id + ':' + paso + ':' + desde, kind:'parado', ico:'box', go:`openPedido('${escapeHTML(o.id)}')`, goLabel:t('av.see_order'),
        text: t('av.stuck').replace('{s}', nm).replace('{d}', avDaysTxt(d)).replace('{p}', t('ped.step.' + paso)), sub: t('av.stuck_sub'), when:desde });
    }
  });
  // 4. Préstamos largos
  PRODUCTS.filter(p=> typeof isLoaned==='function' && isLoaned(p) && /^\d{4}-\d{2}-\d{2}/.test(p.prestamo.desde || '')).forEach(p=>{
    const d = -avDias(p.prestamo.desde.slice(0, 10)); if(d < AVISO_DIAS.prestamo) return;
    out.push({ key:'prestamo:' + p.id + ':' + p.prestamo.desde.slice(0, 10), kind:'prestamo', ico:'loan', go:`goProduct('${escapeHTML(p.id)}')`, goLabel:t('av.see_piece'),
      text: t('av.loan').replace('{s}', p.name).replace('{d}', avDaysTxt(d)).replace('{a}', p.prestamo.a), sub: t('av.loan_sub').replace('{d}', avFecha(p.prestamo.desde.slice(0, 10))), when:p.prestamo.desde });
  });
  out.forEach(a=>{ const h = oc[a.key]; a.oculto = !!h && !(a.kind==='copia' && (daysSince(h) || 0) >= AVISO_DIAS.copia); });
  return out;
}
function avisosList(){ return avisosAll().filter(a=> !a.oculto); }
function avisosN(){ try{ return avisosList().length; }catch(e){ return 0; } }

/* ---------- Ocultar / volver a mostrar ---------- */
async function avisoOcultar(key){
  const oc = Object.assign({}, avOcultos()); oc[key] = todayISOAv();
  // limpieza: lo oculto hace más de 180 días ya no hace falta
  Object.keys(oc).forEach(k=>{ if((daysSince(oc[k]) || 0) > 180) delete oc[k]; });
  OVERRIDES.avisosOcultos = oc; await persistOverrides();
  avisosRefresh();
  showToast(t('av.hidden'), { replace:true, action:{ label:t('common.undo'), fn: ()=> avisoMostrar(key, true) } });
}
async function avisoMostrar(key, quiet){
  const oc = Object.assign({}, avOcultos()); delete oc[key];
  OVERRIDES.avisosOcultos = oc; await persistOverrides();
  avisosRefresh();
  if(!quiet) showToast(t('av.shown'), { ok:true, replace:true });
}
function avisosRefresh(){
  if(typeof isSheetKind==='function' && isSheetKind('avisos')) updateSheetBody(avisosBodyHTML());
  else renderKeepFocus();
}

/* ---------- En el Dashboard ---------- */
function avisosDashHTML(){
  const list = avisosList().filter(a=> a.kind!=='copia');   // la copia ya tiene su línea arriba
  if(!list.length) return '';
  const show = list.slice(0, 3);
  return `<section class="vit-section dash-av" aria-labelledby="dashAvT">${sectionTitleHTML(`<span id="dashAvT">${t('av.title')}</span>`, `<button type="button" class="link-btn" data-fk="dash-av" onclick="openAvisos()">${list.length > show.length ? escapeHTML(t('av.see_all').replace('{n}', list.length)) : t('av.manage')}</button>`)}
    <div class="dash-buy-list">${show.map(a=> `<button type="button" class="db-row" onclick="${a.go}">${icon(a.ico)}<span class="db-main"><b>${escapeHTML(a.text)}</b>${a.sub ? `<small>${escapeHTML(a.sub)}</small>` : ''}</span>${icon('chevronRight')}</button>`).join('')}</div></section>`;
}

/* ---------- La hoja de avisos ---------- */
function openAvisos(){
  openSheet({ kind:'avisos', title:t('av.title'), body:avisosBodyHTML(), foot:`<button type="button" class="btn primary" onclick="closeSheet()">${t('copy.done')}</button>`, onClose: ()=> renderKeepFocus() });
}
function avisosBodyHTML(){
  const all = avisosAll(), vis = all.filter(a=> !a.oculto), hid = all.filter(a=> a.oculto);
  const row = (a, i, hidden)=> `<li class="av-item is-${a.kind}">${icon(a.ico)}<div class="av-main"><b>${escapeHTML(a.text)}</b>${a.sub ? `<small>${escapeHTML(a.sub)}</small>` : ''}
      <div class="av-acts"><button type="button" class="btn btn-sm" data-fk="av-go-${hidden ? 'h' : ''}${i}" onclick="closeSheet(); ${a.go}">${escapeHTML(a.goLabel)}</button>
      ${hidden ? `<button type="button" class="btn btn-sm btn-ghost" data-fk="av-show-${i}" onclick="avisoMostrar('${escapeHTML(a.key)}')">${t('av.show')}</button>`
               : `<button type="button" class="btn btn-sm btn-ghost" data-fk="av-hide-${i}" onclick="avisoOcultar('${escapeHTML(a.key)}')" aria-label="${escapeHTML(t('av.hide') + ': ' + a.text)}">${t('av.hide')}</button>`}</div></div></li>`;
  const alAbrir = avLS('alAbrir', true), sys = avLS('sistema', false), can = 'Notification' in window;
  const perm = can ? Notification.permission : 'unsupported';
  return `${vis.length ? `<ul class="av-list">${vis.map((a, i)=> row(a, i, false)).join('')}</ul>` : `<p class="av-empty">${icon('checkCircle')} ${t('av.none')}</p>`}
    ${hid.length ? disclosureHTML('av-ocultos', t('av.hidden_title'), `<ul class="av-list">${hid.map((a, i)=> row(a, i, true)).join('')}</ul>`, productSectionsOpen, String(hid.length)) : ''}
    <h3 class="ped-h">${t('av.settings')}</h3>
    <label class="av-check"><input type="checkbox" data-fk="av-open" ${alAbrir ? 'checked' : ''} onchange="avLSSet('alAbrir', this.checked)"> <span>${t('av.on_open')}</span></label>
    ${can ? `<label class="av-check"><input type="checkbox" data-fk="av-sys" ${sys && perm==='granted' ? 'checked' : ''} ${perm==='denied' ? 'disabled' : ''} onchange="avisosSistema(this)"> <span>${t('av.system')}</span></label>
      <p class="section-sub">${escapeHTML(perm==='denied' ? t('av.system_denied') : t('av.system_note'))}</p>` : ''}
    <p class="section-sub">${escapeHTML(t('av.note'))}</p>`;
}
async function avisosSistema(cb){
  if(!cb.checked){ avLSSet('sistema', false); return; }
  let p = Notification.permission;
  if(p==='default'){ try{ p = await Notification.requestPermission(); }catch(e){ p = 'denied'; } }
  avLSSet('sistema', p==='granted');
  if(p!=='granted'){ cb.checked = false; showToast(t('av.system_denied'), { replace:true }); }
  else { avLSSet('notificados', avisosList().map(a=> a.key)); showToast(t('av.system_on'), { ok:true, replace:true }); }
  if(isSheetKind('avisos')) updateSheetBody(avisosBodyHTML());
}

/* ---------- Al abrir la app y cada media hora ---------- */
function avisosAlArrancar(){
  try{
    // la copia pendiente ya tiene su línea en el Dashboard: al abrir no se repite
    const list = avisosList().filter(a=> a.kind!=='copia'), dichos = new Set(avLS('dichos', []));
    const nuevos = list.filter(a=> !dichos.has(a.key));
    avLSSet('dichos', list.map(a=> a.key));   // solo lo que sigue vigente
    if(nuevos.length && avLS('alAbrir', true)){
      const msg = nuevos.length===1 ? nuevos[0].text : t('av.new_many').replace('{n}', nuevos.length);
      showToast(msg, { duration:9000, action:{ label:t('av.see'), fn: ()=> openAvisos() } });
    }
  }catch(e){ console.warn(e); }
  avisosNotificar();
}
async function avisosNotificar(){
  try{
    if(!avLS('sistema', false) || !('Notification' in window) || Notification.permission!=='granted' || !document.hidden) return;
    const list = avisosList(), ya = new Set(avLS('notificados', []));
    const nuevos = list.filter(a=> !ya.has(a.key));
    avLSSet('notificados', list.map(a=> a.key));
    if(!nuevos.length) return;
    const title = 'La Colección App', body = nuevos.length===1 ? nuevos[0].text : t('av.new_many').replace('{n}', nuevos.length);
    const opts = { body, tag:'avisos', icon:'icon-192.png', badge:'icon-192.png', data:{ avisos:true } };
    const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
    if(reg && reg.showNotification) await reg.showNotification(title, opts); else new Notification(title, opts);
  }catch(e){ console.warn(e); }
}
setInterval(()=>{ if(typeof PRODUCTS!=='undefined' && PRODUCTS.length) avisosNotificar(); }, 30 * 60 * 1000);
/* Al tocar la notificación, el service worker trae la app delante y pide abrir los avisos */
if(navigator.serviceWorker) navigator.serviceWorker.addEventListener('message', (e)=>{ if(e.data && e.data.type==='open-avisos') openAvisos(); });
