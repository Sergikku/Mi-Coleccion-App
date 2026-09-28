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
  const head = screenHeadHTML({ kicker:t('dash.kicker'), title:dashTitle(), edit:'updateDashboardTitle(this.value)', editLabel:t('dash.edit_title') });
  if(!PRODUCTS.length && !cats.length){
    return head + emptyStateHTML({ icon:'layers', title:t('dash.empty.title'), text:t('dash.empty.text'),
      actions:`<button class="btn primary" onclick="goPage('coleccion')">${icon('plus')} ${t('common.create_category')}</button>
               <button class="btn" onclick="goPage('backup')">${icon('archive')} ${t('backup.import')}</button>` });
  }
  const missing = platformsWithMostMissing(5);
  const unconfirmed = PRODUCTS.filter(p=>p.existence!=='confirmado').length;
  let html = head;
  html += searchbarHTML({ id:'dash-search', placeholder:t('dash.search'), oninput:'handleDashboardSearch(this.value)' });
  html += `<div id="dash-search-results" aria-live="polite"></div>`;
  html += backupReminderHTML();
  html += `<section class="dash-hero" aria-label="${t('dash.summary')}">
    <div>
      <div class="ring ring-hero" data-pct="${g.pct}" role="img" aria-label="${t('dash.ring_label').replace('{pct}', g.pct).replace('{have}', g.have).replace('{total}', g.total)}"><div class="ring-hole"><div class="ring-hero-pct">${g.pct}%</div></div></div>
      <div class="ring-hero-sub">${t('dash.have_of_total').replace('{have}', g.have.toLocaleString(numLocale())).replace('{total}', g.total.toLocaleString(numLocale()))}</div>
    </div>
    <div class="metric-grid">
      <button type="button" class="metric" onclick="goInventory('tengo')"><div class="metric-label">${t('dash.have')}</div><div class="metric-value">${g.have.toLocaleString(numLocale())}</div><div class="metric-sub">${t('dash.of_collection').replace('{pct}', g.pct)}</div></button>
      <button type="button" class="metric is-accent" onclick="goInventory('falta')"><div class="metric-label">${t('dash.pending')}</div><div class="metric-value">${g.pending.toLocaleString(numLocale())}</div><div class="metric-sub">${t('dash.pending.sub')}</div></button>
      <button type="button" class="metric" onclick="goInventory('sellado')"><div class="metric-label">${t('dash.sealed')}</div><div class="metric-value">${g.sealed.toLocaleString(numLocale())}</div><div class="metric-sub">${t('dash.sealed.sub')}</div></button>
      <div class="metric"><div class="metric-label">${t('dash.value')}</div><div class="metric-value">${g.valued ? fmtMoney(g.valor) : '—'}</div><div class="metric-sub">${g.valued ? (g.lastUpdate ? t('dash.value.updated').replace('{d}', g.lastUpdate) : '') : t('dash.value.novalue')}</div></div>
    </div>
  </section>`;
  html += `<div class="dash-columns"><section>` + sectionTitleHTML(t('dash.progress'), fmtCount(cats.length, 'count.category_one', 'count.category_many'));
  cats.forEach(c=>{
    html += `<button type="button" class="prow" onclick="goCategory('${c.id}')">
      <div class="prow-top"><span class="prow-name">${escapeHTML(c.name)}</span><span class="prow-pct">${c.total ? `${c.have}/${c.total} <span class="muted">· ${c.pct}%</span>` : '—'}</span></div>
      <div class="microbar" aria-hidden="true"><div class="microbar-fill" style="width:${c.pct}%;"></div></div>
    </button>`;
  });
  html += `</section><section>` + sectionTitleHTML(t('dash.most_missing'));
  if(missing.length){
    missing.forEach(m=>{
      html += `<button type="button" class="miss-row" onclick="goPlatform('${m.categoryId}','${m.id}')">
        <span class="miss-name">${escapeHTML(m.name)}<span class="muted">${escapeHTML(m.categoryName)} · ${m.have}/${m.total}</span></span>
        <span class="miss-count">${t('dash.missing_n').replace('{n}', m.missing)}</span>
        ${icon('chevronRight')}
      </button>`;
    });
  } else {
    html += `<p class="section-sub">${g.total ? t('dash.nothing_missing') : t('dash.no_items_yet')}</p>`;
  }
  html += `</section></div>`;
  if(unconfirmed){
    html += `<div class="note note-info" style="margin-top:24px;">${t('dash.unconfirmed').replace('{n}', unconfirmed)}
      <div class="note-actions"><button class="btn btn-sm" onclick="goPage('investigacion')">${icon('research')} ${t('nav.investigacion')}</button></div></div>`;
  }
  html += `<div class="quick-actions" style="margin-top:24px;">
    <button class="btn btn-sm" onclick="goPage('gallery')">${icon('camera')} ${t('dash.gallery_link')}</button>
    <button class="btn btn-sm" onclick="goPage('backup')">${icon('archive')} ${t('dash.backup_link')}</button>
    <button class="btn btn-sm" onclick="goPage('ayuda')">${icon('help')} ${t('nav.ayuda')}</button>
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
  let html = screenHeadHTML({ kicker:t('nav.coleccion'), title:t('coll.categories'),
    sub: cats.length ? `${fmtCount(cats.length,'count.category_one','count.category_many')} · ${t('dash.have_of_total').replace('{have}',tot.have).replace('{total}',tot.total)}` : '' });
  if(!cats.length){
    html += emptyStateHTML({ icon:'layers', title:t('coll.empty.title'), text:t('coll.empty.text') });
  }
  cats.forEach(c=>{
    html += `<button type="button" class="prow" onclick="goCategory('${c.id}')">
      <div class="prow-top"><span class="prow-name">${escapeHTML(c.name)}</span><span class="prow-pct">${c.total ? `${c.have}/${c.total} <span class="muted">· ${c.pct}%</span>` : '—'}</span></div>
      <div class="microbar" aria-hidden="true"><div class="microbar-fill" style="width:${c.pct}%;"></div></div>
      <div class="prow-desc">${categoryAutoDesc(c.id)}</div>
    </button>`;
  });
  html += `<button type="button" class="create-btn" id="tour-add-category" onclick="addCategory()">
    <span class="create-btn-icon">${icon('plus')}</span>
    <span><span class="create-btn-label">${t('common.create_category')}</span><span class="create-btn-sub">${t('common.create_category.sub')}</span></span>
  </button>`;
  return html;
}

function platMetaLine(p, count){
  const bits = [];
  if(p.year && p.year!=='—') bits.push(escapeHTML(p.year));
  if(p.maker) bits.push(escapeHTML(p.maker));
  bits.push(fmtCount(count, 'count.item_one', 'count.item_many'));
  return bits.join(' · ');
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
  plats.forEach((p,i)=>{
    const st = counts.get(p.id) || EMPTY_COUNTS;
    const canMove = !platformHasYear(p);
    const excluded = !platformCountsInCollection(p.id);
    html += `<div class="plat-card">
      <button type="button" class="plat-card-link" onclick="goPlatform('${catId}','${p.id}')">
        <div class="plat-badge ${badgeColorFor(p.id)}" aria-hidden="true">${escapeHTML((p.code||p.name||'').toString().slice(0,4))}</div>
        <div class="plat-card-body">
          <div class="plat-name-lg">${escapeHTML(p.name)}</div>
          <div class="plat-meta">${platMetaLine(p, st.total)}${excluded ? ' · ' + t('plat.excluded_short') : ''}</div>
          <div class="plat-card-bottom"><div class="microbar" aria-hidden="true"><div class="microbar-fill" style="width:${st.pct}%;"></div></div><span class="plat-pct-lg">${st.total ? st.pct+'%' : '—'}</span></div>
        </div>
      </button>
      ${canMove ? `<div class="plat-move">
        <button type="button" aria-label="${t('plat.move_up').replace('{name}', escapeHTML(p.name))}" onclick="movePlatform('${catId}','${p.id}',-1)" ${i===0?'disabled':''}>${icon('chevronUp')}</button>
        <button type="button" aria-label="${t('plat.move_down').replace('{name}', escapeHTML(p.name))}" onclick="movePlatform('${catId}','${p.id}',1)" ${i===plats.length-1?'disabled':''}>${icon('chevronDown')}</button>
      </div>` : ``}
    </div>`;
  });
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
  let html = `<div class="toolbar">
      <span class="result-count" aria-live="polite">${sorted.length===allProds.length ? fmtCount(allProds.length,'count.item_one','count.item_many') : t('count.filtered').replace('{n}',sorted.length).replace('{total}',allProds.length)}</span>
      <div class="toolbar-right">${sortSelectorHTML()}${viewToggleHTML(vw, "setCollView('{v}')")}</div>
    </div>
    <div class="chip-scroll" role="group" aria-label="${t('filter.quick')}">
      ${chipF('all', t('inv.chip.all'), cnt.all)}${chipF('have', t('inv.chip.have'), cnt.have)}${chipF('missing', t('inv.chip.missing'), cnt.missing)}${cnt.sealed ? chipF('sealed', t('inv.chip.sealed'), cnt.sealed) : ''}
    </div>`;
  if(!sorted.length){
    return html + emptyStateHTML({ icon:'filter', title:t('filter.no_results'), actions:`<button class="btn" onclick="setCollFilter('all')">${t('filter.show_all')}</button>` });
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
  return `<div class="plat-card">
    <button type="button" class="plat-card-link" onclick="goFolder('${catId}','${platId}','${f.id}')">
      <div class="plat-badge navy" aria-hidden="true">${icon('folder')}</div>
      <div class="plat-card-body">
        <div class="plat-name-lg">${escapeHTML(f.name)}</div>
        <div class="plat-meta">${fmtCount(st.total,'count.item_one','count.item_many')}</div>
        <div class="plat-card-bottom"><div class="microbar" aria-hidden="true"><div class="microbar-fill" style="width:${st.pct}%;"></div></div><span class="plat-pct-lg">${st.total ? st.pct+'%' : '—'}</span></div>
      </div>
    </button>
  </div>`;
}
async function renderPlatformProducts(catId, platId){
  const plat = getAllPlatforms().find(p=>p.id===platId);
  if(!plat){ view = { page:'coleccion', categoryId:catId }; return renderCategoryPlatforms(catId); }
  const allProds = PRODUCTS.filter(p=>p.platformId===platId);
  const loose = allProds.filter(p=>!p.folderId);
  const folders = foldersForPlatform(platId);
  const fcounts = folderCountsMap();
  const st = platformCountsMap().get(platId) || EMPTY_COUNTS;
  const kickerBits = [plat.year && plat.year!=='—' ? escapeHTML(plat.year) : '', escapeHTML(plat.maker||'')].filter(Boolean).join(' · ') || t('plat.kicker');
  let html = screenHeadHTML({ kicker:kickerBits, title:plat.name, edit:`renamePlatform('${platId}',this.value)`, editLabel:t('plat.rename'),
    sub: st.total ? `${t('dash.have_of_total').replace('{have}',st.have).replace('{total}',st.total)} · ${st.pct}%` : '' });
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
    <div class="note ${counts ? 'note-info' : 'note-warn'}" style="margin-bottom:12px;">${counts ? t('plat.counts_yes_long') : t('plat.counts_no_long')}
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
  let html = screenHeadHTML({ kicker:`${escapeHTML(plat.name)} · ${t('folder.kicker')}`, title:folder.name, edit:`renameFolder('${platId}','${folderId}',this.value)`, editLabel:t('folder.rename'),
    sub: st.total ? `${t('dash.have_of_total').replace('{have}',st.have).replace('{total}',st.total)} · ${st.pct}%` : '' });
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
async function setProductTab(tab){ view.productTab = tab; render(); }
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
async function renderProductDetail(prodId){
  const p = PRODUCTS_BY_ID[prodId];
  const tab = view.productTab || 'ficha';
  const kicker = [p.platformName, p.year, (p.regionTags||[]).map(c=>REGION_CODES[c]||c).join('/')].filter(Boolean).map(escapeHTML).join(' · ');
  const anyPhoto = hasPhoto(p.id,'front') || hasPhoto(p.id,'back');
  let html = pagerHTML(p);
  html += `<div class="product-layout"><aside class="product-aside">
    <div class="product-photo ${anyPhoto ? '' : 'is-empty'}">${flipViewHTML(p, { size:'full', hint: anyPhoto })}</div>
    <div class="photo-actions">
      ${anyPhoto ? `<button type="button" class="btn btn-sm" onclick="openPhotoViewer('${p.id}')">${icon('expand')} ${t('photo.enlarge')}</button>` : ''}
      <button type="button" class="btn btn-sm" onclick="setProductTab('fotos')">${icon('camera')} ${anyPhoto ? t('photo.change') : t('photo.add')}</button>
    </div>
  </aside><div class="product-main">`;
  html += screenHeadHTML({ kicker: kicker || t('p.kicker'), title:p.name, edit:`updateProductField('${p.id}','name',this.value)`, editLabel:t('p.edit_name') });
  html += `<div class="product-status">
    ${possessButtonHTML(p, 'possess-main')}
    <div class="status-chips">${completoBadgeHTML(p)}<span class="badge-row" style="margin:0;">${productBadgesHTML(p, { noRegion:true })}</span></div>
  </div>`;
  html += `<div class="subtabs">${segmentedHTML([['ficha', t('p.tab.ficha'), ''], ['fotos', t('p.tab.fotos'), 'camera']], tab, "setProductTab('{v}')", t('p.tabs'))}</div>`;
  if(tab==='fotos'){
    html += renderPhotoEditor(p) + `</div></div>`;
    return html;
  }
  // Checklist
  html += `<section class="detail-section">${sectionTitleHTML(t('p.checklist'), `<button type="button" class="btn btn-sm" onclick="markComplete('${p.id}')">${icon('checkCircle')} ${plainLabel(t('p.mark_complete'))}</button>`)}
    ${checklistProgressHTML(p)}
    <div class="checklist">
      ${checklistForCategory(p.categoryId).map(item=> checkItem(escapeHTML(item.label), p.components[item.key], `updateComponent('${p.id}','${item.key}',this.checked)`, false, `chk_${p.id}_${item.key}`)).join('')}
      ${checkItem(t('p.sealed'), p.sealed, `updateEditionField('${p.id}','sealed',this.checked)`, true, `chk_${p.id}_sealed`)}
    </div></section>`;
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
  if((p.tags||[]).length) identBody += `<div class="field-label">${t('p.tags')}</div><div class="badge-row" style="margin-bottom:10px;">${p.tags.map(tg=>`<span class="vtag">${escapeHTML(tg)}</span>`).join('')}</div>`;
  let sections = disclosureHTML('identificacion', t('p.identification'), identBody, productSectionsOpen, [p.catalogNumber, p.productCode].filter(Boolean).map(escapeHTML).join(' · '));

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

  const cfBody = customFieldsHTML(p) + `<div class="quick-actions" style="margin-top:0;"><button class="btn btn-sm" onclick="addCustomField('${p.id}')">${icon('plus')} ${plainLabel(t('p.add_custom_field'))}</button></div>`;
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

function renderPhotoEditor(p){
  return `<p class="section-sub">${t('photo.editor_intro')}</p>`
    + photoEditRow(p, 'front', t('photo.front'), 'photo_'+p.id+'_front')
    + photoEditRow(p, 'back', t('photo.back'), 'photo_'+p.id+'_back');
}
function photoEditRow(p, side, label, key){
  const has = hasPhoto(p.id, side);
  return `<div class="photoedit-row">
    <div class="photoedit-thumb">${has ? photoImgHTML(p, side, 'thumb') : `<span class="flip-placeholder">${icon('image')}${t('photo.none')}</span>`}</div>
    <div class="photoedit-controls">
      <div class="photoedit-label">${label}</div>
      <div class="photoedit-btnrow">
        <label class="btn btn-sm" style="cursor:pointer;">${icon('camera')} ${has ? t('photo.replace') : t('photo.upload')}<input type="file" accept="image/*" class="sr-only" onchange="onPhotoSlotChange(this,'${key}')"></label>
        ${has ? `<button class="btn btn-sm btn-danger" onclick="removePhotoSlot('${photoKeyFor(p.id, side) || key}')">${icon('trash')} ${t('photo.remove')}</button>` : ``}
      </div>
    </div>
  </div>`;
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
  let html = `<div class="toolbar" style="margin-bottom:8px;"><span class="result-count" role="status">${fmtCount(total,'count.result_one','count.result_many')}</span>
    ${invState.filter==='falta' && total>0 ? `<button class="btn btn-sm" onclick="printMissingList()">${icon('printer')} ${t('inv.print_missing')}</button>` : ''}</div>`;
  if(!total){
    const anyFilter = invState.search || invState.filter!=='todos' || advancedFilterCount();
    return html + emptyStateHTML({ icon:'search', title:t('filter.no_results'), text: anyFilter ? t('filter.no_results_text') : t('inv.empty'),
      actions: anyFilter ? `<button class="btn" onclick="clearInvFilters(true)">${t('filter.clear_all')}</button>` : '' });
  }
  html += vw==='grid'
    ? `<div class="title-grid">${shown.map(x=>productCardHTML(x.product)).join('')}</div>`
    : `<div class="item-list">${shown.map(x=>productRowHTML(x.product, { showId:true })).join('')}</div>`;
  if(total > invState.limit){
    html += `<button class="btn load-more" onclick="invState.limit+=60; render();">${t('inv.load_more').replace('{n}', total - invState.limit)}</button>`;
  }
  return html;
}
function renderInventario(){
  const nAdv = advancedFilterCount();
  let html = screenHeadHTML({ kicker:t('inv.kicker'), title:t('inv.title') });
  html += searchbarHTML({ placeholder:t('inv.search.ph'), value:invState.search, oninput:'invSearch(this.value)' });
  html += `<div class="chip-scroll" role="group" aria-label="${t('filter.quick')}">
    ${chip(t('inv.chip.all'),'todos')}${chip(t('inv.chip.have'),'tengo')}${chip(t('inv.chip.missing'),'falta')}${chip(t('inv.chip.unconfirmed'),'sinconfirmar')}${chip(t('inv.chip.sealed'),'sellado')}
  </div>`;
  html += `<div class="toolbar">
    <button type="button" class="btn btn-sm filter-btn" onclick="openFilterSheet()" aria-haspopup="dialog">${icon('filter')} ${t('filter.title')}${nAdv ? ` <span class="count-dot">${nAdv}</span>` : ''}</button>
    <div class="toolbar-right">
      <label class="sr-only" for="invSortSel">${t('sort.label')}</label>
      <select id="invSortSel" class="select-compact" onchange="invSort(this.value)">
        <option value="anio" ${invState.sort==='anio'?'selected':''}>${t('inv.sort.year')}</option>
        <option value="nombre" ${invState.sort==='nombre'?'selected':''}>${t('inv.sort.name')}</option>
        <option value="plataforma" ${invState.sort==='plataforma'?'selected':''}>${t('inv.sort.platform')}</option>
      </select>
      ${viewToggleHTML(uiPref('invView','list'), "setInvView('{v}')")}
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
  const plats = getAllPlatforms().filter(p=>!invState.cat || p.categoryId===invState.cat);
  const opt = (v,l,cur)=>`<option value="${escapeHTML(v)}" ${v===cur?'selected':''}>${escapeHTML(l)}</option>`;
  const chipSel = (key, val, label)=> `<button type="button" class="chip ${invState[key]===val?'active':''}" aria-pressed="${invState[key]===val}" onclick="invSetFilter('${key}','${val}')">${label}</button>`;
  return `<div class="sheet-group field"><label class="field-label" for="fltCat">${t('filter.category')}</label>
      <select id="fltCat" onchange="invSetFilter('cat', this.value)">${opt('',t('filter.all'),invState.cat)}${cats.map(c=>opt(c.id,c.name,invState.cat)).join('')}</select></div>
    <div class="sheet-group field"><label class="field-label" for="fltPlat">${t('filter.platform')}</label>
      <select id="fltPlat" onchange="invSetFilter('plat', this.value)">${opt('',t('filter.all'),invState.plat)}${plats.map(p=>opt(p.id,p.name,invState.plat)).join('')}</select></div>
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
  html += `<div class="metric-grid" style="margin-bottom:20px;">
    <div class="metric"><div class="metric-label">${t('stats.total')}</div><div class="metric-value">${g.total.toLocaleString(numLocale())}</div></div>
    <div class="metric"><div class="metric-label">${t('dash.have')}</div><div class="metric-value">${g.have.toLocaleString(numLocale())}</div><div class="metric-sub">${g.pct}%</div></div>
    <div class="metric"><div class="metric-label">${t('dash.pending')}</div><div class="metric-value">${g.pending.toLocaleString(numLocale())}</div></div>
    <div class="metric"><div class="metric-label">${t('dash.sealed')}</div><div class="metric-value">${g.sealed.toLocaleString(numLocale())}</div></div>
  </div>`;
  html += barRowHTML(t('stats.global'), g.have, g.total, g.pct, true);
  html += `<div style="margin-top:16px;">`;
  html += disclosureHTML('categoria', t('stats.by_category'), cats.map(c=>barRowHTML(c.name, c.have, c.total, c.pct)).join(''), statsOpen, String(cats.length));
  html += disclosureHTML('plataforma', t('stats.by_platform'), plats.map(p=>barRowHTML(p.name, p.have, p.total, p.pct)).join(''), statsOpen, String(plats.length));
  html += disclosureHTML('region', t('stats.by_region'), regs.map(r=>barRowHTML(r.name, r.have, r.total, r.pct)).join(''), statsOpen, String(regs.length));
  html += `</div><p class="section-sub" style="margin-top:12px;">${t('stats.note')}</p>`;
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
    html += `<div class="inv-item obj-item" onclick="goProduct('${p.id}')" role="link" tabindex="0" onkeydown="if(event.key==='Enter'){goProduct('${p.id}')}" style="grid-template-columns:minmax(0,1fr) auto;">
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
  ${APP_META.undoImportAt ? `<div class="quick-actions" style="margin:0 0 12px;"><button class="btn" id="undoImportBtn" onclick="undoLastImport()">${icon('undo')} ${t('import.undo')} (${escapeHTML(APP_META.undoImportAt.slice(0,10))})</button></div>` : ``}`;
  const adv = `<p class="section-sub">${t('backup.advanced.intro')}</p>
    <div class="quick-actions">
      <button class="btn btn-sm" onclick="exportJSON()">${icon('download')} ${plainLabel(t('backup.export_json'))}</button>
      <button class="btn btn-sm" onclick="exportCSV()">${icon('download')} ${plainLabel(t('backup.export_csv'))}</button>
      <label class="btn btn-sm" style="cursor:pointer;">${icon('upload')} ${plainLabel(t('backup.import_json'))}<input type="file" accept="application/json" class="sr-only" onchange="importJSON(this)"></label>
    </div>
    <div class="quick-actions">
      <button class="btn btn-sm" onclick="exportAllPhotosZip()">${icon('download')} ${t('backup.export_photos')}</button>
      <label class="btn btn-sm" style="cursor:pointer;">${icon('upload')} ${t('backup.import_photos')}<input type="file" accept=".zip" class="sr-only" onchange="importPhotosZip(this)"></label>
    </div>
    <div class="status-line" id="photo-export-status" role="status" aria-live="polite">${escapeHTML(backupStatusMsg.photos)}</div>
    <div class="quick-actions"><button class="btn btn-sm btn-ghost" onclick="regenerateThumbs()">${icon('image')} ${t('backup.regen_thumbs')}</button></div>`;
  html += `<div style="margin-top:12px;">${disclosureHTML('backup-avanzado', t('backup.advanced'), adv, ayudaOpen)}</div>`;
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
