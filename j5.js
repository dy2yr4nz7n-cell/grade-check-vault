/* ============ Admin (7× aufs Logo tippen) ============ */
const ADMIN_HASHES=['bc554d440020a803b2fb429e16118b65f06f1e2a9f856141fefcc8d9fce7cd23','x7b847059'];
function adminCode(){ try{ return sessionStorage.getItem('gcv_admin_code')||''; }catch(e){ return ''; } }
let isAdmin=store.get('gcv_admin')==='1';
function openAdmin(){ renderAdmin(); el('admin-modal').classList.add('show'); if(isAdmin) adminLoadBackups(); }
function closeAdmin(){ el('admin-modal').classList.remove('show'); }
function renderAdmin(){
  const body=el('admin-body');
  if(!isAdmin){ body.innerHTML=`<p class="note">Admin-Code eingeben, um den Modus freizuschalten.</p>
      <input id="admin-code" type="password" placeholder="Admin-Code" aria-label="Admin-Code">
      <div id="admin-err" class="status err" style="display:none;margin-top:6px"></div>
      <button class="btn gold w100" style="margin-top:10px" onclick="adminUnlock()">Freischalten</button>`; return; }
  const value=cards.reduce((s,c)=>s+(c.value||0)*(c.qty||1),0), accList=Object.keys(load('gcv_accounts',{}));
  body.innerHTML=`<div class="adm-stat"><span>Angemeldet</span><b>${currentUser?esc(currentUser.name):'—'}</b></div>
    <div class="adm-stat"><span>Karten</span><b>${cards.length}</b></div>
    <div class="adm-stat"><span>Sammlungswert</span><b>${eur(value)}</b></div>
    <div class="adm-stat"><span>Server</span><b>${serverOnline?'verbunden':'offline'}</b></div>
    <div class="adm-stat"><span>Lokale Konten</span><b>${accList.length}</b></div>
    ${accList.length?`<div class="note" style="margin:6px 0">${accList.map(esc).join(', ')}</div>`:''}
    <div style="display:flex;flex-direction:column;gap:8px;margin-top:12px">
      <button class="btn sm" onclick="exportJSON()">Alle Daten exportieren</button>
      <button class="btn sm danger" onclick="adminReset()">Sammlung zurücksetzen</button>
      ${window.__appServer?`<div class="note" style="margin-top:6px;color:var(--gold);font-weight:700">Server-Backups</div>
        <div id="adm-backup-list" class="note">Lade…</div><button class="btn sm" onclick="adminTriggerBackup()">Backup jetzt erstellen</button>`:''}
      <button class="btn sm" onclick="adminLogout()">Admin-Modus verlassen</button></div>`;
}
async function adminUnlock(){
  const v=(el('admin-code').value||'').trim();
  if(v&&ADMIN_HASHES.includes(await sha256(v))){ try{ sessionStorage.setItem('gcv_admin_code',v); }catch(e){} isAdmin=true; store.set('gcv_admin','1'); toast('Admin-Modus aktiv'); renderAdmin(); adminLoadBackups(); }
  else { const e=el('admin-err'); e.textContent='Falscher Code.'; e.style.display='block'; }
}
function adminLogout(){ isAdmin=false; store.set('gcv_admin','0'); toast('Admin-Modus verlassen'); renderAdmin(); }
async function adminLoadBackups(){
  const box=el('adm-backup-list'); if(!box||!window.__appServer) return;
  try{ const r=await fetch('/api/admin/backups',{headers:{'x-admin-code':adminCode()}}); if(!r.ok){ box.textContent='Fehler beim Laden (Code erneut eingeben?).'; return; }
    const {backups}=await r.json(); if(!backups.length){ box.textContent='Noch keine Backups vorhanden.'; return; }
    box.innerHTML=backups.map((b,i)=>`<div class="adm-stat"><span>${esc(new Date(b.created).toLocaleString('de-DE'))} (${(b.size/1024).toFixed(0)} KB)</span><button class="btn sm" data-b="${i}">Wiederherstellen</button></div>`).join('');
    box.querySelectorAll('[data-b]').forEach(btn=>btn.onclick=()=>adminRestoreBackup(backups[+btn.dataset.b].name));
  }catch(e){ box.textContent='Server nicht erreichbar.'; }
}
async function adminTriggerBackup(){ try{ const r=await fetch('/api/admin/backups/trigger',{method:'POST',headers:{'x-admin-code':adminCode()}}); toast(r.ok?'Backup erstellt':'Backup fehlgeschlagen'); if(r.ok) adminLoadBackups(); }catch(e){ toast('Server nicht erreichbar'); } }
async function adminRestoreBackup(name){
  if(!await confirmDialog('Wirklich auf dieses Backup zurücksetzen?\nAlle aktuellen Server-Daten werden überschrieben.','Wiederherstellen')) return;
  try{ const r=await fetch('/api/admin/backups/restore',{method:'POST',headers:{'x-admin-code':adminCode(),'Content-Type':'application/json'},body:JSON.stringify({name})});
    if(r.ok){ toast('Wiederhergestellt – neu laden empfohlen'); adminLoadBackups(); } else { const d=await r.json().catch(()=>({})); toast('Fehler: '+(d.error||'Unbekannt')); } }
  catch(e){ toast('Server nicht erreichbar'); }
}
async function adminReset(){
  if(await confirmDialog('Wirklich ALLE Karten löschen? Das kann nicht rückgängig gemacht werden.','Alles löschen')){
    cards.forEach(c=>{ if(c.hasPhoto) Photos.del(c.id); }); cards=[]; save(); refreshAll(); toast('Sammlung zurückgesetzt'); renderAdmin(); }
}

/* ============ Navigation ============ */
let view='scan';
function go(v, anchor){
  view=v;
  ['scan','coll','more'].forEach(x=>el('v-'+x).hidden=x!==v);
  document.querySelectorAll('.tab').forEach(t=>{ if(t.dataset.view===v) t.setAttribute('aria-current','page'); else t.removeAttribute('aria-current'); });
  if(anchor && el(anchor)){ setTimeout(()=>{ el(anchor).scrollIntoView({behavior:'smooth',block:'start'}); const f=el(anchor).querySelector('input'); if(f) f.focus({preventScroll:true}); },50); }
  else window.scrollTo({top:0});
  if(v==='more'){ renderMore(); }
}

/* ============ Sammlung ============ */
let collFilter='all';
const cardValue=c=>(c.value||0)*(c.qty||1);
const cardCost=c=>(c.cost||0)*(c.qty||1);
function renderHome(){
  const total=cards.reduce((s,c)=>s+cardValue(c),0), n=cards.reduce((s,c)=>s+(c.qty||1),0);
  el('h-value').textContent=eur(total); el('h-count').textContent=n===1?'1 Karte':n+' Karten';
  el('key-hint').hidden=!!aiKey();
  renderRecent();
}
function renderCollection(){
  const total=cards.reduce((s,c)=>s+cardValue(c),0), cost=cards.reduce((s,c)=>s+cardCost(c),0), pl=total-cost;
  const n=cards.reduce((s,c)=>s+(c.qty||1),0);
  el('s-value').textContent=eur(total); el('s-count').textContent=n; el('s-cost').textContent=eur(cost);
  const e=el('s-pl'); e.textContent=(pl>=0?'+':'')+eur(pl); e.className=pl>=0?'pos':'neg';
  // Filter-Chips mit Anzahl
  const counts={all:cards.length}; cards.forEach(c=>{ const g=c.game||'pkmn'; counts[g]=(counts[g]||0)+1; });
  const games=['all','pkmn','ygo','mtg','other'].filter(g=>g==='all'||counts[g]);
  if(!games.includes(collFilter)) collFilter='all';
  el('c-filter').innerHTML=games.map(g=>`<button class="chip" data-g="${g}" aria-pressed="${g===collFilter}">${g==='all'?'Alle':gameLabel[g]}<small>${counts[g]||0}</small></button>`).join('');
  el('c-filter').hidden=cards.length<2;
  const q=norm(el('c-q').value), sort=el('c-sort').value;
  let list=cards.filter(c=>(collFilter==='all'||(c.game||'pkmn')===collFilter) && (!q||norm([c.name,c.name_en,c.set,c.num].join(' ')).includes(q)));
  list.sort((a,b)=> sort==='value'?cardValue(b)-cardValue(a) : sort==='name'?String(a.name).localeCompare(String(b.name),'de') : sort==='pl'?((cardValue(b)-cardCost(b))-(cardValue(a)-cardCost(a))) : (b.ts||0)-(a.ts||0));
  const grid=el('grid');
  if(!cards.length){ grid.style.display='block'; grid.innerHTML=`<div class="empty">Noch keine Karten im Vault.<br>Scanne deine erste Karte – sie landet mit Foto und Preis hier.<br><button class="btn gold" onclick="go('scan')">Karte scannen</button></div>`; el('refresh-btn').hidden=true; return; }
  el('refresh-btn').hidden=false;
  if(!list.length){ grid.style.display='block'; grid.innerHTML=`<div class="empty">Keine Karten für diese Suche.</div>`; return; }
  grid.style.display='';
  grid.innerHTML=list.map(c=>{
    const g=c.game||'pkmn', p=cardValue(c)-cardCost(c), showPl=(c.cost||0)>0;
    return `<button class="tile" data-id="${esc(c.id)}">
      <span class="img">${c.hasPhoto?`<img data-photo="${esc(c.id)}" alt="" hidden><span class="ini">${esc((c.name||'?').slice(0,2))}</span>`:c.img?`<img src="${esc(c.img)}" alt="" loading="lazy" onerror="this.remove()"><span class="ini">${esc((c.name||'?').slice(0,2))}</span>`:`<span class="ini">${esc((c.name||'?').slice(0,2))}</span>`}
        <span class="badge ${g}">${GAME_BADGE[g]||'TCG'}</span>${(c.qty||1)>1?`<span class="qty">${c.qty}×</span>`:''}</span>
      <span class="tx"><b>${esc(c.name)}</b><small>${esc([c.set,c.num].filter(Boolean).join(' · ')||condLabel[c.cond]||'')}</small>
        <span class="v"><strong>${eur(c.value)}${c.priceLive?'':(c.value?'<span class="est-mark" title="nicht live">≈</span>':'')}</strong>${showPl?`<em class="${p>=0?'pos':'neg'}">${p>=0?'+':''}${eur(p)}</em>`:''}</span></span>
    </button>`; }).join('');
  hydratePhotos(grid);
}
el('grid').addEventListener('click',e=>{ const t=e.target.closest('.tile'); if(t) openCard(t.dataset.id); });
el('c-filter').addEventListener('click',e=>{ const b=e.target.closest('.chip'); if(!b) return; collFilter=b.dataset.g; renderCollection(); });
el('c-q').addEventListener('input',renderCollection); el('c-sort').addEventListener('change',renderCollection);

