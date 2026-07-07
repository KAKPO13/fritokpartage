// netlify/functions/flutterwave-webhook.js
//
// Gère 2 types d'événements "charge.completed" :
//   1. Recharge wallet — identifiée par un document topupAttempts/{txRef}
//      préexistant (créé par createTopup). Logique INCHANGÉE.
//   2. Abonnement vendeur — créé par create-subscription-payment.js,
//      qui n'écrit AUCUN document préalable : l'identification se fait
//      via `meta.uid` / `meta.plan`, renvoyés par Flutterwave dans la
//      réponse de vérification de transaction.

import fetch from 'node-fetch';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb as db } from './_shared/firebaseAdmin.js';
import { applySubscriptionRenewal } from './_shared/applySubscriptionRenewal.js';
import { getPlanAmount } from './_shared/subscriptionPlans.js';

const HEADERS = { 'Content-Type': 'application/json' };
const AMOUNT_TOLERANCE = 0.05; // arrondis de conversion de devise

export const handler = async (event) => {
  try {
    // 1. Vérification signature
    const signature = event.headers['verif-hash'];
    if (!signature || signature !== process.env.FLUTTERWAVE_WEBHOOK_SECRET) {
      return { statusCode: 401, body: 'Invalid signature' };
    }

    const payload = JSON.parse(event.body);
    if (payload.event !== 'charge.completed') {
      return { statusCode: 200, body: 'Event ignored' };
    }

    const txRef = payload.data?.tx_ref;
    const transactionId = payload.data?.id;
    if (!txRef || !transactionId) {
      return { statusCode: 400, body: 'Invalid payload' };
    }

    // 2. Vérification Flutterwave
    const verifyRes = await fetch(
      `https://api.flutterwave.com/v3/transactions/${transactionId}/verify`,
      { headers: { Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}` } }
    );
    const verifyData = await verifyRes.json();

    if (verifyData.status !== 'success' || verifyData.data?.status !== 'successful') {
      return { statusCode: 400, body: 'Payment not successful' };
    }

    const meta = verifyData.data?.meta || {};

    // ─────────────────────────────────────────────────────────────
    // BRANCHE ABONNEMENT — identifiée par meta.uid + meta.plan,
    // transmis par create-subscription-payment.js à la création du
    // lien de paiement. Aucun document topupAttempts à lire ici.
    // ─────────────────────────────────────────────────────────────
    if (meta.uid && meta.plan) {
      const { uid: subUid, plan } = meta;
      const currency = verifyData.data.currency;
      const amountPaid = verifyData.data.amount;

      // Sanity check : le montant réellement payé doit correspondre
      // au tarif du plan pour cette devise (calculé côté serveur dans
      // create-subscription-payment.js). Une divergence signifierait
      // soit un souci de taux de change, soit une tentative de
      // paiement forgé hors de notre flux normal.
      const expectedAmount = getPlanAmount(plan, currency);
      if (expectedAmount === null || Math.abs(expectedAmount - amountPaid) > AMOUNT_TOLERANCE) {
        console.error(
          `Montant abonnement inattendu — uid:${subUid} plan:${plan} currency:${currency} attendu:${expectedAmount} reçu:${amountPaid}`
        );
        return { statusCode: 400, body: 'Amount mismatch' };
      }

      try {
        // L'idempotence est gérée à l'intérieur de la transaction
        // (subscriptionPayments/{txRef}) — pas besoin de vérifier ici,
        // un second appel avec le même txRef ne fait rien de plus.
        const result = await applySubscriptionRenewal({
          userId: subUid,
          plan,
          currency,
          amount: amountPaid,
          moyenPaiement: verifyData.data.payment_type ?? 'inconnu',
          reference: txRef,
        });

        if (result.alreadyProcessed) {
          return { statusCode: 200, body: 'Already processed' };
        }

        console.log(`✅ Abonnement renouvelé — uid:${subUid} plan:${plan} txRef:${txRef}`);
        return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ ok: true }) };
      } catch (e) {
        console.error('applySubscriptionRenewal error:', e);
        return { statusCode: 500, body: 'Subscription renewal failed' };
      }
    }

    // ─────────────────────────────────────────────────────────────
    // BRANCHE WALLET TOPUP — comportement existant, inchangé.
    // ─────────────────────────────────────────────────────────────

    // Récupérer topupAttempts (PAS wallet_transactions)
    const attemptRef = db.collection('topupAttempts').doc(txRef);
    const attemptSnap = await attemptRef.get();

    if (!attemptSnap.exists) {
      console.error('topupAttempt introuvable pour txRef:', txRef);
      return { statusCode: 404, body: 'Attempt not found' };
    }

    const attempt = attemptSnap.data();

    // Idempotence — évite le double crédit si le webhook arrive deux fois
    if (attempt.status === 'completed') {
      return { statusCode: 200, body: 'Already processed' };
    }

    const { userId, currency, amount, transtetId } = attempt;

    // Vérification montant & devise
    if (verifyData.data.amount !== amount || verifyData.data.currency !== currency) {
      await attemptRef.update({
        status: 'failed',
        verifiedAt: FieldValue.serverTimestamp(),
      });
      return { statusCode: 400, body: 'Amount mismatch' };
    }

    // Écriture atomique
    await db.runTransaction(async (t) => {
      // a) Crédite le wallet
      const userRef = db.collection('users').doc(userId);
      t.update(userRef, {
        [`wallet.${currency}`]: FieldValue.increment(amount),
      });

      // b) Met topupAttempts en completed
      t.update(attemptRef, {
        status: 'completed',
        flutterId: transactionId,
        verifiedAt: FieldValue.serverTimestamp(),
      });

      // c) Met TransfetMoney en completed (créé en pending par createTopup)
      if (transtetId) {
        const txRef2 = db.collection('TransfetMoney').doc(transtetId); // ← note: "TransfetMoney" (faute conservée)
        t.update(txRef2, {
          status: 'completed',
          flutterId: transactionId,
          verifiedAt: FieldValue.serverTimestamp(),
        });
      }
    });

    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ ok: true }) };

  } catch (error) {
    console.error('WEBHOOK ERROR:', error);
    return { statusCode: 500, body: 'Server error' };
  }
};