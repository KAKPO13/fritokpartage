importScripts(
  'https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js'
);

importScripts(
  'https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js'
);

firebase.initializeApp({
  apiKey: 'AIzaSyDKKayop62AaoC5DnYz5UuDpJIT3RBRX3M',
  authDomain: 'VOTRE_AUTH_DOMAIN',
  projectId: 'cgsp-app',
  storageBucket: 'cgsp-app.appspot.com',
  messagingSenderId: '463987328508',
  appId: '1:463987328508:web:dc6c86e684a04b45739e79',
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title =
    payload.notification?.title ||
    'FriTok';

  const options = {
    body:
      payload.notification?.body ||
      'Nouvelle notification',
    icon: '/icon-192x192.png',
    badge: '/icon-192x192.png',
    data: payload.data || {},
    requireInteraction: true,
  };

  self.registration.showNotification(
    title,
    options
  );
});

self.addEventListener(
  'notificationclick',
  (event) => {
    event.notification.close();

    const url =
      event.notification.data?.url || '/';

    event.waitUntil(
      clients
        .matchAll({
          type: 'window',
          includeUncontrolled: true,
        })
        .then((clientList) => {
          for (const client of clientList) {
            if (
              client.url.includes(url)
            ) {
              return client.focus();
            }
          }

          return clients.openWindow(url);
        })
    );
  }
);