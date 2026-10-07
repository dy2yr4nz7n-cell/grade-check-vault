/* ================================================================
   Grade-Check Vault 3.0
   Aufbau: Helfer · Daten & Fotos · Sync (Server/Firebase/AES) · Konto · Admin
           Navigation · Sammlung · Karten-Blatt · Grading · KI-Scan · Preise
           Suche · Verlauf · Export/Import · Hinweise · Start
   Daten bleiben kompatibel zu älteren Versionen:
     localStorage 'gcv_cards' (Karten), IndexedDB 'gcv_photos' (Fotos)
================================================================ */

/* ============ Helfer ============ */
const mem = {};
const store = {
  get(k){ try{ return localStorage.getItem(k); }catch(e){ return mem[k] ?? null; } },
  set(k,v){ try{ localStorage.setItem(k,v); }catch(e){ mem[k]=v; } }
};
function load(k, def){ try{ const v=store.get(k); return v?JSON.parse(v):def; }catch(e){ return def; } }
function el(id){ return document.getElementById(id); }
function esc(s){ return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function eur(n){ return (Number(n)||0).toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2})+' €'; }
function money(n){ return (n==null||!isFinite(n))?'–':eur(n); }
function parseEuro(s){
  if(s==null) return 0;
  s=String(s).trim().replace(/[€\s]/g,'');
  if(s==='') return 0;
  if(s.includes(',')){ s=s.replace(/\./g,'').replace(',','.'); }
  else if(/^\d{1,3}(\.\d{3})+$/.test(s)){ s=s.replace(/\./g,''); }
  const n=parseFloat(s); return isFinite(n)?n:0;
}
const numIn = n => (n? String(Math.round(n*100)/100).replace('.',',') : '');
function toast(msg){ const t=el('toast'); t.textContent=msg; t.classList.add('show'); clearTimeout(t._t); t._t=setTimeout(()=>t.classList.remove('show'),2600); }
function confirmDialog(text, okLabel){
  return new Promise(res=>{
    el('modal-text').textContent=text; el('modal-ok').textContent=okLabel||'OK'; el('modal').classList.add('show');
    const ok=el('modal-ok'), cancel=el('modal-cancel');
    const done=v=>{ el('modal').classList.remove('show'); ok.onclick=null; cancel.onclick=null; res(v); };
    ok.onclick=()=>done(true); cancel.onclick=()=>done(false);
  });
}
const condLabel={gem:'Gem Mint',nm:'Near Mint',ex:'Excellent',pl:'Gespielt'};
const gameLabel={pkmn:'Pokémon',ygo:'Yu-Gi-Oh!',mtg:'Magic',other:'Andere TCG'};
const GAME_BADGE={pkmn:'PKM',ygo:'YGO',mtg:'MTG',other:'TCG'};
const CATS={
  pkmn:['Pokémon','Trainer','Energie','Spezial / Promo','Versiegelt'],
  ygo:['Monster','Zauber','Falle','Extra Deck','Versiegelt'],
  mtg:['Kreatur','Spontanzauber / Hexerei','Artefakt / Verzauberung','Planeswalker','Land','Versiegelt'],
  other:['Karte','Leader / Charakter','Spezial / Promo','Versiegelt']
};
const norm=s=>String(s??'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
function sim(a,b){ a=norm(a); b=norm(b); if(!a||!b) return 0; if(a===b) return 1; if(a.includes(b)||b.includes(a)) return .8;
  const A=new Set(a.split(' ')), B=new Set(b.split(' ')); let n=0; A.forEach(w=>B.has(w)&&n++); return n/Math.max(A.size,B.size); }
function gameCode(g){ g=norm(g); if(g.includes('pok')||g==='pkmn') return 'pkmn'; if(g.includes('yu gi')||g.includes('yugi')||g==='ygo') return 'ygo'; if(g.includes('magic')||g==='mtg') return 'mtg'; return 'other'; }
function condCode(c){ c=norm(c); if(c.includes('gem')||c==='mint'||c.startsWith('mint')) return 'gem'; if(c.includes('near')||c==='nm') return 'nm'; if(c.includes('excellent')||c.includes('good')) return 'ex'; if(c.includes('play')||c.includes('poor')) return 'pl'; return 'nm'; }
function catFor(game,kind){
  const list=CATS[game]||CATS.other; const k=norm(kind);
  return list.find(x=>norm(x)===k)||list.find(x=>k&&norm(x).includes(k.split(' ')[0]))||list[0];
}
const uid = () => Date.now()+'-'+Math.random().toString(36).slice(2,6);

/* ============ Daten & Fotos ============ */
let cards = load('gcv_cards', []);
let stats = load('gcv_stats', {});          // aus älteren Versionen – wird unverändert mitgesichert
const SCHEMA_VERSION = 2;
function save(){ store.set('gcv_cards', JSON.stringify(cards)); store.set('gcv_stats', JSON.stringify(stats)); schedulePush(); scheduleFbPush(); }
let _saveT=null;
function scheduleSave(){ clearTimeout(_saveT); _saveT=setTimeout(save,300); }

const Photos = {
  cache:new Map(), _db:null,
  async open(){
    if(this._db) return this._db;
    this._db = await new Promise((res,rej)=>{
      let rq; try{ rq=indexedDB.open('gcv_photos',1); }catch(e){ return rej(e); }
      rq.onupgradeneeded=e=>{ const db=e.target.result; if(!db.objectStoreNames.contains('photos')) db.createObjectStore('photos'); };
      rq.onsuccess=e=>res(e.target.result); rq.onerror=e=>rej(e.target.error);
    });
    return this._db;
  },
  read(id){ return this.cache.get(id); },
  async set(id,url){
    this.cache.set(id,url);
    try{ const db=await this.open(); return await new Promise(r=>{ const t=db.transaction('photos','readwrite'); t.objectStore('photos').put(url,id); t.oncomplete=()=>r(1); t.onerror=()=>r(0); }); }catch(e){ return 0; }
  },
  async get(id){
    if(this.cache.has(id)) return this.cache.get(id);
    try{ const db=await this.open(); return await new Promise(r=>{ const rq=db.transaction('photos','readonly').objectStore('photos').get(id); rq.onsuccess=()=>{ if(rq.result) this.cache.set(id,rq.result); r(rq.result||null); }; rq.onerror=()=>r(null); }); }catch(e){ return null; }
  },
  async del(id){
    this.cache.delete(id);
    try{ const db=await this.open(); return await new Promise(r=>{ const t=db.transaction('photos','readwrite'); t.objectStore('photos').delete(id); t.oncomplete=()=>r(1); t.onerror=()=>r(0); }); }catch(e){ return 0; }
  }
};
function migrateSchema(){
  let from=parseInt(store.get('gcv_schema')||'1',10)||1;
  if(from<2){ let n=0; for(const c of cards){ if(c.photo){ c.hasPhoto=true; Photos.set(c.id,c.photo); delete c.photo; n++; } } if(n) save(); from=2; }
  if(String(from)!==store.get('gcv_schema')) store.set('gcv_schema',String(SCHEMA_VERSION));
}
function compressImage(file, cb, max){
  const r=new FileReader();
  r.onload=e=>{ const img=new Image();
    img.onload=()=>{ const m=max||420, sc=Math.min(1,m/Math.max(img.width,img.height)), cv=document.createElement('canvas');
      cv.width=Math.round(img.width*sc); cv.height=Math.round(img.height*sc); cv.getContext('2d').drawImage(img,0,0,cv.width,cv.height);
      try{ cb(cv.toDataURL('image/jpeg',0.72)); }catch(err){ cb(null); } };
    img.onerror=()=>cb(null); img.src=e.target.result; };
  r.onerror=()=>cb(null); r.readAsDataURL(file);
}
const compressAsync=(file,max)=>new Promise(res=>compressImage(file,res,max));
/* Bild in Elemente mit data-photo="<id>" nachladen */
function hydratePhotos(root){
  (root||document).querySelectorAll('img[data-photo]').forEach(img=>{
    const id=img.dataset.photo; if(img.dataset.done) return; img.dataset.done='1';
    Photos.get(id).then(url=>{ if(url){ img.src=url; img.hidden=false; const ph=img.nextElementSibling; if(ph&&ph.classList.contains('ini')) ph.remove(); } });
  });
}
function refreshAll(){ renderCollection(); renderHome(); }

/* ============ Eigener Server (optional) ============ */
let serverUrl = store.get('gcv_server') || window.location.origin;
let serverOnline=false, _pushTimer=null;
function syncUid(){ return (currentUser && currentUser.uid) || 'guest'; }
function setSyncUI(){
  const dot=el('sync-dot'), st=el('sync-state'); if(!dot) return;
  dot.className='dot '+(serverOnline?'on':''); st.textContent=serverOnline?'verbunden':'offline';
}
async function serverPing(){
  try{ const r=await fetch(serverUrl.replace(/\/$/,'')+'/api/health',{cache:'no-store'}); serverOnline=r.ok; }catch(e){ serverOnline=false; }
  setSyncUI(); return serverOnline;
}
function saveServerUrl(){
  serverUrl=(el('server-url').value||'').trim()||'http://localhost:8787';
  store.set('gcv_server',serverUrl); toast('Server gespeichert'); serverPing();
}
function schedulePush(){ if(!serverOnline) return; clearTimeout(_pushTimer); _pushTimer=setTimeout(()=>pushToServer(false),900); }

