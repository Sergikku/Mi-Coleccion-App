/* =====================================================================
   v11.29 · LEER LA PORTADA
   Lee el texto de la foto de la portada con Tesseract.js, que se descarga de
   jsDelivr SOLO cuando pulsas «Leer la portada» (la primera vez, unos 10 MB:
   el lector y los idiomas japonés e inglés; luego el navegador lo guarda).
   La lectura se hace en tu móvil: la foto no sale de él.
   Con lo leído:
   - detecta el idioma por la escritura: kana → japonés; hangul → coreano; solo
     kanji → chino; letras latinas → español, inglés, francés, alemán o
     italiano según las palabras y los acentos;
   - propone el nombre original (las líneas más grandes en esa escritura);
   - avisa si no cuadra con la región de la pieza.
   Nada se guarda sin que lo confirmes. Usa los campos de siempre:
   «Nombre original (japonés)» (nameJp) e «Idioma» (language).
   ===================================================================== */
const OCR_SRC = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
const OCR_LANGS = 'jpn+eng';
let _ocrLib = null, OCR = null;
function ocrLoadLib(){
  if(window.Tesseract) return Promise.resolve(window.Tesseract);
  if(_ocrLib) return _ocrLib;
  _ocrLib = new Promise((res, rej)=>{
    const s = document.createElement('script'); s.src = OCR_SRC; s.async = true; s.crossOrigin = 'anonymous';
    s.onload = ()=> window.Tesseract ? res(window.Tesseract) : rej(new Error('lib'));
    s.onerror = ()=>{ _ocrLib = null; s.remove(); rej(new Error('load')); };
    document.head.appendChild(s);
  });
  return _ocrLib;
}

/* ---------- Escritura e idioma ---------- */
const OCR_RX = { kana:/[぀-ゟ゠-ヿｦ-ﾟ]/g, han:/[㐀-䶿一-鿿]/g, hangul:/[가-힯ᄀ-ᇿ㄰-㆏]/g, lat:/[A-Za-zÀ-ÖØ-öø-ÿ]/g };
const OCR_CJK = '\\u3040-\\u30ff\\u3400-\\u4dbf\\u4e00-\\u9fff\\uff66-\\uff9f\\uac00-\\ud7af';
const OCR_WORDS = {
  es:['el', 'la', 'los', 'las', 'del', 'y', 'para', 'con', 'juego', 'edición', 'incluye', 'una', 'consola', 'solo', 'más', 'jugadores', 'versión', 'español', 'castellano'],
  en:['the', 'and', 'of', 'for', 'with', 'game', 'edition', 'includes', 'only', 'players', 'version', 'english', 'play', 'your', 'new'],
  fr:['le', 'les', 'des', 'du', 'et', 'pour', 'avec', 'jeu', 'édition', 'une', 'sur', 'joueurs', 'français', 'à'],
  de:['der', 'die', 'das', 'und', 'für', 'mit', 'spiel', 'nur', 'ein', 'eine', 'auf', 'spieler', 'deutsch', 'ist'],
  it:['il', 'gli', 'della', 'per', 'con', 'gioco', 'edizione', 'una', 'giocatori', 'italiano', 'di', 'è'],
};
const OCR_MARKS = { es:/[ñ¿¡]/gi, de:/[äöüß]/gi, fr:/[çèêëœ]/gi, it:/[ìò]/gi };
const OCR_REGION = { ja:'jp', zh:'cn', es:'es', en:null, fr:'eu', de:'eu', it:'eu', ko:null };
function ocrCount(s, rx){ return (String(s || '').match(rx) || []).length; }
function ocrDetect(text){
  const s = String(text || '');
  const kana = ocrCount(s, OCR_RX.kana), han = ocrCount(s, OCR_RX.han), hangul = ocrCount(s, OCR_RX.hangul), lat = ocrCount(s, OCR_RX.lat);
  const cjk = kana + han + hangul, all = cjk + lat;
  if(!all) return { lang:'', sure:false };
  // lo japonés tiene kana; con muy poco frente a mucho latín, suele ser ruido de un logo
  if(kana >= 2 && cjk >= 3 && cjk / all >= 0.2) return { lang:'ja', sure: kana >= 4 };
  if(hangul >= 2 && hangul / all >= 0.2) return { lang:'ko', sure: hangul >= 4 };
  if(han >= 3 && han / all >= 0.3) return { lang:'zh', sure:false };
  if(lat < 6) return { lang:'', sure:false };
  const words = s.toLowerCase().normalize('NFC').split(/[^a-zà-öø-ÿ]+/).filter(Boolean), sc = {};
  Object.keys(OCR_WORDS).forEach(k=>{ const set = new Set(OCR_WORDS[k]); sc[k] = words.filter(w=> set.has(w)).length + 2 * ocrCount(s, OCR_MARKS[k] || /$^/g); });
  const order = Object.keys(sc).sort((a, b)=> sc[b] - sc[a]);
  if(!sc[order[0]]) return { lang:'', sure:false, latin:true };
  return { lang:order[0], sure: sc[order[0]] >= 3 && sc[order[0]] >= 2 * (sc[order[1]] || 0), latin:true };
}
/* Quita los espacios que Tesseract mete entre caracteres japoneses */
function ocrCleanLine(l){
  return String(l || '').replace(new RegExp('([' + OCR_CJK + '\\u30fc])\\s+(?=[' + OCR_CJK + '\\u30fc])', 'g'), '$1')
    .replace(/[|_~^`"“”«»<>{}\[\]\\]/g, '').replace(/\s+/g, ' ').trim();
}
/* Candidatos al nombre: las líneas en esa escritura, de letra más grande a más pequeña */
function ocrCandidates(lines, lang){
  const cjk = lang==='ja' || lang==='zh' || lang==='ko';
  const rx = new RegExp('[' + OCR_CJK + ']', 'g');
  const seen = new Set();
  return lines.map((l, i)=> ({ text:ocrCleanLine(l.text), h:l.h || 0, i }))
    .map(c=> cjk ? Object.assign(c, { text:c.text.replace(new RegExp('^[^' + OCR_CJK + '\\w]+|[^' + OCR_CJK + '\\w!?！？ー]+$', 'g'), '') }) : c)
    .filter(c=> cjk ? ocrCount(c.text, rx) >= 2 : ocrCount(c.text, OCR_RX.lat) >= 3)
    .filter(c=> c.text.length <= 80 && !seen.has(c.text) && seen.add(c.text))
    .sort((a, b)=> (b.h - a.h) || (a.i - b.i)).slice(0, 4).map(c=> c.text);
}
function ocrLangName(l){ return l ? t('ocr.lang.' + l) : t('ocr.lang.none'); }

/* ---------- La hoja ---------- */
async function openOcrPortada(id){
  const p = PRODUCTS_BY_ID[id]; if(!p) return;
  if(!hasPhoto(shownPhotoId(p), 'front') && !hasPhoto(p.id, 'front')){ showToast(t('ocr.no_photo'), { replace:true }); return; }
  const run = { id, cancel:false, stage:'lib', pct:0 };
  OCR = run;
  openSheet({ kind:'ocr', title:t('ocr.title'), body:ocrProgressHTML(run),
    foot:`<button type="button" class="btn" data-fk="ocr-close" onclick="closeSheet()">${t('common.cancel')}</button>`,
    onClose: ()=>{ run.cancel = true; if(run.worker) run.worker.terminate().catch(()=>{}); if(OCR===run) OCR = null; renderKeepFocus('[data-fk="ocr-read"]'); } });
  try{
    const src = await loadMainFront(shownPhotoId(p)) || await loadMainFront(p.id);
    if(!src) throw new Error('photo');
    if(!navigator.onLine && !window.Tesseract) throw new Error('offline');
    const T = await ocrLoadLib(); if(run.cancel) return;
    run.stage = 'core'; ocrProgress(run);
    run.worker = await T.createWorker(OCR_LANGS, 1, { logger: (m)=>{ if(run.cancel || !m) return; run.stage = /recogn/i.test(m.status) ? 'read' : /lang|traineddata/i.test(m.status) ? 'lang' : /init/i.test(m.status) ? 'init' : 'core'; run.pct = typeof m.progress==='number' ? m.progress : 0; ocrProgress(run); } });
    if(run.cancel){ run.worker.terminate().catch(()=>{}); return; }
    run.stage = 'read'; run.pct = 0; ocrProgress(run);
    const out = await run.worker.recognize(src);
    run.worker.terminate().catch(()=>{}); run.worker = null;
    if(run.cancel) return;
    const d = (out && out.data) || {};
    const text = String(d.text || '');
    const lines = Array.isArray(d.lines) && d.lines.length ? d.lines.map(l=> ({ text:l.text, h: l.bbox ? Math.abs(l.bbox.y1 - l.bbox.y0) : 0 }))
      : text.split(/\n+/).map(l=> ({ text:l, h:0 }));
    run.text = lines.map(l=> ocrCleanLine(l.text)).filter(Boolean).join('\n');
    run.det = ocrDetect(run.text);
    run.cands = ocrCandidates(lines, run.det.lang);
    run.pick = run.cands[0] || '';
    run.stage = 'done';
    updateSheetBody(ocrResultHTML(run));
    ocrFoot(run);
  }catch(e){
    if(run.cancel) return;
    console.warn(e);
    const why = e && e.message==='offline' ? 'ocr.err_offline' : e && e.message==='photo' ? 'ocr.no_photo' : e && e.message==='load' ? 'ocr.err_load' : 'ocr.err';
    updateSheetBody(`<p class="note note-warn" role="alert">${icon('info')} ${escapeHTML(t(why))}</p>`);
    ocrFoot(run, true);
  }
}
function ocrProgress(run){
  if(OCR!==run || !isSheetKind('ocr')) return;
  const el = document.getElementById('ocrStage');
  if(el){ el.textContent = t('ocr.stage.' + run.stage); const b = document.getElementById('ocrBar'); if(b){ b.value = Math.round((run.pct || 0) * 100); } }
  else updateSheetBody(ocrProgressHTML(run));
}
function ocrProgressHTML(run){
  return `<div class="ocr-wait" role="status" aria-live="polite"><p id="ocrStage">${escapeHTML(t('ocr.stage.' + run.stage))}</p>
    <progress id="ocrBar" max="100" value="${Math.round((run.pct || 0) * 100)}" aria-label="${escapeHTML(t('ocr.title'))}"></progress>
    <p class="section-sub">${escapeHTML(t('ocr.privacy'))}</p></div>`;
}
function ocrFoot(run, err){
  const f = document.querySelector('#sheetOverlay .sheet-foot'); if(!f) return;
  f.innerHTML = err ? `<button type="button" class="btn" onclick="closeSheet()">${t('common.close')}</button><button type="button" class="btn primary" data-fk="ocr-retry" onclick="closeSheet(); openOcrPortada('${escapeHTML(run.id)}')">${t('ocr.retry')}</button>`
    : `<button type="button" class="btn primary" data-fk="ocr-close" onclick="closeSheet()">${t('copy.done')}</button>`;
  const go = document.getElementById('ocrName') || document.querySelector('[data-fk="ocr-save"]') || f.querySelector('.btn');
  if(go) go.focus({ preventScroll:true });
}
function ocrResultHTML(run){
  const p = PRODUCTS_BY_ID[run.id]; if(!p) return '';
  const det = run.det, lang = det.lang, id = escapeHTML(p.id);
  const cjk = lang==='ja' || lang==='zh' || lang==='ko';
  // Idioma
  let html = `<div class="ocr-lang"><span class="field-label">${t('ocr.detected')}</span> <b>${escapeHTML(ocrLangName(lang))}</b> ${lang ? `<small>${escapeHTML(t(det.sure ? 'ocr.sure' : 'ocr.maybe'))}</small>` : ''}</div>`;
  if(!run.text){ return html + `<p class="section-sub">${escapeHTML(t('ocr.nothing'))}</p>`; }
  // ¿Cuadra con la región?
  const regs = (typeof regionKeysFor==='function' ? regionKeysFor(p) : []).map(r=> r.code).filter(Boolean), want = OCR_REGION[lang];
  if(lang && det.sure && regs.length && ((want && !regs.includes(want) && (lang==='ja' || regs.every(r=> r==='jp'))) || (!want && lang!=='ko' && regs.every(r=> r==='jp')))){
    html += `<p class="note note-warn ocr-mismatch">${icon('info')} ${escapeHTML(t('ocr.mismatch').replace('{l}', ocrLangName(lang)).replace('{r}', regionShortText(p)))}
      ${want && !regs.includes(want) ? `<br><button type="button" class="btn btn-sm" data-fk="ocr-region" onclick="ocrAddRegion('${id}','${want}')">${escapeHTML(t('ocr.add_region').replace('{r}', REGION_CODES[want] || want))}</button>` : ''}</p>`;
  }
  // Nombre original
  if(cjk){
    html += `<h3 class="ped-h">${t('p.name_jp')}</h3>`;
    if(p.nameJp) html += `<p class="section-sub">${escapeHTML(t('ocr.current'))} <span lang="ja">${escapeHTML(p.nameJp)}</span></p>`;
    if(run.cands.length > 1) html += `<div class="ocr-cands" role="radiogroup" aria-label="${escapeHTML(t('ocr.cands'))}">${run.cands.map((c, i)=> `<label class="ocr-cand"><input type="radio" name="ocrCand" data-fk="ocr-c${i}" ${c===run.pick ? 'checked' : ''} onchange="ocrPick(${i})"> <span lang="${lang}">${escapeHTML(c)}</span></label>`).join('')}</div>`;
    html += `<div class="field"><label for="ocrName">${t('ocr.edit_name')}</label><input id="ocrName" type="text" lang="${lang}" maxlength="200" value="${escapeHTML(run.pick)}" oninput="OCR && (OCR.pick = this.value)"></div>`;
  }
  // Qué guardar
  const langTxt = lang ? ocrLangName(lang) : '';
  html += `${langTxt ? `<label class="av-check"><input type="checkbox" id="ocrSaveLang" ${!p.language || p.language===langTxt ? 'checked' : ''}> <span>${escapeHTML(t('ocr.save_lang').replace('{l}', langTxt))}${p.language && p.language!==langTxt ? ` <small>(${escapeHTML(t('ocr.now').replace('{s}', p.language))})</small>` : ''}</span></label>` : ''}
    ${cjk || langTxt ? `<button type="button" class="btn primary btn-sm" data-fk="ocr-save" onclick="ocrSave('${id}')">${icon('check')} ${t('ocr.save')}</button>` : ''}
    ${disclosureHTML('ocr-text', t('ocr.all_text'), `<pre class="ocr-text" ${lang ? `lang="${lang}"` : ''}>${escapeHTML(run.text)}</pre><button type="button" class="btn btn-sm btn-ghost" data-fk="ocr-copy" onclick="ocrCopy()">${t('ocr.copy')}</button>`, productSectionsOpen)}
    <p class="section-sub">${escapeHTML(t('ocr.check'))}</p>`;
  return html;
}
function ocrPick(i){ if(!OCR) return; OCR.pick = OCR.cands[i] || ''; const el = document.getElementById('ocrName'); if(el) el.value = OCR.pick; }
async function ocrCopy(){ if(!OCR) return; try{ await navigator.clipboard.writeText(OCR.text); showToast(t('ocr.copied'), { ok:true, replace:true }); }catch(e){ showToast(t('ocr.copy_fail'), { replace:true }); } }
async function ocrAddRegion(id, code){
  const p = PRODUCTS_BY_ID[id]; if(!p) return;
  if(!(p.regionTags || []).length){ const cur = regionKeysFor(p).map(r=> r.code).filter(Boolean); p.regionTags = cur; }   // conserva la que ya tenía
  if(!(p.regionTags || []).includes(code)) await toggleRegionTag(id, code);
  showToast(t('ocr.region_done').replace('{r}', REGION_CODES[code] || code), { ok:true, replace:true });
  if(OCR) updateSheetBody(ocrResultHTML(OCR));
}
async function ocrSave(id){
  const p = PRODUCTS_BY_ID[id]; if(!p || !OCR) return;
  const lang = OCR.det.lang, cjk = lang==='ja' || lang==='zh' || lang==='ko';
  const name = cjk ? String((document.getElementById('ocrName') || {}).value || '').trim() : '';
  const cbL = document.getElementById('ocrSaveLang'), saveLang = !!(cbL && cbL.checked) && lang;
  if(!name && !saveLang){ showToast(t('ocr.nothing_to_save'), { replace:true }); return; }
  const before = { nameJp:p.nameJp || '', language:p.language || '' };
  if(name) await updateProductField(id, 'nameJp', name);
  if(saveLang) await updateProductField(id, 'language', ocrLangName(lang));
  closeSheet();
  showToast(t('ocr.saved'), { ok:true, replace:true, action:{ label:t('common.undo'), fn: async ()=>{ await updateProductField(id, 'nameJp', before.nameJp); await updateProductField(id, 'language', before.language); renderKeepFocus(); } } });
}
/* Botón de la ficha */
function ocrButtonHTML(p, cls){
  if(!hasPhoto(shownPhotoId(p), 'front') && !hasPhoto(p.id, 'front')) return '';
  return `<button type="button" class="${cls || 'btn btn-sm btn-ghost'}" data-fk="ocr-read" onclick="openOcrPortada('${escapeHTML(p.id)}')">${icon('read')} ${t('ocr.btn')}</button>`;
}
