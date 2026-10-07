/* ============================================================
   Grade-Check Vault – lokaler, kostenloser Server
   ------------------------------------------------------------
   Speichert deine Sammlung lokal in einer Datei (vault-data.json)
   UND hält API-Keys sicher serverseitig (Key-Tresor + Proxy).
   KEINE externen Pakete nötig – nur Node.js (Version 18+ wegen fetch).

   STARTEN:
     1) Node.js 18+ installieren (PC: nodejs.org · Android: Termux → "pkg install nodejs")
     2) Diese Datei in einen Ordner legen
     3) Keys als Umgebungsvariablen setzen (Beispiel, ein Eintrag PRO Dienst):
            PC (PowerShell):  $env:POKEMON_KEY="dein_key"; node server.js
            PC (Bash):        POKEMON_KEY="dein_key" node server.js
            Termux:           export POKEMON_KEY="dein_key" ; node server.js
        -> Keys stehen NIE im Code und NIE im Browser-HTML.
     4) In der App unter „Lokaler Server-Sync\" die Adresse eintragen:
            http://localhost:8787      (gleiches Gerät)
        oder http://DEINE-IP:8787      (anderes Gerät im selben WLAN)

   API-PROXY (Key bleibt serverseitig):
            GET http://localhost:8787/api/proxy/<dienst>/<pfad>?<query>
        z.B. /api/proxy/pokemon/cards?q=name:"Glurak"
             /api/proxy/ygo/cardinfo.php?fname=Dark%20Magician

   ADMIN-Übersicht (alle Nutzer):
            GET http://localhost:8787/api/admin/overview
            Header: x-admin-code: <dein ADMIN_CODE>
============================================================ */

const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT       = process.env.PORT || 8787;
const ADMIN_CODE = process.env.ADMIN_CODE || '';   // Pflicht für Admin-Funktionen: ADMIN_CODE=dein-code node server.js
const DB_FILE    = path.join(__dirname, 'vault-data.json');

/* ============================================================
   KEY-TRESOR + DIENST-WHITELIST
   Ein Eintrag pro Dienst. Key kommt aus process.env[<env>].
   Neuen Dienst ergänzen = eine Zeile: base + env-Name + auth().
   Der Proxy kann NUR diese base-URLs erreichen (kein offenes Relay).
============================================================ */
const SERVICES = {
  pokemon: {
    base: 'https://api.pokemontcg.io/v2/',
    env:  'POKEMON_KEY',
    auth: (headers, target, key) => { if (key) headers['X-Api-Key'] = key; }
  },
  ygo: {
    base: 'https://db.ygoprodeck.com/api/v7/',
    env:  null,                       // dieser Dienst braucht keinen Key
    auth: () => {}
  },
  tcgdex: {
    base: 'https://api.tcgdex.net/v2/',
    env:  null,                       // Pokémon-Namen/Bilder (DE), kein Key
    auth: () => {}
  }
  // Weiteren Dienst hinzufügen, z.B. mit Key in der Query:
  // markt: {
  //   base: 'https://api.beispielmarkt.com/',
  //   env:  'MARKT_KEY',
  //   auth: (headers, target, key) => { if (key) target.searchParams.set('apikey', key); }
  // }
};
function serviceKey(svc){ return svc.env ? (process.env[svc.env] || '') : ''; }

// ---- einfache Datei-Datenbank ----
function readDB(){
  try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
  catch (e){ return { users: {} }; }
}
function writeDB(db){
  try { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); return true; }
  catch (e){ console.error('Schreibfehler:', e.message); return false; }
}

// ---- Hilfen ----
function cors(res){
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-code');
}
function json(res, code, obj){
  cors(res);
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}
function readBody(req){
  return new Promise((resolve) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 12e6) req.destroy(); }); // ~12 MB Limit
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch (e){ resolve(null); } });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const parts = url.pathname.split('/').filter(Boolean); // z.B. ['api','data','guest']

  if (req.method === 'OPTIONS'){ cors(res); res.writeHead(204); return res.end(); }

  // GET /api/health
  if (req.method === 'GET' && url.pathname === '/api/health'){
    const keys = {};
    Object.entries(SERVICES).forEach(([n, s]) => { keys[n] = s.env ? !!process.env[s.env] : 'kein Key nötig'; });
    return json(res, 200, { ok: true, app: 'grade-check-vault', time: Date.now(), keys });
  }

  // GET /api/proxy/:service/<pfad>   -> Upstream-Aufruf mit serverseitigem Key
  if (req.method === 'GET' && parts[0] === 'api' && parts[1] === 'proxy' && parts[2]){
    if (typeof fetch === 'undefined') return json(res, 500, { error: 'Node 18+ benötigt (globales fetch fehlt)' });
    const svc = SERVICES[parts[2]];
    if (!svc) return json(res, 404, { error: 'Unbekannter Dienst: ' + parts[2] });

    const rest = parts.slice(3);
    if (rest.some(s => s === '..' || s.includes('\\'))) return json(res, 400, { error: 'Ungültiger Pfad' });

    let target;
    try { target = new URL(rest.map(encodeURIComponent).join('/') + url.search, svc.base); }
    catch (e){ return json(res, 400, { error: 'Ungültige Ziel-URL' }); }
    // Sicherheit: Ziel muss exakt im Dienst-Host bleiben (kein SSRF/Relay)
    if (target.origin !== new URL(svc.base).origin) return json(res, 400, { error: 'Ziel außerhalb des Dienstes' });

    const headers = { 'Accept': 'application/json' };
    svc.auth(headers, target, serviceKey(svc));

    try {
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 9000);
      const up = await fetch(target, { headers, signal: ctrl.signal });
      clearTimeout(to);
      const text = await up.text();
      cors(res);
      res.writeHead(up.status, { 'Content-Type': up.headers.get('content-type') || 'application/json' });
      return res.end(text);
    } catch (e){
      return json(res, 502, { error: 'Upstream-Fehler', detail: String((e && e.message) || e) });
    }
  }

  // GET /api/data/:user
  if (req.method === 'GET' && parts[0] === 'api' && parts[1] === 'data' && parts[2]){
    const db = readDB();
    const u  = db.users[decodeURIComponent(parts[2])] || { cards: [], stats: null };
    return json(res, 200, u);
  }

  // PUT /api/data/:user   body { cards, stats }
  if (req.method === 'PUT' && parts[0] === 'api' && parts[1] === 'data' && parts[2]){
    const body = await readBody(req);
    if (!body || !Array.isArray(body.cards)) return json(res, 400, { error: 'cards[] erwartet' });
    const db = readDB();
    db.users[decodeURIComponent(parts[2])] = {
      cards: body.cards,
      stats: body.stats || null,
      updated: Date.now()
    };
    writeDB(db);
    return json(res, 200, { ok: true, count: body.cards.length });
  }

  // GET /api/admin/overview   header x-admin-code
  if (req.method === 'GET' && url.pathname === '/api/admin/overview'){
    if (!ADMIN_CODE) return json(res, 403, { error: 'Admin deaktiviert: ADMIN_CODE nicht gesetzt' });
    if ((req.headers['x-admin-code'] || '') !== ADMIN_CODE) return json(res, 403, { error: 'Falscher Admin-Code' });
    const db = readDB();
    const overview = Object.keys(db.users).map(uid => ({
      user: uid,
      cards: (db.users[uid].cards || []).length,
      value: (db.users[uid].cards || []).reduce((s, c) => s + (Number(c.value) || 0), 0),
      updated: db.users[uid].updated || null
    }));
    return json(res, 200, { users: overview, total: overview.length });
  }

  json(res, 404, { error: 'not found' });
});

server.listen(PORT, () => {
  console.log('╔═══════════════════════════════════════════════╗');
  console.log('║   Grade-Check Vault – lokaler Server läuft     ║');
  console.log('╚═══════════════════════════════════════════════╝');
  console.log('  Adresse  : http://localhost:' + PORT);
  console.log('  Daten    : ' + DB_FILE);
  console.log('  Proxy    : http://localhost:' + PORT + '/api/proxy/<dienst>/<pfad>');
  Object.entries(SERVICES).forEach(([n, s]) => {
    if (s.env) console.log('     · ' + n + ': Key ' + (process.env[s.env] ? 'geladen ✓' : 'FEHLT  (Umgebungsvariable ' + s.env + ' setzen)'));
    else       console.log('     · ' + n + ': kein Key nötig');
  });
  console.log('  Admin    : http://localhost:' + PORT + '/api/admin/overview  (Header x-admin-code: ' + ADMIN_CODE + ')');
  console.log('  Beenden  : Strg + C');
});
