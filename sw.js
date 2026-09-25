const CACHE='143-public-v3';
const STATIC=['./','./index.html','./login.html','./download.html','./features.html','./privacy.html','./help.html','./assets/styles.css','./assets/app.js','./assets/qrcode.bundle.js','./assets/logo.png','./assets/icon-192.png','./assets/icon-512.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(STATIC)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.hostname.includes('143-backend-staging')||url.pathname.endsWith('.apk'))return;
  if(event.request.mode==='navigate'){
    event.respondWith(fetch(event.request).then(response=>{const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));return response;}).catch(()=>caches.match(event.request).then(found=>found||caches.match('./index.html'))));return;
  }
  event.respondWith(caches.match(event.request).then(found=>found||fetch(event.request).then(response=>{if(response.ok&&url.origin===self.location.origin){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));}return response;})));
});
