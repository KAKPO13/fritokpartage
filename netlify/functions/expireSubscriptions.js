// netlify/functions/expireSubscriptions.js
//
// Fonction planifiée (Netlify Scheduled Functions — cron). À exécuter
// toutes les 15-30 min. Nécessaire au modèle "custom claims" :
// applySubscriptionRenewal.js pose subscriptionActive=true au paiement,
// mais rien ne le repasse à false tout seul quand currentPeriodEnd est
// dépassé — c'est le rôle de cette fonction.
//
// Configuration (netlify.toml) :
//   [functions."expireSubscriptions"]
//     schedule = "*/15 * * * *"

import { adminDb, adminAuth } from "./_shared/firebaseAdmin.js";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

const BATCH_SIZE = 200;

export const handler = async () => {
  const now = Timestamp.now();

  const expiredSnap = await adminDb
    .collection("sellers")
    .where("subscriptionActive", "==", true)
    .where("currentPeriodEnd", "<", now)
    .limit(BATCH_SIZE)
    .get();

  if (expiredSnap.empty) {
    return { statusCode: 200, body: JSON.stringify({ processed: 0 }) };
  }

  let processed = 0;
  let failed = 0;

  for (const doc of expiredSnap.docs) {
    const uid = doc.id;
    try {
      // 1. Firestore d'abord — reste la source de vérité même si la
      // pose du claim échoue ensuite.
      await doc.ref.update({
        subscriptionActive: false,
        updatedAt: FieldValue.serverTimestamp(),
      });

      // 2. Custom claim — coupe l'accès Worker dès le prochain
      // rafraîchissement de token du vendeur.
      const userRecord = await adminAuth.getUser(uid);
      await adminAuth.setCustomUserClaims(uid, {
        ...(userRecord.customClaims || {}),
        subscriptionActive: false,
      });

      processed++;
    } catch (e) {
      console.error("expireSubscriptions failed for", uid, e);
      failed++;
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ processed, failed, total: expiredSnap.size }),
  };
};