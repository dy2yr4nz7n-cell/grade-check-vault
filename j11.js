/* ============ Suche ============ */
let searchGame='all';
el('search-games').addEventListener('click',e=>{ const b=e.target.closest('.chip'); if(!b) return; searchGame=b.dataset.g;
  el('search-games').querySelectorAll('.chip').forEach(x=>x.setAttribute('aria-pressed',x===b)); if(el('q').value.trim()) runSearch(); });
el('search-form').addEventListener('submit',e=>{ e.preventDefault(); runSearch(); });
async function searchPkmn(q){
  const l=await getJSON('https://api.tcgdex.net/v2/de/cards?name='+encodeURIComponent('like:'+q)).catch(()=>null);
  return Array.isArray(l)?l.slice(0,15).map(x=>({game:'pkmn',id:x.id,name:x.name,sub:'Nr. '+x.localId,img:x.image?x.image+'/low.webp':''})):[];
}
async function searchYgo(q){
  let r=await getJSON('https://db.ygoprodeck.com/api/v7/cardinfo.php?language=de&fname='+encodeURIComponent(q)).catch(()=>null);
  if(!r||!r.data) r=await getJSON('https://db.ygoprodeck.com/api/v7/cardinfo.php?fname='+encodeURIComponent(q)).catch(()=>null);
  return r&&r.data?r.data.slice(0,15).map(x=>{ const m=ygoMatch(x,''); return {game:'ygo',name:x.name,sub:[m.label,m.number].filter(Boolean).join(' · '),img:m.img,price:m.prices&&m.prices.main,raw:x}; }):[];
}
async function searchMtg(q){
  const r=await getJSON('https://api.scryfall.com/cards/search?q='+encodeURIComponent(q)).catch(()=>null);
  return r&&r.data?r.data.slice(0,15).map(x=>{ const m=mtgMatch(x,false); return {game:'mtg',name:x.printed_name||x.name,sub:[m.label,m.number].filter(Boolean).join(' · '),img:m.img,price:m.prices&&m.prices.main,raw:x}; }):[];
}
let searchItems=[];
async function runSearch(){
  const q=el('q').value.trim(), box=el('search-results'); if(!q){ box.innerHTML=''; return; }
  box.innerHTML='<div class="status">Suche läuft …</div>';
  const jobs=[]; if(searchGame==='all'||searchGame==='pkmn') jobs.push(searchPkmn(q)); if(searchGame==='all'||searchGame==='ygo') jobs.push(searchYgo(q)); if(searchGame==='all'||searchGame==='mtg') jobs.push(searchMtg(q));
  searchItems=(await Promise.all(jobs)).flat();
  if(!searchItems.length){ box.innerHTML=`<div class="empty">Keine Treffer für „${esc(q)}“. Anderes Spiel wählen oder den englischen Namen probieren.</div>`; return; }
  box.innerHTML=searchItems.map((x,i)=>`<button class="li" data-i="${i}">${x.img?`<img src="${esc(x.img)}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'ph'}))">`:'<span class="ph"></span>'}
    <span class="t"><b><span class="badge ${x.game}">${GAME_BADGE[x.game]}</span> ${esc(x.name)}</b><small>${esc(x.sub||'')}</small></span>
    ${x.price?`<span class="p">${eur(x.price)}</span>`:''}</button>`).join('');
}
el('search-results').addEventListener('click',async e=>{
  const b=e.target.closest('.li'); if(!b) return; const x=searchItems[+b.dataset.i]; if(!x) return;
  let entry;
  if(x.game==='pkmn'){
    b.disabled=true; const f=await getJSON('https://api.tcgdex.net/v2/de/cards/'+encodeURIComponent(x.id)).catch(()=>null); b.disabled=false;
    if(!f){ toast('Karte konnte nicht geladen werden'); return; }
    const m=pkmnMatch(f,false);
    entry={c:{identified:true,game:'Pokémon',name:f.name,set:m.label,number:m.number,rarity:f.rarity||'',card_kind:f.category||''},matches:[slimMatch(m)]};
  } else if(x.game==='ygo'){ const m=ygoMatch(x.raw,''); entry={c:{identified:true,game:'Yu-Gi-Oh!',name:x.name,set:m.label,number:m.number,rarity:m.rarity,card_kind:/spell/i.test(m.kind)?'Zauber':/trap/i.test(m.kind)?'Falle':/fusion|synchro|xyz|link/i.test(m.kind)?'Extra Deck':'Monster'},matches:[slimMatch(m)]}; }
  else { const m=mtgMatch(x.raw,false); entry={c:{identified:true,game:'Magic: The Gathering',name:x.name,name_en:x.raw.name,set:m.label,number:m.number,rarity:m.rarity,card_kind:/creature/i.test(m.kind)?'Kreatur':/land/i.test(m.kind)?'Land':/planeswalker/i.test(m.kind)?'Planeswalker':/instant|sorcery/i.test(m.kind)?'Spontanzauber / Hexerei':'Artefakt / Verzauberung'},matches:[slimMatch(m)]}; }
  Object.assign(entry,{id:uid(),ts:Date.now(),src:'search',sel:0});
  openResult(entry);
});

/* ============ Verlauf „Zuletzt gescannt“ ============ */
const K_RECENT='gcv_scans';
function getRecent(){ return load(K_RECENT,[]); }
function setRecent(list){ try{ localStorage.setItem(K_RECENT,JSON.stringify(list.slice(0,15))); }catch(e){ try{ localStorage.setItem(K_RECENT,JSON.stringify(list.slice(0,5))); }catch(e2){} } }
function addRecent(e){ const list=getRecent().filter(x=>x.id!==e.id); list.unshift({id:e.id,ts:e.ts,c:e.c,matches:e.matches,sel:e.sel,thumb:e.thumb,savedId:e.savedId||null}); setRecent(list); renderRecent(); }
function saveRecentSel(e){ if(e.src!=='scan') return; const list=getRecent(); const r=list.find(x=>x.id===e.id); if(r){ r.sel=e.sel; r.savedId=e.savedId||null; setRecent(list); renderRecent(); } }
function renderRecent(){
  const list=getRecent(); el('recent-block').hidden=!list.length;
  el('recent').innerHTML=list.map((r,i)=>{ const m=r.matches&&r.matches[r.sel]; const p=m&&m.prices&&m.prices.main!=null?m.prices.main:null;
    return `<button class="rc" data-i="${i}">${r.thumb?`<img src="${r.thumb}" alt="">`:'<span class="ph"></span>'}<b>${esc(r.c.name)}</b><small>${p!=null?eur(p):'&nbsp;'}</small></button>`; }).join('');
}
el('recent').addEventListener('click',e=>{ const b=e.target.closest('.rc'); if(!b) return; const r=getRecent()[+b.dataset.i]; if(!r) return;
  openResult(Object.assign({src:'scan',matches:[],sel:0},r)); });

/* ============ Preise der Sammlung aktualisieren ============ */
let refreshing=false;
async function refreshPrices(){
  if(refreshing) return;
  const st=el('refresh-status'), btn=el('refresh-btn');
  const todo=cards.filter(c=>['pkmn','ygo','mtg'].includes(c.game||'pkmn')&&c.name);
  if(!todo.length){ st.textContent='Live-Preise gibt es für Pokémon, Yu-Gi-Oh! und Magic – keine passende Karte in der Sammlung.'; return; }
  refreshing=true; btn.disabled=true; let ok=0,i=0;
  for(const c of todo){ i++; st.textContent='Aktualisiere '+i+' von '+todo.length+' …';
    const m=await bestLiveMatch(Object.assign({},c,{game:c.game||'pkmn'}));
    if(m){ c.value=Math.round(m.prices.main*100)/100; c.priceLive=true; c.priceTs=Date.now(); ok++; }
    await new Promise(r=>setTimeout(r,120)); }
  save(); refreshAll(); btn.disabled=false; refreshing=false;
  st.textContent=ok+' von '+todo.length+' Preisen aktualisiert'+(todo.length-ok?' · '+(todo.length-ok)+' ohne eindeutigen Treffer (Set oder Nummer prüfen)':'')+' .';
}

/* ============ Export / Import ============ */
async function exportJSON(){
  const out=[]; for(const c of cards){ const cc=Object.assign({},c); if(c.hasPhoto){ const u=await Photos.get(c.id); if(u) cc.photo=u; } out.push(cc); }
  const data=JSON.stringify({app:'Grade-Check Vault',version:3,exported:new Date().toISOString(),cards:out,stats},null,1);
  const name='grade-check-vault-'+new Date().toISOString().slice(0,10)+'.json';
  try{ const file=new File([data],name,{type:'application/json'});
    if(navigator.canShare&&navigator.canShare({files:[file]})){ await navigator.share({files:[file],title:'Grade-Check Vault Sicherung'}); markBackup(); toast('Sicherung geteilt ✓'); renderMore(); return; } }
  catch(e){ if(e&&e.name==='AbortError') return; }
  try{ const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([data],{type:'application/json'})); a.download=name; document.body.append(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),2000);
    markBackup(); toast('Sicherung gespeichert ⬇'); renderMore(); }
  catch(e){ navigator.clipboard?.writeText(data).then(()=>toast('In Zwischenablage kopiert'),()=>toast('Export nicht möglich')); }
}
function importJSON(ev){
  const f=ev.target.files[0]; if(!f) return; const r=new FileReader();
  r.onload=async e=>{ try{ const d=JSON.parse(e.target.result), arr=Array.isArray(d)?d:d.cards; if(!Array.isArray(arr)) throw 0;
      if(await confirmDialog(arr.length+' Karten importieren? Vorhandene Karten bleiben erhalten, gleiche werden nicht doppelt angelegt.','Importieren')){
        const ids=new Set(cards.map(c=>c.id)); let n=0;
        arr.forEach(c=>{ if(!c||!c.name) return; if(!c.id) c.id=uid(); if(ids.has(c.id)) return; if(c.photo){ c.hasPhoto=true; Photos.set(c.id,c.photo); delete c.photo; } cards.push(c); ids.add(c.id); n++; });
        save(); refreshAll(); toast(n+' Karten importiert ✓'); } }
    catch(err){ toast('Die Datei ist keine gültige Sicherung'); }
    ev.target.value=''; };
  r.readAsText(f);
}

