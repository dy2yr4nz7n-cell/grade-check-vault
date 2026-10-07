/* ============ Verschlüsselung für den Server (AES-256-GCM) ============ */
const ENC_KEY_STORE='gcv_vault_key'; let _vaultCryptoKey=null;
function b64ToBytes(b64){ return Uint8Array.from(atob(b64),c=>c.charCodeAt(0)); }
function bytesToB64(buf){ const b=new Uint8Array(buf); let s=''; for(let i=0;i<b.length;i+=0x8000){ s+=String.fromCharCode.apply(null,b.subarray(i,i+0x8000)); } return btoa(s); }
async function getVaultKey(){
  if(_vaultCryptoKey) return _vaultCryptoKey;
  const stored=store.get(ENC_KEY_STORE);
  if(stored){ try{ _vaultCryptoKey=await crypto.subtle.importKey('raw',b64ToBytes(stored),'AES-GCM',true,['encrypt','decrypt']); return _vaultCryptoKey; }catch(e){} }
  const key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},true,['encrypt','decrypt']);
  store.set(ENC_KEY_STORE,bytesToB64(await crypto.subtle.exportKey('raw',key))); _vaultCryptoKey=key; return key;
}
async function encryptVault(payload){ const key=await getVaultKey(), iv=crypto.getRandomValues(new Uint8Array(12));
  const ct=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(JSON.stringify(payload))); return bytesToB64(iv)+':'+bytesToB64(ct); }
async function decryptVault(str){ const [a,b]=str.split(':'); if(!a||!b) throw new Error('Ungültiges Format');
  const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:b64ToBytes(a)},await getVaultKey(),b64ToBytes(b)); return JSON.parse(new TextDecoder().decode(plain)); }
function exportVaultKey(){
  const k=store.get(ENC_KEY_STORE); if(!k){ toast('Noch kein Schlüssel erzeugt – erst einmal hochladen'); return; }
  const a=document.createElement('a'); a.href='data:text/plain;charset=utf-8,'+encodeURIComponent('GCV-KEY:'+k); a.download='vault-key.txt'; document.body.append(a); a.click(); a.remove();
  toast('Schlüssel-Datei gespeichert – sicher aufbewahren!');
}
async function importVaultKey(){
  const raw=(prompt('Vault-Schlüssel einfügen (Inhalt der vault-key.txt):')||'').trim();
  const key=raw.startsWith('GCV-KEY:')?raw.slice(8):raw; if(key.length<40){ if(raw) toast('Ungültiger Schlüssel'); return; }
  try{ _vaultCryptoKey=await crypto.subtle.importKey('raw',b64ToBytes(key),'AES-GCM',true,['encrypt','decrypt']); store.set(ENC_KEY_STORE,key); toast('Schlüssel importiert – jetzt „Laden“ tippen'); }
  catch(e){ toast('Schlüssel-Import fehlgeschlagen'); }
}
async function pushToServer(manual){
  if(!await serverPing()){ if(manual) toast('Kein Server erreichbar'); return; }
  try{ const u=syncUid(); const body=u==='guest'?JSON.stringify({cards,stats}):JSON.stringify({encrypted:true,vault:await encryptVault({cards,stats}),count:cards.length});
    const r=await fetch(serverUrl.replace(/\/$/,'')+'/api/data/'+encodeURIComponent(u),{method:'PUT',headers:{'Content-Type':'application/json'},body});
    if(!r.ok) throw 0; if(manual) toast('Auf Server gesichert 🔒'); markBackup();
  }catch(e){ if(manual) toast('Upload fehlgeschlagen'); }
}
async function pullFromServer(){
  if(!await serverPing()){ toast('Kein Server erreichbar'); return; }
  try{ const r=await fetch(serverUrl.replace(/\/$/,'')+'/api/data/'+encodeURIComponent(syncUid()),{cache:'no-store'}); if(!r.ok) throw 0;
    const d=await r.json(); let p;
    if(d&&d.encrypted===true&&d.vault){ try{ p=await decryptVault(d.vault); }catch(e){ toast('Entschlüsselung fehlgeschlagen – falscher Schlüssel?'); return; } }
    else if(d&&Array.isArray(d.cards)) p=d; else { toast('Keine Server-Daten für dieses Konto'); return; }
    const n=Array.isArray(p.cards)?p.cards.length:0;
    if(await confirmDialog('Server-Daten laden? '+n+' Karten ersetzen die aktuelle Sammlung.','Laden')){ applyLoaded(p.cards,p.stats); toast('Vom Server geladen ✓'); }
  }catch(e){ toast('Download fehlgeschlagen'); }
}

