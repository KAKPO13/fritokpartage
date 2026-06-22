// netlify/functions/check-rental-alerts.js
// ─────────────────────────────────────────────────────────────────────────────
//  Netlify Scheduled Function — tourne toutes les 5 minutes
//  Cherche les locations dépassant 45min ou 1h et envoie une FCM push
//
//  Config netlify.toml :
//    [functions."check-rental-alerts"]
//      schedule = "*/5 * * * *"
//
//  Variables d'environnement requises :
//    FIREBASE_PROJECT_ID
//    FIREBASE_CLIENT_EMAIL
//    FIREBASE_PRIVATE_KEY
// ─────────────────────────────────────────────────────────────────────────────

import { adminDb } from '../../lib/firebaseAdmin.js';
import admin from 'firebase-admin';

const messaging = admin.messaging();

const WARN_MS  = 45 * 60 * 1000;
const LIMIT_MS = 60 * 60 * 1000;

export const handler = async () => {
  try {
    const now = Date.now();

    const snap = await adminDb
      .collection('rentals')
      .where('status', '==', 'en_cours')
      .get();

    const jobs = snap.docs.map(async (docSnap) => {
      const r        = docSnap.data();
      const rentalId = docSnap.id;
      const startTs  = r.startTime?._seconds
        ? r.startTime._seconds * 1000
        : null;

      if (!startTs || !r.userId) return;

      const elapsed    = now - startTs;
      const isWarn     = elapsed >= WARN_MS  && elapsed < LIMIT_MS;
      const isLimit    = elapsed >= LIMIT_MS;
      const alreadyKey = isLimit ? 'notif_limit_sent' : 'notif_warn_sent';

      if (r[alreadyKey]) return;
      if (!isWarn && !isLimit) return;

      const userSnap = await adminDb.collection('users').doc(r.userId).get();
      const fcmToken = userSnap.data()?.fcmToken;
      if (!fcmToken) return;

      const qr        = r.qrCode || rentalId;
      const remaining = Math.ceil((LIMIT_MS - elapsed) / 60000);

      const message = isLimit
        ? {
            token: fcmToken,
            notification: {
              title: '🚨 Fritok — Limite atteinte !',
              body : `Power bank ${qr} : 1h dépassée ! Rends-le maintenant pour garder ta caution.`,
            },
            data: { tag: `limit-${rentalId}`, urgent: 'true', url: '/app?tab=return' },
            android: { priority: 'high' },
            webpush: {
              headers     : { Urgency: 'high' },
              notification: { requireInteraction: true, vibrate: [500, 200, 500, 200, 800] },
            },
          }
        : {
            token: fcmToken,
            notification: {
              title: '⚡ Fritok — Rappel location',
              body : `Power bank ${qr} : ~${remaining} min restantes. Pense à le rendre !`,
            },
            data: { tag: `warn-${rentalId}`, urgent: 'false', url: '/app?tab=return' },
            webpush: {
              notification: { vibrate: [200, 100, 200] },
            },
          };

      try {
        await messaging.send(message);
        await docSnap.ref.update({ [alreadyKey]: true });
        console.log(`[fritok] Notif ${isLimit ? 'LIMIT' : 'WARN'} envoyée → ${r.userId} (${qr})`);
      } catch (e) {
        console.error(`[fritok] Erreur FCM pour ${r.userId}:`, e.message);
      }
    });

    await Promise.allSettled(jobs);
    return { statusCode: 200, body: `OK — ${snap.size} locations vérifiées` };
  } catch (e) {
    console.error('[fritok] check-rental-alerts:', e);
    return { statusCode: 500, body: e.message };
  }
};