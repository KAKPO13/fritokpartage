import { getMessaging, getToken } from 'firebase/messaging';
import {
  doc,
  setDoc,
  serverTimestamp,
  arrayUnion,
} from 'firebase/firestore';

import { app, db, auth } from './firebaseClient';

export async function saveFCMToken() {
  try {
    const user = auth.currentUser;

    if (!user) {
      console.log('Utilisateur non connecté');
      return null;
    }

    if (!('Notification' in window)) {
      console.log('Notifications non supportées');
      return null;
    }

    if (Notification.permission === 'denied') {
      alert(
        'Les notifications sont bloquées. Active-les dans les paramètres de votre navigateur.'
      );
      return null;
    }

    const permission =
      Notification.permission === 'granted'
        ? 'granted'
        : await Notification.requestPermission();

    if (permission !== 'granted') {
      return null;
    }

    const messaging = getMessaging(app);

    const token = await getToken(messaging, {
      vapidKey:
        process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
    });

    if (!token) {
      console.log('Token FCM introuvable');
      return null;
    }

    await setDoc(
      doc(db, 'users', user.uid),
      {
        fcmTokens: arrayUnion(token),
        notificationsEnabled: true,
        fcmUpdatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    console.log('✅ Token FCM enregistré');

    return token;
  } catch (error) {
    console.error(
      'Erreur saveFCMToken:',
      error
    );
    return null;
  }
}