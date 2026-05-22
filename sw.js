// Recruit CRM — Service Worker (shell + local static assets)
const CACHE_NAME = 'recruit-crm-v4';

const SHELL_URLS = [
  './',
  './index.html',
  './css/app.css',
  './js/config.local.example.js',
  './js/config.defaults.js',
  './js/config.js',
  './js/state.js',
  './js/utils.js',
  './js/offline.js',
  './js/realtime.js',
  './js/auth.js',
  './js/candidates.js',
  './js/vacancies.js',
  './js/kanban.js',
  './js/dashboard.js',
  './js/drawer.js',
  './js/reminders.js',
  './js/email.js',
  './js/email_templates.js',
  './js/comments.js',
  './js/merge.js',
  './js/templates.js',
  './js/app.js',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  if (url.hostname.includes('supabase.co')) return;

  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Same-origin JS/CSS — cache first, then network
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.match(e.request).then(cached =>
        cached || fetch(e.request).then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
          }
          return res;
        })
      )
    );
    return;
  }

  // CDN — network first
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
