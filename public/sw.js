const CACHE_NAME = 'recruit-crm-v8';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Never intercept Supabase API or non-GET requests
  if (url.hostname.includes('supabase.co')) return;
  if (e.request.method !== 'GET') return;

  // Navigate: network-first → fallback to cached index.html → minimal offline page
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
          return res;
        })
        .catch(async () => {
          const cached = await caches.match('/index.html');
          return cached || new Response('<h2>Нет соединения</h2>', {
            status: 503,
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
          });
        })
    );
    return;
  }

  // Same-origin assets: network-first, fallback to cache, then 503
  if (url.origin === self.location.origin) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
          }
          return res;
        })
        .catch(async () => {
          const cached = await caches.match(e.request);
          return cached || new Response('', { status: 503 });
        })
    );
    return;
  }

  // External / CDN: network-first, fallback to cache, then 503
  e.respondWith(
    fetch(e.request)
      .catch(async () => {
        const cached = await caches.match(e.request);
        return cached || new Response('', { status: 503 });
      })
  );
});
