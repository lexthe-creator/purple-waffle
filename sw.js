const CACHE_NAME='personal-ops-hub-shell-v6';
const APP_SHELL=[
  '/',
  '/index.html',
  '/app.webmanifest',
  '/sw.js',
  '/icon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/vendor/react.production.min.js',
  '/vendor/react-dom.production.min.js',
  '/vendor/babel.min.js'
];

self.addEventListener('install',event=>{
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(async cache=>{
        const results=await Promise.allSettled(
          APP_SHELL.map(request=>cache.add(request))
        );
        results.forEach((result,index)=>{
          if(result.status==='rejected'){
            console.warn('Precache failed for',APP_SHELL[index],result.reason);
          }
        });
      })
      .then(()=>self.skipWaiting())
  );
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(key=>key!==CACHE_NAME).map(key=>caches.delete(key))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  event.respondWith(
    caches.match(event.request,{ignoreSearch:true}).then(cached=>{
      if(cached)return cached;
      return fetch(event.request).catch(()=>{
        if(event.request.mode==='navigate'){
          return caches.match('/index.html').then(response=>response||caches.match('/'));
        }
        return Response.error();
      });
    })
  );
});
