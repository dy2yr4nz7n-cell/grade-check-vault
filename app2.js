async function downloadServer(){
  try{
    const r=await fetch('server.js'); if(!r.ok) throw 0;
    const url=URL.createObjectURL(await r.blob());
    const a=document.createElement('a'); a.href=url; a.download='server.js'; document.body.append(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),2000); toast('server.js heruntergeladen');
  }catch(e){ toast('Download fehlgeschlagen'); }
}
