/* La Colección App — app.js
   Arranque: tour de bienvenida, tema, init() y registro del service worker. Se carga el último. */

/* ---------- Tour guiado de bienvenida ---------- */
/* Aparece la primera vez que se abre esta copia del archivo (a la vez que
   el estado en blanco, sin datos de ejemplo). Guía a la persona a crear de
   verdad una categoría, una plataforma y un objeto — no son diapositivas,
   avanza solo cuando la acción real ha ocurrido. */
let tourActive = false;
let tourStep = 0;
const TOUR_STEPS = [
  { type:'modal', icon:'layers', titleKey:'tour.welcome.title', bodyKey:'tour.welcome.body', ctaKey:'tour.welcome.cta' },
  { type:'action', icon:'layers', navigate:()=>goPage('coleccion'), selector:'#tour-add-category',
    bodyKey:'tour.category.body',
    done:()=> (OVERRIDES.customCategories||[]).length>0 },
  { type:'action', icon:'plusCircle', selector:'#fab',
    bodyKey:'tour.platform.body',
    done:()=> (OVERRIDES.customPlatforms||[]).length>0 },
  { type:'action', icon:'folder', selector:'#tour-add-folder',
    bodyKey:'tour.folder.body',
    done:()=> Object.values(OVERRIDES.folders||{}).some(arr=>arr && arr.length>0) },
  { type:'action', icon:'plusCircle', selector:'#fab',
    bodyKey:'tour.object.body',
    done:()=> (OVERRIDES.customProducts||[]).length>0 },
  { type:'modal', icon:'checkCircle', titleKey:'tour.final.title', bodyKey:'tour.final.body', ctaKey:'tour.final.cta' },
];
async function startTour(){
  tourActive = true;
  tourStep = 0;
  renderTourOverlay();
}
async function tourNext(){
  if(tourStep >= TOUR_STEPS.length - 1){ await finishTour(); return; }
  tourStep++;
  const next = TOUR_STEPS[tourStep];
  if(next.navigate) next.navigate(); else renderTourOverlay();
}
async function finishTour(){
  tourActive = false;
  document.body.classList.remove('tour-running');
  OVERRIDES.tourSeen = true;
  await persistOverrides();
  clearTourHighlight();
  const c = document.getElementById('tourOverlay'); if(c) c.innerHTML = '';
}
function clearTourHighlight(){
  document.querySelectorAll('.tour-spotlight, .tour-spotlight-fixed').forEach(el=> el.classList.remove('tour-spotlight','tour-spotlight-fixed'));
}
function advanceTourIfDone(){
  const step = TOUR_STEPS[tourStep];
  if(step && step.type==='action' && step.done && step.done()) tourStep++;
  renderTourOverlay();
}
function renderTourOverlay(){
  const container = document.getElementById('tourOverlay');
  if(!container) return;
  clearTourHighlight();
  if(!tourActive){ container.innerHTML = ''; return; }
  const step = TOUR_STEPS[tourStep];
  if(!step) return;
  if(step.type==='modal'){
    container.innerHTML = `<div class="tour-modal-backdrop">
      <div class="tour-modal">
        <div class="tour-modal-icon">${icon(step.icon)}</div>
        <div class="tour-modal-title">${t(step.titleKey)}</div>
        <div class="tour-modal-body">${t(step.bodyKey)}</div>
        <button class="btn primary btn-block" onclick="tourNext()">${t(step.ctaKey)}</button>
        ${tourStep===0 ? `<button class="tour-skip is-spaced" onclick="finishTour()">${t('tour.skip')}</button>` : ``}
      </div>
    </div>`;
  } else {
    const target = document.querySelector(step.selector);
    if(target){
      // el "+" flotante ya tiene su propia posición fija en pantalla — si le
      // forzamos position:relative para el halo, se sale de su sitio. Para
      // botones normales (posición estática) sí hace falta forzarla.
      const isFixedEl = window.getComputedStyle(target).position !== 'static';
      target.classList.add(isFixedEl ? 'tour-spotlight-fixed' : 'tour-spotlight');
    }
    const actionSteps = TOUR_STEPS.filter(s=>s.type==='action');
    const stepNum = TOUR_STEPS.slice(0, tourStep+1).filter(s=>s.type==='action').length;
    const dots = actionSteps.map((s,i)=> `<span class="tour-dot ${i<stepNum?'tour-dot-done':''} ${i===stepNum-1?'tour-dot-current':''}"></span>`).join('');
    container.innerHTML = `<div class="tour-caption">
      <div class="tour-caption-head">
        <span class="tour-caption-icon">${icon(step.icon)}</span>
        <div class="tour-dots">${dots}</div>
      </div>
      <div class="tour-caption-text">${t(step.bodyKey)}</div>
      <div class="tour-caption-foot"><span class="tour-caption-count">${t('tour.step')} ${stepNum} ${t('tour.of')} ${actionSteps.length}</span><button class="tour-skip" onclick="finishTour()">${t('tour.skip')}</button></div>
    </div>`;
    // v11: que el botón señalado quede a la vista, por encima del recuadro del
    // tour (en pantallas cortas quedaba tapado y no se podía pulsar).
    document.body.classList.add('tour-running');
    if(target && target.classList.contains('tour-spotlight')){
      setTimeout(()=>{
        const cap = container.querySelector('.tour-caption');
        const capTop = cap ? cap.getBoundingClientRect().top : window.innerHeight;
        const r = target.getBoundingClientRect();
        if(r.bottom > capTop - 16 || r.top < 96){
          const y = window.scrollY + r.top - Math.max(96, (capTop - r.height) / 2);
          window.scrollTo(0, Math.max(0, y));
        }
      }, 90);
    }
  }
}

/* ---------- INIT ---------- */
/* Tema claro/oscuro — se guarda en el mismo sitio que el resto de tus
   ajustes, así que se recuerda la próxima vez que abras el archivo. */
function applyTheme(theme){
  document.documentElement.setAttribute('data-theme', theme==='dark' ? 'dark' : 'light');
  try{ localStorage.setItem('coleccion-theme', theme==='dark' ? 'dark' : 'light'); }catch(e){}
  const btn = document.getElementById('themeToggle');
  if(btn){
    // en oscuro se ofrece pasar a claro (icono sol, tono dorado) y viceversa
    // (icono luna, tono azul) — el color representa lo que vas a activar.
    btn.innerHTML = icon(theme==='dark' ? 'sun' : 'moon');
    btn.classList.remove('mode-sun','mode-moon');
    btn.classList.add(theme==='dark' ? 'mode-sun' : 'mode-moon');
    btn.setAttribute('aria-label', theme==='dark' ? t('settings.to_light') : t('settings.to_dark'));
    btn.title = btn.getAttribute('aria-label');
  }
}
async function setTheme(theme){
  OVERRIDES.theme = theme==='dark' ? 'dark' : 'light';
  applyTheme(OVERRIDES.theme);
  refreshSettingsSheet();
  await persistOverrides();
}
async function toggleTheme(){
  await setTheme(OVERRIDES.theme === 'dark' ? 'light' : 'dark');
}

/* Botones de la barra superior según los ajustes guardados (se llama al
   arrancar y tras importar una copia, que puede traer otro tema/moneda). */
function refreshChromeSettings(){
  applyTheme(OVERRIDES.theme === 'dark' ? 'dark' : 'light');
  document.documentElement.lang = OVERRIDES.lang || 'es';
  const set = document.getElementById('settingsToggle');
  if(set){ set.innerHTML = icon('settings'); set.setAttribute('aria-label', t('settings.title')); set.title = t('settings.title'); }
  const srch = document.getElementById('searchToggle');
  if(srch){ srch.innerHTML = icon('search'); srch.setAttribute('aria-label', t('dash.search')); srch.title = t('dash.search'); }
  const back = document.getElementById('backBtn');
  if(back){ back.innerHTML = icon('chevronLeft') + `<span>${t('common.back')}</span>`; back.setAttribute('aria-label', t('common.back')); }
  const skip = document.getElementById('skipLink'); if(skip) skip.textContent = t('common.skip');
  updateFab();   // v11.2: el botón flotante lleva texto (se traduce con el idioma)
  const brand = document.getElementById('brandBtn'); if(brand) brand.setAttribute('aria-label', t('nav.dashboard') + ' — La Colección App');
  ['topnav','bottomnav'].forEach(id=>{ const n = document.getElementById(id); if(n) n.setAttribute('aria-label', t('nav.sections')); });
  const crumbs = document.getElementById('crumbs'); if(crumbs) crumbs.setAttribute('aria-label', t('nav.path'));
}
async function init(){
  await ensureOverridesLoaded();
  await loadAppMeta();
  await runMigrations();
  refreshChromeSettings();
  if(unreadableDataOnLoad) showSaveError(true, t('load.unreadable'));
  if(storageReadFailed) showSaveError(true, t('load.read_failed'));
  // v10.2: pedir almacenamiento persistente (sin bloquear el arranque)
  refreshStorageState(true);
  // v11.6: acceso directo «¿Lo tengo?» (mantener pulsado el icono de la app) → index.html?accion=lotengo
  let wantScanner = false;
  try{ wantScanner = new URLSearchParams(location.search).get('accion')==='lotengo'; }catch(e){}
  try{ history.replaceState({ coleccionApp:true, depth:0 }, '', wantScanner ? location.pathname : undefined); }catch(e){}
  const indexOk = await loadPhotoIndex();
  buildProducts();
  attachFlipHandlers();
  render();
  // si no se pudo leer el índice de fotos, se comprueba pieza a pieza y se repinta
  if(!indexOk) probePhotoIndex(PRODUCTS.map(p=>p.id)).then(()=>render());
  if(!OVERRIDES.tourSeen && !storageReadFailed) startTour();
  else if(wantScanner && !storageReadFailed && typeof openScanner==='function') openScanner();
}
/* Al volver a la app (otra pestaña, otra app del móvil), se relee el índice de
   fotos: si se añadieron o quitaron fotos en otra ventana, se ven sin recargar. */
document.addEventListener('visibilitychange', async ()=>{
  if(document.visibilityState !== 'visible' || !PHOTO_INDEX.ready) return;
  const before = photoIndexSignature();
  if(!(await loadPhotoIndex())) return;
  const a = document.activeElement;
  const editing = a && a.matches && a.matches('input, textarea, select');
  if(photoIndexSignature() !== before && !editing && !isModalOpen() && !isSheetOpen()) render();
});
init();

if('serviceWorker' in navigator){
  window.addEventListener('load', () => {
    // updateViaCache:'none' → el navegador comprueba sw.js sin fiarse de su caché HTTP,
    // así las versiones nuevas llegan antes (v10.2)
    navigator.serviceWorker.register('sw.js', { updateViaCache:'none' }).catch(()=>{ /* si falla, la app sigue funcionando igual, solo sin modo sin-conexión */ });
  });
}
