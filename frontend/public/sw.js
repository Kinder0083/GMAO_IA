// Service Worker FSAO Iris - Mode Offline Complet + Push Notifications
// Gère le cache de l'App Shell, les assets statiques, et les notifications push.

const SW_VERSION = '__BUILD_TIMESTAMP__';
const CACHE_NAME = `fsao-iris-v${SW_VERSION}`;
const STATIC_CACHE = `fsao-static-v${SW_VERSION}`;

// Assets critiques à pré-cacher à l'installation
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/offline.html',
  '/logo-iris.png',
  '/icon-192.png',
  '/icon-512.png'
];

// Patterns à ne JAMAIS cacher dans le SW (gérés par IndexedDB/axios)
const NETWORK_ONLY_PATTERNS = ['/api/', '/ws', '/socket', 'hot-update', '__webpack'];
const isNetworkOnly = (url) => NETWORK_ONLY_PATTERNS.some(p => url.includes(p));

// Assets statiques immutables (hashés par CRA)
const isStaticAsset = (url) => url.includes('/static/');

// ============ INSTALLATION ============
self.addEventListener('install', (event) => {
  console.log('[SW] Install - version:', SW_VERSION);
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Pre-caching app shell');
        return cache.addAll(PRECACHE_URLS).catch(err => {
          console.warn('[SW] Pre-cache partiel:', err);
        });
      })
      .then(() => self.skipWaiting())
  );
});

// ============ ACTIVATION ============
self.addEventListener('activate', (event) => {
  console.log('[SW] Activate - version:', SW_VERSION);
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME && name !== STATIC_CACHE)
          .map(name => {
            console.log('[SW] Suppression ancien cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// ============ MESSAGE HANDLER ============
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ============ FETCH HANDLER ============
self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // 1. Requêtes API et WebSocket → réseau uniquement (IndexedDB gère le cache)
  if (isNetworkOnly(url)) {
    return;
  }

  // 2. Assets statiques (JS/CSS hashés) → Cache First (immutables)
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(STATIC_CACHE).then(cache => cache.put(event.request, clone));
          }
          return response;
        }).catch(() => caches.match('/offline.html'));
      })
    );
    return;
  }

  // 3. Navigation (pages HTML) → Network First, fallback cache, puis offline.html
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Mettre en cache la page pour utilisation offline
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() => {
          return caches.match(event.request)
            .then(cached => cached || caches.match('/index.html'))
            .then(cached => cached || caches.match('/offline.html'))
            .then(cached => cached || new Response(
              '<html><body><h1>Hors ligne</h1><p>Veuillez vous connecter au moins une fois pour activer le mode hors ligne.</p></body></html>',
              { status: 503, headers: { 'Content-Type': 'text/html' } }
            ));
        })
    );
    return;
  }

  // 4. Autres ressources (images, fonts, etc.) → Stale While Revalidate
  event.respondWith(
    caches.match(event.request).then(cached => {
      const fetchPromise = fetch(event.request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        // Si pas en cache et pas de réseau, retourner undefined (laisse le cached ou rien)
        return cached;
      });
      return cached || fetchPromise;
    })
  );
});

// ============ PUSH NOTIFICATIONS ============
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
    tag: data.tag || 'fsao-notification',
    requireInteraction: data.requireInteraction || false,
    data: { type: data.type || (data.data && data.data.type) || 'general', url: data.url },
    actions: [{ action: 'open', title: 'Ouvrir' }]
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

// ============ NOTIFICATION CLICK ============
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
