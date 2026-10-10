/* La Colección App — scanner.js (v11.6)
   «¿Lo tengo?»: apuntas con la cámara al código de barras de una caja y la
   app te dice al momento si esa pieza la tienes, si te falta (y dónde
   buscarla a la venta) o, si el código es nuevo, a qué pieza pertenece.

   · Usa el lector de códigos que trae el propio navegador (BarcodeDetector,
     incluido en Chrome para Android): sin librerías nuevas y sin conexión.
   · Donde no existe (iPhone, ordenador) o sin permiso de cámara, se busca
     escribiendo: nombre, número de catálogo o los números del código.
   · Los códigos se guardan en el campo «Código de barras» que ya tiene cada
     ficha (OVERRIDES.products[id].barcode): no cambia ningún dato ni formato.
   · «Buscar códigos en tus fotos» lee los códigos de las fotos que ya tienes
     y, antes de guardar nada, enseña lo encontrado para confirmarlo.
   · Al subir una foto nueva de una pieza sin código, se mira si se ve uno. */

/* =====================================================================
   1. CÓDIGOS DE BARRAS: normalizar, mostrar, elegir y buscar
   ===================================================================== */
const SCAN_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'codabar'];
const RETAIL_FORMATS = ['ean_13', 'upc_a', 'ean_8', 'upc_e'];
/* Para comparar: sin espacios ni guiones; un UPC-A (12 cifras) es el mismo
   código que su EAN-13 con un 0 delante. */
function normBarcode(s){
  let d = String(s == null ? '' : s).replace(/[\s\-–—.]/g, '').toUpperCase();
  if(/^\d{12}$/.test(d)) d = '0' + d;
  return d;
}
/* Para leer: 4 542740 314499 (EAN-13) · 1234 5678 (EAN-8) */
function formatBarcode(s){
  const d = String(s == null ? '' : s).replace(/\s+/g, '');
  if(/^\d{13}$/.test(d)) return d[0] + ' ' + d.slice(1, 7) + ' ' + d.slice(7);
  if(/^\d{8}$/.test(d)) return d.slice(0, 4) + ' ' + d.slice(4);
  return d;
}
/* De todo lo que ha leído el lector, los códigos que interesan, sin repetir.
   Los libros y revistas japoneses llevan dos: el ISBN/JAN y uno de precio
   que empieza por 191/192; ese segundo se descarta si hay otro. */
function pickBarcodes(found){
  const out = [], seen = new Set();
  (found || []).forEach(b=>{
    const value = String(b && b.rawValue || '').trim();
    const n = normBarcode(value);
    if(!n || seen.has(n)) return;
    seen.add(n);
    out.push({ value, format: b.format || '', n });
  });
  const retail = (x)=> RETAIL_FORMATS.includes(x.format) || /^\d{8}$|^\d{12,13}$/.test(x.n);
  const priceCode = (x)=> /^19[12]\d{10}$/.test(x.n);
  let list = out.some(retail) ? out.filter(retail) : out;
  if(list.length > 1 && list.some(x=>!priceCode(x))) list = list.filter(x=>!priceCode(x));
  return list;
}
function productsByBarcode(code){
  const n = normBarcode(code);
  if(!n) return [];
  return PRODUCTS.filter(p=> p.barcode && normBarcode(p.barcode)===n);
}
let _barcodeDetector, _barcodeDetectorReady = null;
/* El lector del navegador (o null si este navegador no lo tiene) */
function getBarcodeDetector(){
  if(_barcodeDetectorReady) return _barcodeDetectorReady;
  _barcodeDetectorReady = (async ()=>{
    if(!('BarcodeDetector' in window)) return null;
    try{
      let formats = SCAN_FORMATS;
      if(typeof BarcodeDetector.getSupportedFormats === 'function'){
        const sup = await BarcodeDetector.getSupportedFormats();
        formats = SCAN_FORMATS.filter(f=> sup.includes(f));
        if(!formats.length) return null;
      }
      _barcodeDetector = new BarcodeDetector({ formats });
      return _barcodeDetector;
    }catch(e){ return null; }
  })();
  return _barcodeDetectorReady;
}
/* Códigos en una imagen (foto, vídeo o lienzo). Si en una foto pequeña no se
   ve ninguno, se prueba otra vez con la foto ampliada al doble: en una foto
   de la caja entera el código sale pequeño. */
async function detectBarcodesIn(source, w, h){
  const det = await getBarcodeDetector();
  if(!det) return [];
  let found = [];
  try{ found = await det.detect(source); }catch(e){ found = []; }
  let codes = pickBarcodes(found);
  if(!codes.length && w && h && Math.max(w, h) <= 1600){
    try{
      const c = document.createElement('canvas'); c.width = w * 2; c.height = h * 2;
      const x = c.getContext('2d'); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
      x.drawImage(source, 0, 0, c.width, c.height);
      codes = pickBarcodes(await det.detect(c));
    }catch(e){}
  }
  return codes;
}

/* =====================================================================
   2. «BUSCAR A LA VENTA» (también en la ficha de las piezas que te faltan)
   ===================================================================== */
const HUNT_STORES = [
  { id:'yahoo',    name:'Yahoo! Auctions', url:(q)=> 'https://auctions.yahoo.co.jp/search/search?p=' + encodeURIComponent(q) },
  { id:'mercari',  name:'Mercari',         url:(q)=> 'https://jp.mercari.com/search?keyword=' + encodeURIComponent(q) },
  { id:'surugaya', name:'Suruga-ya',       url:(q)=> 'https://www.suruga-ya.jp/search?search_word=' + encodeURIComponent(q) },
  { id:'buyee',    name:'Buyee',           url:(q)=> 'https://buyee.jp/item/search/query/' + encodeURIComponent(q) },
  { id:'ebay',     name:'eBay',            url:(q)=> 'https://www.ebay.com/sch/i.html?_nkw=' + encodeURIComponent(q) },
  { id:'wallapop', name:'Wallapop',        url:(q)=> 'https://es.wallapop.com/app/search?keywords=' + encodeURIComponent(q) },
];
function huntQueryFor(p){ return String(p.nameJp || '').trim() || String(p.name || '').trim(); }
function huntHTML(p, where){
  const q = huntQueryFor(p);
  const id = 'hunt_' + where + '_' + p.id;
  return `<section class="hunt" aria-labelledby="${id}_t">
    <h3 class="hunt-title" id="${id}_t">${icon('target')} ${t('hunt.title')}</h3>
    <label class="sr-only" for="${id}">${t('hunt.query')}</label>
    <input type="search" id="${id}" class="hunt-q" value="${escapeHTML(q)}" data-default="${escapeHTML(q)}" oninput="huntQueryChanged(this)" autocomplete="off" enterkeyhint="search" ${p.nameJp ? 'lang="ja"' : ''}>
    <div class="hunt-grid">${HUNT_STORES.map(s=>`<a class="hunt-link" data-hunt="${s.id}" href="${escapeHTML(s.url(q))}" target="_blank" rel="noopener noreferrer"><span>${s.name}</span>${icon('external')}</a>`).join('')}</div>
    <p class="hunt-note">${t(p.nameJp ? 'hunt.note_jp' : 'hunt.note')}</p>
  </section>`;
}
function huntQueryChanged(input){
  const q = input.value.trim() || input.dataset.default || '';
  const box = input.closest('.hunt'); if(!box) return;
  box.querySelectorAll('[data-hunt]').forEach(a=>{
    const s = HUNT_STORES.find(x=>x.id===a.dataset.hunt);
    if(s) a.href = s.url(q);
  });
}

/* =====================================================================
   3. «¿LO TENGO?»: la cámara y los resultados
   ===================================================================== */
let scanner = null;
let scanContinuous = false;   // «Escaneo seguido» (solo mientras la app está abierta)
function isScannerOpen(){ return !!scanner; }
function scannerHasSheet(){ return !!(scanner && scanner.sheet); }
async function openScanner(){
  if(scanner) return;
  if(isSheetOpen()) closeSheet();
  if(isViewerOpen()) closePhotoViewer();
  const root = document.createElement('div');
  root.id = 'scanner'; root.className = 'scanner';
  root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-labelledby', 'scanTitle');
  root.innerHTML = `
    <video class="scan-video" playsinline muted aria-hidden="true"></video>
    <div class="scan-shade" aria-hidden="true"><div class="scan-window"><i class="scan-c tl"></i><i class="scan-c tr"></i><i class="scan-c br"></i><i class="scan-c bl"></i><i class="scan-line"></i></div></div>
    <div class="scan-top">
      <button type="button" class="round-btn scan-round scan-close" onclick="closeScanner()" aria-label="${escapeHTML(t('common.close'))}">${icon('x')}</button>
      <h2 class="scan-title" id="scanTitle">${t('scan.title')}</h2>
      <button type="button" class="round-btn scan-round scan-torch" id="scanTorch" onclick="toggleScanTorch()" aria-label="${escapeHTML(t('scan.torch'))}" aria-pressed="false" hidden>${icon('flash')}</button>
    </div>
    <div class="scan-status" id="scanStatus" aria-live="polite"><span class="scan-dot" aria-hidden="true"></span><span class="scan-status-text">${t('scan.starting')}</span></div>
    <div class="scan-help"><b>${t('scan.aim')}</b><span>${t('scan.aim_sub')}</span></div>
    <div class="scan-panel">
      <button type="button" class="btn scan-type" onclick="scannerManual()">${icon('search')} ${t('scan.type')}</button>
      ${scanSwitchHTML('scanCont', 'dark')}
      <button type="button" class="link-btn scan-photos-link" onclick="closeScanner(); openPhotoBarcodeSearch()">${icon('image')} ${t('scan.photos_link')}</button>
    </div>
    <div class="scan-sheet" id="scanSheet" hidden></div>`;
  document.body.appendChild(root);
  document.documentElement.classList.add('is-scanning');
  scanner = { root, video: root.querySelector('.scan-video'), stream:null, track:null, timer:0, sheet:'', last:'', lastAt:0,
    busy:false, camera:'starting', torchOn:false, flashTimer:0, returnFocus: document.activeElement };
  const close = root.querySelector('.scan-close'); if(close) close.focus();
  const ok = await scannerStartCamera();
  if(scanner && scanner.root===root && !ok) scannerManual(scanner.camera);
}
function closeScanner(){
  const s = scanner; if(!s) return;
  scanner = null;
  clearTimeout(s.timer); clearTimeout(s.flashTimer);
  scannerStopCamera(s);
  s.root.remove();
  document.documentElement.classList.remove('is-scanning');
  if(s.returnFocus && s.returnFocus.focus && document.contains(s.returnFocus)) try{ s.returnFocus.focus(); }catch(_){}
}
function scanSwitchHTML(id, tone){
  return `<label class="scan-switch ${tone==='dark' ? 'is-dark' : ''}">
      <span class="scan-switch-text"><span class="scan-switch-name">${t('scan.continuous')}</span><span class="scan-switch-sub">${t('scan.continuous_sub')}</span></span>
      <input type="checkbox" role="switch" id="${id}" class="switch" ${scanContinuous ? 'checked' : ''} onchange="scanContinuous=this.checked; document.querySelectorAll('#scanner input.switch').forEach(i=>{ i.checked=scanContinuous; })">
    </label>`;
}
function scannerSetStatus(kind, text){
  const s = scanner; if(!s) return;
  const el = s.root.querySelector('#scanStatus'); if(!el) return;
  el.className = 'scan-status' + (kind ? ' is-' + kind : '');
  const tx = el.querySelector('.scan-status-text'); if(tx) tx.textContent = text;
}
async function scannerStartCamera(){
  const s = scanner; if(!s) return false;
  const det = await getBarcodeDetector();
  if(!det){ s.camera = 'unsupported'; return false; }
  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){ s.camera = 'unsupported'; return false; }
  let stream = null;
  try{
    stream = await navigator.mediaDevices.getUserMedia({ audio:false, video:{ facingMode:{ ideal:'environment' }, width:{ ideal:1920 }, height:{ ideal:1080 } } });
  }catch(err){
    s.camera = err && (err.name==='NotAllowedError' || err.name==='SecurityError') ? 'denied' : 'nocamera';
    return false;
  }
  if(scanner !== s){ stream.getTracks().forEach(tr=>tr.stop()); return false; }
  s.stream = stream; s.track = stream.getVideoTracks()[0] || null;
  s.video.srcObject = stream;
  try{ await s.video.play(); }catch(e){}
  s.camera = 'on';
  s.root.classList.add('is-live');
  scannerSetStatus('', t('scan.searching'));
  // linterna, si la cámara la tiene
  try{
    const caps = s.track && s.track.getCapabilities ? s.track.getCapabilities() : {};
    const torch = s.root.querySelector('#scanTorch'); if(torch) torch.hidden = !caps.torch;
  }catch(e){}
  clearTimeout(s.timer);
  scanTick();
  return true;
}
function scannerStopCamera(s){
  s = s || scanner; if(!s) return;
  clearTimeout(s.timer);
  if(s.stream){ s.stream.getTracks().forEach(tr=>{ try{ tr.stop(); }catch(e){} }); }
  s.stream = null; s.track = null; s.torchOn = false;
  if(s.video) try{ s.video.srcObject = null; }catch(e){}
  if(s.root) s.root.classList.remove('is-live');
}
async function toggleScanTorch(){
  const s = scanner; if(!s || !s.track) return;
  const next = !s.torchOn;
  try{ await s.track.applyConstraints({ advanced:[{ torch: next }] }); s.torchOn = next; }catch(e){}
  const b = s.root.querySelector('#scanTorch'); if(b) b.setAttribute('aria-pressed', String(s.torchOn));
}
/* Bucle de lectura: unas 7 veces por segundo, sin solaparse */
function scanTick(){
  const s = scanner; if(!s) return;
  s.timer = setTimeout(scanTick, 140);
  if(s.sheet || s.busy || !s.stream || document.hidden) return;
  if(!s.video || s.video.readyState < 2) return;
  s.busy = true;
  getBarcodeDetector()
    .then(det=> det ? det.detect(s.video) : [])
    .then(found=>{ if(scanner===s){ const codes = pickBarcodes(found); if(codes.length) scannerHandleCode(codes[0].value); } })
    .catch(()=>{})
    .then(()=>{ s.busy = false; });
}
/* Un código leído (de la cámara o escrito) */
function scannerHandleCode(code){
  const s = scanner; if(!s) return;
  const now = Date.now();
  if(normBarcode(code)===normBarcode(s.last) && now - s.lastAt < 2500) return;   // el mismo código, otra vez: se ignora
  s.last = code; s.lastAt = now;
  try{ if(navigator.vibrate) navigator.vibrate(35); }catch(e){}
  const list = productsByBarcode(code);
  if(scanContinuous && list.length===1 && s.stream){ scannerFlash(list[0]); return; }
  scannerShowFor(code, list);
}
function scannerShowFor(code, list){
  list = list || productsByBarcode(code);
  if(list.length===1) scannerShowPiece(list[0].id, code);
  else if(list.length > 1) scannerShowMulti(code, list);
  else scannerShowNew(code);
}
/* «Escaneo seguido»: aviso breve y la cámara sigue leyendo */
function scannerFlash(p){
  const s = scanner; if(!s) return;
  const have = p.possession==='tengo';
  scannerSetStatus(have ? 'have' : 'missing', (have ? t('scan.quick_have') : t('scan.quick_missing')).replace('{name}', p.name));
  clearTimeout(s.flashTimer);
  s.flashTimer = setTimeout(()=>{ if(scanner===s) scannerSetStatus('', t('scan.searching')); }, 2600);
}
function scannerSheet(kind, html){
  const s = scanner; if(!s) return;
  const el = s.root.querySelector('#scanSheet');
  el.innerHTML = `<div class="scan-grip" aria-hidden="true"></div>` + html;
  el.hidden = false; el.dataset.kind = kind; el.scrollTop = 0;
  s.sheet = kind;
  s.root.classList.add('has-sheet');
  hydratePhotos(el);
  const f = el.querySelector('[data-autofocus]') || el.querySelector('.scan-verdict h3, .scan-sheet-title');
  if(f){ if(!f.matches('input, button, a')) f.setAttribute('tabindex', '-1'); try{ f.focus({ preventScroll:true }); }catch(e){} }
}
/* «Escanear otra»: se cierra el resultado y la cámara vuelve a leer */
function scannerResume(){
  const s = scanner; if(!s) return;
  if(s.camera!=='on'){ scannerManual(s.camera==='starting' ? '' : s.camera); return; }
  const el = s.root.querySelector('#scanSheet');
  el.hidden = true; el.innerHTML = ''; delete el.dataset.kind;
  s.sheet = ''; s.last = ''; s.lastAt = 0;
  s.root.classList.remove('has-sheet');
  scannerSetStatus('', t('scan.searching'));
  const c = s.root.querySelector('.scan-close'); if(c) c.focus();
}
/* «atrás» o Escape: primero se cierra el resultado; luego, el escáner */
function scannerBack(){
  if(!scanner) return;
  if(scanner.sheet && scanner.camera==='on') scannerResume();
  else closeScanner();
}
function scanVerdictHTML(kind, title, sub){
  const ic = kind==='have' ? 'check' : kind==='missing' ? 'target' : 'barcode';
  return `<div class="scan-verdict is-${kind}"><span class="scan-verdict-ico" aria-hidden="true">${icon(ic)}</span>
    <div class="scan-verdict-text"><h3>${title}</h3><p>${sub}</p></div></div>`;
}
function scanPieceCardHTML(p, code){
  const pv = platVisual(p.platformId);
  const region = regionKeysFor(p).map(k=>k.label).join(' / ');
  const meta = [p.year, region].filter(Boolean).map(escapeHTML).join(' · ');
  const thumb = hasPhoto(p.id, 'front')
    ? `<span class="scan-thumb">${photoImgHTML(p, 'front', 'thumb', 'data-eager="1"')}</span>`
    : `<span class="scan-thumb is-tile" style="--plat:${pv.color}" aria-hidden="true">${icon('cartridge')}</span>`;
  const bc = code || p.barcode;
  return `<div class="scan-piece">${thumb}
    <div class="scan-piece-text">
      <span class="scan-piece-name">${escapeHTML(p.name)}</span>
      <span class="scan-piece-meta">${pv.code ? `<span class="code-chip" style="--plat:${pv.color}" aria-hidden="true">${escapeHTML(pv.code)}</span>` : ''}<span>${meta || escapeHTML(p.platformName || '')}</span></span>
      ${bc ? `<span class="scan-piece-code">${icon('barcode')}<span>${escapeHTML(formatBarcode(bc))}</span></span>` : ''}
    </div></div>`;
}
function scanIncludesHTML(p){
  const items = checklistForCategory(p.categoryId).filter(it=> it.key!=='tengo');
  if(!items.length) return '';
  return `<div class="scan-includes"><span class="scan-label">${t('p.includes')}</span><div class="scan-inc-list">
    ${items.map(it=>{ const on = !!(p.components||{})[it.key]; return `<span class="scan-inc ${on ? 'is-on' : ''}">${icon(on ? 'check' : 'x')}<span>${escapeHTML(checklistLabel(it))}</span><span class="sr-only">${on ? t('p.yes') : t('p.no')}</span></span>`; }).join('')}
  </div></div>`;
}
function scanActionsHTML(id){
  return `<div class="scan-actions">
    <button type="button" class="btn" onclick="scannerResume()">${icon('barcode')} ${t('scan.again')}</button>
    ${id ? `<button type="button" class="btn primary" onclick="scannerOpenPiece('${id}')">${t('scan.open_piece')}</button>` : ''}
  </div>`;
}
function scannerShowPiece(id, code){
  const p = PRODUCTS_BY_ID[id]; if(!p) return;
  const have = p.possession==='tengo';
  let html = have ? scanVerdictHTML('have', t('scan.have'), t('scan.have_sub'))
                  : scanVerdictHTML('missing', t('scan.missing'), t('scan.missing_sub'));
  html += scanPieceCardHTML(p, code);
  if(have){
    const complete = isComplete(p, p);
    const chips = (complete===null ? '' : `<span class="completo-badge ${complete ? 'completo-yes' : 'completo-no'}">${complete ? icon('check') : ''}${t('p.complete')}: ${complete ? t('p.yes') : t('p.no')}</span>`)
      + (shownSealed(p) ? `<span class="badge badge-sealed">${t('state.sealed')}</span>` : '') + productBadgesHTML(p, { noRegion:true });
    if(chips.trim()) html += `<div class="status-chips scan-chips">${chips}</div>`;
    html += scanIncludesHTML(p);
  } else {
    html += `<button type="button" class="btn scan-got" onclick="scannerGotIt('${p.id}')">${icon('check')} ${t('scan.got_it')}</button>`;
    html += huntHTML(p, 'scan');
  }
  if(p.summary) html += `<p class="scan-summary">${escapeHTML(p.summary)}</p>`;
  html += scanActionsHTML(p.id);
  scannerSheet(have ? 'have' : 'missing', html);
}
function scannerShowMulti(code, list){
  let html = scanVerdictHTML('multi', t('scan.multi').replace('{n}', list.length), escapeHTML(formatBarcode(code)));
  html += `<div class="scan-list">${list.map(p=> scanRowHTML(p, `<button type="button" class="btn btn-sm" onclick="scannerShowPiece('${p.id}')">${t('scan.see')}</button>`)).join('')}</div>`;
  html += scanActionsHTML('');
  scannerSheet('multi', html);
}
function scanRowHTML(p, action){
  const pv = platVisual(p.platformId);
  const region = regionKeysFor(p).map(k=>k.label).join(' / ');
  const state = p.possession==='tengo' ? (shownSealed(p) ? t('state.sealed') : t('legend.have')) : t('legend.missing');
  const meta = [p.platformName, p.year, region].filter(Boolean).map(escapeHTML).join(' · ');
  return `<div class="scan-row">
    ${pv.code ? `<span class="code-chip" style="--plat:${pv.color}" aria-hidden="true">${escapeHTML(pv.code)}</span>` : ''}
    <span class="scan-row-text"><span class="scan-row-name">${escapeHTML(p.name)}</span><span class="scan-row-meta">${meta}${meta ? ' · ' : ''}<span class="${p.possession==='tengo' ? 'is-have' : 'is-missing'}">${state}</span>${p.barcode ? ` · <span class="scan-nowrap">${escapeHTML(formatBarcode(p.barcode))}</span>` : ''}</span></span>
    ${action}
  </div>`;
}
/* Código que no está en ninguna pieza: se busca la pieza y se le asigna */
function scannerShowNew(code){
  const s = scanner; if(!s) return;
  s.newCode = code;
  let html = scanVerdictHTML('new', t('scan.new'), escapeHTML(formatBarcode(code)) + ' · ' + t('scan.new_sub'));
  html += `<div class="searchbar scan-find" role="search">${icon('search', 'ico-search')}
      <input type="search" id="scanFind" placeholder="${escapeHTML(t('scan.find_ph'))}" aria-label="${escapeHTML(t('scan.find_piece'))}" autocomplete="off" enterkeyhint="search" oninput="scannerFindChanged(this.value)">
    </div>
    <div id="scanFindResults" class="scan-list" aria-live="polite"><p class="scan-hint">${t('scan.type_more')}</p></div>
    ${scanSwitchHTML('scanContNew', '')}
    <button type="button" class="btn scan-create" onclick="scannerCreateWithCode()">${icon('plus')} ${t('scan.create')}</button>`;
  html += scanActionsHTML('');
  scannerSheet('new', html);
}
function scannerFindChanged(q){
  const box = document.getElementById('scanFindResults'); if(!box || !scanner) return;
  const tokens = searchTokens(q);
  if(!tokens.length){ box.innerHTML = `<p class="scan-hint">${t('scan.type_more')}</p>`; return; }
  const all = PRODUCTS.filter(p=> productMatchesSearch(p, tokens));
  // primero las que aún no tienen código
  all.sort((a, b)=> (a.barcode ? 1 : 0) - (b.barcode ? 1 : 0));
  const list = all.slice(0, 25);
  if(!list.length){ box.innerHTML = `<p class="scan-hint">${t('scan.no_results')}</p>`; return; }
  box.innerHTML = list.map((p, i)=> scanRowHTML(p, `<button type="button" class="btn btn-sm ${i===0 && !p.barcode ? 'primary' : ''}" onclick="scannerAssign('${p.id}')">${t('scan.assign')}</button>`)).join('')
    + (all.length > list.length ? `<p class="scan-hint">${t('scan.more_results').replace('{n}', all.length - list.length)}</p>` : '');
}
async function scannerAssign(id){
  const s = scanner; if(!s || !s.newCode) return;
  const code = s.newCode;
  const p = PRODUCTS_BY_ID[id]; if(!p) return;
  const old = String(p.barcode || '').trim();
  if(old && normBarcode(old)!==normBarcode(code)){
    if(!await showConfirmModal(t('scan.replace_confirm').replace('{name}', p.name).replace('{old}', formatBarcode(old)).replace('{new}', formatBarcode(code)), { okLabel:t('scan.assign') })) return;
  }
  const others = productsByBarcode(code).filter(x=>x.id!==id);
  if(others.length){
    if(!await showConfirmModal(t('scan.dup_confirm').replace('{other}', others[0].name).replace('{name}', p.name), { okLabel:t('scan.assign') })) return;
  }
  if(scanner!==s) return;
  await updateEditionField(id, 'barcode', code);
  if(view.productId===id) render();
  showToast(t('scan.saved').replace('{name}', p.name), { ok:true, replace:true, duration:6000,
    action:{ label:t('common.undo'), fn: async ()=>{ await updateEditionField(id, 'barcode', old); if(view.productId===id) render(); } } });
  s.newCode = '';
  if(scanContinuous && s.camera==='on') scannerResume();
  else scannerShowPiece(id, code);
}
function scannerCreateWithCode(){
  const s = scanner; if(!s) return;
  const code = s.newCode;
  closeScanner();
  openQuickAdd({ barcode: code });
}
async function scannerGotIt(id){
  const p = PRODUCTS_BY_ID[id]; if(!p) return;
  if(p.possession!=='tengo') await quickTogglePossession(id);
  showToast(t('scan.got_it_done').replace('{name}', p.name), { ok:true, replace:true, duration:6000,
    action:{ label:t('common.undo'), fn: async ()=>{ if(PRODUCTS_BY_ID[id] && PRODUCTS_BY_ID[id].possession==='tengo') await quickTogglePossession(id); if(scanner && scanner.sheet) scannerShowPiece(id); if(!scanner) render(); } } });
  if(scanner) scannerShowPiece(id, scanner.last || p.barcode);
}
function scannerOpenPiece(id){
  closeScanner();
  goProduct(id);
}
/* Buscar escribiendo: siempre a mano, y la única opción si no hay cámara o lector */
function scannerManual(reason){
  const s = scanner; if(!s) return;
  const why = reason==='unsupported' ? t('scan.unsupported') : reason==='denied' ? t('scan.denied') : reason==='nocamera' ? t('scan.nocamera') : '';
  if(why) scannerSetStatus('off', t('scan.no_camera_status'));
  let html = `<h3 class="scan-sheet-title">${t('scan.manual_title')}</h3>`;
  if(why) html += `<p class="scan-note">${why}</p>`;
  html += `<div class="searchbar scan-find" role="search">${icon('search', 'ico-search')}
      <input type="search" id="scanManual" data-autofocus placeholder="${escapeHTML(t('scan.manual_ph'))}" aria-label="${escapeHTML(t('scan.manual_ph'))}" autocomplete="off" enterkeyhint="search" oninput="scannerManualChanged(this.value)">
    </div>
    <div id="scanManualResults" class="scan-list" aria-live="polite"><p class="scan-hint">${t('scan.manual_hint')}</p></div>`;
  html += `<div class="scan-actions">${s.camera==='on' ? `<button type="button" class="btn" onclick="scannerResume()">${icon('barcode')} ${t('scan.back_camera')}</button>` : `<button type="button" class="btn" onclick="closeScanner()">${t('common.close')}</button>`}</div>`;
  scannerSheet('manual', html);
}
function scannerManualChanged(q){
  const box = document.getElementById('scanManualResults'); if(!box) return;
  const raw = String(q || '').trim();
  const tokens = searchTokens(raw);
  if(!tokens.length){ box.innerHTML = `<p class="scan-hint">${t('scan.manual_hint')}</p>`; return; }
  const digits = raw.replace(/[\s\-]/g, '');
  const isCode = /^\d{8,14}$/.test(digits);
  const byCode = isCode ? productsByBarcode(digits) : [];
  const ids = new Set(byCode.map(p=>p.id));
  const all = byCode.concat(PRODUCTS.filter(p=> !ids.has(p.id) && productMatchesSearch(p, tokens)));
  const list = all.slice(0, 25);
  let html = list.map(p=> scanRowHTML(p, `<button type="button" class="btn btn-sm" onclick="scannerShowPiece('${p.id}')">${t('scan.see')}</button>`)).join('');
  if(isCode && !byCode.length) html += `<button type="button" class="btn scan-create" onclick="scannerShowNew('${digits}')">${icon('barcode')} ${t('scan.assign_typed').replace('{code}', escapeHTML(formatBarcode(digits)))}</button>`;
  if(!list.length && !(isCode && !byCode.length)) html = `<p class="scan-hint">${t('scan.no_results')}</p>`;
  box.innerHTML = html;
}
/* Al salir de la app con el escáner abierto se apaga la cámara; al volver,
   se enciende otra vez (si no hay un resultado en pantalla). */
document.addEventListener('visibilitychange', ()=>{
  const s = scanner; if(!s) return;
  if(document.visibilityState==='hidden'){ if(s.stream){ scannerStopCamera(s); s.camera = 'paused'; } }
  else if(s.camera==='paused'){ s.camera = 'starting'; scannerStartCamera().then(ok=>{ if(scanner===s && !ok && !s.sheet) scannerManual(s.camera); }); }
});

/* =====================================================================
   4. CÓDIGOS EN TUS FOTOS
   ===================================================================== */
const PHOTO_SCAN_ORDER = ['back'].concat(EXTRA_SLOTS, ['front']);   // primero la trasera, luego las extra y la delantera
let photoScan = null;
function piecesForPhotoScan(){
  return PRODUCTS.filter(p=> !String(p.barcode || '').trim() && PHOTO_SCAN_ORDER.some(side=> hasPhoto(p.id, side)));
}
function openPhotoBarcodeSearch(){
  if(photoScan && photoScan.running) return;
  photoScan = null;
  openSheet({ kind:'photocodes', title:t('pcode.title'), body: photoScanIntroHTML(null), foot: photoScanFootHTML('intro'),
    onClose: ()=>{ if(photoScan) photoScan.cancel = true; } });
  getBarcodeDetector().then(det=>{
    if(!isSheetKind('photocodes') || (photoScan && photoScan.running)) return;
    updateSheetBody(photoScanIntroHTML(!!det));
    const go = document.getElementById('pcodeStart'); if(go) go.disabled = !det || !piecesForPhotoScan().length;
  });
}
function photoScanIntroHTML(supported){
  const n = piecesForPhotoScan().length;
  let html = `<p class="pcode-intro">${t('pcode.intro')}</p>`;
  html += `<p class="pcode-count">${n===1 ? t('pcode.count_one') : n ? t('pcode.count').replace('{n}', n) : t('pcode.none')}</p>`;
  if(supported===false) html += `<div class="note note-warn">${t('pcode.unsupported')}</div>`;
  return html;
}
function photoScanFootHTML(stage){
  if(stage==='running') return `<button type="button" class="btn" onclick="photoScanStop()">${t('pcode.stop')}</button>`;
  if(stage==='review') return `<button type="button" class="btn" onclick="closeSheet()">${t('modal.cancel')}</button><button type="button" class="btn primary" id="pcodeSave" onclick="photoScanSave()">${t('pcode.save').replace('{n}', '0')}</button>`;
  return `<button type="button" class="btn" onclick="closeSheet()">${t('modal.cancel')}</button><button type="button" class="btn primary" id="pcodeStart" onclick="photoScanStart()" disabled>${icon('barcode')} ${t('pcode.start')}</button>`;
}
function setSheetFoot(html){
  const sh = document.querySelector('#sheetOverlay .sheet'); if(!sh) return;
  let foot = sh.querySelector('.sheet-foot');
  if(!foot){ foot = document.createElement('div'); foot.className = 'sheet-foot'; sh.appendChild(foot); }
  foot.innerHTML = html;
}
async function photoScanStart(){
  const det = await getBarcodeDetector();
  if(!det || !isSheetKind('photocodes')) return;
  const pieces = piecesForPhotoScan();
  const ps = photoScan = { running:true, cancel:false, i:0, n:pieces.length, found:[], missed:[] };
  setSheetFoot(photoScanFootHTML('running'));
  photoScanProgress(ps);
  for(const p of pieces){
    if(ps.cancel) break;
    let hit = null;
    for(const side of PHOTO_SCAN_ORDER){
      if(ps.cancel || !hasPhoto(p.id, side)) continue;
      const key = photoKeyFor(p.id, side);
      try{
        const data = key && await loadPhoto(key);
        if(!data) continue;
        const img = await loadImageURL(data);
        const codes = await detectBarcodesIn(img, img.naturalWidth, img.naturalHeight);
        if(codes.length){ hit = { id:p.id, side, codes, pick: codes[0].value }; break; }
      }catch(e){}
    }
    if(hit) ps.found.push(hit); else ps.missed.push(p.id);
    ps.i++;
    photoScanProgress(ps);
    await new Promise(r=> setTimeout(r, 0));   // deja respirar a la pantalla
  }
  ps.running = false;
  if(photoScan!==ps || !isSheetKind('photocodes')) return;
  photoScanReview(ps);
}
function photoScanStop(){ if(photoScan) photoScan.cancel = true; }
function photoScanProgress(ps){
  if(!isSheetKind('photocodes')) return;
  const pct = ps.n ? Math.round(ps.i / ps.n * 100) : 100;
  updateSheetBody(`<div class="pcode-run">
    <div class="microbar pcode-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${ps.n}" aria-valuenow="${ps.i}" aria-label="${escapeHTML(t('pcode.title'))}"><div class="microbar-fill" style="width:${pct}%;"></div></div>
    <p class="pcode-run-text">${t('pcode.progress').replace('{i}', ps.i).replace('{n}', ps.n).replace('{f}', ps.found.length)}</p>
  </div>`);
}
function photoScanReview(ps){
  const counts = new Map();
  ps.found.forEach(h=> counts.set(normBarcode(h.pick), (counts.get(normBarcode(h.pick)) || 0) + 1));
  let html = '';
  if(ps.found.length){
    html += `<p class="pcode-head">${ps.found.length===1 ? t('pcode.found_one') : t('pcode.found_n').replace('{n}', ps.found.length)}</p><div class="pcode-list">`;
    ps.found.forEach((h, i)=>{
      const p = PRODUCTS_BY_ID[h.id]; if(!p) return;
      const taken = productsByBarcode(h.pick).filter(x=>x.id!==h.id);
      h.checked = !taken.length;
      const warn = taken.length ? `<span class="pcode-warn">${t('pcode.already').replace('{name}', escapeHTML(taken[0].name))}</span>`
                 : counts.get(normBarcode(h.pick)) > 1 ? `<span class="pcode-warn">${t('pcode.repeated')}</span>` : '';
      const choices = h.codes.length > 1 ? `<fieldset class="pcode-choices"><legend>${t('pcode.choose')}</legend>${h.codes.map((c, j)=>`<label class="pcode-choice"><input type="radio" name="pcode_${i}" value="${escapeHTML(c.value)}" ${j===0 ? 'checked' : ''} onchange="photoScanPick(${i}, this.value)"><span>${escapeHTML(formatBarcode(c.value))}</span></label>`).join('')}</fieldset>` : '';
      html += `<div class="pcode-item">
        <label class="pcode-row"><input type="checkbox" ${h.checked ? 'checked' : ''} onchange="photoScanCheck(${i}, this.checked)">
          <span class="pcode-thumb">${photoImgHTML(p, h.side, 'thumb', 'data-eager="1"')}</span>
          <span class="pcode-text"><span class="pcode-name">${escapeHTML(p.name)}</span>
            <span class="pcode-code" id="pcodeCode_${i}">${escapeHTML(formatBarcode(h.pick))}</span>
            <span class="pcode-side">${t('pcode.in_photo').replace('{side}', escapeHTML(photoSideLabel(h.side)))}</span>${warn}</span>
        </label>${choices}</div>`;
    });
    html += `</div>`;
  } else {
    html += `<p class="pcode-head">${t('pcode.found_none')}</p>`;
  }
  if(ps.missed.length){
    html += `<details class="pcode-missed"><summary>${icon('chevronRight')}${ps.missed.length===1 ? t('pcode.not_found_one') : t('pcode.not_found').replace('{n}', ps.missed.length)}</summary><ul>${ps.missed.map(id=> PRODUCTS_BY_ID[id] ? `<li>${escapeHTML(PRODUCTS_BY_ID[id].name)}</li>` : '').join('')}</ul></details>`;
  }
  const notDone = ps.n - ps.i;
  if(notDone > 0) html += `<p class="pcode-count">${notDone===1 ? t('pcode.stopped_one') : t('pcode.stopped').replace('{n}', notDone)}</p>`;
  updateSheetBody(html);
  hydratePhotos(document.getElementById('sheetBody'));
  setSheetFoot(ps.found.length ? photoScanFootHTML('review') : `<button type="button" class="btn primary" onclick="closeSheet()">${t('common.close')}</button>`);
  photoScanCountSelected();
}
function photoScanCheck(i, on){ const h = photoScan && photoScan.found[i]; if(h){ h.checked = on; photoScanCountSelected(); } }
function photoScanPick(i, value){
  const h = photoScan && photoScan.found[i]; if(!h) return;
  h.pick = value;
  const el = document.getElementById('pcodeCode_' + i); if(el) el.textContent = formatBarcode(value);
}
function photoScanCountSelected(){
  const n = photoScan ? photoScan.found.filter(h=>h.checked).length : 0;
  const b = document.getElementById('pcodeSave');
  if(b){ b.textContent = (n===1 ? t('pcode.save_one') : t('pcode.save').replace('{n}', n)); b.disabled = !n; }
}
async function photoScanSave(){
  const ps = photoScan; if(!ps) return;
  const sel = ps.found.filter(h=> h.checked && PRODUCTS_BY_ID[h.id] && !String(PRODUCTS_BY_ID[h.id].barcode || '').trim());
  if(!sel.length){ closeSheet(); return; }
  const before = JSON.stringify(OVERRIDES);
  sel.forEach(h=>{
    if(!OVERRIDES.products[h.id]) OVERRIDES.products[h.id] = {};
    OVERRIDES.products[h.id].barcode = h.pick;
    PRODUCTS_BY_ID[h.id].barcode = h.pick;
  });
  if(!await persistOverrides()){
    OVERRIDES = JSON.parse(before); buildProducts();
    showToast(t('save.error'), { replace:true, duration:6000 });
    return;
  }
  const ids = sel.map(h=>h.id);
  photoScan = null;
  closeSheet();
  render();
  showToast((sel.length===1 ? t('pcode.saved_one') : t('pcode.saved').replace('{n}', sel.length)), { ok:true, replace:true, duration:9000,
    action:{ label:t('common.undo'), fn: async ()=>{
      ids.forEach(id=>{ if(OVERRIDES.products[id]) OVERRIDES.products[id].barcode = ''; if(PRODUCTS_BY_ID[id]) PRODUCTS_BY_ID[id].barcode = ''; });
      await persistOverrides(); render();
    } } });
}
/* Foto nueva de una pieza sin código: se mira en la foto ORIGINAL (con todo su
   detalle) si se ve un código. Si hay uno claro, se guarda y se avisa con
   «Deshacer»; si hay dudas, no se toca nada. */
async function autoBarcodeFromFile(pid, file){
  try{
    const p = PRODUCTS_BY_ID[pid];
    if(!p || String(p.barcode || '').trim() || !file) return;
    const det = await getBarcodeDetector(); if(!det) return;
    let src = null, w = 0, h = 0;
    if(typeof createImageBitmap === 'function'){ src = await createImageBitmap(file); w = src.width; h = src.height; }
    else return;
    let codes = [];
    try{ codes = await detectBarcodesIn(src, w, h); } finally { try{ src.close(); }catch(e){} }
    if(codes.length!==1) return;
    const code = codes[0].value;
    const cur = PRODUCTS_BY_ID[pid];
    if(!cur || String(cur.barcode || '').trim()) return;
    // si ese código ya es de otra pieza, no se toca nada: solo se avisa
    const other = productsByBarcode(code).find(x=>x.id!==pid);
    if(other){ showToast(t('scan.auto_dup').replace('{code}', formatBarcode(code)).replace('{name}', other.name), { replace:true, duration:8000 }); return; }
    await updateEditionField(pid, 'barcode', code);
    if(view.productId===pid && !isPhotoEditorOpen() && !isSheetOpen() && !isModalOpen()) render();
    showToast(t('scan.auto_found').replace('{code}', formatBarcode(code)), { ok:true, replace:true, duration:8000,
      action:{ label:t('common.undo'), fn: async ()=>{ await updateEditionField(pid, 'barcode', ''); if(view.productId===pid) render(); } } });
  }catch(e){ /* sin código: no pasa nada */ }
}
