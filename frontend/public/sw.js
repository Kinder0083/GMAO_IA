// Service Worker FSAO Iris - Notifications push uniquement (pas de cache)
// Ce SW ne met RIEN en cache. NGINX sert les fichiers statiques directement.

const SW_VERSION = '__BUILD_TIMESTAMP__';

// Installation : prise de controle immediate
self.addEventListener('install', () => {
  console.log('[SW] Install - version:', SW_VERSION);
  self.skipWaiting();
});

// Activation : nettoyage de TOUS les anciens caches et prise de controle
self.addEventListener('activate', (event) => {
  console.log('[SW] Activate - version:', SW_VERSION);
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// Message handler
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Fetch handler - PAS de cache
// Navigation requests (HTML pages) : TOUJOURS reseau avec cache: 'no-store'
// Autres requests : reseau direct
self.addEventListener('fetch', (event) => {
  if (event.request.mode === 'navigate') {
    // Force un fetch reseau sans cache HTTP pour les pages HTML
    event.respondWith(
      fetch(event.request, { cache: 'no-store' }).catch(() => {
        // Fallback si offline
        return caches.match('/index.html') || new Response('Hors ligne', {
          status: 503,
          headers: { 'Content-Type': 'text/plain' }
        });
      })
    );
  } else {
    event.respondWith(fetch(event.request));
  }
});

// Push notifications
self.addEventListener('push', (event) => {
  let data = { title: 'FSAO Iris', body: 'Nouvelle notification', type: 'general' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch (e) {
    if (event.data) data.body = event.data.text();
  }

  const options = {
    body: data.body,
    icon: '/logo-iris.png',
    badge: '/logo-iris.png',
    vibrate: [100, 50, 100],
    data: { type: data.type, url: data.url },
    actions: [{ action: 'open', title: 'Ouvrir' }]
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

// Notification click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  let targetUrl = '/';

  switch (data.type) {
    case 'work_order_assigned':
    case 'work_order_status_changed':
      targetUrl = '/work-orders';
      break;
    case 'equipment_alert':
      targetUrl = '/equipments';
      break;
    case 'chat_message':
      targetUrl = '/chat';
      break;
    default:
      targetUrl = data.url || '/';
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ('focus' in client) {
            client.focus();
            client.postMessage({ type: 'NAVIGATE', url: targetUrl });
            return;
          }
        }
        return self.clients.openWindow(targetUrl);
      })
  );
});
