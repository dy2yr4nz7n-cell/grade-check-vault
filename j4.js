/* ============ Konto ============ */
const GOOGLE_CLIENT_ID=''; // Google-OAuth-Client-ID (Webanwendung) eintragen, damit „Mit Google anmelden“ erscheint
let currentUser=load('gcv_user',null);
async function sha256(str){
  try{ const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(str)); return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join(''); }
  catch(e){ let h=0; for(let i=0;i<str.length;i++){ h=(Math.imul(h,31)+str.charCodeAt(i))>>>0; } return 'x'+h.toString(16); }
}
function openAuth(){ renderAuth(); el('auth-modal').classList.add('show'); }
function closeAuth(){ el('auth-modal').classList.remove('show'); }
function authMode(m){
  el('tab-login').classList.toggle('on',m==='login'); el('tab-reg').classList.toggle('on',m==='reg');
  el('auth-name-wrap').style.display=m==='reg'?'block':'none';
  const sub=el('auth-submit'); sub.textContent=m==='reg'?'Konto erstellen':'Anmelden'; sub.dataset.mode=m; el('auth-err').style.display='none';
}
function renderAuth(){
  if(currentUser){ el('auth-logged-in').style.display='flex'; el('auth-logged-out').style.display='none';
    el('auth-who').textContent=currentUser.provider==='guest'?'Gast':(currentUser.name+(currentUser.email?(' · '+currentUser.email):'')); }
  else { el('auth-logged-in').style.display='none'; el('auth-logged-out').style.display='block'; authMode('login'); }
  const hasServer=!!window.__appServer, hasGoogle=!!GOOGLE_CLIENT_ID;
  el('rbtn').style.display=hasServer?'':'none'; el('gbtn').style.display=hasGoogle?'':'none';
  el('auth-divider').style.display=(hasServer||hasGoogle)?'':'none';
}
async function emailAuth(){
  const mode=el('auth-submit').dataset.mode||'login', email=(el('auth-email').value||'').trim().toLowerCase(), pass=el('auth-pass').value||'';
  const err=el('auth-err'), fail=m=>{ err.textContent=m; err.style.display='block'; };
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail('Bitte eine gültige E-Mail eingeben.');
  if(pass.length<6) return fail('Passwort muss mindestens 6 Zeichen haben.');
  const accounts=load('gcv_accounts',{}), hash=await sha256(email+'::'+pass);
  if(mode==='reg'){
    if(accounts[email]) return fail('Konto existiert bereits – bitte anmelden.');
    const name=(el('auth-name').value||'').trim()||email.split('@')[0];
    accounts[email]={hash,name}; store.set('gcv_accounts',JSON.stringify(accounts));
    setUser({uid:'em_'+email,name,email,provider:'email',avatar:''});
  } else {
    const acc=accounts[email];
    if(!acc) return fail('Kein Konto mit dieser E-Mail. Bitte zuerst registrieren.');
    if(acc.hash!==hash) return fail('Falsches Passwort.');
    setUser({uid:'em_'+email,name:acc.name,email,provider:'email',avatar:''});
  }
}
function continueGuest(){ setUser({uid:'guest',name:'Gast',email:'',provider:'guest',avatar:''}); }
function setUser(u){ currentUser=u; store.set('gcv_user',JSON.stringify(u)); renderProfile(); renderAuth(); closeAuth(); toast(u.provider==='guest'?'Als Gast aktiv':('Angemeldet als '+u.name)); }
function logout(){
  const wasReplit=currentUser&&currentUser.provider==='replit', wasFb=currentUser&&currentUser.provider==='firebase';
  currentUser=null; store.set('gcv_user',JSON.stringify(null)); renderProfile(); renderAuth(); toast('Abgemeldet');
  if(wasFb) fbLogout(); if(wasReplit) window.location.href='/api/logout';
}
function replitSignIn(){ window.location.href='/api/login?returnTo=/'; }
async function checkReplitSession(){
  try{ const r=await fetch('/api/auth/user',{credentials:'include',cache:'no-store'}); if(!r.ok) return;
    const d=await r.json(); window.__appServer=true;
    if(d&&d.user&&d.user.id){ const u=d.user, ex=currentUser; if(ex&&ex.provider==='replit'&&ex.uid===u.id) return;
      currentUser={uid:u.id,name:u.name||'Nutzer',email:u.email||'',provider:'replit',avatar:u.avatarUrl||''}; store.set('gcv_user',JSON.stringify(currentUser));
      renderProfile(); renderAuth(); if(!ex||ex.provider!=='replit') toast('Angemeldet als '+currentUser.name); }
  }catch(e){}
}
function renderProfile(){
  const av=el('profile-av'), nm=el('profile-name'), st=el('acc-state');
  if(currentUser&&currentUser.provider!=='guest'){
    nm.textContent=currentUser.name; st.textContent=currentUser.email||currentUser.name;
    if(currentUser.avatar && /^https:\/\//.test(currentUser.avatar)){ av.innerHTML=''; const i=new Image(); i.alt=''; i.src=currentUser.avatar; av.append(i); }
    else av.textContent=(currentUser.name[0]||'?').toUpperCase();
  } else if(currentUser){ nm.textContent='Gast'; av.textContent='G'; st.textContent='Gast'; }
  else { nm.textContent='Anmelden'; av.textContent='?'; st.textContent='nicht angemeldet'; }
}
let gsiLoaded=false;
async function googleSignIn(){
  if(!GOOGLE_CLIENT_ID) return;
  try{ if(!gsiLoaded){ await new Promise((res,rej)=>{ const s=document.createElement('script'); s.src='https://accounts.google.com/gsi/client'; s.onload=res; s.onerror=rej; document.head.appendChild(s); }); gsiLoaded=true; }
    google.accounts.id.initialize({client_id:GOOGLE_CLIENT_ID,callback:onGoogleCredential}); google.accounts.id.prompt();
  }catch(e){ toast('Google-Anmeldung nicht verfügbar (offline?)'); }
}
function onGoogleCredential(resp){
  try{ const b=resp.credential.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'); const p=JSON.parse(decodeURIComponent(escape(atob(b))));
    setUser({uid:'g_'+(p.sub||p.email),name:p.name||p.email,email:p.email||'',provider:'google',avatar:p.picture||''}); }
  catch(e){ toast('Google-Anmeldung fehlgeschlagen'); }
}

