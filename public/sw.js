/* CORTEZ — Service Worker: قشرة تعمل بلا اتصال + استقبال الإشعارات */
const CACHE = 'cortez-shell-v2';
const SHELL = ['/css/style.css', '/css/views.css', '/css/extras.css', '/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL).catch(() => null))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: 'window' }))
      .then((clients) => clients.forEach((client) => client.postMessage({ type: 'sw:activated', cache: CACHE })))
      .catch(() => null)
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/') || url.pathname.startsWith('/socket.io/')) return;

  if (request.mode === 'navigate') {
    /* الشبكة أولاً دائمًا: صفحة HTML تحمل رمز CSRF، وتخزينها يكسر الكتابة */
    event.respondWith(
      fetch(request).catch(
        () =>
          new Response(
            `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8" />
             <meta name="viewport" content="width=device-width,initial-scale=1" />
             <title>بلا اتصال — CORTEZ</title>
             <style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0a0a0c;color:#f4f1f2;font-family:system-ui,sans-serif;text-align:center;padding:24px}
             a{color:#e63946;font-weight:700}</style></head>
             <body><div><h1>لا يوجد اتصال</h1><p style="color:#9b9296">عد إلى الشبكة ثم أعد المحاولة.</p>
             <a href="/">المحاولة من جديد</a></div></body></html>`,
            { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
          )
      )
    );
    return;
  }

  /* الأصول (js/css/صور): الشبكة أولاً حتى يصل أي تحديث فورًا، والكاش احتياط فقط */
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.status === 200) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => null);
        }
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || Response.error()))
  );
});

self.addEventListener('push', (event) => {
  let payload = { title: 'CORTEZ', body: '', url: '/' };
  try {
    payload = { ...payload, ...(event.data ? event.data.json() : {}) };
  } catch (error) {
    payload.body = event.data ? event.data.text() : '';
  }
  event.waitUntil(
    self.registration.showNotification(payload.title || 'CORTEZ', {
      body: payload.body || '',
      icon: '/icon.svg',
      badge: '/icon.svg',
      tag: payload.tag || 'cortez',
      data: { url: payload.url || '/' },
      vibrate: [80, 40, 80]
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(self.location.origin)) {
          client.focus();
          client.navigate(target).catch(() => null);
          return null;
        }
      }
      return self.clients.openWindow(target);
    })
  );
});
