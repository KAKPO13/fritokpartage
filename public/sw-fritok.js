// public/sw-fritok.js
// ─────────────────────────────────────────────────────────────────────────────
//  Service Worker Fritok
//  Gère les notifications push background (FCM) et les notifs locales
//  À placer dans /public/sw-fritok.js
// ─────────────────────────────────────────────────────────────────────────────

// Import FCM compat pour le SW
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

// Config Firebase — mêmes valeurs que dans app.js
firebase.initializeApp({
  apiKey: 'AIzaSyDKKayop62AaoC5DnYz5UuDpJIT3RBRX3M',
  authDomain: 'cgsp-app.firebaseapp.com',
  projectId: 'cgsp-app',
  storageBucket: 'cgsp-app.appspot.com',
  messagingSenderId: '463987328508',
  appId: '1:463987328508:web:dc6c86e684a04b45739e79',
});


const messaging = firebase.messaging();

// ── Messages push FCM background ─────────────────────────────────────────────
messaging.onBackgroundMessage((payload) => {
  const { title, body, urgent } = payload.data ?? payload.notification ?? {};

  const options = {
    body,
    icon              : '/icons/icon-192x192.png',
    badge             : '/icons/badge-72x72.png',
    requireInteraction: urgent === 'true',
    vibrate           : urgent === 'true'
      ? [500, 200, 500, 200, 500, 200, 800]
      : [200, 100, 200],
    tag               : payload.data?.tag || 'fritok-rental',
    data              : { url: '/app?tab=return' },
  };

  self.registration.showNotification(title || '⚡ Fritok', options);
});

// ── Clic sur notification → ouvre /app onglet retour ─────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.url || '/app';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const existing = list.find(c => c.url.includes('/app'));
      if (existing) return existing.focus();
      return clients.openWindow(target);
    })
  );
});