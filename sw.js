const C='gcv-v2',F=['./','index.html','manifest.webmanifest','icon.svg','s1.css','s2.css','s3.css','app1.css','app1.js','app2.js','j1.js','j2.js','j3.js','j4.js','j5.js','j6.js','j7.js','j8.js','j9.js','j10.js','j11.js','j12.js'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(F)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==location.origin)return;
if(u.pathname.endsWith('/api/health'))return;
e.respondWith(fetch(e.request).then(r=>{const c=r.clone();caches.open(C).then(x=>x.put(e.request,c));return r}).catch(()=>caches.match(e.request)))});
