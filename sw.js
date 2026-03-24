// ═══════════════════════════════════════════════
// MEDISECU — SERVICE WORKER v1.1
// Cache · Offline · Push Notifications
// ═══════════════════════════════════════════════

const CACHE_NAME = 'medisecu-v1.1';
const OFFLINE_URL = '/offline.html';

// Ressources à mettre en cache immédiatement
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/offline.html',
  '/icon-192.png',
  '/icon-512.png',
];

// ── INSTALLATION ──
self.addEventListener('install', event => {
  console.log('[MediSecu SW] Installation v1.1');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// ── ACTIVATION ──
self.addEventListener('activate', event => {
  console.log('[MediSecu SW] Activation');
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => {
            console.log('[MediSecu SW] Suppression ancien cache:', key);
            return caches.delete(key);
          })
      )
    ).then(() => self.clients.claim())
  );
});

// ── STRATÉGIE DE CACHE : Network First, fallback Cache ──
self.addEventListener('fetch', event => {
  // Ignorer les requêtes non-GET et les extensions tierces
  if (event.request.method !== 'GET') return;
  if (event.request.url.includes('googleapis.com')) return;
  if (event.request.url.includes('cdnjs.cloudflare.com')) return;
  if (event.request.url.includes('analytics')) return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Mettre en cache la réponse fraîche
        if (response && response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // Réseau indisponible → chercher dans le cache
        return caches.match(event.request).then(cached => {
          if (cached) return cached;
          // Page HTML non cachée → page offline
          if (event.request.destination === 'document') {
            return caches.match(OFFLINE_URL);
          }
        });
      })
  );
});

// ── PUSH NOTIFICATIONS ──
self.addEventListener('push', event => {
  let data = { title: 'MediSecu 💊', body: 'Rappel médicament', icon: '/icon-192.png', badge: '/icon-72.png' };

  if (event.data) {
    try { data = { ...data, ...event.data.json() }; }
    catch(e) { data.body = event.data.text(); }
  }

  const options = {
    body: data.body,
    icon: data.icon || '/icon-192.png',
    badge: data.badge || '/icon-72.png',
    vibrate: [200, 100, 200],
    tag: data.tag || 'medisecu-notif',
    renotify: true,
    requireInteraction: false,
    actions: [
      { action: 'open', title: '✅ Pris', icon: '/icon-72.png' },
      { action: 'snooze', title: '⏰ Rappel 30 min' }
    ],
    data: { url: data.url || '/', timestamp: Date.now() }
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// ── CLIC SUR NOTIFICATION ──
self.addEventListener('notificationclick', event => {
  event.notification.close();

  if (event.action === 'snooze') {
    // Reprogrammer dans 30 minutes
    console.log('[MediSecu SW] Rappel snoozé 30 min');
    return;
  }

  const urlToOpen = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(windowClients => {
        // Si l'app est déjà ouverte, la mettre au premier plan
        for (const client of windowClients) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            return client.focus();
          }
        }
        // Sinon ouvrir une nouvelle fenêtre
        if (clients.openWindow) return clients.openWindow(urlToOpen);
      })
  );
});

// ── MESSAGE DU CLIENT (ex: forcer mise à jour) ──
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
