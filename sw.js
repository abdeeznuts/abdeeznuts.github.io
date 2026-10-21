const VERSION='uniworld-phone-v12';
const ASSETS=['/index.html','/app.js','/phone-ai.js','/screen-awake.js','/launch.js','/journeys.css','/voice-planner.js','/voice-planner.css','/live-rates.js','/live-rates.css','/requests.js','/requests.css','/concierge-data.js','/concierge-speech.js','/neural-voice.js','/data.js','/styles.css','/icon.svg','/icon-192.png','/icon-512.png','/fallback.svg','/manifest.webmanifest','/assets/hunza.webp','/assets/maldives.webp'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(VERSION).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('uniworld-')&&k!==VERSION).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==self.location.origin||u.pathname.startsWith('/api/')||u.pathname.includes('chatgpt')||u.pathname==='/callback')return;
 if(e.request.mode==='navigate'){e.respondWith(fetch(e.request).catch(()=>caches.match('/index.html')));return}
 if(ASSETS.includes(u.pathname)||u.pathname==='/phone-ai-worker.js'||u.pathname==='/neural-voice-worker.js'||u.pathname.startsWith('/voice-runtime/'))e.respondWith(fetch(e.request).then(r=>{if(r.ok&&r.type!=='opaque'){const copy=r.clone();caches.open(VERSION).then(c=>c.put(e.request,copy))}return r}).catch(()=>caches.match(e.request)));
});
