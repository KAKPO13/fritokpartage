'use client';

import { useEffect } from 'react';

export default function FirebaseMessagingProvider() {
  useEffect(() => {
    if (
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator
    ) {
      navigator.serviceWorker
        .register(
          '/firebase-messaging-sw.js'
        )
        .then((registration) => {
          console.log(
            '✅ Firebase SW enregistré',
            registration
          );
        })
        .catch((error) => {
          console.error(
            'Erreur Service Worker:',
            error
          );
        });
    }
  }, []);

  return null;
}