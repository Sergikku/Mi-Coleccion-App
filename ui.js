/* La Colección App — ui.js
   Núcleo de interfaz: estado de navegación e historial, render(), barra de
   navegación y de contexto, diálogos, hojas, avisos, carga de fotos, gestos
   y piezas de HTML reutilizables (componentes). */

/* =====================================================================
   1. ESTADO DE LA INTERFAZ
   ===================================================================== */
/* Secciones de la barra de navegación. Ayuda, Copia de seguridad y la
   Galería siguen existiendo: se abren desde Ajustes y desde el Dashboard. */
const NAV = [
  { id:'dashboard',     labelKey:'nav.dashboard',     icon:'home' },
  { id:'coleccion',     labelKey:'nav.coleccion',     icon:'collection' },
  { id:'inventario',    labelKey:'nav.inventario',    icon:'list' },
  { id:'estadisticas',  labelKey:'nav.estadisticas',  icon:'chart' },
  { id:'investigacion', labelKey:'nav.investigacion', icon:'research' },
];
const SECONDARY_PAGES = { ayuda:'nav.ayuda', backup:'backup.kicker', gallery:'gallery.kicker' };

let view = { page:'dashboard' };
/* Estado del Inventario: búsqueda, filtro rápido (los chips de siempre),
   filtros avanzados (hoja de filtros), orden, vista y paginación. */
let invState = { search:'', filter:'todos', sort:'anio', limit:60,
  cat:'', plat:'', region:'', flags:[], photo:'', complete:'' };
/* Estado de las listas de piezas dentro de Colección (plataforma/carpeta) */
let collState = { key:'', filter:'all', limit:60 };
let galleryLimit = 60;
function uiPref(name, fallback){ return (APP_META.ui && APP_META.ui[name]) || fallback; }
async function setUiPref(name, value){
  APP_META.ui = Object.assign({}, APP_META.ui || {}, { [name]: value });
  await saveAppMeta();
}

/* =====================================================================
   2. HISTORIAL (botón atrás de Android + botón Volver)
   =====================================================================
   viewHistory guarda cada pantalla anterior junto con su posición de
   scroll. Cada paso adelante se registra también en el historial del
   navegador (history.pushState), para que el botón/gesto "atrás" de
   Android vuelva a la pantalla anterior de la app en vez de cerrarla.
   El botón "Volver" usa el mismo camino (navBack → history.back → evento
   popstate → goBack), así los dos historiales nunca se desincronizan.
   Scroll: una pantalla nueva se abre arriba; al volver, se recupera la
   posición en la que estabas; un redibujado en la misma pantalla la mantiene. */
let viewHistory = [];
let pendingScrollY = null;

function pushHistory(){
  viewHistory.push({ view: JSON.parse(JSON.stringify(view)), scrollY: window.scrollY });
  if(viewHistory.length>60) viewHistory.shift();
  pendingScrollY = 0;
  try{ history.pushState({ coleccionApp:true, depth:viewHistory.length }, ''); }catch(e){}
}
function goBack(){
  if(!viewHistory.length) return;
  const entry = viewHistory.pop();
  view = entry.view;
  pendingScrollY = entry.scrollY || 0;
  render();
}
function navBack(){
  if(!viewHistory.length){ if(view.page!=='dashboard'){ view = { page:'dashboard' }; pendingScrollY = 0; render(); } return; }
  history.back();   // → popstate → goBack()
}
window.addEventListener('popstate', ()=>{
  // "atrás" con un diálogo u hoja abiertos: se cierran y se queda en la pantalla
  if(isModalOpen()){
    modalCancelAction();
    try{ history.pushState({ coleccionApp:true, depth:viewHistory.length }, ''); }catch(e){}
    return;
  }
  if(isSheetOpen()){
    closeSheet();
    try{ history.pushState({ coleccionApp:true, depth:viewHistory.length }, ''); }catch(e){}
    return;
  }
  if(isViewerOpen()){ closePhotoViewer(); try{ history.pushState({ coleccionApp:true, depth:viewHistory.length }, ''); }catch(e){} return; }
  if(viewHistory.length){ goBack(); return; }
  // historial interno agotado (p. ej. más de 60 pasos): vuelve al inicio;
  // el siguiente "atrás" ya sale de la app, como en cualquier app Android
  if(view.page!=='dashboard'){ view = { page:'dashboard' }; pendingScrollY = 0; render(); }
});

/* Navegación entre pantallas */
function goPage(id){
  pushHistory(); view = { page:id };
  if(id==='backup'){
    // al entrar, mensajes limpios y estado del almacenamiento al día
    backupStatusMsg = { everything:'', photos:'' };
    refreshStorageState(false).then(()=>{ const el=document.getElementById('storage-status'); if(el && view.page==='backup') el.outerHTML = storageStatusHTML(); });
  }
  render();
}
function goCategory(catId){ pushHistory(); view = { page:'coleccion', categoryId:catId }; render(); }
function goPlatform(catId, platId){ pushHistory(); view = { page:'coleccion', categoryId:catId, platformId:platId }; render(); }
function goFolder(catId, platId, folderId){ pushHistory(); view = { page:'coleccion', categoryId:catId, platformId:platId, folderId:folderId }; render(); }
/* La ficha se abre DENTRO de la sección desde la que vienes (Colección,
   Inventario, Dashboard, Investigación…): así la barra de navegación sigue
   marcando dónde estabas, y "Volver" te devuelve allí. Si vienes de una
   lista, la ficha puede ir a la pieza anterior/siguiente de esa lista. */
function goProduct(prodId, tab){
  const ctx = (currentListCtx && LIST_CONTEXTS.has(currentListCtx) && LIST_CONTEXTS.get(currentListCtx).ids.includes(prodId)) ? currentListCtx : null;
  pushHistory();
  view = Object.assign({}, view, { productId:prodId, productTab: tab==='fotos' ? 'fotos' : 'ficha', navCtx:ctx });
  render();
}
/* v11.1: el hueco "Añadir foto" de una portada abre la ficha directamente en Fotos */
function goProductPhotos(prodId){ goProduct(prodId, 'fotos'); }

/* Contextos de lista (para anterior/siguiente en la ficha) */
const LIST_CONTEXTS = new Map();
let listCtxSeq = 0, currentListCtx = null;
function registerListContext(ids, label){
  // v11.1: una lista idéntica reutiliza su contexto, y el contexto de la ficha
  // abierta (view.navCtx) nunca se descarta por abrir otras listas.
  const sig = (label||'') + '\u0000' + ids.join('\u0001');
  for(const [k, c] of LIST_CONTEXTS){
    if(c.sig===sig){ LIST_CONTEXTS.delete(k); LIST_CONTEXTS.set(k, c); currentListCtx = k; return k; }
  }
  listCtxSeq++;
  LIST_CONTEXTS.set(listCtxSeq, { ids, label, sig });
  while(LIST_CONTEXTS.size > 12){
    const old = [...LIST_CONTEXTS.keys()].find(k=> k!==view.navCtx && k!==listCtxSeq);
    if(old===undefined) break;
    LIST_CONTEXTS.delete(old);
  }
  currentListCtx = listCtxSeq;
  return listCtxSeq;
}
function goSibling(dir){
  const ctx = view.navCtx && LIST_CONTEXTS.get(view.navCtx);
  if(!ctx) return;
  const i = ctx.ids.indexOf(view.productId);
  const j = i + dir;
  if(i<0 || j<0 || j>=ctx.ids.length) return;
  view = Object.assign({}, view, { productId: ctx.ids[j], productTab:'ficha' });
  pendingScrollY = 0;
  render();
}

/* =====================================================================
   3. RENDER
   ===================================================================== */
/* render() es asíncrono. Si mientras tanto se pide otra pantalla, el
   resultado de la anterior se descarta (renderSeq) — nunca "llega tarde"
   y tapa la pantalla nueva. Ya no vacía el panel con "Cargando…" en cada
   acción (causaba un parpadeo y un salto de scroll); el aviso de carga solo
   aparece si una pantalla tarda de verdad. */
let renderSeq = 0;
/* Cambios sin guardar: los campos guardan al perder el foco ("change"). Si se
   navega (atrás del sistema, pestañas, enlaces) con un campo aún editándose,
   se confirma antes de cambiar de pantalla para no perder lo escrito. */
function commitPendingEdit(){
  const a = document.activeElement;
  if(!a || !a.closest || !a.closest('#panel')) return;
  if(!a.matches('input[onchange]:not([type=file]):not([type=checkbox]):not([type=radio]), textarea[onchange]')) return;
  if(a.value !== a.defaultValue) a.blur();
}
async function render(){
  commitPendingEdit();
  _platVisual.clear();   // v11.1: colores/códigos de plataforma al día (p. ej. tras importar una copia)
  const mySeq = ++renderSeq;
  const scrollY = (pendingScrollY !== null) ? pendingScrollY : window.scrollY;
  pendingScrollY = null;
  document.body.dataset.rendering = '1';
  if(!view.productId && !['coleccion','inventario','dashboard'].includes(view.page)) currentListCtx = null;
  renderNav();
  renderSubbar();
  const panel = document.getElementById('panel');
  const slow = setTimeout(()=>{ if(mySeq===renderSeq){ panel.setAttribute('aria-busy','true'); panel.innerHTML = `<div class="loading-note" role="status">${t('common.loading')}</div>`; } }, 350);
  let html = '';
  try{
    html = await renderScreen();
  }catch(err){
    console.error(err);
    html = emptyStateHTML({ icon:'x', title:t('common.error_title'), text:t('common.error_text') + ' ' + escapeHTML(err && err.message || ''),
      actions:`<button class="btn" onclick="goPage('dashboard')">${t('nav.dashboard')}</button>` });
  }
  clearTimeout(slow);
  if(mySeq !== renderSeq) return;   // ya se pidió otra pantalla: descartar
  panel.innerHTML = html;
  panel.removeAttribute('aria-busy');
  delete document.body.dataset.rendering;
  updateFab();
  hydrate(panel);
  updateDocumentTitle();
  if(tourActive) advanceTourIfDone();
  requestAnimationFrame(()=>{ animateBars(); window.scrollTo(0, scrollY); });
}
function renderScreen(){
  if(view.productId && PRODUCTS_BY_ID[view.productId]) return renderProductDetail(view.productId);
  if(view.productId){ view.productId = null; }
  switch(view.page){
    case 'coleccion': return renderColeccion();
    case 'inventario': return renderInventario();
    case 'estadisticas': return renderEstadisticas();
    case 'investigacion': return renderInvestigacion();
    case 'ayuda': return renderAyuda();
    case 'backup': return renderBackup();
    case 'gallery': return renderGallery();
    default: return renderDashboard();
  }
}
function updateDocumentTitle(){
  let title = 'La Colección App';
  const p = view.productId && PRODUCTS_BY_ID[view.productId];
  if(p) title = p.name + ' · ' + title;
  else {
    const nav = NAV.find(n=>n.id===view.page);
    const key = nav ? nav.labelKey : SECONDARY_PAGES[view.page];
    if(key) title = t(key) + ' · ' + title;
  }
  document.title = title.replace(/\s+/g,' ');
}

/* Barra de navegación (abajo en móvil, pestañas arriba en escritorio) */
function renderNav(){
  const items = NAV.map(n=>{
    const active = view.page===n.id;
    // etiqueta corta opcional para la barra inferior (p. ej. japonés), con el nombre completo accesible
    const lang = OVERRIDES.lang || 'es';
    const short = I18N[lang] && I18N[lang]['nav.short.'+n.id];
    const full = t(n.labelKey);
    return `<button class="navitem ${active?'active':''}" ${active?'aria-current="page"':''} ${short?`aria-label="${escapeHTML(full)}" title="${escapeHTML(full)}"`:''} onclick="goPage('${n.id}')">${icon(n.icon,'navicon')}<span class="navlabel">${short || full}</span></button>`;
  }).join('');
  document.getElementById('bottomnav').innerHTML = items;
  document.getElementById('topnav').innerHTML = items;
}

/* Barra de contexto: "Volver" + ruta (migas). Solo aparece cuando estás
   dentro de algo (categoría, plataforma, ficha…) o en una pantalla que no
   está en la barra de navegación (Ayuda, Copia de seguridad, Galería). */
function renderSubbar(){
  const bar = document.getElementById('subbar');
  const crumbs = document.getElementById('crumbs');
  const deep = !!(view.categoryId || view.productId || SECONDARY_PAGES[view.page]);
  bar.hidden = !deep;
  if(!deep){ crumbs.innerHTML = ''; return; }
  const parts = [];
  const nav = NAV.find(n=>n.id===view.page);
  const rootLabel = nav ? t(nav.labelKey) : t(SECONDARY_PAGES[view.page] || 'nav.dashboard');
  const link = (label, js)=> `<button type="button" onclick="${js}">${escapeHTML(label)}</button>`;
  const cur = (label)=> `<span class="current" aria-current="page">${escapeHTML(label)}</span>`;
  const sep = `<span class="sep" aria-hidden="true">/</span>`;
  const p = view.productId && PRODUCTS_BY_ID[view.productId];
  // en la ficha, la ruta muestra dónde está la pieza (categoría / plataforma / carpeta)
  const catId = p ? p.categoryId : view.categoryId;
  const platId = p ? p.platformId : view.platformId;
  const folderId = p ? p.folderId : view.folderId;
  const hasTail = !!(catId || p);
  parts.push(hasTail ? link(rootLabel, `goPage('${view.page}')`) : cur(rootLabel));
  if(catId && (view.page==='coleccion' || p)){
    const cat = getAllCategories().find(c=>c.id===catId);
    if(cat){ parts.push(sep); parts.push((platId || p) ? link(cat.name, `goCategory('${cat.id}')`) : cur(cat.name)); }
    const plat = platId && getAllPlatforms().find(x=>x.id===platId);
    if(plat){ parts.push(sep); parts.push((folderId || p) ? link(plat.name, `goPlatform('${catId}','${plat.id}')`) : cur(plat.name)); }
    const folder = plat && folderId && foldersForPlatform(platId).find(f=>f.id===folderId);
    if(folder){ parts.push(sep); parts.push(p ? link(folder.name, `goFolder('${catId}','${platId}','${folder.id}')`) : cur(folder.name)); }
  }
  if(p){ parts.push(sep); parts.push(cur(p.name)); }
  crumbs.innerHTML = parts.join('');
  const back = document.getElementById('backBtn');
  if(back) back.setAttribute('aria-label', t('common.back'));
}

/* Botón flotante "+" — te sigue por la pantalla para no tener que bajar
   hasta el final de la página cada vez que quieres añadir algo. Su acción
   depende de dónde estés navegando en ese momento. */
function updateFab(){
  const fab = document.getElementById('fab');
  if(!fab) return;
  let label = '';
  if(view.page==='coleccion' && view.platformId && !view.productId) label = t('fab.add_product');
  else if(view.page==='coleccion' && view.categoryId && !view.platformId && !view.productId) label = t('fab.add_platform');
  fab.style.display = label ? 'flex' : 'none';
  fab.title = label; fab.setAttribute('aria-label', label || '+');
  document.body.classList.toggle('has-fab', !!label);
}
function fabAction(){
  if(view.page==='coleccion' && view.platformId && !view.productId){
    addProductToPlatform(view.categoryId, view.platformId, view.folderId||null);
  } else if(view.page==='coleccion' && view.categoryId && !view.platformId){
    addPlatformToCategory(view.categoryId);
  }
}

/* Después de pintar: fotos perezosas y botones de borrar búsqueda */
function hydrate(root){
  hydratePhotos(root);
  // v11.1: en una fila de chips que se desliza, el chip activo queda a la vista
  root.querySelectorAll('.chip-scroll').forEach(row=>{
    const a = row.querySelector('.chip.active');
    if(!a || row.scrollWidth <= row.clientWidth) return;
    const over = a.getBoundingClientRect().right - row.getBoundingClientRect().right;
    if(over > 0) row.scrollLeft += over + 24;
  });
  root.querySelectorAll('.searchbar input').forEach(inp=>{
    const btn = inp.parentElement.querySelector('.search-clear');
    if(btn) btn.hidden = !inp.value;
  });
}

function animateBars(){
  document.querySelectorAll('.bar-fill[data-pct]').forEach(el=>{
    const pct = el.getAttribute('data-pct');
    requestAnimationFrame(()=>{ el.style.width = pct + '%'; });
  });
  document.querySelectorAll('.ring[data-pct]').forEach(el=>{
    const pct = el.getAttribute('data-pct');
    el.style.setProperty('--p','0%');
    requestAnimationFrame(()=>{ el.style.setProperty('--p', pct+'%'); });
  });
}

/* =====================================================================
   4. FOTOS: carga perezosa, volteo, zoom y visor
   ===================================================================== */
/* Las fotos de rejillas y listas se piden solo cuando están a punto de
   verse (IntersectionObserver), y en miniatura. La cara trasera se carga
   la primera vez que volteas la tarjeta. */
let _photoObserver = null;
function hydratePhotos(root){
  const imgs = root.querySelectorAll('img[data-pid]:not([data-loaded])');
  if(!('IntersectionObserver' in window)){ imgs.forEach(img=>{ if(img.dataset.side!=='back') loadLazyImg(img); }); return; }
  if(!_photoObserver){
    _photoObserver = new IntersectionObserver(entries=>{
      entries.forEach(en=>{ if(en.isIntersecting){ _photoObserver.unobserve(en.target); loadLazyImg(en.target); } });
    }, { rootMargin:'600px 0px' });
  }
  imgs.forEach(img=>{ if(img.dataset.side!=='back' || img.dataset.eager) _photoObserver.observe(img); });
}
async function loadLazyImg(img){
  if(!img || img.dataset.loaded) return;
  img.dataset.loaded = '1';
  const url = await getPhotoURL(img.dataset.pid, img.dataset.side || 'front', img.dataset.size || 'thumb');
  if(!url){ img.remove(); return; }
  img.addEventListener('load', ()=> img.classList.add('is-loaded'), { once:true });
  img.src = url;
  if(img.complete && img.naturalWidth) img.classList.add('is-loaded');
}
/* Tarjeta de foto que se voltea (tocar, deslizar o Intro/Espacio). Nunca
   abre el selector de archivos: subir/cambiar fotos vive en "Fotos". */
function photoImgHTML(p, side, size, extra){
  const label = escapeHTML(p.name) + ' — ' + t(side==='back' ? 'photo.back' : 'photo.front');
  return `<img data-pid="${escapeHTML(p.id)}" data-side="${side}" data-size="${size}" alt="${label}" ${extra||''}>`;
}
function flipViewHTML(p, opts){
  opts = opts || {};
  const size = opts.size || 'thumb';
  const hasFront = hasPhoto(p.id,'front'), hasBack = hasPhoto(p.id,'back');
  const ph = (key)=> `<span class="flip-placeholder">${icon('image')}<span class="ph-txt">${t(key)}</span></span>`;
  const front = hasFront ? photoImgHTML(p,'front',size) : ph('p.no_photo_front');
  const back = hasBack ? photoImgHTML(p,'back',size) : ph('p.no_photo_back');
  return `<div class="flip-card" role="button" tabindex="0" aria-label="${t('photo.flip')}: ${escapeHTML(p.name)}" data-flip-pid="${escapeHTML(p.id)}">
    <div class="flip-inner">
      <div class="flip-face flip-front">${front}</div>
      <div class="flip-face flip-back">${back}</div>
    </div>
    ${opts.hint===false || !(hasFront || hasBack) ? '' : `<div class="flip-hint" aria-hidden="true">${icon('flip')}</div>`}
  </div>`;
}
function flipCard(card){
  card.classList.toggle('flipped');
  if(card.classList.contains('flipped')){
    const img = card.querySelector('.flip-back img[data-pid]:not([data-loaded])');
    if(img) loadLazyImg(img);
  }
}
/* click / tap para voltear la tarjeta (funciona en cualquier .flip-card,
   incluida la foto principal en la rejilla, sin entrar a la ficha) */
function attachFlipHandlers(){
  const panel = document.getElementById('panel');
  let touchStart = null;
  let pinch = null;
  const onPinchMove = (e)=>{
    if(!pinch) return;
    e.preventDefault();
    setPinchScale(Math.min(4, Math.max(1, pinchDistance(e.touches) / pinch.dist)));
  };
  panel.addEventListener('click', (e)=>{
    const card = e.target.closest('.flip-card');
    if(!card) return;
    // voltear nunca activa la acción de la tarjeta/fila que lo envuelve
    e.preventDefault();
    e.stopPropagation();
    if(card.dataset.justSwiped==='1'){ card.dataset.justSwiped=''; return; }
    flipCard(card);
  }, true);
  panel.addEventListener('keydown', (e)=>{
    const card = e.target.closest && e.target.closest('.flip-card');
    if(!card || (e.key!=='Enter' && e.key!==' ')) return;
    e.preventDefault(); e.stopPropagation();
    flipCard(card);
  }, true);
  panel.addEventListener('touchstart', (e)=>{
    const card = e.target.closest('.flip-card');
    if(!card) return;
    if(e.touches.length>=2){
      // Pellizcar con dos dedos: amplía temporalmente la foto en grande,
      // centrada en el punto exacto donde has puesto los dedos.
      touchStart = null;
      const face = card.classList.contains('flipped') ? card.querySelector('.flip-back img') : card.querySelector('.flip-front img');
      if(!face || !face.src) return;
      const rect = card.getBoundingClientRect();
      const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      const originX = rect.width ? Math.min(100, Math.max(0, ((midX - rect.left) / rect.width) * 100)) : 50;
      const originY = rect.height ? Math.min(100, Math.max(0, ((midY - rect.top) / rect.height) * 100)) : 50;
      openPinchZoom(face, originX, originY);
      pinch = { dist: pinchDistance(e.touches) };
      // solo mientras se pellizca se escucha touchmove de forma no pasiva
      // (así el scroll normal de las listas nunca espera a JavaScript)
      document.addEventListener('touchmove', onPinchMove, { passive:false });
      return;
    }
    const tt = e.touches[0];
    touchStart = { card, x:tt.clientX, y:tt.clientY };
  }, {passive:true});
  const endPinch = (e)=>{
    if(pinch && (!e || e.touches.length<2)){
      closePinchZoom(); pinch = null;
      document.removeEventListener('touchmove', onPinchMove);
    }
  };
  panel.addEventListener('touchend', (e)=>{
    if(pinch){ endPinch(e); return; }
    if(!touchStart) return;
    const tt = e.changedTouches[0];
    const dx = tt.clientX - touchStart.x, dy = tt.clientY - touchStart.y;
    if(Math.abs(dx) > 30 && Math.abs(dx) > Math.abs(dy)*1.4){
      touchStart.card.dataset.justSwiped = '1';
      const shouldFlip = dx>0 ? !touchStart.card.classList.contains('flipped') : touchStart.card.classList.contains('flipped');
      if(shouldFlip) flipCard(touchStart.card);
    }
    touchStart = null;
  }, {passive:true});
  panel.addEventListener('touchcancel', endPinch, {passive:true});
}

/* Zoom temporal al pellizcar — mientras mantienes los dedos; al soltar,
   vuelve a su tamaño normal. Se ve primero la miniatura y, en cuanto
   llega, la foto completa. No cambia nada guardado. */
function pinchDistance(touches){
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.hypot(dx, dy) || 1;
}
let viewerState = null;   // { mode:'pinch'|'viewer', pid, side }
function openPinchZoom(faceImg, originX, originY){
  const overlay = document.getElementById('pinchOverlay');
  const img = document.getElementById('pinchImg');
  if(!overlay || !img || !faceImg) return;
  viewerState = { mode:'pinch' };
  img.src = faceImg.src;
  img.style.transformOrigin = (originX!==undefined ? originX : 50) + '% ' + (originY!==undefined ? originY : 50) + '%';
  img.style.transform = 'scale(1)';
  document.getElementById('viewerClose').hidden = true;
  document.getElementById('viewerBar').hidden = true;
  overlay.style.display = 'flex';
  if(faceImg.dataset.pid && faceImg.dataset.size!=='full'){
    getPhotoURL(faceImg.dataset.pid, faceImg.dataset.side, 'full').then(url=>{ if(url && viewerState && viewerState.mode==='pinch') img.src = url; });
  }
}
function setPinchScale(scale){
  const img = document.getElementById('pinchImg');
  if(img) img.style.transform = 'scale(' + scale + ')';
}
function closePinchZoom(){
  const overlay = document.getElementById('pinchOverlay');
  if(overlay && viewerState && viewerState.mode==='pinch'){ overlay.style.display = 'none'; viewerState = null; }
}
/* Visor a pantalla completa (botón "Ampliar" de la ficha): foto completa,
   delantera/trasera, se cierra con ✕, tocando fuera, Escape o "atrás". */
let _viewerReturnFocus = null;
async function openPhotoViewer(pid, side){
  side = side || (hasPhoto(pid,'front') ? 'front' : 'back');
  const overlay = document.getElementById('pinchOverlay');
  const img = document.getElementById('pinchImg');
  const p = PRODUCTS_BY_ID[pid];
  if(!overlay || !img || !p || !hasPhoto(pid, side)) return;
  _viewerReturnFocus = document.activeElement;
  viewerState = { mode:'viewer', pid, side };
  img.style.transform = 'none';
  img.alt = p.name + ' — ' + t(side==='back' ? 'photo.back' : 'photo.front');
  img.removeAttribute('src');
  const close = document.getElementById('viewerClose'); close.hidden = false; close.setAttribute('aria-label', t('common.close'));
  const bar = document.getElementById('viewerBar');
  const both = hasPhoto(pid,'front') && hasPhoto(pid,'back');
  bar.hidden = !both;
  bar.innerHTML = both ? ['front','back'].map(s=>`<button type="button" class="chip ${s===side?'active':''}" aria-pressed="${s===side}" onclick="openPhotoViewer('${escapeHTML(pid)}','${s}')">${t(s==='back'?'photo.back':'photo.front')}</button>`).join('') : '';
  overlay.style.display = 'flex';
  overlay.setAttribute('role','dialog'); overlay.setAttribute('aria-modal','true'); overlay.setAttribute('aria-label', p.name);
  close.focus();
  const thumb = await getPhotoURL(pid, side, 'thumb'); if(thumb && viewerState && viewerState.pid===pid && viewerState.side===side && !img.src) img.src = thumb;
  const full = await getPhotoURL(pid, side, 'full'); if(full && viewerState && viewerState.pid===pid && viewerState.side===side) img.src = full;
}
function closePhotoViewer(){
  const overlay = document.getElementById('pinchOverlay');
  if(overlay){ overlay.style.display = 'none'; overlay.removeAttribute('role'); overlay.removeAttribute('aria-modal'); }
  viewerState = null;
  if(_viewerReturnFocus && _viewerReturnFocus.focus) try{ _viewerReturnFocus.focus(); }catch(e){}
}
function isViewerOpen(){ return !!(viewerState && viewerState.mode==='viewer'); }

/* =====================================================================
   5. DIÁLOGOS (sustituyen a prompt()/confirm(), que fallan en una PWA)
   =====================================================================
   Accesibles: role="dialog", el foco queda dentro, Escape cancela, Intro
   acepta, y al cerrar el foco vuelve a donde estaba. Admiten varios campos
   en un solo paso (p. ej. nombre + año). */
let modalResolve = null;
let modalFields = null;
let _modalReturnFocus = null;
function isModalOpen(){ const m = document.getElementById('modalOverlay'); return !!(m && m.classList.contains('open')); }
function openModalShell(title, bodyHTML, opts){
  opts = opts || {};
  _modalReturnFocus = document.activeElement;
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = bodyHTML;
  const ok = document.getElementById('modalOkBtn');
  ok.textContent = opts.okLabel || t('modal.accept');
  document.getElementById('modalCancelBtn').textContent = opts.cancelLabel || t('modal.cancel');
  document.querySelector('#modalOverlay .modal-card').classList.toggle('is-danger', !!opts.danger);
  document.getElementById('modalOverlay').classList.add('open');
}
function showFormModal(title, fields, opts){
  return new Promise(resolve=>{
    modalResolve = resolve;
    modalFields = fields;
    const body = `<div class="modal-fields">` + fields.map((f,i)=>{
      const id = i===0 ? 'modalInput' : 'modalField_' + f.name;
      return `<div class="field"><label for="${id}">${escapeHTML(f.label)}</label>
        <input id="${id}" name="${escapeHTML(f.name)}" type="${f.type||'text'}" value="${escapeHTML(f.value||'')}" placeholder="${escapeHTML(f.placeholder||'')}" ${f.inputmode?`inputmode="${f.inputmode}"`:''} autocomplete="off"></div>`;
    }).join('') + `</div>`;
    openModalShell(title, body, opts);
    // foco en el primer campo, salvo que ya estés escribiendo en otro del diálogo
    setTimeout(()=>{ const first = document.getElementById('modalInput'); const body = document.getElementById('modalBody');
      if(first && !(body && body.contains(document.activeElement))){ first.focus(); first.select(); } }, 40);
  });
}
function showPromptModal(title, defaultValue){
  // un solo campo: devuelve el texto (o null si se cancela o se deja vacío)
  return showFormModal(title, [{ name:'value', label:title, value:defaultValue||'' }], {}).then(r=> r ? (r.value || null) : null);
}
function showConfirmModal(message, opts){
  opts = opts || {};
  return new Promise(resolve=>{
    modalResolve = resolve;
    modalFields = null;
    openModalShell(message, '', { okLabel: opts.okLabel || t('modal.confirm'), danger: !!opts.danger });
    setTimeout(()=>{ const b = document.getElementById(opts.danger ? 'modalCancelBtn' : 'modalOkBtn'); if(b) b.focus(); }, 40);
  });
}
function modalConfirmAction(){
  let value = true;
  if(modalFields){
    const out = {};
    let missing = null;
    modalFields.forEach((f,i)=>{
      const el = document.getElementById(i===0 ? 'modalInput' : 'modalField_' + f.name);
      const v = el ? el.value.trim() : '';
      out[f.name] = v;
      if(f.required !== false && i===0 && !v) missing = el;
    });
    if(missing){ missing.focus(); missing.setAttribute('aria-invalid','true'); return; }
    value = out;
  }
  closeModal(value);
}
function modalCancelAction(){ closeModal(null); }
function closeModal(value){
  document.getElementById('modalOverlay').classList.remove('open');
  const resolve = modalResolve; modalResolve = null; modalFields = null;
  if(_modalReturnFocus && _modalReturnFocus.focus && document.contains(_modalReturnFocus)) try{ _modalReturnFocus.focus(); }catch(e){}
  if(resolve) resolve(value);
}
/* Teclado global: Escape cierra diálogo / hoja / visor; Tab no se escapa
   del diálogo abierto; Intro en un campo del diálogo acepta. */
document.addEventListener('keydown', (e)=>{
  if(e.key==='Escape'){
    if(isModalOpen()){ e.preventDefault(); modalCancelAction(); return; }
    if(isSheetOpen()){ e.preventDefault(); closeSheet(); return; }
    if(isViewerOpen()){ e.preventDefault(); closePhotoViewer(); return; }
  }
  if(e.key==='Enter' && isModalOpen() && e.target && e.target.tagName==='INPUT'){ e.preventDefault(); modalConfirmAction(); return; }
  if(e.key==='Tab'){
    const box = isModalOpen() ? document.querySelector('#modalOverlay .modal-card') : isSheetOpen() ? document.querySelector('#sheetOverlay .sheet') : null;
    if(!box) return;
    const f = [...box.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(el=>!el.disabled && el.offsetParent!==null);
    if(!f.length) return;
    const first = f[0], last = f[f.length-1];
    if(e.shiftKey && document.activeElement===first){ e.preventDefault(); last.focus(); }
    else if(!e.shiftKey && document.activeElement===last){ e.preventDefault(); first.focus(); }
  }
});

/* =====================================================================
   6. HOJAS (filtros, ajustes): desde abajo en móvil, centradas en escritorio
   ===================================================================== */
let _sheetReturnFocus = null;
let _sheetOnClose = null;
function isSheetOpen(){ const s = document.getElementById('sheetOverlay'); return !!(s && s.classList.contains('open')); }
function openSheet(opts){
  const ov = document.getElementById('sheetOverlay');
  _sheetReturnFocus = document.activeElement;
  _sheetOnClose = opts.onClose || null;
  ov.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheetTitle">
    <div class="sheet-head"><div class="sheet-title" id="sheetTitle">${escapeHTML(opts.title)}</div>
      <button type="button" class="btn btn-ghost btn-icon" onclick="closeSheet()" aria-label="${t('common.close')}">${icon('x')}</button></div>
    <div class="sheet-body" id="sheetBody">${opts.body}</div>
    ${opts.foot ? `<div class="sheet-foot">${opts.foot}</div>` : ''}
  </div>`;
  ov.dataset.kind = opts.kind || '';
  ov.classList.add('open');
  ov.onclick = (e)=>{ if(e.target===ov) closeSheet(); };
  setTimeout(()=>{ const b = ov.querySelector('.sheet-body button, .sheet-body select, .sheet-body input') || ov.querySelector('.sheet-head button'); if(b) b.focus(); }, 40);
}
function updateSheetBody(html){ const b = document.getElementById('sheetBody'); if(b) b.innerHTML = html; }
function closeSheet(){
  const ov = document.getElementById('sheetOverlay');
  if(!ov || !ov.classList.contains('open')) return;
  ov.classList.remove('open');
  ov.innerHTML = '';
  delete ov.dataset.kind;
  const cb = _sheetOnClose; _sheetOnClose = null;
  if(_sheetReturnFocus && _sheetReturnFocus.focus && document.contains(_sheetReturnFocus)) try{ _sheetReturnFocus.focus(); }catch(e){}
  if(cb) cb();
}

/* Ajustes: tema, idioma, moneda y accesos (Copia de seguridad, Galería, Ayuda) */
function settingsBodyHTML(){
  const theme = OVERRIDES.theme==='dark' ? 'dark' : 'light';
  const lang = OVERRIDES.lang || 'es';
  const cur = currencySymbol();
  const langs = [['es','Español'],['en','English'],['de','Deutsch'],['ja','日本語']];
  const curs = [['€','€ Euro'],['$','$ '+t('currency.dollar')],['£','£ '+t('currency.pound')],['¥','¥ '+t('currency.yen')]];
  const row = (ic, label, js)=> `<button type="button" class="settings-row" onclick="closeSheet(); ${js}"><span class="row-label">${icon(ic)}${label}</span>${icon('chevronRight')}</button>`;
  return `<div class="sheet-group"><div class="field-label">${t('settings.theme')}</div>
      <div class="segmented" role="group" aria-label="${t('settings.theme')}">
        <button type="button" class="seg-btn ${theme==='light'?'active':''}" aria-pressed="${theme==='light'}" onclick="setTheme('light')">${icon('sun')} ${t('settings.theme_light')}</button>
        <button type="button" class="seg-btn ${theme==='dark'?'active':''}" aria-pressed="${theme==='dark'}" onclick="setTheme('dark')">${icon('moon')} ${t('settings.theme_dark')}</button>
      </div></div>
    <div class="sheet-group"><div class="field-label">${t('settings.language')}</div><div class="chip-row" role="group" aria-label="${t('settings.language')}">
      ${langs.map(([c,l])=>`<button type="button" class="chip ${lang===c?'active':''}" aria-pressed="${lang===c}" onclick="setLang('${c}')" lang="${c}">${l}</button>`).join('')}</div></div>
    <div class="sheet-group"><div class="field-label">${t('settings.currency')}</div><div class="chip-row" role="group" aria-label="${t('settings.currency')}">
      ${curs.map(([c,l])=>`<button type="button" class="chip ${cur===c?'active':''}" aria-pressed="${cur===c}" onclick="setCurrency('${c}')">${escapeHTML(l)}</button>`).join('')}</div>
      <div class="section-sub" style="margin:8px 0 0;">${t('settings.currency_note')}</div></div>
    <div class="sheet-group">
      ${row('archive', t('dash.backup_link'), "goPage('backup')")}
      ${row('camera', t('dash.gallery_link'), "goPage('gallery')")}
      ${row('help', t('nav.ayuda'), "goPage('ayuda')")}
    </div>
    <div class="section-sub" style="text-align:center;margin:12px 0 0;">La Colección App · v${APP_VERSION}</div>`;
}
function openSettings(){ openSheet({ kind:'settings', title:t('settings.title'), body:settingsBodyHTML() }); }
function isSheetKind(kind){ const ov = document.getElementById('sheetOverlay'); return isSheetOpen() && !!ov && ov.dataset.kind===kind; }
function refreshSettingsSheet(){
  if(!isSheetKind('settings')) return;
  const title = document.getElementById('sheetTitle'); if(title) title.textContent = t('settings.title');
  const close = document.querySelector('#sheetOverlay .sheet-head button'); if(close) close.setAttribute('aria-label', t('common.close'));
  updateSheetBody(settingsBodyHTML());
}

/* =====================================================================
   7. AVISOS BREVES (feedback no intrusivo, con "Deshacer" opcional)
   ===================================================================== */
function showToast(message, opts){
  opts = opts || {};
  const region = document.getElementById('toastRegion');
  if(!region) return;
  const el = document.createElement('div');
  el.className = 'toast' + (opts.ok ? ' toast-ok' : '');
  el.innerHTML = `<span>${escapeHTML(message)}</span>` + (opts.action ? `<button type="button" class="toast-action">${escapeHTML(opts.action.label)}</button>` : '');
  if(opts.action){
    el.querySelector('.toast-action').addEventListener('click', ()=>{ dismissToast(el); opts.action.fn(); });
  }
  if(opts.replace) region.querySelectorAll('.toast').forEach(dismissToast);
  region.appendChild(el);
  setTimeout(()=>dismissToast(el), opts.duration || (opts.action ? 6000 : 2200));
  return el;
}
function dismissToast(el){
  if(!el || !el.parentNode || el.classList.contains('is-leaving')) return;
  el.classList.add('is-leaving');
  setTimeout(()=>el.remove(), 220);
}
/* "Guardado": al cambiar un campo de texto/número/selector, cuando el
   guardado termina bien se confirma con un aviso breve. */
let pendingSaveFeedback = false;
document.addEventListener('change', (e)=>{
  const el = e.target;
  if(!el || !el.closest || !el.closest('#panel') || el.closest('[data-nosave], .toolbar')) return;
  if(el.matches('input[type=text], input[type=number], input:not([type]), textarea, select') && !el.closest('.searchbar')) pendingSaveFeedback = true;
}, true);
function notifySaved(ok){
  if(ok && pendingSaveFeedback) showToast(t('common.saved'), { ok:true, replace:true, duration:1400 });
  pendingSaveFeedback = false;
}
/* Si la app pasa a segundo plano con un campo a medio escribir, se fuerza
   el guardado (el cambio se guarda al salir del campo). */
document.addEventListener('visibilitychange', ()=>{
  if(document.visibilityState==='hidden'){
    const a = document.activeElement;
    if(a && a.closest && a.closest('#panel') && a.matches('input, textarea')) a.blur();
  }
});

/* Aviso de guardado fallido ('saveError', se quita solo al volver a
   guardar bien) o de datos ilegibles al arrancar ('loadError'). */
function showSaveError(visible, message){
  const elId = message ? 'loadError' : 'saveError';
  let el = document.getElementById(elId);
  if(!visible){ if(el) el.remove(); return; }
  if(!el){
    el = document.createElement('div');
    el.id = elId; el.className = 'save-error'; el.setAttribute('role','alert');
    document.body.appendChild(el);
  }
  el.innerHTML = `<span class="save-error-text">${escapeHTML(message || t('save.error'))}</span>`
    + (message ? `` : `<button type="button" class="btn save-error-btn" onclick="persistOverrides()">${t('save.retry')}</button>`);
}

/* =====================================================================
   8. COMPONENTES (piezas de HTML reutilizables)
   ===================================================================== */
let _fieldSeq = 0;
function fieldId(){ return 'f' + (++_fieldSeq); }

function screenHeadHTML(o){
  const title = o.edit
    ? `<input type="text" class="h1-edit" value="${escapeHTML(o.title)}" onchange="${o.edit}" aria-label="${escapeHTML(o.editLabel || t('common.rename'))}" title="${escapeHTML(o.editLabel || t('common.rename'))}">`
    : `<h1>${escapeHTML(o.title)}</h1>`;
  return `<header class="screen-head">
    ${o.kicker ? `<div class="kicker">${o.chip ? `<span class="kicker-chip" style="--plat:${o.chip.color}" aria-hidden="true">${escapeHTML(o.chip.code)}</span>` : `<span class="dot" aria-hidden="true"></span>`} ${o.kicker}</div>` : ''}
    ${title}
    ${o.sub ? `<p class="screen-sub">${o.sub}</p>` : ''}
  </header>`;
}
function emptyStateHTML(o){
  return `<div class="empty-state" role="status">
    ${o.icon ? `<div class="empty-icon">${icon(o.icon)}</div>` : ''}
    ${o.title ? `<div class="empty-title">${o.title}</div>` : ''}
    ${o.text ? `<p>${o.text}</p>` : ''}
    ${o.actions ? `<div class="quick-actions">${o.actions}</div>` : ''}
  </div>`;
}
function sectionTitleHTML(text, aside){
  return `<h2 class="section-title">${text}${aside ? `<span class="section-aside">${aside}</span>` : ''}</h2>`;
}
/* Sección plegable nativa (<details>): se abre/cierra sin redibujar la
   pantalla y recuerda su estado en el objeto indicado (p. ej. productSectionsOpen). */
function disclosureHTML(key, title, body, store, meta){
  const open = !!(store && store[key]);
  const storeName = store===statsOpen ? 'statsOpen' : store===ayudaOpen ? 'ayudaOpen' : 'productSectionsOpen';
  return `<details class="disclosure" ${open?'open':''} ontoggle="${storeName}['${key}']=this.open">
    <summary>${icon('chevronRight','chev')}<span>${title}</span>${meta ? `<span class="sum-meta">${meta}</span>` : ''}</summary>
    <div class="disclosure-body">${body}</div>
  </details>`;
}
/* compatibilidad: firma antigua */
function accordionSection(key, label, bodyHtml){ return disclosureHTML(key, label, bodyHtml, productSectionsOpen); }

function checklistEditorHTML(catId){
  const items = checklistForCategory(catId);
  const isCustom = !!(OVERRIDES.categoryChecklist && OVERRIDES.categoryChecklist[catId]);
  let html = `<div class="section-sub">${t('checklist.intro')}</div><div class="checklist">`;
  items.forEach((item, idx)=>{
    html += `<div class="check-item" style="cursor:default;justify-content:space-between;"><span>${escapeHTML(checklistLabel(item))}</span>
      <span class="field-inline-actions">
        <button type="button" class="mini-action" onclick="renameChecklistItemPrompt('${catId}',${idx})">${icon('pencil')} ${t('checklist.rename')}</button>
        <button type="button" class="mini-action danger" onclick="removeChecklistItem('${catId}',${idx})">${icon('x')} ${t('checklist.remove')}</button>
      </span></div>`;
  });
  html += `</div><div class="quick-actions">
    <button class="btn btn-sm" onclick="addChecklistItem('${catId}')">${icon('plus')} ${plainLabel(t('checklist.add'))}</button>
    ${isCustom ? `<button class="btn btn-sm btn-ghost" onclick="resetChecklist('${catId}')">${icon('undo')} ${plainLabel(t('checklist.reset'))}</button>` : ``}
  </div>`;
  return html;
}
function regionBadgesHTML(p){
  return (p.regionTags||[]).map(code=>{
    const label = REGION_CODES[code] || code;
    return `<span class="badge badge-region">${escapeHTML(label)}</span>`;
  }).join('');
}
function regionChipsHTML(p){
  return `<div class="chip-scroll" role="group" aria-label="${t('p.region')}">` + REGION_OPTIONS.map(([code,labelKey])=>{
    const active = (p.regionTags||[]).includes(code);
    return `<button type="button" class="chip ${active?'active':''}" aria-pressed="${active}" onclick="toggleRegionTag('${p.id}','${code}')">${t(labelKey)}</button>`;
  }).join('') + `</div>`;
}
function productBadgesHTML(p, opts){
  opts = opts || {};
  return `${p.standalone ? `<span class="badge badge-standalone">${t('badge.dual')}</span>` : ``}
    ${p.dlc ? `<span class="badge badge-dlc">DLC</span>` : ``}
    ${p.special ? `<span class="badge badge-special">${t('badge.special')}</span>` : ``}
    ${opts.noRegion ? '' : regionBadgesHTML(p)}
    ${p.existence!=='confirmado' ? `<span class="badge badge-unconfirmed">${existenceLabel(p.existence)}</span>` : ``}`;
}
/* La descripción de cada categoría se genera sola a partir de las
   plataformas/secciones que de verdad tiene dentro. */
function categoryAutoDesc(catId){
  const plats = getAllPlatforms().filter(p=>p.categoryId===catId);
  if(!plats.length) return t('cat.no_platforms');
  const names = plats.map(p=>escapeHTML(p.name));
  if(names.length<=3) return names.join(', ');
  return names.slice(0,3).join(', ') + ' ' + t('cat.and_more').replace('{n}', names.length-3);
}

/* Posesión: verde si lo tienes, amarillo pastel si además está precintado,
   neutro si no lo tienes. */
function possessClass(p){
  if(p.possession!=='tengo') return 'tone-not-have';
  return p.sealed ? 'tone-sealed' : 'tone-have';
}
function possessLabel(p){
  return p.possession==='tengo' ? (p.sealed ? t('p.have_sealed') : t('p.have_yes')) : t('p.have_no');
}
function possessButtonHTML(p, cls){
  return `<button type="button" class="${cls} ${possessClass(p)}" id="possess_${p.id}" aria-pressed="${p.possession==='tengo'}" onclick="event.stopPropagation(); quickTogglePossession('${p.id}')">${possessLabel(p)}</button>`;
}
/* Botón redondo de posesión de las portadas (v11.1): verde con ✓ si lo
   tienes, dorado con escudo si además está precintada, "+" si te falta.
   Hace lo mismo que el botón de siempre (quickTogglePossession). */
function possessDotIcon(p){ return icon(p.possession!=='tengo' ? 'plus' : (p.sealed ? 'shield' : 'check')); }
function possessDotHTML(p){
  const have = p.possession==='tengo';
  return `<button type="button" class="possess-dot ${possessClass(p)}" id="possess_${p.id}" aria-pressed="${have}" aria-label="${escapeHTML(t('cover.have_label').replace('{name}', p.name))}" title="${escapeHTML(plainLabel(possessLabel(p)))}" onclick="event.stopPropagation(); quickTogglePossession('${p.id}')">${possessDotIcon(p)}</button>`;
}
function coverStateClass(p){ return p.possession!=='tengo' ? 'is-missing' : (p.sealed ? 'is-sealed' : 'is-have'); }
function refreshPossessButton(id){
  const rec = EDITIONS_BY_ID[id]; if(!rec) return;
  const e = rec.edition;
  document.querySelectorAll('#possess_'+CSS.escape(id)).forEach(btn=>{
    btn.classList.remove('tone-have','tone-not-have','tone-sealed');
    btn.classList.add(possessClass(e));
    btn.setAttribute('aria-pressed', e.possession==='tengo');
    if(btn.classList.contains('possess-dot')){ btn.innerHTML = possessDotIcon(e); btn.title = plainLabel(possessLabel(e)); }
    else btn.textContent = possessLabel(e);
  });
  // la portada cambia de aspecto al momento (hueco discontinuo ↔ pieza que tienes)
  document.querySelectorAll('.cover-card[data-pid="'+CSS.escape(id)+'"]').forEach(card=>{
    card.classList.remove('is-have','is-missing','is-sealed');
    card.classList.add(coverStateClass(e));
  });
}

/* ---------- v11.1 «Vitrina»: color y código de cada plataforma ----------
   Se calculan a partir del código de la plataforma (GB, N64, SW…); no se
   guarda nada nuevo en tus datos. Mismo código → mismo color siempre; una
   plataforma nueva recibe un color estable de la misma paleta. Todos llevan
   texto blanco con contraste ≥ 5:1. */
const PLATFORM_COLORS = {
  GB:'#5b6e3c', GBC:'#7b4a8f', GBA:'#3f4f93', N64:'#2c6a5e', GC:'#5b4a94', NDS:'#5d6068', '3DS':'#8e3a3a',
  WII:'#46708a', WIIU:'#2f6f88', SW:'#a0413a', SW2:'#7a2f2b', MINI:'#8a6a2a', PICO:'#3b7a69', BEENA:'#6f5a28',
  PC:'#4a505c', COCO:'#6a6a3a', EVIO:'#5a4a6a', SUPE:'#6a5a8a', SFC:'#6a5a8a', STEE:'#5a6068', CODI:'#4b5a8a',
  ROM:'#7d5a2c', PCUS:'#56607a', SCOOP:'#7a4a5e', PCJP:'#8c4a2a', DVD:'#5e6b3a', PRES:'#7a3f3f', PREU:'#3f5a7a',
  FLIP:'#6b3f63', VHS:'#4a4a4f', DSVI:'#3a6a7a', NFR:'#6b5a2a', ARCA:'#8a3b52', RESE:'#4f5f6f', POKE:'#9a3a3a', TOY:'#9a3a3a',
};
const PLATFORM_FALLBACK = ['#5b6e3c','#3f4f93','#2c6a5e','#5b4a94','#8e3a3a','#46708a','#a0413a','#8a6a2a','#3b7a69','#7a4a5e','#8c4a2a','#3f5a7a','#6b3f63','#3a6a7a'];
const _platVisual = new Map();
function platVisual(platId){
  if(!platId) return { code:'', color:'#4a505c' };
  let v = _platVisual.get(platId);
  if(v) return v;
  const pl = getAllPlatforms().find(x=>x.id===platId);
  const raw = String((pl && (pl.code || pl.name)) || '').toUpperCase().replace(/[^0-9A-ZÀ-Þ]+/g, '');
  const code = raw.slice(0, 5);
  let color = PLATFORM_COLORS[code] || PLATFORM_COLORS[raw.slice(0, 4)];
  if(!color){
    let h = 0; for(let i=0;i<platId.length;i++) h = (h*31 + platId.charCodeAt(i)) >>> 0;
    color = PLATFORM_FALLBACK[h % PLATFORM_FALLBACK.length];
  }
  v = { code, color };
  if(pl) _platVisual.set(platId, v);   // el código de una plataforma no cambia (renombrar solo cambia el nombre)
  return v;
}

/* Insignias sobre la foto: tipo de edición y existencia sin confirmar */
function coverTagsHTML(p){
  const b = [];
  if(p.special) b.push(`<span class="cover-tag tag-special">${t('badge.special')}</span>`);
  if(p.dlc) b.push(`<span class="cover-tag tag-dlc">DLC</span>`);
  if(p.standalone) b.push(`<span class="cover-tag tag-dual">${t('badge.dual')}</span>`);
  if(p.existence && p.existence!=='confirmado') b.push(`<span class="cover-tag tag-unconf">${existenceLabel(p.existence)}</span>`);
  return b.length ? `<span class="cover-tags">${b.join('')}</span>` : '';
}

/* Tarjeta de pieza (cuadrícula) — v11.1 «tu foto primero»: la foto cuadrada
   es la protagonista (se voltea como siempre: tocar o deslizar); encima solo
   la plataforma y las insignias; debajo el nombre (abre la ficha) y el botón
   de posesión. Sin foto: el color de la plataforma y "Añadir foto". Si te
   falta: hueco con borde discontinuo. */
function productCardHTML(p, opts){
  opts = opts || {};
  const pv = platVisual(p.platformId);
  const anyPhoto = hasPhoto(p.id,'front') || hasPhoto(p.id,'back');
  const meta = [p.year, regionShortText(p), opts.showPlatform===false ? '' : p.platformName].filter(Boolean).map(escapeHTML).join(' · ');
  const cover = anyPhoto ? flipViewHTML(p)
    : `<button type="button" class="cover-empty" onclick="goProductPhotos('${p.id}')" aria-label="${escapeHTML(t('cover.add_photo_for').replace('{name}', p.name))}">${icon('camera')}<span class="cover-empty-txt">${t('cover.add_photo')}</span></button>`;
  return `<article class="title-card cover-card ${coverStateClass(p)}" data-pid="${escapeHTML(p.id)}" style="--plat:${pv.color}">
    <div class="cover">${cover}
      ${pv.code ? `<span class="cover-code" aria-hidden="true">${escapeHTML(pv.code)}</span>` : ''}
      <span class="cover-missing">${t('cover.missing')}</span>
      ${coverTagsHTML(p)}
    </div>
    <div class="cover-info">
      <button type="button" class="title-body" onclick="goProduct('${p.id}')">
        <span class="title-name">${escapeHTML(p.name)}</span>
        ${meta ? `<span class="title-meta">${meta}</span>` : ''}
      </button>
      ${possessDotHTML(p)}
    </div>
  </article>`;
}
/* Portada pequeña que abre la ficha (Recién añadidas, En la misma estantería) */
function miniCoverHTML(p){
  const pv = platVisual(p.platformId);
  const has = hasPhoto(p.id,'front');
  const meta = [p.year, regionShortText(p)].filter(Boolean).map(escapeHTML).join(' · ');
  return `<button type="button" class="mini-cover ${coverStateClass(p)}" style="--plat:${pv.color}" onclick="goProduct('${p.id}')">
    <span class="mini-photo">${has ? photoImgHTML(p,'front','thumb') : `<span class="mini-code">${escapeHTML(pv.code)}</span>`}
      ${has && pv.code ? `<span class="cover-code" aria-hidden="true">${escapeHTML(pv.code)}</span>` : ''}
      ${p.possession==='tengo' && p.sealed ? `<span class="cover-seal" title="${escapeHTML(t('wall.sealed'))}">${icon('shield')}</span>` : ''}
    </span>
    <span class="mini-name">${escapeHTML(p.name)}</span>
    ${meta ? `<span class="mini-meta">${meta}</span>` : ''}
  </button>`;
}
function productRowHTML(p, opts){
  opts = opts || {};
  const reg = regionShortText(p);
  const meta = [opts.showPlatform===false ? '' : p.platformName, p.year, reg].filter(Boolean).map(escapeHTML).join(' · ');
  const pv = platVisual(p.platformId);
  const thumb = (hasPhoto(p.id,'front') || hasPhoto(p.id,'back')) ? flipViewHTML(p, { hint:false })
    : `<span class="row-thumb-empty" style="--plat:${pv.color}" aria-hidden="true">${escapeHTML(pv.code)}</span>`;
  return `<div class="inv-item" onclick="goProduct('${p.id}')" role="link" tabindex="0" onkeydown="if(event.key==='Enter'){goProduct('${p.id}')}">
    ${thumb}
    <div class="inv-main">
      <div class="inv-name">${escapeHTML(p.name)}</div>
      <div class="inv-meta">${meta || '—'}</div>
      <div class="badge-row">${productBadgesHTML(p, { noRegion:true })}</div>
      ${opts.showId ? `<div class="inv-id">${escapeHTML(p.id)}</div>` : ''}
    </div>
    <div class="inv-side">${possessButtonHTML(p, 'possess-pill')}</div>
  </div>`;
}

function existenceLabel(v){
  return {confirmado:t('p.existence.confirmed'), probable:t('p.existence.probable'), sin_confirmar:t('p.existence.unconfirmed'), desconocido:t('p.existence.unknown')}[v] || escapeHTML(v);
}
function possessionLabel(v){
  return {tengo:t('poss.have'), no:t('poss.no'), en_camino:t('poss.incoming'), reservado:t('poss.reserved'), vendido:t('poss.sold'), perdido:t('poss.lost')}[v] || escapeHTML(v);
}

/* Campos editables: cada campo tiene su <label for> (accesible) y guarda al
   salir del campo (onchange). */
function editableField(type, label, value, onchangeAttr, placeholder, extra){
  const id = fieldId();
  return `<div class="field"><label for="${id}">${label}</label><input id="${id}" type="${type}" value="${escapeHTML(value||'')}" placeholder="${escapeHTML(placeholder||'')}" onchange="${onchangeAttr}" ${extra||''}></div>`;
}
function numberField(label, value, onchangeAttr){
  const id = fieldId();
  return `<div class="field"><label for="${id}">${label}</label><input id="${id}" type="number" inputmode="decimal" step="0.01" value="${value===null||value===undefined?'':value}" onchange="${onchangeAttr}"></div>`;
}
function editableTextarea(label, value, onchangeAttr){
  const id = fieldId();
  return `<div class="field"><label for="${id}">${label}</label><textarea id="${id}" onchange="${onchangeAttr}">${escapeHTML(value||'')}</textarea></div>`;
}
function editableSelect(label, value, options, onchangeAttr){
  const id = fieldId();
  const opts = options.map(([v,l])=>`<option value="${escapeHTML(v)}" ${v===value?'selected':''}>${l}</option>`).join('');
  return `<div class="field"><label for="${id}">${label}</label><select id="${id}" onchange="${onchangeAttr}">${opts}</select></div>`;
}
function conservationSelect(label, value, onchangeAttr){
  const opts = [['',t('p.cond_undefined')]].concat([1,2,3,4,5,6,7,8,9,10].map(n=>[String(n), String(n)]));
  const v = (value===null||value===undefined) ? '' : String(value);
  return editableSelect(label, v, opts, onchangeAttr);
}
/* v11.1: la casilla "Lo tengo" que trae la app de fábrica se muestra en el
   idioma elegido (si la has renombrado, se ve tal cual la escribiste) */
function checklistLabel(item){
  return (item.key==='tengo' && item.label==='Lo tengo') ? t('chk.default_have') : item.label;
}
function checkItem(label, checked, onchangeAttr, sealed, id, ic){
  return `<label class="check-item ${sealed?'sealed':''}">${ic ? `<span class="check-ico" aria-hidden="true">${icon(ic)}</span>` : ''}<span class="check-label">${label}</span><input type="checkbox" ${id?`id="${id}"`:''} ${checked?'checked':''} onchange="${onchangeAttr}"></label>`;
}
function customFieldsHTML(p){
  let html = '';
  (p.customFields||[]).forEach((f,idx)=>{
    const id = fieldId();
    html += `<div class="field"><label for="${id}">${escapeHTML(f.label)}
      <span class="field-inline-actions">
        <button type="button" class="mini-action" onclick="renameCustomField('${p.id}',${idx})">${icon('pencil')} ${t('checklist.rename')}</button>
        <button type="button" class="mini-action danger" onclick="removeCustomField('${p.id}',${idx})">${icon('x')} ${t('checklist.remove')}</button>
      </span></label>
      <input id="${id}" type="text" value="${escapeHTML(f.value||'')}" onchange="updateCustomField('${p.id}',${idx},this.value)"></div>`;
  });
  return html;
}
/* Chips del filtro rápido del Inventario (valores de siempre) */
function chip(label, val){
  const active = invState.filter===val;
  return `<button type="button" class="chip ${active?'active':''}" aria-pressed="${active}" onclick="invFilter('${val}')">${label}</button>`;
}
function segmentedHTML(options, current, onclickTpl, ariaLabel){
  return `<div class="segmented" role="group" aria-label="${escapeHTML(ariaLabel||'')}">` + options.map(([val, label, ic])=>{
    const active = val===current;
    return `<button type="button" class="seg-btn ${active?'active':''}" aria-pressed="${active}" onclick="${onclickTpl.replace('{v}', val)}" ${ic && !label ? `aria-label="${escapeHTML(ariaLabel||'')}: ${val}"` : ''}>${ic ? icon(ic) : ''}${label ? `<span>${label}</span>` : ''}</button>`;
  }).join('') + `</div>`;
}
/* Etiqueta accesible para los botones de vista */
function viewToggleHTML(current, onclickTpl, withWall){
  const b = (v, key, ic)=> `<button type="button" class="seg-btn ${current===v?'active':''}" aria-pressed="${current===v}" aria-label="${t(key)}" title="${t(key)}" onclick="${onclickTpl.replace('{v}',v)}">${icon(ic)}</button>`;
  return `<div class="segmented" role="group" aria-label="${t('view.label')}">
    ${b('grid','view.grid','covers')}${b('list','view.list','rows')}${withWall ? b('wall','view.wall','wall') : ''}
  </div>`;
}
