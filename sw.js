// ─────────────────────────────────────────────────────────────────
//  Recruit CRM — Service Worker
//  Кэшируем оболочку приложения; данные хранятся в localStorage
// ─────────────────────────────────────────────────────────────────
const CACHE_NAME = 'recruit-crm-v2';

// Всё что нужно для открытия приложения без сети
const SHELL_URLS = [
  './',
  './index.html',
];

// ── Install: кэшируем оболочку ────────────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: чистим старые кэши ─────────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: сеть первая, кэш как запасной ─────────────────────────
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Supabase API — не кэшируем, только сеть
  if (url.hostname.includes('supabase.co')) return;

  // Навигация (открытие страницы) — сеть → кэш
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          // Обновляем кэш свежей версией
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Остальные ресурсы (JS CDN и т.д.) — кэш → сеть
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
