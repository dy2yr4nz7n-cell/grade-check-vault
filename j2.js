/* ============ Firebase (optional) ============
   Einrichtung: console.firebase.google.com → Projekt → Authentication (E-Mail/Passwort) + Firestore.
   Firestore-Regeln: match /vaults/{uid} { allow read, write: if request.auth != null && request.auth.uid == uid; }
   Dann die Web-App-Konfiguration hier eintragen. Der apiKey ist öffentlich, die Sicherheit kommt aus den Regeln. */
const FIREBASE_CONFIG = {
  // apiKey: "…", authDomain: "DEIN-PROJEKT.firebaseapp.com", projectId: "DEIN-PROJEKT",
  // storageBucket: "DEIN-PROJEKT.appspot.com", messagingSenderId: "…", appId: "…"
};
const FB_VER='10.12.2';
let _fb=null, fbUser=null;
function fbConfigured(){ return !!(FIREBASE_CONFIG && FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.projectId); }
async function ensureFirebase(){
  if(_fb) return _fb; if(!fbConfigured()) return null;
  const base='https://www.gstatic.com/firebasejs/'+FB_VER+'/';
  const [appM,fsM,authM]=await Promise.all([import(base+'firebase-app.js'),import(base+'firebase-firestore.js'),import(base+'firebase-auth.js')]);
  const app=appM.initializeApp(FIREBASE_CONFIG), db=fsM.getFirestore(app), auth=authM.getAuth(app);
  _fb={app,db,auth,doc:fsM.doc,setDoc:fsM.setDoc,getDoc:fsM.getDoc,signIn:authM.signInWithEmailAndPassword,register:authM.createUserWithEmailAndPassword,signOut:authM.signOut};
  authM.onAuthStateChanged(auth,u=>{
    fbUser=u?{uid:u.uid,email:u.email||''}:null;
    if(u){ currentUser={uid:'fb_'+u.uid,name:(u.displayName||(u.email||'').split('@')[0]||'Nutzer'),email:u.email||'',provider:'firebase',avatar:u.photoURL||''}; store.set('gcv_user',JSON.stringify(currentUser)); }
    else if(currentUser && currentUser.provider==='firebase'){ currentUser=null; store.set('gcv_user',JSON.stringify(null)); }
    renderProfile(); renderAuth(); renderFbUI();
  });
  return _fb;
}
let _fbPushT=null;
function scheduleFbPush(){ if(!fbConfigured()||!fbUser) return; clearTimeout(_fbPushT); _fbPushT=setTimeout(()=>fbPush(false),1200); }
async function fbInitialSync(mode){
  const fb=await ensureFirebase(); if(!fb||!fbUser) return;
  try{ const snap=await fb.getDoc(fb.doc(fb.db,'vaults',fbUser.uid));
    const hasCloud=snap.exists()&&Array.isArray(snap.data().cards)&&snap.data().cards.length;
    if(mode==='reg'||!hasCloud) await fbPush(false); else fbPull(); }catch(e){}
}
function renderFbUI(){
  const dot=el('fb-dot'), st=el('fb-state'); if(!dot) return;
  if(!fbConfigured()){ dot.className='dot'; st.textContent='nicht eingerichtet'; el('fb-auth').style.display='none'; el('fb-signed').style.display='none'; return; }
  const on=!!fbUser; dot.className='dot '+(on?'on':''); st.textContent=on?'verbunden':'bereit';
  el('fb-auth').style.display=on?'none':'flex'; el('fb-signed').style.display=on?'flex':'none';
  if(on) el('fb-who').textContent=fbUser.email||fbUser.uid;
}
function fbErrMsg(e){ const c=(e&&e.code)||'';
  if(c.includes('email-already-in-use')) return 'E-Mail bereits registriert – bitte anmelden.';
  if(c.includes('invalid-credential')||c.includes('wrong-password')||c.includes('user-not-found')) return 'E-Mail oder Passwort falsch.';
  if(c.includes('weak-password')) return 'Passwort zu schwach (min. 6 Zeichen).';
  if(c.includes('network')) return 'Keine Netzverbindung.';
  return (e&&e.message)||'Unbekannter Fehler.'; }
function fbFail(m){ const e=el('fb-err'); e.textContent=m; e.style.display='block'; }
async function fbAuth(mode){
  if(!fbConfigured()){ toast('Firebase ist noch nicht eingerichtet'); return; }
  const email=(el('fb-email').value||'').trim().toLowerCase(), pass=el('fb-pass').value||'';
  el('fb-err').style.display='none';
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fbFail('Bitte eine gültige E-Mail eingeben.');
  if(pass.length<6) return fbFail('Passwort muss mindestens 6 Zeichen haben.');
  try{ const fb=await ensureFirebase(); if(!fb) return;
    if(mode==='reg') await fb.register(fb.auth,email,pass); else await fb.signIn(fb.auth,email,pass);
    el('fb-pass').value=''; toast(mode==='reg'?'Firebase-Konto erstellt':'Firebase: angemeldet'); fbInitialSync(mode);
  }catch(e){ fbFail(fbErrMsg(e)); }
}
async function fbLogout(){ try{ const fb=await ensureFirebase(); if(fb) await fb.signOut(fb.auth); }catch(e){} toast('Firebase: abgemeldet'); }
async function fbPush(manual){
  const fb=await ensureFirebase(); if(!fb||!fbUser){ if(manual) toast('Erst bei Firebase anmelden'); return; }
  try{ await fb.setDoc(fb.doc(fb.db,'vaults',fbUser.uid),{cards,stats,updated:Date.now(),count:cards.length}); if(manual) toast('In Cloud gesichert ✓'); markBackup(); }
  catch(e){ if(manual) toast('Cloud-Upload fehlgeschlagen'); }
}
function applyLoaded(list, st){
  cards=Array.isArray(list)?list:[];
  cards.forEach(c=>{ if(c.photo){ c.hasPhoto=true; Photos.set(c.id,c.photo); delete c.photo; } });
  if(st) stats=st;
  store.set('gcv_cards',JSON.stringify(cards)); store.set('gcv_stats',JSON.stringify(stats)); refreshAll();
}
async function fbPull(){
  const fb=await ensureFirebase(); if(!fb||!fbUser){ toast('Erst bei Firebase anmelden'); return; }
  try{ const snap=await fb.getDoc(fb.doc(fb.db,'vaults',fbUser.uid));
    if(!snap.exists()){ toast('Keine Cloud-Daten für dieses Konto'); return; }
    const d=snap.data(), n=Array.isArray(d.cards)?d.cards.length:0;
    if(await confirmDialog('Cloud-Daten laden? '+n+' Karten ersetzen die aktuelle Sammlung.','Laden')){ applyLoaded(d.cards,d.stats); toast('Aus Cloud geladen ✓'); }
  }catch(e){ toast('Cloud-Download fehlgeschlagen'); }
}

