/* ============ Scannen ============ */
let scanBusy=false, scanCtl=null;
function scanStatus(html,err){ const s=el('scan-status'); s.innerHTML=html; s.classList.toggle('err',!!err); }
function loadImg(file){ return new Promise((res,rej)=>{ const u=URL.createObjectURL(file), i=new Image(); i.onload=()=>res({img:i,url:u}); i.onerror=()=>{ URL.revokeObjectURL(u); rej(); }; i.src=u; }); }
function jpegB64(img,max){ const sc=Math.min(1,max/Math.max(img.naturalWidth,img.naturalHeight)), cv=document.createElement('canvas');
  cv.width=Math.round(img.naturalWidth*sc); cv.height=Math.round(img.naturalHeight*sc); cv.getContext('2d').drawImage(img,0,0,cv.width,cv.height); return cv.toDataURL('image/jpeg',.85).split(',')[1]; }
function resetFrame(){ el('scan-frame').querySelectorAll('img,.sweep').forEach(n=>n.remove()); el('frame-hint').hidden=false; }

async function scanFile(file){
  if(!file||scanBusy) return;
  let L; try{ L=await loadImg(file); }catch(e){ scanStatus('Das Bild ließ sich nicht öffnen. Bitte ein anderes Foto wählen.',true); return; }
  scanBusy=true; resetFrame(); el('frame-hint').hidden=true;
  const fr=el('scan-frame'); const im=new Image(); im.src=L.url; im.alt='Gescannte Karte'; fr.prepend(im); const sw=document.createElement('span'); sw.className='sweep'; fr.append(sw);
  const photo=await compressAsync(file);            // für die Sammlung (420 px)
  const thumb=await compressAsync(file,200);        // für den Verlauf
  try{
    if(!aiKey()){ await ocrScan(file); el('key-hint').hidden=false; return; }
    scanCtl=new AbortController(); const sig=scanCtl.signal;
    scanStatus('Karte wird erkannt … <button class="btn sm" id="scan-stop" style="min-height:32px;margin-left:6px">Abbrechen</button>');
    el('scan-stop').onclick=()=>scanCtl.abort();
    const text=await Promise.race([
      callClaude([{type:'image',source:{type:'base64',media_type:'image/jpeg',data:jpegB64(L.img,1400)}},{type:'text',text:PROMPT}]),
      new Promise((_,rej)=>sig.addEventListener('abort',()=>rej(new Error('Abgebrochen.'))))]);
    const c=parseJSON(text); if(!c) throw new Error('Die Antwort war unvollständig. Bitte noch einmal scannen.');
    if(!c.identified){ scanStatus(esc(c.notes||'Keine Karte erkannt. Versuch es mit einem schärferen, geraden Foto.'),true); return; }
    scanStatus('Erkannt ✓ – Live-Preis wird gesucht …');
    const entry={id:uid(),ts:Date.now(),src:'scan',c,matches:[],sel:0,thumb,photo};
    openResult(entry,true);
    entry.matches=((await livePrices(c))||[]).map(slimMatch);
    addRecent(entry);
    if(currentEntry===entry && el('sheet-bg').classList.contains('show')) openResult(entry);
    scanStatus('Erkannt ✓');
  }catch(e){ scanStatus(esc(e.message||'Die Erkennung ist fehlgeschlagen.'),e.message!=='Abgebrochen.'); }
  finally{ scanBusy=false; fr.querySelector('.sweep')?.remove(); }
}
function slimMatch(m){ const o={}; ['label','number','img','prices','variantNote','source','url','updated','score','rarity','kind','name'].forEach(k=>{ if(m[k]!=null&&m[k]!=='') o[k]=m[k]; }); return o; }

/* Ohne API-Key: Kartennamen per Texterkennung lesen und suchen */
async function ocrScan(file){
  scanStatus('Lese den Kartennamen … (ohne KI, 10–20 s)');
  try{
    if(!window.Tesseract) await new Promise((res,rej)=>{ const s=document.createElement('script'); s.src='https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js'; s.onload=res; s.onerror=rej; document.head.appendChild(s); });
    const {data}=await Tesseract.recognize(file,'deu+eng');
    const lines=(data.text||'').split('\n').map(s=>s.trim()).filter(s=>s.length>2);
    const guess=(lines.sort((a,b)=>b.length-a.length)[0]||'').replace(/[^A-Za-zÄÖÜäöüß0-9 \-!.']/g,'').trim();
    if(!guess){ scanStatus('Kein Text erkannt. Bessere Beleuchtung probieren oder den Namen unten eintippen.',true); return; }
    el('q').value=guess; scanStatus('Gelesen: <b>'+esc(guess)+'</b> – Treffer unten. Mit KI-Key wird es deutlich genauer.');
    await runSearch(); el('search-results').scrollIntoView({behavior:'smooth',block:'start'});
  }catch(e){ scanStatus('Texterkennung nicht verfügbar (offline?). Bitte den Namen unten eintippen.',true); }
}

