/* La Colección App — util.js
   Utilidades sin estado: escapado de HTML, normalización para búsquedas, orden natural, iconos SVG, slug, fechas y descargas. */

/* Versión visible de la app (esquina y Ajustes). Mantener igual que CACHE_NAME de sw.js. */
const APP_VERSION = '11.2.0';

/* Iconos propios en línea (nada de emoji) — heredan el color del texto
   que los rodea, así encajan igual en modo claro y oscuro. v11: un único
   juego coherente (rejilla de 24, trazo 1.8), tamaño controlado por CSS
   (.ico = 1.15em). Los nombres antiguos se conservan. */
const ICON_PATHS = {
  moon: '<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z" fill="currentColor" stroke="none"/>',
  sun: '<circle cx="12" cy="12" r="4.2" fill="currentColor" stroke="none"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.7 1.7M17.4 17.4l1.7 1.7M4.9 19.1l1.7-1.7M17.4 6.6l1.7-1.7"/>',
  folder: '<path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h5l2 2h8A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5Z"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  camera: '<path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z"/><circle cx="12" cy="13.5" r="3.2"/>',
  archive: '<rect x="3.5" y="7" width="17" height="13" rx="1.2"/><path d="M3.5 7 5.5 4h13l2 3M9.5 11.5h5"/>',
  shuffle: '<path d="M7 7h10l-3-3M17 17H7l3 3"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v2.4M12 19.1v2.4M21.5 12h-2.4M4.9 12H2.5M18.7 5.3l-1.7 1.7M7 17l-1.7 1.7M18.7 18.7 17 17M7 7 5.3 5.3"/>',
  settings: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.3 9.3a2.7 2.7 0 1 1 3.9 2.4c-.9.5-1.2 1-1.2 2"/><circle cx="12" cy="16.9" r="0.4" fill="currentColor"/>',
  globe: '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
  layers: '<path d="M12 3 3 8l9 5 9-5-9-5Z"/><path d="M3 13l9 5 9-5"/>',
  plusCircle: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v9M7.5 12h9"/>',
  pencil: '<path d="M4 20l1-4.5L15.5 5 19 8.5 8.5 19 4 20Z"/>',
  checkCircle: '<circle cx="12" cy="12" r="9"/><path d="m8 12.3 2.6 2.6L16.3 9"/>',
  sortIcon: '<path d="M7 5v14M7 5 4 8M7 5l3 3M17 19V5M17 19l-3-3M17 19l3-3"/>',
  toggleIcon: '<rect x="3" y="8" width="18" height="8" rx="4"/><circle cx="16" cy="12" r="2.2" fill="currentColor"/>',
  home: '<path d="M4 11 12 4l8 7"/><path d="M6 9.5V20h12V9.5"/><path d="M10 20v-5h4v5"/>',
  collection: '<rect x="4" y="4" width="7" height="7" rx="1.2"/><rect x="13" y="4" width="7" height="7" rx="1.2"/><rect x="4" y="13" width="7" height="7" rx="1.2"/><rect x="13" y="13" width="7" height="7" rx="1.2"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1" fill="currentColor"/><circle cx="4.5" cy="12" r="1" fill="currentColor"/><circle cx="4.5" cy="18" r="1" fill="currentColor"/>',
  chart: '<path d="M4 20h16"/><rect x="5.5" y="11" width="3" height="6.5" rx="0.6"/><rect x="10.5" y="6" width="3" height="11.5" rx="0.6"/><rect x="15.5" y="13" width="3" height="4.5" rx="0.6"/>',
  research: '<circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5 5"/><path d="M8.8 8.9a1.8 1.8 0 1 1 2.6 1.6c-.6.3-.9.7-.9 1.3"/><circle cx="10.5" cy="13.6" r="0.35" fill="currentColor"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>',
  chevronLeft: '<path d="m14.5 5.5-6.5 6.5 6.5 6.5"/>',
  chevronRight: '<path d="m9.5 5.5 6.5 6.5-6.5 6.5"/>',
  chevronUp: '<path d="m5.5 14.5 6.5-6.5 6.5 6.5"/>',
  chevronDown: '<path d="m5.5 9.5 6.5 6.5 6.5-6.5"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/>',
  rows: '<rect x="4" y="5" width="4" height="4" rx="0.8"/><rect x="4" y="15" width="4" height="4" rx="0.8"/><path d="M11 7h9M11 17h9"/>',
  expand: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  image: '<rect x="3.5" y="4.5" width="17" height="15" rx="1.5"/><circle cx="9" cy="10" r="1.6"/><path d="m4 18 5-5 4 4 3-3 4 4"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  refresh: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3L19.5 9"/><path d="M19.5 4.5V9H15"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  flip: '<path d="M4 9a8 8 0 0 1 14-3l2 2M20 15a8 8 0 0 1-14 3l-2-2"/><path d="M20 4v4h-4M4 20v-4h4"/>',
  printer: '<path d="M7 9V4h10v5"/><rect x="4" y="9" width="16" height="7" rx="1.2"/><path d="M7 14h10v6H7z"/>',
  box: '<path d="M4 8l8-4 8 4v8l-8 4-8-4Z"/><path d="M4 8l8 4 8-4M12 12v8"/>',
  download: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5"/><path d="M4.5 16.5V19a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1v-2.5"/>',
  upload: '<path d="M12 15V4M7.5 8.5 12 4l4.5 4.5"/><path d="M4.5 16.5V19a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1v-2.5"/>',
  /* v11.1 «Vitrina» */
  shield: '<path d="M12 3.2 19 6v5.2c0 4.6-3 7.8-7 9.6-4-1.8-7-5-7-9.6V6Z"/>',
  cartridge: '<rect x="5.5" y="3" width="13" height="18" rx="1.6"/><rect x="8.5" y="6.5" width="7" height="6" rx="0.8"/><path d="M9 17h6"/>',
  doc: '<path d="M7 3h7l4 4v14H7Z"/><path d="M14 3v4h4M10 12h5M10 16h5"/>',
  book: '<path d="M5 5.5A2.5 2.5 0 0 1 7.5 3H19v15H7.5A2.5 2.5 0 0 0 5 20.5Z"/><path d="M5 20.5A.5.5 0 0 0 7.5 21H19"/>',
  wall: '<rect x="3.5" y="3.5" width="4.5" height="6" rx="0.6"/><rect x="9.75" y="3.5" width="4.5" height="6" rx="0.6"/><rect x="16" y="3.5" width="4.5" height="6" rx="0.6"/><rect x="3.5" y="14.5" width="4.5" height="6" rx="0.6"/><rect x="9.75" y="14.5" width="4.5" height="6" rx="0.6"/><rect x="16" y="14.5" width="4.5" height="6" rx="0.6"/>',
  covers: '<rect x="4" y="4" width="7" height="9" rx="1"/><rect x="13" y="4" width="7" height="9" rx="1"/><path d="M4 17h7M13 17h7M4 20h5M13 20h5"/>',
};
function icon(name, extraClass){
  const d = ICON_PATHS[name];
  if(!d) return '';
  return `<svg class="ico${extraClass ? ' '+extraClass : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${d}</svg>`;
}

/* ---------- Utilidades de texto (v10.1) ----------
   escapeHTML: todo texto escrito por el usuario (nombres, notas, etiquetas…)
   se muestra tal cual, sin que "<", ">" o "&" se interpreten como código.
   normText: versión "buscable" de un texto — sin tildes, sin mayúsculas —
   para que "pokemon" encuentre "Pokémon".
   compareNames: orden alfabético natural ("Ed 2" antes que "Ed 10"). */
function escapeHTML(s){
  return String(s===null||s===undefined ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function normText(s){
  return String(s===null||s===undefined ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
}
function compareNames(a, b){
  return String(a||'').localeCompare(String(b||''), 'es', {sensitivity:'base', numeric:true});
}

/* ----- Añadir / eliminar productos (juegos, CD-ROMs, DVDs, lo que sea) ----- */
function slugify(s){
  return (s||'producto').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'').slice(0,40) || 'producto';
}
function daysSince(iso){
  if(!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  return isNaN(ms) ? null : Math.max(0, Math.floor(ms/86400000));
}
function downloadBlob(blob, filename){
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
}
/* Quita el símbolo inicial (✓, ⬇, ⬆, ↺, +…) de las etiquetas heredadas cuando
   el botón ya lleva su propio icono, para no mostrarlo dos veces. */
function plainLabel(s){ return String(s).replace(/^[✓⬇⬆↺↻✕+]\s*/u, ''); }
