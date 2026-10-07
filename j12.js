/* ============ Hinweise: Startbildschirm & Sicherung ============ */
function isStandalone(){ return (window.matchMedia&&window.matchMedia('(display-mode: standalone)').matches)||window.navigator.standalone===true; }
let _deferredPrompt=null; window.addEventListener('beforeinstallprompt',e=>{ e.preventDefault(); _deferredPrompt=e; });
function showNudge(html,label,fn,onDismiss){ const n=el('nudge'); el('nudge-txt').innerHTML=html; const a=el('nudge-act');
  if(label){ a.textContent=label; a.style.display=''; a.onclick=()=>{ hideNudge(); fn&&fn(); }; } else { a.style.display='none'; a.onclick=null; }
  el('nudge-x').onclick=()=>{ hideNudge(); onDismiss&&onDismiss(); }; n.classList.add('show'); document.body.classList.add('nudge-on'); }
function hideNudge(){ el('nudge').classList.remove('show'); document.body.classList.remove('nudge-on'); }
function maybeSuggestInstall(){
  if(isStandalone()||store.get('gcv_a2hs_done')==='1'||!cards.length) return;
  setTimeout(()=>{ if(el('nudge').classList.contains('show')) return;
    showNudge('📲 <b>Zum Startbildschirm hinzufügen</b> – dann bleibt deine Sammlung sicher gespeichert (Browser löschen lokale Daten sonst nach einiger Zeit).',
      _deferredPrompt?'Installieren':'Wie?', ()=>{ store.set('gcv_a2hs_done','1'); if(_deferredPrompt){ _deferredPrompt.prompt(); _deferredPrompt=null; } else toast('Teilen-Menü öffnen → „Zum Home-Bildschirm“'); },
      ()=>store.set('gcv_a2hs_done','1')); },4000);
}
const BACKUP_INTERVAL=14*24*60*60*1000;
function markBackup(){ store.set('gcv_last_backup',String(Date.now())); }
function maybeSuggestBackup(){
  if(!cards.length) return; const last=parseInt(store.get('gcv_last_backup')||'0',10);
  if(!last){ markBackup(); return; } if(Date.now()-last<BACKUP_INTERVAL) return;
  setTimeout(()=>showNudge('💾 Länger keine Sicherung gemacht. Sammlung jetzt als Datei sichern?','Sichern',()=>exportJSON(),()=>markBackup()),2000);
}

/* ============ Admin-Zugang: 7× aufs Logo tippen ============ */
let tapCount=0, tapTimer=null;
el('brand').addEventListener('click',()=>{ tapCount++; clearTimeout(tapTimer); tapTimer=setTimeout(()=>tapCount=0,1400);
  if(tapCount>=7){ tapCount=0; openAdmin(); } else if(tapCount===1) go('scan'); });

/* ============ Start ============ */
migrateSchema();
refreshAll(); renderProfile(); renderFbUI();
if(fbConfigured()) ensureFirebase().catch(()=>{});
if(store.get('gcv_server')||fbConfigured()) el('adv-sync').open=true;
serverPing().then(on=>{ if(on) el('adv-sync').open=true; });
checkReplitSession();
maybeSuggestBackup(); maybeSuggestInstall();
if('serviceWorker' in navigator && location.protocol.startsWith('http')){
  window.addEventListener('load',()=>{ navigator.serviceWorker.register('sw.js').catch(()=>{}); });
}
