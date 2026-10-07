/* ============ Grading-ROI ============ */
const GRADE_PROFILE={ gem:{10:.35,9:.45,8:.15,7:.05}, nm:{10:.12,9:.40,8:.33,7:.15}, ex:{10:.02,9:.18,8:.40,7:.40}, pl:{10:0,9:.04,8:.20,7:.76} };
const GRADE_MULT={10:4.0,9:1.9,8:1.25,7:0.95};
const TIER_FEE={value:25,reg:40,express:80};
function computeROI(raw,cond,tier,ship){
  if(!(raw>0)) return null;
  const fee=TIER_FEE[tier]||TIER_FEE.reg, prof=GRADE_PROFILE[cond]||GRADE_PROFILE.nm;
  let expected=0; const rows=[10,9,8,7].map(g=>{ const p=prof[g]||0, gv=raw*GRADE_MULT[g]; expected+=p*gv; return {g,p,gv}; });
  const cost=raw+fee+(ship||0), net=expected-cost, pct=cost>0?net/cost*100:0;
  const verdict=net>raw*0.4?{t:'Lohnt sich klar',c:''}:net>0?{t:'Knapp positiv',c:''}:{t:'Lohnt sich nicht',c:'neg'};
  return {raw,fee,ship:ship||0,expected,cost,net,pct,rows,verdict};
}
function roiHTML(r, compact){
  if(!r) return '<p class="note" style="margin:0">Trag einen Marktwert ein, dann siehst du hier, ob sich PSA-Grading rechnet.</p>';
  return `<div class="roi"><span class="verdict ${r.verdict.c}">${r.verdict.t} · ROI ${r.pct>=0?'+':''}${r.pct.toFixed(0)} %</span>
    <div class="roi-k"><div><b>${eur(r.expected)}</b><span>Erwarteter Wert gegradet</span></div>
      <div><b class="${r.net>=0?'pos':'neg'}">${r.net>=0?'+':''}${eur(r.net)}</b><span>Erwarteter Gewinn</span></div></div>
    <span class="note">Kosten: Karte ${eur(r.raw)} + Grading ${eur(r.fee)} + Versand ${eur(r.ship)} = ${eur(r.cost)}</span>
    ${compact?'':`<div class="dist">${r.rows.map(x=>`<div><span>PSA ${x.g} <span class="muted">(${(x.p*100).toFixed(0)} %)</span></span><b style="color:var(--gold)">${eur(x.gv)}</b></div>`).join('')}</div>`}
    <span class="note">Schätzung mit vorsichtigen Faktoren – echte Preise gegradeter Karten prüfen.</span></div>`;
}
function calcROI(){
  const r=computeROI(parseEuro(el('r-raw').value),el('r-cond').value,el('r-tier').value,parseEuro(el('r-ship').value));
  if(!r){ toast('Bitte Roh-Marktwert eingeben'); return; }
  el('roi-out').innerHTML=roiHTML(r,false);
}

/* ============ KI-Scan (Claude, eigener API-Key) ============ */
const K_KEY='gcv_ai_key', K_MODEL='gcv_ai_model', DEF_MODEL='claude-sonnet-5-5';
const aiKey=()=>{ try{ return localStorage.getItem(K_KEY)||''; }catch(e){ return ''; } };
function renderMore(){
  el('ai-key').value=aiKey(); el('ai-model').value=store.get(K_MODEL)||DEF_MODEL;
  el('ai-key-state').textContent=aiKey()?'eingerichtet ✓':'noch kein Key';
  const lb=parseInt(store.get('gcv_last_backup')||'0',10);
  el('last-backup').textContent=lb?'zuletzt '+new Date(lb).toLocaleDateString('de-DE'):'noch keine';
  el('server-url').value=store.get('gcv_server')||''; renderFbUI(); setSyncUI(); renderProfile();
}
function aiSaveKey(){
  store.set(K_KEY,el('ai-key').value.trim()); store.set(K_MODEL,el('ai-model').value);
  el('ai-key-msg').textContent='Gespeichert.'; el('ai-key-msg').className='status';
  el('ai-key-state').textContent=aiKey()?'eingerichtet ✓':'noch kein Key'; renderHome();
}
async function aiTestKey(){
  aiSaveKey(); const m=el('ai-key-msg'); m.textContent='Teste Verbindung …';
  try{ await callClaude([{type:'text',text:'Antworte nur mit OK.'}],10); m.innerHTML='<span class="pos">Verbindung funktioniert.</span>'; }
  catch(e){ m.innerHTML='<span class="neg">'+esc(e.message)+'</span>'; }
}
async function callClaude(content,maxTokens){
  const key=aiKey(); if(!key) throw new Error('Kein API-Key hinterlegt. Trag ihn unter „Mehr“ → KI-Scan ein.');
  let r;
  const body=JSON.stringify({model:store.get(K_MODEL)||DEF_MODEL,max_tokens:maxTokens||1200,messages:[{role:'user',content}]});
  const hdr={'content-type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'};
  for(let t=0;t<2;t++){
    try{ r=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:hdr,body}); }
    catch(e){ throw new Error('Keine Verbindung zu Anthropic. Prüfe dein Internet.'); }
    if(r.status!==529&&r.status!==503&&r.status!==429) break;
    await new Promise(res=>setTimeout(res,1500));
  }
  const j=await r.json().catch(()=>({}));
  if(!r.ok){ const m=(j&&j.error&&j.error.message)||'';
    if(r.status===401) throw new Error('Der API-Key ist ungültig. Prüfe ihn unter „Mehr“ → KI-Scan.');
    if(/credit|balance/i.test(m)) throw new Error('Dein Anthropic-Guthaben ist aufgebraucht. Lade es in der Console auf.');
    if(r.status===404||/model/i.test(m)) throw new Error('Dieses Modell ist für deinen Key nicht verfügbar. Wähle unter „Mehr“ ein anderes.');
    if(r.status===429) throw new Error('Zu viele Anfragen. Warte kurz und versuch es erneut.');
    if(r.status>=500) throw new Error('Anthropic ist gerade überlastet. Versuch es gleich noch einmal.');
    throw new Error('Fehler bei der Erkennung: '+(m||r.status)); }
  return (j.content||[]).filter(b=>b.type==='text').map(b=>b.text).join('');
}
function parseJSON(t){
  try{ return JSON.parse(t); }catch(e){}
  const f=t.match(/```(?:json)?\s*([\s\S]*?)```/); if(f){ try{ return JSON.parse(f[1]); }catch(e){} }
  const a=t.indexOf('{'), b=t.lastIndexOf('}'); if(a>=0&&b>a){ try{ return JSON.parse(t.slice(a,b+1)); }catch(e){} }
  return null;
}
const PROMPT=`Du bist Experte für Sammelkarten (Pokémon, Magic: The Gathering, Yu-Gi-Oh!, One Piece, Disney Lorcana, Digimon, Dragon Ball Super, Flesh and Blood, Star Wars Unlimited, Sportkarten u. a.).
Das Foto zeigt vermutlich eine einzelne Sammelkarte. Identifiziere sie so genau wie möglich. Lies Kartennummer, Set-Symbol/Set-Code, Copyright-Jahr, Sprache, Edition-Stempel und Holo/Reverse-Holo-Effekt direkt vom Bild ab.
WICHTIG: "name_en" ist IMMER der offizielle englische Kartenname (auch bei deutschen oder japanischen Karten). "set_en" ist der offizielle englische Setname. "set_code" ist der aufgedruckte Set-Code (z. B. "SV3", "MH3", "LOB-DE"), sonst null. "number" exakt wie aufgedruckt (z. B. "4/102", "125/197", "LOB-DE001", "123").
"card_kind" ist eine dieser Kategorien: Pokémon | Trainer | Energie | Monster | Zauber | Falle | Extra Deck | Kreatur | Spontanzauber / Hexerei | Artefakt / Verzauberung | Planeswalker | Land | Leader / Charakter | Karte.
Schätze den Zustand aus dem Sichtbaren (Gem Mint, Mint, Near Mint, Excellent, Good, Light Played, Played, Poor) und als Rückfall einen realistischen Marktpreis in EUR (Near Mint, europäischer Markt). Wenn du nicht seriös schätzen kannst, setze die Preisfelder auf null.
Antworte NUR mit einem JSON-Objekt, Texte auf Deutsch:
{"identified": true, "game": "Pokémon | Magic: The Gathering | Yu-Gi-Oh! | One Piece | Lorcana | Digimon | ...", "name": "Name wie auf der Karte", "name_en": "englischer Name", "set": "Setname wie auf der Karte bzw. deutsch", "set_en": "englischer Setname", "set_code": null, "number": "4/102", "rarity": "...", "year": "...", "language": "...", "variant": "z. B. 1st Edition Holo / Reverse Holo / Foil / null", "is_foil": false, "card_kind": "Pokémon", "condition_estimate": "Near Mint", "condition_notes": "ein kurzer Satz", "price_eur_low": 10, "price_eur_high": 15, "confidence": 0.9, "alternatives": [{"name": "...", "set": "...", "number": "..."}], "notes": "ein bis zwei Sätze: woran man die Variante erkennt oder was den Wert beeinflusst"}
Ist keine Sammelkarte erkennbar: {"identified": false, "notes": "kurzer Grund und Tipp für ein besseres Foto"}.
"alternatives" nur füllen, wenn du unsicher bist, sonst [].`;

