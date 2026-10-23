/* ==========================================================================
   v11.28 · Para disfrutarla
   - Logros (idea 32): medallas por lo que vas consiguiendo (piezas, precintadas,
     fotos, plataformas y años completos, Japón, valor, gradeadas, descripciones…)
     con una pequeña celebración al conseguir una.
   - Mapa de procedencia (idea 34): de dónde son tus piezas y dónde las compraste,
     dibujado dentro de la app (funciona sin conexión).
   - Calendario de altas (idea 37): un mapa de calor de los días en que añadiste piezas.
   - Checklist imprimible (idea 38): de una plataforma, una colección o lo que
     ves en el Inventario, con lo que tienes marcado; «Imprimir → Guardar como PDF».
   - Visita guiada (idea 40): la estantería en modo museo, balda a balda, con la
     cartela de cada pieza (foto, datos y su descripción).
   Datos nuevos: arriba `logros` (la fecha en que conseguiste cada uno).
   ========================================================================== */

/* ---------- Logros ---------- */
function lgOwned(){ return PRODUCTS.filter(p=> p.possession==='tengo'); }
const LOGRO_FAMS = [
  { k:'piezas', ico:'collection', tiers:[25, 50, 100, 250, 500, 1000], val:()=> lgOwned().length },
  { k:'precinto', ico:'shield', tiers:[5, 10, 25, 50, 100], val:()=> lgOwned().filter(p=> shownSealed(p)).length },
  { k:'fotos', ico:'camera', tiers:[25, 50, 100, 250, 500], val:()=> lgOwned().filter(p=> hasPhoto(shownPhotoId(p), 'front')).length },
  { k:'japon', ico:'globe', tiers:[10, 25, 50, 100, 200], val:()=> lgOwned().filter(p=> regionKeysFor(p).some(r=> r.code==='jp')).length },
  { k:'plataformas', ico:'checkCircle', tiers:[1, 3, 5, 10, 20], val:()=> statsByPlatform().filter(s=> s.total >= 3 && s.missing===0).length },
  { k:'anios', ico:'calendar', tiers:[1, 3, 5, 10], val:()=> lgYearsComplete() },
  { k:'valor', ico:'coins', tiers:[500, 1000, 2500, 5000, 10000], val:()=> computeGlobalStats().valor || 0, money:true },
  { k:'descripciones', ico:'book', tiers:[25, 100, 250], val:()=> lgOwned().filter(p=> String(p.summary || '').trim().length > 40).length },
  { k:'gradeadas', ico:'crown', tiers:[1, 3, 10], val:()=> typeof gradeoOf==='function' ? lgOwned().filter(gradeoOf).length : 0 },
  { k:'colecciones', ico:'target', tiers:[1, 3], val:()=> typeof coleccionesList==='function' ? coleccionesList().filter(c=>{ const s = coleccionStats(c); return s.total >= 2 && s.have===s.total; }).length : 0 },
];
function lgYearsComplete(){
  const m = new Map();
  allEditionsForStats().forEach(({ product:p })=>{ const y = parseInt(p.year, 10); if(!y) return; const e = m.get(y) || { t:0, h:0 }; e.t++; if(p.possession==='tengo') e.h++; m.set(y, e); });
  return [...m.values()].filter(e=> e.t >= 3 && e.h===e.t).length;
}
function logrosStored(){ return OVERRIDES.logros && typeof OVERRIDES.logros==='object' ? OVERRIDES.logros : {}; }
function logrosEstado(){
  return LOGRO_FAMS.map(f=>{ let v = 0; try{ v = f.val() || 0; }catch(e){ v = 0; }
    const got = f.tiers.filter(n=> v >= n), next = f.tiers.find(n=> v < n);
    return Object.assign({}, f, { v, got, next }); });
}
function logroKey(f, n){ return f.k + '_' + n; }
function logroName(f, n){ return t('lg.' + f.k + (n===1 && ['plataformas', 'anios', 'gradeadas', 'colecciones'].includes(f.k) ? '1' : '')).replace('{n}', f.money ? fmtMoney(n) : n.toLocaleString(numLocale())); }
let _lgT = null, _lgBusy = false;
function logrosSoon(){ clearTimeout(_lgT); _lgT = setTimeout(logrosCheck, 1200); }
async function logrosCheck(){
  if(_lgBusy || typeof PRODUCTS==='undefined' || !PRODUCTS.length) return;
  _lgBusy = true;
  try{
    const first = !OVERRIDES.logros, st = logrosStored(), nuevos = [], hoy = typeof todayISO==='function' ? todayISO() : new Date().toISOString().slice(0, 10);
    logrosEstado().forEach(f=> f.got.forEach(n=>{ const k = logroKey(f, n); if(!Object.prototype.hasOwnProperty.call(st, k)) nuevos.push({ f, n, k }); }));
    if(!nuevos.length){ if(first && PRODUCTS.length){ OVERRIDES.logros = {}; } return; }
    const out = Object.assign({}, st); nuevos.forEach(x=>{ out[x.k] = first ? '' : hoy; });   // (los que ya tenías al estrenar los logros, sin fecha)
    OVERRIDES.logros = out;
    await persistOverridesQuiet();
    if(first) return showToast(t('lg.first').replace('{n}', nuevos.length), { ok:true, replace:true, duration:7000, action:{ label:t('lg.see'), fn: ()=> logrosOpen() } });
    const best = nuevos[nuevos.length - 1];
    logroCelebrar(nuevos.length===1 ? logroName(best.f, best.n) : t('lg.many').replace('{n}', nuevos.length));
  } finally { _lgBusy = false; }
}
/* guardar sin volver a lanzar la comprobación (evita bucles) */
async function persistOverridesQuiet(){ _lgQuiet = true; try{ await persistOverrides(); } finally { _lgQuiet = false; } }
let _lgQuiet = false;
function logroCelebrar(txt){
  showToast(t('lg.got').replace('{s}', txt), { ok:true, replace:true, duration:7000, action:{ label:t('lg.see'), fn: ()=> logrosOpen() } });
  if(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const box = document.createElement('div'); box.className = 'lg-confetti'; box.setAttribute('aria-hidden', 'true');
  const cols = ['var(--ok)', 'var(--gold)', 'var(--accent)', '#5aa9d6', '#e2b93b'];
  box.innerHTML = Array.from({ length:28 }, (_, i)=> `<i style="--x:${(i * 37) % 100}vw;--d:${(i % 7) * 60}ms;--r:${(i * 53) % 360}deg;--c:${cols[i % cols.length]}"></i>`).join('');
  document.body.appendChild(box); setTimeout(()=> box.remove(), 2600);
}
function logrosOpen(){ goPage('estadisticas'); setTimeout(()=>{ const s = document.getElementById('lgSection'); if(s){ s.scrollIntoView({ block:'start' }); const b = s.querySelector('button, [tabindex]'); if(b) b.focus({ preventScroll:true }); } }, 350); }
function logrosSectionHTML(){
  const est = logrosEstado(), st = logrosStored();
  const total = est.reduce((s, f)=> s + f.tiers.length, 0), got = est.reduce((s, f)=> s + f.got.length, 0);
  return `<section class="vit-section lg-section" id="lgSection">${sectionTitleHTML(t('lg.title'), t('lg.count').replace('{n}', got).replace('{t}', total))}
    <div class="lg-grid">${est.map(f=>{ const top = f.got.length ? f.got[f.got.length - 1] : null, nx = f.next;
      const pct = nx ? Math.min(100, Math.round(f.v / nx * 100)) : 100;
      const when = top && st[logroKey(f, top)] ? t('lg.when').replace('{d}', st[logroKey(f, top)]) : '';
      const label = (top ? logroName(f, top) : t('lg.none_yet')) + (nx ? ' · ' + t('lg.next').replace('{s}', logroName(f, nx)).replace('{v}', f.money ? fmtMoney(f.v) : f.v.toLocaleString(numLocale())) : ' · ' + t('lg.all'));
      return `<div class="lg-card ${top ? 'is-got' : ''}" role="group" aria-label="${escapeHTML(t('lg.fam.' + f.k) + ': ' + label)}">
        <span class="lg-medal" aria-hidden="true">${icon(f.ico)}<b>${f.got.length}/${f.tiers.length}</b></span>
        <span class="lg-txt"><b>${escapeHTML(t('lg.fam.' + f.k))}</b><small>${escapeHTML(top ? logroName(f, top) : t('lg.none_yet'))}${when ? ' · ' + escapeHTML(when) : ''}</small>
          ${nx ? `<span class="lg-bar" aria-hidden="true"><span style="width:${pct}%"></span></span><small>${escapeHTML(t('lg.next').replace('{s}', logroName(f, nx)).replace('{v}', f.money ? fmtMoney(f.v) : f.v.toLocaleString(numLocale())))}</small>` : `<small>${escapeHTML(t('lg.all'))}</small>`}</span></div>`; }).join('')}</div></section>`;
}

/* ---------- Mapa de procedencia ---------- */
const MAP_LAND = {
  na:[[-168,66],[-156,71],[-130,70],[-110,73],[-95,72],[-80,73],[-75,63],[-64,60],[-56,52],[-60,46],[-67,44],[-70,41],[-76,35],[-81,31],[-80,25],[-83,29],[-90,30],[-97,27],[-97,21],[-92,18],[-88,21],[-87,16],[-83,10],[-78,8],[-80,7],[-86,11],[-92,14],[-105,20],[-110,24],[-115,30],[-118,34],[-124,40],[-124,48],[-133,55],[-140,60],[-150,61],[-158,58],[-165,60]],
  gl:[[-55,60],[-43,60],[-20,70],[-18,77],[-30,83],[-60,82],[-72,78],[-58,70]],
  sa:[[-80,8],[-72,12],[-60,10],[-50,0],[-35,-6],[-39,-15],[-48,-25],[-58,-35],[-65,-42],[-68,-55],[-74,-50],[-72,-38],[-71,-30],[-76,-15],[-81,-5]],
  eu:[[-10,36],[-9,43],[-2,44],[-5,48],[3,51],[8,54],[10,57],[5,58],[8,63],[14,68],[22,71],[30,70],[40,68],[45,60],[40,48],[30,45],[27,41],[24,38],[18,40],[13,45],[12,38],[8,44],[3,43],[-2,36]],
  uk:[[-6,50],[1,51],[-2,56],[-5,58],[-6,55]],
  af:[[-17,21],[-10,30],[-5,36],[10,37],[20,32],[32,31],[35,28],[43,12],[51,12],[42,-2],[40,-15],[35,-25],[20,-35],[17,-29],[12,-17],[9,-1],[5,5],[-8,4],[-15,10]],
  as:[[26,41],[36,36],[35,32],[44,13],[52,15],[58,22],[62,25],[67,24],[72,20],[77,8],[80,15],[88,22],[92,21],[98,16],[100,3],[104,1],[104,10],[109,12],[108,21],[118,24],[122,31],[120,37],[126,38],[129,35],[130,43],[141,46],[143,52],[140,57],[155,58],[162,61],[178,65],[180,70],[160,71],[140,73],[110,77],[90,76],[70,73],[60,69],[50,68],[40,66],[45,60],[40,48],[30,45]],
  jp:[[130,31],[133,34],[136,34],[140,35],[141,38],[142,40],[140,41],[141,43],[145,44],[142,45],[140,42],[139,38],[136,36],[131,34]],
  au:[[114,-22],[122,-18],[130,-12],[137,-12],[142,-11],[146,-19],[153,-26],[150,-37],[141,-38],[131,-31],[115,-34]],
};
const MAP_PTS = { us:[-98,39], eu:[30,57], es:[-6,38], cn:[104,35], jp:[138,36] };
const STORE_COUNTRY = { 'buyee':'jp', 'yahoo! auctions':'jp', 'mercari':'jp', 'suruga-ya':'jp', 'mandarake':'jp', 'wallapop':'es', 'todocoleccion':'es', 'cex':'es', 'game':'es', 'vinted':'eu' };
function mapXY(lon, lat){ return [((lon + 180) / 360 * 360).toFixed(1), ((90 - lat) / 180 * 180).toFixed(1)]; }
let mapMode = 'origen';
function mapCounts(mode){
  const own = lgOwned(), m = {}, other = { n:0 };
  if(mode==='origen'){
    own.forEach(p=>{ const ks = regionKeysFor(p).map(r=> r.code).filter(c=> c && MAP_PTS[c]); if(!ks.length){ other.n++; return; } ks.forEach(c=> m[c] = (m[c] || 0) + 1); });
  } else {
    own.forEach(p=>{
      let c = null;
      const st = p.compra && p.compra.tienda ? normText(p.compra.tienda).trim() : '';
      if(st && STORE_COUNTRY[st]) c = STORE_COUNTRY[st];
      else if(st && /fisica|tienda/.test(st)) c = 'es';
      else if(typeof pedidoOf==='function' && pedidoOf(p.id) && pedidoOf(p.id).moneda==='JPY') c = 'jp';
      else if(p.coste && p.coste.moneda==='JPY') c = 'jp';
      else if(p.coste && p.coste.moneda==='USD') c = 'us';
      if(c) m[c] = (m[c] || 0) + 1; else other.n++;
    });
  }
  return { m, other:other.n, total: own.length };
}
function mapSectionHTML(){
  const { m, other, total } = mapCounts(mapMode);
  if(!total) return '';
  const max = Math.max(1, ...Object.values(m));
  const land = Object.values(MAP_LAND).map(poly=> `<path d="M${poly.map(([a, b])=> mapXY(a, b).join(' ')).join('L')}Z"/>`).join('');
  const bub = Object.keys(MAP_PTS).filter(k=> m[k]).sort((a, b)=> m[b] - m[a]).map(k=>{ const [x, y] = mapXY(...MAP_PTS[k]); const r = 5 + Math.sqrt(m[k] / max) * 22;
    return `<g class="map-b"><circle cx="${x}" cy="${y}" r="${r.toFixed(1)}"/><text x="${x}" y="${(+y + 4).toFixed(1)}">${m[k]}</text><text class="map-l" x="${x}" y="${(+y - r - 4).toFixed(1)}">${escapeHTML(REGION_CODES[k] || k)}</text></g>`; }).join('');
  const rows = Object.keys(MAP_PTS).filter(k=> m[k]).sort((a, b)=> m[b] - m[a]).map(k=> barRowHTML(t('region.' + k), m[k], total, Math.round(m[k] / total * 100))).join('')
    + (other ? barRowHTML(t(mapMode==='origen' ? 'map.no_region' : 'map.unknown'), other, total, Math.round(other / total * 100)) : '');
  const label = t('map.aria').replace('{s}', Object.keys(m).sort((a, b)=> m[b] - m[a]).map(k=> t('region.' + k) + ' ' + m[k]).join(', '));
  const chip = (k)=> `<button type="button" class="chip ${mapMode===k ? 'active' : ''}" aria-pressed="${mapMode===k}" data-fk="map-${k}" onclick="mapMode='${k}'; renderKeepFocus()">${t('map.mode_' + k)}</button>`;
  return `<section class="vit-section map-section">${sectionTitleHTML(t('map.title'))}
    <div class="chip-row" role="group" aria-label="${escapeHTML(t('map.title'))}">${chip('origen')}${chip('compra')}</div>
    <figure class="map-fig"><svg viewBox="0 0 360 180" role="img" aria-label="${escapeHTML(label)}"><g class="map-land">${land}</g>${bub}</svg></figure>
    <div class="map-rows">${rows}</div>
    <p class="section-sub">${escapeHTML(t(mapMode==='origen' ? 'map.note_origin' : 'map.note_buy'))}</p></section>`;
}

/* ---------- Calendario de altas ---------- */
function altaFecha(p){ return (p.alta && /^\d{4}-\d{2}-\d{2}/.test(p.alta) ? p.alta : (p.compra && /^\d{4}-\d{2}-\d{2}$/.test(p.compra.fecha || '') ? p.compra.fecha : '')).slice(0, 10); }
function calSectionHTML(){
  const counts = new Map(); PRODUCTS.forEach(p=>{ const f = altaFecha(p); if(f) counts.set(f, (counts.get(f) || 0) + 1); });
  if(!counts.size) return '';
  const today = new Date(); today.setHours(12, 0, 0, 0);
  const start = new Date(today); start.setDate(start.getDate() - 52 * 7 - ((today.getDay() + 6) % 7));   // lunes de hace 52 semanas
  const iso = (d)=> d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  let cells = '', months = '', n = 0, days = 0, best = null, lastM = -1;
  for(let w = 0; w < 53; w++){
    for(let d = 0; d < 7; d++){
      const day = new Date(start); day.setDate(start.getDate() + w * 7 + d); if(day > today) continue;
      const k = iso(day), c = counts.get(k) || 0; n += c; if(c) days++; if(c && (!best || c > best.c)) best = { k, c };
      const lv = c===0 ? 0 : c===1 ? 1 : c <= 3 ? 2 : c <= 6 ? 3 : 4;
      cells += `<rect x="${w * 11}" y="${d * 11 + 12}" width="9" height="9" rx="2" class="cal-l${lv}"><title>${escapeHTML(histFmtDate ? histFmtDate(k) : k)}: ${c}</title></rect>`;
      if(d===0 && day.getMonth()!==lastM){ lastM = day.getMonth(); months += `<text x="${w * 11}" y="8">${escapeHTML(day.toLocaleDateString(numLocale(), { month:'short' }))}</text>`; }
    }
  }
  const sum = t('cal.sum').replace('{n}', n).replace('{d}', days) + (best && best.c > 1 ? ' ' + t('cal.best').replace('{d}', histFmtDate(best.k)).replace('{n}', best.c) : '');
  return `<section class="vit-section cal-section">${sectionTitleHTML(t('cal.title'), t('cal.last_year'))}
    <div class="cal-scroll"><svg class="cal-svg" viewBox="0 0 ${53 * 11} ${7 * 11 + 12}" width="${53 * 11}" height="${7 * 11 + 12}" role="img" aria-label="${escapeHTML(t('cal.title') + ': ' + sum)}">${months}${cells}</svg></div>
    <p class="section-sub">${escapeHTML(sum)}</p><p class="section-sub">${escapeHTML(t('cal.note'))}</p></section>`;
}

/* ---------- Checklist imprimible ---------- */
function printChecklist(list, title){
  const byPlat = new Map(); sortGames(list.slice()).forEach(p=>{ const k = p.platformName || '—'; if(!byPlat.has(k)) byPlat.set(k, []); byPlat.get(k).push(p); });
  const have = list.filter(p=> p.possession==='tengo').length;
  let body = `<h1>${escapeHTML(title)}</h1><div class="sub">${escapeHTML(t('chk.sub').replace('{h}', have).replace('{t}', list.length))} — ${escapeHTML(new Date().toLocaleDateString(numLocale()))}</div>`;
  byPlat.forEach((ps, plat)=>{
    const h = ps.filter(p=> p.possession==='tengo').length;
    body += `<h2>${escapeHTML(plat)} <small>${h}/${ps.length}</small></h2><ul>`;
    ps.forEach(p=>{ const on = p.possession==='tengo';
      body += `<li class="${on ? 'on' : ''}"><span class="box">${on ? '✓' : ''}</span><span class="nm">${escapeHTML(p.name)}</span><span class="meta">${escapeHTML([p.year, regionShortText(p), on && shownSealed(p) ? t('dash.sealed') : ''].filter(Boolean).join(' · '))}</span></li>`; });
    body += `</ul>`;
  });
  const w = window.open('', '_blank');
  if(!w){ showToast(t('inv.print_blocked')); return; }
  w.document.write(`<!DOCTYPE html><html lang="${OVERRIDES.lang || 'es'}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHTML(title)}</title><style>
    body{font-family:Georgia,serif;padding:24px;color:#222;max-width:760px;margin:0 auto;}
    h1{font-size:22px;margin:0 0 4px;} .sub{color:#666;font-size:12px;margin-bottom:20px;}
    h2{font-size:15px;margin:22px 0 6px;border-bottom:1px solid #ccc;padding-bottom:4px;display:flex;justify-content:space-between;} h2 small{font-weight:normal;color:#666;}
    ul{list-style:none;padding:0;margin:0;columns:2;column-gap:28px;} li{break-inside:avoid;padding:4px 0;font-size:12.5px;display:flex;align-items:baseline;gap:7px;}
    .box{width:12px;height:12px;border:1.5px solid #444;border-radius:3px;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;font-size:10px;line-height:1;}
    li.on .box{background:#222;color:#fff;} .nm{flex:1 1 auto;} .meta{color:#777;font-size:10.5px;white-space:nowrap;}
    @media (max-width:560px){ ul{columns:1;} } @media print{ body{padding:0;} }
  </style></head><body>${body}</body></html>`);
  w.document.close(); w.focus(); setTimeout(()=> w.print(), 300);
}
function printPlatformChecklist(platId){ const pl = getAllPlatforms().find(x=> x.id===platId); printChecklist(PRODUCTS.filter(p=> p.platformId===platId), t('chk.title').replace('{s}', pl ? pl.name : '')); }
function printInventoryChecklist(){ printChecklist(_invOrder.slice(), t('chk.title').replace('{s}', t('inv.title'))); }
function printColeccionChecklist(id){ const c = coleccionesList().find(x=> x.id===id); if(!c) return; printChecklist(inventoryFilteredEditions(coleccionState(c)).map(x=> x.product), t('chk.title').replace('{s}', c.nombre)); }

/* ---------- Visita guiada ---------- */
let VISITA = null;
function visitaStops(scopeMid){
  const out = [], E = estData();
  E.muebles.forEach(m=>{
    if(m.isFloor || (scopeMid && m.id!==scopeMid)) return;
    estSurfaceIds(m).forEach(sid=>{
      const sf = estSurface(m, sid); if(!sf) return;
      const ps = sf.items.map(it=> PRODUCTS_BY_ID[it.pid]).filter(p=> p && p.possession==='tengo');
      // las destacadas: con descripción primero, luego con foto; hasta 3 por balda (todas si es un solo mueble)
      const rank = (p)=> (String(p.summary || '').trim() ? 0 : 2) + (hasPhoto(shownPhotoId(p), 'front') ? 0 : 1);
      const pick = ps.slice().sort((a, b)=> rank(a) - rank(b)).slice(0, scopeMid ? 99 : 3);
      ps.filter(p=> pick.includes(p)).forEach(p=> out.push({ pid:p.id, mid:m.id, sid }));
    });
  });
  return out.slice(0, 60);
}
function visitaStart(){
  const scope = EST.view!=='sala' && EST.mid ? EST.mid : null;
  const stops = visitaStops(scope);
  if(!stops.length){ showToast(t('tour.empty'), { replace:true }); return; }
  VISITA = { stops, i:0, play:true, timer:null };
  visitaGo(0);
}
async function visitaGo(i){
  if(!VISITA) return;
  VISITA.i = (i + VISITA.stops.length) % VISITA.stops.length;
  const s = VISITA.stops[VISITA.i], m = estMueble(s.mid);
  if(view.page!=='estanteria'){ goEstanteria({ pid:s.pid }); await new Promise(r=> setTimeout(r, 60)); }
  else if(EST.mid===s.mid && EST.view==='balda' && EST.bsid===s.sid){ EST.focusPid = s.pid; estShowFocus(); }
  else { EST.mode = 'ver'; EST.mid = s.mid; EST.view = 'balda'; EST.bsid = s.sid; EST.covers = false; EST.sel = null; EST.focusPid = s.pid; await render(); }
  if(!VISITA) return;
  visitaCard();
  clearTimeout(VISITA.timer);
  if(VISITA.play) VISITA.timer = setTimeout(()=> visitaGo(VISITA.i + 1), reducedMotion() ? 12000 : 9000);
}
function visitaCard(){
  if(!VISITA) return;
  const s = VISITA.stops[VISITA.i], p = PRODUCTS_BY_ID[s.pid]; if(!p) return visitaEnd();
  let el = document.getElementById('tourCard');
  if(!el){ el = document.createElement('section'); el.id = 'tourCard'; el.className = 'tour-card'; el.setAttribute('aria-label', t('tour.title')); document.body.appendChild(el); document.addEventListener('keydown', visitaKey); }
  const ph = shownPhotoId(p), has = hasPhoto(ph, 'front');
  el.innerHTML = `<div class="tour-head"><span class="tour-n">${escapeHTML(t('tour.n').replace('{i}', VISITA.i + 1).replace('{n}', VISITA.stops.length))}</span>
      <button type="button" class="btn btn-ghost btn-icon" data-fk="tour-x" onclick="visitaEnd()" aria-label="${escapeHTML(t('tour.exit'))}" title="${escapeHTML(t('tour.exit'))}">${icon('x')}</button></div>
    <div class="tour-body" aria-live="polite">${has ? `<img class="tour-img" data-photo="${escapeHTML(ph)}" alt="">` : ''}<div class="tour-txt"><h3>${escapeHTML(p.name)}</h3><p class="tour-meta">${escapeHTML([p.platformName, p.year, regionShortText(p)].filter(Boolean).join(' · '))}</p>
      ${String(p.summary || '').trim() ? `<p class="tour-sum">${escapeHTML(String(p.summary).trim())}</p>` : ''}</div></div>
    <div class="tour-btns"><button type="button" class="btn btn-sm" data-fk="tour-prev" onclick="visitaStep(-1)" aria-label="${escapeHTML(t('tour.prev'))}">${icon('chevronLeft')}</button>
      <button type="button" class="btn btn-sm" data-fk="tour-play" onclick="visitaToggle()" aria-pressed="${VISITA.play}">${icon(VISITA.play ? 'pause' : 'play')} ${t(VISITA.play ? 'tour.pause' : 'tour.play')}</button>
      <button type="button" class="btn btn-sm" data-fk="tour-ficha" onclick="const id='${escapeHTML(p.id)}'; visitaEnd(); goProduct(id)">${t('tour.ficha')}</button>
      <button type="button" class="btn btn-sm primary" data-fk="tour-next" onclick="visitaStep(1)" aria-label="${escapeHTML(t('tour.next'))}">${icon('chevronRight')}</button></div>`;
  if(has && typeof hydratePhotos==='function') hydratePhotos(el);
}
async function visitaStep(d){ if(!VISITA) return; const a = document.activeElement, fk = a && a.closest && a.closest('#tourCard') && a.dataset.fk ? a.dataset.fk : (d > 0 ? 'tour-next' : 'tour-prev'); await visitaGo(VISITA.i + d);
  const back = ()=>{ const b = document.querySelector(`#tourCard [data-fk="${fk}"]`); if(b) b.focus({ preventScroll:true }); }; back(); setTimeout(back, 80); }
function visitaToggle(){ if(!VISITA) return; VISITA.play = !VISITA.play; clearTimeout(VISITA.timer); if(VISITA.play) VISITA.timer = setTimeout(()=> visitaGo(VISITA.i + 1), 9000); visitaCard(); const b = document.querySelector('#tourCard [data-fk="tour-play"]'); if(b) b.focus({ preventScroll:true }); }
function visitaKey(e){ if(!VISITA) return; if(e.key==='Escape'){ e.preventDefault(); visitaEnd(); } else if(e.key==='ArrowRight' && !e.target.closest('input, textarea')) visitaStep(1); else if(e.key==='ArrowLeft' && !e.target.closest('input, textarea')) visitaStep(-1); }
function visitaEnd(){
  if(VISITA) clearTimeout(VISITA.timer);
  VISITA = null; const el = document.getElementById('tourCard'); if(el) el.remove();
  document.removeEventListener('keydown', visitaKey);
  const b = document.querySelector('[data-fk="tour"]'); if(b) b.focus({ preventScroll:true });
}
/* si sales de la estantería, la visita se acaba */
setInterval(()=>{ if(VISITA && (view.page!=='estanteria' || view.productId)) visitaEnd(); }, 800);
