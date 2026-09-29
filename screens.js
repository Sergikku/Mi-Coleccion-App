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
  const missing = platformsWithMostMissing(4);
  const unconfirmed = PRODUCTS.filter(p=>p.existence!=='confirmado').length;
  const counts = platformCountsMap();
  const n = (v)=> v.toLocaleString(numLocale());
  let html = head;
  html += searchbarHTML({ id:'dash-search', placeholder:t('dash.search'), oninput:'handleDashboardSearch(this.value)' });
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
      <div class="hero-stat is-quiet" title="${escapeHTML(g.valued ? (g.lastUpdate ? t('dash.value.updated').replace('{d}', g.lastUpdate) : '') : t('dash.value.novalue'))}"><span class="hs-label">${t('dash.value')}</span><span class="hs-value">${g.valued ? fmtMoney(g.valor) : '—'}</span></div>
    </div>
    ${distributionHTML(cats)}
  </section>`;
  // 2. Recién añadidas: tus últimas piezas, como fichas de catálogo
  const recent = recentProducts(12);
  if(recent.length){
    registerListContext(recent.map(p=>p.id), t('dash.recent'));
    html += `<section class="vit-section">${sectionTitleHTML(t('dash.recent'), `<button type="button" class="link-btn" onclick="goPage('gallery')">${t('dash.gallery_link')}</button>`)}<div class="h-scroll">${recent.map(miniCoverHTML).join('')}</div></section>`;
  }
  // 3. Estanterías · 4. Huecos por llenar
  html += `<div class="dash-columns"><section class="vit-section">` + sectionTitleHTML(t('dash.categories'), fmtCount(cats.length, 'count.category_one', 'count.category_many'));
  html += `<div class="shelf-list">${cats.map(c=>shelfCardHTML(c, counts, false)).join('')}</div>`;
  html += `</section><section class="vit-section">` + sectionTitleHTML(t('dash.gaps'));
  html += missing.length ? `<div class="gap-grid">${missing.map(gapBlockHTML).join('')}</div>`
                         : `<p class="section-sub">${g.total ? t('dash.nothing_missing') : t('dash.no_items_yet')}</p>`;
  html += `</section></div>`;
  // 5. La colección en el tiempo (información secundaria)
  const years = yearChartHTML(allEditionsForStats().map(x=>x.product));
  if(years) html += `<section class="vit-section is-secondary">${sectionTitleHTML(t('dash.timeline'), t('dash.timeline.sub'))}${years}</section>`;
  if(unconfirmed){
    html += `<div class="note note-info dash-note">${t('dash.unconfirmed').replace('{n}', unconfirmed)}
      <div class="note-actions"><button class="btn btn-sm" onclick="goPage('investigacion')">${icon('research')} ${t('nav.investigacion')}</button></div></div>`;
  }
  html += `<div class="quiet-links">
    <button class="btn btn-sm btn-ghost" onclick="goPage('gallery')">${icon('camera')} ${t('dash.gallery_link')}</button>
    <button class="btn btn-sm btn-ghost" onclick="goPage('backup')">${icon('archive')} ${t('dash.backup_link')}</button>
    <button class="btn btn-sm btn-ghost" onclick="goPage('ayuda')">${icon('help')} ${t('nav.ayuda')}</button>
  </div>`;
  return html;
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
  </select>`;
}
function productListBlockHTML(allProds, ctxKey, ctxLabel){
  if(collState.key !== ctxKey){ collState = { key:ctxKey, filter:'all', limit:60 }; }
  const cnt = { all:allProds.length, have:0, missing:0, sealed:0 };
  allProds.forEach(p=>{ if(p.possession==='tengo'){ cnt.have++; if(p.sealed) cnt.sealed++; } else cnt.missing++; });
  const f = collState.filter;
  const filtered = allProds.filter(p=> f==='have' ? p.possession==='tengo' : f==='missing' ? p.possession!=='tengo' : f==='sealed' ? (p.possession==='tengo' && p.sealed) : true);
  const sorted = sortProductsByMode(filtered);
  const vw = uiPref('collView', 'grid');
  registerListContext(sorted.map(p=>p.id), ctxLabel);
  const chipF = (val, label, n)=> `<button type="button" class="chip ${f===val?'active':''}" aria-pressed="${f===val}" onclick="setCollFilter('${val}')">${label} <span class="chip-count">${n}</span></button>`;
  let html = `<div class="chip-scroll" role="group" aria-label="${t('filter.quick')}">
      ${chipF('all', t('inv.chip.all'), cnt.all)}${chipF('have', t('inv.chip.have'), cnt.have)}${chipF('missing', t('inv.chip.missing'), cnt.missing)}${cnt.sealed ? chipF('sealed', t('inv.chip.sealed'), cnt.sealed) : ''}
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
  const meta = o.meta.filter(Boolean).concat(st.total ? [`${n(st.have)} / ${n(st.total)} ${t('dash.pieces_word')}`, missTxt] : []).join(' · ');
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
  [['p.language', p.language], ['p.catalog_num', p.catalogNumber], ['p.product_code', p.productCode], ['p.barcode', p.barcode], ['p.exact_date', p.releaseDateExact]]
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
  // Qué incluye (checklist en fichas táctiles; mismas casillas de siempre)
  html += `<section class="detail-section">${sectionTitleHTML(t('p.includes'), `<button type="button" class="btn btn-sm" onclick="markComplete('${p.id}')">${icon('checkCircle')} ${plainLabel(t('p.mark_complete'))}</button>`)}
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
  identBody += editableField('text', t('p.language'), p.language, `updateEditionField('${p.id}','language',this.value)`);
  identBody += editableField('text', t('p.catalog_num'), p.catalogNumber, `updateEditionField('${p.id}','catalogNumber',this.value)`);
  identBody += editableField('text', t('p.product_code'), p.productCode, `updateEditionField('${p.id}','productCode',this.value)`);
  identBody += editableField('text', t('p.barcode'), p.barcode, `updateEditionField('${p.id}','barcode',this.value)`, '', 'inputmode="numeric"');
  identBody += editableField('text', t('p.exact_date'), p.releaseDateExact, `updateEditionField('${p.id}','releaseDateExact',this.value)`, t('p.date_ph'));
  identBody += `</div>`;
  if((p.tags||[]).length) identBody += `<div class="field-label">${t('p.tags')}</div><div class="badge-row tag-row">${p.tags.map(tg=>`<span class="vtag">${escapeHTML(tg)}</span>`).join('')}</div>`;
  // resumen a la derecha de cada sección, como en una ficha de archivo
  const nIdent = [p.year, p.language, p.catalogNumber, p.productCode, p.barcode, p.releaseDateExact].filter(Boolean).length + ((p.tags||[]).length ? 1 : 0);
  let sections = disclosureHTML('identificacion', t('p.identification'), identBody, productSectionsOpen, nIdent ? fmtCount(nIdent, 'p.data_one', 'p.data_many') : '');

  let consBody = `<div class="field-grid">${conservationSelect(t('p.condition_general'), p.conservation.general, `updateConservation('${p.id}','general',this.value)`)}</div>`
    + editableTextarea(t('p.condition_notes'), p.conservation.notas, `updateConservation('${p.id}','notas',this.value)`);
  sections += disclosureHTML('conservacion', t('p.conservation'), consBody, productSectionsOpen, p.conservation.general ? p.conservation.general + '/10' : '');

  let valBody = `<div class="field-grid">
    ${numberField(t('p.value_bought')+' ('+currencySymbol()+')', p.valuation.valorAdquisicion, `updateValuation('${p.id}','valorAdquisicion',this.value)`)}
    ${numberField(t('p.value_now')+' ('+currencySymbol()+')', p.valuation.valorActual, `updateValuation('${p.id}','valorActual',this.value)`)}
  </div>${p.valuation.fechaActualizacion ? `<div class="section-sub">${t('p.last_updated')}: ${escapeHTML(p.valuation.fechaActualizacion)}</div>` : ``}`;
  sections += disclosureHTML('valoracion', t('p.valuation'), valBody, productSectionsOpen, typeof p.valuation.valorActual==='number' ? fmtMoney(p.valuation.valorActual) : '');

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
    <button type="button" class="slot-thumb" onclick="showPhotoSide('${p.id}','${side}')" aria-label="${escapeHTML(t(side==='back' ? 'photo.show_back' : 'photo.show_front'))}">${photoImgHTML(p, side, 'thumb', 'data-eager="1"')}</button>
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
  if(st.filter==='sellado') list = list.filter(p=>p.sealed);
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
  const eds = inventoryFilteredEditions();
  const total = eds.length;
  const shown = eds.slice(0, invState.limit);
  const vw = uiPref('invView', 'list');
  registerListContext(eds.map(x=>x.product.id), t('inv.title'));
  // v11.2: el número de resultados y, a su derecha, cómo verlos (lista, portadas, muro)
  let html = `<div class="toolbar results-bar"><span class="result-count" role="status">${fmtCount(total,'count.result_one','count.result_many')}</span>
    <div class="toolbar-right">${invState.filter==='falta' && total>0 ? `<button class="btn btn-sm" onclick="printMissingList()">${icon('printer')} ${t('inv.print_missing')}</button>` : ''}${viewToggleHTML(vw, "setInvView('{v}')", true)}</div></div>`;
  if(!total){
    const anyFilter = invState.search || invState.filter!=='todos' || advancedFilterCount();
    return html + emptyStateHTML({ icon:'search', title: anyFilter ? t('filter.no_results') : t('inv.empty.title'), text: anyFilter ? t('filter.no_results_text') : t('inv.empty'),
      actions: anyFilter ? `<button class="btn" onclick="clearInvFilters(true)">${t('filter.clear_all')}</button>`
             : (getAllCategories().length ? `<button class="btn primary" onclick="openQuickAdd()">${icon('plus')} ${t('fab.add_product')}</button>` : '') });
  }
  if(vw==='wall') return html + wallHTML(eds, total);
  html += vw==='grid'
    ? `<div class="title-grid">${shown.map(x=>productCardHTML(x.product)).join('')}</div>`
    : `<div class="item-list">${shown.map(x=>productRowHTML(x.product, { showId:true })).join('')}</div>`;
  if(total > invState.limit){
    html += `<button class="btn load-more" onclick="invState.limit+=60; render();">${t('inv.load_more').replace('{n}', total - invState.limit)}</button>`;
  }
  return html;
}
/* v11.1: vista "Muro" — solo las fotos, agrupadas por año (o por plataforma
   si ordenas por plataforma). Tocar una pieza abre su ficha. */
function wallTileHTML(p){
  const pv = platVisual(p.platformId);
  const has = hasPhoto(p.id,'front');
  const label = [p.name, p.platformName, p.year, regionShortText(p)].filter(Boolean).join(' · ') + (p.possession!=='tengo' ? ' — ' + t('cover.missing') : '');
  return `<button type="button" class="wall-tile ${coverStateClass(p)}" style="--plat:${pv.color}" onclick="goProduct('${p.id}')" aria-label="${escapeHTML(label)}" title="${escapeHTML(label)}">
    ${has ? photoImgHTML(p,'front','thumb') : `<span class="wall-code">${escapeHTML(pv.code)}</span>`}
    ${p.possession==='tengo' && p.sealed ? `<span class="cover-seal">${icon('shield')}</span>` : ''}
  </button>`;
}
function wallHTML(eds, total){
  const lim = Math.max(invState.limit, 120);
  const shown = eds.slice(0, lim).map(x=>x.product);
  const groupKey = invState.sort==='anio' ? (p=>{ const y = parseInt(p.year,10); return isNaN(y) ? '—' : String(y); })
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
  html += searchbarHTML({ placeholder:t('inv.search.ph'), value:invState.search, oninput:'invSearch(this.value)' });
  html += `<div class="chip-scroll" role="group" aria-label="${t('filter.quick')}">
    ${chip(t('inv.chip.all'),'todos')}${chip(t('inv.chip.have'),'tengo')}${chip(t('inv.chip.missing'),'falta')}${chip(t('inv.chip.unconfirmed'),'sinconfirmar')}${chip(t('inv.chip.sealed'),'sellado')}
  </div>`;
  html += `<div class="toolbar inv-toolbar">
    <button type="button" class="btn btn-sm filter-btn" onclick="openFilterSheet()" aria-haspopup="dialog">${icon('filter')} ${t('filter.title')}${nAdv ? ` <span class="count-dot">${nAdv}</span>` : ''}</button>
    <div class="toolbar-right">
      <label class="sr-only" for="invSortSel">${t('sort.label')}</label>
      <select id="invSortSel" class="select-compact" onchange="invSort(this.value)">
        <option value="anio" ${invState.sort==='anio'?'selected':''}>${t('inv.sort.year')}</option>
        <option value="nombre" ${invState.sort==='nombre'?'selected':''}>${t('inv.sort.name')}</option>
        <option value="plataforma" ${invState.sort==='plataforma'?'selected':''}>${t('inv.sort.platform')}</option>
      </select>
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
      body += `<li><span class="box"></span> ${escapeHTML(x.product.name)}${x.product.platformName?' — '+escapeHTML(x.product.platformName):''}${x.edition.year?' ('+escapeHTML(x.edition.year)+')':''}</li>`;
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
function renderGallery(){
  const withPhoto = sortGames(PRODUCTS.filter(p=>hasPhoto(p.id,'front')));
  let html = screenHeadHTML({ kicker:t('gallery.kicker'), title:t('gallery.title'), sub: withPhoto.length ? fmtCount(withPhoto.length,'count.photo_one','count.photo_many') : '' });
  if(withPhoto.length===0){
    return html + emptyStateHTML({ icon:'camera', title:t('gallery.empty'), text:t('gallery.empty.sub') });
  }
  registerListContext(withPhoto.map(p=>p.id), t('gallery.title'));
  const shown = withPhoto.slice(0, galleryLimit);
  html += `<div class="gallery-grid">`;
  shown.forEach(p=>{
    html += `<button type="button" class="gallery-cell" onclick="goProduct('${p.id}')" aria-label="${escapeHTML(p.name)}">${photoImgHTML(p,'front','thumb')}</button>`;
  });
  html += `</div>`;
  if(withPhoto.length > galleryLimit){
    html += `<button class="btn load-more" onclick="galleryLimit+=60; render();">${t('inv.load_more').replace('{n}', withPhoto.length - galleryLimit)}</button>`;
  }
  return html;
}
function renderAyuda(){
  const topics = [
    ['organizar','layers', 'ayuda.organize'], ['anadir','plusCircle', 'ayuda.add'], ['buscar','search','ayuda.search'],
    ['mover','shuffle', 'ayuda.move'], ['renombrar','pencil', 'ayuda.rename'], ['completo','checkCircle', 'ayuda.complete'],
    ['fotos','camera', 'ayuda.photos'], ['orden','sortIcon', 'ayuda.order'], ['excluir','toggleIcon', 'ayuda.exclude'],
    ['backup','archive', 'ayuda.backup'], ['idioma','globe', 'ayuda.language'],
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
      <label class="btn btn-sm photo-picker">${icon('upload')} ${plainLabel(t('backup.import_json'))}<input type="file" accept="application/json" class="sr-only" onchange="importJSON(this)"></label>
    </div>
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
  return `<div class="note note-warn" id="backup-reminder" role="status">${escapeHTML(msg)}<div class="note-actions"><button class="btn btn-sm" onclick="goPage('backup')">${icon('archive')} ${t('backup.reminder.cta')}</button></div></div>`;
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
