/* ============ Blatt (Sheet) ============ */
let sheetOnClose=null;
function openSheet(title, html, onClose){
  el('sheet-title').textContent=title; el('sheet-body').innerHTML=html; sheetOnClose=onClose||null;
  const bg=el('sheet-bg'); bg.classList.add('show'); bg.setAttribute('aria-hidden','false'); bg.querySelector('.sheet').scrollTop=0;
  document.body.style.overflow='hidden';
}
function closeSheet(){
  const bg=el('sheet-bg'); bg.classList.remove('show'); bg.setAttribute('aria-hidden','true'); document.body.style.overflow='';
  const f=sheetOnClose; sheetOnClose=null; if(f) f();
  setTimeout(()=>{ if(!bg.classList.contains('show')) el('sheet-body').innerHTML=''; },260);   // keine veralteten Inhalte stehen lassen
}
el('sheet-bg').addEventListener('click',e=>{ if(e.target.id==='sheet-bg') closeSheet(); });
document.addEventListener('keydown',e=>{ if(e.key==='Escape' && el('sheet-bg').classList.contains('show')) closeSheet(); });

/* ============ Karten-Blatt: ansehen, bearbeiten, hinzufügen ============ */
let editPhoto=null;   // neues Foto (DataURL) während der Bearbeitung
function openCard(id){
  const c=id?cards.find(x=>x.id===id):null;
  if(id&&!c) return;
  const d=c||{name:'',set:'',num:'',game:'pkmn',cat:'',cond:'nm',cost:0,value:0,qty:1};
  const g=d.game||'pkmn'; editPhoto=null;
  const priceLine=c? (c.priceLive?`<span class="live">● Live</span> · Stand ${new Date(c.priceTs||c.ts).toLocaleDateString('de-DE')}`:(c.value?'manuell oder geschätzt':'noch kein Wert')) : '';
  openSheet(c?'Karte':'Karte hinzufügen', `
    <div class="photo-edit">
      <div class="pic" id="ed-pic">${c&&c.hasPhoto?`<img data-photo="${esc(c.id)}" alt="" hidden><span class="ini">Foto lädt…</span>`:c&&c.img?`<img src="${esc(c.img)}" alt="" onerror="this.remove()">`:'<span>Kein Foto</span>'}</div>
      <div style="display:flex;flex-direction:column;gap:8px;min-width:0;flex:1">
        <button class="btn sm line" onclick="el('photo-input').click()">${c&&c.hasPhoto?'Foto ändern':'Foto hinzufügen'}</button>
        ${c?`<a class="btn sm" href="${esc(marketLink({game:gameLabel[g],name:c.name,name_en:c.name_en,set:c.set,number:c.num}))}" target="_blank" rel="noopener">Cardmarket ↗</a>`:''}
      </div>
    </div>
    <div class="fields">
      <div class="field full"><label for="ed-name">Name</label><input id="ed-name" value="${esc(d.name)}" placeholder="z. B. Glurak ex"></div>
      <div class="field"><label for="ed-game">Spiel</label><select id="ed-game">${Object.keys(gameLabel).map(k=>`<option value="${k}" ${k===g?'selected':''}>${gameLabel[k]}</option>`).join('')}</select></div>
      <div class="field"><label for="ed-cat">Kategorie</label><select id="ed-cat"></select></div>
      <div class="field"><label for="ed-set">Set</label><input id="ed-set" value="${esc(d.set)}" placeholder="z. B. Obsidianflammen"></div>
      <div class="field"><label for="ed-num">Nummer</label><input id="ed-num" value="${esc(d.num)}" placeholder="z. B. 199/197"></div>
      <div class="field"><label for="ed-cond">Zustand</label><select id="ed-cond">${Object.keys(condLabel).map(k=>`<option value="${k}" ${k===d.cond?'selected':''}>${condLabel[k]}</option>`).join('')}</select></div>
      <div class="field"><label for="ed-qty">Anzahl</label><input id="ed-qty" inputmode="numeric" value="${d.qty||1}"></div>
      <div class="field"><label for="ed-cost">Kaufpreis €</label><input id="ed-cost" inputmode="decimal" value="${numIn(d.cost)}" placeholder="0,00"></div>
      <div class="field"><label for="ed-val">Marktwert €</label><input id="ed-val" inputmode="decimal" value="${numIn(d.value)}" placeholder="0,00"></div>
    </div>
    ${c?`<div class="row" style="align-items:center"><span class="note" id="ed-price-line">${priceLine}</span><button class="btn sm line" id="ed-live" style="flex:0 0 auto">Live-Preis holen</button></div>`:''}
    <div class="panel"><div class="set-h" style="margin-bottom:8px"><h3>Lohnt sich Grading?</h3><select id="ed-tier" style="width:auto;min-height:38px" aria-label="PSA-Service">
      <option value="value">Value ~25 €</option><option value="reg" selected>Regular ~40 €</option><option value="express">Express ~80 €</option></select></div>
      <div id="ed-roi"></div></div>
    <div class="acts">
      <button class="btn gold full" id="ed-save">${c?'Speichern':'In den Vault legen'}</button>
      ${c?'<button class="btn danger full" id="ed-del">Aus dem Vault entfernen</button>':''}
    </div>`);
  const sync=()=>{ const gg=el('ed-game').value, prev=el('ed-cat').value||d.cat;
    el('ed-cat').innerHTML=(CATS[gg]||CATS.other).map(x=>`<option ${x===prev?'selected':''}>${esc(x)}</option>`).join(''); };
  sync(); el('ed-game').onchange=sync;
  const roi=()=>{ el('ed-roi').innerHTML=roiHTML(computeROI(parseEuro(el('ed-val').value),el('ed-cond').value,el('ed-tier').value,15),true); };
  roi(); ['ed-val','ed-cond','ed-tier'].forEach(i=>el(i).addEventListener('input',roi)); el('ed-tier').onchange=roi; el('ed-cond').onchange=roi;
  hydratePhotos(el('ed-pic'));
  el('photo-input').onchange=async ev=>{ const f=ev.target.files[0]; ev.target.value=''; if(!f) return;
    const url=await compressAsync(f); if(!url){ toast('Bild konnte nicht geladen werden'); return; }
    editPhoto=url; el('ed-pic').innerHTML=`<img src="${url}" alt="">`; };
  if(c){
    el('ed-live').onclick=async()=>{ const b=el('ed-live'); b.disabled=true; b.textContent='Suche…';
      const m=await bestLiveMatch(c);
      if(m){ el('ed-val').value=numIn(m.prices.main); roi(); el('ed-price-line').innerHTML=`<span class="live">● Live</span> · ${esc(m.source)} · ${esc(m.label||'')}`; c._pendingLive=true; toast('Live-Preis übernommen – Speichern tippen'); }
      else toast('Kein eindeutiger Live-Preis gefunden – Set und Nummer prüfen');
      b.disabled=false; b.textContent='Live-Preis holen'; };
    el('ed-del').onclick=async()=>{ if(await confirmDialog('„'+c.name+'“ wirklich aus dem Vault entfernen?','Entfernen')){
      cards=cards.filter(x=>x.id!==c.id); if(c.hasPhoto) Photos.del(c.id); save(); closeSheet(); refreshAll(); toast('Karte entfernt'); } };
  }
  el('ed-save').onclick=()=>{
    const name=el('ed-name').value.trim(); if(!name){ toast('Bitte einen Namen eingeben'); el('ed-name').focus(); return; }
    const t=c||{id:uid(),ts:Date.now(),hasPhoto:false};
    const newVal=parseEuro(el('ed-val').value);
    Object.assign(t,{name,game:el('ed-game').value,cat:el('ed-cat').value,set:el('ed-set').value.trim(),num:el('ed-num').value.trim(),
      cond:el('ed-cond').value,qty:Math.max(1,parseInt(el('ed-qty').value,10)||1),cost:parseEuro(el('ed-cost').value),value:newVal});
    if(t._pendingLive){ t.priceLive=true; t.priceTs=Date.now(); delete t._pendingLive; }
    else if(c && newVal!==d.value){ t.priceLive=false; }
    if(editPhoto){ t.hasPhoto=true; Photos.set(t.id,editPhoto); }
    if(!c) cards.unshift(t);
    save(); closeSheet(); refreshAll(); toast(c?'Gespeichert ✓':'„'+name+'“ im Vault ✓');
  };
}

