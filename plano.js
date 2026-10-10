/* La Colección App — plano.js (v11.11)
   «Lo que te falta»: en vez de un hueco discontinuo, cada pieza que te falta
   se dibuja como el plano de su formato (caja, blíster, cartucho, disco…),
   con su número en la plataforma y un sello «TE FALTA» (o «BUSCANDO» si le
   has puesto prioridad). Tres aspectos a elegir en Ajustes: plano en papel
   (por defecto), plano azul y ficha de fichero. En tema oscuro, el papel
   pasa a grafito. Al conseguirla, el plano se repasa en verde y aparece el
   sello «CONSEGUIDA».
   Solo dibuja: no guarda nada. El formato y las medidas (opcionales) son
   campos de la pieza que se editan en su ficha. */

/* ---------- Formatos ---------- */
const FORMATOS = ['caja', 'blister', 'cartucho', 'disco', 'vhs', 'tarjeta', 'objeto'];
/* Formato por defecto según la plataforma (si no lo has elegido tú) */
const FORMATO_BY_CODE = {
  VHS:'vhs', ROM:'disco', PCUS:'disco', SCOOP:'disco', PCJP:'disco', DVD:'disco', PRES:'disco', PREU:'disco', PC:'disco',
  CODI:'tarjeta', POKE:'objeto', TOY:'objeto', ARCA:'objeto',
};
function formatoDe(p){
  if(p && FORMATOS.includes(p.formato)) return p.formato;
  const code = p ? platVisual(p.platformId).code : '';
  return FORMATO_BY_CODE[code] || FORMATO_BY_CODE[code.slice(0, 4)] || 'caja';
}
function formatoLabel(f){ return t('fmt.' + f); }

/* Medidas aproximadas (cm: ancho × alto × fondo) según la plataforma y el
   formato, para la estantería y como referencia. Si la pieza tiene sus
   propias medidas (ficha), mandan esas. */
const DIMS_BY_CODE = {
  GB:[12.5,12.5,2.5], GBC:[12.5,12.5,2.5], GBA:[13,13,3], N64:[18,13,3.8], SFC:[18,10.5,3.5], SUPE:[18,10.5,3.5],
  GC:[13.5,19,1.4], WII:[13.5,19,1.4], WIIU:[13.5,19,1.4], STEE:[13.5,19,1.4], DVD:[13.5,19,1.4],
  NDS:[12.5,13.7,1.4], '3DS':[12.5,13.7,1.4], FLIP:[12.5,13.7,1.4], SW:[10.5,17,1.1], SW2:[10.5,17,1.1],
  MINI:[7,10,2.5], PICO:[20,27,3.5], BEENA:[20,27,3.5], VHS:[10.5,19,2.5],
};
const DIMS_BY_FORMATO = { caja:[13,18,2.5], blister:[9,13,3.2], cartucho:[5.7,3.5,0.8], disco:[14.2,12.5,1], vhs:[10.5,19,2.5], tarjeta:[6,9,0.3], objeto:[15,15,10] };
function medidasValidas(m){
  return !!m && ['ancho','alto','fondo'].every(k=> typeof m[k]==='number' && isFinite(m[k]) && m[k] > 0 && m[k] < 500);
}
/* { w, h, d, exact } en cm */
function piezaDims(p){
  if(medidasValidas(p.medidas)) return { w:p.medidas.ancho, h:p.medidas.alto, d:p.medidas.fondo, exact:true, src:'own' };
  // las que pusiste para todas las de su plataforma (estantería)
  const E = OVERRIDES.estanterias, pd = E && E.medidasPlataforma && p.platformId ? E.medidasPlataforma[p.platformId] : null;
  if(medidasValidas(pd)) return { w:pd.ancho, h:pd.alto, d:pd.fondo, exact:true, src:'platform' };
  const f = formatoDe(p);
  const code = platVisual(p.platformId).code;
  const v = (f==='caja' && (DIMS_BY_CODE[code] || DIMS_BY_CODE[code.slice(0, 4)])) || DIMS_BY_FORMATO[f];
  return { w:v[0], h:v[1], d:v[2], exact:false, src:'std' };
}
function fmtCm(v){ return (Math.round(v * 10) / 10).toLocaleString(numLocale(), { maximumFractionDigits:1 }); }

/* ---------- Dibujos (viewBox 0 0 100 100) ----------
   · .pl-hatch: el rayado (se pinta con el color del texto a través de la
     máscara #plano-hatch, así cambia con el aspecto y el tema).
   · .pl-line: el contorno. · .pl-paper: huecos rellenos del color del papel.
   bbox: la caja que ocupa el dibujo (para las cotas). parts: puntos con
   número para la ficha de búsqueda. */
/* Cada formato se dibuja con la proporción de la pieza (ancho / alto): una
   caja de N64 sale apaisada y una de GameCube, alta. Las medidas en cm vienen
   de piezaDims (las tuyas, las de su plataforma o las aproximadas). */
const PLANO_BASE = { caja:[13,18], blister:[9,13], cartucho:[5.7,3.5], disco:[14.2,12.5], vhs:[10.5,19], tarjeta:[6,9], objeto:[15,15] };
const PLANO_MAX = 72;   // lo que ocupa como mucho el dibujo (viewBox 0 0 100 100)
function planoFrame(f, dims){
  const b = PLANO_BASE[f] || PLANO_BASE.caja;
  let r = dims && dims.w > 0 && dims.h > 0 ? dims.w / dims.h : b[0] / b[1];
  r = Math.max(0.42, Math.min(2.4, r));
  const w = r >= 1 ? PLANO_MAX : PLANO_MAX * r, h = r >= 1 ? PLANO_MAX / r : PLANO_MAX;
  return [50 - w / 2, 49 - h / 2, w, h];
}
const n1 = v=> Math.round(v * 10) / 10;   // (redondeo para el SVG)
const PLANO_DRAW = {
  caja: (x, y, w, h)=>({
    hatch:`<rect x="${n1(x)}" y="${n1(y)}" width="${n1(w)}" height="${n1(h)}" rx="2"/>`,
    line:`<rect x="${n1(x)}" y="${n1(y)}" width="${n1(w)}" height="${n1(h)}" rx="2"/><path d="M${n1(x)} ${n1(y + h * 0.137)}h${n1(w)}"/><rect class="pl-paper" x="${n1(x + w * 0.093)}" y="${n1(y + h * 0.205)}" width="${n1(w * 0.815)}" height="${n1(h * 0.466)}" stroke-dasharray="2 2"/><path d="M${n1(x + w * 0.111)} ${n1(y + h * 0.767)}h${n1(w * 0.556)}M${n1(x + w * 0.111)} ${n1(y + h * 0.849)}h${n1(w * 0.37)}"/>`,
    parts:[['cover', x + w / 2, y + h * 0.438], ['title', x + w * 0.389, y + h * 0.808], ['top', x + w / 2, y + h * 0.068]] }),
  blister: (x, y, w, h)=>({
    hatch:`<rect x="${n1(x)}" y="${n1(y)}" width="${n1(w)}" height="${n1(h)}" rx="6"/>`,
    line:`<rect x="${n1(x)}" y="${n1(y)}" width="${n1(w)}" height="${n1(h)}" rx="6"/><rect class="pl-paper" x="${n1(x + w * 0.375)}" y="${n1(y + h * 0.051)}" width="${n1(w * 0.25)}" height="4" rx="2"/><rect class="pl-paper" x="${n1(x + w * 0.146)}" y="${n1(y + h * 0.205)}" width="${n1(w * 0.708)}" height="${n1(h * 0.59)}" rx="3" stroke-dasharray="2 2"/><path d="M${n1(x + w * 0.25)} ${n1(y + h * 0.859)}h${n1(w * 0.5)}"/>`,
    parts:[['hook', x + w / 2, y + h * 0.077], ['bubble', x + w / 2, y + h * 0.5], ['title', x + w / 2, y + h * 0.897]] }),
  cartucho: (x, y, w, h)=>{ const k = Math.min(w, h) * 0.16;
    const path = `M${n1(x)} ${n1(y + k)} ${n1(x + k)} ${n1(y)}H${n1(x + w - k)}l${n1(k)} ${n1(k)}V${n1(y + h)}H${n1(x)}Z`;
    return { hatch:`<path d="${path}"/>`,
      line:`<path d="${path}"/><rect class="pl-paper" x="${n1(x + w * 0.162)}" y="${n1(y + h * 0.178)}" width="${n1(w * 0.676)}" height="${n1(h * 0.6)}" rx="2" stroke-dasharray="2 2"/><path d="M${n1(x + w * 0.206)} ${n1(y + h * 0.889)}h${n1(w * 0.588)}"/>`,
      parts:[['label', x + w / 2, y + h * 0.467], ['pins', x + w / 2, y + h * 0.94]] }; },
  // disco: la caja (con sus medidas) y el disco dentro
  disco: (x, y, w, h)=>{ const R = Math.min(w, h) * 0.4, cx = x + w * 0.53, cy = y + h / 2;
    return { hatch:`<rect x="${n1(x)}" y="${n1(y)}" width="${n1(w)}" height="${n1(h)}" rx="1.5"/>`,
      line:`<rect x="${n1(x)}" y="${n1(y)}" width="${n1(w)}" height="${n1(h)}" rx="1.5"/><path d="M${n1(x + w * 0.07)} ${n1(y)}V${n1(y + h)}"/><circle class="pl-paper" cx="${n1(cx)}" cy="${n1(cy)}" r="${n1(R)}"/><circle class="pl-paper" cx="${n1(cx)}" cy="${n1(cy)}" r="${n1(R * 0.33)}" stroke-dasharray="2 2"/><circle class="pl-paper" cx="${n1(cx)}" cy="${n1(cy)}" r="${n1(R * 0.11)}"/><path d="M${n1(cx - R * 0.64)} ${n1(cy - R * 0.44)}a${n1(R * 0.78)} ${n1(R * 0.78)} 0 0 1 ${n1(R * 0.34)}-${n1(R * 0.3)}"/>`,
      parts:[['face', cx + R * 0.55, cy + R * 0.4], ['ring', cx, cy]] }; },
  vhs: (x, y, w, h)=>{ const rr = Math.min(w * 0.08, h * 0.136);
    return { hatch:`<rect x="${n1(x)}" y="${n1(y)}" width="${n1(w)}" height="${n1(h)}" rx="3"/>`,
      line:`<rect x="${n1(x)}" y="${n1(y)}" width="${n1(w)}" height="${n1(h)}" rx="3"/><rect class="pl-paper" x="${n1(x + w * 0.237)}" y="${n1(y + h * 0.273)}" width="${n1(w * 0.526)}" height="${n1(h * 0.455)}" rx="2" stroke-dasharray="2 2"/><circle class="pl-paper" cx="${n1(x + w * 0.342)}" cy="${n1(y + h / 2)}" r="${n1(rr)}"/><circle class="pl-paper" cx="${n1(x + w * 0.658)}" cy="${n1(y + h / 2)}" r="${n1(rr)}"/><path d="M${n1(x + w * 0.105)} ${n1(y + h * 0.136)}h${n1(w * 0.79)}"/>`,
      parts:[['window', x + w / 2, y + h / 2], ['label', x + w / 2, y + h * 0.136]] }; },
  tarjeta: (x, y, w, h)=>({
    hatch:`<rect x="${n1(x)}" y="${n1(y)}" width="${n1(w)}" height="${n1(h)}" rx="4"/>`,
    line:`<rect x="${n1(x)}" y="${n1(y)}" width="${n1(w)}" height="${n1(h)}" rx="4"/><path d="M${n1(x + w * 0.15)} ${n1(y + h * 0.139)}h${n1(w * 0.7)}M${n1(x + w * 0.15)} ${n1(y + h * 0.222)}h${n1(w * 0.45)}"/><rect class="pl-paper" x="${n1(x + w * 0.15)}" y="${n1(y + h * 0.611)}" width="${n1(w * 0.7)}" height="${n1(h * 0.167)}" rx="1.5" stroke-dasharray="2 2"/>`,
    parts:[['code', x + w / 2, y + h * 0.694], ['title', x + w * 0.4, y + h * 0.181]] }),
  // objeto: una caja en perspectiva (no depende de la proporción)
  objeto: ()=>({
    hatch:'<path d="M18 34h46v50H18Z"/>',
    line:'<path d="M18 34h46v50H18Z"/><path d="M18 34 36 16h46L64 34M64 84l18-18V16"/><circle class="pl-paper" cx="41" cy="59" r="11" stroke-dasharray="2 2"/>',
    parts:[['item', 41, 59]], bbox:[18, 16, 82, 84] }),
};
/* { bbox:[x0,y0,x1,y1], hatch, line, parts } del formato f con las medidas dims */
function planoShape(f, dims){
  const draw = PLANO_DRAW[f] || PLANO_DRAW.caja;
  const [x, y, w, h] = planoFrame(f, dims);
  const o = draw(x, y, w, h);
  if(!o.bbox) o.bbox = [x, y, x + w, y + h];
  return o;
}
function planoSvgInner(f, dims){
  const s = planoShape(f, dims);
  return `<g class="pl-hatch" mask="url(#plano-hatch)">${s.hatch}</g><g class="pl-line">${s.line}</g>`;
}
/* Máscara del rayado: se añade una sola vez al documento */
function ensurePlanoDefs(){
  if(document.getElementById('plano-defs')) return;
  const box = document.createElement('div');
  box.innerHTML = `<svg id="plano-defs" width="0" height="0" style="position:absolute;width:0;height:0;overflow:hidden" aria-hidden="true" focusable="false"><defs>
    <pattern id="plano-hatch-pat" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="1" height="5" fill="#fff"/></pattern>
    <mask id="plano-hatch" maskUnits="userSpaceOnUse" x="-200" y="-200" width="600" height="600"><rect x="-200" y="-200" width="600" height="600" fill="url(#plano-hatch-pat)"/></mask>
  </defs></svg>`;
  document.body.appendChild(box.firstElementChild);
}

/* ---------- Aspecto elegido (Ajustes · de este dispositivo) ---------- */
const FALTA_STYLES = ['papel', 'azul', 'fichero'];
function faltaStyle(){ const v = uiPref('faltaStyle', 'papel'); return FALTA_STYLES.includes(v) ? v : 'papel'; }
async function setFaltaStyle(v){
  if(!FALTA_STYLES.includes(v)) return;
  await setUiPref('faltaStyle', v);
  refreshSettingsSheet();
  render();
}
function faltaStyleSettingHTML(){
  const cur = faltaStyle();
  return `<div class="sheet-group"><div class="field-label" id="fltStyleLbl">${t('falta.style')}</div>
    <div class="falta-style-row" role="group" aria-labelledby="fltStyleLbl">${FALTA_STYLES.map(s=>`<button type="button" class="falta-style-opt ${cur===s?'active':''}" aria-pressed="${cur===s}" onclick="setFaltaStyle('${s}')">
      <span class="plano pl-${s} is-mini" aria-hidden="true"><svg class="plano-svg" viewBox="0 0 100 100">${planoSvgInner('blister')}</svg></span>
      <span class="falta-style-name">${t('falta.style.' + s)}</span></button>`).join('')}</div>
    <p class="settings-note">${t('falta.style_note')}</p></div>`;
}

/* ---------- Sello ---------- */
function planoStampText(p){ return isHunting(p) ? t('falta.stamp_hunt') : t('falta.stamp'); }
function planoStampHTML(p){
  // se lee con el lector de pantalla («Te falta» / «Buscando»); en lo que tienes no se ve (ni se lee)
  return `<span class="plano-stamp${isHunting(p) ? ' is-hunt' : ''}">${escapeHTML(planoStampText(p))}</span>`;
}
function gotStampHTML(){
  const d = new Date().toLocaleDateString(numLocale(), { day:'numeric', month:'short', year:'numeric' });
  return `<span class="plano-stamp is-got" aria-hidden="true">${escapeHTML(t('falta.stamp_got'))}<small>${escapeHTML(d)}</small></span>`;
}

/* ---------- Plano en las portadas (rejilla), filas, muro y miniaturas ---------- */
/* Datos de fichero (aspecto «Fichero»): formato, región y prioridad */
function ficheroFieldsHTML(p){
  const rows = [[t('falta.f_fmt'), formatoLabel(formatoDe(p))]];
  const reg = regionShortText(p); if(reg) rows.push([t('falta.f_reg'), reg]);
  if(p.year) rows.push([t('falta.f_year'), String(p.year)]);
  const pr = objetivoOf(p).prioridad;
  if(pr) rows.push([t('falta.f_prio'), pr==='alta' ? '★★★' : pr==='media' ? '★★' : '★']);
  return `<span class="plano-fields">${rows.map(([k, v])=>`<span><b>${escapeHTML(k)}</b>${escapeHTML(v)}</span>`).join('')}</span>`;
}
/* El plano de una pieza dentro de su portada (se ve solo si te falta) */
function planoCoverHTML(p){
  const st = faltaStyle(), f = formatoDe(p);
  const fichero = st==='fichero';
  return `<span class="plano pl-${st}${fichero ? ' is-card' : ''}" data-fmt="${f}" aria-hidden="true">
    ${fichero ? '<span class="plano-hole"></span>' : ''}
    <svg class="plano-svg" viewBox="0 0 100 100">${planoSvgInner(f, piezaDims(p))}</svg>
    ${fichero ? ficheroFieldsHTML(p) : `<span class="plano-fmt">${escapeHTML(formatoLabel(f))}</span>`}
  </span>`;
}
/* Plano pequeño (filas de lista, muro, miniaturas) */
function planoMiniHTML(p, cls){
  const st = faltaStyle();
  return `<span class="plano pl-${st} is-mini${cls ? ' ' + cls : ''}" data-fmt="${formatoDe(p)}" aria-hidden="true"><svg class="plano-svg" viewBox="0 0 100 100">${planoSvgInner(formatoDe(p), piezaDims(p))}</svg></span>`;
}
/* «Nº 12/22» de la pieza en su plataforma */
function catalogNumText(p){
  const c = catalogPosition(p);
  return c.n ? t('falta.num').replace('{n}', c.n).replace('{t}', c.total) : '';
}

/* ---------- Ficha de búsqueda: el plano grande, con cotas ---------- */
const PLANO_PART_KEYS = { cover:'falta.part.cover', title:'falta.part.title', top:'falta.part.top', hook:'falta.part.hook', bubble:'falta.part.bubble',
  label:'falta.part.label', pins:'falta.part.pins', face:'falta.part.face', ring:'falta.part.ring', window:'falta.part.window', code:'falta.part.code', item:'falta.part.item' };
function planoBigHTML(p){
  const st = faltaStyle(), f = formatoDe(p);
  const dims = piezaDims(p);
  const s = planoShape(f, dims);
  const [x0, y0, x1, y1] = s.bbox.map(v=>n1(v));
  // cotas: ancho debajo y alto a la izquierda (si tienes las medidas, las tuyas; si no, las aproximadas, con «≈»)
  const approx = dims.exact ? '' : '≈ ';
  const cw = approx + fmtCm(dims.w) + ' cm', ch = approx + fmtCm(dims.h) + ' cm';
  const by = y1 + 7, bx = x0 - 7;
  const cotas = `<g class="pl-cota">
      <path d="M${x0} ${by}H${x1}M${x0} ${by - 2.5}v5M${x1} ${by - 2.5}v5M${x0} ${y1 + 1.5}V${by + 1}M${x1} ${y1 + 1.5}V${by + 1}"/>
      <path d="M${bx} ${y0}V${y1}M${bx - 2.5} ${y0}h5M${bx - 2.5} ${y1}h5"/>
      <text x="${(x0 + x1) / 2}" y="${by + 7}" text-anchor="middle">${escapeHTML(cw)}</text>
      <text x="${bx - 3.5}" y="${(y0 + y1) / 2}" text-anchor="middle" transform="rotate(-90 ${bx - 3.5} ${(y0 + y1) / 2})">${escapeHTML(ch)}</text>
    </g>`;
  const parts = s.parts.map((pt, i)=>`<g class="pl-part"><circle cx="${n1(pt[1])}" cy="${n1(pt[2])}" r="3.6"/><text x="${n1(pt[1])}" y="${n1(pt[2] + 1.35)}" text-anchor="middle">${i + 1}</text></g>`).join('');
  const legend = s.parts.map((pt, i)=>`<span class="plano-legend-item"><span class="pl-n">${i + 1}</span>${escapeHTML(t(PLANO_PART_KEYS[pt[0]]))}</span>`).join('');
  const num = catalogNumText(p);
  const pv = platVisual(p.platformId);
  return `<figure class="plano-big" style="--plat:${pv.color}">
    <div class="plano pl-${st} is-big" data-fmt="${f}" id="plano-big-${escapeHTML(p.id)}">
      ${st==='fichero' ? '<span class="plano-hole"></span>' : ''}
      <svg class="plano-svg" viewBox="${x0 - 22} ${y0 - 10} ${x1 - x0 + 36} ${y1 - y0 + 30}" role="img" aria-label="${escapeHTML(t('falta.plan_label').replace('{f}', formatoLabel(f)).replace('{w}', cw).replace('{h}', ch))}">
        <g class="pl-hatch" mask="url(#plano-hatch)">${s.hatch}</g><g class="pl-line">${s.line}</g>${cotas}${parts}
      </svg>
      ${pv.code ? `<span class="cover-code">${escapeHTML(pv.code)}</span>` : ''}
      ${num ? `<span class="plano-num">${escapeHTML(num)}</span>` : ''}
      ${planoStampHTML(p)}
    </div>
    <figcaption class="plano-legend">${legend}</figcaption>
  </figure>`;
}

/* ---------- Al conseguirla ----------
   El plano se repasa en verde, sale el sello «CONSEGUIDA» con la fecha y,
   al terminar, `done` (p. ej. redibujar la ficha). Con «reducir movimiento»,
   directamente. */
function reducedMotion(){ return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); }
function playGotAnimation(el, done){
  if(!el || reducedMotion()){ if(done) done(); return; }
  if(!el.querySelector('.plano-stamp.is-got')) el.insertAdjacentHTML('beforeend', gotStampHTML());
  el.classList.remove('is-got'); void el.offsetWidth; el.classList.add('is-got');
  setTimeout(()=>{ if(done) done(); }, 1700);
}
/* Aviso con el progreso de su plataforma */
function gotToast(p){
  const st = platformCountsMap().get(p.platformId) || EMPTY_COUNTS;
  const plat = p.platformId && getAllPlatforms().find(x=>x.id===p.platformId);
  const msg = plat && st.total ? t('falta.got_toast').replace('{n}', st.have).replace('{t}', st.total).replace('{p}', platVisual(plat.id).code || plat.name)
                               : t('falta.got_toast_short');
  showToast(msg, { ok:true, replace:true, duration:3200 });
}

/* ---------- Ficha de búsqueda (pieza que te falta) ----------
   «Para buscarla»: formato, medidas, códigos, región, año y rareza (cada
   fila lleva a donde se edita), y «Cuánto la quieres»: prioridad, precio
   máximo y una nota (el campo objetivo de siempre). Debajo, «Dónde buscar»
   (v11.6). */
function busquedaSectionHTML(p){
  const f = formatoDe(p), d = piezaDims(p), o = objetivoOf(p);
  const ident = `openProductSection('identificacion')`;
  const row = (label, value, cls, js)=> `<button type="button" class="spec-row ${cls||''}" onclick="${js}"><span class="spec-k">${label}</span><span class="spec-v">${value}</span></button>`;
  const reg = regionKeysFor(p).map(k=>k.label).join(' / ');
  const meas = (d.exact ? '' : '≈ ') + [d.w, d.h, d.d].map(fmtCm).join(' × ') + ' cm';
  let rows = '';
  rows += row(t('fmt.label'), escapeHTML(formatoLabel(f)), '', `openFormatoSheet('${p.id}')`);
  rows += row(t('dims.label'), escapeHTML(meas), d.exact ? '' : 'is-empty', `openMedidasSheet('${p.id}')`);
  rows += row(t('p.catalog_num'), p.catalogNumber ? escapeHTML(p.catalogNumber) : t('falta.add'), p.catalogNumber ? '' : 'is-action', ident);
  rows += row(t('p.barcode'), p.barcode ? escapeHTML(typeof formatBarcode==='function' ? formatBarcode(p.barcode) : p.barcode) : t('falta.add'), p.barcode ? '' : 'is-action', ident);
  rows += row(t('p.region'), reg ? escapeHTML(reg) : t('p.fact.no_region'), reg ? '' : 'is-empty', `scrollToProductMeta('${p.id}')`);
  rows += row(t('p.year'), p.year ? escapeHTML(p.year) : '—', p.year ? '' : 'is-empty', ident);
  rows += row(t('p.fact.rarity'), p.rareza ? (RARITY_KEYS[p.rareza] ? t(RARITY_KEYS[p.rareza]) : escapeHTML(p.rareza)) : t('p.rarity.undefined'), p.rareza ? '' : 'is-empty', `scrollToProductMeta('${p.id}')`);
  const prio = PRIORITY_KEYS.map(k=>`<button type="button" class="chip prio-chip prio-${k} ${o.prioridad===k?'active':''}" aria-pressed="${o.prioridad===k}" onclick="setPrioridad('${p.id}','${o.prioridad===k ? '' : k}')">${t('prio.' + k)}</button>`).join('');
  return `<section class="detail-section busqueda" aria-labelledby="busq-t-${escapeHTML(p.id)}">
    <h2 class="section-title" id="busq-t-${escapeHTML(p.id)}">${t('falta.search_title')}</h2>
    <div class="spec">${rows}</div>
    <h3 class="sub-title" id="want-t-${escapeHTML(p.id)}">${t('falta.want_title')}</h3>
    <div class="chip-row" role="group" aria-labelledby="want-t-${escapeHTML(p.id)}">${prio}</div>
    <div class="field-grid">
      ${numberField(t('falta.max_price') + ' (' + currencySymbol() + ')', o.precioMax, `updateObjetivo('${p.id}','precioMax',this.value)`)}
    </div>
    ${editableTextarea(t('falta.want_note'), o.observaciones, `updateObjetivo('${p.id}','observaciones',this.value)`)}
  </section>`;
}
async function setPrioridad(id, v){
  await updateObjetivo(id, 'prioridad', v || null);
  render();
}

/* ---------- Formato y medidas (hojas pequeñas) ---------- */
function openFormatoSheet(id){
  const p = PRODUCTS_BY_ID[id]; if(!p) return;
  const cur = formatoDe(p), own = FORMATOS.includes(p.formato);
  const body = `<p class="settings-note">${t('fmt.note')}</p><div class="fmt-grid" role="group" aria-label="${escapeHTML(t('fmt.label'))}">${FORMATOS.map(f=>`<button type="button" class="fmt-opt ${cur===f?'active':''}" aria-pressed="${cur===f}" onclick="setFormato('${id}','${f}')">
      <span class="plano pl-papel is-mini" aria-hidden="true"><svg class="plano-svg" viewBox="0 0 100 100">${planoSvgInner(f)}</svg></span><span>${escapeHTML(formatoLabel(f))}</span></button>`).join('')}</div>
    ${own ? `<div class="quick-actions"><button type="button" class="btn btn-sm btn-ghost" onclick="setFormato('${id}','')">${icon('undo')} ${t('fmt.auto')}</button></div>` : ''}`;
  openSheet({ kind:'formato', title:t('fmt.label') + ' · ' + p.name, body });
}
async function setFormato(id, f){
  const p = PRODUCTS_BY_ID[id]; if(!p) return;
  const v = FORMATOS.includes(f) ? f : null;
  p.formato = v;
  await setProductField(id, 'formato', v);
  closeSheet();
  render();
  if(typeof estRefresh==='function') estRefresh();
}
function openMedidasSheet(id, opts){
  const p = PRODUCTS_BY_ID[id]; if(!p) return;
  const d = piezaDims(p);
  const plat = p.platformId && getAllPlatforms().find(x=>x.id===p.platformId);
  const f = (k, label, v)=> `<div class="field"><label for="dim_${k}">${label}</label><input id="dim_${k}" type="number" inputmode="decimal" step="0.1" min="0.1" max="400" value="${(Math.round(v * 10) / 10)}" oninput="this.removeAttribute('aria-invalid')"></div>`;
  const body = `<p class="settings-note">${escapeHTML(t('dims.note_' + d.src).replace('{p}', plat ? plat.name : ''))}</p>
    <div class="dims-grid" data-nosave>${f('w', t('dims.w'), d.w)}${f('h', t('dims.h'), d.h)}${f('d', t('dims.d'), d.d)}</div>
    ${plat ? `<label class="check-item dims-all"><span class="check-label">${escapeHTML(t('dims.all_platform').replace('{p}', plat.name))}</span><input type="checkbox" id="dim_all"></label>` : ''}
    ${d.src==='own' ? `<div class="quick-actions"><button type="button" class="btn btn-sm btn-ghost" onclick="clearMedidas('${id}')">${icon('undo')} ${t('dims.reset')}</button></div>` : ''}`;
  const foot = `<button type="button" class="btn" onclick="closeSheet()">${t('modal.cancel')}</button><button type="button" class="btn primary" onclick="saveMedidasSheet('${id}')">${t('dims.save')}</button>`;
  openSheet({ kind:'medidas', title:t('dims.label') + ' · ' + p.name, body, foot });
}
function readDim(k){ const el = document.getElementById('dim_' + k); const v = el ? Number(String(el.value).replace(',', '.')) : NaN; return isFinite(v) && v > 0 && v <= 400 ? Math.round(v * 10) / 10 : null; }
async function saveMedidasSheet(id){
  const w = readDim('w'), h = readDim('h'), d = readDim('d');
  if(!w || !h || !d){ const bad = !w ? 'w' : !h ? 'h' : 'd'; const el = document.getElementById('dim_' + bad); if(el){ el.setAttribute('aria-invalid', 'true'); el.focus(); } return; }
  const all = document.getElementById('dim_all');
  const p = PRODUCTS_BY_ID[id]; if(!p) return;
  if(all && all.checked && p.platformId && typeof estSetPlatformDims==='function'){
    await estSetPlatformDims(p.platformId, { ancho:w, alto:h, fondo:d });
    // esta pieza también usa las de su plataforma (si tenía unas propias, se quitan)
    if(p.medidas){ p.medidas = null; await setProductField(id, 'medidas', null); }
  } else {
    p.medidas = { ancho:w, alto:h, fondo:d };
    await setProductField(id, 'medidas', p.medidas);
  }
  closeSheet();
  showToast(t('dims.saved'), { ok:true, replace:true });
  render();
  if(typeof estRefresh==='function') estRefresh();
}
async function clearMedidas(id){
  const p = PRODUCTS_BY_ID[id]; if(!p) return;
  p.medidas = null;
  await setProductField(id, 'medidas', null);
  closeSheet();
  render();
  if(typeof estRefresh==='function') estRefresh();
}
ensurePlanoDefs();
