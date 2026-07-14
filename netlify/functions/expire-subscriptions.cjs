// netlify/functions/expire-subscriptions.js
//
// Fonction planifiée (Netlify Scheduled Functions — cron). Repasse
// subscription.status à 'expired' (et retire le custom claim
// subscriptionActive) pour tout vendeur dont subscription.currentPeriodEnd
// est dépassé — que ce soit un trial ou un abonnement payant actif.
//
// Configuration (netlify.toml) :
//   [functions."expire-subscriptions"]
//     schedule = "0 2 * * *"

const { Timestamp, FieldValue } = require('firebase-admin/firestore');
const { adminDb: db, adminAuth } = require('./_shared/firebaseAdmin.js');

const BATCH_SIZE = 200;

exports.handler = async () => {
  const now = Timestamp.now();

  // Nécessite un index composite (status IN [...] + currentPeriodEnd 
  // now) — Firestore fournira le lien de création directement dans les
  // logs si l'index manque au premier déploiement.
  const expiredSnap = await db
    .collection('users')
    .where('subscription.status', 'in', ['trial', 'active'])
    .where('subscription.currentPeriodEnd', '<', now)
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
      // 1. Firestore d'abord (source de vérité)
      await doc.ref.update({
        'subscription.status': 'expired',
        updatedAt: FieldValue.serverTimestamp(),
      });

      await db.collection('subscriptions').doc(uid).set({
        status: 'expired',
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });

      // 2. Custom claim — coupe l'accès Worker dès le prochain
      // rafraîchissement de token du vendeur.
      const userRecord = await adminAuth.getUser(uid);
      await adminAuth.setCustomUserClaims(uid, {
        ...(userRecord.customClaims || {}),
        subscriptionActive: false,
      });

      processed++;
    } catch (e) {
      console.error('expire-subscriptions failed for', uid, e);
      failed++;
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ processed, failed, total: expiredSnap.size }),
  };
};