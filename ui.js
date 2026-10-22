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
  { id:'estanteria',    labelKey:'nav.estanteria',    icon:'cabinet' },   // v11.13: la estantería, en la barra
];
const SECONDARY_PAGES = { ayuda:'nav.ayuda', backup:'backup.kicker', gallery:'gallery.kicker', cuenta:'sync.title' };

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
  if(isPhotoEditorOpen()){ closePhotoEditor(null); try{ history.pushState({ coleccionApp:true, depth:viewHistory.length }, ''); }catch(e){} return; }
  if(!isViewerOpen() && v1119Overlay()){ v1119OverlayClose(); try{ history.pushState({ coleccionApp:true, depth:viewHistory.length }, ''); }catch(e){} return; }   // v11.19
  if(typeof estInspectOpen==='function' && estInspectOpen()){ estCloseInspect(); try{ history.pushState({ coleccionApp:true, depth:viewHistory.length }, ''); }catch(e){} return; }   // v11.11
  // v11.6: «¿Lo tengo?» — primero se cierra el resultado y, después, la cámara
  if(typeof isScannerOpen==='function' && isScannerOpen()){ scannerBack(); try{ history.pushState({ coleccionApp:true, depth:viewHistory.length }, ''); }catch(e){} return; }
  if(isViewerOpen() && isSheetOpen()){ closePhotoViewer(); try{ history.pushState({ coleccionApp:true, depth:viewHistory.length }, ''); }catch(e){} return; }   // v11.11
  if(isSheetOpen()){
    closeSheet();
    try{ history.pushState({ coleccionApp:true, depth:viewHistory.length }, ''); }catch(e){}
    return;
  }
  if(isViewerOpen()){ closePhotoViewer(); try{ history.pushState({ coleccionApp:true, depth:viewHistory.length }, ''); }catch(e){} return; }
  // v11.11.1: dentro de una balda, «atrás» vuelve al mueble entero
  if(typeof estBackLevel==='function' && estBackLevel()){ try{ history.pushState({ coleccionApp:true, depth:viewHistory.length }, ''); }catch(e){} return; }
  if(typeof invState!=='undefined' && invState.sel && view.page==='inventario' && !view.productId){ invPickMode(false); try{ history.pushState({ coleccionApp:true, depth:viewHistory.length }, ''); }catch(e){} return; }   // v11.19: «atrás» primero deja de elegir varias
  if(viewHistory.length){ goBack(); return; }
  // historial interno agotado (p. ej. más de 60 pasos): vuelve al inicio;
  // el siguiente "atrás" ya sale de la app, como en cualquier app Android
  if(view.page!=='dashboard'){ view = { page:'dashboard' }; pendingScrollY = 0; render(); }
});

/* Navegación entre pantallas */
function goPage(id){
  if(id==='estanteria' && typeof goEstanteria==='function'){ goEstanteria(); return; }   // v11.13: entra a pantalla completa
  pushHistory(); view = { page:id };
  if(id==='backup'){
    // al entrar, mensajes limpios y estado del almacenamiento al día
    backupStatusMsg = { everything:'', photos:'' };
    refreshStorageState(false).then(()=>{ const el=document.getElementById('storage-status'); if(el && view.page==='backup') el.outerHTML = storageStatusHTML(); });
  }
  if(id==='cuenta' && typeof syncOnOpen==='function') syncOnOpen();   // v11.9
  render();
}
function goCategory(catId){ pushHistory(); view = { page:'coleccion', categoryId:catId }; render(); }
function goPlatform(catId, platId){ pushHistory(); view = { page:'coleccion', categoryId:catId, platformId:platId }; render(); }
function goFolder(catId, platId, folderId){ pushHistory(); view = { page:'coleccion', categoryId:catId, platformId:platId, folderId:folderId }; render(); }
/* La ficha se abre DENTRO de la sección desde la que vienes (Colección,
   Inventario, Dashboard, Investigación…): así la barra de navegación sigue
   marcando dónde estabas, y "Volver" te devuelve allí. Si vienes de una
   lista, la ficha puede ir a la pieza anterior/siguiente de esa lista. */
function goProduct(prodId){
  const ctx = (currentListCtx && LIST_CONTEXTS.has(currentListCtx) && LIST_CONTEXTS.get(currentListCtx).ids.includes(prodId)) ? currentListCtx : null;
  pushHistory();
  view = Object.assign({}, view, { productId:prodId, navCtx:ctx });
  render();
}

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
  view = Object.assign({}, view, { productId: ctx.ids[j] });
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
let _lastScreenKey = '';
/* Cambios sin guardar: los campos guardan al perder el foco ("change"). Si se
   navega (atrás del sistema, pestañas, enlaces) con un campo aún editándose,
   se confirma antes de cambiar de pantalla para no perder lo escrito. */
function commitPendingEdit(){
  const a = document.activeElement;
  if(!a || !a.closest || !a.closest('#panel')) return;
  if(!a.matches('input[onchange]:not([type=file]):not([type=checkbox]):not([type=radio]), textarea[onchange]')) return;
  if(a.value !== a.defaultValue) a.blur();
}
/* v11.11: redibujar sin perder el foco del teclado (botón «Lo tengo», «+»/«−»
   de las copias…): se vuelve a poner en el mismo botón (o en `fallback`) */
async function renderKeepFocus(fallback){
  const a = document.activeElement;
  const key = a && a!==document.body ? (a.id ? '#' + CSS.escape(a.id) : (a.dataset && a.dataset.fk ? `[data-fk="${CSS.escape(a.dataset.fk)}"]` : null)) : null;
  await render();
  if(!key) return;
  const pick = sel=> sel ? [...document.querySelectorAll(sel)].find(el=> !el.disabled && el.offsetParent!==null) : null;
  const el = pick(key) || pick(fallback);
  if(el){ try{ el.focus({ preventScroll:true }); }catch(e){} }
}
async function render(){
  commitPendingEdit();
  if(typeof invState!=='undefined' && invState.sel && (view.page!=='inventario' || view.productId)) invState.sel = null;   // v11.19: «Elegir varias» se acaba al salir del Inventario
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
      actions:`<button class="btn primary" onclick="render()">${icon('refresh')} ${t('save.retry')}</button><button class="btn" onclick="goPage('dashboard')">${t('nav.dashboard')}</button>` });
  }
  clearTimeout(slow);
  if(mySeq !== renderSeq) return;   // ya se pidió otra pantalla: descartar
  panel.innerHTML = html;
  panel.removeAttribute('aria-busy');
  // v11.2: al cambiar de pantalla, entrada breve (no al redibujar la misma)
  const screenKey = [view.page, view.categoryId||'', view.platformId||'', view.folderId||'', view.productId||''].join('|');
  if(screenKey !== _lastScreenKey){
    _lastScreenKey = screenKey;
    panel.classList.remove('screen-enter'); void panel.offsetWidth; panel.classList.add('screen-enter');
  }
  delete document.body.dataset.rendering;
  updateFab();
  hydrate(panel);
  if(typeof invPickPaint==='function') invPickPaint(panel);   // v11.19: las elegidas, marcadas
  if(typeof estAfterRender==='function') estAfterRender();   // v11.11: la estantería 3D necesita su tamaño real
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
    case 'cuenta': return typeof renderCuenta==='function' ? renderCuenta() : renderDashboard();   // v11.9
    case 'gallery': return renderGallery();
    case 'estanteria': return renderEstanteria();   // v11.11
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
function unconfirmedCount(){ return typeof PRODUCTS!=='undefined' ? PRODUCTS.filter(p=> p.existence!=='confirmado').length : 0; }
function renderNav(){
  const items = (bottom)=> NAV.map(n=>{
    const active = view.page===n.id;
    // etiqueta corta opcional para la barra de abajo (en el móvil caben 6), con el nombre completo accesible;
    // arriba (escritorio) va siempre el nombre completo
    const lang = OVERRIDES.lang || 'es';
    const short = bottom && I18N[lang] && I18N[lang]['nav.short.'+n.id];
    const full = t(n.labelKey);
    // v11.22: en «Investigar», cuántas piezas quedan por confirmar (antes era un aviso en el Dashboard)
    const nb = n.id==='investigacion' ? unconfirmedCount() : 0;
    const name = nb ? full + ' — ' + t('nav.badge_unconfirmed').replace('{n}', nb) : full;
    const lbl = short || nb ? `aria-label="${escapeHTML(name)}" title="${escapeHTML(name)}"` : '';
    return `<button class="navitem ${active?'active':''}" ${active?'aria-current="page"':''} ${lbl} onclick="goPage('${n.id}')">${icon(n.icon,'navicon')}${nb ? `<span class="nav-badge" aria-hidden="true">${nb > 99 ? '99+' : nb}</span>` : ''}<span class="navlabel">${short || full}</span></button>`;
  }).join('');
  document.getElementById('bottomnav').innerHTML = items(true);
  document.getElementById('topnav').innerHTML = items(false);
}

/* Barra de contexto: "Volver" + ruta (migas). Solo aparece cuando estás
   dentro de algo (categoría, plataforma, ficha…) o en una pantalla que no
   está en la barra de navegación (Ayuda, Copia de seguridad, Galería). */
let _route = [];
function renderSubbar(){
  const bar = document.getElementById('subbar');
  const crumbs = document.getElementById('crumbs');
  const titleBtn = document.getElementById('subbarTitle');
  const deep = !!(view.categoryId || view.productId || SECONDARY_PAGES[view.page]);
  bar.hidden = !deep;
  _route = [];
  if(!deep){ crumbs.innerHTML = ''; if(titleBtn){ titleBtn.innerHTML = ''; titleBtn.removeAttribute('aria-label'); } return; }
  const nav = NAV.find(n=>n.id===view.page);
  const rootLabel = nav ? t(nav.labelKey) : t(SECONDARY_PAGES[view.page] || 'nav.dashboard');
  const p = view.productId && PRODUCTS_BY_ID[view.productId];
  // en la ficha, la ruta muestra dónde está la pieza (categoría / plataforma / carpeta)
  const catId = p ? p.categoryId : view.categoryId;
  const platId = p ? p.platformId : view.platformId;
  const folderId = p ? p.folderId : view.folderId;
  _route.push({ label:rootLabel, js:`goPage('${view.page}')`, ic: nav ? nav.icon : 'home' });
  if(catId && (view.page==='coleccion' || p)){
    const cat = getAllCategories().find(c=>c.id===catId);
    if(cat) _route.push({ label:cat.name, js:`goCategory('${cat.id}')`, ic:'layers' });
    const plat = platId && getAllPlatforms().find(x=>x.id===platId);
    if(plat) _route.push({ label:plat.name, js:`goPlatform('${catId}','${plat.id}')`, code: platVisual(plat.id) });
    const folder = plat && folderId && foldersForPlatform(platId).find(f=>f.id===folderId);
    if(folder) _route.push({ label:folder.name, js:`goFolder('${catId}','${platId}','${folder.id}')`, ic:'folder' });
  }
  if(p) _route.push({ label:p.name, ic:'box' });
  const last = _route.length - 1;
  const sep = `<span class="sep" aria-hidden="true">/</span>`;
  crumbs.innerHTML = _route.map((r,i)=> i===last
    ? `<span class="current" aria-current="page">${escapeHTML(r.label)}</span>`
    : `<button type="button" onclick="${r.js}">${escapeHTML(r.label)}</button>`).join(sep);
  if(titleBtn){
    titleBtn.innerHTML = `<span class="st-name">${escapeHTML(_route[last].label)}</span>${_route.length > 1 ? icon('chevronDown') : ''}`;
    titleBtn.disabled = _route.length < 2;
    titleBtn.setAttribute('aria-label', t('nav.path') + ': ' + _route.map(r=>r.label).join(' / '));
  }
  const back = document.getElementById('backBtn');
  if(back) back.setAttribute('aria-label', t('common.back'));
}
/* Ruta completa en una hoja (móvil): cada nivel lleva a su pantalla */
function openRouteSheet(){
  if(_route.length < 2) return;
  const last = _route.length - 1;
  const lead = (r)=> r.code ? `<span class="code-chip" style="--plat:${r.code.color}" aria-hidden="true">${escapeHTML(r.code.code)}</span>` : `<span class="route-ic" aria-hidden="true">${icon(r.ic || 'layers')}</span>`;
  const body = `<ol class="route-list">${_route.map((r,i)=> i===last
    ? `<li><span class="route-row is-current" aria-current="page">${lead(r)}<span class="route-name">${escapeHTML(r.label)}</span></span></li>`
    : `<li><button type="button" class="route-row" onclick="closeSheet(); ${r.js}">${lead(r)}<span class="route-name">${escapeHTML(r.label)}</span>${icon('chevronRight')}</button></li>`).join('')}</ol>`;
  openSheet({ kind:'route', title:t('nav.path'), body });
}

/* Botón flotante "+" — te sigue por la pantalla para no tener que bajar
   hasta el final de la página cada vez que quieres añadir algo. Su acción
   depende de dónde estés navegando en ese momento. */
function fabMode(){
  if(view.productId) return '';
  if(view.page==='coleccion' && view.platformId) return 'platform';    // pieza en esta plataforma (o carpeta)
  if(view.page==='coleccion' && view.categoryId) return 'category';    // plataforma en esta categoría
  // v11.2: en las pantallas principales, «Añadir pieza» eligiendo dónde va
  // (no durante el tour de bienvenida, que guía paso a paso, ni sin categorías)
  if(typeof tourActive!=='undefined' && tourActive) return '';
  if(['dashboard','coleccion','inventario','estadisticas','investigacion'].includes(view.page) && getAllCategories().length) return 'global';
  return '';
}
function updateFab(){
  const fab = document.getElementById('fab');
  if(!fab) return;
  const mode = fabMode();
  const label = mode==='category' ? t('fab.add_platform') : mode ? t('fab.add_product') : '';
  fab.style.display = label ? 'flex' : 'none';
  fab.innerHTML = icon('plus') + `<span class="fab-label">${escapeHTML(label)}</span>`;
  fab.title = label; fab.setAttribute('aria-label', label || '+');
  if(mode==='global') fab.setAttribute('aria-haspopup', 'dialog'); else fab.removeAttribute('aria-haspopup');
  document.body.classList.toggle('has-fab', !!label);
}
function fabAction(){
  const mode = fabMode();
  if(mode==='platform') addProductToPlatform(view.categoryId, view.platformId, view.folderId||null);
  else if(mode==='category') addPlatformToCategory(view.categoryId);
  else if(mode==='global') openQuickAdd();
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
   la primera vez que volteas la tarjeta. Las de los carruseles horizontales
   y las miniaturas de la ficha (pocas) se piden ya: en horizontal no
   "entran" en pantalla hasta deslizarlas y se verían vacías. */
let _photoObserver = null;
function hydratePhotos(root){
  const imgs = root.querySelectorAll('img[data-pid]:not([data-loaded])');
  const now = (img)=> img.dataset.eager || img.closest('.h-scroll');
  if(!('IntersectionObserver' in window)){ imgs.forEach(img=>{ if(img.dataset.side!=='back' || now(img)) loadLazyImg(img); }); return; }
  if(!_photoObserver){
    _photoObserver = new IntersectionObserver(entries=>{
      entries.forEach(en=>{ if(en.isIntersecting){ _photoObserver.unobserve(en.target); loadLazyImg(en.target); } });
    }, { rootMargin:'600px 0px' });
  }
  imgs.forEach(img=>{
    if(now(img)) loadLazyImg(img);
    else if(img.dataset.side!=='back') _photoObserver.observe(img);
  });
}
async function loadLazyImg(img){
  if(!img || img.dataset.loaded) return;
  img.dataset.loaded = '1';
  const url = await getPhotoURL(img.dataset.pid, img.dataset.side || 'front', img.dataset.size || 'thumb');
  if(!url){ img.remove(); return; }
  img.addEventListener('load', ()=> img.classList.add('is-loaded'), { once:true });
  img.addEventListener('error', ()=> img.classList.add('is-broken'), { once:true });
  img.src = url;
  if(img.complete && img.naturalWidth) img.classList.add('is-loaded');
}
function photoImgHTML(p, side, size, extra, photoId){
  // v11.11: photoId = de quién es la foto (la de una copia: <id>__c2); por defecto, la propia pieza
  const pid = photoId || p.id;
  const c = pid!==p.id ? copyForPhotoId(pid) : null;
  const label = escapeHTML(p.name) + (c ? ' — ' + escapeHTML(t('copy.n').replace('{n}', c.n)) : '') + ' — ' + escapeHTML(photoSideLabel(side));
  return `<img data-pid="${escapeHTML(pid)}" data-side="${side}" data-size="${size}" alt="${label}" ${extra||''}>`;
}
/* Foto de una pieza (v11.1.1). Solo se voltea si tiene foto trasera (tocar,
   deslizar o Intro/Espacio); si no, tocarla hace lo útil: en las rejillas
   abre la ficha (opts.tap 'open') y en la ficha la amplía (opts.tap 'zoom').
   Pellizcarla con dos dedos abre el visor ya ampliado, siguiendo el gesto. */
function flipViewHTML(p, opts){
  opts = opts || {};
  const size = opts.size || 'thumb';
  const pid = opts.photoId || p.id;   // v11.11: fotos de la mejor copia
  const hasFront = hasPhoto(pid,'front'), hasBack = hasPhoto(pid,'back');
  const ph = (key)=> `<span class="flip-placeholder">${icon('image')}<span class="ph-txt">${t(key)}</span></span>`;
  const front = hasFront ? photoImgHTML(p,'front',size,'',pid) : ph('p.no_photo_front');
  const back = hasBack ? photoImgHTML(p,'back',size, hasFront ? '' : 'data-eager="1"', pid) : ph('p.no_photo_back');
  const flippable = hasBack;
  const tap = flippable ? '' : (opts.tap || '');
  // el teclado llega a la foto solo si hace algo propio (en las rejillas, el nombre ya abre la ficha)
  const keyLabel = flippable ? t('photo.flip') : tap==='zoom' ? t('photo.enlarge') : '';
  return `<div class="flip-card${hasBack && !hasFront ? ' flipped' : ''}" ${keyLabel ? `role="button" tabindex="0" aria-label="${keyLabel}: ${escapeHTML(p.name)}"` : ''} data-flip-pid="${escapeHTML(p.id)}"${pid!==p.id ? ` data-photo-pid="${escapeHTML(pid)}"` : ''}${flippable ? ' data-flippable="1"' : ''}${tap ? ` data-tap="${tap}"` : ''}>
    <div class="flip-inner">
      <div class="flip-face flip-front">${front}</div>
      <div class="flip-face flip-back">${back}</div>
    </div>
    ${opts.hint===false || !flippable ? '' : `<div class="flip-hint" aria-hidden="true">${icon('flip')}</div>`}
  </div>`;
}
function flipCard(card){
  card.classList.toggle('flipped');
  if(card.classList.contains('flipped')){
    const img = card.querySelector('.flip-back img[data-pid]:not([data-loaded])');
    if(img) loadLazyImg(img);
  }
}
/* Toque, teclado y gestos sobre las fotos del panel (rejillas, listas y ficha) */
function photoTapAction(card){
  if(card.dataset.flippable==='1'){ flipCard(card); return true; }
  if(card.dataset.tap==='open'){ goProduct(card.dataset.flipPid); return true; }
  if(card.dataset.tap==='zoom'){ openPhotoViewer(card.dataset.photoPid || card.dataset.flipPid, card.classList.contains('flipped') ? 'back' : 'front'); return true; }
  return false;   // sin acción propia (miniatura de una fila): el toque llega a la fila
}
function attachFlipHandlers(){
  const panel = document.getElementById('panel');
  let touchStart = null;
  panel.addEventListener('click', (e)=>{
    const card = e.target.closest('.flip-card');
    if(!card) return;
    if(card.dataset.justSwiped==='1'){ card.dataset.justSwiped=''; e.preventDefault(); e.stopPropagation(); return; }
    if(typeof invState!=='undefined' && invState.sel && card.closest('#inv-results .inv-body')) return;   // v11.19: con «Elegir varias», tocar elige
    // voltear/abrir/ampliar nunca activa además la acción de la tarjeta o fila que la envuelve
    if(photoTapAction(card)){ e.preventDefault(); e.stopPropagation(); }
  }, true);
  panel.addEventListener('keydown', (e)=>{
    const card = e.target.closest && e.target.closest('.flip-card');
    if(!card || card!==e.target || (e.key!=='Enter' && e.key!==' ')) return;
    if(typeof invState!=='undefined' && invState.sel && card.closest('#inv-results .inv-body')) return;   // v11.19
    if(photoTapAction(card)){ e.preventDefault(); e.stopPropagation(); }
  }, true);
  panel.addEventListener('touchstart', (e)=>{
    const card = e.target.closest('.flip-card');
    if(!card) return;
    if(e.touches.length>=2){
      // dos dedos: se abre el visor con la foto justo donde está y el pellizco continúa allí
      touchStart = null;
      const side = card.classList.contains('flipped') ? 'back' : 'front';
      const face = card.querySelector(side==='back' ? '.flip-back img' : '.flip-front img');
      if(face && face.classList.contains('is-loaded')) openPhotoViewer(card.dataset.photoPid || card.dataset.flipPid, side, { fromImg:face, touches:e.touches });
      return;
    }
    const tt = e.touches[0];
    touchStart = { card, x:tt.clientX, y:tt.clientY };
  }, {passive:true});
  panel.addEventListener('touchend', (e)=>{
    if(!touchStart) return;
    const tt = e.changedTouches[0];
    const dx = tt.clientX - touchStart.x, dy = tt.clientY - touchStart.y;
    if(touchStart.card.dataset.flippable==='1' && Math.abs(dx) > 30 && Math.abs(dx) > Math.abs(dy)*1.4){
      touchStart.card.dataset.justSwiped = '1';
      const shouldFlip = dx>0 ? !touchStart.card.classList.contains('flipped') : touchStart.card.classList.contains('flipped');
      if(shouldFlip) flipCard(touchStart.card);
    }
    touchStart = null;
  }, {passive:true});
  panel.addEventListener('touchcancel', ()=>{ touchStart = null; }, {passive:true});
  attachListGestures(panel);   // v11.19
}
/* v11.19: en el Inventario, «Elegir varias» (tocar elige) y deslizar una fila
   (← «Lo tengo» / «Me falta», → «En camino»), solo con el dedo y solo en horizontal */
let _swClickBlock = 0;
function attachListGestures(panel){
  panel.addEventListener('click', (e)=>{
    if(Date.now() - _swClickBlock < 450 && e.target.closest && e.target.closest('.item-list .inv-item')){ e.preventDefault(); e.stopPropagation(); return; }
    if(typeof invPickClick==='function') invPickClick(e);
  }, true);
  panel.addEventListener('keydown', (e)=>{
    if(!invState.sel || (e.key!=='Enter' && e.key!==' ')) return;
    const it = e.target.closest && e.target.closest('#inv-results .inv-body [data-pid]');
    if(!it || (e.target!==it && !e.target.matches('button, [role="link"]'))) return;
    e.preventDefault(); e.stopPropagation(); invPickToggle(it.dataset.pid);
  }, true);
  panel.addEventListener('touchstart', (e)=>{
    if(e.touches.length!==1 || invState.sel || view.productId || view.page!=='inventario') return;
    const row = e.target.closest && e.target.closest('.item-list .inv-item');
    if(!row || !row.dataset.pid || e.target.closest('.flip-card, button, a, input, select, label')) return;
    const tt = e.touches[0];
    const sw = { row, pid:row.dataset.pid, x0:tt.clientX, y0:tt.clientY, dx:0, on:false };
    const move = (ev)=>{
      const q = ev.touches[0]; if(!q) return;
      const dx = q.clientX - sw.x0, dy = q.clientY - sw.y0;
      if(!sw.on){
        if(Math.abs(dy) > 10 && Math.abs(dy) >= Math.abs(dx)){ end(true); return; }
        if(Math.abs(dx) < 16 || Math.abs(dx) < Math.abs(dy) * 1.6) return;
        sw.on = true; row.classList.add('is-swiping');
      }
      ev.preventDefault();
      sw.dx = Math.max(-140, Math.min(140, dx));
      const p = PRODUCTS_BY_ID[sw.pid], dir = sw.dx < 0 ? 'left' : 'right';
      row.style.setProperty('--sx', sw.dx + 'px');
      row.dataset.sw = dir;
      row.dataset.swLabel = dir==='left' ? (p && p.possession==='tengo' ? t('swipe.missing') : t('swipe.have')) : (p && p.possession==='en_camino' ? t('swipe.missing') : t('swipe.coming'));
      row.classList.toggle('is-armed', Math.abs(sw.dx) >= 72);
    };
    const end = (cancel)=>{
      row.removeEventListener('touchmove', move); row.removeEventListener('touchend', onEnd); row.removeEventListener('touchcancel', onCancel);
      if(!sw.on) return;
      _swClickBlock = Date.now();
      const fire = !cancel && Math.abs(sw.dx) >= 72, dir = sw.dx < 0 ? 'left' : 'right';
      row.classList.remove('is-swiping', 'is-armed'); row.style.removeProperty('--sx'); delete row.dataset.sw; delete row.dataset.swLabel;
      if(fire && typeof swipeAction==='function') swipeAction(sw.pid, dir);
    };
    const onEnd = ()=> end(false), onCancel = ()=> end(true);
    row.addEventListener('touchmove', move, { passive:false });
    row.addEventListener('touchend', onEnd); row.addEventListener('touchcancel', onCancel);
  }, { passive:true });
}

/* ---------- Visor de fotos con zoom (v11.1.1) ----------
   Un único visor para todo (antes había un zoom "temporal" al pellizcar y un
   visor a pantalla completa que no dejaba ampliar):
   · Móvil: pellizca para ampliar (hasta 4×) y arrastra con un dedo para
     moverte; doble toque alterna tamaño normal ↔ 2,5×. Deslizar hacia abajo
     (sin ampliar) o tocar el fondo lo cierra.
   · Ordenador: rueda del ratón (o pellizco del trackpad), botones − / + o
     teclas + − 0; arrastra con el ratón y doble clic para alternar.
   · Delantera/trasera, ✕, Escape y "atrás" como siempre.
   Solo muestra: no cambia nada guardado. */
const VIEWER_MAX = 4;
const VIEWER_PAD = 72;              // hueco arriba (✕) y abajo (barra)
let viewerState = null;             // { pid, side, nw, nh, w0, h0, s, x, y }
let _viewerGesture = null;
let _viewerLastTap = null;
let _viewerReturnFocus = null;
function viewerEls(){ return { ov: document.getElementById('pinchOverlay'), img: document.getElementById('pinchImg') }; }
function touchDist(a, b){ return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1; }
function viewerFit(v){
  const maxW = Math.max(100, innerWidth - 24), maxH = Math.max(100, innerHeight - VIEWER_PAD*2);
  const f = Math.min(maxW / v.nw, maxH / v.nh);
  v.w0 = v.nw * f; v.h0 = v.nh * f;
}
function viewerRestY(v){ return (innerHeight - v.h0) / 2; }
function viewerClamp(v){
  const W = innerWidth, H = innerHeight, w = v.w0 * v.s, h = v.h0 * v.s;
  v.x = w <= W ? (W - w) / 2 : Math.min(0, Math.max(W - w, v.x));
  v.y = h <= H ? (H - h) / 2 : Math.min(0, Math.max(H - h, v.y));
}
function viewerApply(animate){
  const { ov, img } = viewerEls(); const v = viewerState;
  if(!img || !v) return;
  img.style.width = v.w0 + 'px'; img.style.height = v.h0 + 'px';
  img.classList.toggle('is-animating', !!animate);
  img.style.transform = `translate3d(${v.x}px, ${v.y}px, 0) scale(${v.s})`;
  ov.classList.toggle('is-zoomed', v.s > 1.01);
  const zo = document.getElementById('viewerZoomOut'), zi = document.getElementById('viewerZoomIn');
  if(zo) zo.disabled = v.s <= 1.01;
  if(zi) zi.disabled = v.s >= VIEWER_MAX - 0.01;
  viewerMarksPlace(animate);   // v11.19: las marcas siguen a la foto
}
function viewerZoomAt(s, cx, cy, animate){
  const v = viewerState; if(!v) return;
  s = Math.min(VIEWER_MAX, Math.max(1, s));
  const px = (cx - v.x) / v.s, py = (cy - v.y) / v.s;
  v.s = s; v.x = cx - px * s; v.y = cy - py * s;
  viewerClamp(v); viewerApply(animate);
}
function viewerZoomBy(f){ if(viewerState) viewerZoomAt(viewerState.s * f, innerWidth / 2, innerHeight / 2, true); }
function viewerReset(animate){ const v = viewerState; if(!v) return; v.s = 1; viewerClamp(v); viewerApply(animate); }
function viewerSetSrc(url, v){
  const { img } = viewerEls();
  const probe = new Image();
  probe.onload = ()=>{
    if(viewerState!==v) return;
    const nw = probe.naturalWidth || 1, nh = probe.naturalHeight || 1;
    img.src = url;
    if(Math.abs(nw/nh - v.nw/v.nh) > 0.01){           // otra proporción: se reajusta
      v.nw = nw; v.nh = nh; viewerFit(v);
      if(!_viewerGesture){ v.s = 1; viewerClamp(v); }
      viewerApply(false);
    }
  };
  probe.src = url;
}
async function openPhotoViewer(pid, side, opts){
  opts = opts || {};
  if(!side || !hasPhoto(pid, side)) side = hasPhoto(pid,'front') ? 'front' : 'back';
  const { ov, img } = viewerEls();
  const p = productForPhotoId(pid);   // v11.11: también las fotos de una copia (<id>__c2)
  if(!ov || !img || !p || !hasPhoto(pid, side)) return;
  if(!viewerState) _viewerReturnFocus = document.activeElement;   // al cambiar de cara, el foco vuelve igualmente al botón de origen
  const from = opts.fromImg;
  const v = { pid, side, nw:(from && from.naturalWidth) || 1, nh:(from && from.naturalHeight) || 1, w0:0, h0:0, s:1, x:0, y:0 };
  viewerState = v; _viewerGesture = null;
  viewerFit(v);
  if(from){
    // la foto sale del sitio y tamaño exactos donde la estás pellizcando
    const r = from.getBoundingClientRect();
    v.s = r.width / v.w0; v.x = r.left; v.y = r.top;
    img.src = from.src;
  } else {
    img.removeAttribute('src');
    viewerClamp(v);
  }
  const vc = pid!==p.id ? copyForPhotoId(pid) : null;
  img.alt = p.name + (vc ? ' — ' + t('copy.n').replace('{n}', vc.n) : '') + ' — ' + photoSideLabel(side);
  const close = document.getElementById('viewerClose'); close.hidden = false; close.setAttribute('aria-label', t('common.close'));
  // v11.3: todas las fotos de la pieza (delantera, trasera y extra); deslizar o ← → pasa de una a otra
  const sides = photoSidesFor(pid);
  const bar = document.getElementById('viewerBar');
  bar.hidden = false;
  bar.innerHTML = (sides.length > 1 ? `<span class="viewer-sides" role="group" aria-label="${escapeHTML(t('photo.photos'))}">` + sides.map(s=>`<button type="button" class="chip ${s===side?'active':''}" aria-pressed="${s===side}" onclick="openPhotoViewer('${escapeHTML(pid)}','${s}')">${escapeHTML(photoSideLabel(s))}</button>`).join('') + `</span>` : '')
    + `<span class="viewer-zoom"><button type="button" class="round-btn" id="viewerZoomOut" onclick="viewerZoomBy(1/1.6)" aria-label="${t('viewer.zoom_out')}" title="${t('viewer.zoom_out')}">${icon('minus')}</button>`
    + `<button type="button" class="round-btn" id="viewerZoomIn" onclick="viewerZoomBy(1.6)" aria-label="${t('viewer.zoom_in')}" title="${t('viewer.zoom_in')}">${icon('plus')}</button></span>`
    + `<button type="button" class="chip viewer-edit" id="viewerEdit" onclick="editViewerPhoto()">${icon('crop')} ${t('pe.edit')}</button>`
    + viewerMarksBtnHTML();   // v11.19: marcas de defectos
  ov.classList.add('is-open');
  ov.classList.toggle('is-over-sheet', isSheetOpen());   // v11.11: abierto desde una hoja (la de una copia): va por encima
  ov.setAttribute('role','dialog'); ov.setAttribute('aria-modal','true'); ov.setAttribute('aria-label', p.name + (vc ? ' — ' + t('copy.n').replace('{n}', vc.n) : ''));
  viewerApply(false);
  viewerListen(true);
  viewerExtrasSync();   // v11.19: marcas, pie de foto y, desde la galería, la pieza y su posición
  if(from && opts.touches && opts.touches.length>=2) viewerStartPinch(opts.touches, true);
  else close.focus();
  if(!from){ const thumb = await getPhotoURL(pid, side, 'thumb'); if(thumb && viewerState===v && !img.getAttribute('src')) viewerSetSrc(thumb, v); }
  const full = await getPhotoURL(pid, side, 'full'); if(full && viewerState===v) viewerSetSrc(full, v);
}
/* Siguiente / anterior foto de la misma pieza (sin ampliar) */
function viewerStep(dir){
  const v = viewerState; if(!v) return false;
  if(viewerList) return viewerListStep(dir);   // v11.19: desde la galería, la pieza siguiente / anterior
  const sides = photoSidesFor(v.pid);
  if(sides.length < 2) return false;
  const i = sides.indexOf(v.side);
  openPhotoViewer(v.pid, sides[(i + dir + sides.length) % sides.length]);
  return true;
}
function closePhotoViewer(){
  const { ov, img } = viewerEls();
  if(ov){ ov.classList.remove('is-open','is-zoomed','is-over-sheet'); ov.removeAttribute('role'); ov.removeAttribute('aria-modal'); }
  if(img){ img.removeAttribute('src'); img.style.transform = ''; img.classList.remove('is-animating'); }
  viewerState = null; _viewerGesture = null;
  viewerListen(false);
  viewerExtrasClear();   // v11.19
  if(_viewerReturnFocus && _viewerReturnFocus.focus && document.contains(_viewerReturnFocus)) try{ _viewerReturnFocus.focus(); }catch(e){}
  _viewerReturnFocus = null;
}
function isViewerOpen(){ return !!viewerState; }
/* ---------- Editor de foto (v11.4 · v11.5: recorte libre + margen · v11.7: perspectiva) ----------
   Se abre al subir una foto que no es cuadrada y desde «Editar» en el visor.
   · Se ve la foto entera con un marco de recorte: se estira por los lados y
     se mueve arrastrando desde dentro (con dos dedos, se agranda o achica).
     Lo de fuera se oscurece.
   · Libre: cada esquina se mueve por su cuenta (v11.7), así que el marco
     puede ser un trapecio para una caja fotografiada torcida: al guardar se
     endereza con sus proporciones reales. Mientras se arrastra una esquina
     sale una lupa. «Quitar» vuelve al rectángulo que la encierra.
   · Cuadrado: el marco es 1:1 (llena el cuadrado, como el antiguo
     «Recortar»). Entera: toda la foto.
   · Auto (v11.8): al abrir se busca la pieza (detectPieceQuad, en storage.js)
     y, si hay una clara, el marco se pone solo en sus bordes. «Tolerancia»
     lo amplía (coge más) o lo reduce (coge menos) igual por los cuatro lados.
     Tocar el marco pasa a Libre; «Quitar» vuelve a la foto entera.
   · Girar: 90° a la derecha cada vez.
   · Margen: blanco alrededor (0–20 % del lado). El recorte se centra en el
     cuadrado blanco y lo que falte se rellena en blanco.
   «Así quedará» es exactamente lo que se guarda (1200 × 1200). La vista usa
   una copia reducida; al guardar se usa la foto original.
   El marco se guarda en fracciones de la foto ya girada (0–1): e.rect es
   el rectángulo y, si hay perspectiva, e.quad las 4 esquinas (arriba-izq.,
   arriba-der., abajo-der., abajo-izq.); e.rect es entonces el rectángulo que
   las encierra. Sin perspectiva todo funciona exactamente como en la v11.5.
   v11.10:
   · Círculo: el óvalo que cabe en e.rect, con un punto en cada lado (cada
     punto mueve su lado; desde dentro se mueve entero; lupa al arrastrar).
     Al entrar con la foto entera se busca el disco (detectDiscEllipse, en
     storage.js) y, si no hay uno claro, sale centrado. Si queda ovalado, al
     guardar se estira hasta un círculo («Óvalo corregido»; «Quitar» lo deja
     con su forma: e.keepOval). Fuera del círculo, blanco.
   · Luz y color (pestaña): e.luz y e.sat de −100 a 100. Solo tocan la foto
     (el blanco sigue blanco). En pantalla se usa una copia ya ajustada de la
     vista reducida (e.prevAdj); al guardar se ajusta el cuadrado final.
     «Ver original» (mantener pulsado) enseña la foto sin luz ni color. */
const PE_PAD = 22;          // hueco alrededor de la foto para que se vean y se agarren las asas
const PE_HIT = 24;          // radio para agarrar una esquina (px)
const PE_EDGE = 16;         // distancia para agarrar un lado (px)
const PE_MIN = 36;          // tamaño mínimo del marco en pantalla (px)
const PE_MAX_MARGIN = 20;   // %
const PE_LOUPE_R = 48;      // radio de la lupa (px)
const PE_LOUPE_ZOOM = 2.5;
const PE_TOL_LESS = 0.03, PE_TOL_MORE = 0.06;   // Tolerancia: hasta un 3 % hacia dentro y un 6 % hacia fuera
let photoEditor = null;
function isPhotoEditorOpen(){ return !!photoEditor; }
function peDims(e){ return e.rot % 2 ? { W:e.h, H:e.w } : { W:e.w, H:e.h }; }
function peRectPx(e, W, H){ const r = e.rect; return { x:r.x * W, y:r.y * H, w:r.w * W, h:r.h * H }; }
function peClamp(v, a, b){ return Math.max(a, Math.min(b, v)); }
/* Marco en px de pantalla (relativo a la esquina de la foto) ↔ fracciones */
function peFrame(e){ const L = e.lay, r = e.rect; return { X:r.x * L.dw, Y:r.y * L.dh, W:r.w * L.dw, H:r.h * L.dh }; }
function peSetFrame(e, f){
  const L = e.lay;
  e.rect = { x:f.X / L.dw, y:f.Y / L.dh, w:f.W / L.dw, h:f.H / L.dh };
}
/* ---- Esquinas libres (v11.7) ---- */
function peQuadOf(e){
  if(e.quad) return e.quad;
  const r = e.rect, x1 = r.x + r.w, y1 = r.y + r.h;
  return [[r.x, r.y], [x1, r.y], [x1, y1], [r.x, y1]];
}
function peQuadPx(e, W, H){ return peQuadOf(e).map(p=>[p[0] * W, p[1] * H]); }
function peQuadScreen(e){ const L = e.lay; return peQuadOf(e).map(p=>[p[0] * L.dw, p[1] * L.dh]); }
/* Fija las esquinas (px de pantalla). Si vuelven a formar un rectángulo recto,
   el marco vuelve a ser un rectángulo normal. */
function peSetQuadScreen(e, pts){
  const L = e.lay, q = pts.map(p=>[peClamp(p[0], 0, L.dw) / L.dw, peClamp(p[1], 0, L.dh) / L.dh]);
  if(q[0][1] === q[1][1] && q[3][1] === q[2][1] && q[0][0] === q[3][0] && q[1][0] === q[2][0]){
    e.quad = null;
    e.rect = { x:q[0][0], y:q[0][1], w:q[1][0] - q[0][0], h:q[3][1] - q[0][1] };
    return;
  }
  const xs = q.map(p=>p[0]), ys = q.map(p=>p[1]);
  const x0 = Math.min(...xs), y0 = Math.min(...ys);
  e.quad = q;
  e.rect = { x:x0, y:y0, w:Math.max(...xs) - x0, h:Math.max(...ys) - y0 };
  e.mode = 'free';
}
/* Igual, con las esquinas ya en fracciones de la foto girada (Auto) */
function peSetQuadNorm(e, q){
  q = q.map(p=>[peClamp(p[0], 0, 1), peClamp(p[1], 0, 1)]);
  if(q[0][1] === q[1][1] && q[3][1] === q[2][1] && q[0][0] === q[3][0] && q[1][0] === q[2][0]){
    e.quad = null; e.rect = { x:q[0][0], y:q[0][1], w:q[1][0] - q[0][0], h:q[3][1] - q[0][1] };
    return;
  }
  const xs = q.map(p=>p[0]), ys = q.map(p=>p[1]), x0 = Math.min(...xs), y0 = Math.min(...ys);
  e.quad = q; e.rect = { x:x0, y:y0, w:Math.max(...xs) - x0, h:Math.max(...ys) - y0 };
}
/* ---- Auto (v11.8) ----
   e.det: undefined = buscando; null = no hay una pieza clara; { q } = sus 4
   esquinas en fracciones de la foto girada. e.tol: el deslizador (0–100, 50 = justo). */
function peTolValue(v){ v = Number(v); return v < 50 ? -PE_TOL_LESS * (50 - v) / 50 : PE_TOL_MORE * (v - 50) / 50; }
function peTolLabel(v){
  const p = Math.round(peTolValue(v) * 100);
  if(!p) return t('pe.tol_exact');
  return (p > 0 ? '+' : '−') + pePercent(Math.abs(p));
}
/* El marco de la pieza encontrada, ampliado o reducido igual por los cuatro lados (en píxeles de la foto) */
function peAutoQuad(e){
  const { W, H } = peDims(e), q = e.det.q.map(p=>[p[0] * W, p[1] * H]);
  const d = (a, b)=>Math.hypot(a[0] - b[0], a[1] - b[1]);
  const wr = Math.max(d(q[0], q[1]), d(q[3], q[2])), hr = Math.max(d(q[0], q[3]), d(q[1], q[2]));
  let off = peTolValue(e.tol) * Math.max(wr, hr);
  if(off < 0) off = Math.max(off, -0.3 * Math.min(wr, hr));   // una pieza muy estrecha no se da la vuelta
  if(!off) return e.det.q.map(p=>p.slice());
  const M = homographyFromPoints([[0, 0], [wr, 0], [wr, hr], [0, hr]], q);
  if(!M) return e.det.q.map(p=>p.slice());
  const map = (x, y)=>{ const z = M[6] * x + M[7] * y + 1; return [(M[0] * x + M[1] * y + M[2]) / z / W, (M[3] * x + M[4] * y + M[5]) / z / H]; };
  return [map(-off, -off), map(wr + off, -off), map(wr + off, hr + off), map(-off, hr + off)];
}
function peApplyAuto(e){
  if(!e.det) return false;
  if(e.mode === 'circle') peLeaveCircle(e);   // v11.10
  e.mode = 'auto'; e.sel = -1;
  peSetQuadNorm(e, peAutoQuad(e));
  return true;
}
/* Pasa el resultado del detector (píxeles de la foto sin girar) a fracciones de la foto girada */
function peDetToNorm(e, r){
  let q = r.quad.map(p=>[p[0] / e.w, p[1] / e.h]);
  for(let k = 0; k < e.rot; k++) q = [3, 0, 1, 2].map(i=>[1 - q[i][1], q[i][0]]);
  return q;
}
/* v11.10: dos búsquedas posibles, la de Auto ('auto') y la del disco ('disc') */
function peShowScan(e, on, kind){
  kind = kind || 'auto';
  if(kind === 'auto') e.scanning = !!on; else e.scanningDisc = !!on;
  const any = e.scanning || e.scanningDisc, lab = t(e.scanningDisc && (kind === 'disc' || !e.scanning) ? 'pe.scanning_disc' : 'pe.scanning');
  const sc = e.root.querySelector('#peScan'); if(sc) sc.hidden = !any;
  const sl = e.root.querySelector('.pe-scan-label'); if(sl && any && sl.textContent !== lab) sl.textContent = lab;
  const st = e.root.querySelector('#peStatus'); if(st) st.textContent = any ? lab : '';
}
/* Busca la pieza (una vez por foto). Si el usuario aún no ha tocado nada, la aplica. */
async function peRunDetect(e, preset){
  if(typeof detectPieceQuad !== 'function'){ e.det = null; return; }
  let r = preset;
  if(r === undefined){
    peShowScan(e, e.autoApply);   // al editar una foto ya guardada se busca sin tapar nada
    // primero se pinta el editor; luego se busca
    await new Promise(res=>requestAnimationFrame(()=>setTimeout(res, 0)));
    if(photoEditor !== e) return;
    try{ r = await detectPieceQuad(e.src, e.w, e.h); }catch(_){ r = null; }
    if(photoEditor !== e) return;
    peShowScan(e, false);
  }
  e.det = r ? { q:peDetToNorm(e, r), persp:!!r.persp } : null;
  // se aplica solo si nadie ha tocado el marco (ni lo está tocando ahora) y, al
  // editar una foto ya guardada, solo si se pidió con Auto
  const free = !e.touched && !e.pointers.size && !e.drag;
  const apply = e.wantAuto || (e.autoApply && free);
  if(e.det && apply) peApplyAuto(e);
  if(e.det === null && (e.wantAuto || (e.autoApply && free))) e.noneShown = e.wantAuto ? 'short' : 'whole';
  e.wantAuto = false;
  peDraw();
}
/* Al soltar: si casi es un rectángulo recto (menos de 1 px), se endereza el marco */
function peSnapQuad(e){
  if(!e.quad || !e.lay) return;
  const p = peQuadScreen(e), T = 0.75;
  if(Math.abs(p[0][1] - p[1][1]) <= T && Math.abs(p[3][1] - p[2][1]) <= T && Math.abs(p[0][0] - p[3][0]) <= T && Math.abs(p[1][0] - p[2][0]) <= T){
    e.quad = null;   // e.rect ya es el rectángulo que lo encierra
  }
}
function peCross(o, a, b){ return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); }
function peSegDist(p, a, b){
  const vx = b[0] - a[0], vy = b[1] - a[1], l2 = vx * vx + vy * vy || 1;
  const t = peClamp(((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / l2, 0, 1);
  return { d:Math.hypot(p[0] - a[0] - t * vx, p[1] - a[1] - t * vy), t };
}
/* ¿Vale este marco? Dentro de la foto, sin cruzarse (convexo, en su orden) y
   con un tamaño mínimo por todas partes. pts en px de pantalla. */
function peQuadOk(e, pts, noMin){
  const L = e.lay, MIN = Math.min(PE_MIN, L.dw, L.dh) * 0.6, eps = 0.01;
  for(const p of pts) if(p[0] < -eps || p[1] < -eps || p[0] > L.dw + eps || p[1] > L.dh + eps) return false;
  for(let i = 0; i < 4; i++) if(peCross(pts[i], pts[(i + 1) % 4], pts[(i + 2) % 4]) <= 0) return false;
  if(noMin) return true;
  for(let i = 0; i < 4; i++){
    for(const j of [(i + 1) % 4, (i + 2) % 4]){
      if(j === i || (j + 1) % 4 === i) continue;
      if(peSegDist(pts[i], pts[j], pts[(j + 1) % 4]).d < MIN) return false;
    }
  }
  return true;
}
/* De `from` (el marco actual) hacia `to`: lo más lejos que se pueda llegar sin
   romper el marco. Si el actual ya es más pequeño que el mínimo (por ejemplo,
   tras girar el móvil la foto se ve más pequeña), solo se exige que siga dentro
   de la foto y sin cruzarse, para que las esquinas no se queden bloqueadas. */
function peQuadTowards(e, from, to){
  const noMin = !peQuadOk(e, from);
  if(peQuadOk(e, to, noMin)) return to;
  const mix = t=>from.map((p, i)=>[p[0] + (to[i][0] - p[0]) * t, p[1] + (to[i][1] - p[1]) * t]);
  let lo = 0, hi = 1;
  for(let k = 0; k < 18; k++){ const m = (lo + hi) / 2; if(peQuadOk(e, mix(m), noMin)) lo = m; else hi = m; }
  return mix(lo);
}
function peQuadCorner(e, pts, i, x, y){
  const L = e.lay, to = pts.map(p=>p.slice());
  to[i] = [peClamp(x, 0, L.dw), peClamp(y, 0, L.dh)];
  return peQuadTowards(e, pts, to);
}
/* Un lado se desplaza en perpendicular (s px hacia fuera; negativo, hacia dentro) */
function peQuadEdge(e, q0, j, s){
  const a = q0[j], b = q0[(j + 1) % 4], len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const nx = (b[1] - a[1]) / len, ny = -(b[0] - a[0]) / len;
  return q0.map((p, i)=>(i === j || i === (j + 1) % 4) ? [p[0] + nx * s, p[1] + ny * s] : p.slice());
}
function peQuadMove(e, q0, dx, dy){
  const L = e.lay, xs = q0.map(p=>p[0]), ys = q0.map(p=>p[1]);
  const mx = peClamp(dx, -Math.min(...xs), L.dw - Math.max(...xs)), my = peClamp(dy, -Math.min(...ys), L.dh - Math.max(...ys));
  return q0.map(p=>[p[0] + mx, p[1] + my]);
}
function peQuadScale(e, q0, f){
  const cx = q0.reduce((s, p)=>s + p[0], 0) / 4, cy = q0.reduce((s, p)=>s + p[1], 0) / 4;
  return q0.map(p=>[cx + (p[0] - cx) * f, cy + (p[1] - cy) * f]);
}
function pePercent(n){
  try{ return new Intl.NumberFormat(OVERRIDES.lang || 'es', { style:'percent', maximumFractionDigits:0 }).format(n / 100); }
  catch(_){ return n + ' %'; }
}
/* ---- Luz y color (v11.10) ---- */
function peAdj(e){ return { luz:e.luz, sat:e.sat }; }
function peAdjOn(e){ return !!(e.luz || e.sat); }
/* La vista reducida con la luz y el color aplicados (se rehace solo si cambian).
   fast: mientras se mueve un deslizador se usa una copia de 800 px (cuatro
   veces menos trabajo); al soltarlo se rehace a tamaño completo, que es lo
   que enseña bien la lupa. */
function peAdjusted(e, fast){
  const key = e.luz + ':' + e.sat;
  let base = e.prev, slot = 'prevAdj';
  if(fast){
    if(!e.prevSmall){
      const f = Math.min(1, 800 / Math.max(e.prev.width, e.prev.height));
      if(f >= 1) e.prevSmall = e.prev;
      else {
        const s = document.createElement('canvas');
        s.width = Math.max(1, Math.round(e.prev.width * f)); s.height = Math.max(1, Math.round(e.prev.height * f));
        const sx = s.getContext('2d'); sx.imageSmoothingQuality = 'high'; sx.drawImage(e.prev, 0, 0, s.width, s.height);
        e.prevSmall = s;
      }
    }
    base = e.prevSmall; slot = 'prevAdjS';
  }
  if(e[slot] && e[slot + 'Key'] === key) return e[slot];
  const c = e[slot] || document.createElement('canvas');
  c.width = base.width; c.height = base.height;
  const x = c.getContext('2d');
  x.drawImage(base, 0, 0);
  try{ applyPhotoAdjust(x, c.width, peAdj(e), c.height); }catch(_){}
  e[slot] = c; e[slot + 'Key'] = key;
  return c;
}
/* Lo que se ve en pantalla: con luz y color, salvo mientras se pulsa «Ver original» */
function pePhotoSource(e){
  if(!peAdjOn(e) || e.showOrig) return e.prev;
  const full = e.prevAdj && e.prevAdjKey === e.luz + ':' + e.sat;
  return peAdjusted(e, e.adjFast && !full);
}
function peAdjLabel(v){ return !v ? t('pe.adj_normal') : (v > 0 ? '+' : '−') + Math.abs(v); }
/* La foto (girada) en su sitio de la pantalla */
function peDrawPhoto(ctx, e){
  const L = e.lay;
  ctx.save();
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.translate(L.ox + L.dw / 2, L.oy + L.dh / 2); ctx.rotate(e.rot * Math.PI / 2);
  const iw = e.rot % 2 ? L.dh : L.dw, ih = e.rot % 2 ? L.dw : L.dh;
  ctx.drawImage(pePhotoSource(e), -iw / 2, -ih / 2, iw, ih);
  ctx.restore();
}
function peDraw(){
  const e = photoEditor; if(!e || !e.lay) return;
  if(e.raf){ cancelAnimationFrame(e.raf); e.raf = 0; }
  const L = e.lay, dpr = L.dpr;
  const ctx = e.canvas.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, e.canvas.width, e.canvas.height);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  peDrawPhoto(ctx, e);
  if(e.mode === 'square') peDrawRectFrame(ctx, e);
  else if(e.mode === 'circle') peDrawCircleFrame(ctx, e);
  else peDrawQuadFrame(ctx, e);
  peDrawResult(e);
}
/* ---- Círculo (v11.10) ---- */
/* El óvalo en pantalla: centro, radios y los 4 puntos (arriba, derecha, abajo, izquierda) */
function peEllipseScreen(e){
  const L = e.lay, f = peFrame(e), rx = f.W / 2, ry = f.H / 2, cx = L.ox + f.X + rx, cy = L.oy + f.Y + ry;
  return { cx, cy, rx, ry, pts:{ n:[cx, cy - ry], e:[cx + rx, cy], s:[cx, cy + ry], w:[cx - rx, cy] } };
}
/* ¿Está ovalado? (en píxeles de la foto, más de un 1,5 % de diferencia entre ancho y alto) */
function peIsOval(e){
  const { W, H } = peDims(e), w = e.rect.w * W, h = e.rect.h * H;
  return Math.abs(w - h) > 0.015 * Math.max(w, h);
}
function peDrawCircleFrame(ctx, e){
  const L = e.lay, E = peEllipseScreen(e), rx = Math.max(0.5, E.rx), ry = Math.max(0.5, E.ry);
  const oval = ()=>ctx.ellipse(E.cx, E.cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.beginPath(); ctx.rect(L.ox, L.oy, L.dw, L.dh); oval();
  ctx.fillStyle = 'rgba(5,6,10,0.62)'; ctx.fill('evenodd');
  // mientras se arrastra, el cuadro que lo encierra (ayuda a ver qué lado se mueve)
  if(e.drag){
    const f = peFrame(e);
    ctx.strokeStyle = 'rgba(241,237,227,0.3)'; ctx.lineWidth = 1;
    ctx.strokeRect(L.ox + f.X + 0.5, L.oy + f.Y + 0.5, Math.max(0, f.W - 1), Math.max(0, f.H - 1));
  }
  ctx.strokeStyle = 'rgba(241,237,227,0.9)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); oval(); ctx.stroke();
  // cruz del centro
  const k = Math.min(6, rx / 4, ry / 4);
  ctx.strokeStyle = 'rgba(241,237,227,0.75)'; ctx.lineWidth = 1.5; ctx.lineCap = 'butt';
  ctx.beginPath(); ctx.moveTo(E.cx - k, E.cy); ctx.lineTo(E.cx + k, E.cy); ctx.moveTo(E.cx, E.cy - k); ctx.lineTo(E.cx, E.cy + k); ctx.stroke();
  // los 4 puntos, como las esquinas de Libre
  const active = e.drag && E.pts[e.drag.h] ? e.drag.h : null;
  for(const n of ['n', 'e', 's', 'w']){
    const on = n === active, r = on ? 12 : 9, p = E.pts[n];
    ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, Math.PI * 2);
    ctx.fillStyle = on ? 'rgba(241,237,227,0.35)' : 'rgba(5,6,10,0.35)'; ctx.fill();
    ctx.lineWidth = 2.5; ctx.strokeStyle = '#f1ede3'; ctx.stroke();
  }
  if(active) peDrawLoupeAt(ctx, e, E.pts[active], ()=>{ ctx.beginPath(); oval(); });
}
/* ¿Qué se agarra en el círculo? Un punto (n/e/s/w) > dentro ('move') > nada */
function peHitCircle(e, px, py){
  const E = peEllipseScreen(e);
  let best = null, bd = Infinity;
  for(const n of ['n', 'e', 's', 'w']){ const p = E.pts[n], d = Math.hypot(px - p[0], py - p[1]); if(d <= PE_HIT && d < bd){ bd = d; best = n; } }
  const nx = (px - E.cx) / Math.max(1, E.rx), ny = (py - E.cy) / Math.max(1, E.ry), inside = nx * nx + ny * ny <= 1;
  // con un círculo pequeño los puntos lo tapan casi entero: cerca del centro se mueve
  if(best && !(inside && Math.hypot(px - E.cx, py - E.cy) < bd)) return best;
  return inside ? 'move' : null;
}
/* Círculo centrado (el 80 % del lado corto de la foto) */
function peCircleCentered(e){
  const { W, H } = peDims(e), s = 0.8 * Math.min(W, H);
  e.rect = { x:(W - s) / 2 / W, y:(H - s) / 2 / H, w:s / W, h:s / H };
}
/* El disco encontrado (píxeles de la foto sin girar) en fracciones de la foto girada */
function peDiscRect(e, d){
  let r = { x:(d.cx - d.rx) / e.w, y:(d.cy - d.ry) / e.h, w:2 * d.rx / e.w, h:2 * d.ry / e.h };
  for(let k = 0; k < e.rot; k++) r = { x:1 - (r.y + r.h), y:r.x, w:r.h, h:r.w };
  // si se sale un poco de la foto, se achica alrededor de su centro sin deformarlo
  const cx = peClamp(r.x + r.w / 2, 0.005, 0.995), cy = peClamp(r.y + r.h / 2, 0.005, 0.995);
  const f = Math.min(1, 2 * cx / r.w, 2 * (1 - cx) / r.w, 2 * cy / r.h, 2 * (1 - cy) / r.h);
  const w = Math.max(0.01, r.w * f), h = Math.max(0.01, r.h * f);
  return { x:peClamp(cx - w / 2, 0, 1 - w), y:peClamp(cy - h / 2, 0, 1 - h), w, h };
}
/* Busca el disco (una vez por foto) y, si no se ha tocado el círculo, lo pone encima */
async function peRunDisc(e){
  if(e.discBusy){ peShowScan(e, true, 'disc'); return; }   // ya se está buscando (se había salido de Círculo)
  if(typeof detectDiscEllipse !== 'function'){ e.disc = null; return; }
  e.discBusy = true;
  peShowScan(e, true, 'disc');
  await new Promise(res=>requestAnimationFrame(()=>setTimeout(res, 0)));
  let r = null;
  if(photoEditor === e){ try{ r = await detectDiscEllipse(e.src, e.w, e.h); }catch(_){ r = null; } }
  e.discBusy = false;
  if(photoEditor !== e) return;
  peShowScan(e, false, 'disc');
  e.disc = r || null;
  peApplyDiscResult(e);
  peDraw();
}
/* Al salir de Círculo: la búsqueda del disco sigue sin tapar la foto y su resultado ya no mueve nada */
function peLeaveCircle(e){
  e.circleFresh = false;
  if(e.scanningDisc) peShowScan(e, false, 'disc');
}
/* Si el círculo sigue como se puso (no lo has movido), va al disco encontrado.
   Con un dedo apoyado se espera a que lo levantes. */
function peApplyDiscResult(e){
  if(e.mode !== 'circle' || !e.circleFresh || e.disc === undefined || e.discBusy || e.pointers.size || e.drag) return false;
  if(e.disc) e.rect = peDiscRect(e, e.disc);
  else e.noneShown = 'disc';
  e.circleFresh = false;
  return true;
}
/* Cuadrado: el marco de siempre, con esquinas en L */
function peDrawRectFrame(ctx, e){
  const L = e.lay;
  // fuera del marco, oscurecido
  const f = peFrame(e), fx = L.ox + f.X, fy = L.oy + f.Y;
  ctx.beginPath(); ctx.rect(L.ox, L.oy, L.dw, L.dh); ctx.rect(fx, fy, f.W, f.H);
  ctx.fillStyle = 'rgba(5,6,10,0.62)'; ctx.fill('evenodd');
  // marco y cuadrícula de tercios
  ctx.strokeStyle = 'rgba(241,237,227,0.9)'; ctx.lineWidth = 1;
  ctx.strokeRect(fx + 0.5, fy + 0.5, Math.max(0, f.W - 1), Math.max(0, f.H - 1));
  ctx.strokeStyle = e.drag ? 'rgba(241,237,227,0.55)' : 'rgba(241,237,227,0.22)';
  ctx.beginPath();
  for(let i = 1; i < 3; i++){
    const gx = Math.round(fx + f.W * i / 3) + 0.5, gy = Math.round(fy + f.H * i / 3) + 0.5;
    ctx.moveTo(gx, fy); ctx.lineTo(gx, fy + f.H); ctx.moveTo(fx, gy); ctx.lineTo(fx + f.W, gy);
  }
  ctx.stroke();
  // asas: esquinas en L
  ctx.strokeStyle = '#f1ede3'; ctx.lineWidth = 3; ctx.lineCap = 'butt'; ctx.lineJoin = 'miter';
  const o = 1.5, len = Math.min(20, f.W / 2, f.H / 2) + o;
  const x0 = fx - o, y0 = fy - o, x1 = fx + f.W + o, y1 = fy + f.H + o;
  ctx.beginPath();
  ctx.moveTo(x0, y0 + len); ctx.lineTo(x0, y0); ctx.lineTo(x0 + len, y0);
  ctx.moveTo(x1 - len, y0); ctx.lineTo(x1, y0); ctx.lineTo(x1, y0 + len);
  ctx.moveTo(x1, y1 - len); ctx.lineTo(x1, y1); ctx.lineTo(x1 - len, y1);
  ctx.moveTo(x0 + len, y1); ctx.lineTo(x0, y1); ctx.lineTo(x0, y1 - len);
  ctx.stroke();
}
/* Libre y Entera: cuatro esquinas que se mueven por su cuenta y un asa en cada lado */
function peDrawQuadFrame(ctx, e){
  const L = e.lay, P = peQuadScreen(e).map(p=>[L.ox + p[0], L.oy + p[1]]);
  const poly = ()=>{ ctx.moveTo(P[0][0], P[0][1]); for(let i = 1; i < 4; i++) ctx.lineTo(P[i][0], P[i][1]); ctx.closePath(); };
  ctx.beginPath(); ctx.rect(L.ox, L.oy, L.dw, L.dh); poly();
  ctx.fillStyle = 'rgba(5,6,10,0.62)'; ctx.fill('evenodd');
  // cuadrícula de tercios, en perspectiva
  const M = homographyFromPoints([[0, 0], [1, 0], [1, 1], [0, 1]], P);
  if(M){
    const map = (x, y)=>{ const z = M[6] * x + M[7] * y + 1; return [(M[0] * x + M[1] * y + M[2]) / z, (M[3] * x + M[4] * y + M[5]) / z]; };
    ctx.strokeStyle = e.drag ? 'rgba(241,237,227,0.55)' : 'rgba(241,237,227,0.22)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for(let i = 1; i < 3; i++){
      const t = i / 3, a = map(t, 0), b = map(t, 1), c = map(0, t), d = map(1, t);
      ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.moveTo(c[0], c[1]); ctx.lineTo(d[0], d[1]);
    }
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(241,237,227,0.9)'; ctx.lineWidth = 1.5; ctx.lineJoin = 'round';
  ctx.beginPath(); poly(); ctx.stroke();
  // asas de los lados: una barra corta en medio de cada lado, por fuera
  ctx.strokeStyle = '#f1ede3'; ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath();
  for(let j = 0; j < 4; j++){
    const a = P[j], b = P[(j + 1) % 4], len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const tx = (b[0] - a[0]) / len, ty = (b[1] - a[1]) / len, nx = ty * 1.5, ny = -tx * 1.5;
    const mx = (a[0] + b[0]) / 2 + nx, my = (a[1] + b[1]) / 2 + ny, k = Math.min(12, len / 5);
    ctx.moveTo(mx - tx * k, my - ty * k); ctx.lineTo(mx + tx * k, my + ty * k);
  }
  ctx.stroke();
  // esquinas: un círculo que se agarra y se lleva donde haga falta
  const active = e.drag && e.drag.corner != null ? e.drag.corner : e.sel;
  for(let i = 0; i < 4; i++){
    const on = i === active, r = on ? 12 : 9;
    ctx.beginPath(); ctx.arc(P[i][0], P[i][1], r, 0, Math.PI * 2);
    ctx.fillStyle = on ? 'rgba(241,237,227,0.35)' : 'rgba(5,6,10,0.35)'; ctx.fill();
    ctx.lineWidth = 2.5; ctx.strokeStyle = '#f1ede3'; ctx.stroke();
  }
  if(e.drag && e.drag.corner != null) peDrawLoupe(ctx, e, P, e.drag.corner);
}
/* Lupa: la zona de la esquina, ampliada, encima del dedo */
function peDrawLoupe(ctx, e, P, i){
  peDrawLoupeAt(ctx, e, P[i], ()=>{ ctx.beginPath(); ctx.moveTo(P[0][0], P[0][1]); for(let k = 1; k < 4; k++) ctx.lineTo(P[k][0], P[k][1]); ctx.closePath(); });
}
/* v11.10: la misma lupa en cualquier punto c; outline() traza el marco (esquinas o círculo) */
function peDrawLoupeAt(ctx, e, c, outline){
  const L = e.lay, R = PE_LOUPE_R, Z = PE_LOUPE_ZOOM, gap = 34;
  let cx = c[0], cy = c[1] - R - gap;
  if(cy - R < 4){ cy = c[1]; cx = c[0] < L.cw / 2 ? c[0] + R + gap : c[0] - R - gap; }
  cx = peClamp(cx, R + 4, L.cw - R - 4); cy = peClamp(cy, R + 4, L.ch - R - 4);
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = '#05060a'; ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
  ctx.translate(cx, cy); ctx.scale(Z, Z); ctx.translate(-c[0], -c[1]);
  peDrawPhoto(ctx, e);
  ctx.strokeStyle = 'rgba(241,237,227,0.9)'; ctx.lineWidth = 1.2 / Z;
  outline(); ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = '#e0876a'; ctx.lineWidth = 1.2; ctx.lineCap = 'butt';
  ctx.beginPath(); ctx.moveTo(cx - 12, cy); ctx.lineTo(cx - 4, cy); ctx.moveTo(cx + 4, cy); ctx.lineTo(cx + 12, cy);
  ctx.moveTo(cx, cy - 12); ctx.lineTo(cx, cy - 4); ctx.moveTo(cx, cy + 4); ctx.lineTo(cx, cy + 12); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.lineWidth = 3; ctx.strokeStyle = '#f1ede3'; ctx.stroke();
}
function peRequestDraw(){ const e = photoEditor; if(e && !e.raf) e.raf = requestAnimationFrame(()=>{ e.raf = 0; if(photoEditor === e) peDraw(); }); }
/* Botones, tamaño del recorte y «Así quedará» */
function peDrawResult(e){
  e.root.querySelectorAll('[data-pe-mode]').forEach(b=>{ const on = b.dataset.peMode===e.mode; b.classList.toggle('active', on); b.setAttribute('aria-pressed', on); });
  const { W, H } = peDims(e), px = peRectPx(e, W, H);
  const circle = e.mode === 'circle';
  const persp = !!e.quad && !circle, auto = e.mode === 'auto' && !!e.det, oval = circle && peIsOval(e);
  const chip = e.root.querySelector('#pePersp'); if(chip) chip.hidden = !persp || auto;
  const achip = e.root.querySelector('#peAuto'); if(achip) achip.hidden = !auto;
  const ochip = e.root.querySelector('#peOval');
  if(ochip){
    ochip.hidden = !oval;
    const ot = e.root.querySelector('#peOvalText'), ob = e.root.querySelector('#peOvalBtn');
    const tx = t(e.keepOval ? 'pe.oval_kept' : 'pe.oval'), bt = t(e.keepOval ? 'pe.oval_fix' : 'pe.persp_off');
    if(ot && ot.textContent !== tx) ot.textContent = tx;
    if(ob && ob.textContent !== bt){ ob.textContent = bt; ob.setAttribute('aria-label', t(e.keepOval ? 'pe.oval_fix_label' : 'pe.oval_off_label')); }
  }
  const hint = e.root.querySelector('.pe-hint');
  if(hint){
    hint.hidden = (persp || auto || oval) && !e.noneShown;
    const ht = e.noneShown ? t(e.noneShown === 'disc' ? 'pe.disc_none' : e.noneShown === 'short' ? 'pe.auto_none_short' : 'pe.auto_none')
                           : t(e.mode === 'square' ? 'pe.hint' : circle ? 'pe.hint_circle' : 'pe.hint_free');
    if(hint.textContent !== ht) hint.textContent = ht;
  }
  const tol = e.root.querySelector('#peTolRow'); if(tol) tol.hidden = !auto;
  const note0 = e.root.querySelector('#peMarginNote'); if(note0) note0.hidden = auto;
  const tr = e.root.querySelector('#peTol'); if(tr && Number(tr.value) !== e.tol) tr.value = e.tol;
  const tv = e.root.querySelector('#peTolVal'); if(tv) tv.textContent = peTolLabel(e.tol);
  const size = e.root.querySelector('#peSize');
  if(size){
    let st;
    if(circle && !e.keepOval) st = 'Ø ' + Math.round(Math.max(px.w, px.h)) + ' px';
    else { const o = persp ? quadOutputSize(peQuadPx(e, W, H), W, H) : { w:px.w, h:px.h }; st = Math.round(o.w) + ' × ' + Math.round(o.h) + ' px'; }
    if(size.textContent !== st) size.textContent = st;
  }
  const m = Math.round(e.margin * 100);
  const val = e.root.querySelector('#peMarginVal'); if(val) val.textContent = pePercent(m);
  const note = e.root.querySelector('#peMarginNote'); if(note) note.textContent = t(circle ? 'pe.margin_note_circle' : 'pe.margin_note').replace('{px}', Math.round(PHOTO_SIZE * e.margin));
  const range = e.root.querySelector('#peMargin'); if(range && Number(range.value) !== m) range.value = m;
  peDrawLight(e);
  const pv = e.root.querySelector('#pePreview'); if(!pv) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const P = Math.max(1, Math.round((pv.clientWidth || 112) * dpr));
  if(pv.width !== P){ pv.width = P; pv.height = P; }
  const pw = e.prev.width, ph = e.prev.height, Wp = e.rot % 2 ? ph : pw, Hp = e.rot % 2 ? pw : ph;
  const pc = pv.getContext('2d');
  if(circle) drawPhotoEllipse(pc, P, e.prev, pw, ph, e.rot, peRectPx(e, Wp, Hp), e.margin, !e.keepOval);
  else if(persp) drawPhotoQuad(pc, P, e.prev, pw, ph, e.rot, peQuadPx(e, Wp, Hp), e.margin);
  else drawPhotoFramed(pc, P, e.prev, pw, ph, e.rot, peRectPx(e, Wp, Hp), e.margin);
  // la luz y el color, igual que al guardar: sobre el cuadrado ya montado
  if(peAdjOn(e) && !e.showOrig){ try{ applyPhotoAdjust(pc, P, peAdj(e)); }catch(_){} }
}
/* Pestañas y la de «Luz y color» */
function peDrawLight(e){
  const r = e.root;
  r.querySelectorAll('[data-pe-tab]').forEach(b=>{ const on = b.dataset.peTab === e.tab; b.classList.toggle('active', on); b.setAttribute('aria-selected', on); b.tabIndex = on ? 0 : -1; });
  const pc = r.querySelector('#pePanelCrop'); if(pc) pc.hidden = e.tab !== 'crop';
  const pl = r.querySelector('#pePanelLight'); if(pl) pl.hidden = e.tab !== 'light';
  const on = peAdjOn(e);
  const dot = r.querySelector('#peTabDot'); if(dot) dot.hidden = !on;
  for(const [k, id] of [['luz', 'peLuz'], ['sat', 'peSat']]){
    const v = e[k], inp = r.querySelector('#' + id), lab = r.querySelector('#' + id + 'Val'), tx = peAdjLabel(v);
    if(inp){ if(Number(inp.value) !== v) inp.value = v; if(inp.getAttribute('aria-valuetext') !== tx) inp.setAttribute('aria-valuetext', tx); }
    if(lab && lab.textContent !== tx) lab.textContent = tx;
  }
  const cmp = r.querySelector('#peCompare');
  if(cmp){ cmp.hidden = e.tab !== 'light'; cmp.disabled = !on; cmp.classList.toggle('active', !!e.showOrig && on); cmp.setAttribute('aria-pressed', !!e.showOrig && on); }
  const rs = r.querySelector('#peAdjReset'); if(rs) rs.disabled = !on;
}
function peLayout(){
  const e = photoEditor; if(!e) return;
  const c = e.canvas, cw = c.clientWidth, ch = c.clientHeight;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const BW = Math.max(1, Math.round(cw * dpr)), BH = Math.max(1, Math.round(ch * dpr));
  if(c.width !== BW || c.height !== BH){ c.width = BW; c.height = BH; }
  const { W, H } = peDims(e);
  const s = Math.max(0.0001, Math.min((cw - 2 * PE_PAD) / W, (ch - 2 * PE_PAD) / H));
  const dw = W * s, dh = H * s, old = e.lay;
  e.lay = { dpr, cw, ch, dw, dh, ox:(cw - dw) / 2, oy:(ch - dh) / 2 };
  // v11.10: si la foto cambia de tamaño o de sitio a mitad de un arrastre (la
  // tarjeta de abajo cambia de alto), el arrastre se recoloca: el punto que
  // llevas sigue debajo del dedo
  const d = e.drag, L = e.lay;
  if(d && old && old.dw > 0 && old.dh > 0 && Math.abs(old.dw / old.dh - dw / dh) < 1e-6 && (old.dw !== dw || old.ox !== L.ox || old.oy !== L.oy)){
    const k = dw / old.dw;
    if(d.f0) d.f0 = { X:d.f0.X * k, Y:d.f0.Y * k, W:d.f0.W * k, H:d.f0.H * k };
    if(d.q0) d.q0 = d.q0.map(p=>[p[0] * k, p[1] * k]);
    if(d.x0 != null){ d.x0 = L.ox + (d.x0 - old.ox) * k; d.y0 = L.oy + (d.y0 - old.oy) * k; }
    // y el marco se recalcula ya con el dedo donde está (una vez por movimiento,
    // para que un aviso que aparece y desaparece no lo deje rebotando)
    if(!d.reapplied){ d.reapplied = true; peDragTo(e); }
  }
  peDraw();
}
/* ¿Qué se agarra en (px, py)? esquina > lado > dentro ('move') > nada.
   Cuadrado: nw/ne/se/sw (cambian el tamaño). Libre y Entera: c0…c3 (esquina
   libre). Lados: n/e/s/w con el marco rectangular, e0…e3 con perspectiva. */
const PE_CORNER_INDEX = { nw:0, ne:1, se:2, sw:3 };
function peHit(e, px, py){
  const L = e.lay; if(!L) return null;
  if(e.mode === 'circle') return peHitCircle(e, px, py);
  if(e.quad) return peHitQuad(e, px, py);
  const f = peFrame(e), x0 = L.ox + f.X, y0 = L.oy + f.Y, x1 = x0 + f.W, y1 = y0 + f.H;
  let best = null, bd = Infinity;
  [['nw',x0,y0],['ne',x1,y0],['se',x1,y1],['sw',x0,y1]].forEach(([n,cx,cy])=>{
    const d = Math.max(Math.abs(px - cx), Math.abs(py - cy));
    if(d <= PE_HIT && d < bd){ bd = d; best = n; }
  });
  if(best) return e.mode === 'square' ? best : 'c' + PE_CORNER_INDEX[best];
  if(e.mode !== 'square'){
    const inX = px > x0 && px < x1, inY = py > y0 && py < y1;
    const cands = [];
    if(inX && Math.abs(py - y0) <= PE_EDGE) cands.push(['n', Math.abs(py - y0)]);
    if(inX && Math.abs(py - y1) <= PE_EDGE) cands.push(['s', Math.abs(py - y1)]);
    if(inY && Math.abs(px - x0) <= PE_EDGE) cands.push(['w', Math.abs(px - x0)]);
    if(inY && Math.abs(px - x1) <= PE_EDGE) cands.push(['e', Math.abs(px - x1)]);
    if(cands.length) return cands.sort((a, b)=>a[1] - b[1])[0][0];
  }
  return (px > x0 && px < x1 && py > y0 && py < y1) ? 'move' : null;
}
function peHitQuad(e, px, py){
  const L = e.lay, P = peQuadScreen(e).map(p=>[L.ox + p[0], L.oy + p[1]]), pt = [px, py];
  let best = null, bd = Infinity;
  P.forEach((c, i)=>{ const d = Math.hypot(px - c[0], py - c[1]); if(d <= PE_HIT && d < bd){ bd = d; best = 'c' + i; } });
  if(best) return best;
  for(let j = 0; j < 4; j++){
    const s = peSegDist(pt, P[j], P[(j + 1) % 4]);
    if(s.d <= PE_EDGE && s.t > 0.05 && s.t < 0.95 && s.d < bd){ bd = s.d; best = 'e' + j; }
  }
  if(best) return best;
  for(let i = 0; i < 4; i++) if(peCross(P[i], P[(i + 1) % 4], pt) < 0) return null;
  return 'move';
}
const PE_CURSORS = { nw:'nwse-resize', se:'nwse-resize', ne:'nesw-resize', sw:'nesw-resize', n:'ns-resize', s:'ns-resize', w:'ew-resize', e:'ew-resize', move:'move',
  c0:'crosshair', c1:'crosshair', c2:'crosshair', c3:'crosshair', e0:'ns-resize', e1:'ew-resize', e2:'ns-resize', e3:'ew-resize' };
/* Aplica un arrastre (dx, dy en px de pantalla) al marco de partida f0 */
function peDragFrame(e, h, f0, dx, dy){
  const L = e.lay, dw = L.dw, dh = L.dh, MIN = Math.min(PE_MIN, dw, dh);
  let X = f0.X, Y = f0.Y, W = f0.W, H = f0.H;
  if(h === 'move'){
    X = peClamp(X + dx, 0, dw - W); Y = peClamp(Y + dy, 0, dh - H);
  } else if(e.mode === 'square'){
    const sx = h.indexOf('w') >= 0 ? -1 : 1, sy = h.indexOf('n') >= 0 ? -1 : 1;
    const ax = sx < 0 ? X + W : X, ay = sy < 0 ? Y + H : Y;
    const maxS = Math.min(sx < 0 ? ax : dw - ax, sy < 0 ? ay : dh - ay);
    const sd = peClamp(W + (sx * dx + sy * dy) / 2, Math.min(MIN, maxS), maxS);
    X = sx < 0 ? ax - sd : ax; Y = sy < 0 ? ay - sd : ay; W = sd; H = sd;
  } else {
    if(h.indexOf('w') >= 0){ const r = X + W, nx = peClamp(X + dx, 0, r - MIN); W = r - nx; X = nx; }
    if(h.indexOf('e') >= 0){ W = peClamp(W + dx, MIN, dw - X); }
    if(h.indexOf('n') >= 0){ const b = Y + H, ny = peClamp(Y + dy, 0, b - MIN); H = b - ny; Y = ny; }
    if(h.indexOf('s') >= 0){ H = peClamp(H + dy, MIN, dh - Y); }
  }
  return { X, Y, W, H };
}
/* Agranda (f > 1) o achica el marco alrededor de su centro, sin salirse de la foto */
function peScaleFrame(e, f0, f){
  const L = e.lay, MIN = Math.min(PE_MIN, L.dw, L.dh);
  f = Math.min(f, L.dw / f0.W, L.dh / f0.H);
  f = Math.max(f, MIN / Math.min(f0.W, f0.H));
  const W = Math.min(L.dw, f0.W * f), H = Math.min(L.dh, f0.H * f);
  const cx = f0.X + f0.W / 2, cy = f0.Y + f0.H / 2;
  return { X:peClamp(cx - W / 2, 0, L.dw - W), Y:peClamp(cy - H / 2, 0, L.dh - H), W, H };
}
/* Cualquier cambio del marco deja de ser «Entera» (salvo que siga siendo la foto entera) */
function peAfterFrameChange(e){
  e.touched = true; e.noneShown = false; e.circleFresh = false;
  if(e.mode === 'auto') e.mode = 'free';
  if(e.quad){ e.mode = 'free'; return; }
  if(e.mode === 'whole'){
    const r = e.rect, eps = 1e-6;
    if(r.x > eps || r.y > eps || r.w < 1 - eps || r.h < 1 - eps) e.mode = 'free';
  }
}
function openPhotoEditor(opts){
  return new Promise(resolve=>{
    if(photoEditor) closePhotoEditor(null);
    const src = opts.source;
    const w = src.naturalWidth || src.width, h = src.naturalHeight || src.height;
    const f = Math.min(1, 1600 / Math.max(w, h));
    const prev = document.createElement('canvas');
    prev.width = Math.max(1, Math.round(w * f)); prev.height = Math.max(1, Math.round(h * f));
    const pc = prev.getContext('2d'); pc.imageSmoothingQuality = 'high'; pc.drawImage(src, 0, 0, prev.width, prev.height);
    const root = document.createElement('div');
    root.id = 'photoEditor'; root.className = 'photo-editor';
    root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-labelledby', 'peTitle');
    root.innerHTML = `
      <div class="pe-head">
        <button type="button" class="btn btn-ghost pe-cancel" onclick="closePhotoEditor(null)">${t('modal.cancel')}</button>
        <span class="pe-title" id="peTitle">${t('pe.title')}</span>
        <button type="button" class="btn primary pe-save" id="peSave" onclick="savePhotoEditor()">${t('pe.save')}</button>
      </div>
      <div class="pe-stage"><canvas class="pe-canvas" tabindex="0" role="img" aria-label="${escapeHTML(t('pe.canvas_label'))}"></canvas><div class="pe-scan" id="peScan" hidden><span class="pe-scan-line"></span><span class="pe-scan-label">${t('pe.scanning')}</span></div></div>
      <span class="sr-only" id="peStatus" role="status" aria-live="polite"></span>
      <div class="pe-tools">
        <div class="pe-row pe-row-modes">
          <div class="segmented pe-modes" role="group" aria-label="${escapeHTML(t('pe.shape'))}">
            <button type="button" class="seg-btn" data-pe-mode="auto" onclick="setPhotoEditorMode('auto')">${t('pe.auto')}</button>
            <button type="button" class="seg-btn" data-pe-mode="free" onclick="setPhotoEditorMode('free')">${t('pe.free')}</button>
            <button type="button" class="seg-btn" data-pe-mode="square" onclick="setPhotoEditorMode('square')">${t('pe.square')}</button>
            <button type="button" class="seg-btn" data-pe-mode="circle" onclick="setPhotoEditorMode('circle')">${t('pe.circle')}</button>
            <button type="button" class="seg-btn" data-pe-mode="whole" onclick="setPhotoEditorMode('whole')">${t('pe.fit')}</button>
          </div>
        </div>
        <div class="pe-row pe-info">
          <div class="pe-info-main">
            <p class="pe-hint">${t('pe.hint_free')}</p>
            <div class="pe-persp pe-auto" id="peAuto" hidden>${icon('autocrop')}<span class="pe-persp-text">${t('pe.auto_found')}</span><button type="button" class="pe-persp-off" onclick="photoEditorAutoOff()" aria-label="${escapeHTML(t('pe.auto_off_label'))}">${t('pe.persp_off')}</button></div>
            <div class="pe-persp" id="pePersp" hidden>${icon('perspective')}<span class="pe-persp-text">${t('pe.persp')}</span><button type="button" class="pe-persp-off" onclick="photoEditorFlatten()" aria-label="${escapeHTML(t('pe.persp_off_label'))}">${t('pe.persp_off')}</button></div>
            <div class="pe-persp pe-oval" id="peOval" hidden>${icon('oval')}<span class="pe-persp-text" id="peOvalText">${t('pe.oval')}</span><button type="button" class="pe-persp-off" id="peOvalBtn" onclick="photoEditorOvalToggle()" aria-label="${escapeHTML(t('pe.oval_off_label'))}">${t('pe.persp_off')}</button></div>
            <span class="pe-size" id="peSize"></span>
          </div>
          <button type="button" class="btn pe-rotate" id="peRotate" onclick="rotatePhotoEditor()" aria-label="${escapeHTML(t('pe.rotate'))}">${icon('rotate')}<span class="pe-rotate-label">${t('pe.rotate')}</span></button>
        </div>
        <div class="pe-result">
          <div class="segmented pe-tabs" role="tablist" aria-label="${escapeHTML(t('pe.tabs'))}">
            <button type="button" class="seg-btn" role="tab" id="peTabCrop" data-pe-tab="crop" aria-controls="pePanelCrop" onclick="photoEditorTab('crop')">${t('pe.tab_crop')}</button>
            <button type="button" class="seg-btn" role="tab" id="peTabLight" data-pe-tab="light" aria-controls="pePanelLight" onclick="photoEditorTab('light')">${icon('light')}${t('pe.tab_light')}<span class="pe-tab-dot" id="peTabDot" hidden></span></button>
          </div>
          <div class="pe-result-body">
            <div class="pe-result-prev">
              <canvas class="pe-preview" id="pePreview" role="img" aria-label="${escapeHTML(t('pe.result'))}"></canvas>
              <span>${t('pe.result')}</span>
              <button type="button" class="pe-compare" id="peCompare" aria-pressed="false" title="${escapeHTML(t('pe.adj_compare_label'))}" hidden disabled>${icon('eye')}<span>${t('pe.adj_compare')}</span></button>
            </div>
            <div class="pe-margin pe-panel" id="pePanelCrop" role="tabpanel" aria-labelledby="peTabCrop">
              <div class="pe-tol" id="peTolRow" hidden>
                <div class="pe-margin-top"><label for="peTol">${t('pe.tol')}</label><span class="pe-margin-val" id="peTolVal"></span></div>
                <input type="range" class="pe-range" id="peTol" min="0" max="100" step="1" value="50" oninput="photoEditorTolerance(this.value)" aria-describedby="peTolEnds">
                <div class="pe-tol-ends" id="peTolEnds"><span>${t('pe.tol_less')}</span><span>${t('pe.tol_more')}</span></div>
              </div>
              <div class="pe-margin-top"><label for="peMargin">${t('pe.margin')}</label><span class="pe-margin-val" id="peMarginVal"></span></div>
              <input type="range" class="pe-range" id="peMargin" min="0" max="${PE_MAX_MARGIN}" step="1" value="0" oninput="photoEditorMargin(this.value)">
              <p class="pe-note" id="peMarginNote"></p>
            </div>
            <div class="pe-margin pe-panel pe-light" id="pePanelLight" role="tabpanel" aria-labelledby="peTabLight" hidden>
              <div class="pe-margin-top"><label for="peLuz">${t('pe.light')}</label><span class="pe-margin-val" id="peLuzVal"></span></div>
              <div class="pe-center"><input type="range" class="pe-range" id="peLuz" min="-100" max="100" step="1" value="0" oninput="photoEditorAdjust('luz', this.value)" aria-describedby="peLuzEnds"></div>
              <div class="pe-tol-ends" id="peLuzEnds"><span>${t('pe.light_less')}</span><span>${t('pe.light_more')}</span></div>
              <div class="pe-margin-top"><label for="peSat">${t('pe.sat')}</label><span class="pe-margin-val" id="peSatVal"></span></div>
              <div class="pe-center"><input type="range" class="pe-range" id="peSat" min="-100" max="100" step="1" value="0" oninput="photoEditorAdjust('sat', this.value)" aria-describedby="peSatEnds"></div>
              <div class="pe-tol-ends" id="peSatEnds"><span>${t('pe.sat_less')}</span><span>${t('pe.sat_more')}</span></div>
              <button type="button" class="pe-adj-reset" id="peAdjReset" onclick="photoEditorAdjustReset()" disabled>${t('pe.adj_reset')}</button>
            </div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(root);
    photoEditor = { src, prev, w, h, rot:0, mode:'whole', rect:{ x:0, y:0, w:1, h:1 }, quad:null, sel:-1, margin:0, resolve, root,
      canvas: root.querySelector('.pe-canvas'), pointers: new Map(), drag:null, lay:null, raf:0, returnFocus: document.activeElement,
      det:undefined, tol:50, touched:false, scanning:false, wantAuto:false, noneShown:false, autoApply: opts.autoApply !== false,
      // v11.10: pestaña, luz y color, círculo
      tab:'crop', luz:0, sat:0, showOrig:false, prevAdj:null, prevAdjKey:'', prevSmall:null, prevAdjS:null, prevAdjSKey:'', adjFast:false, adjTimer:0,
      disc:undefined, discBusy:false, scanningDisc:false, circleFresh:false, keepOval:false, ro:null };
    const e = photoEditor;
    peBind(e);
    peBindLight(e);
    window.addEventListener('resize', peLayout);
    // v11.10: si la tarjeta de abajo cambia de alto (pestañas, Tolerancia), la foto se recoloca
    if(typeof ResizeObserver === 'function'){
      try{ e.ro = new ResizeObserver(()=>{ if(photoEditor === e) peLayout(); }); e.ro.observe(e.canvas); }catch(_){ e.ro = null; }
    }
    peLayout();
    requestAnimationFrame(()=>{ peLayout(); const b = root.querySelector('#peSave'); if(b) b.focus(); });
    // v11.8: busca la pieza (o usa la que ya se encontró antes de abrir)
    peRunDetect(e, opts.detected);
  });
}
function closePhotoEditor(result){
  const e = photoEditor; if(!e) return;
  photoEditor = null;
  if(e.raf) cancelAnimationFrame(e.raf);
  window.removeEventListener('resize', peLayout);
  if(e.ro){ try{ e.ro.disconnect(); }catch(_){} e.ro = null; }
  clearTimeout(e.adjTimer);
  e.root.remove();
  if(e.returnFocus && e.returnFocus.focus && document.contains(e.returnFocus)) try{ e.returnFocus.focus(); }catch(_){}
  e.resolve(result || null);
}
async function savePhotoEditor(){
  const e = photoEditor; if(!e) return;
  const btn = e.root.querySelector('#peSave'); if(btn) btn.classList.add('is-busy');
  await new Promise(r=>setTimeout(r, 30));   // deja ver el botón ocupado antes de procesar
  if(photoEditor !== e) return;
  let out = null;
  try{
    const { W, H } = peDims(e), adj = peAdj(e);
    out = e.mode === 'circle' ? squarePhotoEllipseDataURL(e.src, e.w, e.h, e.rot, peRectPx(e, W, H), e.margin, !e.keepOval, adj)
        : e.quad ? squarePhotoQuadDataURL(e.src, e.w, e.h, e.rot, peQuadPx(e, W, H), e.margin, adj)
                 : squarePhotoDataURL(e.src, e.w, e.h, e.rot, peRectPx(e, W, H), e.margin, adj);
  }
  catch(err){ if(btn) btn.classList.remove('is-busy'); showToast(t('photo.read_failed') + ' ' + (err && err.message || ''), { replace:true, duration:6000 }); return; }
  closePhotoEditor(out);
}
/* Libre: deja el marco como está. Cuadrado: el mayor cuadrado dentro del
   marco actual, centrado. Entera: toda la foto. */
function setPhotoEditorMode(m){
  const e = photoEditor; if(!e) return;
  if(m === 'circle' && e.mode === 'circle'){ peDraw(); return; }   // ya estás en Círculo: no cambia nada
  e.noneShown = false;
  if(m === 'auto'){
    if(e.det) peApplyAuto(e);
    else if(e.det === null) e.noneShown = 'short';         // no hay una pieza clara: se dice y no se toca nada
    else { e.wantAuto = true; peShowScan(e, true); }       // aún buscando: se aplicará al terminar
    peDraw();
    return;
  }
  e.touched = true; e.wantAuto = false;
  if(m !== 'circle') peLeaveCircle(e);
  if(m === 'whole'){ e.mode = 'whole'; e.quad = null; e.rect = { x:0, y:0, w:1, h:1 }; }
  else if(m === 'square'){
    const { W, H } = peDims(e), r = peRectPx(e, W, H);
    const s = Math.min(r.w, r.h), cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    const x = peClamp(cx - s / 2, 0, W - s), y = peClamp(cy - s / 2, 0, H - s);
    e.mode = 'square'; e.quad = null; e.sel = -1; e.rect = { x:x / W, y:y / H, w:s / W, h:s / H };
  }
  else if(m === 'circle'){
    // v11.10: con la foto entera (o con el marco que puso Auto, que no cuenta
    // como tuyo) se busca el disco; si ya habías puesto un marco, se usa ese
    const r = e.rect, eps = 1e-6, whole = e.mode === 'auto' || (r.x <= eps && r.y <= eps && r.w >= 1 - eps && r.h >= 1 - eps);
    e.mode = 'circle'; e.quad = null; e.sel = -1; e.keepOval = false; e.circleFresh = false;
    if(!whole){
      // tu marco: si es casi redondo (un disco algo ovalado) el óvalo cabe en él;
      // si es claramente alargado (una caja), el mayor círculo dentro, centrado
      const { W, H } = peDims(e), rp = peRectPx(e, W, H), lo = Math.min(rp.w, rp.h), hi = Math.max(rp.w, rp.h);
      if(lo < 0.75 * hi){
        const cx = rp.x + rp.w / 2, cy = rp.y + rp.h / 2;
        e.rect = { x:peClamp(cx - lo / 2, 0, W - lo) / W, y:peClamp(cy - lo / 2, 0, H - lo) / H, w:lo / W, h:lo / H };
      }
    }
    else {
      if(e.disc) e.rect = peDiscRect(e, e.disc);
      else {
        peCircleCentered(e);
        if(e.disc === null) e.noneShown = 'disc';
        else { e.circleFresh = true; peRunDisc(e); }
      }
    }
  }
  else e.mode = 'free';
  peDraw();
}
/* v11.10: «Quitar» deja el óvalo con su forma; «Corregir» lo vuelve a poner redondo */
function photoEditorOvalToggle(){
  const e = photoEditor; if(!e || e.mode !== 'circle') return;
  e.keepOval = !e.keepOval;
  peDraw();
  try{ const b = e.root.querySelector('#peOvalBtn'); if(b) b.focus({ preventScroll:true }); }catch(_){}
}
/* v11.10: pestañas «Recorte» y «Luz y color» */
function photoEditorTab(tab){
  const e = photoEditor; if(!e || (tab !== 'crop' && tab !== 'light') || e.tab === tab) return;
  e.tab = tab;
  peDrawLight(e);
}
/* v11.10: Luz (luz) o Saturación (sat), de −100 a 100 */
function photoEditorAdjust(k, v){
  const e = photoEditor; if(!e || (k !== 'luz' && k !== 'sat')) return;
  e[k] = peClamp(Math.round(Number(v) || 0), -100, 100);
  if(!peAdjOn(e)) e.showOrig = false;
  // mientras se mueve, la copia rápida; un momento después de parar, la buena
  e.adjFast = true;
  clearTimeout(e.adjTimer);
  e.adjTimer = setTimeout(()=>{ if(photoEditor === e){ e.adjFast = false; peRequestDraw(); } }, 200);
  peRequestDraw();
}
function photoEditorAdjustReset(){
  const e = photoEditor; if(!e) return;
  e.luz = 0; e.sat = 0; e.showOrig = false;
  peDraw();
  try{ const s = e.root.querySelector('#peLuz'); if(s) s.focus({ preventScroll:true }); }catch(_){}
}
/* «Ver original»: mientras se mantiene pulsado (dedo, ratón, Espacio o Intro) */
function photoEditorCompare(on){
  const e = photoEditor; if(!e) return;
  on = !!on && peAdjOn(e);
  if(e.showOrig === on) return;
  e.showOrig = on;
  peDraw();
}
function peBindLight(e){
  const b = e.root.querySelector('#peCompare');
  if(b){
    const off = ()=>photoEditorCompare(false);
    b.addEventListener('pointerdown', ev=>{ if(b.disabled) return; try{ b.setPointerCapture(ev.pointerId); }catch(_){} photoEditorCompare(true); });
    b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('lostpointercapture', off);
    b.addEventListener('keydown', ev=>{ if((ev.key === ' ' || ev.key === 'Enter') && !ev.repeat){ ev.preventDefault(); photoEditorCompare(true); } });
    b.addEventListener('keyup', ev=>{ if(ev.key === ' ' || ev.key === 'Enter'){ ev.preventDefault(); off(); } });
    b.addEventListener('blur', off);
    b.addEventListener('contextmenu', ev=>ev.preventDefault());   // mantener pulsado en el móvil no abre el menú
  }
  // pestañas: flechas izquierda/derecha, Inicio y Fin
  const tl = e.root.querySelector('.pe-tabs');
  if(tl) tl.addEventListener('keydown', ev=>{
    const order = ['crop', 'light'], i = order.indexOf(e.tab);
    let n = null;
    if(ev.key === 'ArrowRight') n = order[(i + 1) % 2];
    else if(ev.key === 'ArrowLeft') n = order[(i + 1) % 2];
    else if(ev.key === 'Home') n = 'crop';
    else if(ev.key === 'End') n = 'light';
    if(!n) return;
    ev.preventDefault();
    photoEditorTab(n);
    const nb = e.root.querySelector(`[data-pe-tab="${n}"]`); if(nb) nb.focus();
  });
}
/* «Quitar» el recorte automático: vuelve a la foto entera */
function photoEditorAutoOff(){
  const e = photoEditor; if(!e) return;
  setPhotoEditorMode('whole');
  try{ e.canvas.focus({ preventScroll:true }); }catch(_){}
}
/* Tolerancia (solo en Auto): 0 = coge menos, 50 = justo, 100 = coge más */
function photoEditorTolerance(v){
  const e = photoEditor; if(!e) return;
  e.tol = peClamp(Math.round(Number(v) || 0), 0, 100);
  if(e.mode === 'auto' && e.det){ peSetQuadNorm(e, peAutoQuad(e)); peDraw(); }
  else peDrawResult(e);
}
/* «Quitar» la perspectiva: queda el rectángulo que encierra las esquinas */
function photoEditorFlatten(){
  const e = photoEditor; if(!e || !e.quad) return;
  e.quad = null; e.sel = -1;
  peDraw();
  try{ e.canvas.focus({ preventScroll:true }); }catch(_){}
}
/* Gira la foto 90° a la derecha; el marco gira con ella */
function rotatePhotoEditor(){
  const e = photoEditor; if(!e) return;
  const r = e.rect;
  e.rot = (e.rot + 1) % 4;
  e.rect = { x:Math.max(0, 1 - (r.y + r.h)), y:r.x, w:r.h, h:r.w };
  // cada esquina gira con la foto; la de abajo-izquierda pasa a ser la de arriba-izquierda
  if(e.quad){ const q = e.quad; e.quad = [3, 0, 1, 2].map(i=>[Math.max(0, 1 - q[i][1]), q[i][0]]); }
  if(e.det){ const q = e.det.q; e.det.q = [3, 0, 1, 2].map(i=>[1 - q[i][1], q[i][0]]); }
  if(e.sel >= 0) e.sel = (e.sel + 1) % 4;
  peLayout();
}
function photoEditorMargin(v){
  const e = photoEditor; if(!e) return;
  e.margin = peClamp(Math.round(Number(v) || 0), 0, PE_MAX_MARGIN) / 100;
  peDrawResult(e);
}
/* Aplica el arrastre en curso a la última posición del dedo (o de los dos dedos).
   v11.10: separado del «pointermove» para poder repetirlo si la foto se recoloca
   a mitad del arrastre (así el marco queda bajo el dedo también al soltar). */
function peDragTo(e){
  const d = e.drag; if(!d) return false;
  if(d.pinch){
    if(e.pointers.size < 2) return false;
    const [a, b] = [...e.pointers.values()];
    const f = (Math.hypot(a.x - b.x, a.y - b.y) || 1) / d.d0;
    if(e.quad) peSetQuadScreen(e, peQuadTowards(e, peQuadScreen(e), peQuadScale(e, d.q0, f)));
    else peSetFrame(e, peScaleFrame(e, d.f0, f));
  } else {
    if(!d.last) return false;
    const dx = d.last.x - d.x0, dy = d.last.y - d.y0;
    if(d.corner != null){
      const cur = peQuadScreen(e);
      peSetQuadScreen(e, peQuadCorner(e, cur, d.corner, d.q0[d.corner][0] + dx, d.q0[d.corner][1] + dy));
    } else if(d.edge != null){
      const a = d.q0[d.edge], b = d.q0[(d.edge + 1) % 4], len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const s = (dx * (b[1] - a[1]) - dy * (b[0] - a[0])) / len;
      peSetQuadScreen(e, peQuadTowards(e, peQuadScreen(e), peQuadEdge(e, d.q0, d.edge, s)));
    } else if(e.quad && d.h === 'move'){
      peSetQuadScreen(e, peQuadMove(e, d.q0, dx, dy));
    } else {
      peSetFrame(e, peDragFrame(e, d.h, d.f0, dx, dy));
    }
  }
  peAfterFrameChange(e);
  return true;
}
function peBind(e){
  const c = e.canvas;
  const pos = ev=>{ const r = c.getBoundingClientRect(); return { x:ev.clientX - r.left, y:ev.clientY - r.top }; };
  c.addEventListener('pointerdown', ev=>{
    if(!e.lay) return;
    const p = pos(ev);
    if(e.pointers.size === 0){
      const h = peHit(e, p.x, p.y);
      if(!h) return;
      e.drag = { h, x0:p.x, y0:p.y, f0:peFrame(e), q0:peQuadScreen(e) };
      e.touched = true;
      if(h[0] === 'c' && h.length === 2) e.drag.corner = Number(h[1]);
      else if(h[0] === 'e' && h.length === 2) e.drag.edge = Number(h[1]);
      e.sel = -1;
    }
    e.pointers.set(ev.pointerId, p);
    if(e.pointers.size === 2){
      const [a, b] = [...e.pointers.values()];
      e.drag = { pinch:true, d0:Math.hypot(a.x - b.x, a.y - b.y) || 1, f0:peFrame(e), q0:peQuadScreen(e) };
    }
    try{ c.setPointerCapture(ev.pointerId); }catch(_){}
    ev.preventDefault();
    peRequestDraw();
  });
  c.addEventListener('pointermove', ev=>{
    const p = pos(ev);
    if(!e.pointers.has(ev.pointerId)){
      if(!e.pointers.size && ev.pointerType === 'mouse') c.style.cursor = PE_CURSORS[peHit(e, p.x, p.y)] || '';
      return;
    }
    e.pointers.set(ev.pointerId, p);
    const d = e.drag; if(!d) return;
    d.last = p; d.reapplied = false;
    if(peDragTo(e)) peRequestDraw();
  });
  const up = ev=>{
    if(!e.pointers.has(ev.pointerId)) return;
    e.pointers.delete(ev.pointerId);
    // al soltar un dedo tras pellizcar no se sigue arrastrando (evita saltos)
    if(!e.pointers.size || (e.drag && e.drag.pinch)){ e.drag = null; peSnapQuad(e); }
    if(!e.pointers.size) peApplyDiscResult(e);   // v11.10: el disco llegó mientras tenías el dedo apoyado
    peRequestDraw();
  };
  c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
  /* Teclado: flechas mueven el marco; Mayús + flechas cambian su tamaño; + / − lo agrandan o achican.
     v11.7 (Libre y Entera): 1–4 eligen una esquina, que se mueve con las flechas; 0 la suelta. */
  c.addEventListener('keydown', ev=>{
    if(!e.lay) return;
    const step = 8;
    if(/^[0-4]$/.test(ev.key) && !ev.ctrlKey && !ev.metaKey && !ev.altKey){
      if(e.mode === 'square' || e.mode === 'circle') return;
      const n = Number(ev.key) - 1;
      e.sel = (n < 0 || e.sel === n) ? -1 : n;
      ev.preventDefault(); peDraw(); return;
    }
    const k = { ArrowLeft:[-1,0], ArrowRight:[1,0], ArrowUp:[0,-1], ArrowDown:[0,1] }[ev.key];
    if(e.sel >= 0 && e.mode !== 'square' && e.mode !== 'circle' && k && !ev.shiftKey){
      const cur = peQuadScreen(e);
      peSetQuadScreen(e, peQuadCorner(e, cur, e.sel, cur[e.sel][0] + k[0] * step, cur[e.sel][1] + k[1] * step));
      peSnapQuad(e);
      ev.preventDefault(); peAfterFrameChange(e); peDraw(); return;
    }
    if(e.quad){
      const cur = peQuadScreen(e);
      let next = null;
      if(k && ev.shiftKey) next = peQuadTowards(e, cur, k[0] ? peQuadEdge(e, cur, 1, k[0] * step) : peQuadEdge(e, cur, 2, k[1] * step));
      else if(k) next = peQuadMove(e, cur, k[0] * step, k[1] * step);
      else if(ev.key === '+' || ev.key === '=') next = peQuadTowards(e, cur, peQuadScale(e, cur, 1.1));
      else if(ev.key === '-' || ev.key === '_') next = peQuadTowards(e, cur, peQuadScale(e, cur, 1 / 1.1));
      if(!next) return;
      ev.preventDefault();
      peSetQuadScreen(e, next); peAfterFrameChange(e); peDraw();
      return;
    }
    const f0 = peFrame(e);
    let f = null;
    if(k && ev.shiftKey){
      if(e.mode === 'square'){ const s = (k[0] || k[1]) * step; f = peDragFrame(e, 'se', f0, s, s); }
      else f = peDragFrame(e, k[0] ? 'e' : 's', f0, k[0] * step, k[1] * step);
    }
    else if(k) f = peDragFrame(e, 'move', f0, k[0] * step, k[1] * step);
    else if(ev.key === '+' || ev.key === '=') f = peScaleFrame(e, f0, 1.1);
    else if(ev.key === '-' || ev.key === '_') f = peScaleFrame(e, f0, 1 / 1.1);
    if(!f) return;
    ev.preventDefault();
    peSetFrame(e, f); peAfterFrameChange(e); peDraw();
  });
}
/* «Editar» en el visor: recorta o gira una foto que ya tienes. La app guarda
   el cuadrado de 1200 px, no el original: recortar una foto antigua amplía lo
   que queda (algo menos de detalle). */
async function editViewerPhoto(){
  const v = viewerState; if(!v) return;
  const key = photoKeyFor(v.pid, v.side); if(!key) return;
  let img;
  try{ img = await loadImageURL(await loadPhoto(key)); }
  catch(err){ showToast(t('photo.read_failed') + ' ' + (err && err.message || ''), { replace:true, duration:6000 }); return; }
  const out = await openPhotoEditor({ source: img, autoApply: false });   // v11.8: una foto ya guardada no se recorta sola; Auto, si lo pides
  if(!out) return;
  if(!await storePhotoData(key, out)) return;
  showToast(t('photo.saved'), { ok:true, replace:true });
  await photoMarksClearKey(key);   // v11.19
  if(viewerState && viewerState.pid===v.pid) openPhotoViewer(v.pid, v.side);
  render();
  if(typeof estSidesRefresh==='function') estSidesRefresh();          // v11.14: la hoja «Fotos de los lados», si está abierta
  if(typeof refreshCopySheet==='function') refreshCopySheet();
}

/* Gestos: solo se escuchan con el visor abierto (así el scroll normal de las
   listas nunca espera a JavaScript) */
let _viewerListening = false;
function viewerListen(on){
  if(on===_viewerListening) return;
  _viewerListening = on;
  const fn = on ? 'addEventListener' : 'removeEventListener';
  document[fn]('touchstart', viewerTouchStart, { passive:true });
  document[fn]('touchmove', viewerTouchMove, { passive:false });
  document[fn]('touchend', viewerTouchEnd, { passive:false });
  document[fn]('touchcancel', viewerTouchEnd, { passive:false });
  window[fn]('resize', viewerOnResize);
}
function viewerStartPinch(touches, fromCard){
  const v = viewerState, a = touches[0], b = touches[1];
  const mx = (a.clientX + b.clientX) / 2, my = (a.clientY + b.clientY) / 2;
  _viewerGesture = { type:'pinch', d0: touchDist(a, b), s0: v.s, px: (mx - v.x) / v.s, py: (my - v.y) / v.s, fromCard };
  viewerApply(false);
}
function viewerStartPan(t, moved){
  const v = viewerState;
  _viewerGesture = { type:'pan', sx:t.clientX, sy:t.clientY, x0:v.x, y0:v.y, moved:!!moved };
}
function viewerTouchStart(e){
  if(!viewerState || !e.target.closest || !e.target.closest('#pinchOverlay') || e.target.closest('button, .viewer-cap, .viewer-mark-list')) return;
  if(e.touches.length >= 2) viewerStartPinch(e.touches, false);
  else if(e.touches.length === 1) viewerStartPan(e.touches[0]);
}
function viewerTouchMove(e){
  const v = viewerState, g = _viewerGesture;
  if(!v || !g) return;
  e.preventDefault();
  if(g.type==='pinch' && e.touches.length >= 2){
    const a = e.touches[0], b = e.touches[1];
    const mx = (a.clientX + b.clientX) / 2, my = (a.clientY + b.clientY) / 2;
    v.s = Math.min(VIEWER_MAX * 1.2, Math.max(g.fromCard ? 0.15 : 0.6, g.s0 * touchDist(a, b) / g.d0));
    v.x = mx - g.px * v.s; v.y = my - g.py * v.s;
    viewerApply(false);
  } else if(g.type==='pan' && e.touches.length === 1){
    const t = e.touches[0], dx = t.clientX - g.sx, dy = t.clientY - g.sy;
    if(Math.abs(dx) + Math.abs(dy) > 8) g.moved = true;
    g.dx = dx; g.dy = dy;
    if(!g.moved) return;
    if(v.s > 1.01){ v.x = g.x0 + dx; v.y = g.y0 + dy; viewerClamp(v); }
    else { v.x = g.x0; v.y = viewerRestY(v) + Math.max(0, dy); }   // sin ampliar: arrastrar hacia abajo para cerrar
    viewerApply(false);
  }
}
function viewerTouchEnd(e){
  const v = viewerState, g = _viewerGesture;
  if(!v || !g) return;
  if(g.type==='pinch' && e.touches.length === 1){ viewerStartPan(e.touches[0], true); return; }   // queda un dedo: sigue moviendo
  if(e.touches.length > 0) return;
  _viewerGesture = null;
  if(g.type==='pan' && !g.moved){
    if(viewerMarksOn) return;   // v11.19: con «Marcas», cada toque pone una (el clic normal); sin doble toque
    const t = e.changedTouches[0], now = Date.now();
    const last = _viewerLastTap;
    if(last && now - last.t < 320 && Math.hypot(t.clientX - last.x, t.clientY - last.y) < 30){
      _viewerLastTap = null;
      e.preventDefault();                                            // sin clic fantasma
      if(v.s > 1.01) viewerReset(true); else viewerZoomAt(2.5, t.clientX, t.clientY, true);
    } else _viewerLastTap = { t: now, x: t.clientX, y: t.clientY };
    return;                                                          // un toque suelto: el clic normal (el fondo cierra)
  }
  if(g.type==='pan' && v.s <= 1.01 && Math.abs(g.dx||0) > 60 && Math.abs(g.dx||0) > Math.abs(g.dy||0) * 1.3 && viewerStep(g.dx < 0 ? 1 : -1)) return;
  if(g.type==='pan' && v.s <= 1.01 && v.y - viewerRestY(v) > 110){ closePhotoViewer(); return; }
  if(v.s < 1) viewerReset(true);
  else if(v.s > VIEWER_MAX){ const t = e.changedTouches[0]; viewerZoomAt(VIEWER_MAX, t ? t.clientX : innerWidth/2, t ? t.clientY : innerHeight/2, true); }
  else { viewerClamp(v); viewerApply(true); }
}
function viewerOnResize(){ const v = viewerState; if(!v) return; viewerFit(v); v.s = 1; viewerClamp(v); viewerApply(false); }
/* Ratón: rueda / pellizco del trackpad, arrastrar y doble clic */
(function(){
  let drag = null;
  document.addEventListener('wheel', (e)=>{
    if(!viewerState || !e.target.closest || !e.target.closest('#pinchOverlay')) return;
    e.preventDefault();
    viewerZoomAt(viewerState.s * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX, e.clientY, false);
  }, { passive:false });
  document.addEventListener('mousedown', (e)=>{
    if(!viewerState || e.button!==0 || e.target.id!=='pinchImg' || viewerState.s <= 1.01) return;
    e.preventDefault();
    drag = { sx:e.clientX, sy:e.clientY, x0:viewerState.x, y0:viewerState.y };
    viewerEls().ov.classList.add('is-dragging');
  });
  document.addEventListener('mousemove', (e)=>{
    if(!drag || !viewerState) return;
    viewerState.x = drag.x0 + e.clientX - drag.sx; viewerState.y = drag.y0 + e.clientY - drag.sy;
    viewerClamp(viewerState); viewerApply(false);
  });
  document.addEventListener('mouseup', ()=>{ if(drag){ drag = null; const { ov } = viewerEls(); if(ov) ov.classList.remove('is-dragging'); } });
  document.addEventListener('dblclick', (e)=>{
    if(!viewerState || e.target.id!=='pinchImg' || viewerMarksOn) return;
    if(viewerState.s > 1.01) viewerReset(true); else viewerZoomAt(2.5, e.clientX, e.clientY, true);
  });
})();

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
    if(isPhotoEditorOpen()){ e.preventDefault(); closePhotoEditor(null); return; }
    if(!isViewerOpen() && v1119Overlay()){ e.preventDefault(); v1119OverlayClose(); return; }   // v11.19: sesión de fotos / comparar copias
    if(typeof estInspectOpen==='function' && estInspectOpen()){ e.preventDefault(); estCloseInspect(); return; }   // v11.11
    if(typeof isScannerOpen==='function' && isScannerOpen()){ e.preventDefault(); scannerBack(); return; }
    if(isViewerOpen() && isSheetOpen()){ e.preventDefault(); closePhotoViewer(); return; }   // v11.11
    if(isSheetOpen()){ e.preventDefault(); closeSheet(); return; }
    if(isViewerOpen()){ e.preventDefault(); closePhotoViewer(); return; }
    if(!isModalOpen() && typeof estBackLevel==='function' && estBackLevel()){ e.preventDefault(); return; }   // v11.11.1
    if(typeof invState!=='undefined' && invState.sel && view.page==='inventario' && !view.productId){ e.preventDefault(); invPickMode(false); return; }   // v11.19
  }
  if(e.key==='Enter' && isModalOpen() && e.target && e.target.tagName==='INPUT'){ e.preventDefault(); modalConfirmAction(); return; }
  // visor de fotos: + − 0 para el zoom y flechas para moverse por la foto ampliada
  if(isViewerOpen() && !isModalOpen() && !isPhotoEditorOpen() && !(typeof isScannerOpen==='function' && isScannerOpen()) && !e.ctrlKey && !e.metaKey){
    const k = e.key;
    if(k==='+' || k==='='){ e.preventDefault(); viewerZoomBy(1.6); return; }
    if(k==='-' || k==='_'){ e.preventDefault(); viewerZoomBy(1/1.6); return; }
    if(k==='0'){ e.preventDefault(); viewerReset(true); return; }
    const pan = { ArrowLeft:[80,0], ArrowRight:[-80,0], ArrowUp:[0,80], ArrowDown:[0,-80] }[k];
    if(pan && viewerState.s > 1.01){ e.preventDefault(); viewerState.x += pan[0]; viewerState.y += pan[1]; viewerClamp(viewerState); viewerApply(true); return; }
    if((k==='ArrowRight' || k==='ArrowLeft') && viewerStep(k==='ArrowRight' ? 1 : -1)){ e.preventDefault(); return; }
  }
  if(e.key==='Tab'){
    const box = isModalOpen() ? document.querySelector('#modalOverlay .modal-card') : isPhotoEditorOpen() ? photoEditor.root : (v1119Overlay() && !isViewerOpen()) ? v1119Overlay() : (typeof estInspectOpen==='function' && estInspectOpen()) ? (typeof estDialogEl==='function' ? estDialogEl() : document.getElementById('estInspect')) : (typeof isScannerOpen==='function' && isScannerOpen()) ? scanner.root : (isViewerOpen() && isSheetOpen()) ? document.getElementById('pinchOverlay') : isSheetOpen() ? document.querySelector('#sheetOverlay .sheet') : isViewerOpen() ? document.getElementById('pinchOverlay') : null;
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
  // opts.focus (v11.11): dónde empieza el foco (p. ej. no en un campo de texto, para que no salga el teclado)
  setTimeout(()=>{ const b = (opts.focus && ov.querySelector(opts.focus)) || ov.querySelector('.sheet-body button, .sheet-body select, .sheet-body input') || ov.querySelector('.sheet-head button'); if(b) b.focus(); }, 40);
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

/* Ajustes (v11.2), agrupados: Apariencia · Colección · Datos · Información */
function settingsBodyHTML(){
  const theme = OVERRIDES.theme==='dark' ? 'dark' : 'light';
  const lang = OVERRIDES.lang || 'es';
  const cur = currencySymbol();
  const langs = [['es','Español'],['en','English'],['de','Deutsch'],['ja','日本語']];
  const curs = [['€','€ Euro'],['$','$ '+t('currency.dollar')],['£','£ '+t('currency.pound')],['¥','¥ '+t('currency.yen')]];
  const row = (ic, label, sub, js)=> `<button type="button" class="settings-row" onclick="closeSheet(); ${js}"><span class="row-label">${icon(ic)}<span class="row-text"><span class="row-name">${label}</span>${sub ? `<span class="row-sub">${sub}</span>` : ''}</span></span>${icon('chevronRight')}</button>`;
  const group = (key, inner)=> `<section class="settings-group" aria-labelledby="sg-${key}"><h3 class="settings-group-title" id="sg-${key}">${t('settings.group.'+key)}</h3>${inner}</section>`;
  return group('appearance', `<div class="sheet-group"><div class="field-label">${t('settings.theme')}</div>
      <div class="segmented" role="group" aria-label="${t('settings.theme')}">
        <button type="button" class="seg-btn ${theme==='light'?'active':''}" aria-pressed="${theme==='light'}" onclick="setTheme('light')">${icon('sun')} ${t('settings.theme_light')}</button>
        <button type="button" class="seg-btn ${theme==='dark'?'active':''}" aria-pressed="${theme==='dark'}" onclick="setTheme('dark')">${icon('moon')} ${t('settings.theme_dark')}</button>
      </div></div>
    <div class="sheet-group"><div class="field-label">${t('settings.language')}</div><div class="chip-row" role="group" aria-label="${t('settings.language')}">
      ${langs.map(([c,l])=>`<button type="button" class="chip ${lang===c?'active':''}" aria-pressed="${lang===c}" onclick="setLang('${c}')" lang="${c}">${l}</button>`).join('')}</div></div>
    ${faltaStyleSettingHTML()}`)
  + group('collection', `<div class="sheet-group"><div class="field-label">${t('settings.currency')}</div><div class="chip-row" role="group" aria-label="${t('settings.currency')}">
      ${curs.map(([c,l])=>`<button type="button" class="chip ${cur===c?'active':''}" aria-pressed="${cur===c}" onclick="setCurrency('${c}')">${escapeHTML(l)}</button>`).join('')}</div>
      <p class="settings-note">${t('settings.currency_note')}</p></div>
    ${row('camera', t('dash.gallery_link'), '', "goPage('gallery')")}
    ${typeof openScanner==='function' ? row('barcode', t('scan.settings_row'), t('scan.settings_sub'), "openScanner()") + row('image', t('scan.photos_link'), t('pcode.settings_sub'), "openPhotoBarcodeSearch()") : ''}`)
  + group('data', (typeof syncSettingsRowHTML==='function' ? syncSettingsRowHTML() : '') + row('archive', t('dash.backup_link'), escapeHTML(lastBackupText()), "goPage('backup')"))
  + group('info', `${row('help', t('nav.ayuda'), '', "goPage('ayuda')")}
    <p class="settings-version">La Colección App · v${APP_VERSION}</p>`);
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
    + (message ? `<button type="button" class="btn save-error-btn" onclick="location.reload()">${t('save.retry')}</button>`
               : `<button type="button" class="btn save-error-btn" onclick="persistOverrides()">${t('save.retry')}</button>`);
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
  return `<header class="screen-head${o.cls ? ' ' + o.cls : ''}">
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
    html += `<div class="check-item is-static"><span>${escapeHTML(checklistLabel(item))}</span>
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
    ${p.existence!=='confirmado' ? `<span class="badge badge-unconfirmed">${existenceLabel(p.existence)}</span>` : ``}
    ${typeof isLoaned==='function' && isLoaned(p) ? `<span class="badge badge-loan" title="${escapeHTML(t('loan.sum').replace('{a}', p.prestamo.a))}">${icon('loan')} ${t('loan.badge')}</span>` : ''}`;
}

/* Posesión: verde si lo tienes, amarillo pastel si además está precintado,
   neutro si no lo tienes. */
function possessClass(p){
  if(p.possession!=='tengo') return 'tone-not-have';
  return shownSealed(p) ? 'tone-sealed' : 'tone-have';   // v11.11: la mejor copia
}
function possessLabel(p){
  return p.possession==='tengo' ? (shownSealed(p) ? t('p.have_sealed') : t('p.have_yes')) : t('p.have_no');
}
/* v11.2: el botón lleva su icono (✓ la tienes · escudo precintada · + te falta),
   así el estado se reconoce sin leer y sin depender solo del color. */
function possessShortLabel(p){ return p.possession!=='tengo' ? t('legend.missing') : (shownSealed(p) ? t('state.sealed') : t('legend.have')); }
function possessInnerHTML(p, short){
  const ic = `<span class="possess-ic" aria-hidden="true">${possessDotIcon(p)}</span>`;
  // en las filas de la lista, una etiqueta corta (el lector de pantalla oye la completa)
  if(short) return `${ic}<span class="possess-txt" aria-hidden="true">${possessShortLabel(p)}</span><span class="sr-only">${plainLabel(possessLabel(p))}</span>`;
  return `${ic}<span class="possess-txt">${plainLabel(possessLabel(p))}</span>`;
}
function possessButtonHTML(p, cls){
  return `<button type="button" class="${cls} ${possessClass(p)}" id="possess_${p.id}" aria-pressed="${p.possession==='tengo'}" onclick="event.stopPropagation(); quickTogglePossession('${p.id}')">${possessInnerHTML(p, cls==='possess-pill')}</button>`;
}
/* Botón redondo de posesión de las portadas (v11.1): verde con ✓ si lo
   tienes, dorado con escudo si además está precintada, "+" si te falta.
   Hace lo mismo que el botón de siempre (quickTogglePossession). */
function possessDotIcon(p){ return icon(p.possession!=='tengo' ? 'plus' : (shownSealed(p) ? 'shield' : 'check')); }
function possessDotHTML(p){
  const have = p.possession==='tengo';
  return `<button type="button" class="possess-dot ${possessClass(p)}" id="possess_${p.id}" aria-pressed="${have}" aria-label="${escapeHTML(t('cover.have_label').replace('{name}', p.name))}" title="${escapeHTML(plainLabel(possessLabel(p)))}" onclick="event.stopPropagation(); quickTogglePossession('${p.id}')">${possessDotIcon(p)}</button>`;
}
function planoHitHTML(p){ return `<span class="plano-hit" onclick="goProduct('${p.id}')">${planoCoverHTML(p)}</span>`; }
function ensurePlanoIn(card, e){
  if(card.querySelector('.plano')) return;
  if(card.classList.contains('cover-card')){
    const cover = card.querySelector('.cover');
    if(cover && cover.querySelector('.cover-empty')) cover.insertAdjacentHTML('afterbegin', planoHitHTML(e));
  } else {
    const row = card.querySelector('.row-thumb-empty'), wall = card.querySelector('.wall-code');
    if(row) row.insertAdjacentHTML('beforeend', planoMiniHTML(e, 'rt-plano'));
    else if(wall) wall.outerHTML = planoMiniHTML(e);
  }
}
function coverStateClass(p){ return p.possession!=='tengo' ? 'is-missing' : (shownSealed(p) ? 'is-sealed' : 'is-have'); }
function refreshPossessButton(id){
  const rec = EDITIONS_BY_ID[id]; if(!rec) return;
  const e = rec.edition;
  document.querySelectorAll('#possess_'+CSS.escape(id)).forEach(btn=>{
    btn.classList.remove('tone-have','tone-not-have','tone-sealed');
    btn.classList.add(possessClass(e));
    btn.setAttribute('aria-pressed', e.possession==='tengo');
    if(btn.classList.contains('possess-dot')){ btn.innerHTML = possessDotIcon(e); btn.title = plainLabel(possessLabel(e)); }
    else btn.innerHTML = possessInnerHTML(e, btn.classList.contains('possess-pill'));
    // respuesta visual breve al cambiar (se omite con «reducir movimiento»)
    btn.classList.remove('is-changed'); void btn.offsetWidth; btn.classList.add('is-changed');
  });
  // la portada cambia de aspecto al momento (plano ↔ pieza que tienes)
  document.querySelectorAll('.cover-card[data-pid="'+CSS.escape(id)+'"], .inv-item[data-pid="'+CSS.escape(id)+'"], .wall-tile[data-pid="'+CSS.escape(id)+'"]').forEach(card=>{
    const was = card.classList.contains('is-missing');
    card.classList.remove('is-have','is-missing','is-sealed');
    card.classList.add(coverStateClass(e));
    // v11.11: si ahora te falta y no tiene foto, se le pone su plano (solo se construye cuando hace falta)
    if(e.possession!=='tengo') ensurePlanoIn(card, e);
    // v11.11: al conseguirla, el plano se repasa en verde y sale el sello «CONSEGUIDA»
    if(was && e.possession==='tengo' && card.classList.contains('cover-card')){
      const pl = card.querySelector('.cover .plano');
      if(pl && !reducedMotion()){
        card.classList.add('just-got');
        playGotAnimation(pl, ()=>{ card.classList.remove('just-got'); pl.classList.remove('is-got'); const g = pl.querySelector('.plano-stamp.is-got'); if(g) g.remove(); });
      }
    }
    const qty = card.querySelector('.qty-badge'); if(qty) qty.hidden = copyCount(e) < 2;
    const stamp = card.querySelector('.plano-stamp:not(.is-got)');
    if(stamp){ stamp.textContent = planoStampText(e); stamp.classList.toggle('is-hunt', isHunting(e)); }
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

/* Selector de foto (v11.1.1): una etiqueta que abre la cámara o la galería
   del móvil. La foto se guarda en "key" (photo_<id>_front / _back). */
function photoPickerHTML(cls, key, inner, ariaLabel){
  return `<label class="${cls} photo-picker">${inner}<input type="file" accept="image/*" class="sr-only" aria-label="${escapeHTML(ariaLabel)}" onchange="onPhotoSlotChange(this,'${key}')"></label>`;
}
/* Insignias sobre la foto: tipo de edición y existencia sin confirmar */
function coverTagsHTML(p){
  const b = [];
  if(p.special) b.push(`<span class="cover-tag tag-special">${t('badge.special')}</span>`);
  if(p.dlc) b.push(`<span class="cover-tag tag-dlc">DLC</span>`);
  if(p.standalone) b.push(`<span class="cover-tag tag-dual">${t('badge.dual')}</span>`);
  if(p.existence && p.existence!=='confirmado') b.push(`<span class="cover-tag tag-unconf">${existenceLabel(p.existence)}</span>`);
  if(typeof isLoaned==='function' && isLoaned(p)) b.push(`<span class="cover-tag tag-loan">${t('loan.badge')}</span>`);   // v11.19
  return b.length ? `<span class="cover-tags">${b.join('')}</span>` : '';
}

/* Tarjeta de pieza (cuadrícula) — v11.1 «tu foto primero»: la foto cuadrada
   es la protagonista (se voltea como siempre: tocar o deslizar); encima solo
   la plataforma y las insignias; debajo el nombre (abre la ficha) y el botón
   de posesión. Sin foto: el color de la plataforma y "Añadir foto". Si te
   falta: hueco con borde discontinuo. */
/* v11.11: insignia «×3» si tienes varias copias (dorada si alguna es para cambio) */
function qtyBadgeHTML(p, cls){
  const n = copyCount(p);
  const trade = n > 1 && copiesOf(p).some(c=>c.paraCambio);
  // dorado y con las flechas de cambio si alguna copia es «para cambio»
  const label = t('copy.count_title').replace('{n}', n) + (trade ? ' · ' + t('copy.trade') : '');
  return `<span class="qty-badge${trade ? ' is-trade' : ''}${cls ? ' ' + cls : ''}" ${n < 2 ? 'hidden' : ''} title="${escapeHTML(label)}"><span aria-hidden="true">${trade ? icon('swap') : ''}×${n}</span><span class="sr-only">${escapeHTML(label)}</span></span>`;
}
function productCardHTML(p, opts){
  opts = opts || {};
  const pv = platVisual(p.platformId);
  const photoId = shownPhotoId(p);   // v11.11: se enseña la mejor copia
  const anyPhoto = hasPhoto(photoId,'front') || hasPhoto(photoId,'back');
  const num = p.possession!=='tengo' ? catalogNumText(p) : '';   // v11.11: «Nº 12/22» en lo que te falta
  const meta = [num, p.year, regionShortText(p), opts.showPlatform===false ? '' : p.platformName].filter(Boolean).map(escapeHTML).join(' · ');
  // sin foto: el hueco ES el botón para hacerla o elegirla (se guarda como foto delantera, sin salir de la lista).
  // v11.11: si te falta, se ve su plano y el botón de la foto queda como una cámara pequeña
  const cover = anyPhoto ? flipViewHTML(p, { tap:'open', photoId })
    : photoPickerHTML('cover-empty', 'photo_' + p.id + '_front', `${icon('camera')}<span class="cover-empty-txt">${t('cover.add_photo')}</span>`, t('cover.add_photo_for').replace('{name}', p.name));
  // (el plano solo se construye si te falta; si deja de tenerse, refreshPossessButton lo añade al momento)
  const plano = anyPhoto || p.possession==='tengo' ? '' : planoHitHTML(p);
  return `<article class="title-card cover-card ${coverStateClass(p)} plst-${faltaStyle()}" data-pid="${escapeHTML(p.id)}" style="--plat:${pv.color}">
    <div class="cover">${plano}${cover}
      ${pv.code ? `<span class="cover-code" aria-hidden="true">${escapeHTML(pv.code)}</span>` : ''}
      ${qtyBadgeHTML(p)}
      ${planoStampHTML(p)}
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
  const photoId = shownPhotoId(p);
  const has = hasPhoto(photoId,'front');
  const miss = p.possession!=='tengo';
  const meta = [p.year, regionShortText(p)].filter(Boolean).map(escapeHTML).join(' · ');
  return `<button type="button" class="mini-cover ${coverStateClass(p)}" style="--plat:${pv.color}" onclick="goProduct('${p.id}')">
    <span class="mini-photo">${has ? photoImgHTML(p,'front','thumb','',photoId) : miss ? planoMiniHTML(p) + `<span class="mini-code is-over">${escapeHTML(pv.code)}</span>` : `<span class="mini-code">${escapeHTML(pv.code)}</span>`}
      ${has && pv.code ? `<span class="cover-code" aria-hidden="true">${escapeHTML(pv.code)}</span>` : ''}
      ${shownSealed(p) ? `<span class="cover-seal" title="${escapeHTML(t('wall.sealed'))}">${icon('shield')}</span>` : ''}
      ${qtyBadgeHTML(p, 'is-small')}
    </span>
    <span class="mini-name">${escapeHTML(p.name)}</span>
    ${meta ? `<span class="mini-meta">${meta}</span>` : ''}
  </button>`;
}
function productRowHTML(p, opts){
  opts = opts || {};
  const reg = regionShortText(p);
  const meta = [p.possession!=='tengo' ? catalogNumText(p) : '', opts.showPlatform===false ? '' : p.platformName, p.year, reg].filter(Boolean).map(escapeHTML).join(' · ');
  const pv = platVisual(p.platformId);
  const photoId = shownPhotoId(p);   // v11.11: la mejor copia; si te falta y no hay foto, su plano
  const thumb = (hasPhoto(photoId,'front') || hasPhoto(photoId,'back')) ? flipViewHTML(p, { hint:false, photoId })
    : `<span class="row-thumb-empty" style="--plat:${pv.color}" aria-hidden="true"><span class="rt-code">${escapeHTML(pv.code)}</span>${p.possession!=='tengo' ? planoMiniHTML(p, 'rt-plano') : ''}</span>`;
  const n = copyCount(p);
  const badges = ((n > 1 ? `<span class="badge badge-qty${copiesOf(p).some(c=>c.paraCambio) ? ' is-trade' : ''}">×${n}</span>` : '') + productBadgesHTML(p, { noRegion:true })).trim();
  return `<div class="inv-item ${coverStateClass(p)}" data-pid="${escapeHTML(p.id)}" onclick="goProduct('${p.id}')" role="link" tabindex="0" onkeydown="if(event.key==='Enter'){goProduct('${p.id}')}">
    ${thumb}
    <div class="inv-main">
      <div class="inv-name">${escapeHTML(p.name)}</div>
      <div class="inv-meta">${meta || '—'}</div>
      ${badges ? `<div class="badge-row">${badges}</div>` : ''}
      ${opts.copies && n > 1 ? `<div class="copy-mini">${copiesOf(p).map(c=>`<span class="cm${c.paraCambio ? ' is-trade' : ''}">${escapeHTML(t('copy.n').replace('{n}', c.n))} · ${escapeHTML(copyLine(p, c))}${c.paraCambio ? ' · ' + escapeHTML(t('copy.trade')) : ''}</span>`).join('')}</div>` : ''}
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
function editableTextarea(label, value, onchangeAttr, extra){
  const id = fieldId();
  return `<div class="field"><label for="${id}">${label}</label><textarea id="${id}" onchange="${onchangeAttr}" ${extra||''}>${escapeHTML(value||'')}</textarea></div>`;
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
/* Etiqueta accesible para los botones de vista */
function viewToggleHTML(current, onclickTpl, withWall){
  const b = (v, key, ic)=> `<button type="button" class="seg-btn ${current===v?'active':''}" aria-pressed="${current===v}" aria-label="${t(key)}" title="${t(key)}" onclick="${onclickTpl.replace('{v}',v)}">${icon(ic)}</button>`;
  return `<div class="segmented" role="group" aria-label="${t('view.label')}">
    ${b('grid','view.grid','covers')}${b('list','view.list','rows')}${withWall ? b('wall','view.wall','wall') : ''}
  </div>`;
}

/* =====================================================================
   v11.19 · IMÁGENES
   · Pie de foto y orden de las fotos extra.
   · Marcas de defectos sobre una foto (un punto y su nota).
   · El visor recorre la galería (deslizar o ← → pasa a la pieza siguiente).
   · Sesión de fotos: una detrás de otra, con la cámara.
   · Comparar dos copias lado a lado.
   · Importar muchas fotos de una vez: cada una va a su pieza por su código
     de barras.
   Datos (todo en la pieza, solo se añaden; sin ellos todo queda como antes):
   fotoNotas { hueco: texto } · fotosOrden [huecos extra en orden] ·
   marcas { hueco: [{ x, y, t }] } (x, y de 0 a 1 sobre la foto).
   Para las fotos de otra copia, la clave lleva delante su número: «c2:front».
   ===================================================================== */
function photoMetaKey(photoId, side){ const p = productForPhotoId(photoId); return !p || photoId===p.id ? side : String(photoId).slice(p.id.length + 2) + ':' + side; }
function photoMetaObj(p, field){ return p && p[field] && typeof p[field]==='object' && !Array.isArray(p[field]) ? p[field] : null; }
function photoNoteOf(photoId, side){ const p = productForPhotoId(photoId), o = photoMetaObj(p, 'fotoNotas'); const n = o ? o[photoMetaKey(photoId, side)] : ''; return typeof n==='string' ? n : ''; }
function photoMarksOf(photoId, side){
  const p = productForPhotoId(photoId), o = photoMetaObj(p, 'marcas'); const m = o ? o[photoMetaKey(photoId, side)] : null;
  return Array.isArray(m) ? m.filter(x=> x && typeof x.x==='number' && typeof x.y==='number') : [];
}
async function setPhotoMeta(photoId, side, field, val){
  const p = productForPhotoId(photoId); if(!p) return;
  const all = Object.assign({}, photoMetaObj(p, field) || {}), key = photoMetaKey(photoId, side);
  if(val===null || val===undefined || val==='' || (Array.isArray(val) && !val.length)) delete all[key]; else all[key] = val;
  const out = Object.keys(all).length ? all : null;
  p[field] = out; await setProductField(p.id, field, out);
}
/* Las extra, en tu orden (las que no has movido, detrás, en su orden de siempre) */
function orderedExtraSides(id){
  const used = EXTRA_SLOTS.filter(s=> hasPhoto(id, s));
  const p = PRODUCTS_BY_ID[id], ord = p && Array.isArray(p.fotosOrden) ? p.fotosOrden : [];
  if(!ord.length) return used;
  const rank = (s)=>{ const i = ord.indexOf(s); return i < 0 ? 100 + EXTRA_SLOTS.indexOf(s) : i; };
  return used.slice().sort((a, b)=> rank(a) - rank(b));
}
/* Al quitar una foto, su pie, sus marcas y su sitio en el orden se van con ella
   (si no, la siguiente foto de ese hueco los heredaría) */
async function forgetPhotoMeta(key){
  const info = parsePhotoKey(key); if(!info) return;
  const p = productForPhotoId(info.id); if(!p) return;
  const mk = photoMetaKey(info.id, info.side);
  for(const f of ['fotoNotas', 'marcas']){ const o = photoMetaObj(p, f); if(o && o[mk]!==undefined) await setPhotoMeta(info.id, info.side, f, null); }
  if(info.id===p.id && Array.isArray(p.fotosOrden) && p.fotosOrden.includes(info.side)){
    const o = p.fotosOrden.filter(s=> s!==info.side), v = o.length ? o : null;
    p.fotosOrden = v; await setProductField(p.id, 'fotosOrden', v);
  }
}
/* Un texto que se puede dejar vacío (vacío = quitarlo); null = cancelar */
function askText(title, value){
  return showFormModal(title, [{ name:'value', label:title, value: value || '', required:false }], {}).then(r=> r ? String(r.value || '') : null);
}
/* Si la foto de un hueco cambia (otra foto, o recortada o girada), sus marcas ya no estarían
   en su sitio: se quitan (el pie se queda) */
async function photoMarksClearKey(key){
  const info = parsePhotoKey(key); if(!info) return;
  if(photoMarksOf(info.id, info.side).length){ await setPhotoMeta(info.id, info.side, 'marcas', null); showToast(t('mk.cleared'), { replace:false, duration:5000 }); }
}
/* Al quitar la copia 1, la siguiente pasa a ser la pieza: su pie y sus marcas van con sus fotos */
async function photoMetaPromote(id, copyPhotoId, sides){
  const p = PRODUCTS_BY_ID[id]; if(!p) return;
  for(const f of ['fotoNotas', 'marcas']){
    const o = photoMetaObj(p, f); if(!o) continue;
    const n = Object.assign({}, o); let ch = false;
    sides.forEach(s=>{ const from = photoMetaKey(copyPhotoId, s); if(s in n){ delete n[s]; ch = true; } if(from in n){ n[s] = n[from]; delete n[from]; ch = true; } });
    if(ch){ const v = Object.keys(n).length ? n : null; p[f] = v; await setProductField(id, f, v); }
  }
}
async function editPhotoNote(photoId, side){
  const p = productForPhotoId(photoId); if(!p) return;
  const v = await askText(t('photo.note_q').replace('{s}', photoSideLabel(side)), photoNoteOf(photoId, side));
  if(v===null || v===undefined) return;
  await setPhotoMeta(photoId, side, 'fotoNotas', String(v).trim().slice(0, 140));
  if(isViewerOpen() && viewerState.pid===photoId && viewerState.side===side){ viewerCaption(); const b = document.querySelector('#viewerCap .vc-note'); if(b) b.focus({ preventScroll:true }); }
  if(document.getElementById('photo-extras')) await renderKeepFocus();
}
/* ---------- Ordenar las fotos extra ---------- */
async function saveExtraOrder(id, order, focusSide){
  const p = PRODUCTS_BY_ID[id]; if(!p) return;
  p.fotosOrden = order.slice(); await setProductField(id, 'fotosOrden', p.fotosOrden);
  await render();
  if(focusSide){ const g = document.querySelector(`#photo-extras [data-fk="xg-${focusSide}"]`); if(g) g.focus({ preventScroll:true }); }
}
/* Con el teclado: ← → sobre el asa mueven la foto */
function extraKey(ev, id, side){
  if(ev.key!=='ArrowLeft' && ev.key!=='ArrowRight') return;
  ev.preventDefault();
  const order = orderedExtraSides(id), i = order.indexOf(side), j = i + (ev.key==='ArrowLeft' ? -1 : 1);
  if(i < 0 || j < 0 || j >= order.length) return;
  order.splice(i, 1); order.splice(j, 0, side);
  saveExtraOrder(id, order, side);
}
/* Arrastrando el asa: la foto sigue al dedo y se suelta delante o detrás de otra */
function extraDragStart(ev, id, side){
  if(ev.button > 0) return;
  const tile = ev.currentTarget.closest('.extra-tile'), grid = tile && tile.parentElement; if(!grid) return;
  ev.preventDefault();
  const st = { x0:ev.clientX, y0:ev.clientY, moved:false, over:null, before:false };
  const clear = ()=> grid.querySelectorAll('.is-drop-before, .is-drop-after').forEach(e=> e.classList.remove('is-drop-before', 'is-drop-after'));
  const move = (e)=>{
    const dx = e.clientX - st.x0, dy = e.clientY - st.y0;
    if(!st.moved && Math.hypot(dx, dy) < 6) return;
    if(!st.moved){ st.moved = true; tile.classList.add('is-dragging'); }
    e.preventDefault();
    tile.style.transform = `translate(${dx}px, ${dy}px)`;
    tile.style.pointerEvents = 'none';
    const under = document.elementFromPoint(e.clientX, e.clientY);
    tile.style.pointerEvents = '';
    const other = under && under.closest ? under.closest('.extra-tile[data-side]') : null;
    clear(); st.over = null;
    if(other && other!==tile && other.parentElement===grid){
      const ro = other.getBoundingClientRect();
      st.over = other.dataset.side; st.before = e.clientX < ro.left + ro.width / 2;
      other.classList.add(st.before ? 'is-drop-before' : 'is-drop-after');
    }
  };
  const up = ()=>{
    window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
    tile.classList.remove('is-dragging'); tile.style.transform = ''; clear();
    if(!st.moved || !st.over) return;
    const order = orderedExtraSides(id).filter(s=> s!==side), j = order.indexOf(st.over);
    if(j < 0) return;
    order.splice(st.before ? j : j + 1, 0, side);
    if(order.join()!==orderedExtraSides(id).join()) saveExtraOrder(id, order, side);
  };
  window.addEventListener('pointermove', move, { passive:false }); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
}

/* ---------- En el visor: marcas, pie de foto y recorrer la galería ---------- */
let viewerMarksOn = false;
let viewerList = null;   // { items:[{ pid, photoId }], i } (abierto desde la galería)
function viewerLayer(id, cls, tag){
  let el = document.getElementById(id);
  if(!el){ el = document.createElement(tag || 'div'); el.id = id; el.className = cls; document.getElementById('pinchOverlay').appendChild(el); }
  return el;
}
/* Todo lo de alrededor de la foto, al abrirla o cambiar de foto */
function viewerExtrasSync(){
  viewerLayer('viewerMarks', 'viewer-marks').hidden = false;
  viewerMarksPlace(false); viewerCaption(); viewerMarksList(); viewerHint(viewerMarksOn ? t('mk.hint') : '');
}
function viewerExtrasClear(){
  viewerList = null; viewerMarksOn = false;
  ['viewerMarks', 'viewerCap', 'viewerMarkList', 'viewerHint'].forEach(id=>{ const el = document.getElementById(id); if(el){ el.innerHTML = ''; el.hidden = true; el.dataset.sig = ''; } });
}
/* Los puntos van encima de la foto tal y como se ve (con su zoom); se recolocan en cada gesto */
function viewerMarksPlace(animate){
  const layer = document.getElementById('viewerMarks'); if(!layer) return;
  const v = viewerState, marks = v ? photoMarksOf(v.pid, v.side) : [];
  const sig = v ? v.pid + '|' + v.side + '|' + JSON.stringify(marks) : '';
  if(layer.dataset.sig!==sig){
    layer.dataset.sig = sig;
    layer.innerHTML = marks.map((m, i)=> `<button type="button" class="vm-pin" data-i="${i}" onclick="viewerMarkTap(${i})" aria-label="${escapeHTML(t('mk.pin').replace('{n}', i + 1) + (m.t ? ': ' + m.t : ''))}"><span aria-hidden="true">${i + 1}</span></button>`).join('');
  }
  layer.classList.toggle('is-edit', viewerMarksOn);
  layer.classList.toggle('is-animating', !!animate);
  if(!marks.length) return;
  const w = v.w0 * v.s, h = v.h0 * v.s;
  layer.querySelectorAll('.vm-pin').forEach((b, i)=>{ const m = marks[i]; if(m) b.style.transform = `translate3d(${(v.x + m.x * w).toFixed(1)}px, ${(v.y + m.y * h).toFixed(1)}px, 0)`; });
}
function viewerMarksBtnHTML(){
  const v = viewerState; if(!v) return '';
  const n = photoMarksOf(v.pid, v.side).length;
  return `<button type="button" class="chip viewer-marks-btn${viewerMarksOn ? ' active' : ''}" id="viewerMarksBtn" aria-pressed="${viewerMarksOn}" onclick="viewerMarksToggle()">${icon('pin')} ${t('mk.title')}${n ? ` <span class="vm-n">${n}</span>` : ''}</button>`;
}
function viewerMarksToggle(){
  viewerMarksOn = !viewerMarksOn;
  viewerMarksRefresh(-1);
  const b = document.getElementById('viewerMarksBtn'); if(b) b.focus({ preventScroll:true });
  viewerHint(viewerMarksOn ? t('mk.hint') : '');
}
function viewerHint(text){
  const el = viewerLayer('viewerHint', 'viewer-hint', 'p'); el.setAttribute('role', 'status');
  el.textContent = text || ''; el.hidden = !text;
  if(text){ el.style.animation = 'none'; void el.offsetWidth; el.style.animation = ''; }   // (el aviso vuelve a verse y se desvanece)
}
/* Con «Marcas» activado, tocar la foto pone una marca ahí (y pide su nota) */
async function viewerMarkAddAt(cx, cy){
  const v = viewerState; if(!v) return;
  const x = (cx - v.x) / (v.w0 * v.s), y = (cy - v.y) / (v.h0 * v.s);
  if(!(x >= 0 && x <= 1 && y >= 0 && y <= 1)) return;
  const note = await askText(t('mk.note_q'), '');
  if(note===null || note===undefined || viewerState!==v) return;
  const list = photoMarksOf(v.pid, v.side).concat([{ x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000, t: String(note).trim().slice(0, 140) }]);
  await setPhotoMeta(v.pid, v.side, 'marcas', list);
  viewerMarksRefresh(list.length - 1);
}
/* Sin dedo (teclado, lector de pantalla): una marca en el centro de lo que se ve */
function viewerMarkAddCenter(){ viewerMarkAddAt(innerWidth / 2, innerHeight / 2); }
/* Tocar un punto: con «Marcas» activado, se edita; si no, enseña su nota */
function viewerMarkTap(i){
  const v = viewerState; if(!v) return;
  const m = photoMarksOf(v.pid, v.side)[i]; if(!m) return;
  if(viewerMarksOn) viewerMarkOpen(i);
  else showToast(`${i + 1}. ${m.t || t('mk.no_note')}`, { replace:true, duration:5000 });
}
async function viewerMarkOpen(i){
  const v = viewerState; if(!v) return;
  const list = photoMarksOf(v.pid, v.side); const m = list[i]; if(!m) return;
  const txt = await askText(t('mk.edit_q').replace('{n}', i + 1), m.t || '');
  if(txt===null || txt===undefined || viewerState!==v) return;
  list[i] = Object.assign({}, m, { t: String(txt).trim().slice(0, 140) });
  await setPhotoMeta(v.pid, v.side, 'marcas', list);
  viewerMarksRefresh(i);
}
async function viewerMarkRemove(i){
  const v = viewerState; if(!v) return;
  const list = photoMarksOf(v.pid, v.side); const gone = list.splice(i, 1)[0]; if(!gone) return;
  await setPhotoMeta(v.pid, v.side, 'marcas', list);
  viewerMarksRefresh(-1);
  const add = document.querySelector('#viewerMarkList [data-fk="mk-add"]'); if(add) add.focus({ preventScroll:true });
  showToast(t('mk.removed'), { replace:true, action:{ label:t('common.undo'), fn: async ()=>{
    const l2 = photoMarksOf(v.pid, v.side); l2.splice(Math.min(i, l2.length), 0, gone);
    await setPhotoMeta(v.pid, v.side, 'marcas', l2);
    if(viewerState && viewerState.pid===v.pid && viewerState.side===v.side) viewerMarksRefresh(-1);
    else render();
  } } });
}
function viewerMarksRefresh(focusI){
  const b = document.getElementById('viewerMarksBtn'); if(b) b.outerHTML = viewerMarksBtnHTML();
  viewerMarksPlace(false); viewerMarksList();
  if(focusI >= 0){ const p = document.querySelector(`#viewerMarkList [data-fk="mk-e${focusI}"]`); if(p) p.focus({ preventScroll:true }); }
}
/* La lista de marcas con sus notas (para leerlas, cambiarlas o quitarlas) */
function viewerMarksList(){
  const v = viewerState, el = viewerLayer('viewerMarkList', 'viewer-mark-list');
  if(!v || !viewerMarksOn){ el.hidden = true; el.innerHTML = ''; return; }
  const marks = photoMarksOf(v.pid, v.side);
  el.hidden = false;
  const bar = document.getElementById('viewerBar');   // (justo encima de la barra, que puede ocupar una o dos filas)
  if(bar && !bar.hidden){ const top = bar.getBoundingClientRect().top; if(top > 0) el.style.bottom = Math.round(innerHeight - top + 8) + 'px'; }
  el.innerHTML = (marks.length ? `<ol>${marks.map((m, i)=> `<li><span class="vml-n" aria-hidden="true">${i + 1}</span><span class="vml-t">${escapeHTML(m.t || t('mk.no_note'))}</span><button type="button" class="round-btn is-sm" data-fk="mk-e${i}" onclick="viewerMarkOpen(${i})" aria-label="${escapeHTML(t('mk.edit').replace('{n}', i + 1))}" title="${escapeHTML(t('mk.edit').replace('{n}', i + 1))}">${icon('pencil')}</button><button type="button" class="round-btn is-sm" onclick="viewerMarkRemove(${i})" aria-label="${escapeHTML(t('mk.remove').replace('{n}', i + 1))}" title="${escapeHTML(t('mk.remove').replace('{n}', i + 1))}">${icon('trash')}</button></li>`).join('')}</ol>` : '')
    + `<button type="button" class="chip" data-fk="mk-add" onclick="viewerMarkAddCenter()">${icon('plus')} ${t('mk.add_center')}</button>`;
}
/* Arriba: la pieza (si vienes de la galería), su posición y el pie de foto */
function viewerCaption(){
  const v = viewerState, el = viewerLayer('viewerCap', 'viewer-cap');
  if(!v){ el.hidden = true; el.innerHTML = ''; return; }
  const p = productForPhotoId(v.pid); if(!p){ el.hidden = true; return; }
  const note = photoNoteOf(v.pid, v.side), L = viewerList;
  const nav = L && L.items.length > 1 ? `<span class="vc-nav"><button type="button" class="round-btn is-sm" id="viewerPrev" onclick="viewerListStep(-1,'viewerPrev')" aria-label="${escapeHTML(t('gal.prev'))}" title="${escapeHTML(t('gal.prev'))}">${icon('chevronLeft')}</button><span class="vc-pos">${(L.i + 1).toLocaleString(numLocale())} / ${L.items.length.toLocaleString(numLocale())}</span><button type="button" class="round-btn is-sm" id="viewerNext" onclick="viewerListStep(1,'viewerNext')" aria-label="${escapeHTML(t('gal.next'))}" title="${escapeHTML(t('gal.next'))}">${icon('chevronRight')}</button></span>` : '';
  const name = L ? `<button type="button" class="vc-name" onclick="viewerOpenFicha()"><b>${escapeHTML(p.name)}</b><small>${escapeHTML([p.platformName, p.year].filter(Boolean).join(' · '))} · ${t('gal.open')}</small></button>` : '';
  el.innerHTML = nav + name + `<button type="button" class="vc-note${note ? '' : ' is-empty'}" onclick="editPhotoNote('${escapeHTML(v.pid)}','${v.side}')" aria-label="${escapeHTML(note ? t('photo.note_edit') + ': ' + note : t('photo.note_add'))}">${note ? escapeHTML(note) : `${icon('pencil')} ${t('photo.note_add')}`}</button>`;
  el.hidden = false;
}
function viewerListStep(dir, refocus){
  const L = viewerList; if(!L || L.items.length < 2) return false;
  L.i = (L.i + dir + L.items.length) % L.items.length;
  viewerMarksOn = false;
  openPhotoViewer(L.items[L.i].photoId, 'front');
  if(refocus){ const b = document.getElementById(refocus); if(b) b.focus({ preventScroll:true }); }
  return true;
}
function viewerOpenFicha(){
  const v = viewerState; if(!v) return;
  const p = productForPhotoId(v.pid); closePhotoViewer(); if(p) goProduct(p.id);
}
/* Galería: tocar una foto la abre a pantalla completa y se pasa a la siguiente deslizando */
function openGalleryViewer(i){
  const list = galleryList();
  viewerList = { items: list.map(p=>{ const ph = shownPhotoId(p); return { pid:p.id, photoId: hasPhoto(ph, 'front') ? ph : p.id }; }), i };
  const it = viewerList.items[i]; if(!it){ viewerList = null; return; }
  openPhotoViewer(it.photoId, 'front');
}
/* Tocar la foto con «Marcas» activado (ratón o dedo: el clic llega igual). Si se ha
   arrastrado la foto (ampliada), no es un toque: no pone marca */
let _vmDown = null;
document.addEventListener('pointerdown', (e)=>{ _vmDown = viewerMarksOn ? { x:e.clientX, y:e.clientY } : null; }, true);
document.addEventListener('click', (e)=>{
  if(!(viewerMarksOn && viewerState && e.target && e.target.id==='pinchImg')) return;
  if(_vmDown && Math.hypot(e.clientX - _vmDown.x, e.clientY - _vmDown.y) > 8) return;
  e.preventDefault(); viewerMarkAddAt(e.clientX, e.clientY);
});

/* ---------- Ventanas a pantalla completa de esta versión (sesión de fotos, comparar copias) ---------- */
function v1119Overlay(){ return (typeof ps!=='undefined' && ps) ? ps.root : (typeof cmpState!=='undefined' && cmpState) ? cmpState.root : null; }
function v1119OverlayClose(){ if(ps) psClose(); else if(cmpState) closeCompareCopies(); }
function overlayOpen(id, cls, labelledBy){
  const root = document.createElement('div');
  root.id = id; root.className = cls;
  root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-labelledby', labelledBy);
  document.body.appendChild(root);
  document.body.classList.add('has-fs-overlay');
  return root;
}
function overlayClose(root, returnFocus){
  root.remove();
  if(!v1119Overlay()) document.body.classList.remove('has-fs-overlay');
  if(returnFocus && returnFocus.focus && document.contains(returnFocus)) try{ returnFocus.focus({ preventScroll:true }); }catch(e){}
}

/* ---------- Sesión de fotos ---------- */
let psOpts = { what:'front', who:'have', plat:'' };
let ps = null;   // { queue:[{ pid, side }], i, done, skipped, root, returnFocus }
function psSidesFor(what){ return what==='back' ? ['back'] : what==='both' ? ['front', 'back'] : what==='sides' ? SIDE_SLOTS : ['front']; }
/* Las piezas en el orden de tus plataformas y, dentro, por año y nombre */
function psQueue(o){
  const sides = psSidesFor(o.what);
  const order = new Map(); let k = 0;
  getAllCategories().forEach(c=> orderedPlatformsForCategory(c.id, getAllPlatforms().filter(pl=> pl.categoryId===c.id)).forEach(pl=> order.set(pl.id, k++)));
  const list = PRODUCTS.filter(p=> !p.isFolder && (o.who==='all' || p.possession==='tengo') && (!o.plat || p.platformId===o.plat));
  list.sort((a, b)=> ((order.has(a.platformId) ? order.get(a.platformId) : 1e6) - (order.has(b.platformId) ? order.get(b.platformId) : 1e6)) || cmpYearName(a, b));
  const q = [];
  list.forEach(p=> sides.forEach(side=>{ if(!hasPhoto(p.id, side)) q.push({ pid:p.id, side }); }));
  return q;
}
function openPhotoSession(){
  psOpts = { what:'front', who:'have', plat:'' };
  openSheet({ kind:'photo-session', title:t('ps.title'), body:psSetupHTML(), foot:psSetupFootHTML() });
}
function psSetupHTML(){
  const ch = (key, val, label)=> `<button type="button" class="chip ${psOpts[key]===val ? 'active' : ''}" aria-pressed="${psOpts[key]===val}" data-fk="ps-${key}-${val}" onclick="psOpts['${key}']='${val}'; psSetupRefresh()">${escapeHTML(label)}</button>`;
  const plats = getAllPlatforms().filter(pl=> PRODUCTS.some(p=> p.platformId===pl.id));
  return `<p class="settings-note">${t('ps.intro')}</p>
    <div class="sheet-group"><div class="field-label" id="psWhatL">${t('ps.what')}</div><div class="chip-row" role="group" aria-labelledby="psWhatL">${ch('what', 'front', t('photo.front'))}${ch('what', 'back', t('photo.back'))}${ch('what', 'both', t('ps.both'))}${ch('what', 'sides', t('photo.sides'))}</div></div>
    <div class="sheet-group"><div class="field-label" id="psWhoL">${t('ps.who')}</div><div class="chip-row" role="group" aria-labelledby="psWhoL">${ch('who', 'have', t('ps.who_have'))}${ch('who', 'all', t('ps.who_all'))}</div></div>
    <div class="field" data-nosave><label for="psPlat">${t('filter.platform')}</label><select id="psPlat" onchange="psOpts.plat=this.value; psSetupRefresh()"><option value="">${t('val.platform_all')}</option>${plats.map(pl=>`<option value="${escapeHTML(pl.id)}" ${psOpts.plat===pl.id ? 'selected' : ''}>${escapeHTML(pl.name)}</option>`).join('')}</select></div>`;
}
function psSetupFootHTML(){
  const n = psQueue(psOpts).length;
  return `<button type="button" class="btn" onclick="closeSheet()">${t('modal.cancel')}</button><button type="button" class="btn primary" id="psStart" onclick="startPhotoSession()" ${n ? '' : 'disabled'}>${icon('camera')} ${escapeHTML(n ? (n===1 ? t('ps.start1') : t('ps.start').replace('{n}', n.toLocaleString(numLocale()))) : t('ps.none'))}</button>`;
}
function psSetupRefresh(){
  if(!isSheetKind('photo-session')) return;
  const a = document.activeElement, fk = a && a.dataset ? a.dataset.fk : null, id = a && a.id;
  updateSheetBody(psSetupHTML());
  const foot = document.querySelector('#sheetOverlay .sheet-foot'); if(foot) foot.innerHTML = psSetupFootHTML();
  const b = fk ? document.querySelector(`#sheetBody [data-fk="${fk}"]`) : id ? document.getElementById(id) : null; if(b) b.focus();
}
function startPhotoSession(){
  const queue = psQueue(psOpts); if(!queue.length) return;
  const ret = document.querySelector('[data-fk="ps-open"]') || document.activeElement;
  closeSheet();
  ps = { queue, i:0, done:0, skipped:0, root: overlayOpen('photoSession', 'fs-overlay ps', 'psName'), returnFocus: ret };
  psRender();
}
function psRender(focusSel){
  if(!ps) return;
  const root = ps.root, q = ps.queue;
  if(ps.i >= q.length){
    root.innerHTML = `<div class="ps-card is-end">${icon('checkCircle')}<h2 id="psName">${t('ps.end_title')}</h2><p class="ps-meta">${escapeHTML(t('ps.end').replace('{n}', ps.done).replace('{s}', ps.skipped))}</p>
      <button type="button" class="btn primary" id="psEndBtn" onclick="psClose()">${t('copy.done')}</button></div>`;
    const b = document.getElementById('psEndBtn'); if(b) b.focus();
    return;
  }
  const it = q[ps.i], p = PRODUCTS_BY_ID[it.pid];
  if(!p){ ps.i++; return psRender(focusSel); }
  const pv = platVisual(p.platformId), key = 'photo_' + p.id + '_' + it.side;
  const have = PHOTO_SIDES.filter(s=> hasPhoto(p.id, s)).slice(0, 4);
  const pct = (ps.i / q.length * 100).toFixed(1);
  root.innerHTML = `<div class="ps-top"><span class="ps-prog">${escapeHTML(t('ps.pos').replace('{i}', (ps.i + 1).toLocaleString(numLocale())).replace('{n}', q.length.toLocaleString(numLocale())))}</span><span class="ps-bar" aria-hidden="true"><i style="width:${pct}%"></i></span>
      <button type="button" class="round-btn" data-fk="ps-close" onclick="psClose()" aria-label="${escapeHTML(t('ps.finish'))}" title="${escapeHTML(t('ps.finish'))}">${icon('x')}</button></div>
    <div class="ps-card" style="--plat:${pv.color}">
      <p class="ps-need"><span class="side-glyph is-${it.side}" aria-hidden="true"></span>${escapeHTML(t('ps.need').replace('{s}', photoSideLabel(it.side)))}</p>
      <h2 id="psName">${escapeHTML(p.name)}</h2>
      <p class="ps-meta">${pv.code ? `<span class="code-chip" aria-hidden="true">${escapeHTML(pv.code)}</span> ` : ''}${escapeHTML([p.platformName, p.year, regionShortText(p)].filter(Boolean).join(' · '))}</p>
      ${have.length ? `<div class="ps-have" role="group" aria-label="${escapeHTML(t('ps.has'))}">${have.map(s=> `<span class="ps-thumb">${photoImgHTML(p, s, 'thumb', 'data-eager="1"')}<small>${escapeHTML(photoSideLabel(s))}</small></span>`).join('')}</div>` : ''}
      <div class="ps-acts">
        <label class="btn primary ps-shot photo-picker" data-fk="ps-shot">${icon('camera')} ${t('ps.shoot')}<input type="file" accept="image/*" capture="environment" class="sr-only" aria-label="${escapeHTML(t('ps.shoot') + ' — ' + p.name + ' — ' + photoSideLabel(it.side))}" onchange="psFile(this,'${escapeHTML(key)}')"></label>
        <label class="btn photo-picker" data-fk="ps-pick">${icon('image')} ${t('ps.pick')}<input type="file" accept="image/*" class="sr-only" aria-label="${escapeHTML(t('ps.pick') + ' — ' + p.name + ' — ' + photoSideLabel(it.side))}" onchange="psFile(this,'${escapeHTML(key)}')"></label>
        <button type="button" class="btn btn-ghost" data-fk="ps-skip" onclick="psSkip()">${icon('next')} ${t('ps.skip')}</button>
      </div>
      <p class="ps-count" aria-live="polite">${escapeHTML(t('ps.count').replace('{n}', ps.done).replace('{s}', ps.skipped))}</p>
    </div>`;
  hydratePhotos(root);
  const f = root.querySelector(focusSel || '[data-fk="ps-shot"] input'); if(f) f.focus({ preventScroll:true });
}
async function psFile(input, key){
  const file = input.files && input.files[0]; input.value = '';
  if(!file || !ps) return;
  const S = ps, it = S.queue[S.i];
  const lab = input.closest('label'); if(lab) lab.classList.add('is-busy');
  const ok = await savePhotoFile(key, file);
  if(lab) lab.classList.remove('is-busy');
  if(ps!==S || !ok) return;   // (cancelada en el editor: sigue en la misma pieza)
  S.done++;
  if(it && it.side==='front' && typeof autoBarcodeFromFile==='function') autoBarcodeFromFile(it.pid, file);
  showToast(t('photo.saved'), { ok:true, replace:true });
  S.i++; psRender();
}
function psSkip(){ if(!ps) return; ps.skipped++; ps.i++; psRender('[data-fk="ps-skip"]'); }
function psClose(){
  if(!ps) return;
  const S = ps; ps = null;
  overlayClose(S.root, null);
  render().then(()=>{ const b = document.querySelector('[data-fk="ps-open"]') || S.returnFocus; if(b && b.focus && document.contains(b)) try{ b.focus({ preventScroll:true }); }catch(e){} });
  if(S.done) showToast(S.done===1 ? t('ps.saved1') : t('ps.saved_n').replace('{n}', S.done), { ok:true, replace:true });
}

/* ---------- Comparar dos copias, lado a lado ---------- */
let cmpState = null;   // { pid, a:{ c, side }, b:{ c, side }, zoom:null|{ x, y }, root, returnFocus }
function copiesWithPhotos(p){ return copiesOf(p).filter(c=> hasPhoto(c.photoId, 'front') || hasPhoto(c.photoId, 'back')); }
function openCompareCopies(id){
  const p = PRODUCTS_BY_ID[id]; if(!p) return;
  const list = copiesWithPhotos(p); if(list.length < 2) return;
  const side = (c)=> hasPhoto(c.photoId, 'front') ? 'front' : 'back';
  cmpState = { pid:id, a:{ c:list[0].id, side:side(list[0]) }, b:{ c:list[1].id, side:side(list[1]) }, zoom:null, returnFocus: document.activeElement, root: overlayOpen('cmpCopies', 'fs-overlay cmp', 'cmpTitle') };
  cmpRender('#cmpClose');
}
function cmpPaneHTML(k){
  const S = cmpState, p = PRODUCTS_BY_ID[S.pid], list = copiesWithPhotos(p), cur = S[k];
  const c = list.find(x=> x.id===cur.c) || list[0]; cur.c = c.id;
  const sides = ['front', 'back'].filter(s=> hasPhoto(c.photoId, s)); if(!sides.includes(cur.side)) cur.side = sides[0];
  const lab = t('copy.n').replace('{n}', c.n);
  return `<section class="cmp-pane" aria-label="${escapeHTML(lab)}">
    <div class="cmp-tools"><div class="chip-row" role="group" aria-label="${escapeHTML(t('cmp.which'))}">${list.map(x=> `<button type="button" class="chip ${x.id===c.id ? 'active' : ''}" aria-pressed="${x.id===c.id}" data-fk="cmp-${k}-${x.id}" onclick="cmpSet('${k}','c','${x.id}')">${escapeHTML(t('copy.n').replace('{n}', x.n))}</button>`).join('')}</div>
      ${sides.length > 1 ? `<div class="chip-row" role="group" aria-label="${escapeHTML(t('photo.photos'))}">${sides.map(s=> `<button type="button" class="chip ${s===cur.side ? 'active' : ''}" aria-pressed="${s===cur.side}" data-fk="cmp-${k}-${s}" onclick="cmpSet('${k}','side','${s}')">${escapeHTML(photoSideLabel(s))}</button>`).join('')}</div>` : ''}</div>
    <div class="cmp-photo" onclick="cmpZoom(event)">${photoImgHTML(p, cur.side, 'full', 'data-eager="1"', c.photoId)}</div>
    <p class="cmp-line">${escapeHTML(copyLine(p, c))}</p>
  </section>`;
}
function cmpRender(focusSel){
  const S = cmpState; if(!S) return;
  const p = PRODUCTS_BY_ID[S.pid];
  S.root.innerHTML = `<div class="cmp-top"><h2 id="cmpTitle">${escapeHTML(t('cmp.title'))}<small>${escapeHTML(p.name)}</small></h2><button type="button" class="round-btn" id="cmpClose" onclick="closeCompareCopies()" aria-label="${escapeHTML(t('common.close'))}" title="${escapeHTML(t('common.close'))}">${icon('x')}</button></div>
    <div class="cmp-grid">${cmpPaneHTML('a')}${cmpPaneHTML('b')}</div>
    <p class="cmp-hint" id="cmpHint">${t('cmp.hint')}</p>`;
  hydratePhotos(S.root);
  cmpApplyZoom();
  const f = focusSel && S.root.querySelector(focusSel); if(f) f.focus({ preventScroll:true });
}
function cmpSet(k, field, val){ if(!cmpState) return; cmpState[k][field] = val; cmpRender(`[data-fk="cmp-${k}-${val}"]`); }
/* Tocar un punto acerca las dos fotos en ese mismo sitio; otro toque las aleja */
function cmpZoom(e){
  const S = cmpState; if(!S) return;
  if(S.zoom) S.zoom = null;
  else { const box = e.currentTarget.getBoundingClientRect(); S.zoom = { x: Math.min(1, Math.max(0, (e.clientX - box.left) / box.width)), y: Math.min(1, Math.max(0, (e.clientY - box.top) / box.height)) }; }
  cmpApplyZoom();
}
function cmpApplyZoom(){
  const S = cmpState; if(!S) return;
  S.root.classList.toggle('is-zoomed', !!S.zoom);
  S.root.querySelectorAll('.cmp-photo img').forEach(img=>{
    img.style.transformOrigin = S.zoom ? `${(S.zoom.x * 100).toFixed(1)}% ${(S.zoom.y * 100).toFixed(1)}%` : '';
    img.style.transform = S.zoom ? 'scale(2.5)' : '';
  });
  const h = document.getElementById('cmpHint'); if(h) h.textContent = t(S.zoom ? 'cmp.hint_zoomed' : 'cmp.hint');
}
function closeCompareCopies(){
  const S = cmpState; if(!S) return; cmpState = null;
  overlayClose(S.root, S.returnFocus);
}

/* ---------- Importar muchas fotos de una vez (por su código de barras) ---------- */
let biState = null;   // { total, i, done:[{ pid, side }], pending:[{ id, file, url, code, reason }], q, sel, noReader }
/* La foto cuadrada y recortada sola (como «Auto» en el editor); luego se puede retocar con «Editar» */
async function autoPhotoData(file){
  const { img, url } = await decodeImageFile(file);
  try{
    const w = img.naturalWidth, h = img.naturalHeight;
    if(isSquareImage(w, h)) return squarePhotoDataURL(img, w, h, 0, null, 0);
    let det = null;
    try{ det = await detectPieceQuad(img, w, h); }catch(_){ det = null; }
    return det && det.quad ? squarePhotoQuadDataURL(img, w, h, 0, det.quad, 0) : squarePhotoDataURL(img, w, h, 0, null, 0);
  } finally { URL.revokeObjectURL(url); }
}
/* El primer hueco libre: delantera, trasera o una extra */
function freePhotoSlot(id){ return !hasPhoto(id, 'front') ? 'front' : !hasPhoto(id, 'back') ? 'back' : freeExtraSlot(id); }
async function bulkImportFiles(input){
  const files = [...(input.files || [])].filter(f=> !f.type || /^image\//.test(f.type)); input.value = '';
  if(!files.length) return;
  if(biState) biState.pending.forEach(x=> URL.revokeObjectURL(x.url));
  const S = biState = { total:files.length, i:0, done:[], pending:[], q:'', sel:null, noReader:false };
  // (si cierras la hoja mientras importa, sigue sola y al acabar avisa de cuántas ha colocado)
  openSheet({ kind:'bulk-import', title:t('bi.title'), body:biBodyHTML(), foot:`<button type="button" class="btn primary" onclick="closeSheet()">${t('copy.done')}</button>`, onClose: ()=>{ if(biState!==S) return; if(S.i < S.total){ S.closed = true; showToast(t('bi.bg'), { replace:true, duration:4000 }); } else biClose(true); } });
  const det = typeof getBarcodeDetector==='function' ? await getBarcodeDetector() : null;
  S.noReader = !det;
  for(const file of files){
    if(biState!==S) return;
    let codes = [];
    if(det){
      try{ const bmp = await createImageBitmap(file); try{ codes = await detectBarcodesIn(bmp, bmp.width, bmp.height); } finally { try{ bmp.close(); }catch(e){} } }catch(e){ codes = []; }
    }
    const vals = [...new Set((codes || []).map(c=> c && c.value).filter(Boolean))];
    const code = vals.length===1 ? vals[0] : '';
    const match = code ? productsByBarcode(code) : [];
    const p = match.length===1 ? match[0] : null;
    const slot = p ? freePhotoSlot(p.id) : null;
    if(p && slot){
      let ok = false;
      try{ ok = !!(await storePhotoData('photo_' + p.id + '_' + slot, await autoPhotoData(file))); }catch(e){ ok = false; }
      if(ok) S.done.push({ pid:p.id, side:slot }); else S.pending.push(biPend(file, code, 'fail'));
    } else S.pending.push(biPend(file, code, !vals.length ? (det ? 'nocode' : 'noreader') : vals.length > 1 ? 'several' : !match.length ? 'unknown' : match.length > 1 ? 'many' : 'full'));
    S.i++;
    biRefresh();
  }
  if(biState===S && S.closed){   // (cerraste la hoja mientras importaba)
    biClose(true);
    showToast(t('bi.bg_done').replace('{n}', S.done.length).replace('{r}', S.pending.length), { ok: !S.pending.length, duration:8000 });
  }
}
function biPend(file, code, reason){ return { id:'bi' + Math.random().toString(36).slice(2, 9), file, url:URL.createObjectURL(file), code, reason }; }
function biBodyHTML(){
  const S = biState; if(!S) return '';
  const busy = S.i < S.total;
  const prog = `<div class="bi-prog" role="status" aria-live="polite"><span>${escapeHTML(busy ? t('bi.working').replace('{i}', S.i + 1).replace('{n}', S.total) : t('bi.finished').replace('{n}', S.done.length).replace('{r}', S.pending.length))}</span><span class="ps-bar" aria-hidden="true"><i style="width:${(S.i / S.total * 100).toFixed(1)}%"></i></span></div>`;
  const done = S.done.length ? `<div class="sheet-group"><div class="field-label">${t('bi.done_t')}</div><ul class="bi-done">${S.done.map(d=>{ const p = PRODUCTS_BY_ID[d.pid]; return `<li>${icon('check')}<span>${escapeHTML(p ? p.name : d.pid)} <small>${escapeHTML(photoSideLabel(d.side))}</small></span></li>`; }).join('')}</ul></div>` : '';
  let pend = '';
  if(S.pending.length){
    const tokens = S.sel ? searchTokens(S.q) : [];
    const cands = tokens.length ? sortGames(PRODUCTS.filter(p=> !p.isFolder && productMatchesSearch(p, tokens) && freePhotoSlot(p.id))).slice(0, 8) : [];
    const fmt = (c)=> typeof formatBarcode==='function' ? formatBarcode(c) : c;
    pend = `<div class="sheet-group"><div class="field-label">${t('bi.pending_t')}</div>${S.noReader ? `<p class="settings-note">${t('bi.no_reader')}</p>` : ''}
      <ul class="bi-pend">${S.pending.map(x=> `<li class="bi-item${S.sel===x.id ? ' is-sel' : ''}"><button type="button" class="bi-thumb" data-fk="bi-${x.id}" onclick="biPick('${x.id}')" aria-pressed="${S.sel===x.id}" aria-label="${escapeHTML(t('bi.choose') + ' — ' + x.file.name)}"><img src="${x.url}" alt=""></button>
        <span class="bi-why">${escapeHTML(t('bi.why.' + x.reason).replace('{code}', x.code ? fmt(x.code) : ''))}</span>
        <button type="button" class="round-btn is-sm" onclick="biDrop('${x.id}')" aria-label="${escapeHTML(t('bi.drop') + ' — ' + x.file.name)}" title="${escapeHTML(t('bi.drop'))}">${icon('x')}</button></li>`).join('')}</ul>
      ${S.sel ? `<div class="searchbar bi-search" role="search">${icon('search', 'ico-search')}<input type="search" id="biQ" value="${escapeHTML(S.q)}" placeholder="${escapeHTML(t('bi.search_ph'))}" aria-label="${escapeHTML(t('bi.search_ph'))}" oninput="biState.q=this.value; clearTimeout(window._biT); window._biT=setTimeout(biRefresh, 160)" autocomplete="off"></div>
        <div class="est-add-list">${cands.map(p=>{ const pv = platVisual(p.platformId); return `<button type="button" class="est-add-row" onclick="biAssign('${escapeHTML(p.id)}')"><span class="code-chip" style="--plat:${pv.color}" aria-hidden="true">${escapeHTML(pv.code || '#')}</span><span class="est-add-name">${escapeHTML(p.name)}<small>${escapeHTML([p.platformName, p.year].filter(Boolean).join(' · ') + ' · ' + t('bi.goes_to').replace('{s}', photoSideLabel(freePhotoSlot(p.id))))}</small></span>${icon('plus')}</button>`; }).join('') || `<p class="section-sub">${t(tokens.length ? 'filter.no_results' : 'bi.type_name')}</p>`}</div>` : `<p class="section-sub">${t('bi.tap_photo')}</p>`}</div>`;
  }
  return prog + done + pend;
}
function biRefresh(){
  if(!isSheetKind('bulk-import') || !biState) return;
  const a = document.activeElement, hadQ = a && a.id==='biQ', pos = hadQ ? a.selectionStart : 0, fk = a && a.dataset ? a.dataset.fk : null;
  const body = document.getElementById('sheetBody'), y = body ? body.scrollTop : 0;
  updateSheetBody(biBodyHTML());
  if(body) body.scrollTop = y;
  if(hadQ){ const q = document.getElementById('biQ'); if(q){ q.focus(); try{ q.setSelectionRange(pos, pos); }catch(e){} } }
  else if(fk){ const b = document.querySelector(`#sheetBody [data-fk="${fk}"]`); if(b) b.focus({ preventScroll:true }); }
}
function biPick(id){
  if(!biState) return;
  biState.sel = biState.sel===id ? null : id; biState.q = '';
  biRefresh();
  const q = document.getElementById('biQ'); if(q) q.focus();
}
function biDrop(id){
  const S = biState; if(!S) return;
  const i = S.pending.findIndex(x=> x.id===id); if(i < 0) return;
  URL.revokeObjectURL(S.pending[i].url); S.pending.splice(i, 1); if(S.sel===id) S.sel = null;
  biRefresh();
  const next = document.querySelector('#sheetBody .bi-thumb') || document.querySelector('#sheetOverlay .sheet-foot .btn'); if(next) next.focus({ preventScroll:true });
}
async function biAssign(pid){
  const S = biState; if(!S || !S.sel) return;
  const x = S.pending.find(y=> y.id===S.sel), slot = freePhotoSlot(pid); if(!x || !slot) return;
  const ok = await savePhotoFile('photo_' + pid + '_' + slot, x.file);   // (pasa por el editor, como cualquier foto que eliges tú)
  if(!ok || biState!==S) return;
  S.done.push({ pid, side:slot });
  URL.revokeObjectURL(x.url); S.pending = S.pending.filter(y=> y!==x); S.sel = null; S.q = '';
  biRefresh();
  const next = document.querySelector('#sheetBody .bi-thumb') || document.querySelector('#sheetOverlay .sheet-foot .btn'); if(next) next.focus({ preventScroll:true });
}
function biClose(fromSheet){
  const S = biState; biState = null;
  if(S) S.pending.forEach(x=> URL.revokeObjectURL(x.url));
  if(!fromSheet) closeSheet();
  render();
}
