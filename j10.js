/* ============ Ergebnis-Blatt (Scan, Suche, Verlauf) ============ */
let currentEntry=null;
function priceHTML(c,m,loading){
  if(loading) return '<div class="price"><span class="lbl">Marktwert</span><span class="amt">…</span><span class="note">Suche Live-Preis bei Cardmarket …</span></div>';
  if(m&&m.prices&&m.prices.main!=null){ const p=m.prices;
    const three=(p.trend!=null||p.avg30!=null||p.low!=null)?`<div class="three"><div><span>Trend</span>${money(p.trend)}</div><div><span>Ø 30 Tage</span>${money(p.avg30)}</div><div><span>Ab</span>${money(p.low)}</div></div>`:'';
    return `<div class="price"><span class="lbl">Marktwert <span class="live">● Live</span></span><span class="amt">${money(p.main)}</span>${three}
      <span class="note">${esc([m.source,m.variantNote,m.updated?'Stand '+new Date(m.updated).toLocaleDateString('de-DE'):''].filter(Boolean).join(' · '))}</span></div>`; }
  const lo=c.price_eur_low, hi=c.price_eur_high;
  const t=(lo==null&&hi==null)?'Keine Angabe':(lo===hi||hi==null)?money(lo):money(lo)+' – '+money(hi);
  return `<div class="price"><span class="lbl">Marktwert <span class="est">KI-Schätzung</span></span><span class="amt">${t}</span>
    <span class="note">Für diese Karte gibt es keinen Live-Preis. Prüfe den Wert über Cardmarket.</span></div>`;
}
function entryValue(e){ const m=e.matches[e.sel]; if(m&&m.prices&&m.prices.main!=null) return m.prices.main;
  const lo=e.c.price_eur_low, hi=e.c.price_eur_high; if(lo==null&&hi==null) return 0; return Math.round((((lo??hi)+(hi??lo))/2)*100)/100; }
function openResult(e, loading){
  currentEntry=e; const c=e.c, m=e.matches[e.sel], g=gameCode(c.game);
  const conf=c.confidence!=null?Math.round(c.confidence*100):null, cc=conf==null?'':conf>=80?'':conf>=55?'mid':'low';
  const facts=[['Nummer',c.number],['Seltenheit',c.rarity||(m&&m.rarity)],['Variante',c.variant],['Jahr',c.year],['Sprache',c.language],['Zustand (geschätzt)',c.condition_estimate]].filter(x=>x[1]);
  const others=e.matches.map((x,i)=>i===e.sel?'':`<button class="alt" data-sel="${i}">${esc(x.label)} <small>${esc(x.number||'')}${x.prices&&x.prices.main!=null?' · '+money(x.prices.main):''}</small></button>`).join('');
  const alts=(c.alternatives||[]).filter(a=>a&&a.name).slice(0,3).map(a=>`<div class="alt" style="cursor:default">${esc(a.name)} <small>${esc([a.set,a.number].filter(Boolean).join(' · '))}</small></div>`).join('');
  const pic=e.photo||e.thumb||(m&&m.img)||'';
  const inVault=e.savedId&&cards.find(x=>x.id===e.savedId);
  const val=entryValue(e);
  openSheet(e.src==='scan'?'Scan-Ergebnis':'Karte',`
    <div class="res-top">
      <div class="pic">${pic?`<img src="${esc(pic)}" alt="" onerror="this.remove()">`:''}</div>
      <div class="t">
        <div><span class="badge ${g}">${GAME_BADGE[g]}</span>${conf!=null?`<span class="conf ${cc}"><i></i>${conf} % sicher</span>`:''}</div>
        <p class="res-name">${esc(c.name)}</p>
        ${c.name_en&&norm(c.name_en)!==norm(c.name)?`<span class="res-sub">${esc(c.name_en)}</span>`:''}
        <span class="res-sub">${esc([(m&&m.label)||c.set,c.number].filter(Boolean).join(' · '))}${g==='other'&&c.game?' · '+esc(c.game):''}</span>
        ${m&&m.img&&e.photo?`<img src="${esc(m.img)}" alt="Referenzbild" style="width:44px;border-radius:4px;margin-top:4px" onerror="this.remove()">`:''}
      </div>
    </div>
    ${priceHTML(c,m,loading)}
    ${facts.length?`<dl class="facts">${facts.map(f=>`<div><dt>${esc(f[0])}</dt><dd>${esc(f[1])}</dd></div>`).join('')}</dl>`:''}
    ${c.condition_notes?`<span class="note">Zustand: ${esc(c.condition_notes)}</span>`:''}
    ${c.notes?`<span class="note">${esc(c.notes)}</span>`:''}
    ${others?`<div class="alts"><h2 style="margin:0">Andere Drucke – antippen</h2>${others}</div>`:''}
    ${alts?`<div class="alts"><h2 style="margin:0">Könnte auch sein</h2>${alts}</div>`:''}
    ${loading?'':`<div class="acts">
      ${inVault?`<button class="btn line full" id="r-open">Im Vault ✓ – ansehen</button>`:`<button class="btn gold full" id="r-add">In den Vault legen</button>`}
      <button class="btn" id="r-roi">Grading prüfen</button>
      <a class="btn" href="${esc((m&&m.url)||marketLink(c))}" target="_blank" rel="noopener">Cardmarket ↗</a>
    </div>
    <div id="r-roi-out"></div>`}`);
  el('sheet-body').querySelectorAll('[data-sel]').forEach(b=>b.onclick=()=>{ e.sel=+b.dataset.sel; saveRecentSel(e); openResult(e); });
  if(loading) return;
  if(inVault) el('r-open').onclick=()=>{ closeSheet(); openCard(e.savedId); };
  else el('r-add').onclick=()=>{ const id=addEntryToVault(e); e.savedId=id; saveRecentSel(e); openResult(e); toast('„'+c.name+'“ im Vault ✓'); };
  el('r-roi').onclick=()=>{ el('r-roi-out').innerHTML=`<div class="panel">${roiHTML(computeROI(val,condCode(c.condition_estimate),'reg',15),false)}</div>`; el('r-roi-out').scrollIntoView({behavior:'smooth',block:'nearest'}); };
}
function addEntryToVault(e){
  const c=e.c, m=e.matches[e.sel], g=gameCode(c.game);
  const card={id:uid(),ts:Date.now(),name:c.name||c.name_en||'Karte',set:(m&&m.label&&g!=='ygo')?m.label:(c.set||''),num:c.number||(m&&m.number)||'',
    cost:0,value:entryValue(e),cond:condCode(c.condition_estimate),cat:catFor(g,c.card_kind||(m&&m.kind)),game:g,qty:1,hasPhoto:false,
    name_en:c.name_en||'',set_en:c.set_en||'',set_code:c.set_code||'',variant:c.variant||'',is_foil:!!c.is_foil,lang:c.language||'',
    tcg:g==='other'?(c.game||''):'',priceLive:!!(m&&m.prices&&m.prices.main!=null),priceTs:Date.now()};
  const pic=e.photo||e.thumb;
  if(pic){ card.hasPhoto=true; Photos.set(card.id,pic); }
  else if(m&&m.img){ card.img=m.img; }
  cards.unshift(card); save(); refreshAll(); return card.id;
}

