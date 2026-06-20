// netlify/functions/expire-subscriptions.js
// Cron Netlify : s'exécute chaque jour à 02h00 UTC
// Passe en 'expired' tous les abonnements dont currentPeriodEnd < now
// ET les trials dont trialEndsAt < now
//
// Ajouter dans netlify.toml :
// [[plugins]]
//   package = "@netlify/plugin-functions-install-core"
//
// [functions."expire-subscriptions"]
//   schedule = "0 2 * * *"

const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore, Timestamp }       = require('firebase-admin/firestore');

function getAdminApp() {
  if (getApps().length) return getApps()[0];
  return initializeApp({
    credential: cert({
      projectId:   process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey:  (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    }),
  });
}

exports.handler = async (event) => {
  // Sécurité basique si appelé manuellement
  const secret = event.headers?.['x-cron-secret'] ?? '';
  if (secret && secret !== process.env.CRON_SECRET) {
    return { statusCode: 401, body: 'Unauthorized' };
  }

  const db  = getFirestore(getAdminApp());
  const now = Timestamp.now();
  let expiredCount = 0;

  // ── 1. Trials expirés ─────────────────────────────────
  const trialSnap = await db.collection('subscriptions')
    .where('status', '==', 'trial')
    .where('trialEndsAt', '<', now)
    .limit(200)
    .get();

  const trialBatch = db.batch();
  for (const docSnap of trialSnap.docs) {
    const uid = docSnap.id;
    trialBatch.update(db.collection('users').doc(uid), {
      'subscription.status': 'expired',
      updatedAt: now,
    });
    trialBatch.update(db.collection('subscriptions').doc(uid), {
      status: 'expired', expiredAt: now, updatedAt: now,
    });
    expiredCount++;
  }
  if (trialBatch._ops?.length || trialSnap.docs.length > 0) {
    await trialBatch.commit();
  }

  // ── 2. Abonnements actifs expirés ─────────────────────
  const activeSnap = await db.collection('subscriptions')
    .where('status', '==', 'active')
    .where('currentPeriodEnd', '<', now)
    .limit(200)
    .get();

  const activeBatch = db.batch();
  for (const docSnap of activeSnap.docs) {
    const uid = docSnap.id;
    activeBatch.update(db.collection('users').doc(uid), {
      'subscription.status': 'expired',
      updatedAt: now,
    });
    activeBatch.update(db.collection('subscriptions').doc(uid), {
      status: 'expired', expiredAt: now, updatedAt: now,
    });
    expiredCount++;
  }
  if (activeSnap.docs.length > 0) {
    await activeBatch.commit();
  }

  const msg = `✅ expire-subscriptions: ${expiredCount} abonnement(s) expirés`;
  console.log(msg);
  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true, expired: expiredCount, ts: now.toDate().toISOString() }),
  };
};