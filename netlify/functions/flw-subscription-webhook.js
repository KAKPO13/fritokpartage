// netlify/functions/flw-subscription-webhook.js
// Reçoit les événements Flutterwave :
//   charge.completed  → active/renouvelle un abonnement
//   subscription.cancelled → annule
// Vérifie la signature, met à jour Firestore + Escrow.
// URL à configurer dans le dashboard Flutterwave :
//   https://votre-site.netlify.app/.netlify/functions/flw-subscription-webhook

const crypto = require('crypto');
const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore, Timestamp, increment, FieldValue } = require('firebase-admin/firestore');

const ESCROW_UID = 'escrow_fritok';

const PLANS = {
  essentiel: { priceXof: 2500 },
  pro:       { priceXof: 5000 },
  elite:     { priceXof: 10000 },
};

// XOF → autres devises (taux fixes de secours, idéalement remplacés par une API)
const RATES = { XOF: 1, GHS: 0.013, NGN: 4.75 };

function toNum(v) { return v == null ? 0 : Number(v); }

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

function verifyFlwSignature(body, signature) {
  const secret  = process.env.FLUTTERWAVE_SECRET_KEY ?? '';
  const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'));
  } catch {
    return false;
  }
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  // ── Vérifier la signature Flutterwave ──────────────────
  const signature = event.headers?.['verif-hash'] ?? '';
  const rawBody   = event.body ?? '';
  if (!verifyFlwSignature(rawBody, signature)) {
    console.warn('❌ Signature FLW invalide');
    return { statusCode: 401, body: 'Invalid signature' };
  }

  let payload;
  try { payload = JSON.parse(rawBody); }
  catch { return { statusCode: 400, body: 'Invalid JSON' }; }

  const eventType = payload?.event ?? '';
  const data      = payload?.data  ?? {};

  console.log(`📬 FLW webhook: ${eventType}`, JSON.stringify(data).slice(0, 300));

  const db = getFirestore(getAdminApp());

  // ─────────────────────────────────────────────────────────
  // PAIEMENT RÉUSSI — charge.completed
  // meta.uid = uid Firebase du vendeur
  // meta.plan = 'essentiel' | 'pro' | 'elite'
  // ─────────────────────────────────────────────────────────
  if (eventType === 'charge.completed' && data.status === 'successful') {
    const uid          = data.meta?.uid ?? '';
    const plan         = data.meta?.plan ?? 'pro';
    const currency     = data.currency ?? 'XOF';
    const amountPaid   = Number(data.amount ?? 0);
    const txRef        = data.tx_ref ?? data.id ?? `flw-${Date.now()}`;
    const customerEmail = data.customer?.email ?? '';

    if (!uid) {
      console.error('❌ uid manquant dans meta');
      return { statusCode: 200, body: 'ok-no-uid' };
    }

    // Vérification anti-doublon : le même tx_ref ne doit être traité qu'une fois
    const txDocRef  = db.collection('flw_transactions').doc(txRef);
    const txDocSnap = await txDocRef.get();
    if (txDocSnap.exists) {
      console.log(`⚠️ tx_ref ${txRef} déjà traité — idempotence ok`);
      return { statusCode: 200, body: 'already-processed' };
    }
    // Marquer immédiatement
    await txDocRef.set({ processed: true, at: Timestamp.now(), uid, plan });

    const now  = Date.now();
    const periodStart = Timestamp.fromMillis(now);
    const periodEnd   = Timestamp.fromMillis(now + 30 * 24 * 60 * 60 * 1000);

    // ── Mise à jour Firestore users/{uid} ─────────────────
    await db.collection('users').doc(uid).update({
      'subscription.status':             'active',
      'subscription.plan':               plan,
      'subscription.currentPeriodStart': periodStart,
      'subscription.currentPeriodEnd':   periodEnd,
      'subscription.lastPaymentAt':      Timestamp.fromMillis(now),
      'subscription.flwTxRef':           txRef,
      updatedAt:                         Timestamp.fromMillis(now),
    });

    // ── Collection globale subscriptions ──────────────────
    await db.collection('subscriptions').doc(uid).set({
      uid, email: customerEmail, plan,
      status: 'active',
      currentPeriodStart: periodStart,
      currentPeriodEnd:   periodEnd,
      lastPaymentAt: Timestamp.fromMillis(now),
      updatedAt:     Timestamp.fromMillis(now),
    }, { merge: true });

    // ── Créditer l'Escrow des frais d'abonnement ──────────
    // On stocke le montant en XOF de référence + dans la devise du paiement
    const amountXof = currency === 'XOF'
      ? amountPaid
      : Math.round(amountPaid / (RATES[currency] ?? 1));

    const escrowRef  = db.collection('users').doc(ESCROW_UID);
    const escrowSnap = await escrowRef.get();
    const escrowData = escrowSnap.exists ? escrowSnap.data() : {};
    const oldSub     = (escrowData.totalSubscriptions && typeof escrowData.totalSubscriptions === 'object')
      ? escrowData.totalSubscriptions : {};

    await escrowRef.set({
      totalSubscriptions: {
        XOF: toNum(oldSub.XOF) + amountXof,
        [currency]: toNum(oldSub[currency]) + amountPaid,
      },
      updatedAt: Timestamp.fromMillis(now),
    }, { merge: true });

    // ── Entrée TransfetMoney ───────────────────────────────
    const txMoneyRef = db.collection('TransfetMoney').doc();
    await txMoneyRef.set({
      transactionId:    txMoneyRef.id,
      type:             'subscription',
      currency,
      date:             new Date(now).toISOString().slice(0, 10),
      timestamp:        now,
      montantEnvoye:    amountPaid,
      frais:            0,
      montantRecu:      amountPaid,
      expediteurId:     uid,
      expediteurEmail:  customerEmail,
      profilePictureUrl:'',
      destinataireId:   ESCROW_UID,
      destinataireNom:  'FriTok Abonnements',
      destinataireTelephone: '',
      plan,
      flwTxRef:         txRef,
      status:           'completed',
    });

    console.log(`✅ Abonnement activé — uid:${uid} plan:${plan} until:${periodEnd.toDate().toISOString()}`);
    return { statusCode: 200, body: JSON.stringify({ ok: true, uid, plan }) };
  }

  // ─────────────────────────────────────────────────────────
  // ANNULATION — subscription.cancelled
  // ─────────────────────────────────────────────────────────
  if (eventType === 'subscription.cancelled') {
    const uid = data.meta?.uid ?? data.customer?.email ?? '';
    if (!uid) return { statusCode: 200, body: 'ok-no-uid' };

    const now = Date.now();

    // On cherche l'uid par email si nécessaire
    let resolvedUid = uid;
    if (uid.includes('@')) {
      const snap = await db.collection('users').where('email', '==', uid).limit(1).get();
      if (!snap.empty) resolvedUid = snap.docs[0].id;
    }

    await db.collection('users').doc(resolvedUid).update({
      'subscription.status':      'cancelled',
      'subscription.cancelledAt': Timestamp.fromMillis(now),
      updatedAt: Timestamp.fromMillis(now),
    });

    await db.collection('subscriptions').doc(resolvedUid).set({
      status: 'cancelled', cancelledAt: Timestamp.fromMillis(now), updatedAt: Timestamp.fromMillis(now),
    }, { merge: true });

    console.log(`⛔ Abonnement annulé — uid:${resolvedUid}`);
    return { statusCode: 200, body: 'cancelled' };
  }

  // Événement non géré — répondre 200 pour éviter les retries FLW
  return { statusCode: 200, body: 'unhandled-event' };
};