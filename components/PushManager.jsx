'use client';

import { useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebaseClient';
import { saveFCMToken } from '@/lib/firebaseMessaging';

export default function PushManager() {
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) return;

      try {
        await saveFCMToken();
      } catch (err) {
        console.error('Erreur FCM', err);
      }
    });

    return () => unsubscribe();
  }, []);

  return null;
}