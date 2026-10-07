/* ============ Live-Preise (Cardmarket, ohne Key) ============ */
const getJSON=async u=>{ const r=await fetch(u,{headers:{Accept:'application/json'},cache:'no-store'}); if(!r.ok) throw new Error(r.status); return r.json(); };
const num=s=>{ const m=String(s??'').match(/(\d+)/); return m?parseInt(m[1],10):null; };
const total=s=>{ const m=String(s??'').match(/\/\s*(\d+)/); return m?parseInt(m[1],10):null; };
function pkmnMatch(f, holo){
  const cm=f.pricing&&f.pricing.cardmarket, s=f.set||{};
  const m={label:s.name||'', number:f.localId+'/'+((s.cardCount&&s.cardCount.official)||'?'), img:f.image?f.image+'/low.webp':'', source:'Cardmarket via TCGdex', url:null, prices:null,
    rarity:f.rarity||'', kind:f.category||'', name:f.name||''};
  if(cm){ const pick=k=>(holo&&cm[k+'-holo']!=null)?cm[k+'-holo']:cm[k]; const main=pick('trend')??pick('avg')??pick('avg30');
    if(main!=null){ m.prices={main,trend:pick('trend'),avg30:pick('avg30'),low:pick('low')}; m.updated=cm.updated; m.variantNote=(holo&&cm['trend-holo']!=null)?'Holo/Reverse-Preis':''; } }
  return m;
}
async function pricePokemon(c){
  const useEn=!!c.name_en, lang=useEn?'en':'de', name=c.name_en||c.name, n=num(c.number), t=total(c.number);
  const base='https://api.tcgdex.net/v2/'+lang+'/cards';
  let list=await getJSON(base+'?name='+encodeURIComponent('eq:'+name)).catch(()=>[]);
  if(!Array.isArray(list)||!list.length) list=await getJSON(base+'?name='+encodeURIComponent(name)).catch(()=>[]);
  if(!Array.isArray(list)) return null;
  const cands=list.filter(x=>n==null||num(x.localId)===n).slice(0,12); if(!cands.length) return null;
  const full=(await Promise.all(cands.map(x=>getJSON(base+'/'+encodeURIComponent(x.id)).catch(()=>null)))).filter(Boolean);
  const want=useEn?(c.set_en||c.set):(c.set||c.set_en);
  const score=f=>sim(f.set&&f.set.name,want)*3+(t&&f.set&&f.set.cardCount&&f.set.cardCount.official===t?2:0)
    +(c.set_code&&f.set&&norm(f.set.id).replace(/ /g,'')===norm(c.set_code).replace(/ /g,'')?2:0)+(f.pricing&&f.pricing.cardmarket?.5:0);
  full.sort((a,b)=>score(b)-score(a));
  const holo=!!c.is_foil||/holo|reverse/i.test(c.variant||'');
  return full.map(f=>Object.assign(pkmnMatch(f,holo),{score:score(f)}));
}
function mtgMatch(x, foilWanted){
  const p=x.prices||{}, foil=foilWanted&&p.eur_foil, v=parseFloat(foil?p.eur_foil:(p.eur??p.eur_foil));
  const img=(x.image_uris&&x.image_uris.small)||(x.card_faces&&x.card_faces[0]&&x.card_faces[0].image_uris&&x.card_faces[0].image_uris.small)||'';
  return {label:x.set_name, number:x.collector_number, img, prices:isFinite(v)?{main:v}:null, variantNote:foil?'Foil-Preis':'', source:'Cardmarket via Scryfall',
    url:(x.purchase_uris&&x.purchase_uris.cardmarket)||null, rarity:x.rarity||'', name:x.name, kind:x.type_line||''};
}
async function priceMagic(c){
  const name=c.name_en||c.name, cn=String(c.number||'').split('/')[0].replace(/^0+(?=\d)/,'').trim();
  let q='!"'+name+'"'; if(c.set_code) q+=' set:'+String(c.set_code).toLowerCase();
  let res=await getJSON('https://api.scryfall.com/cards/search?unique=prints&q='+encodeURIComponent(q)).catch(()=>null);
  if(!res||!res.data||!res.data.length) res=await getJSON('https://api.scryfall.com/cards/search?unique=prints&q='+encodeURIComponent('!"'+name+'"')).catch(()=>null);
  if(!res||!res.data||!res.data.length) return null;
  const score=x=>sim(x.set_name,c.set_en||c.set)*3+(cn&&x.collector_number===cn?2:0)+((x.prices&&(x.prices.eur||x.prices.eur_foil))?.5:0);
  return res.data.slice().sort((a,b)=>score(b)-score(a)).slice(0,8).map(x=>Object.assign(mtgMatch(x,!!c.is_foil),{score:score(x)}));
}
function ygoMatch(card, code){
  const v=parseFloat(card.card_prices&&card.card_prices[0]&&card.card_prices[0].cardmarket_price);
  const strip=s=>String(s||'').toUpperCase().replace(/-(EN|DE|FR|IT|ES|PT|SP)/,'-');
  const set=(card.card_sets||[]).find(s=>code&&strip(s.set_code)===strip(code))||(card.card_sets||[])[0];
  return {label:set?set.set_name:'', number:set?set.set_code:'', img:(card.card_images&&card.card_images[0]&&card.card_images[0].image_url_small)||'',
    score:(code&&set&&strip(set.set_code)===strip(code))?3:1, prices:isFinite(v)&&v>0?{main:v}:null, variantNote:'Cardmarket-Preis der Karte',
    source:'Cardmarket via YGOPRODeck', url:null, rarity:set?set.set_rarity:'', name:card.name, kind:card.type||''};
}
async function priceYugioh(c){
  const tries=[]; if(c.name_en) tries.push('name='+encodeURIComponent(c.name_en));
  tries.push('name='+encodeURIComponent(c.name),'language=de&name='+encodeURIComponent(c.name),'fname='+encodeURIComponent(c.name_en||c.name));
  for(const q of tries){ const r=await getJSON('https://db.ygoprodeck.com/api/v7/cardinfo.php?'+q).catch(()=>null);
    if(r&&r.data&&r.data.length) return [ygoMatch(r.data[0],String(c.set_code||c.number||'').toUpperCase())]; }
  return null;
}
async function livePrices(c){
  const g=gameCode(c.game);
  try{ if(g==='pkmn') return await pricePokemon(c); if(g==='mtg') return await priceMagic(c); if(g==='ygo') return await priceYugioh(c); }catch(e){}
  return null;
}
/* Nur eindeutige Treffer für gespeicherte Karten übernehmen */
async function bestLiveMatch(card){
  const ms=await livePrices({game:card.game,name:card.name,name_en:card.name_en,set:card.set,set_en:card.set_en,set_code:card.set_code,number:card.num,variant:card.variant,is_foil:card.is_foil});
  const priced=(ms||[]).filter(x=>x.prices&&x.prices.main!=null);
  return priced.length===1?priced[0]:priced.find(x=>sim(x.label,card.set)>=.6||sim(x.label,card.set_en)>=.6||(card.game==='ygo'&&x.score>=3))||null;
}
const CM={pkmn:'Pokemon',mtg:'Magic',ygo:'YuGiOh'}, CM_OTHER=[['one piece','OnePiece'],['lorcana','Lorcana'],['digimon','Digimon'],['dragon ball','DragonBallSuper'],['flesh','FleshAndBlood'],['star wars','StarWarsUnlimited']];
function marketLink(c){
  const g=CM[gameCode(c.game)]||(CM_OTHER.find(([k])=>norm(c.game).includes(k))||[])[1];
  return g?'https://www.cardmarket.com/de/'+g+'/Products/Search?searchString='+encodeURIComponent(c.name_en||c.name)
          :'https://www.ebay.de/sch/i.html?_nkw='+encodeURIComponent([c.name,c.set,c.number].filter(Boolean).join(' '));
}

