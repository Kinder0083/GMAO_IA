const CACHE_NAME = 'fsao-iris-v1';
const OFFLINE_URL = '/offline.html';

// Fichiers a mettre en cache pour le mode hors-ligne
const PRECACHE_URLS = [
  '/',
  '/offline.html',
  '/logo-iris.png'
];

// Installation : pre-cache des fichiers essentiels
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS);
    })
  );
  self.skipWaiting();
});

// Activation : nettoyage des anciens caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Fetch : network-first, fallback vers cache ou page offline
self.addEventListener('fetch', (event) => {
  // Ignorer les requetes non-GET et les appels API
  if (event.request.method !== 'GET' || event.request.url.includes('/api/')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Mettre en cache la reponse reussie
        if (response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // Hors-ligne : essayer le cache, sinon page offline
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // Si c'est une navigation, afficher la page offline
          if (event.request.mode === 'navigate') {
            return caches.match(OFFLINE_URL);
          }
          return new Response('', { status: 503, statusText: 'Offline' });
        });
      })
  );
});

// Push : reception d'une notification push
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'FSAO Iris', body: event.data ? event.data.text() : 'Nouvelle notification' };
  }

  const title = data.title || 'FSAO Iris';
  const options = {
    body: data.body || '',
    icon: '/logo-iris.png',
    badge: '/logo-iris.png',
    tag: data.tag || 'fsao-notification',
    data: data.data || {},
    vibrate: [200, 100, 200],
    requireInteraction: data.requireInteraction || false,
    actions: data.actions || []
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Notification click : navigation vers la bonne page
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
      targetUrl = '/';
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Si une fenetre est deja ouverte, la focus et naviguer
        for (const client of clientList) {
          if ('focus' in client) {
            client.focus();
            client.postMessage({ type: 'NAVIGATE', url: targetUrl });
            return;
          }
        }
        // Sinon ouvrir une nouvelle fenetre
        return self.clients.openWindow(targetUrl);
      })
  );
});
