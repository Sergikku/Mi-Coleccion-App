/* La Colección App — screens.js
   Pantallas: Dashboard, Colección (categorías, plataformas, carpetas),
   Ficha, Inventario (búsqueda y filtros), Estadísticas, Investigación,
   Galería, Ayuda y Copia de seguridad. Cada render*() devuelve HTML; las
   acciones que modifican datos viven en actions.js. */

let statsOpen = { categoria:false, plataforma:false, region:false };
let productSectionsOpen = {};
let ayudaOpen = {};
function toggleAyuda(key){ ayudaOpen[key] = !ayudaOpen[key]; render(); }
function toggleProductSection(key){ productSectionsOpen[key] = !productSectionsOpen[key]; render(); }
async function toggleStatsSection(key){ statsOpen[key] = !statsOpen[key]; render(); }

function fmtPct(have, total){ return total ? Math.round(have/total*100) + '%' : '—'; }
function fmtMoney(v){
  return v.toLocaleString(numLocale(), { maximumFractionDigits:2 }) + ' ' + currencySymbol();
}
function numLocale(){ return {es:'es-ES', en:'en-GB', de:'de-DE', ja:'ja-JP'}[OVERRIDES.lang || 'es'] || 'es-ES'; }
function fmtCount(n, keyOne, keyMany){ return t(n===1 ? keyOne : keyMany).replace('{n}', n.toLocaleString(numLocale())); }

/* =====================================================================
   VITRINA (v11.1): piezas visuales comunes a varias pantallas
   Todo se calcula en el momento a partir de tus datos; nada se guarda.
   ===================================================================== */
/* "faltan N" / "Completa" */
function gapStateHTML(missing, total){
  if(!total) return `<span class="gap-state">—</span>`;
  return missing ? `<span class="gap-state is-gap">${t('dash.missing_n').replace('{n}', missing.toLocaleString(numLocale()))}</span>`
                 : `<span class="gap-state is-full">${t('shelf.complete')}</span>`;
}
/* Estantería: un lomo por plataforma, ancho según sus piezas, con su color.
   Marca inferior = le faltan piezas; más clarito = no cuenta para la colección. */
function shelfSpinesHTML(catId, counts, withLabels){
  const plats = orderedPlatformsForCategory(catId, getAllPlatforms().filter(p=>p.categoryId===catId));
  const items = plats.map(p=>({ p, st: counts.get(p.id) || EMPTY_COUNTS })).filter(x=>x.st.total>0);
  if(!items.length) return `<span class="shelf is-empty" aria-hidden="true"></span>`;
  const total = items.reduce((a,x)=>a+x.st.total, 0);
  return `<span class="shelf" aria-hidden="true">` + items.map((x,i)=>{
    const pv = platVisual(x.p.id);
    const h = 64 + ((i*11 + x.st.total*5) % 30);
    const label = withLabels && x.st.total/total >= 0.06 && pv.code ? `<span class="spine-label">${escapeHTML(pv.code)}</span>` : '';
    return `<span class="spine${x.st.missing ? ' has-gap' : ''}${platformCountsInCollection(x.p.id) ? '' : ' is-excluded'}" style="--plat:${pv.color};flex-grow:${x.st.total};height:${h}%">${label}</span>`;
  }).join('') + `</span>`;
}
function shelfCardHTML(c, counts, full){
  const nPlats = getAllPlatforms().filter(p=>p.categoryId===c.id).length;
  const sub = `${c.have.toLocaleString(numLocale())} / ${c.total.toLocaleString(numLocale())} · ${fmtCount(nPlats,'count.platform_one','count.platform_many')}`;
  return `<button type="button" class="shelf-card is-tappable${full ? ' is-full' : ''}" onclick="goCategory('${c.id}')">
    <span class="shelf-head">
      <span class="shelf-titles"><span class="shelf-name">${escapeHTML(c.name)}</span><span class="shelf-sub">${sub}</span></span>
      ${c.total ? `<span class="shelf-pct" aria-label="${escapeHTML(t('dash.ring_label').replace('{pct}', c.pct).replace('{have}', c.have).replace('{total}', c.total))}">${c.pct}<small>%</small></span>` : ''}
    </span>
    ${shelfSpinesHTML(c.id, counts, full)}
    ${full ? `<span class="shelf-foot">${gapStateHTML(c.missing, c.total)}</span>` : ''}
  </button>`;
}
/* "Huecos por llenar": un bloque por plataforma con lo que falta y su barra;
   lleva al Inventario ya filtrado (esa plataforma + "Me falta") */
function gapBlockHTML(m){
  const pv = platVisual(m.id);
  return `<button type="button" class="gap-block is-tappable" onclick="goMissing('${m.id}')" style="--plat:${pv.color}">
    <span class="gap-block-top"><span class="code-chip">${escapeHTML(pv.code)}</span><span class="gap-count"><b>${m.missing.toLocaleString(numLocale())}</b> ${t(m.missing===1 ? 'dash.gap_one' : 'dash.gap_many')}</span></span>
    <span class="gap-block-name">${escapeHTML(m.name)}</span>
    <span class="plat-bar" aria-hidden="true"><span style="width:${m.pct}%"></span></span>
    <span class="gap-block-meta">${m.have.toLocaleString(numLocale())} / ${m.total.toLocaleString(numLocale())} · ${escapeHTML(m.categoryName)}</span>
  </button>`;
}
function goMissing(platId){
  invState = Object.assign({}, invState, { search:'', filter:'falta', limit:60, cat:'', plat:platId, region:'', flags:[], photo:'', complete:'' });
  goPage('inventario');
}
/* Barras por año de salida (Dashboard y Estadísticas) */
function yearChartHTML(list, tall){
  const m = new Map();
  list.forEach(p=>{ const y = parseInt(p.year, 10); if(!isNaN(y) && y>1900 && y<2200) m.set(y, (m.get(y)||0) + 1); });
  if(!m.size) return '';
  let min = Math.min(...m.keys()); const max = Math.max(...m.keys());
  if(max - min > 80) min = max - 80;
  const peak = Math.max(...m.values());
  const ranked = [...m.entries()].sort((a,b)=> b[1]-a[1] || a[0]-b[0]);
  const top = ranked[0];
  let bars = '';
  for(let y=min; y<=max; y++){
    const n = m.get(y) || 0;
    bars += `<span class="yc-bar${n===peak ? ' is-peak' : ''}" style="height:${n ? Math.max(3, Math.round(n/peak*100)) : 0}%" title="${y}: ${escapeHTML(fmtCount(n,'count.item_one','count.item_many'))}"></span>`;
  }
  // la etiqueta del año más fuerte va encima de su barra (sin pisar los años de los extremos)
  const peakPos = Math.min(88, Math.max(12, ((top[0] - min) + 0.5) / (max - min + 1) * 100));
  const label = t('year.chart_label').replace('{y}', top[0]).replace('{n}', top[1]);
  return `<div class="year-chart${tall ? ' is-tall' : ''}">
    <div class="yc-plot"><span class="yc-peak" style="left:${peakPos.toFixed(1)}%" aria-hidden="true">${top[0]} · ${top[1]}</span>
      <div class="yc-bars" role="img" aria-label="${escapeHTML(label)}">${bars}</div></div>
    <div class="yc-axis" aria-hidden="true"><span>${min}</span><span>${max}</span></div>
  </div>`;
}
/* "Recién añadidas": las últimas piezas que has creado (orden de creación) */
function recentProducts(limit){
  const out = [], seen = new Set();
  const cps = OVERRIDES.customProducts || [];
  for(let i=cps.length-1; i>=0 && out.length<limit; i--){
    const id = cps[i] && cps[i].id; if(!id) continue;
    const p = PRODUCTS_BY_ID[id] || PRODUCTS_BY_ID[id+'__e0'];
    if(p && !seen.has(p.id)){ seen.add(p.id); out.push(p); }
  }
  return out;
}
/* Reparto de la colección por categorías (barra única + leyenda que lleva a cada una) */
function distributionHTML(cats){
  const list = cats.filter(c=>c.total>0);
  const total = list.reduce((a,c)=>a+c.total, 0);
  if(!total) return '';
  return `<div class="dist">
    <div class="dist-head"><span>${t('dash.distribution')}</span><span class="muted">${fmtCount(list.length,'count.category_one','count.category_many')}</span></div>
    <div class="dist-bar" aria-hidden="true">${list.map((c,i)=>`<span class="dist-seg dist-c${i%8}" style="flex-grow:${c.total}"></span>`).join('')}</div>
    <div class="dist-legend">${list.map((c,i)=>`<button type="button" class="dist-key" onclick="goCategory('${c.id}')"><span class="dist-dot dist-c${i%8}" aria-hidden="true"></span>${escapeHTML(c.name)} <b>${c.total.toLocaleString(numLocale())}</b></button>`).join('')}</div>
  </div>`;
}


/* =====================================================================
   DASHBOARD
   ===================================================================== */
function dashTitle(){
  const v = (OVERRIDES.dashboardTitle||'').trim();
  // el título por defecto antiguo se guardaba literal en español: se trata como "sin personalizar"
  return (!v || v==='Tu colección, de un vistazo') ? t('dash.default_title') : v;
}
function searchbarHTML(o){
  // v11.6: con o.scan, al lado va «¿Lo tengo?» (escanear un código de barras)
  //   o.scan==='label' → con su nombre (Dashboard) · 'icon' → solo el icono (Inventario, donde el buscador necesita sitio)
  if(o.scan && typeof openScanner==='function') return `<div class="search-row">${searchbarHTML(Object.assign({}, o, { scan:false }))}<button type="button" class="btn scan-btn${o.scan==='icon' ? ' is-icon' : ''}" onclick="openScanner()" aria-label="${escapeHTML(t('scan.open_label'))}" title="${escapeHTML(t('scan.open_label'))}">${icon('barcode')}${o.scan==='icon' ? '' : `<span class="scan-btn-label">${t('scan.button')}</span>`}</button></div>`;
  return `<div class="searchbar" role="search">
    ${icon('search','ico-search')}
    <input type="search" ${o.id?`id="${o.id}"`:''} placeholder="${escapeHTML(o.placeholder)}" aria-label="${escapeHTML(o.placeholder)}" value="${escapeHTML(o.value||'')}" oninput="${o.oninput}; this.parentElement.querySelector('.search-clear').hidden=!this.value" autocomplete="off" enterkeyhint="search">
    <button type="button" class="search-clear" aria-label="${t('common.clear_search')}" onclick="const i=this.parentElement.querySelector('input'); i.value=''; i.dispatchEvent(new Event('input')); i.focus();" ${o.value?'':'hidden'}>${icon('x')}</button>
  </div>`;
}
function renderDashboard(){
  const g = computeGlobalStats();
  const cats = statsByCategory();
  const head = screenHeadHTML({ cls:'dash-head', kicker:t('dash.kicker'), title:dashTitle(), edit:'updateDashboardTitle(this.value)', editLabel:t('dash.edit_title') });
  if(!PRODUCTS.length && !cats.length){
    return head + emptyStateHTML({ icon:'layers', title:t('dash.empty.title'), text:t('dash.empty.text'),
      actions:`<button class="btn primary" onclick="goPage('coleccion')">${icon('plus')} ${t('common.create_category')}</button>
               <button class="btn" onclick="goPage('backup')">${icon('archive')} ${t('backup.import')}</button>` });
  }
  const n = (v)=> v.toLocaleString(numLocale());
  let html = head;
  html += searchbarHTML({ id:'dash-search', placeholder:t('dash.search_short'), oninput:'handleDashboardSearch(this.value)', scan:'label' });
  html += `<div id="dash-search-results" aria-live="polite"></div>`;
  html += backupReminderHTML();
  // 1. Portada: la cifra manda; las demás la acompañan (y llevan al Inventario filtrado)
  html += `<section class="dash-hero vit-card" aria-label="${t('dash.summary')}">
    <div class="hero-progress">
      <div class="ring ring-hero" data-pct="${g.pct}" role="img" aria-label="${t('dash.ring_label').replace('{pct}', g.pct).replace('{have}', g.have).replace('{total}', g.total)}"><div class="ring-hole"><span class="hero-pct">${g.pct}<small>%</small></span></div></div>
      <button type="button" class="hero-count" onclick="goInventory('tengo')" aria-label="${escapeHTML(t('dash.have'))}: ${n(g.have)} / ${n(g.total)}"><b>${n(g.have)}</b> / ${n(g.total)} ${t('dash.pieces_word')}</button>
    </div>
    <div class="hero-stats">
      <button type="button" class="hero-stat is-accent" onclick="goInventory('falta')"><span class="hs-label">${t('dash.pending')}</span><span class="hs-value">${n(g.pending)}</span></button>
      <button type="button" class="hero-stat is-gold" onclick="goInventory('sellado')"><span class="hs-label">${t('dash.sealed')}</span><span class="hs-value">${n(g.sealed)}</span></button>
      <button type="button" class="hero-stat is-quiet" onclick="openValueBulk()" title="${escapeHTML(g.valued ? (g.lastUpdate ? t('dash.value.updated').replace('{d}', g.lastUpdate) : '') : t('dash.value.novalue'))}"><span class="hs-label">${t('dash.value')}</span><span class="hs-value">${g.valued ? fmtMoney(g.valor) : '—'}</span></button>
    </div>
    ${dashCatRowsHTML(cats)}
  </section>`;
  // v11.22: la pieza del día
  html += dashDailyHTML();
  // 2. Recién añadidas: tus últimas piezas, como fichas de catálogo
  const recent = recentProducts(12);
  if(recent.length){
    registerListContext(recent.map(p=>p.id), t('dash.recent'));
    html += `<section class="vit-section">${sectionTitleHTML(t('dash.recent'), `<button type="button" class="link-btn" onclick="goPage('gallery')">${t('dash.gallery_link')}</button>`)}<div class="h-scroll">${recent.map(miniCoverHTML).join('')}</div></section>`;
  }
  // v11.22: «Casi completas» (las plataformas a las que les falta poco), el valor y, al final, los enlaces.
  //   La estantería 3D, las categorías en grande y el gráfico por año siguen en Colección, Estantería y Estadísticas;
  //   las piezas por confirmar, en el número de «Investigar» de la barra.
  html += dashNearHTML();
  html += dashValueHTML(g);
  const rep = repeatedStats();
  html += `<div class="quiet-links">
    ${rep.pieces ? `<button class="btn btn-sm btn-ghost" onclick="goInventory('repetidas')">${icon('copies')} ${t('rep.link').replace('{n}', rep.pieces)}</button>` : ''}
    <button class="btn btn-sm btn-ghost" onclick="goPage('gallery')">${icon('camera')} ${t('dash.gallery_link')}</button>
    <button class="btn btn-sm btn-ghost" onclick="goPage('estadisticas')">${icon('chart')} ${t('dash.by_year')}</button>
    <button class="btn btn-sm btn-ghost" onclick="goPage('backup')">${icon('archive')} ${t('dash.backup_link')}</button>
    <button class="btn btn-sm btn-ghost" onclick="goPage('ayuda')">${icon('help')} ${t('nav.ayuda')}</button>
  </div>`;
  return html;
}
/* ---------- Dashboard v11.22 ---------- */
/* Categorías dentro del resumen: nombre, «tienes / total · %» y su barra; cada una lleva a su categoría */
function dashCatRowsHTML(cats){
  const list = cats.filter(c=> c.total > 0);
  if(!list.length) return '';
  const n = (v)=> v.toLocaleString(numLocale());
  return `<div class="dash-cats">${list.map((c, i)=> `<button type="button" class="dash-cat" onclick="goCategory('${c.id}')" aria-label="${escapeHTML(c.name + ' — ' + t('dash.ring_label').replace('{pct}', c.pct).replace('{have}', c.have).replace('{total}', c.total))}">
      <span class="dc-name">${escapeHTML(c.name)}</span><span class="dc-count">${n(c.have)} / ${n(c.total)} · ${c.pct} %</span>
      <span class="dc-bar" aria-hidden="true"><span class="dist-c${i % 8}" style="width:${c.pct}%"></span></span></button>`).join('')}</div>`;
}
/* La pieza del día: una de las tuyas (si hay fotos, de las que tienen foto delantera), la misma todo el día.
   «Otra» enseña otra (solo en esta pantalla, no se guarda nada). */
let dashDaily = { day:'', id:'', off:0 };
function dashDailyPick(){
  const own = PRODUCTS.filter(p=> p.possession==='tengo');
  if(!own.length) return null;
  const ready = typeof PHOTO_INDEX!=='undefined' && PHOTO_INDEX.ready;
  const withPhoto = ready ? own.filter(p=> hasPhoto(shownPhotoId(p), 'front')) : [];
  const pool = withPhoto.length ? withPhoto : own;
  const day = new Date().toISOString().slice(0, 10);
  if(dashDaily.day!==day){ dashDaily = { day, id:'', off:0 }; }
  const cur = dashDaily.id && PRODUCTS_BY_ID[dashDaily.id];
  if(cur && cur.possession==='tengo' && pool.includes(cur) && ready) return cur;
  let h = 2166136261; for(const ch of day) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const ids = pool.map(p=> p.id).sort();
  const p = PRODUCTS_BY_ID[ids[((h >>> 0) + dashDaily.off * 7919) % ids.length]];
  if(ready) dashDaily.id = p.id;
  return p;
}
function dashDailyHTML(){
  const p = dashDailyPick(); if(!p) return '';
  const pv = platVisual(p.platformId), photoId = shownPhotoId(p), has = hasPhoto(photoId, 'front');
  const meta = [p.platformName, p.year, regionShortText(p)].filter(Boolean).map(escapeHTML).join(' · ');
  return `<section class="dash-daily" aria-labelledby="ddName">
    <div class="dd-art" style="--plat:${pv.color}"><span class="dd-tag">${t('dash.daily')}</span>
      <span class="dd-cover">${has ? photoImgHTML(p, 'front', 'full', '', photoId) : `<span class="dd-code">${escapeHTML(pv.code)}</span>`}${shownSealed(p) ? `<span class="cover-seal" title="${escapeHTML(t('wall.sealed'))}">${icon('shield')}</span>` : ''}</span></div>
    <div class="dd-info"><h2 class="dd-name" id="ddName">${escapeHTML(p.name)}</h2>${meta ? `<p class="dd-meta">${meta}</p>` : ''}
      <div class="dd-actions"><button type="button" class="btn dd-open" onclick="goProduct('${p.id}')">${t('dash.daily_open')}</button>
        <button type="button" class="btn dd-other" data-fk="dd-other" onclick="dashDailyOther()">${icon('refresh')} ${t('dash.daily_other')}</button></div></div>
  </section>`;
}
function dashDailyOther(){ dashDaily.off++; dashDaily.id = ''; renderKeepFocus('[data-fk="dd-other"]'); }
/* «Casi completas»: plataformas a las que les falta poco (al menos la mitad), las 3 más cerca de completarse */
function dashNearPlatforms(limit){
  const m = groupCounts(PRODUCTS.filter(p=> p.platformId && platformCountsInCollection(p.platformId)), p=> p.platformId);
  return getAllPlatforms().map(pl=> Object.assign({ id:pl.id, name:pl.name }, m.get(pl.id) || EMPTY_COUNTS))
    .filter(s=> s.missing > 0 && s.have * 2 >= s.total)
    .sort((a, b)=> a.missing - b.missing || b.pct - a.pct || compareNames(a.name, b.name))
    .slice(0, limit || 3);
}
function dashNearHTML(){
  const list = dashNearPlatforms(3); if(!list.length) return '';
  const n = (v)=> v.toLocaleString(numLocale());
  return `<section class="vit-section">${sectionTitleHTML(t('dash.near'), `<button type="button" class="link-btn" onclick="goInventory('falta')">${t('dash.near_all')}</button>`)}
    <div class="dash-near">${list.map(s=>{ const pv = platVisual(s.id);
      return `<button type="button" class="dn-row" onclick="goMissing('${s.id}')" style="--plat:${pv.color}"><span class="code-chip">${escapeHTML(pv.code)}</span>
        <span class="dn-txt"><b>${escapeHTML(s.name)}</b><small>${t('dash.near_of').replace('{h}', n(s.have)).replace('{t}', n(s.total))}</small></span>
        <span class="dn-miss">${(s.missing===1 ? t('dash.near_miss1') : t('dash.near_miss')).replace('{n}', n(s.missing))}</span></button>`; }).join('')}</div></section>`;
}
/* El valor de tu colección, al final: total, su evolución, lo pagado, la diferencia y cuántas tienen valor */
function dashValueHTML(g){
  if(!g.have) return '';
  const v = valueTotals();
  const chart = v.nNow ? valueChartSVG(Array.isArray(OVERRIDES.valorHistorial) ? OVERRIDES.valorHistorial : []) : '';
  const diff = v.both ? (v.diff >= 0 ? '+' : '−') + fmtMoney(Math.abs(v.diff)) : '—';
  return `<section class="dash-value" aria-labelledby="dvTitle">
    <div class="dv-head"><h2 id="dvTitle">${t('val.title')}</h2><button type="button" class="link-btn" onclick="goPage('estadisticas')">${t('dash.value_more')}</button></div>
    ${v.nNow ? `<div class="dv-total">${fmtMoney(v.now)}</div>${chart || `<p class="dv-note">${t('val.chart_one')}</p>`}` : `<p class="dv-note">${t('val.empty')}</p>`}
    <div class="dv-three"><span>${t('val.paid')}<b>${v.nPaid ? fmtMoney(v.paid) : '—'}</b></span><span>${t('val.diff')}<b class="${v.both ? (v.diff >= 0 ? 'is-up' : 'is-down') : ''}">${diff}</b></span><span>${t('dash.value_with')}<b>${t('dash.near_of').replace('{h}', v.nNow).replace('{t}', g.have)}</b></span></div>
    <button type="button" class="btn dv-bulk" data-fk="dv-bulk" onclick="openValueBulk()">${icon('coins')} ${t('val.bulk')}</button>
  </section>`;
}
/* Métrica del Dashboard → Inventario con ese filtro */
function goInventory(filter){
  invState = Object.assign({}, invState, { search:'', filter: filter||'todos', limit:60, cat:'', plat:'', region:'', flags:[], photo:'', complete:'' });
  goPage('inventario');
}
/* Búsqueda rápida del Dashboard — actualiza solo el bloque de resultados */
function handleDashboardSearch(q){
  const el = document.getElementById('dash-search-results');
  if(!el) return;
  const tokens = searchTokens(q);
  if(!tokens.length){ el.innerHTML = ''; return; }
  const all = PRODUCTS.filter(p=> productMatchesSearch(p, tokens));
  const matches = all.slice(0, 15);
  if(!matches.length){
    el.innerHTML = `<div class="section-sub">${t('dash.no_results').replace('{q}', escapeHTML((q||'').trim()))}</div>`;
    return;
  }
  registerListContext(matches.map(p=>p.id), t('dash.search'));
  el.innerHTML = matches.map(p=>`
    <button type="button" class="search-hit" onclick="goProduct('${p.id}')">
      <div class="search-hit-name">${escapeHTML(p.name)}</div>
      <div class="search-hit-meta">${[p.platformName, p.year, regionShortText(p)].filter(Boolean).map(escapeHTML).join(' · ')}</div>
    </button>`).join('')
    + (all.length > matches.length ? `<button class="btn btn-sm search-more" onclick="openInventorySearch(document.getElementById('dash-search').value)">${t('dash.see_all_results').replace('{n}', all.length)}</button>` : '');
}
function openInventorySearch(q){
  invState = Object.assign({}, invState, { search:q||'', filter:'todos', limit:60, cat:'', plat:'', region:'', flags:[], photo:'', complete:'' });
  goPage('inventario');
  setTimeout(()=>{ const i = document.querySelector('.searchbar input'); if(i){ i.focus(); const v=i.value; i.value=''; i.value=v; } }, 60);
}

/* =====================================================================
   COLECCIÓN: categorías → plataformas → piezas
   ===================================================================== */
async function renderColeccion(){
  if(view.productId && PRODUCTS_BY_ID[view.productId]) return renderProductDetail(view.productId);
  if(view.platformId && view.folderId) return renderFolderProducts(view.categoryId, view.platformId, view.folderId);
  if(view.platformId) return renderPlatformProducts(view.categoryId, view.platformId);
  if(view.categoryId) return renderCategoryPlatforms(view.categoryId);
  return renderCategoryList();
}

function renderCategoryList(){
  const cats = statsByCategory();
  const tot = cats.reduce((a,c)=>({have:a.have+c.have,total:a.total+c.total}),{have:0,total:0});
  let html = screenHeadHTML({ kicker:t('nav.coleccion'), title:t('coll.shelves'),
    sub: cats.length ? `${fmtCount(cats.length,'count.category_one','count.category_many')} · ${t('dash.have_of_total').replace('{have}',tot.have).replace('{total}',tot.total)}` : '' });
  if(!cats.length){
    html += emptyStateHTML({ icon:'layers', title:t('coll.empty.title'), text:t('coll.empty.text'),
      actions:`<button class="btn" onclick="goPage('backup')">${icon('archive')} ${t('backup.import')}</button>` });
  }
  // v11.1: cada categoría es una estantería (un lomo por plataforma)
  const counts = platformCountsMap();
  if(cats.length) html += `<div class="shelf-list">${cats.map(c=>shelfCardHTML(c, counts, true)).join('')}</div>`;
  if(cats.length && typeof estDashCardHTML==='function') html += estDashCardHTML();   // v11.11: tu estantería 3D
  html += `<button type="button" class="create-btn" id="tour-add-category" onclick="addCategory()">
    <span class="create-btn-icon">${icon('plus')}</span>
    <span><span class="create-btn-label">${t('common.create_category')}</span><span class="create-btn-sub">${t('common.create_category.sub')}</span></span>
  </button>`;
  return html;
}

async function renderCategoryPlatforms(catId){
  const cat = getAllCategories().find(c=>c.id===catId);
  if(!cat){ view = { page:'coleccion' }; return renderCategoryList(); }
  const plats = orderedPlatformsForCategory(catId, getAllPlatforms().filter(p=>p.categoryId===catId));
  const counts = platformCountsMap();
  const cst = statsByCategory().find(c=>c.id===catId) || EMPTY_COUNTS;
  let html = screenHeadHTML({ kicker:t('cat.kicker'), title:cat.name, edit:`renameCategory('${catId}',this.value)`, editLabel:t('cat.rename'),
    sub: `${fmtCount(plats.length,'count.platform_one','count.platform_many')}${cst.total ? ' · ' + t('dash.have_of_total').replace('{have}',cst.have).replace('{total}',cst.total) + ' · ' + cst.pct + '%' : ''}` });
  if(plats.length===0){
    html += emptyStateHTML({ icon:'collection', title:t('cat.empty.title'), text:t('cat.empty.sub'),
      actions:`<button class="btn primary" onclick="addPlatformToCategory('${catId}')">${icon('plus')} ${t('fab.add_platform')}</button>` });
  }
  // la estantería de la categoría y sus plataformas como catálogo histórico (por época)
  if(plats.length){
    html += `<div class="cat-shelf">${shelfSpinesHTML(catId, counts, true)}</div>`;
    html += sectionTitleHTML(t('cat.timeline'), fmtCount(plats.length,'count.platform_one','count.platform_many'));
  }
  html += `<div class="tl-list">`;
  plats.forEach((p,i)=>{
    const st = counts.get(p.id) || EMPTY_COUNTS;
    const canMove = !platformHasYear(p);
    const excluded = !platformCountsInCollection(p.id);
    const pv = platVisual(p.id);
    const meta = [p.maker ? escapeHTML(p.maker) : '', fmtCount(st.total, 'count.item_one', 'count.item_many'), excluded ? t('plat.excluded_short') : ''].filter(Boolean).join(' · ');
    html += `<div class="tl-item${canMove ? ' no-year' : ''}" style="--plat:${pv.color}">
      <span class="tl-year" aria-hidden="true">${platformHasYear(p) ? escapeHTML(String(parseInt(p.year,10))) : '—'}</span>
      <div class="plat-card is-tappable">
        <button type="button" class="plat-card-link" onclick="goPlatform('${catId}','${p.id}')">
          <span class="code-chip" aria-hidden="true">${escapeHTML(pv.code || (p.name||'').toString().slice(0,4))}</span>
          <span class="plat-card-body">
            <span class="plat-top"><span class="plat-name-lg">${escapeHTML(p.name)}</span><span class="plat-pct">${st.total ? st.pct+'%' : '—'}</span></span>
            <span class="plat-meta">${meta}${st.total ? ' · ' + gapStateHTML(st.missing, st.total) : ''}</span>
            <span class="plat-bar" aria-hidden="true"><span style="width:${st.pct}%"></span></span>
          </span>
        </button>
        ${canMove ? `<div class="plat-move">
          <button type="button" aria-label="${t('plat.move_up').replace('{name}', escapeHTML(p.name))}" onclick="movePlatform('${catId}','${p.id}',-1)" ${i===0?'disabled':''}>${icon('chevronUp')}</button>
          <button type="button" aria-label="${t('plat.move_down').replace('{name}', escapeHTML(p.name))}" onclick="movePlatform('${catId}','${p.id}',1)" ${i===plats.length-1?'disabled':''}>${icon('chevronDown')}</button>
        </div>` : ``}
      </div></div>`;
  });
  html += `</div>`;
  html += `<div class="options-block">${disclosureHTML('checklistcat', t('checklist.title'), checklistEditorHTML(catId), productSectionsOpen, fmtCount(checklistForCategory(catId).length,'count.component_one','count.component_many'))}</div>`;
  html += `<div class="danger-zone"><h2 class="section-title">${t('common.danger_zone')}</h2>
    <button class="btn btn-danger" onclick="deleteCategory('${catId}')">${icon('trash')} ${t('common.delete_category')}</button></div>`;
  return html;
}

/* --- Lista de piezas (plataforma o carpeta) con barra de herramientas --- */
let productSortMode = 'year';
function sortProductsByMode(list){
  if(['added','value','cond','sealed'].includes(productSortMode)) return list.slice().sort(productCmp(productSortMode));   // v11.19
  if(productSortMode==='alpha') return list.slice().sort((a,b)=> compareNames(a.name, b.name));
  if(productSortMode==='have') return list.slice().sort((a,b)=>{
    const ah = a.possession==='tengo' ? 0 : 1, bh = b.possession==='tengo' ? 0 : 1;
    if(ah!==bh) return ah-bh;
    return compareNames(a.name, b.name);
  });
  return sortGames(list);
}
function setProductSortMode(mode){ productSortMode = mode; collState.limit = 60; render(); }
function setCollFilter(f){ collState.filter = f; collState.limit = 60; render(); }
async function setCollView(v){ await setUiPref('collView', v); render(); }
function sortSelectorHTML(){
  return `<label class="sr-only" for="collSort">${t('sort.label')}</label>
  <select id="collSort" class="select-compact" onchange="setProductSortMode(this.value)" aria-label="${t('sort.label')}">
    <option value="year" ${productSortMode==='year'?'selected':''}>${t('sort.year')}</option>
    <option value="alpha" ${productSortMode==='alpha'?'selected':''}>${t('sort.alpha')}</option>
    <option value="have" ${productSortMode==='have'?'selected':''}>${t('sort.have')}</option>
    ${['added','value','cond','sealed'].map(k=>`<option value="${k}" ${productSortMode===k?'selected':''}>${t('sort.' + k)}</option>`).join('')}
  </select>`;
}
function productListBlockHTML(allProds, ctxKey, ctxLabel){
  if(collState.key !== ctxKey){ collState = { key:ctxKey, filter:'all', limit:60 }; }
  const cnt = { all:allProds.length, have:0, missing:0, sealed:0, dups:0 };
  allProds.forEach(p=>{ if(p.possession==='tengo'){ cnt.have++; if(shownSealed(p)) cnt.sealed++; if(copyCount(p) > 1) cnt.dups++; } else cnt.missing++; });
  const f = collState.filter;
  const filtered = allProds.filter(p=> f==='have' ? p.possession==='tengo' : f==='missing' ? p.possession!=='tengo' : f==='sealed' ? shownSealed(p) : f==='dups' ? copyCount(p) > 1 : true);
  const sorted = sortProductsByMode(filtered);
  const vw = uiPref('collView', 'grid');
  registerListContext(sorted.map(p=>p.id), ctxLabel);
  const chipF = (val, label, n)=> `<button type="button" class="chip ${f===val?'active':''}" aria-pressed="${f===val}" onclick="setCollFilter('${val}')">${label} <span class="chip-count">${n}</span></button>`;
  let html = `<div class="chip-scroll" role="group" aria-label="${t('filter.quick')}">
      ${chipF('all', t('inv.chip.all'), cnt.all)}${chipF('have', t('inv.chip.have'), cnt.have)}${cnt.dups || f==='dups' ? chipF('dups', t('inv.chip.dups'), cnt.dups) : ''}${chipF('missing', t('inv.chip.missing'), cnt.missing)}${cnt.sealed ? chipF('sealed', t('inv.chip.sealed'), cnt.sealed) : ''}
    </div>
    <div class="toolbar">
      <span class="result-count" aria-live="polite">${sorted.length===allProds.length ? fmtCount(allProds.length,'count.item_one','count.item_many') : t('count.filtered').replace('{n}',sorted.length).replace('{total}',allProds.length)}</span>
      <div class="toolbar-right">${sortSelectorHTML()}${viewToggleHTML(vw, "setCollView('{v}')")}</div>
    </div>`;
  if(!sorted.length){
    return html + emptyStateHTML({ icon:'filter', title:t('filter.no_results'), text:t('coll.filter_empty'), actions:`<button class="btn" onclick="setCollFilter('all')">${t('filter.show_all')}</button>` });
  }
  const shown = sorted.slice(0, collState.limit);
  html += vw==='list'
    ? `<div class="item-list">${shown.map(p=>productRowHTML(p, { showPlatform:false })).join('')}</div>`
    : `<div class="title-grid">${shown.map(p=>productCardHTML(p, { showPlatform:false })).join('')}</div>`;
  if(sorted.length > shown.length){
    html += `<button class="btn load-more" onclick="collState.limit+=60; render();">${t('inv.load_more').replace('{n}', sorted.length - shown.length)}</button>`;
  }
  return html;
}
function folderCardHTML(catId, platId, f, st){
  return `<div class="plat-card is-tappable" style="--plat:${platVisual(platId).color}">
    <button type="button" class="plat-card-link" onclick="goFolder('${catId}','${platId}','${f.id}')">
      <span class="code-chip is-icon" aria-hidden="true">${icon('folder')}</span>
      <span class="plat-card-body">
        <span class="plat-top"><span class="plat-name-lg">${escapeHTML(f.name)}</span><span class="plat-pct">${st.total ? st.pct+'%' : '—'}</span></span>
        <span class="plat-meta">${fmtCount(st.total,'count.item_one','count.item_many')}${st.total ? ' · ' + gapStateHTML(st.missing, st.total) : ''}</span>
        <span class="plat-bar" aria-hidden="true"><span style="width:${st.pct}%"></span></span>
      </span>
    </button>
  </div>`;
}
/* Cabecera de plataforma/carpeta (v11.2): sobre el papel, con el color de la
   plataforma como acento (línea, etiqueta y barra); una barrita por pieza */
function platHeroHTML(o){
  const pv = platVisual(o.platId);
  const st = o.st;
  const n = (v)=> v.toLocaleString(numLocale());
  const missTxt = !st.total ? '' : st.missing ? (st.missing===1 ? t('plat.hero.missing_one') : t('plat.hero.missing_many').replace('{n}', n(st.missing))) : t('shelf.complete');
  let slots = '';
  if(st.total && st.total <= 80){
    slots = `<div class="slot-bar" aria-hidden="true">${sortGames(o.list).map(p=>`<span class="${p.possession==='tengo' ? 'slot-have' : 'slot-miss'}"></span>`).join('')}</div>`;
  } else if(st.total){
    slots = `<div class="plat-bar is-lg" aria-hidden="true"><span style="width:${st.pct}%"></span></div>`;
  }
  const extra = repeatedStats(o.list).extra;   // v11.11
  const meta = o.meta.filter(Boolean).concat(st.total ? [`${n(st.have)} / ${n(st.total)} ${t('dash.pieces_word')}`, missTxt] : []).concat(extra ? [t(extra===1 ? 'rep.extra_one_long' : 'rep.extra_many_long').replace('{n}', n(extra))] : []).join(' · ');
  return `<header class="screen-head plat-hero" style="--plat:${pv.color}">
    <div class="plat-hero-top">
      ${o.chip ? `<span class="code-chip${o.chipIcon ? ' is-icon' : ''}" aria-hidden="true">${o.chip}</span>` : '<span></span>'}
      ${st.total ? `<span class="plat-hero-pct" role="img" aria-label="${t('dash.ring_label').replace('{pct}', st.pct).replace('{have}', st.have).replace('{total}', st.total)}">${st.pct}<small>%</small></span>` : ''}
    </div>
    <input type="text" class="h1-edit" value="${escapeHTML(o.title)}" onchange="${o.edit}" aria-label="${escapeHTML(o.editLabel)}" title="${escapeHTML(o.editLabel)}">
    ${meta ? `<p class="plat-hero-meta">${meta}</p>` : ''}
    ${slots}
  </header>`;
}
async function renderPlatformProducts(catId, platId){
  const plat = getAllPlatforms().find(p=>p.id===platId);
  if(!plat){ view = { page:'coleccion', categoryId:catId }; return renderCategoryPlatforms(catId); }
  const allProds = PRODUCTS.filter(p=>p.platformId===platId);
  const loose = allProds.filter(p=>!p.folderId);
  const folders = foldersForPlatform(platId);
  const fcounts = folderCountsMap();
  const st = platformCountsMap().get(platId) || EMPTY_COUNTS;
  const pv = platVisual(platId);
  let html = platHeroHTML({ platId, chip: escapeHTML(pv.code || t('plat.kicker')), title:plat.name, edit:`renamePlatform('${platId}',this.value)`, editLabel:t('plat.rename'),
    meta:[escapeHTML(plat.maker||''), plat.year && plat.year!=='—' ? escapeHTML(plat.year) : ''], st, list:allProds });
  if(plat.note) html += `<div class="note note-info">${plat.note}</div>`;
  if(folders.length){
    html += sectionTitleHTML(t('plat.folders'), fmtCount(folders.length,'count.folder_one','count.folder_many'));
    folders.forEach(f=>{ html += folderCardHTML(catId, platId, f, fcounts.get(platId+'\u0000'+f.id) || EMPTY_COUNTS); });
    if(loose.length) html += sectionTitleHTML(t('plat.loose_items'));
  }
  if(loose.length){
    html += productListBlockHTML(loose, 'plat:'+platId, plat.name);
  } else if(!folders.length){
    html += emptyStateHTML({ icon:'box', title:t('plat.empty'), text:t('plat.empty.sub'),
      actions:`<button class="btn primary" onclick="addProductToPlatform('${catId}','${platId}',null)">${icon('plus')} ${t('fab.add_product')}</button>` });
  }
  const counts = platformCountsInCollection(platId);
  html += `<div class="options-block">${sectionTitleHTML(t('plat.options'))}
    <div class="note ${counts ? 'note-info' : 'note-warn'}">${counts ? t('plat.counts_yes_long') : t('plat.counts_no_long')}
      <div class="note-actions"><button class="btn btn-sm" onclick="togglePlatformCounts('${platId}')">${counts ? t('plat.counts_make_no') : t('plat.counts_make_yes')}</button></div></div>
    <button class="btn btn-sm" id="tour-add-folder" onclick="addFolder('${catId}','${platId}')">${icon('folder')} ${t('common.create_folder')}</button>
  </div>`;
  html += `<div class="danger-zone"><h2 class="section-title">${t('common.danger_zone')}</h2>
    <button class="btn btn-danger" onclick="deletePlatform('${catId}','${platId}')">${icon('trash')} ${t('common.delete_platform').replace('{n}', allProds.length)}</button></div>`;
  return html;
}
async function renderFolderProducts(catId, platId, folderId){
  const plat = getAllPlatforms().find(p=>p.id===platId);
  const folder = plat && foldersForPlatform(platId).find(f=>f.id===folderId);
  if(!folder){ view = { page:'coleccion', categoryId:catId, platformId:platId }; return renderPlatformProducts(catId, platId); }
  const prods = PRODUCTS.filter(p=>p.platformId===platId && p.folderId===folderId);
  const st = folderCountsMap().get(platId+'\u0000'+folderId) || EMPTY_COUNTS;
  let html = platHeroHTML({ platId, chip: icon('folder'), chipIcon:true, title:folder.name, edit:`renameFolder('${platId}','${folderId}',this.value)`, editLabel:t('folder.rename'),
    meta:[escapeHTML(plat.name), t('folder.kicker')], st, list:prods });
  if(!prods.length){
    html += emptyStateHTML({ icon:'folder', title:t('folder.empty'), text:t('folder.empty.sub'),
      actions:`<button class="btn primary" onclick="addProductToPlatform('${catId}','${platId}','${folderId}')">${icon('plus')} ${t('fab.add_product')}</button>` });
  } else {
    html += productListBlockHTML(prods, 'folder:'+platId+'/'+folderId, folder.name);
  }
  html += `<div class="danger-zone"><h2 class="section-title">${t('common.danger_zone')}</h2>
    <button class="btn btn-danger" onclick="deleteFolder('${catId}','${platId}','${folderId}')">${icon('trash')} ${t('common.delete_folder')}</button></div>`;
  return html;
}

/* =====================================================================
   FICHA DE PIEZA
   ===================================================================== */
/* v11.1.1: la ficha ya no tiene pestaña "Fotos": las fotos se añaden, cambian
   y quitan justo debajo de la propia foto. Se conserva la función por
   compatibilidad; "fotos" lleva hasta ellas. */
async function setProductTab(tab){
  await render();
  if(tab==='fotos') requestAnimationFrame(()=>requestAnimationFrame(()=>{ const el = document.getElementById('photo-slots'); if(el) el.scrollIntoView({ block:'center' }); }));
}
function checklistProgress(p){
  const keys = checklistForCategory(p.categoryId).map(i=>i.key);
  const done = keys.filter(k=>p.components[k]).length;
  return { done, total:keys.length, pct: keys.length ? Math.round(done/keys.length*100) : 0 };
}
function completoBadgeHTML(p){
  const complete = isComplete(p, p);
  return `<span class="completo-badge ${complete?'completo-yes':'completo-no'}" id="completo_${p.id}" ${complete===null?'hidden':''}>${complete ? icon('check') : ''}${t('p.complete')}: ${complete?t('p.yes'):t('p.no')}</span>`;
}
function checklistProgressHTML(p){
  const pr = checklistProgress(p);
  return `<div class="check-progress" id="chkprog_${p.id}"><div class="microbar" aria-hidden="true"><div class="microbar-fill" style="width:${pr.pct}%;"></div></div><span class="check-progress-label">${pr.done}/${pr.total}</span></div>`;
}
/* Bloque "Clasificación": región, tipo de edición, existencia y rareza */
function productMetaHTML(p){
  const flag = (field, label)=> `<button type="button" class="chip ${p[field]?'active':''}" aria-pressed="${!!p[field]}" onclick="toggleProductFlag('${p.id}','${field}',${!p[field]})">${label}</button>`;
  let html = `<div class="field-label">${t('p.region')}</div>${regionChipsHTML(p)}
    <div class="field-label">${t('p.edition_type')}</div>
    <div class="chip-row" role="group" aria-label="${t('p.edition_type')}">${flag('standalone', t('p.dual'))}${flag('dlc', t('p.dlc'))}${flag('special', t('p.special_ed'))}</div>
    <div class="field-grid">
      ${editableSelect(t('p.existence'), p.existence, [['confirmado',t('p.existence.confirmed')],['probable',t('p.existence.probable')],['sin_confirmar',t('p.existence.unconfirmed')],['desconocido',t('p.existence.unknown')]], `updateProductField('${p.id}','existence',this.value)`)}
      ${editableSelect(t('p.rarity'), p.rareza||'', [['',t('p.rarity.undefined')],['Común',t('p.rarity.common')],['Poco común',t('p.rarity.uncommon')],['Raro',t('p.rarity.rare')],['Muy raro',t('p.rarity.veryrare')]], `updateProductField('${p.id}','rareza',this.value)`)}
    </div>`;
  if(p.existence !== 'confirmado'){
    const r = p.research || { sabemos:'', falta:'', fuentes:'', notas:'' };
    html += `<div class="research-block"><h4>${icon('research')} ${t('research.block_title')}</h4>`;
    html += editableTextarea(t('research.known'), r.sabemos, `updateResearchField('${p.id}','sabemos',this.value)`);
    html += editableTextarea(t('research.missing'), r.falta, `updateResearchField('${p.id}','falta',this.value)`);
    html += editableTextarea(t('research.sources'), r.fuentes, `updateResearchField('${p.id}','fuentes',this.value)`);
    html += editableTextarea(t('research.notes'), r.notas, `updateResearchField('${p.id}','notas',this.value)`);
    html += `</div>`;
  }
  return html;
}
function pagerHTML(p){
  const ctx = view.navCtx && LIST_CONTEXTS.get(view.navCtx);
  if(!ctx || ctx.ids.length < 2) return '';
  const i = ctx.ids.indexOf(p.id);
  if(i<0) return '';
  return `<nav class="pager" aria-label="${t('pager.label')}">
    <button type="button" class="btn btn-sm" onclick="goSibling(-1)" ${i===0?'disabled':''} aria-label="${t('pager.prev')}">${icon('chevronLeft')} <span class="pager-txt">${t('pager.prev_short')}</span></button>
    <span class="pager-pos">${t('pager.pos').replace('{i}', i+1).replace('{n}', ctx.ids.length)}${ctx.label ? ' · ' + escapeHTML(ctx.label) : ''}</span>
    <button type="button" class="btn btn-sm" onclick="goSibling(1)" ${i===ctx.ids.length-1?'disabled':''} aria-label="${t('pager.next')}"><span class="pager-txt">${t('pager.next_short')}</span> ${icon('chevronRight')}</button>
  </nav>`;
}
/* v11.1: icono de cada casilla de "Qué incluye" según su nombre */
function checklistIcon(item){
  const l = normText(item.label || item.key || '');
  if(item.key==='tengo') return 'check';
  if(/juego|cartucho|disco|game|spiel|ソフト/.test(l)) return 'cartridge';
  if(/insert|folleto|registro|flyer/.test(l)) return 'doc';
  if(/caja|box|karton|箱/.test(l)) return 'box';
  if(/manual|libro|book|説明/.test(l)) return 'book';
  return 'check';
}
const RARITY_KEYS = { 'Común':'p.rarity.common', 'Poco común':'p.rarity.uncommon', 'Raro':'p.rarity.rare', 'Muy raro':'p.rarity.veryrare' };
/* Ficha técnica (v11.2): datos de un vistazo, como en una ficha de archivo;
   cada fila lleva a donde se edita. Una columna en el móvil, dos en el ordenador. */
function productFactsHTML(p){
  const cond = p.conservation && p.conservation.general;
  const val = p.valuation && typeof p.valuation.valorActual==='number' ? fmtMoney(p.valuation.valorActual) : '';
  const reg = regionKeysFor(p).map(k=>k.label).join(' / ');
  const plat = p.platformId && getAllPlatforms().find(x=>x.id===p.platformId);
  const row = (label, value, cls, js)=> `<button type="button" class="spec-row ${cls||''}" onclick="${js}"><span class="spec-k">${label}</span><span class="spec-v">${value}</span></button>`;
  const ident = `openProductSection('identificacion')`, meta = `scrollToProductMeta('${p.id}')`;
  let rows = '';
  if(plat) rows += row(t('filter.platform'), escapeHTML(plat.name), '', `goPlatform('${plat.categoryId}','${plat.id}')`);
  rows += row(t('p.region'), reg ? escapeHTML(reg) : t('p.fact.no_region'), reg ? '' : 'is-empty', meta);
  rows += row(t('p.year'), p.year ? escapeHTML(p.year) : '—', p.year ? '' : 'is-empty', ident);
  rows += row(t('p.fact.existence'), existenceLabel(p.existence), p.existence==='confirmado' ? 'is-ok' : 'is-warn', meta);
  rows += row(t('p.fact.rarity'), p.rareza ? (RARITY_KEYS[p.rareza] ? t(RARITY_KEYS[p.rareza]) : escapeHTML(p.rareza)) : t('p.rarity.undefined'), p.rareza ? '' : 'is-empty', meta);
  rows += row(t('p.fact.condition'), cond ? escapeHTML(String(cond)) + '/10' : t('p.fact.unrated'), cond ? '' : 'is-empty', `openProductSection('conservacion')`);
  rows += row(t('p.fact.value'), val || t('p.fact.add_value'), val ? '' : 'is-action', `openProductSection('valoracion')`);
  [['p.name_jp', p.nameJp], ['p.language', p.language], ['p.catalog_num', p.catalogNumber], ['p.product_code', p.productCode], ['p.barcode', p.barcode && typeof formatBarcode==='function' ? formatBarcode(p.barcode) : p.barcode], ['p.exact_date', p.releaseDateExact]]
    .forEach(([k, v])=>{ if(v) rows += row(t(k), escapeHTML(v), '', ident); });
  return `<div class="spec">${rows}</div>`;
}
/* Abre una sección plegable de la ficha y la trae a la vista (sin redibujar) */
function openProductSection(key){
  const d = document.querySelector(`#panel details.disclosure[ontoggle*="['${key}']"]`);
  if(!d) return;
  d.open = true; productSectionsOpen[key] = true;
  d.scrollIntoView({ block:'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  const s = d.querySelector('summary'); if(s) s.focus({ preventScroll:true });
}
function scrollToProductMeta(id){
  const el = document.getElementById('product-meta-'+id);
  if(!el) return;
  const sec = el.closest('.detail-section') || el;
  sec.scrollIntoView({ block:'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}
/* "En la misma estantería": las otras piezas de su plataforma */
function shelfSiblingsHTML(p){
  if(!p.platformId) return '';
  const all = sortGames(PRODUCTS.filter(x=>x.platformId===p.platformId));
  const sibs = all.filter(x=>x.id!==p.id);
  if(!sibs.length) return '';
  const plat = getAllPlatforms().find(x=>x.id===p.platformId);
  registerListContext(all.map(x=>x.id), plat ? plat.name : '');
  const link = plat ? `<button type="button" class="link-btn shelf-link" onclick="goPlatform('${plat.categoryId}','${plat.id}')">${escapeHTML(plat.name)} · ${all.length}</button>` : '';
  return `<section class="detail-section">${sectionTitleHTML(t('p.shelf'), link)}<div class="h-scroll">${sibs.slice(0, 12).map(miniCoverHTML).join('')}</div></section>`;
}
async function renderProductDetail(prodId){
  const p = PRODUCTS_BY_ID[prodId];
  const metaLine = [p.platformName, p.year, regionKeysFor(p).map(k=>k.label).join(' / ')].filter(Boolean).map(escapeHTML).join(' · ');
  const anyPhoto = hasPhoto(p.id,'front') || hasPhoto(p.id,'back');
  const pv = platVisual(p.platformId);
  let html = pagerHTML(p);
  // v11.1.1: la foto manda y se gestiona ahí mismo (sin pestaña aparte)
  html += `<div class="product-layout"><aside class="product-aside" style="--plat:${pv.color}">${productPhotosHTML(p, anyPhoto)}</aside><div class="product-main">`;
  // nombre protagonista y, debajo, una sola línea de datos (plataforma · año · región)
  html += `<header class="screen-head product-head">
    <input type="text" class="h1-edit" value="${escapeHTML(p.name)}" onchange="updateProductField('${p.id}','name',this.value)" aria-label="${escapeHTML(t('p.edit_name'))}" title="${escapeHTML(t('p.edit_name'))}">
    <p class="product-meta">${pv.code ? `<span class="code-chip" style="--plat:${pv.color}" aria-hidden="true">${escapeHTML(pv.code)}</span>` : ''}<span>${metaLine || t('p.kicker')}</span></p>
  </header>`;
  // estado en la colección: el botón principal y, al lado, solo los estados que aplican
  html += `<div class="product-status">
    ${possessButtonHTML(p, 'possess-main')}
    <div class="status-chips">${completoBadgeHTML(p)}${productBadgesHTML(p, { noRegion:true })}</div>
  </div>`;
  // v11.11: si la tienes, cuántas y en qué estado está cada copia; si te falta, su ficha de búsqueda
  if(p.possession==='tengo') html += copiesSectionHTML(p);
  else html += busquedaSectionHTML(p);
  // v11.6: si te falta, dónde buscarla a la venta (con su nombre original si lo tiene)
  if(p.possession!=='tengo' && typeof huntHTML==='function') html += `<div class="detail-section hunt-section">${huntHTML(p, 'ficha')}</div>`;
  // v11.11: dónde está en tu estantería
  if(typeof estPieceRowHTML==='function') html += estPieceRowHTML(p);
  const multi = copyCount(p) > 1;
  const c1 = multi ? ` · ${escapeHTML(t('copy.n').replace('{n}', 1))}` : '';
  // Qué incluye (checklist en fichas táctiles; mismas casillas de siempre)
  html += `<section class="detail-section">${sectionTitleHTML(t('p.includes') + c1, `<button type="button" class="btn btn-sm" onclick="markComplete('${p.id}')">${icon('checkCircle')} ${plainLabel(t('p.mark_complete'))}</button>`)}
    ${checklistProgressHTML(p)}
    <div class="checklist checklist-chips">
      ${checklistForCategory(p.categoryId).map(item=> checkItem(escapeHTML(checklistLabel(item)), p.components[item.key], `updateComponent('${p.id}','${item.key}',this.checked)`, false, `chk_${p.id}_${item.key}`, checklistIcon(item))).join('')}
      ${checkItem(t('p.sealed'), p.sealed, `updateEditionField('${p.id}','sealed',this.checked)`, true, `chk_${p.id}_sealed`, 'shield')}
    </div></section>`;
  // Ficha técnica (cada dato lleva a donde se edita)
  html += `<section class="detail-section">${sectionTitleHTML(t('p.facts'))}${productFactsHTML(p)}</section>`;
  // Clasificación
  html += `<section class="detail-section">${sectionTitleHTML(t('p.classification'))}<div id="product-meta-${p.id}">${productMetaHTML(p)}</div></section>`;
  // Secciones plegables
  let identBody = `<div class="field-grid">`;
  identBody += editableField('text', t('p.year'), p.year, `updateProductField('${p.id}','year',this.value)`, '', 'inputmode="numeric"');
  identBody += editableField('text', t('p.name_jp'), p.nameJp, `updateProductField('${p.id}','nameJp',this.value)`, '', 'lang="ja"');
  identBody += editableField('text', t('p.language'), p.language, `updateEditionField('${p.id}','language',this.value)`);
  identBody += editableField('text', t('p.catalog_num'), p.catalogNumber, `updateEditionField('${p.id}','catalogNumber',this.value)`);
  identBody += editableField('text', t('p.product_code'), p.productCode, `updateEditionField('${p.id}','productCode',this.value)`);
  identBody += editableField('text', t('p.barcode'), p.barcode, `updateEditionField('${p.id}','barcode',this.value)`, '', 'inputmode="numeric"');
  identBody += editableField('text', t('p.exact_date'), p.releaseDateExact, `updateEditionField('${p.id}','releaseDateExact',this.value)`, t('p.date_ph'));
  identBody += `</div>`;
  // v11.11: formato (para su plano y la estantería) y medidas
  const dd = piezaDims(p);
  identBody += `<div class="spec ident-extra">
    <button type="button" class="spec-row" onclick="openFormatoSheet('${p.id}')"><span class="spec-k">${t('fmt.label')}</span><span class="spec-v">${escapeHTML(formatoLabel(formatoDe(p)))}</span></button>
    <button type="button" class="spec-row ${dd.exact ? '' : 'is-empty'}" onclick="openMedidasSheet('${p.id}')"><span class="spec-k">${t('dims.label')}</span><span class="spec-v">${(dd.exact ? '' : '≈ ') + [dd.w, dd.h, dd.d].map(fmtCm).join(' × ')} cm</span></button>
  </div>`;
  identBody += tagsEditorHTML(p);   // v11.19: también se añaden y se quitan
  // resumen a la derecha de cada sección, como en una ficha de archivo
  const nIdent = [p.year, p.nameJp, p.language, p.catalogNumber, p.productCode, p.barcode, p.releaseDateExact].filter(Boolean).length + ((p.tags||[]).length ? 1 : 0);
  let sections = disclosureHTML('identificacion', t('p.identification'), identBody, productSectionsOpen, nIdent ? fmtCount(nIdent, 'p.data_one', 'p.data_many') : '');

  let consBody = `<div class="field-grid">${conservationSelect(t('p.condition_general'), p.conservation.general, `updateConservation('${p.id}','general',this.value)`)}</div>`
    + editableTextarea(t('p.condition_notes'), p.conservation.notas, `updateConservation('${p.id}','notas',this.value)`);
  sections += disclosureHTML('conservacion', t('p.conservation') + c1, consBody, productSectionsOpen, p.conservation.general ? p.conservation.general + '/10' : '');

  let valBody = `<div class="field-grid">
    ${numberField(t('p.value_bought')+' ('+currencySymbol()+')', p.valuation.valorAdquisicion, `updateValuation('${p.id}','valorAdquisicion',this.value)`)}
    ${numberField(t('p.value_now')+' ('+currencySymbol()+')', p.valuation.valorActual, `updateValuation('${p.id}','valorActual',this.value)`)}
  </div>${p.valuation.fechaActualizacion ? `<div class="section-sub">${t('p.last_updated')}: ${escapeHTML(p.valuation.fechaActualizacion)}</div>` : ``}`;
  sections += disclosureHTML('valoracion', t('p.valuation'), valBody, productSectionsOpen, typeof p.valuation.valorActual==='number' ? fmtMoney(p.valuation.valorActual) : '');
  sections += loanSectionHTML(p);   // v11.19: compra y préstamo

  const notasBody = editableTextarea(t('p.summary'), p.summary, `updateProductField('${p.id}','summary',this.value)`)
    + editableTextarea(t('p.notes_field'), p.notes, `updateProductField('${p.id}','notes',this.value)`);
  sections += disclosureHTML('notas', t('p.notes'), notasBody, productSectionsOpen, (p.summary||p.notes) ? t('p.has_text') : '');

  const cfBody = customFieldsHTML(p) + `<div class="quick-actions is-flush"><button class="btn btn-sm" onclick="addCustomField('${p.id}')">${icon('plus')} ${plainLabel(t('p.add_custom_field'))}</button></div>`;
  sections += disclosureHTML('general', t('p.custom_fields'), cfBody, productSectionsOpen, (p.customFields||[]).length ? String(p.customFields.length) : '');

  const moveBody = `<div class="field-grid" data-nosave>
    <div class="field"><label for="movecat_${p.id}">${t('p.move_category')}</label><select id="movecat_${p.id}" onchange="moveToolCategoryChanged('${p.id}')">
      ${getAllCategories().map(c=>`<option value="${c.id}" ${c.id===p.categoryId?'selected':''}>${escapeHTML(c.name)}</option>`).join('')}
    </select></div>
    <div class="field"><label for="moveplat_${p.id}">${t('p.move_platform')}</label><select id="moveplat_${p.id}" onchange="moveToolPlatformChanged('${p.id}')">${moveToolPlatformOptions(p.categoryId, p.platformId)}</select></div>
  </div>
  <div class="field-grid" data-nosave><div class="field"><label for="movefolder_${p.id}">${t('p.move_folder')}</label><select id="movefolder_${p.id}">${moveToolFolderOptions(p.platformId, p.folderId)}</select></div></div>
  <button class="btn" onclick="confirmMoveProduct('${p.id}')">${icon('shuffle')} ${t('p.move_here')}</button>`;
  sections += disclosureHTML('mover', t('p.move'), moveBody, productSectionsOpen);
  html += `<section class="detail-section">${sectionTitleHTML(t('p.details'))}${sections}</section>`;
  html += shelfSiblingsHTML(p);

  html += `<div class="src-line">${t('p.source')}: ${escapeHTML(p.src||'—')} · ID ${escapeHTML(p.id)}</div>`;
  html += `<div class="danger-zone"><h2 class="section-title">${t('common.danger_zone')}</h2>
    <button class="btn btn-danger" onclick="deleteProduct('${p.id}')">${icon('trash')} ${t('common.delete_product')}</button></div>`;
  html += `</div></div>`;
  return html;
}

function moveToolPlatformOptions(catId, currentPlatId){
  const plats = getAllPlatforms().filter(x=>x.categoryId===catId);
  if(!plats.length) return `<option value="">${t('p.move_no_platforms')}</option>`;
  return plats.map(pl=>`<option value="${pl.id}" ${pl.id===currentPlatId?'selected':''}>${escapeHTML(pl.name)}</option>`).join('');
}
function moveToolFolderOptions(platId, currentFolderId){
  const folders = foldersForPlatform(platId);
  let html = `<option value="">${t('p.move_no_folder')}</option>`;
  html += folders.map(f=>`<option value="${f.id}" ${f.id===currentFolderId?'selected':''}>${escapeHTML(f.name)}</option>`).join('');
  return html;
}
function moveToolCategoryChanged(productId){
  const catSel = document.getElementById('movecat_'+productId);
  const platSel = document.getElementById('moveplat_'+productId);
  if(platSel) platSel.innerHTML = moveToolPlatformOptions(catSel.value, null);
  moveToolPlatformChanged(productId);
}
function moveToolPlatformChanged(productId){
  const platSel = document.getElementById('moveplat_'+productId);
  const folderSel = document.getElementById('movefolder_'+productId);
  if(folderSel) folderSel.innerHTML = moveToolFolderOptions(platSel ? platSel.value : '', null);
}

/* ---------- Fotos de la ficha (v11.1.1) ----------
   Con foto: la foto grande (tocar = voltear si hay trasera, o ampliar),
   "Ampliar", y debajo sus dos caras, cada una con Cambiar y Quitar. Sin
   ninguna foto: dos huecos grandes, delantera y trasera, que abren la cámara
   o la galería. Todo en el mismo sitio, sin pestaña aparte. */
function productPhotosHTML(p, anyPhoto){
  // v11.11: si te falta y no tiene foto, su plano (con medidas) y, debajo, los botones para añadir fotos
  if(!anyPhoto && p.possession!=='tengo'){
    return planoBigHTML(p) + `<div class="photo-pick-row" id="photo-slots">${['front','back'].map(side=> photoPickerHTML('btn btn-sm', 'photo_' + p.id + '_' + side,
        `${icon('camera')} ${t(side==='back' ? 'photo.add_back' : 'photo.add_front')}`, t(side==='back' ? 'photo.add_back' : 'photo.add_front') + ' — ' + p.name)).join('')}</div>` + extraPhotosHTML(p);
  }
  const multi = copyCount(p) > 1;
  return (multi ? `<p class="photo-copy-label">${icon('camera')} ${escapeHTML(t('copy.photos_of').replace('{n}', 1))}</p>` : '') + productMainPhotosHTML(p, anyPhoto)
    + (p.possession==='tengo' ? sidePhotosHTML(p, p.id, 'ficha') : '') + extraPhotosHTML(p);
}
/* v11.14: los otros 4 lados de la caja (lomo, lado contrario, arriba y abajo), para que
   en la estantería 3D se vea como la tuya. Son de una copia concreta (photoId), igual
   que su portada. ctx: 'ficha' (la copia 1), 'copy' (hoja de una copia) o 'est'
   (estantería): cambia solo qué se refresca al guardar o quitar. */
function sidePhotosHTML(p, photoId, ctx){
  const onAdd = ctx==='copy' ? 'onCopyPhotoChange' : ctx==='est' ? 'estSidePhotoChange' : 'onPhotoSlotChange';
  const onRm = ctx==='copy' ? 'removeCopyPhoto' : ctx==='est' ? 'estSidePhotoRemove' : 'removePhotoSlot';
  const pid = escapeHTML(photoId), used = sideSlotsFor(photoId).length;
  const tiles = SIDE_SLOTS.map(side=>{
    const label = photoSideLabel(side), glyph = `<span class="side-glyph is-${side}" aria-hidden="true"></span>`;
    if(hasPhoto(photoId, side)){
      return `<div class="side-tile"><div class="side-photo">
        <button type="button" class="side-thumb" data-fk="sd-${side}" onclick="openPhotoViewer('${pid}','${side}')" aria-label="${escapeHTML(t('photo.enlarge') + ' — ' + label)}">${photoImgHTML(p, side, 'thumb', 'data-eager="1"', photoId)}</button>
        <button type="button" class="slot-btn slot-remove side-remove" data-fk="sd-rm-${side}" onclick="${onRm}('${escapeHTML(photoKeyFor(photoId, side))}')" title="${escapeHTML(t('photo.remove'))}">${icon('trash')}<span class="sr-only">${escapeHTML(t('photo.remove') + ' — ' + label)}</span></button>
      </div><span class="side-cap">${glyph}${escapeHTML(label)}</span></div>`;
    }
    return `<div class="side-tile"><label class="side-add photo-picker" data-fk="sd-add-${side}">${icon('camera')}<span class="side-add-txt">${t('photo.add_extra_short')}</span><input type="file" accept="image/*" class="sr-only" aria-label="${escapeHTML(t('photo.side_add').replace('{s}', label) + ' — ' + p.name)}" onchange="${onAdd}(this,'photo_${pid}_${side}')"></label><span class="side-cap">${glyph}${escapeHTML(label)}</span></div>`;
  }).join('');
  const hid = 'photo-sides-t-' + ctx;
  return `<section class="photo-sides" aria-labelledby="${hid}">
    <div class="photo-extras-head"><span class="slot-label" id="${hid}">${t('photo.sides')}</span><span class="photo-extras-count">${used} / ${SIDE_SLOTS.length}</span></div>
    <div class="side-grid">${tiles}</div>
    <p class="photo-note">${t(used ? 'photo.sides_note_short' : 'photo.sides_note')}</p>${ctx==='ficha' && shownPhotoId(p)!==photoId ? (()=>{ const sc = copyForPhotoId(shownPhotoId(p)); return sc ? `<p class="photo-note is-warn">${icon('camera')} ${escapeHTML(t('photo.sides_other_copy').replace(/\{n\}/g, sc.n))}</p>` : ''; })() : ''}
  </section>`;
}
/* v11.3: hasta 4 fotos extra para documentar lo que no se ve en la portada
   (manual, insertos, cartucho, precinto, ticket…). Tocar una la abre en el
   visor, donde se puede pasar de una foto a otra. */
function extraPhotosHTML(p){
  const used = orderedExtraSides(p.id);   // v11.19: en tu orden
  const free = freeExtraSlot(p.id);
  const many = used.length > 1;
  const tiles = used.map(side=>{
    const label = photoSideLabel(side), note = photoNoteOf(p.id, side), nm = photoMarksOf(p.id, side).length;
    // v11.19: asa para cambiarla de sitio (arrastrar, o ← → con el teclado) y su pie de foto
    return `<div class="extra-tile" data-side="${side}">
      <button type="button" class="extra-thumb" onclick="openPhotoViewer('${p.id}','${side}')" aria-label="${escapeHTML(t('photo.show_extra').replace('{n}', label) + (note ? ': ' + note : '') + (nm ? ' · ' + t('mk.count').replace('{n}', nm) : ''))}">${photoImgHTML(p, side, 'thumb', 'data-eager="1"')}${nm ? `<span class="mk-badge" aria-hidden="true">${icon('pin')}${nm}</span>` : ''}</button>
      <button type="button" class="slot-btn slot-remove extra-remove" onclick="removePhotoSlot('${photoKeyFor(p.id, side)}')" title="${escapeHTML(t('photo.remove'))}">${icon('trash')}<span class="sr-only">${escapeHTML(t('photo.remove') + ' — ' + label)}</span></button>
      ${many ? `<button type="button" class="slot-btn extra-grip" data-fk="xg-${side}" onpointerdown="extraDragStart(event,'${p.id}','${side}')" onkeydown="extraKey(event,'${p.id}','${side}')" title="${escapeHTML(t('photo.move_hint'))}" aria-label="${escapeHTML(t('photo.move').replace('{s}', label))}" aria-describedby="photo-extras-move">${icon('grip')}</button>` : ''}
      <button type="button" class="extra-note${note ? '' : ' is-empty'}" data-fk="xn-${side}" onclick="editPhotoNote('${p.id}','${side}')" aria-label="${escapeHTML((note ? t('photo.note_edit') + ': ' + note : t('photo.note_add')) + ' — ' + label)}">${note ? escapeHTML(note) : `${icon('pencil')}<span>${t('photo.note_short')}</span>`}</button>
    </div>`;
  }).join('');
  // se pueden elegir varias a la vez (van a los huecos libres, por orden)
  const add = free ? `<label class="extra-add photo-picker">${icon('plus')}<span class="extra-add-txt">${t('photo.add_extra_short')}</span><input type="file" accept="image/*" multiple class="sr-only" aria-label="${escapeHTML(t('photo.add_extra') + ' — ' + p.name)}" onchange="onExtraPhotosChange(this,'${p.id}')"></label>` : '';
  return `<section class="photo-extras" id="photo-extras" aria-labelledby="photo-extras-title">
    <div class="photo-extras-head"><span class="slot-label" id="photo-extras-title">${t('photo.extras')}</span><span class="photo-extras-count">${used.length} / ${EXTRA_SLOTS.length}</span></div>
    <div class="extra-grid">${tiles}${add}</div>
    ${used.length ? (many ? `<p class="photo-note" id="photo-extras-move">${t('photo.move_hint')}</p>` : '') : `<p class="photo-note">${t('photo.extras_note')}</p>`}
  </section>`;
}
function productMainPhotosHTML(p, anyPhoto){
  if(!anyPhoto){
    return `<div class="product-photo is-empty" id="photo-slots"><div class="photo-pick-grid">
      ${['front','back'].map(side=> photoPickerHTML('cover-empty cover-empty-lg', 'photo_' + p.id + '_' + side,
          `${icon('camera')}<span class="cover-empty-txt">${t(side==='back' ? 'photo.add_back' : 'photo.add_front')}</span>`,
          t(side==='back' ? 'photo.add_back' : 'photo.add_front') + ' — ' + p.name)).join('')}
    </div><p class="photo-note">${t('photo.editor_intro')}</p></div>`;
  }
  const flippable = hasPhoto(p.id, 'back');
  return `<div class="product-photo">${flipViewHTML(p, { size:'full', tap:'zoom', hint:false })}</div>
    <div class="photo-actions">
      <button type="button" class="btn btn-sm btn-ghost" onclick="openPhotoViewer('${p.id}', visiblePhotoSide())">${icon('expand')} ${t('photo.enlarge')}</button>
      ${flippable ? `<button type="button" class="btn btn-sm btn-ghost" onclick="flipCard(document.querySelector('.product-photo .flip-card'))">${icon('flip')} ${t('photo.flip')}</button>` : ''}
    </div>
    <div class="photo-slots" id="photo-slots">${photoSlotHTML(p, 'front')}${photoSlotHTML(p, 'back')}</div>`;
}
function photoSlotHTML(p, side){
  const key = 'photo_' + p.id + '_' + side;
  const label = t(side==='back' ? 'photo.back' : 'photo.front');
  if(!hasPhoto(p.id, side)){
    const add = t(side==='back' ? 'photo.add_back' : 'photo.add_front');
    return `<div class="photo-slot is-empty">
      ${photoPickerHTML('slot-thumb slot-add', key, icon('plus'), add)}
      <div class="slot-body"><span class="slot-label">${label}</span><span class="slot-note">${add}</span></div>
    </div>`;
  }
  const btn = (inner, text)=> `${inner}<span class="sr-only">${text}</span>`;
  return `<div class="photo-slot" data-side="${side}">
    <button type="button" class="slot-thumb" onclick="showPhotoSide('${p.id}','${side}')" aria-label="${escapeHTML(t(side==='back' ? 'photo.show_back' : 'photo.show_front') + (photoMarksOf(p.id, side).length ? ' · ' + t('mk.count').replace('{n}', photoMarksOf(p.id, side).length) : ''))}">${photoImgHTML(p, side, 'thumb', 'data-eager="1"')}${(()=>{ const nm = photoMarksOf(p.id, side).length; return nm ? `<span class="mk-badge" aria-hidden="true">${icon('pin')}${nm}</span>` : ''; })()}</button>
    <div class="slot-body"><span class="slot-label">${label}</span>
      <span class="slot-actions">${photoPickerHTML('slot-btn', key, btn(icon('camera'), t('photo.replace')), t('photo.replace') + ' — ' + label).replace('<label ', `<label title="${escapeHTML(t('photo.replace'))}" `)}
        <button type="button" class="slot-btn slot-remove" onclick="removePhotoSlot('${photoKeyFor(p.id, side) || key}')" title="${escapeHTML(t('photo.remove'))}">${btn(icon('trash'), t('photo.remove') + ' — ' + label)}</button></span>
    </div>
  </div>`;
}
/* Cara que se ve ahora en la foto grande de la ficha */
function visiblePhotoSide(){
  const card = document.querySelector('.product-photo .flip-card');
  return card && card.classList.contains('flipped') ? 'back' : 'front';
}
/* Miniatura de una cara: la muestra en la foto grande; si ya se está viendo, la amplía */
function showPhotoSide(id, side){
  const card = document.querySelector('.product-photo .flip-card');
  if(!card) return;
  if(visiblePhotoSide()===side || card.dataset.flippable!=='1'){ openPhotoViewer(id, side); return; }
  flipCard(card);
  card.scrollIntoView({ block:'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}

/* Refrescos parciales (sin redibujar la ficha entera) */
function refreshCompletoBadge(id){
  const rec = EDITIONS_BY_ID[id]; if(!rec) return;
  const p = rec.product;
  const el = document.getElementById('completo_'+id);
  if(el) el.outerHTML = completoBadgeHTML(p);
  const pr = document.getElementById('chkprog_'+id);
  if(pr) pr.outerHTML = checklistProgressHTML(p);
}
function refreshProductMeta(id){
  const p = PRODUCTS_BY_ID[id]; if(!p) return;
  const el = document.getElementById('product-meta-'+id);
  if(el) el.innerHTML = productMetaHTML(p);
}

/* =====================================================================
   INVENTARIO: búsqueda + filtros combinables
   ===================================================================== */
/* La cabecera (buscador, filtros, orden) y la lista de resultados se pintan
   por separado: al escribir solo se rehace la lista (#inv-results), así el
   campo no pierde el foco ni se cierra el teclado. */
const INV_FLAG_KEYS = [['standalone','p.dual'],['dlc','p.dlc'],['special','p.special_ed']];
function advancedFilterCount(){
  return (invState.cat?1:0) + (invState.plat?1:0) + (invState.region?1:0) + (invState.flags||[]).length + (invState.photo?1:0) + (invState.complete?1:0);
}
function productRegionCodes(p){
  return regionKeysFor(p).map(k=>k.code).filter(Boolean);
}
function inventoryFilteredEditions(stateOverride){
  const st = stateOverride || invState;
  let list = PRODUCTS;
  const tokens = searchTokens(st.search);
  if(tokens.length) list = list.filter(p => productMatchesSearch(p, tokens));
  if(st.filter==='tengo') list = list.filter(p=>p.possession==='tengo');
  if(st.filter==='falta') list = list.filter(p=>p.possession!=='tengo');
  if(st.filter==='sinconfirmar') list = list.filter(p=>p.existence!=='confirmado');
  if(st.filter==='sellado') list = list.filter(p=>p.sealed || shownSealed(p));   // v11.11: también si la mejor copia lo está
  if(st.filter==='repetidas') list = list.filter(p=>copyCount(p) > 1);
  if(st.filter==='prestadas') list = list.filter(isLoaned);   // v11.19
  if(st.cat) list = list.filter(p=>p.categoryId===st.cat);
  if(st.plat) list = list.filter(p=>p.platformId===st.plat);
  if(st.region==='none') list = list.filter(p=>regionKeysFor(p).length===0);
  else if(st.region) list = list.filter(p=>productRegionCodes(p).includes(st.region));
  (st.flags||[]).forEach(f=>{ list = list.filter(p=>!!p[f]); });
  if(st.photo==='with') list = list.filter(p=>hasPhoto(p.id,'front'));
  if(st.photo==='without') list = list.filter(p=>!hasPhoto(p.id,'front'));
  if(st.complete==='yes') list = list.filter(p=>isComplete(p,p)===true);
  if(st.complete==='no') list = list.filter(p=>isComplete(p,p)===false);
  const eds = list.map(p=>({ product:p, edition:p }));
  eds.sort((a,b)=>{
    if(st.sort==='anio'){
      const ya = parseInt(a.edition.year,10); const yb = parseInt(b.edition.year,10);
      const na = isNaN(ya)?9999:ya; const nb = isNaN(yb)?9999:yb;
      if(na!==nb) return na-nb;
      return compareNames(a.product.name, b.product.name);
    }
    if(st.sort==='nombre') return compareNames(a.product.name, b.product.name);
    if(st.sort==='plataforma') return compareNames(a.product.platformName, b.product.platformName);
    if(INV_SORT_NEW[st.sort]) return productCmp(st.sort)(a.product, b.product);   // v11.19
    return 0;
  });
  return eds;
}
function activeFiltersHTML(){
  const chips = [];
  const rm = (label, js)=> `<button type="button" class="chip chip-remove" onclick="${js}" aria-label="${t('filter.remove')}: ${escapeHTML(label)}">${escapeHTML(label)}<span class="chip-x">${icon('x')}</span></button>`;
  if(invState.cat){ const c = getAllCategories().find(x=>x.id===invState.cat); chips.push(rm(t('filter.category')+': '+(c?c.name:'?'), "invSetFilter('cat','')")); }
  if(invState.plat){ const p = getAllPlatforms().find(x=>x.id===invState.plat); chips.push(rm(t('filter.platform')+': '+(p?p.name:'?'), "invSetFilter('plat','')")); }
  if(invState.region) chips.push(rm(t('filter.region')+': '+(invState.region==='none' ? t('filter.no_region') : (REGION_CODES[invState.region]||invState.region)), "invSetFilter('region','')"));
  (invState.flags||[]).forEach(f=>{ const k = INV_FLAG_KEYS.find(x=>x[0]===f); chips.push(rm(t(k?k[1]:f), `invToggleFlag('${f}')`)); });
  if(invState.photo) chips.push(rm(t(invState.photo==='with'?'filter.with_photo':'filter.without_photo'), "invSetFilter('photo','')"));
  if(invState.complete) chips.push(rm(t(invState.complete==='yes'?'filter.complete_yes':'filter.complete_no'), "invSetFilter('complete','')"));
  if(!chips.length) return '';
  return `<div class="active-filters" aria-label="${t('filter.active')}">${chips.join('')}<button type="button" class="link-btn" onclick="clearInvFilters()">${t('filter.clear_all')}</button></div>`;
}
function renderInventarioResults(){
  let eds = inventoryFilteredEditions();
  const total = eds.length;
  const vw = uiPref('invView', 'list');
  const grp = invGroupMode();
  if(grp) eds = invGroupSort(eds, grp);   // v11.19: por grupos (dentro, en el orden elegido)
  const shown = eds.slice(0, invState.limit);
  registerListContext(eds.map(x=>x.product.id), t('inv.title'));
  _invOrder = eds.map(x=>x.product);
  const selecting = !!invState.sel;
  // v11.2: el número de resultados y, a su derecha, cómo verlos (lista, portadas, muro)
  let html = `<div class="toolbar results-bar"><span class="result-count" role="status">${fmtCount(total,'count.result_one','count.result_many')}</span>
    <div class="toolbar-right">${invState.filter==='falta' && total>0 ? `<button class="btn btn-sm" onclick="printMissingList()">${icon('printer')} ${t('inv.print_missing')}</button>` : ''}${total && vw!=='wall' ? `<button type="button" class="btn btn-sm${selecting ? ' primary' : ''}" data-fk="inv-pick" aria-pressed="${selecting}" onclick="invPickMode(${selecting ? 'false' : 'true'})">${icon('multi')} ${t(selecting ? 'bulk.done' : 'bulk.pick')}</button>` : ''}${viewToggleHTML(vw, "setInvView('{v}')", true)}</div></div>`;
  if(!total){
    const anyFilter = invState.search || invState.filter!=='todos' || advancedFilterCount();
    return html + emptyStateHTML({ icon:'search', title: anyFilter ? t('filter.no_results') : t('inv.empty.title'), text: anyFilter ? t('filter.no_results_text') : t('inv.empty'),
      actions: anyFilter ? `<button class="btn" onclick="clearInvFilters(true)">${t('filter.clear_all')}</button>`
             : (getAllCategories().length ? `<button class="btn primary" onclick="openQuickAdd()">${icon('plus')} ${t('fab.add_product')}</button>` : '') });
  }
  if(invState.filter==='repetidas') html += repeatedSummaryHTML(eds.map(x=>x.product));   // v11.11
  if(vw==='wall') return html + wallHTML(eds, total, grp);
  const item = (p)=> vw==='grid' ? productCardHTML(p) : productRowHTML(p, { showId:true, copies: invState.filter==='repetidas' });
  const wrap = (items)=> vw==='grid' ? `<div class="title-grid">${items.map(item).join('')}</div>` : `<div class="item-list">${items.map(item).join('')}</div>`;
  let body = '';
  if(grp) body = invGroupsHTML(eds, grp, wrap);
  else {
    body = wrap(shown.map(x=>x.product));
    if(total > invState.limit) body += `<button class="btn load-more" onclick="invState.limit+=60; render();">${t('inv.load_more').replace('{n}', total - invState.limit)}</button>`;
  }
  html += invIndexHTML(grp);   // (al lado de la lista; se queda a la vista al bajar)
  html += `<div class="inv-body${selecting ? ' is-selecting' : ''}">${body}</div>`;
  if(selecting) html += invBulkBarHTML();
  return html;
}
/* v11.1: vista "Muro" — solo las fotos, agrupadas por año (o por plataforma
   si ordenas por plataforma). Tocar una pieza abre su ficha. */
function wallTileHTML(p){
  const pv = platVisual(p.platformId);
  const photoId = shownPhotoId(p);   // v11.11: la mejor copia
  const has = hasPhoto(photoId,'front');
  const miss = p.possession!=='tengo';
  const n = copyCount(p);
  const label = [p.name, p.platformName, p.year, regionShortText(p)].filter(Boolean).join(' · ') + (miss ? ' — ' + t('cover.missing') : '') + (n > 1 ? ' — ' + t('copy.count_title').replace('{n}', n) : '');
  return `<button type="button" class="wall-tile ${coverStateClass(p)}" data-pid="${escapeHTML(p.id)}" style="--plat:${pv.color}" onclick="goProduct('${p.id}')" aria-label="${escapeHTML(label)}" title="${escapeHTML(label)}">
    ${has ? photoImgHTML(p,'front','thumb','',photoId) : miss ? planoMiniHTML(p) : `<span class="wall-code">${escapeHTML(pv.code)}</span>`}
    ${shownSealed(p) ? `<span class="cover-seal">${icon('shield')}</span>` : ''}
    ${n > 1 ? `<span class="qty-badge is-small${copiesOf(p).some(c=>c.paraCambio) ? ' is-trade' : ''}" aria-hidden="true">×${n}</span>` : ''}
  </button>`;
}
function wallHTML(eds, total, grp){
  const lim = Math.max(invState.limit, 120);
  const shown = eds.slice(0, lim).map(x=>x.product);
  const groupKey = grp ? (p=> invGroupLabel(grp, invGroupKey(grp, p)).name)   // v11.19
                 : invState.sort==='anio' ? (p=>{ const y = parseInt(p.year,10); return isNaN(y) ? '—' : String(y); })
                 : invState.sort==='plataforma' ? (p=>p.platformName || '—') : null;
  let html = '';
  if(groupKey){
    const groups = [];
    shown.forEach(p=>{ const k = groupKey(p); const g = groups[groups.length-1]; if(g && g.k===k) g.items.push(p); else groups.push({ k, items:[p] }); });
    html += groups.map(g=>`<section class="wall-group"><h3 class="wall-head"><span>${escapeHTML(g.k)}</span><span class="muted">${fmtCount(g.items.length,'count.item_one','count.item_many')}</span></h3>
      <div class="wall">${g.items.map(wallTileHTML).join('')}</div></section>`).join('');
  } else {
    html += `<div class="wall">${shown.map(wallTileHTML).join('')}</div>`;
  }
  html += `<div class="wall-legend"><span><span class="wl-seal">${icon('shield')}</span>${t('wall.sealed')}</span><span><span class="wl-miss"></span>${t('cover.missing')}</span><span>${t('wall.tap')}</span></div>`;
  if(total > lim){
    html += `<button class="btn load-more" onclick="invState.limit=${lim}+60; render();">${t('inv.load_more').replace('{n}', total - lim)}</button>`;
  }
  return html;
}
/* Plataformas con piezas (en el orden de su categoría) para la hoja de filtros */
function invFilterPlatforms(){
  const counts = platformCountsMap();
  const plats = [];
  getAllCategories().forEach(c=>{ if(invState.cat && c.id!==invState.cat) return; orderedPlatformsForCategory(c.id, getAllPlatforms().filter(p=>p.categoryId===c.id)).forEach(p=>{ if((counts.get(p.id)||EMPTY_COUNTS).total || invState.plat===p.id) plats.push(p); }); });
  return plats;
}
function renderInventario(){
  const nAdv = advancedFilterCount();
  let html = screenHeadHTML({ kicker:t('inv.kicker'), title:t('inv.title') });
  html += searchbarHTML({ placeholder:t('inv.search.ph_short'), value:invState.search, oninput:'invSearch(this.value)', scan:'icon' });
  html += savedFiltersHTML();   // v11.19: tus filtros guardados
  html += `<div class="chip-scroll" role="group" aria-label="${t('filter.quick')}">
    ${chip(t('inv.chip.all'),'todos')}${chip(t('inv.chip.have'),'tengo')}${chip(t('inv.chip.missing'),'falta')}${chip(t('inv.chip.unconfirmed'),'sinconfirmar')}${chip(t('inv.chip.sealed'),'sellado')}${invState.filter==='repetidas' || repeatedStats().pieces ? chip(t('inv.chip.dups'),'repetidas') : ''}${invState.filter==='prestadas' || PRODUCTS.some(isLoaned) ? chip(t('inv.chip.loaned'),'prestadas') : ''}
  </div>`;
  html += `<div class="toolbar inv-toolbar">
    <span class="inv-toolbar-left"><button type="button" class="btn btn-sm filter-btn" onclick="openFilterSheet()" aria-haspopup="dialog">${icon('filter')} ${t('filter.title')}${nAdv ? ` <span class="count-dot">${nAdv}</span>` : ''}</button>${sfCanSave() ? `<button type="button" class="btn btn-sm" data-fk="sf-save" onclick="sfSave()">${icon('bookmark')} ${t('sf.save')}</button>` : ''}</span>
    <div class="toolbar-right">
      <label class="sr-only" for="invSortSel">${t('sort.label')}</label>
      <select id="invSortSel" class="select-compact" onchange="invSort(this.value)">
        <option value="anio" ${invState.sort==='anio'?'selected':''}>${t('inv.sort.year')}</option>
        <option value="nombre" ${invState.sort==='nombre'?'selected':''}>${t('inv.sort.name')}</option>
        <option value="plataforma" ${invState.sort==='plataforma'?'selected':''}>${t('inv.sort.platform')}</option>
        ${Object.keys(INV_SORT_NEW).map(k=>`<option value="${k}" ${invState.sort===k?'selected':''}>${t('sort.' + INV_SORT_NEW[k])}</option>`).join('')}
      </select>
      ${invGroupSelectHTML()}
    </div>
  </div>`;
  html += activeFiltersHTML();
  html += `<div id="inv-results">${renderInventarioResults()}</div>`;
  return html;
}
let invSearchTimer = null;
let invResultsSeq = 0;
function invSearch(v){
  invState.search = v; invState.limit = 60;
  clearTimeout(invSearchTimer);
  invSearchTimer = setTimeout(refreshInventoryResults, 150);
}
async function refreshInventoryResults(){
  const el = document.getElementById('inv-results');
  if(!el || view.page!=='inventario' || view.productId){ render(); return; }
  const mySeq = ++invResultsSeq;
  const html = renderInventarioResults();
  if(mySeq !== invResultsSeq) return;   // llegó otra búsqueda más reciente
  el.innerHTML = html;
  hydratePhotos(el);
  invPickPaint(el);   // v11.19
}
function invFilter(v){ invState.filter=v; invState.limit=60; render(); }
function invSort(v){ invState.sort=v; render(); }
async function setInvView(v){ await setUiPref('invView', v); render(); }
function invSetFilter(key, val){
  invState[key] = val; invState.limit = 60;
  if(key==='cat' && val && invState.plat){ const pl = getAllPlatforms().find(x=>x.id===invState.plat); if(pl && pl.categoryId!==val) invState.plat=''; }
  refreshFilterSheet();
  render();
}
function invToggleFlag(f){
  const arr = (invState.flags||[]).slice();
  const i = arr.indexOf(f); if(i>=0) arr.splice(i,1); else arr.push(f);
  invSetFilter('flags', arr);
}
function clearInvFilters(includeQuick){
  invState = Object.assign({}, invState, { cat:'', plat:'', region:'', flags:[], photo:'', complete:'', limit:60 }, includeQuick ? { filter:'todos', search:'' } : {});
  refreshFilterSheet();
  render();
}
/* Hoja de filtros (Inventario) — cambios aplicados al momento, con el
   número de resultados siempre visible. */
function filterSheetBodyHTML(){
  const cats = getAllCategories();
  const plats = invFilterPlatforms();
  const chipSel = (key, val, label)=> `<button type="button" class="chip ${invState[key]===val?'active':''}" aria-pressed="${invState[key]===val}" onclick="invSetFilter('${key}','${val}')">${label}</button>`;
  const chipPlat = (p)=>{ const on = invState.plat===p.id; const pv = platVisual(p.id);
    return `<button type="button" class="chip chip-plat ${on?'active':''}" aria-pressed="${on}" onclick="invSetFilter('plat','${on ? '' : p.id}')"><span class="chip-sw" style="--plat:${pv.color}" aria-hidden="true">${escapeHTML(pv.code)}</span>${escapeHTML(p.name)}</button>`; };
  return `<div class="sheet-group"><div class="field-label" id="fltCatLbl">${t('filter.category')}</div><div class="chip-row" role="group" aria-labelledby="fltCatLbl">
      ${chipSel('cat','',t('filter.all'))}${cats.map(c=>chipSel('cat',c.id,escapeHTML(c.name))).join('')}</div></div>
    <div class="sheet-group"><div class="field-label" id="fltPlatLbl">${t('filter.platform')}</div><div class="chip-row" role="group" aria-labelledby="fltPlatLbl">
      ${chipSel('plat','',t('filter.all'))}${plats.map(chipPlat).join('')}</div></div>
    <div class="sheet-group"><div class="field-label">${t('filter.region')}</div><div class="chip-row">
      ${chipSel('region','',t('filter.all'))}${REGION_OPTIONS.map(([c,k])=>chipSel('region',c,t(k))).join('')}${chipSel('region','none',t('filter.no_region'))}</div></div>
    <div class="sheet-group"><div class="field-label">${t('p.edition_type')}</div><div class="chip-row">
      ${INV_FLAG_KEYS.map(([f,k])=>`<button type="button" class="chip ${(invState.flags||[]).includes(f)?'active':''}" aria-pressed="${(invState.flags||[]).includes(f)}" onclick="invToggleFlag('${f}')">${t(k)}</button>`).join('')}</div></div>
    <div class="sheet-group"><div class="field-label">${t('filter.photo')}</div><div class="chip-row">
      ${chipSel('photo','',t('filter.all'))}${chipSel('photo','with',t('filter.with_photo'))}${chipSel('photo','without',t('filter.without_photo'))}</div></div>
    <div class="sheet-group"><div class="field-label">${t('p.checklist')}</div><div class="chip-row">
      ${chipSel('complete','',t('filter.all'))}${chipSel('complete','yes',t('filter.complete_yes'))}${chipSel('complete','no',t('filter.complete_no'))}</div></div>`;
}
function filterSheetFootHTML(){
  const n = inventoryFilteredEditions().length;
  return `<button class="btn" onclick="clearInvFilters()">${t('filter.clear')}</button><button class="btn primary" onclick="closeSheet()">${t('filter.show_n').replace('{n}', n)}</button>`;
}
function openFilterSheet(){ openSheet({ kind:'filters', title:t('filter.title'), body:filterSheetBodyHTML(), foot:filterSheetFootHTML() }); }
function refreshFilterSheet(){
  if(!isSheetKind('filters')) return;
  // se redibuja la hoja: el foco vuelve al mismo control (uso con teclado / lector de pantalla)
  const a = document.activeElement;
  const sel = a && a.closest && a.closest('#sheetOverlay') ? (a.id ? '#'+a.id : (a.getAttribute('onclick') ? `[onclick="${a.getAttribute('onclick').replace(/"/g,'\\"')}"]` : '')) : '';
  updateSheetBody(filterSheetBodyHTML());
  const foot = document.querySelector('#sheetOverlay .sheet-foot'); if(foot) foot.innerHTML = filterSheetFootHTML();
  if(sel){ try{ const b = document.querySelector('#sheetOverlay ' + sel); if(b) b.focus(); }catch(e){} }
}
/* Lista imprimible de lo que falta, agrupada por categoría — el propio
   navegador la deja guardar como PDF desde el diálogo de imprimir. */
function printMissingList(){
  const missing = allEditions().filter(x=>x.edition.possession!=='tengo');
  const catNames = new Map(getAllCategories().map(c=>[c.id, c.name]));
  const byCat = {};
  missing.forEach(x=>{
    const catName = catNames.get(x.product.categoryId) || '—';
    if(!byCat[catName]) byCat[catName] = [];
    byCat[catName].push(x);
  });
  const title = t('inv.print_title');
  let body = `<h1>${escapeHTML(title)}</h1><div class="sub">${missing.length} ${t('inv.results')} — ${new Date().toLocaleDateString()}</div>`;
  Object.keys(byCat).sort(compareNames).forEach(catName=>{
    body += `<h2>${escapeHTML(catName)}</h2><ul>`;
    byCat[catName].sort((a,b)=>compareNames(a.product.name, b.product.name)).forEach(x=>{
      // v11.11: con su prioridad y lo máximo que pagarías, si lo has puesto
      const o = objetivoOf(x.product);
      const want = [o.prioridad ? t('prio.' + o.prioridad) : '', o.precioMax!==null ? t('falta.max_price') + ' ' + fmtMoney(o.precioMax) : ''].filter(Boolean).join(' · ');
      body += `<li><span class="box"></span> ${escapeHTML(x.product.name)}${x.product.platformName?' — '+escapeHTML(x.product.platformName):''}${x.edition.year?' ('+escapeHTML(x.edition.year)+')':''}${want ? ` <em>· ${escapeHTML(want)}</em>` : ''}</li>`;
    });
    body += `</ul>`;
  });
  const w = window.open('', '_blank');
  if(!w){ showToast(t('inv.print_blocked')); return; }
  w.document.write(`<!DOCTYPE html><html lang="${OVERRIDES.lang||'es'}"><head><meta charset="UTF-8"><title>${escapeHTML(title)}</title><style>
    body{font-family:Georgia,serif;padding:30px;color:#222;max-width:700px;margin:0 auto;}
    h1{font-size:22px;margin-bottom:4px;} .sub{color:#666;font-size:12px;margin-bottom:24px;}
    h2{font-size:15px;margin-top:24px;border-bottom:1px solid #ccc;padding-bottom:4px;}
    ul{list-style:none;padding:0;} li{padding:6px 0;font-size:13px;display:flex;align-items:center;gap:8px;}
    .box{width:13px;height:13px;border:1.5px solid #444;border-radius:3px;flex-shrink:0;display:inline-block;}
    li em{font-style:normal;color:#a44a34;}
    @media print{ body{padding:0;} }
  </style></head><body>${body}</body></html>`);
  w.document.close();
  w.focus();
  setTimeout(()=>w.print(), 300);
}

/* =====================================================================
   ESTADÍSTICAS, INVESTIGACIÓN, GALERÍA, AYUDA
   ===================================================================== */
function barRowHTML(name, have, total, pct, brick){
  return `<div class="bar-row"><div class="bar-labels"><span class="name">${escapeHTML(name)}</span><span class="pct">${total ? `${have}/${total} · ${pct}%` : '—'}</span></div>
    <div class="bar-track" role="progressbar" aria-label="${escapeHTML(name)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><div class="bar-fill ${brick?'brick':''}" data-pct="${pct}"></div></div></div>`;
}
function renderEstadisticas(){
  const g = computeGlobalStats();
  const cats = statsByCategory();
  const plats = statsByPlatform();
  const regs = statsByRegion();
  let html = screenHeadHTML({ kicker:t('stats.kicker'), title:t('stats.title') });
  if(!g.total){ return html + emptyStateHTML({ icon:'chart', title:t('stats.empty'), text:t('coll.empty.text') }); }
  html += `<div class="metric-grid stats-metrics">
    <div class="metric"><div class="metric-label">${t('stats.total')}</div><div class="metric-value">${g.total.toLocaleString(numLocale())}</div></div>
    <div class="metric"><div class="metric-label">${t('dash.have')}</div><div class="metric-value">${g.have.toLocaleString(numLocale())}</div><div class="metric-sub">${g.pct}%</div></div>
    <div class="metric"><div class="metric-label">${t('dash.pending')}</div><div class="metric-value">${g.pending.toLocaleString(numLocale())}</div></div>
    <div class="metric"><div class="metric-label">${t('dash.sealed')}</div><div class="metric-value">${g.sealed.toLocaleString(numLocale())}</div></div>
  </div>`;
  html += barRowHTML(t('stats.global'), g.have, g.total, g.pct, true);
  html += valueSectionHTML();   // v11.19: el valor y su evolución
  // v11.1: por categoría, a la vista (tengo / me falta)
  html += `<section class="vit-section">${sectionTitleHTML(t('stats.by_category'))}<div class="stack-list">${cats.filter(c=>c.total).map(c=>`
    <button type="button" class="stack-row" onclick="goCategory('${c.id}')">
      <span class="stack-top"><span class="stack-name">${escapeHTML(c.name)}</span><span class="stack-num">${c.have}/${c.total} · <b>${c.pct}%</b></span></span>
      <span class="stack-bar" role="img" aria-label="${escapeHTML(c.name)}: ${t('dash.ring_label').replace('{pct}', c.pct).replace('{have}', c.have).replace('{total}', c.total)}">${c.have ? `<span class="stack-have" style="flex-grow:${c.have}"></span>` : ''}${c.total>c.have ? `<span class="stack-miss" style="flex-grow:${c.total-c.have}"></span>` : ''}</span>
    </button>`).join('')}</div>
    <div class="stack-legend" aria-hidden="true"><span><span class="sl-have"></span>${t('legend.have')}</span><span><span class="sl-miss"></span>${t('legend.missing')}</span></div></section>`;
  // v11.1: mapa de plataformas (relleno = completa; borde = le faltan piezas)
  const allPlats = getAllPlatforms();
  const complete = plats.filter(p=>p.missing===0).length;
  html += `<section class="vit-section">${sectionTitleHTML(t('stats.platform_map'), t('stats.platform_map.sub').replace('{n}', plats.length).replace('{c}', complete))}
    <div class="plat-map">${plats.map(p=>{ const pv = platVisual(p.id); const pl = allPlats.find(x=>x.id===p.id);
      return `<button type="button" class="pm-tile ${p.missing ? 'is-gap' : 'is-full'}" style="--plat:${pv.color}" onclick="goPlatform('${pl ? pl.categoryId : ''}','${p.id}')" aria-label="${escapeHTML(p.name)}: ${p.have}/${p.total}" title="${escapeHTML(p.name)}">
        <span class="pm-code">${escapeHTML(pv.code || p.name.slice(0,4))}</span><span class="pm-num">${p.missing ? t('dash.missing_n').replace('{n}', p.missing) : p.have + '/' + p.total}</span></button>`; }).join('')}</div>
    <p class="section-sub">${t('stats.platform_map.note')}</p></section>`;
  // v11.1: por año de salida
  const statList = allEditionsForStats().map(x=>x.product);
  const yc = yearChartHTML(statList, true);
  if(yc){
    const ym = new Map(); statList.forEach(p=>{ const y = parseInt(p.year,10); if(!isNaN(y) && y>1900 && y<2200) ym.set(y,(ym.get(y)||0)+1); });
    const ranked = [...ym.entries()].sort((a,b)=> b[1]-a[1] || a[0]-b[0]);
    const note = ranked.length > 1 ? t('stats.year_peak2').replace('{y}', ranked[0][0]).replace('{n}', ranked[0][1]).replace('{y2}', ranked[1][0]).replace('{n2}', ranked[1][1])
                                  : t('stats.year_peak').replace('{y}', ranked[0][0]).replace('{n}', ranked[0][1]);
    html += `<section class="vit-section">${sectionTitleHTML(t('stats.by_year'), fmtCount(ym.size,'count.year_one','count.year_many'))}${yc}<p class="section-sub">${note}</p></section>`;
  }
  html += `<div class="stats-more">`;
  html += disclosureHTML('plataforma', t('stats.by_platform'), plats.map(p=>barRowHTML(p.name, p.have, p.total, p.pct)).join(''), statsOpen, String(plats.length));
  html += disclosureHTML('region', t('stats.by_region'), regs.map(r=>barRowHTML(r.name, r.have, r.total, r.pct)).join(''), statsOpen, String(regs.length));
  html += `</div><p class="section-sub stats-note">${t('stats.note')}</p>`;
  return html;
}
function renderInvestigacion(){
  const prods = PRODUCTS.filter(p=>p.existence!=='confirmado');
  let html = screenHeadHTML({ kicker:t('research.kicker'), title:t('research.title'), sub: prods.length ? fmtCount(prods.length,'count.item_one','count.item_many') : '' });
  if(prods.length===0){ return html + emptyStateHTML({ icon:'checkCircle', title:t('research.empty'), text:t('research.empty.sub') }); }
  registerListContext(prods.map(p=>p.id), t('research.title'));
  html += `<div class="item-list">`;
  prods.forEach(p=>{
    const reg = regionShortText(p);
    html += `<div class="inv-item obj-item" onclick="goProduct('${p.id}')" role="link" tabindex="0" onkeydown="if(event.key==='Enter'){goProduct('${p.id}')}">
      <div class="inv-main"><div class="inv-name obj-name">${escapeHTML(p.name)}</div>
        <div class="inv-meta">${existenceLabel(p.existence)}${reg?' · '+escapeHTML(reg):''}${p.platformName?' · '+escapeHTML(p.platformName):''}</div>
        ${p.research&&p.research.falta ? `<div class="inv-meta">${t('research.missing')}: ${escapeHTML(p.research.falta)}</div>` : ''}</div>
      ${icon('chevronRight')}
    </div>`;
  });
  html += `</div>`;
  return html;
}
/* v11.19: la galería se filtra (precintadas, sin trasera, con marcas, plataforma) y
   se ordena (año o últimas altas); tocar una foto la abre a pantalla completa y se
   pasa a la siguiente deslizando. Arriba, «Sesión de fotos» e «Importar varias». */
let galState = { f:'all', plat:'', sort:'year' };
function galleryAll(){ return PRODUCTS.filter(p=> hasPhoto(p.id,'front') || hasPhoto(shownPhotoId(p),'front')); }   // v11.11: también si solo tiene foto su mejor copia
const GAL_FILTERS = { all:()=> true, sealed:(p)=> shownSealed(p), noback:(p)=> !hasPhoto(shownPhotoId(p), 'back'), marks:(p)=> !!(p.marcas && typeof p.marcas==='object' && Object.keys(p.marcas).length) };
function galleryList(){
  const f = GAL_FILTERS[galState.f] || GAL_FILTERS.all;
  const list = galleryAll().filter(p=> f(p) && (!galState.plat || p.platformId===galState.plat));
  return galState.sort==='added' ? list.sort(productCmp('added')) : sortGames(list);
}
function galSet(k, v){ galState[k] = v; galleryLimit = 60; renderKeepFocus(); }
function galleryToolsHTML(){
  return `<div class="gal-actions">
    <button type="button" class="btn btn-sm" data-fk="ps-open" onclick="openPhotoSession()">${icon('camera')} ${t('ps.title')}</button>
    <label class="btn btn-sm photo-picker" data-fk="bi-open">${icon('upload')} ${t('bi.open')}<input type="file" accept="image/*" multiple class="sr-only" aria-label="${escapeHTML(t('bi.open'))}" onchange="bulkImportFiles(this)"></label>
  </div>`;
}
function renderGallery(){
  const all = galleryAll();
  let html = screenHeadHTML({ kicker:t('gallery.kicker'), title:t('gallery.title'), sub: all.length ? fmtCount(all.length,'count.photo_one','count.photo_many') : '' });
  if(all.length===0){
    return html + emptyStateHTML({ icon:'camera', title:t('gallery.empty'), text:t('gallery.empty.sub') }) + galleryToolsHTML();
  }
  const list = galleryList();
  registerListContext(list.map(p=>p.id), t('gallery.title'));
  const n = (k)=> all.filter(GAL_FILTERS[k]).length;
  const chip = (k, label)=> `<button type="button" class="chip ${galState.f===k ? 'active' : ''}" aria-pressed="${galState.f===k}" data-fk="gal-${k}" onclick="galSet('f','${k}')">${escapeHTML(label)} <span class="chip-count">${n(k).toLocaleString(numLocale())}</span></button>`;
  const plats = getAllPlatforms().filter(pl=> all.some(p=> p.platformId===pl.id));
  html += galleryToolsHTML()
    + `<div class="chip-row gal-chips" role="group" aria-label="${escapeHTML(t('filter.title'))}">${chip('all', t('gal.f.all'))}${chip('sealed', t('gal.f.sealed'))}${chip('noback', t('gal.f.noback'))}${n('marks') ? chip('marks', t('gal.f.marks')) : ''}</div>
    <div class="toolbar gal-toolbar"><span class="result-count" role="status">${list.length!==all.length ? fmtCount(list.length,'count.photo_one','count.photo_many') : ''}</span>
      <div class="toolbar-right"><label class="sr-only" for="galPlat">${t('filter.platform')}</label><select id="galPlat" class="select-compact" onchange="galSet('plat', this.value)"><option value="">${t('val.platform_all')}</option>${plats.map(pl=>`<option value="${escapeHTML(pl.id)}" ${galState.plat===pl.id ? 'selected' : ''}>${escapeHTML(pl.name)}</option>`).join('')}</select>
      <label class="sr-only" for="galSort">${t('sort.label')}</label><select id="galSort" class="select-compact" onchange="galSet('sort', this.value)"><option value="year" ${galState.sort==='year' ? 'selected' : ''}>${t('sort.year')}</option><option value="added" ${galState.sort==='added' ? 'selected' : ''}>${t('sort.added')}</option></select></div></div>`;
  if(!list.length) return html + `<p class="section-sub">${t('filter.no_results')}</p>`;
  const shown = list.slice(0, galleryLimit);
  html += `<div class="gallery-grid">`;
  shown.forEach((p, i)=>{
    const ph = shownPhotoId(p);
    html += `<button type="button" class="gallery-cell" data-fk="gal-c${i}" onclick="openGalleryViewer(${i})" aria-label="${escapeHTML(p.name + ' — ' + t('photo.enlarge'))}">${photoImgHTML(p,'front','thumb','', hasPhoto(ph,'front') ? ph : p.id)}</button>`;
  });
  html += `</div>`;
  if(list.length > galleryLimit){
    html += `<button class="btn load-more" onclick="galleryLimit+=60; render();">${t('inv.load_more').replace('{n}', list.length - galleryLimit)}</button>`;
  }
  return html;
}
function renderAyuda(){
  const topics = [
    ['organizar','layers', 'ayuda.organize'], ['anadir','plusCircle', 'ayuda.add'], ['buscar','search','ayuda.search'], ['lotengo','barcode','ayuda.scan'],
    ['mover','shuffle', 'ayuda.move'], ['renombrar','pencil', 'ayuda.rename'], ['completo','checkCircle', 'ayuda.complete'],
    ['fotos','camera', 'ayuda.photos'], ['orden','sortIcon', 'ayuda.order'], ['excluir','toggleIcon', 'ayuda.exclude'],
    ['backup','archive', 'ayuda.backup'], ['cuenta','cloud', 'ayuda.sync'], ['idioma','globe', 'ayuda.language'],
    ['copias','copies', 'ayuda.copies'], ['falta','target', 'ayuda.missing'], ['estanteria','cabinet', 'ayuda.shelf'],
  ];
  let html = screenHeadHTML({ kicker:t('ayuda.kicker'), title:t('ayuda.title') });
  html += `<p class="ayuda-intro">${t('ayuda.intro')}</p><div class="ayuda-list">`;
  topics.forEach(([key, ic, k])=>{
    const open = !!ayudaOpen[key];
    html += `<details class="disclosure" ${open?'open':''} ontoggle="ayudaOpen['${key}']=this.open">
      <summary><span class="ayuda-icon">${icon(ic)}</span><span>${t(k)}</span>${icon('chevronRight','chev')}</summary>
      <div class="disclosure-body ayuda-body">${t(k+'.body')}</div></details>`;
  });
  html += `</div>`;
  return html;
}

/* =====================================================================
   COPIA DE SEGURIDAD
   ===================================================================== */
function renderBackup(){
  let html = screenHeadHTML({ kicker:t('backup.kicker'), title:t('backup.title'), sub:t('backup.intro') });
  html += storageStatusHTML();
  html += `<div class="backup-hero">
    <button type="button" class="backup-btn backup-btn-export" onclick="exportEverything()">
      <span class="backup-btn-icon">${icon('download')}</span>
      <span class="backup-btn-label">${t('backup.export')}</span>
      <span class="backup-btn-sub">${t('backup.export.sub')}</span>
    </button>
    <label class="backup-btn backup-btn-import">
      <span class="backup-btn-icon">${icon('upload')}</span>
      <span class="backup-btn-label">${t('backup.import')}</span>
      <span class="backup-btn-sub">${t('backup.import.sub')}</span>
      <input type="file" accept=".zip" class="sr-only" onchange="importEverything(this)">
    </label>
  </div>
  <div class="status-line" id="everything-export-status" role="status" aria-live="polite">${escapeHTML(backupStatusMsg.everything)}</div>
  ${APP_META.undoImportAt ? `<div class="quick-actions is-flush"><button class="btn" id="undoImportBtn" onclick="undoLastImport()">${icon('undo')} ${t('import.undo')} (${escapeHTML(APP_META.undoImportAt.slice(0,10))})</button></div>` : ``}`;
  const adv = `<p class="section-sub">${t('backup.advanced.intro')}</p>
    <div class="quick-actions">
      <button class="btn btn-sm" onclick="exportJSON()">${icon('download')} ${plainLabel(t('backup.export_json'))}</button>
      <button class="btn btn-sm" onclick="exportCSV()">${icon('download')} ${plainLabel(t('backup.export_csv'))}</button>
      <label class="btn btn-sm photo-picker">${icon('upload')} ${plainLabel(t('backup.import_json'))}<input type="file" class="sr-only" onchange="importJSON(this)"></label>
    </div>
    <p class="section-sub">${t('backup.research_intro')}</p>
    <div class="quick-actions"><label class="btn btn-sm photo-picker">${icon('plus')} ${t('backup.import_research')}<input type="file" class="sr-only" onchange="importResearchFile(this)"></label></div>
    <div class="quick-actions">
      <button class="btn btn-sm" onclick="exportAllPhotosZip()">${icon('download')} ${t('backup.export_photos')}</button>
      <label class="btn btn-sm photo-picker">${icon('upload')} ${t('backup.import_photos')}<input type="file" accept=".zip" class="sr-only" onchange="importPhotosZip(this)"></label>
    </div>
    <div class="status-line" id="photo-export-status" role="status" aria-live="polite">${escapeHTML(backupStatusMsg.photos)}</div>
    <div class="quick-actions"><button class="btn btn-sm btn-ghost" onclick="regenerateThumbs()">${icon('image')} ${t('backup.regen_thumbs')}</button></div>`;
  html += `<div class="backup-more">${disclosureHTML('backup-avanzado', t('backup.advanced'), adv, ayudaOpen)}</div>`;
  return html;
}
function backupReminderHTML(){
  if(!PRODUCTS.length) return '';
  const days = daysSince(APP_META.lastFullBackupAt);
  if(days!==null && days < BACKUP_REMINDER_DAYS) return '';
  const msg = days===null ? t('backup.reminder.never') : t('backup.reminder.days').replace('{n}', days);
  // v11.22: una sola línea, con el botón al lado
  return `<div class="dash-reminder" id="backup-reminder" role="status">${icon('archive')}<span>${escapeHTML(msg)}</span><button type="button" class="link-btn" onclick="goPage('backup')">${t('backup.reminder.cta')}</button></div>`;
}
function lastBackupText(){
  const iso = APP_META.lastFullBackupAt;
  if(!iso) return t('backup.last.never');
  const n = daysSince(iso);
  return iso.slice(0,10) + ' · ' + (n===0 ? t('backup.today') : t('backup.days_ago').replace('{n}', n));
}
function storageStatusHTML(){
  const st = storageState.status;
  const cls = st==='granted' ? 'note-info' : 'note-warn';
  const text = st==='granted' ? t('storage.granted') : st==='denied' ? t('storage.denied') : st==='unsupported' ? t('storage.unsupported') : '…';
  const usage = storageState.usageMB!==null ? `<br>${t('storage.usage').replace('{mb}', storageState.usageMB.toLocaleString(numLocale()))}` : '';
  const btn = st==='denied' ? `<div class="note-actions"><button class="btn btn-sm" onclick="requestPersistentStorage()">${t('storage.request')}</button></div>` : '';
  return `<div class="note ${cls}" id="storage-status"><b>${t('storage.title')}:</b> ${text}${usage}
    <br><b>${t('backup.last')}:</b> ${escapeHTML(lastBackupText())}${btn}</div>`;
}

/* =====================================================================
   v11.19 · LISTADOS
   Más formas de ordenar, agrupar en secciones plegables, índice lateral,
   filtros guardados, elegir varias (cambios en bloque), préstamos y compra,
   y el valor (en serie y su evolución).
   ===================================================================== */
/* ---------- Ordenar ---------- */
const INV_SORT_NEW = { alta:'added', valor:'value', estado:'cond', precintadas:'sealed' };
let _addedRank = null;
/* El orden en que la añadiste (la lista de tus piezas va en ese orden): mayor = más reciente */
function addedRankOf(p){
  const cps = OVERRIDES.customProducts || [];
  if(!_addedRank || _addedRank.ref!==cps || _addedRank.n!==cps.length){ const m = new Map(); cps.forEach((cp, i)=>{ if(cp && cp.id) m.set(cp.id, i); }); _addedRank = { ref:cps, n:cps.length, m }; }
  const m = _addedRank.m; if(m.has(p.id)) return m.get(p.id);
  const base = String(p.id).replace(/__e\d+$/, ''); return m.has(base) ? m.get(base) : -1;
}
function valueNow(p){ const v = p.valuation && p.valuation.valorActual; return typeof v==='number' && isFinite(v) ? v : null; }
function valuePaid(p){ const v = p.valuation && p.valuation.valorAdquisicion; return typeof v==='number' && isFinite(v) ? v : null; }
function condNow(p){ return p.possession==='tengo' ? copyCond(shownCopy(p)) : null; }
function cmpYearName(a, b){
  const ya = parseInt(a.year, 10), yb = parseInt(b.year, 10);
  return ((isNaN(ya) ? 9999 : ya) - (isNaN(yb) ? 9999 : yb)) || compareNames(a.name, b.name);
}
function cmpNullsLast(a, b){ return a===null && b===null ? 0 : a===null ? 1 : b===null ? -1 : b - a; }   // (de mayor a menor)
function productCmp(mode){
  switch(INV_SORT_NEW[mode] || mode){
    case 'added': return (a, b)=> (addedRankOf(b) - addedRankOf(a)) || cmpYearName(a, b);
    case 'value': return (a, b)=> cmpNullsLast(valueNow(a), valueNow(b)) || cmpYearName(a, b);
    case 'cond': return (a, b)=> cmpNullsLast(condNow(a), condNow(b)) || cmpYearName(a, b);
    case 'sealed': return (a, b)=> ((shownSealed(b) ? 1 : 0) - (shownSealed(a) ? 1 : 0)) || cmpYearName(a, b);
    default: return cmpYearName;
  }
}

/* ---------- Agrupar (Inventario) ---------- */
const INV_GROUPS = ['plataforma', 'anio', 'region', 'estado'];
const INV_STATES = ['sealed', 'tengo', 'en_camino', 'reservado', 'no', 'vendido', 'perdido'];
let invCollapsed = new Set();
let _invOrder = [];
function invGroupMode(){ const g = uiPref('invGroup', ''); return INV_GROUPS.includes(g) ? g : ''; }
async function setInvGroup(v){ invCollapsed = new Set(); invState.limit = 60; await setUiPref('invGroup', INV_GROUPS.includes(v) ? v : ''); render(); }
function invGroupSelectHTML(){
  const g = invGroupMode();
  return `<label class="sr-only" for="invGroupSel">${t('grp.label')}</label>
    <select id="invGroupSel" class="select-compact" onchange="setInvGroup(this.value)" aria-label="${escapeHTML(t('grp.label'))}">
      <option value="" ${g ? '' : 'selected'}>${t('grp.none')}</option>${INV_GROUPS.map(k=>`<option value="${k}" ${g===k ? 'selected' : ''}>${t('grp.' + k)}</option>`).join('')}
    </select>`;
}
function invGroupKey(mode, p){
  if(mode==='plataforma') return p.platformId || '—';
  if(mode==='anio'){ const y = parseInt(p.year, 10); return isNaN(y) ? '—' : String(y); }
  if(mode==='region') return productRegionCodes(p)[0] || 'none';
  if(mode==='estado') return p.possession==='tengo' ? (shownSealed(p) ? 'sealed' : 'tengo') : (INV_STATES.includes(p.possession) ? p.possession : 'no');
  return '';
}
function invGroupLabel(mode, k){
  if(mode==='plataforma'){ const pl = getAllPlatforms().find(x=>x.id===k); const pv = pl ? platVisual(pl.id) : null;
    return { name: pl ? pl.name : t('grp.no_platform'), short: pl ? (pv.code || pl.name.slice(0, 4)) : '—', color: pv ? pv.color : '' }; }
  if(mode==='anio') return { name: k==='—' ? t('grp.no_year') : k, short: k==='—' ? '—' : k };
  if(mode==='region') return { name: k==='none' ? t('filter.no_region') : (REGION_OPTIONS.some(o=>o[0]===k) ? t('region.' + k) : k), short: k==='none' ? '—' : (REGION_CODES[k] || k) };
  if(mode==='estado') return { name: t('grp.st.' + k), short: t('grp.st.' + k) };
  return { name:k, short:k };
}
/* El orden de los grupos */
function invGroupRanker(mode){
  if(mode==='plataforma'){ const m = new Map(); let i = 0; getAllCategories().forEach(c=> orderedPlatformsForCategory(c.id, getAllPlatforms().filter(p=>p.categoryId===c.id)).forEach(p=> m.set(p.id, i++))); return (k)=> m.has(k) ? m.get(k) : 1e6; }
  if(mode==='anio') return (k)=> k==='—' ? 1e6 : Number(k);
  if(mode==='region') return (k)=>{ const i = REGION_OPTIONS.findIndex(o=>o[0]===k); return k==='none' ? 1e6 : i >= 0 ? i : 1e3; };
  if(mode==='estado') return (k)=> INV_STATES.indexOf(k);
  return ()=> 0;
}
function invGroupSort(eds, mode){
  const rank = invGroupRanker(mode), memo = new Map();
  const r = (x)=>{ const k = invGroupKey(mode, x.product); if(!memo.has(k)) memo.set(k, rank(k)); return memo.get(k); };
  // (estable: dentro de cada grupo se queda el orden elegido)
  return eds.map((x, i)=> ({ x, i, r:r(x), k:invGroupKey(mode, x.product) })).sort((a, b)=> (a.r - b.r) || (a.k < b.k ? -1 : a.k > b.k ? 1 : 0) || (a.i - b.i)).map(o=> o.x);
}
function invGroupsHTML(eds, mode, wrap){
  const groups = [];
  eds.forEach(x=>{ const k = invGroupKey(mode, x.product), g = groups[groups.length - 1]; if(g && g.k===k) g.items.push(x.product); else groups.push({ k, items:[x.product] }); });
  let budget = invState.limit, hidden = 0;
  const all = groups.length > 1 ? `<div class="grp-tools"><button type="button" class="link-btn" data-fk="grp-open" onclick="invGroupsAll(true)">${t('grp.expand_all')}</button><button type="button" class="link-btn" data-fk="grp-close" onclick="invGroupsAll(false)">${t('grp.collapse_all')}</button></div>` : '';
  const html = groups.map((g, gi)=>{
    const lb = invGroupLabel(mode, g.k), open = !invCollapsed.has(g.k);
    let inner = '';
    if(open){ const take = g.items.slice(0, Math.max(0, budget)); budget -= take.length; hidden += g.items.length - take.length; if(take.length) inner = wrap(take); }
    return `<section class="inv-group" data-grp="${escapeHTML(g.k)}"${lb.color ? ` style="--plat:${lb.color}"` : ''}>
      <h3 class="grp-h"><button type="button" class="grp-head" id="grp-${gi}" aria-expanded="${open}" onclick="invToggleGroup(this)">${icon('chevronRight', 'grp-chev')}<span class="grp-name">${escapeHTML(lb.name)}</span><span class="grp-count">${g.items.length.toLocaleString(numLocale())}</span></button></h3>
      ${inner}</section>`;
  }).join('');
  return all + html + (hidden ? `<button class="btn load-more" onclick="invState.limit+=60; render();">${t('inv.load_more').replace('{n}', hidden)}</button>` : '');
}
function invToggleGroup(btn){
  const sec = btn.closest('.inv-group'); if(!sec) return;
  const k = sec.dataset.grp;
  if(invCollapsed.has(k)) invCollapsed.delete(k); else invCollapsed.add(k);
  refreshInventoryResults().then(()=>{ const b = document.querySelector(`#inv-results .inv-group[data-grp="${CSS.escape(k)}"] .grp-head`); if(b) b.focus({ preventScroll:true }); });
}
function invGroupsAll(open){
  const mode = invGroupMode(); if(!mode) return;
  invCollapsed = open ? new Set() : new Set(inventoryFilteredEditions().map(x=> invGroupKey(mode, x.product)));
  refreshInventoryResults().then(()=>{ const b = document.querySelector(`#inv-results [data-fk="${open ? 'grp-open' : 'grp-close'}"]`); if(b) b.focus({ preventScroll:true }); });
}

/* ---------- Índice lateral (saltar a una letra, un año, una plataforma o un grupo) ---------- */
function invIndexEntries(mode){
  const order = _invOrder; if(order.length < 40) return [];
  let keyOf, labelOf = (k)=> k;
  if(mode){ keyOf = (p)=> invGroupKey(mode, p); labelOf = (k)=> invGroupLabel(mode, k).short; }
  else if(invState.sort==='nombre') keyOf = (p)=>{ const c = normText(p.name || '').trim().charAt(0).toUpperCase(); return /[A-Z]/.test(c) ? c : '#'; };
  else if(invState.sort==='anio'){
    const years = new Set(order.map(p=> parseInt(p.year, 10)).filter(y=> !isNaN(y)));
    const dec = years.size > 22;
    keyOf = (p)=>{ const y = parseInt(p.year, 10); return isNaN(y) ? '—' : dec ? String(Math.floor(y / 10) * 10) : String(y); };
    if(dec) labelOf = (k)=> k==='—' ? k : "'" + k.slice(2) + 's';
  }
  else if(invState.sort==='plataforma') keyOf = (p)=> p.platformId || '—', labelOf = (k)=>{ const pl = getAllPlatforms().find(x=>x.id===k); return pl ? (platVisual(pl.id).code || pl.name.slice(0, 4)) : '—'; };
  else return [];
  const out = [], seen = new Set();
  order.forEach((p, i)=>{ const k = keyOf(p); if(!seen.has(k)){ seen.add(k); out.push({ k, i, label:labelOf(k) }); } });
  return out.length >= 3 ? out : [];
}
function invIndexHTML(mode){
  if(uiPref('invView', 'list')==='wall') return '';
  const e = invIndexEntries(mode); if(!e.length) return '';
  // (para el dedo; con el teclado o el lector de pantalla se llega igual con «Agrupar» y el orden)
  return `<nav class="inv-index" aria-hidden="true" style="--n:${e.length}" onpointerdown="invIndexDown(event)">${e.map(x=>`<span class="ix" data-i="${x.i}" data-g="${escapeHTML(mode ? x.k : '')}">${escapeHTML(x.label)}</span>`).join('')}</nav>`;
}
let _invIdxLast = null;
function invIndexDown(ev){
  const nav = ev.currentTarget; if(!nav) return;
  ev.preventDefault();
  try{ nav.setPointerCapture(ev.pointerId); }catch(e){}
  nav.classList.add('is-active');
  const at = (x, y)=>{ const r = nav.getBoundingClientRect(); const b = document.elementFromPoint(r.left + r.width / 2, Math.min(r.bottom - 2, Math.max(r.top + 2, y))); return b && b.closest && b.closest('.inv-index .ix'); };
  const go = (b)=>{ if(!b || b===_invIdxLast) return; _invIdxLast = b; invJump(Number(b.dataset.i), b.dataset.g || ''); };
  go(at(ev.clientX, ev.clientY));
  const move = (e)=> go(at(e.clientX, e.clientY));
  const up = ()=>{ nav.removeEventListener('pointermove', move); nav.removeEventListener('pointerup', up); nav.removeEventListener('pointercancel', up); _invIdxLast = null; const n2 = document.querySelector('#inv-results .inv-index'); if(n2) n2.classList.remove('is-active'); };
  nav.addEventListener('pointermove', move); nav.addEventListener('pointerup', up); nav.addEventListener('pointercancel', up);
}
function invJump(i, g){
  const p = _invOrder[i]; if(!p) return;
  let redraw = false;
  if(g && invCollapsed.has(g)){ invCollapsed.delete(g); redraw = true; }
  if(i >= invState.limit){ invState.limit = i + 40; redraw = true; }
  const scrollTo = ()=>{
    const el = g ? document.querySelector(`#inv-results .inv-group[data-grp="${CSS.escape(g)}"]`) : document.querySelector(`#inv-results .inv-body [data-pid="${CSS.escape(p.id)}"]`);
    if(!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - 76;
    window.scrollTo({ top: Math.max(0, top), behavior:'auto' });
  };
  if(redraw){
    // (se rehace solo la lista, sin perder el índice que tienes bajo el dedo)
    const box = document.getElementById('inv-results'); if(!box) return;
    const html = renderInventarioResults();
    const tmp = document.createElement('div'); tmp.innerHTML = html;
    const body = tmp.querySelector('.inv-body'), old = box.querySelector('.inv-body');
    if(body && old){ old.replaceWith(body); hydratePhotos(body); } else { box.innerHTML = html; hydratePhotos(box); }
    invPickPaint(box);
  }
  scrollTo();
}

/* ---------- Filtros guardados ---------- */
const SF_KEYS = ['search', 'filter', 'sort', 'cat', 'plat', 'region', 'flags', 'photo', 'complete'];
const SF_DEFAULT = { search:'', filter:'todos', sort:'anio', cat:'', plat:'', region:'', flags:[], photo:'', complete:'' };
function sfNorm(s){ const o = {}; SF_KEYS.forEach(k=>{ const v = s && s[k]; o[k] = k==='flags' ? (Array.isArray(v) ? v.slice().sort() : []) : (typeof v==='string' ? (k==='search' ? v.trim() : v) : SF_DEFAULT[k]); }); return o; }
function sfState(){ return sfNorm(invState); }
function sfSame(a, b){ return JSON.stringify(sfNorm(a))===JSON.stringify(sfNorm(b)); }
function savedFilters(){ return Array.isArray(OVERRIDES.filtrosGuardados) ? OVERRIDES.filtrosGuardados.filter(f=> f && typeof f.id==='string' && f.s && typeof f.s==='object') : []; }
function sfCanSave(){ const s = sfState(); return !sfSame(s, SF_DEFAULT) && !savedFilters().some(f=> sfSame(f.s, s)); }
function sfAutoName(s){
  const parts = [];
  if(s.search) parts.push('«' + s.search + '»');
  const qf = { tengo:'inv.chip.have', falta:'inv.chip.missing', sinconfirmar:'inv.chip.unconfirmed', sellado:'inv.chip.sealed', repetidas:'inv.chip.dups', prestadas:'inv.chip.loaned' }[s.filter];
  if(qf) parts.push(t(qf));
  if(s.cat){ const c = getAllCategories().find(x=>x.id===s.cat); if(c) parts.push(c.name); }
  if(s.plat){ const pl = getAllPlatforms().find(x=>x.id===s.plat); if(pl) parts.push(pl.name); }
  if(s.region) parts.push(s.region==='none' ? t('filter.no_region') : (REGION_CODES[s.region] || s.region));
  (s.flags || []).forEach(f=>{ const k = INV_FLAG_KEYS.find(x=>x[0]===f); if(k) parts.push(t(k[1])); });
  if(s.photo) parts.push(t(s.photo==='with' ? 'filter.with_photo' : 'filter.without_photo'));
  if(s.complete) parts.push(t(s.complete==='yes' ? 'filter.complete_yes' : 'filter.complete_no'));
  return (parts.join(' · ') || t('sf.default_name')).slice(0, 40);
}
function savedFiltersHTML(){
  const list = savedFilters(); if(!list.length) return '';
  const cur = sfState(), edit = !!invState.sfEdit;
  return `<div class="chip-scroll saved-filters${edit ? ' is-editing' : ''}" role="group" aria-label="${escapeHTML(t('sf.title'))}">
    ${list.map(f=>{ const on = sfSame(f.s, cur); const id = escapeHTML(f.id), nm = escapeHTML(f.nombre || t('sf.default_name'));
      return edit ? `<button type="button" class="chip chip-remove" data-fk="sf-${id}" onclick="sfDelete('${id}')" aria-label="${escapeHTML(t('sf.remove_x').replace('{n}', f.nombre || ''))}">${icon('bookmark')} ${nm}<span class="chip-x">${icon('x')}</span></button>`
        : `<button type="button" class="chip chip-saved${on ? ' active' : ''}" aria-pressed="${on}" data-fk="sf-${id}" onclick="sfApply('${id}')">${icon('bookmark')} ${nm}</button>`; }).join('')}
    <button type="button" class="link-btn sf-edit" data-fk="sf-edit" onclick="invState.sfEdit=!invState.sfEdit; render()">${t(edit ? 'sf.done' : 'sf.edit')}</button>
  </div>`;
}
async function sfSave(){
  const s = sfState();
  const name = await showPromptModal(t('sf.name_q'), sfAutoName(s));
  if(!name || !String(name).trim()) return;
  const list = savedFilters().slice();
  list.push({ id:'sf' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), nombre:String(name).trim().slice(0, 40), s });
  OVERRIDES.filtrosGuardados = list;
  await persistOverrides();
  showToast(t('sf.saved'), { ok:true, replace:true });
  render();
}
function sfApply(id){
  const f = savedFilters().find(x=>x.id===id); if(!f) return;
  const s = sfNorm(f.s);
  invState = Object.assign({}, invState, s, { flags:s.flags.slice(), limit:60 });
  render();
}
async function sfDelete(id){
  const list = savedFilters(), i = list.findIndex(x=>x.id===id); if(i < 0) return;
  const gone = list[i];
  OVERRIDES.filtrosGuardados = list.filter(x=>x.id!==id);
  if(!OVERRIDES.filtrosGuardados.length) invState.sfEdit = false;
  await persistOverrides();
  render();
  showToast(t('sf.removed'), { replace:true, action:{ label:t('common.undo'), fn: async ()=>{
    const cur = savedFilters().slice(); if(cur.some(x=>x.id===gone.id)) return;
    cur.splice(Math.min(i, cur.length), 0, gone); OVERRIDES.filtrosGuardados = cur; await persistOverrides(); render();
  } } });
}

/* ---------- Elegir varias (Inventario) y cambiarlas de golpe ---------- */
function invPickMode(on){
  invState.sel = on ? new Set() : null;
  invState.bulkMsg = '';
  refreshInventoryResults().then(()=>{ const b = document.querySelector('#inv-results [data-fk="inv-pick"]'); if(b) b.focus({ preventScroll:true }); });
}
/* Con «Elegir varias», tocar una pieza la elige (no abre su ficha) */
function invPickClick(e){
  if(!invState.sel || view.page!=='inventario' || view.productId) return false;
  const it = e.target.closest && e.target.closest('#inv-results .inv-body [data-pid]'); if(!it) return false;
  e.preventDefault(); e.stopPropagation();
  invPickToggle(it.dataset.pid);
  return true;
}
function invPickToggle(id){
  const s = invState.sel; if(!s) return;
  if(s.has(id)) s.delete(id); else s.add(id);
  document.querySelectorAll(`#inv-results .inv-body [data-pid="${CSS.escape(id)}"]`).forEach(el=>{ el.classList.toggle('is-picked', s.has(id)); });
  invBulkBarRefresh();
}
/* (solo las que siguen en la lista: si un filtro esconde alguna elegida, no se cambia sin verla) */
function invPickedIds(){ if(!invState.sel) return []; const shown = new Set(_invOrder.map(p=> p.id)); return [...invState.sel].filter(id=> PRODUCTS_BY_ID[id] && shown.has(id)); }
function invBulkBarHTML(){
  const n = invPickedIds().length, all = _invOrder.length;
  return `<div class="bulk-bar" role="region" aria-label="${escapeHTML(t('bulk.pick'))}">
    <span class="bulk-n" role="status" aria-live="polite">${escapeHTML(n ? (n===1 ? t('bulk.n1') : t('bulk.n').replace('{n}', n.toLocaleString(numLocale()))) : t('bulk.none_hint'))}</span>
    <span class="bulk-acts">
      <button type="button" class="btn btn-sm" data-fk="bulk-all" onclick="invBulkSelectAll(${n >= all ? 'false' : 'true'})">${escapeHTML(n >= all ? t('bulk.clear') : t('bulk.all').replace('{n}', all.toLocaleString(numLocale())))}</button>
      <button type="button" class="btn btn-sm primary" data-fk="bulk-go" onclick="openInvBulkSheet()" ${n ? '' : 'disabled'}>${icon('pencil')} ${t('bulk.actions')}</button>
    </span>
  </div>`;
}
function invBulkBarRefresh(){
  const bar = document.querySelector('#inv-results .bulk-bar'); if(!bar) return;
  const a = document.activeElement, fk = a && bar.contains(a) && a.dataset ? a.dataset.fk : null;
  bar.outerHTML = invBulkBarHTML();
  if(fk){ const b = document.querySelector(`#inv-results .bulk-bar [data-fk="${fk}"]`); if(b && !b.disabled) b.focus({ preventScroll:true }); }
}
function invBulkSelectAll(on){
  if(!invState.sel) return;
  if(on) _invOrder.forEach(p=> invState.sel.add(p.id)); else invState.sel.clear();
  // (se marcan las que se ven; las demás quedan elegidas aunque aún no se hayan pintado)
  document.querySelectorAll('#inv-results .inv-body [data-pid]').forEach(el=>{ const y = invState.sel.has(el.dataset.pid); el.classList.toggle('is-picked', y); });
  invBulkBarRefresh();
}
/* Al pintar la lista, las elegidas se marcan */
function invPickPaint(root){
  if(!invState.sel) return;
  (root || document).querySelectorAll('#inv-results .inv-body [data-pid]').forEach(el=>{ const y = invState.sel.has(el.dataset.pid); el.classList.toggle('is-picked', y); });
}
/* La hoja de cambios en bloque */
let bulkMove = { cat:'', plat:'', folder:'' };
function openInvBulkSheet(){
  const ids = invPickedIds(); if(!ids.length) return;
  const p0 = PRODUCTS_BY_ID[ids[0]];
  bulkMove = { cat:p0.categoryId, plat:p0.platformId || '', folder:'' };
  openSheet({ kind:'inv-bulk', title:t('bulk.title').replace('{n}', ids.length.toLocaleString(numLocale())), body:invBulkBodyHTML() });
}
function invBulkBodyHTML(){
  const ids = invPickedIds();
  const st = (v, key)=> `<button type="button" class="chip" data-fk="bs-${v}" onclick="invBulkPossession('${v}')">${t(key)}</button>`;
  const tags = [...new Set(ids.flatMap(id=> (PRODUCTS_BY_ID[id].tags || [])))].sort(compareNames);
  return `<div class="sheet-group"><div class="field-label" id="bkStLbl">${t('bulk.state')}</div>
      <div class="chip-row" role="group" aria-labelledby="bkStLbl">${st('tengo', 'poss.have')}${st('no', 'poss.no')}${st('en_camino', 'poss.incoming')}${st('reservado', 'poss.reserved')}${st('vendido', 'poss.sold')}${st('perdido', 'poss.lost')}</div>
      <div class="chip-row"><button type="button" class="chip" data-fk="bs-seal" onclick="invBulkSealed(true)">${icon('shield')} ${t('bulk.sealed_yes')}</button><button type="button" class="chip" data-fk="bs-noseal" onclick="invBulkSealed(false)">${t('bulk.sealed_no')}</button></div></div>
    <div class="sheet-group"><div class="field-label">${t('bulk.move')}</div>
      <div class="field-grid" data-nosave>
        <div class="field"><label for="bkCat">${t('p.move_category')}</label><select id="bkCat" onchange="bulkMove.cat=this.value; bulkMove.plat=''; bulkMove.folder=''; invBulkRefresh()">${getAllCategories().map(c=>`<option value="${c.id}" ${c.id===bulkMove.cat ? 'selected' : ''}>${escapeHTML(c.name)}</option>`).join('')}</select></div>
        <div class="field"><label for="bkPlat">${t('p.move_platform')}</label><select id="bkPlat" onchange="bulkMove.plat=this.value; bulkMove.folder=''; invBulkRefresh()">${(()=>{ const pl = getAllPlatforms().filter(x=>x.categoryId===bulkMove.cat); if(pl.length && !pl.some(x=>x.id===bulkMove.plat)) bulkMove.plat = pl[0].id; return pl.length ? pl.map(x=>`<option value="${x.id}" ${x.id===bulkMove.plat ? 'selected' : ''}>${escapeHTML(x.name)}</option>`).join('') : `<option value="">${t('p.move_no_platforms')}</option>`; })()}</select></div>
        <div class="field"><label for="bkFolder">${t('p.move_folder')}</label><select id="bkFolder" onchange="bulkMove.folder=this.value">${moveToolFolderOptions(bulkMove.plat, bulkMove.folder)}</select></div>
      </div>
      <button type="button" class="btn btn-sm" data-fk="bs-move" onclick="invBulkMove()" ${bulkMove.plat ? '' : 'disabled'}>${icon('shuffle')} ${t('bulk.move_btn')}</button></div>
    <div class="sheet-group"><div class="field-label">${t('bulk.tags')}</div>
      <div class="bulk-tag-add" data-nosave><label class="sr-only" for="bkTag">${t('bulk.tag_ph')}</label><input id="bkTag" class="input" type="text" maxlength="40" placeholder="${escapeHTML(t('bulk.tag_ph'))}" onkeydown="if(event.key==='Enter'){ event.preventDefault(); invBulkTagAdd(); }"><button type="button" class="btn btn-sm" data-fk="bs-tag" onclick="invBulkTagAdd()">${icon('tag')} ${t('bulk.tag_add')}</button></div>
      ${tags.length ? `<div class="chip-row">${tags.map(tg=>`<button type="button" class="chip chip-remove" onclick="invBulkTagRemove(this.dataset.tag)" data-tag="${escapeHTML(tg)}" aria-label="${escapeHTML(t('bulk.tag_rm').replace('{t}', tg))}">${escapeHTML(tg)}<span class="chip-x">${icon('x')}</span></button>`).join('')}</div>` : ''}</div>
    <div class="sheet-group"><div class="field-label">${t('bulk.value')}</div>
      <div class="field-grid" data-nosave>
        <div class="field"><label for="bkValNow">${t('p.value_now')} (${currencySymbol()})</label><input id="bkValNow" type="number" inputmode="decimal" step="0.01" min="0"></div>
        <div class="field"><label for="bkValPaid">${t('p.value_bought')} (${currencySymbol()})</label><input id="bkValPaid" type="number" inputmode="decimal" step="0.01" min="0"></div>
      </div>
      <button type="button" class="btn btn-sm" data-fk="bs-val" onclick="invBulkValue()">${icon('coins')} ${t('bulk.value_apply')}</button></div>`;
}
function invBulkRefresh(){ if(isSheetKind('inv-bulk')){ const a = document.activeElement, id = a && a.id; updateSheetBody(invBulkBodyHTML()); if(id){ const b = document.getElementById(id); if(b) b.focus(); } } }
/* Copia de lo que se va a cambiar (para «Deshacer») */
function bulkSnap(ids, withShelf){
  return { prod: ids.map(id=> [id, OVERRIDES.products[id] ? JSON.stringify(OVERRIDES.products[id]) : null]),
    est: withShelf && OVERRIDES.estanterias ? JSON.stringify(OVERRIDES.estanterias) : null, vh: JSON.stringify(OVERRIDES.valorHistorial===undefined ? null : OVERRIDES.valorHistorial) };
}
async function bulkRestore(snap){
  snap.prod.forEach(([id, js])=>{ if(js===null) delete OVERRIDES.products[id]; else OVERRIDES.products[id] = JSON.parse(js); });
  if(snap.est!==null){ OVERRIDES.estanterias = JSON.parse(snap.est); if(typeof _estClean!=='undefined') _estClean = null; }
  const vh = JSON.parse(snap.vh); if(vh===null) delete OVERRIDES.valorHistorial; else OVERRIDES.valorHistorial = vh;
  await persistOverrides(); buildProducts(); render();
}
async function bulkFinish(ids, snap, extra){
  await persistOverrides(); buildProducts();
  closeSheet(); await renderKeepFocus('[data-fk="bulk-go"]');
  { const b = document.querySelector('#inv-results [data-fk="bulk-go"]:not([disabled])') || document.querySelector('#inv-results [data-fk="inv-pick"]'); if(b && !document.activeElement.closest('#inv-results')) b.focus({ preventScroll:true }); }
  const n = ids.length;
  showToast((n===1 ? t('bulk.done_n1') : t('bulk.done_n').replace('{n}', n.toLocaleString(numLocale()))) + (extra ? ' ' + extra : ''), { ok:true, replace:true, duration:7000, action:{ label:t('common.undo'), fn: ()=> bulkRestore(snap) } });
}
function bulkOv(id){ if(!OVERRIDES.products[id]) OVERRIDES.products[id] = {}; return OVERRIDES.products[id]; }
function setPossessionOv(p, v){
  const o = bulkOv(p.id); o.possession = v;
  if(checklistHasTengoKey(p.categoryId)){ o.components = Object.assign({}, p.components || {}, o.components || {}); o.components.tengo = (v==='tengo'); }
}
async function invBulkPossession(v){
  const ids = invPickedIds(); if(!ids.length) return;
  const snap = bulkSnap(ids, false);
  ids.forEach(id=> setPossessionOv(PRODUCTS_BY_ID[id], v));
  await bulkFinish(ids, snap);
}
async function invBulkSealed(on){
  const ids = invPickedIds(); if(!ids.length) return;
  const snap = bulkSnap(ids, false);
  ids.forEach(id=>{ const p = PRODUCTS_BY_ID[id]; bulkOv(id).sealed = !!on; if(on && p.possession!=='tengo') setPossessionOv(p, 'tengo'); });
  await bulkFinish(ids, snap);
}
async function invBulkMove(){
  const ids = invPickedIds(); if(!ids.length) return;
  const plat = getAllPlatforms().find(x=>x.id===bulkMove.plat); if(!plat) return;
  const folder = bulkMove.folder && foldersForPlatform(plat.id).some(f=>f.id===bulkMove.folder) ? bulkMove.folder : null;
  const snap = bulkSnap(ids, true);
  const fit0 = typeof estOverMap==='function' && typeof estHas==='function' && estHas() ? estOverMap() : null;
  ids.forEach(id=>{ const o = bulkOv(id); o.categoryId = plat.categoryId; o.platformId = plat.id; o.platformName = plat.name; o.folderId = folder; });
  buildProducts();
  const mv = fit0 && typeof estKeepInside==='function' ? estKeepInside(fit0) : null;   // (como al mover una: lo que ya no quepa en su balda, a otro sitio)
  if(mv && typeof estSave==='function') await estSave(true);
  await bulkFinish(ids, snap, mv ? estFitMsg(mv) : '');
}
async function invBulkTagAdd(){
  const inp = document.getElementById('bkTag'); const tag = inp ? inp.value.trim().slice(0, 40) : '';
  if(!tag){ if(inp) inp.focus(); return; }
  const ids = invPickedIds(); if(!ids.length) return;
  const snap = bulkSnap(ids, false);
  ids.forEach(id=>{ const p = PRODUCTS_BY_ID[id]; const cur = (p.tags || []).slice(); if(!cur.some(x=> normText(x)===normText(tag))) cur.push(tag); bulkOv(id).tags = cur; });
  await bulkFinish(ids, snap);
}
async function invBulkTagRemove(tag){
  const ids = invPickedIds(); if(!ids.length || !tag) return;
  const snap = bulkSnap(ids, false);
  ids.forEach(id=>{ const p = PRODUCTS_BY_ID[id]; if((p.tags || []).includes(tag)) bulkOv(id).tags = p.tags.filter(x=> x!==tag); });
  await bulkFinish(ids, snap);
}
function readMoney(id){ const el = document.getElementById(id); if(!el || el.value.trim()==='') return undefined; const v = Number(String(el.value).replace(',', '.')); return isFinite(v) && v >= 0 ? Math.round(v * 100) / 100 : NaN; }
async function invBulkValue(){
  const now = readMoney('bkValNow'), paid = readMoney('bkValPaid');
  if(Number.isNaN(now) || Number.isNaN(paid)){ const bad = Number.isNaN(now) ? 'bkValNow' : 'bkValPaid'; const el = document.getElementById(bad); if(el){ el.setAttribute('aria-invalid', 'true'); el.focus(); } return; }
  if(now===undefined && paid===undefined){ const el = document.getElementById('bkValNow'); if(el) el.focus(); return; }
  const ids = invPickedIds(); if(!ids.length) return;
  const snap = bulkSnap(ids, false);
  const hoy = new Date().toISOString().slice(0, 10);
  ids.forEach(id=>{ const p = PRODUCTS_BY_ID[id], o = bulkOv(id); o.valuation = Object.assign({}, p.valuation || {}, o.valuation || {});
    if(now!==undefined){ o.valuation.valorActual = now; o.valuation.fechaActualizacion = hoy; }
    if(paid!==undefined) o.valuation.valorAdquisicion = paid; });
  buildProducts(); recordValueHistory();
  await bulkFinish(ids, snap);
}

/* ---------- Deslizar una fila: «Lo tengo» / «En camino» (con «Deshacer») ---------- */
async function swipeAction(id, dir){
  const p = PRODUCTS_BY_ID[id]; if(!p) return;
  let next;
  if(dir==='left') next = p.possession==='tengo' ? 'no' : 'tengo';
  else { if(p.possession==='tengo'){ showToast(t('swipe.already'), { replace:true }); return; } next = p.possession==='en_camino' ? 'no' : 'en_camino'; }
  const snap = bulkSnap([id], false);
  setPossessionOv(p, next);
  await persistOverrides(); buildProducts();
  if(view.page==='inventario' && !view.productId) await refreshInventoryResults(); else render();
  const label = next==='tengo' ? t('swipe.have') : next==='en_camino' ? t('swipe.coming') : t('swipe.missing');
  showToast(t('swipe.done').replace('{n}', p.name).replace('{s}', label), { ok: next==='tengo', replace:true, duration:6000, action:{ label:t('common.undo'), fn: ()=> bulkRestore(snap) } });
}

/* ---------- Préstamos y compra (en la ficha) ---------- */
function isLoaned(p){ return !!(p && p.prestamo && typeof p.prestamo==='object' && String(p.prestamo.a || '').trim()); }
function loanSectionHTML(p){
  const L = p.prestamo && typeof p.prestamo==='object' ? p.prestamo : {}, C = p.compra && typeof p.compra==='object' ? p.compra : {};
  const body = `<div class="field-grid">
      ${editableField('date', t('loan.bought_date'), C.fecha || '', `updatePurchase('${p.id}','fecha',this.value)`)}
      ${editableField('text', t('loan.store'), C.tienda || '', `updatePurchase('${p.id}','tienda',this.value)`, '', 'maxlength="80" list="storeListP" autocomplete="off"')}
    </div>${storeDatalistHTML('storeListP')}<p class="section-sub">${t('loan.paid_note')}</p>
    <div class="field-grid">
      ${editableField('text', t('loan.to'), L.a || '', `updateLoan('${p.id}','a',this.value)`, '', 'maxlength="60"')}
      ${editableField('date', t('loan.since'), L.desde || '', `updateLoan('${p.id}','desde',this.value)`)}
    </div>${isLoaned(p) ? `<button type="button" class="btn btn-sm" data-fk="loan-back" onclick="loanReturned('${p.id}')">${icon('check')} ${t('loan.returned')}</button>` : ''}`;
  const meta = isLoaned(p) ? t('loan.sum').replace('{a}', L.a) : (C.fecha ? t('loan.bought_sum').replace('{d}', C.fecha) : (C.tienda || ''));
  return disclosureHTML('prestamo', t('loan.title'), body, productSectionsOpen, escapeHTML(meta));
}
async function updateLoan(id, field, value){
  const p = PRODUCTS_BY_ID[id]; if(!p) return;
  const cur = Object.assign({ a:'', desde:'' }, p.prestamo && typeof p.prestamo==='object' ? p.prestamo : {});
  cur[field] = String(value || '').trim();
  if(field==='a' && cur.a && !cur.desde) cur.desde = new Date().toISOString().slice(0, 10);
  const v = cur.a ? { a:cur.a, desde:cur.desde } : null;
  p.prestamo = v; await setProductField(id, 'prestamo', v);
  renderKeepFocus();
}
async function loanReturned(id){
  const p = PRODUCTS_BY_ID[id]; if(!p || !isLoaned(p)) return;
  const was = p.prestamo;
  p.prestamo = null; await setProductField(id, 'prestamo', null);
  await renderKeepFocus(`[onchange^="updateLoan('${id}','a'"]`);   // (el botón ya no está: el foco va a «Prestada a»)
  showToast(t('loan.back_done'), { ok:true, replace:true, action:{ label:t('common.undo'), fn: async ()=>{ const q = PRODUCTS_BY_ID[id]; if(!q) return; q.prestamo = was; await setProductField(id, 'prestamo', was); render(); } } });
}
async function updatePurchase(id, field, value){
  const p = PRODUCTS_BY_ID[id]; if(!p) return;
  const cur = Object.assign({ fecha:'', tienda:'' }, p.compra && typeof p.compra==='object' ? p.compra : {});
  cur[field] = String(value || '').trim();
  let added = false;
  if(field==='tienda' && cur.tienda){ cur.tienda = storeCanonical(cur.tienda); added = storeRemember(cur.tienda); }   // v11.20: un sitio nuevo pasa a «Mis sitios»
  const v = cur.fecha || cur.tienda ? { fecha:cur.fecha, tienda:cur.tienda } : null;
  p.compra = v; await setProductField(id, 'compra', v);
  if(added) showToast(t('stores.added').replace('{s}', cur.tienda), { ok:true, replace:true });
}
/* Etiquetas en la ficha: añadir y quitar */
function tagsEditorHTML(p){
  const tags = p.tags || [];
  return `<div class="field-label">${t('p.tags')}</div><div class="badge-row tag-row">${tags.map(tg=>`<span class="vtag is-editable">${escapeHTML(tg)}<button type="button" class="vtag-x" onclick="removeTag('${p.id}', this.dataset.tag)" data-tag="${escapeHTML(tg)}" aria-label="${escapeHTML(t('p.tag_rm').replace('{t}', tg))}">${icon('x')}</button></span>`).join('')}
    <button type="button" class="chip chip-add-tag" data-fk="tag-add" onclick="addTagPrompt('${p.id}')">${icon('plus')} ${t('p.tags_add')}</button></div>`;
}
async function addTagPrompt(id){
  const p = PRODUCTS_BY_ID[id]; if(!p) return;
  const v = await showPromptModal(t('p.tags_add'), ''); const tag = String(v || '').trim().slice(0, 40);
  if(!tag) return;
  const cur = (p.tags || []).slice(); if(!cur.some(x=> normText(x)===normText(tag))) cur.push(tag);
  p.tags = cur; await setProductField(id, 'tags', cur); renderKeepFocus();
}
async function removeTag(id, tag){
  const p = PRODUCTS_BY_ID[id]; if(!p) return;
  const cur = (p.tags || []).filter(x=> x!==tag);
  p.tags = cur; await setProductField(id, 'tags', cur);
  await render(); const b = document.querySelector('#panel [data-fk="tag-add"]'); if(b) b.focus({ preventScroll:true });
}

/* ---------- El valor: su evolución y valorar en serie ---------- */
/* Un punto por día con el valor total (se guarda al cambiar algún valor) */
function recordValueHistory(){
  const g = computeGlobalStats();
  const list = Array.isArray(OVERRIDES.valorHistorial) ? OVERRIDES.valorHistorial.filter(x=> x && typeof x.f==='string' && typeof x.v==='number') : [];
  if(!g.valued && !list.length) return;
  const hoy = new Date().toISOString().slice(0, 10), e = { f:hoy, v: Math.round(g.valor * 100) / 100, n:g.valued };
  const last = list[list.length - 1];
  if(last && last.f===hoy) list[list.length - 1] = e;
  else if(!last || last.v!==e.v || last.n!==e.n) list.push(e);
  OVERRIDES.valorHistorial = list.slice(-730);
}
function valueTotals(){
  let now = 0, paid = 0, nNow = 0, nPaid = 0, both = 0, nowBoth = 0, paidBoth = 0;
  allEditionsForStats().forEach(({ product:p })=>{
    if(p.possession!=='tengo') return;
    const a = valueNow(p), b = valuePaid(p);
    if(a!==null){ now += a; nNow++; } if(b!==null){ paid += b; nPaid++; }
    if(a!==null && b!==null){ both++; nowBoth += a; paidBoth += b; }
  });
  return { now, paid, nNow, nPaid, both, diff: nowBoth - paidBoth };
}
function valueChartSVG(list){
  const pts = list.filter(x=> x && typeof x.v==='number').slice(-120);
  if(pts.length < 2) return '';
  const W = 320, H = 120, P = 8;
  const vs = pts.map(x=>x.v), lo = Math.min(...vs), hi = Math.max(...vs), span = hi - lo || 1;
  const t0 = Date.parse(pts[0].f), t1 = Date.parse(pts[pts.length - 1].f), ts = (t1 - t0) || 1;
  const xy = pts.map(x=> [P + (Date.parse(x.f) - t0) / ts * (W - 2 * P), H - P - (x.v - lo) / span * (H - 2 * P)]);
  const d = xy.map((q, i)=> (i ? 'L' : 'M') + q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join(' ');
  const area = d + ` L${xy[xy.length - 1][0].toFixed(1)} ${H - P} L${xy[0][0].toFixed(1)} ${H - P} Z`;
  const label = t('val.chart_label') + ': ' + pts.map(x=> x.f + ' ' + fmtMoney(x.v)).filter((_, i, a)=> i===0 || i===a.length - 1).join(' → ');
  return `<figure class="val-chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${escapeHTML(label)}" preserveAspectRatio="none"><path class="vc-area" d="${area}"/><path class="vc-line" d="${d}"/>${xy.map(q=>`<circle class="vc-dot" cx="${q[0].toFixed(1)}" cy="${q[1].toFixed(1)}" r="2.2"/>`).join('')}</svg>
    <figcaption><span>${escapeHTML(pts[0].f)} · ${escapeHTML(fmtMoney(pts[0].v))}</span><span>${escapeHTML(pts[pts.length - 1].f)} · ${escapeHTML(fmtMoney(pts[pts.length - 1].v))}</span></figcaption></figure>`;
}
function valueSectionHTML(){
  const v = valueTotals(), have = allEditionsForStats().filter(x=>x.edition.possession==='tengo').length;
  const hist = Array.isArray(OVERRIDES.valorHistorial) ? OVERRIDES.valorHistorial : [];
  const chart = valueChartSVG(hist);
  const btn = `<button type="button" class="btn btn-sm" data-fk="val-bulk" onclick="openValueBulk()">${icon('coins')} ${t('val.bulk')}</button>`;
  if(!v.nNow && !v.nPaid) return `<section class="vit-section">${sectionTitleHTML(t('val.title'))}<p class="section-sub">${t('val.empty')}</p>${btn}</section>`;
  return `<section class="vit-section">${sectionTitleHTML(t('val.title'), t('val.pieces').replace('{n}', v.nNow).replace('{t}', have))}
    <div class="metric-grid val-metrics">
      <div class="metric"><div class="metric-label">${t('val.now')}</div><div class="metric-value">${fmtMoney(v.now)}</div></div>
      <div class="metric"><div class="metric-label">${t('val.paid')}</div><div class="metric-value">${v.nPaid ? fmtMoney(v.paid) : '—'}</div></div>
      ${v.both ? `<div class="metric"><div class="metric-label">${t('val.diff')}</div><div class="metric-value ${v.diff >= 0 ? 'is-up' : 'is-down'}">${(v.diff >= 0 ? '+' : '−') + fmtMoney(Math.abs(v.diff))}</div><div class="metric-sub">${t('val.diff_note').replace('{n}', v.both)}</div></div>` : ''}
    </div>
    ${chart || `<p class="section-sub">${t('val.chart_one')}</p>`}
    ${btn}</section>`;
}
/* Valorar en serie: una lista de tus piezas con su valor, para rellenarlo seguido.
   v11.20: buscador, «Dónde lo compré» en cada fila y el filtro «Sin sitio». v11.21.1: «Sin pagado». */
let vbState = { show:'novalue', plat:'', q:'', limit:40 };
function openValueBulk(keep){
  if(keep!==true) vbState = { show:'novalue', plat:'', q:'', limit:40 };
  openSheet({ kind:'val-bulk', title:t('val.bulk_title'), body:valueBulkBodyHTML(), foot:`<button type="button" class="btn primary" onclick="closeSheet()">${t('copy.done')}</button>`,
    focus: keep===true ? '[data-fk="vb-stores"]' : '[data-fk="vb-' + vbState.show + '"]', onClose: ()=> render() });
}
function hasStore(p){ return !!(p && p.compra && typeof p.compra==='object' && String(p.compra.tienda || '').trim()); }
function valueBulkList(){
  const tk = searchTokens(vbState.q || '');
  return sortGames(PRODUCTS.filter(p=> p.possession==='tengo' && (!vbState.plat || p.platformId===vbState.plat)
    && (vbState.show!=='novalue' || valueNow(p)===null) && (vbState.show!=='nopaid' || valuePaid(p)===null) && (vbState.show!=='nostore' || !hasStore(p)) && productMatchesSearch(p, tk)));
}
function valueBulkBodyHTML(){
  const list = valueBulkList();
  const plats = getAllPlatforms().filter(pl=> PRODUCTS.some(p=> p.platformId===pl.id && p.possession==='tengo'));
  const chip = (k, label)=> `<button type="button" class="chip ${vbState.show===k ? 'active' : ''}" aria-pressed="${vbState.show===k}" data-fk="vb-${k}" onclick="vbState.show='${k}'; vbState.limit=40; vbRefresh()">${label}</button>`;
  return `${searchbarHTML({ id:'vbQ', placeholder:t('vb.search_ph'), value:vbState.q, oninput:'vbQuery(this.value)' })}
    <div class="chip-row vb-chips" role="group" aria-label="${escapeHTML(t('val.bulk_title'))}">${chip('novalue', t('val.only_missing'))}${chip('nopaid', t('vb.no_paid'))}${chip('nostore', t('vb.no_store'))}${chip('all', t('val.all'))}</div>
    <div class="vb-tools"><div class="field" data-nosave><label for="vbPlat">${t('filter.platform')}</label><select id="vbPlat" onchange="vbState.plat=this.value; vbState.limit=40; vbRefresh()"><option value="">${t('val.platform_all')}</option>${plats.map(pl=>`<option value="${pl.id}" ${vbState.plat===pl.id ? 'selected' : ''}>${escapeHTML(pl.name)}</option>`).join('')}</select></div>
      <button type="button" class="btn btn-sm" data-fk="vb-stores" onclick="openStoresSheet(true)">${icon('pencil')} ${t('stores.title')}</button></div>
    <p class="section-sub vb-count" id="vbCount" role="status">${escapeHTML(vbCountText(list.length))}</p>
    <div id="vbRes">${valueBulkResultsHTML(list)}</div>${storeDatalistHTML('vbStores')}`;
}
function vbCountText(n){ return (n===1 ? t('vb.count1') : t('vb.count')).replace('{n}', n); }
function valueBulkResultsHTML(list){
  const shown = list.slice(0, vbState.limit);
  const cs = currencySymbol();
  const empty = vbState.q.trim() ? t('vb.no_match') + (vbState.show!=='all' ? ' ' + t('vb.try_all') : '')
    : t(vbState.show==='novalue' ? 'val.none_left' : vbState.show==='nopaid' ? 'vb.none_left_paid' : vbState.show==='nostore' ? 'vb.none_left_store' : 'val.empty_sel');
  return `${shown.length ? `<div class="vb-list" data-nosave>${shown.map(p=>{ const id = escapeHTML(p.id), now = valueNow(p), paid = valuePaid(p), st = hasStore(p) ? p.compra.tienda : '';
      return `<div class="vb-row" data-id="${id}" onfocusout="vbRowLeft(this, event)"><div class="vb-name"><b>${escapeHTML(p.name)}</b><small>${escapeHTML([p.platformName, p.year].filter(Boolean).join(' · '))}</small></div>
        <label class="vb-in"><span>${t('val.now')}</span><span class="vb-box"><input type="number" inputmode="decimal" step="0.01" min="0" value="${now===null ? '' : now}" aria-label="${escapeHTML(t('val.now') + ' — ' + p.name)}" onchange="vbSet('${id}','valorActual',this)"><i aria-hidden="true">${escapeHTML(cs)}</i></span></label>
        <label class="vb-in"><span>${t('val.paid_short')}</span><span class="vb-box"><input type="number" inputmode="decimal" step="0.01" min="0" value="${paid===null ? '' : paid}" aria-label="${escapeHTML(t('p.value_bought') + ' — ' + p.name)}" onchange="vbSet('${id}','valorAdquisicion',this)"><i aria-hidden="true">${escapeHTML(cs)}</i></span></label>
        <label class="vb-in vb-store"><span>${t('vb.store')}</span><span class="vb-box is-text"><input type="text" list="vbStores" maxlength="80" autocomplete="off" enterkeyhint="done" value="${escapeHTML(st)}" placeholder="${escapeHTML(t('vb.store_ph'))}" aria-label="${escapeHTML(t('vb.store') + ' — ' + p.name)}" onchange="vbSetStore('${id}',this)"></span></label></div>`; }).join('')}</div>`
      : `<p class="section-sub">${escapeHTML(empty)}</p>`}
    ${list.length > shown.length ? `<button type="button" class="btn btn-sm load-more" data-fk="vb-more" onclick="vbState.limit+=40; vbRefreshList()">${t('val.more').replace('{n}', list.length - shown.length)}</button>` : ''}`;
}
/* Al escribir en el buscador solo cambia la lista: la caja no se toca (el teclado del móvil no se corta) */
function vbQuery(v){
  vbState.q = String(v || ''); vbState.limit = 40;
  clearTimeout(window._vbQT); window._vbQT = setTimeout(vbRefreshList, 140);
}
function vbRefreshList(){
  if(!isSheetKind('val-bulk')) return;
  const r = document.getElementById('vbRes'); if(!r) return;
  const a = document.activeElement, more = a && a.dataset && a.dataset.fk==='vb-more';
  const list = valueBulkList();
  r.innerHTML = valueBulkResultsHTML(list);
  const c = document.getElementById('vbCount'); if(c) c.textContent = vbCountText(list.length);
  if(more){ const b = r.querySelector('[data-fk="vb-more"]'); if(b) b.focus({ preventScroll:true }); }   // (como antes: el foco sigue en «Ver más», sin abrir el teclado)
}
function vbRefresh(){
  if(!isSheetKind('val-bulk')) return;
  const a = document.activeElement, fk = a && a.dataset ? a.dataset.fk : null, id = a && a.id;
  const pos = a && a.id==='vbQ' ? a.selectionStart : null;
  const body = document.getElementById('sheetBody'), y = body ? body.scrollTop : 0;
  updateSheetBody(valueBulkBodyHTML());
  if(body) body.scrollTop = y;
  const b = fk ? document.querySelector(`#sheetBody [data-fk="${fk}"]`) : id ? document.getElementById(id) : null;
  if(b){ b.focus({ preventScroll:true }); if(pos!==null) try{ b.setSelectionRange(pos, pos); }catch(e){} }
}
async function vbSet(id, field, input){
  if(input.validity && input.validity.badInput){ input.setAttribute('aria-invalid', 'true'); return; }   // (lo escrito no es un número: no se borra lo que había)
  const raw = String(input.value || '').trim();
  const v = raw==='' ? null : Number(raw.replace(',', '.'));
  if(raw!=='' && (!isFinite(v) || v < 0)){ input.setAttribute('aria-invalid', 'true'); return; }
  input.removeAttribute('aria-invalid');
  const p = PRODUCTS_BY_ID[id]; if(!p) return;
  p.valuation = Object.assign({}, p.valuation || {}); p.valuation[field] = v===null ? null : Math.round(v * 100) / 100;
  await setEditionNested(id, 'valuation', field, p.valuation[field]);
  if(field==='valorActual'){ const hoy = new Date().toISOString().slice(0, 10); p.valuation.fechaActualizacion = hoy; await setEditionNested(id, 'valuation', 'fechaActualizacion', hoy); }
  recordValueHistory(); await persistOverrides();
  vbRowSaved(input.closest('.vb-row'));
}
async function vbSetStore(id, input){
  if(!PRODUCTS_BY_ID[id]) return;
  const v = storeCanonical(input.value);
  input.value = v;
  await updatePurchase(id, 'tienda', v);
  vbRowSaved(input.closest('.vb-row'));
}
/* v11.20.1: con «Sin valor» o «Sin sitio», la pieza que ya tiene ese dato se va de la lista
   en cuanto pasas a otra fila (mientras sigues en la suya, se queda: puedes rellenar el resto) */
function vbRowDone(row){
  const p = row && PRODUCTS_BY_ID[row.dataset.id]; if(!p) return false;
  return (vbState.show==='novalue' && valueNow(p)!==null) || (vbState.show==='nopaid' && valuePaid(p)!==null) || (vbState.show==='nostore' && hasStore(p));
}
function vbRowSaved(row){
  if(!row) return;
  row.classList.add('is-saved');
  if(vbRowDone(row) && !row.contains(document.activeElement)) vbRowRemove(row);   // (ya estás en otra fila)
}
function vbRowLeft(row, e){
  if(e.relatedTarget && row.contains(e.relatedTarget)) return;   // (sigue dentro de la misma fila)
  if(vbRowDone(row)) vbRowRemove(row);
}
function vbRowRemove(row){
  if(!row || row.classList.contains('is-leaving') || !isSheetKind('val-bulk')) return;
  const done = ()=>{
    if(!row.isConnected) return;
    // la fila en la que estás ahora no se mueve: si la que se va está por encima, se compensa el desplazamiento
    const body = document.getElementById('sheetBody'), a = document.activeElement, r = a && a.closest ? a.closest('.vb-row') : null;
    const y0 = r && r!==row ? r.getBoundingClientRect().top : null;
    row.remove();
    if(y0!==null && body){ const dy = r.getBoundingClientRect().top - y0; if(dy) body.scrollTop += dy; }
    const list = valueBulkList(), c = document.getElementById('vbCount'); if(c) c.textContent = vbCountText(list.length);
    const left = document.querySelectorAll('#vbRes .vb-row').length, more = document.querySelector('#vbRes [data-fk="vb-more"]');
    if(more){ const n = list.length - left; if(n > 0) more.textContent = t('val.more').replace('{n}', n); else more.remove(); }
    if(!left) vbRefreshList();   // (no queda ninguna: sale el aviso o las siguientes)
  };
  row.classList.add('is-leaving');
  if(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) done(); else setTimeout(done, 220);
}

/* ---------- Mis sitios de compra (v11.20) ----------
   Las sugerencias de «Dónde lo compré» / «Tienda o vendedor». Mientras no
   cambies nada, es la lista inicial (no se guarda nada); en cuanto añades,
   renombras o quitas uno, se guarda en OVERRIDES.tiendas (una lista de textos).
   Un sitio nuevo escrito en una pieza se añade solo. Quitar un sitio de la
   lista no cambia las piezas que ya lo tienen. */
const STORE_DEFAULTS = ['eBay', 'Wallapop', 'Vinted', 'Todocolección', 'Amazon', 'Buyee', 'Yahoo! Auctions', 'Mercari', 'Suruga-ya', 'Mandarake', 'CeX', 'GAME'];
function storeKey(s){ return normText(String(s===null || s===undefined ? '' : s).trim()).replace(/\s+/g, ' '); }
function storeList(){
  const src = Array.isArray(OVERRIDES.tiendas) ? OVERRIDES.tiendas : STORE_DEFAULTS.concat([t('stores.physical')]);
  const seen = new Set(), out = [];
  src.forEach(s=>{ if(typeof s!=='string') return; const v = s.trim().slice(0, 80), k = storeKey(v); if(!v || seen.has(k)) return; seen.add(k); out.push(v); });
  return out;
}
/* Si ya está en tu lista (sin mirar mayúsculas ni tildes), se escribe como en la lista */
function storeCanonical(v){
  const s = String(v || '').trim().slice(0, 80), k = storeKey(s); if(!s) return '';
  return storeList().find(x=> storeKey(x)===k) || s;
}
function storeOptionsHTML(){ return storeList().map(s=>`<option value="${escapeHTML(s)}"></option>`).join(''); }
function storeDatalistHTML(id){ return `<datalist id="${id}" class="store-dl">${storeOptionsHTML()}</datalist>`; }
function storeDatalistsRefresh(){ const html = storeOptionsHTML(); document.querySelectorAll('datalist.store-dl').forEach(d=>{ d.innerHTML = html; }); }
/* Un sitio nuevo escrito en una pieza pasa a tu lista (devuelve true si era nuevo) */
function storeRemember(name){
  const v = String(name || '').trim().slice(0, 80); if(!v) return false;
  const list = storeList(); if(list.some(s=> storeKey(s)===storeKey(v))) return false;
  OVERRIDES.tiendas = list.concat([v]); storeDatalistsRefresh(); return true;
}
function storeUseCounts(){
  const m = {};
  PRODUCTS.forEach(p=>{ if(hasStore(p)){ const k = storeKey(p.compra.tienda); m[k] = (m[k] || 0) + 1; } });
  return m;
}
let storesBack = null;
function openStoresSheet(fromBulk){
  storesBack = fromBulk===true ? 'val-bulk' : null;
  openSheet({ kind:'stores', title:t('stores.title'), body:storesBodyHTML(), foot:`<button type="button" class="btn primary" onclick="closeSheet()">${t('copy.done')}</button>`,
    focus:'[data-fk="st-add"]', onClose: ()=>{ if(storesBack==='val-bulk') openValueBulk(true); else render(); } });
}
function storesBodyHTML(){
  const list = storeList(), uses = storeUseCounts();
  return `<p class="section-sub">${t('stores.sub')}</p>
    <div class="st-add"><div class="field"><label for="stNew">${t('stores.new')}</label><input id="stNew" type="text" maxlength="80" autocomplete="off" enterkeyhint="done" onkeydown="if(event.key==='Enter'){ event.preventDefault(); storeAddFromInput(); }"></div>
      <button type="button" class="btn" data-fk="st-add" onclick="storeAddFromInput()">${icon('plus')} ${t('stores.add')}</button></div>
    ${list.length ? `<ul class="st-list">${list.map((s, i)=>{ const n = uses[storeKey(s)] || 0;
      return `<li class="st-row"><span class="st-name"><b>${escapeHTML(s)}</b>${n ? `<small>${escapeHTML((n===1 ? t('stores.used1') : t('stores.used')).replace('{n}', n))}</small>` : ''}</span>
        <button type="button" class="btn btn-ghost btn-icon" data-fk="st-ren-${i}" onclick="storeRename(${i})" aria-label="${escapeHTML(t('stores.rename').replace('{s}', s))}" title="${escapeHTML(t('stores.rename').replace('{s}', s))}">${icon('pencil')}</button>
        <button type="button" class="btn btn-ghost btn-icon" data-fk="st-rm-${i}" onclick="storeRemove(${i})" aria-label="${escapeHTML(t('stores.remove').replace('{s}', s))}" title="${escapeHTML(t('stores.remove').replace('{s}', s))}">${icon('trash')}</button></li>`; }).join('')}</ul>`
      : `<p class="section-sub">${t('stores.empty')}</p>`}`;
}
function storesRefresh(focusSel){
  if(!isSheetKind('stores')) return;
  const body = document.getElementById('sheetBody'), y = body ? body.scrollTop : 0;
  const inp = document.getElementById('stNew'), typed = inp ? inp.value : '';
  updateSheetBody(storesBodyHTML());
  if(body) body.scrollTop = y;
  const ni = document.getElementById('stNew'); if(ni) ni.value = typed;
  const b = focusSel ? document.querySelector('#sheetBody ' + focusSel) : null;
  (b || document.querySelector('#sheetBody [data-fk="st-add"]')).focus({ preventScroll:true });
}
async function storeAddFromInput(){
  const inp = document.getElementById('stNew'); if(!inp) return;
  const v = inp.value.trim().slice(0, 80);
  if(!v){ inp.focus(); return; }
  const list = storeList();
  if(list.some(s=> storeKey(s)===storeKey(v))){ showToast(t('stores.exists').replace('{s}', v), { replace:true }); inp.focus(); inp.select(); return; }
  OVERRIDES.tiendas = list.concat([v]); await persistOverrides();
  inp.value = ''; storesRefresh('#stNew');   // (el foco sigue en la caja, para añadir otro)
  showToast(t('stores.added').replace('{s}', v), { ok:true, replace:true });
}
async function storeRename(i){
  const list = storeList(), old = list[i]; if(old===undefined) return;
  const raw = await askText(t('stores.rename_q').replace('{s}', old), old);
  if(raw===null) return storesRefresh(`[data-fk="st-ren-${i}"]`);
  const nv = String(raw).trim().slice(0, 80);
  if(!nv || nv===old) return storesRefresh(`[data-fk="st-ren-${i}"]`);
  if(list.some((s, j)=> j!==i && storeKey(s)===storeKey(nv))){ showToast(t('stores.exists').replace('{s}', nv), { replace:true }); return storesRefresh(`[data-fk="st-ren-${i}"]`); }
  const k = storeKey(old), ids = PRODUCTS.filter(p=> hasStore(p) && storeKey(p.compra.tienda)===k).map(p=> p.id);
  if(ids.length && !await showConfirmModal((ids.length===1 ? t('stores.rename_also1') : t('stores.rename_also')).replace('{n}', ids.length).replace('{a}', old).replace('{b}', nv), { okLabel:t('stores.rename_ok') }))
    return storesRefresh(`[data-fk="st-ren-${i}"]`);
  const prevList = Array.isArray(OVERRIDES.tiendas) ? OVERRIDES.tiendas.slice() : undefined, prevCompra = {};
  const next = list.slice(); next[i] = nv; OVERRIDES.tiendas = next;
  ids.forEach(id=>{ const p = PRODUCTS_BY_ID[id]; prevCompra[id] = p.compra; const v = Object.assign({}, p.compra, { tienda:nv });
    p.compra = v; if(!OVERRIDES.products[id]) OVERRIDES.products[id] = {}; OVERRIDES.products[id].compra = v; });
  await persistOverrides();
  storesRefresh(`[data-fk="st-ren-${i}"]`);
  showToast(ids.length ? (ids.length===1 ? t('stores.renamed1') : t('stores.renamed')).replace('{n}', ids.length).replace('{s}', nv) : t('stores.renamed0').replace('{s}', nv), { ok:true, replace:true, action:{ label:t('common.undo'), fn: async ()=>{
    if(prevList===undefined) delete OVERRIDES.tiendas; else OVERRIDES.tiendas = prevList;
    Object.keys(prevCompra).forEach(id=>{ const p = PRODUCTS_BY_ID[id]; if(!p) return; p.compra = prevCompra[id]; if(!OVERRIDES.products[id]) OVERRIDES.products[id] = {}; OVERRIDES.products[id].compra = prevCompra[id]; });
    await persistOverrides(); storesAfterUndo(`[data-fk="st-ren-${i}"]`); } } });
}
async function storeRemove(i){
  const list = storeList(), s = list[i]; if(s===undefined) return;
  const prevList = Array.isArray(OVERRIDES.tiendas) ? OVERRIDES.tiendas.slice() : undefined;
  OVERRIDES.tiendas = list.filter((_, j)=> j!==i); await persistOverrides();
  const n = storeUseCounts()[storeKey(s)] || 0, left = OVERRIDES.tiendas.length;
  storesRefresh(left ? `[data-fk="st-rm-${Math.min(i, left - 1)}"]` : null);
  showToast(t('stores.removed').replace('{s}', s) + (n ? ' ' + t('stores.removed_note') : ''), { replace:true, action:{ label:t('common.undo'), fn: async ()=>{
    if(prevList===undefined) delete OVERRIDES.tiendas; else OVERRIDES.tiendas = prevList;
    await persistOverrides(); storesAfterUndo(`[data-fk="st-rm-${i}"]`); } } });
}
/* Tras «Deshacer»: se ve el cambio esté donde esté (Mis sitios, Valorar en serie o la ficha) */
function storesAfterUndo(focusSel){
  storeDatalistsRefresh();
  if(isSheetKind('stores')) storesRefresh(focusSel); else if(isSheetKind('val-bulk')) vbRefresh(); else render();
}
