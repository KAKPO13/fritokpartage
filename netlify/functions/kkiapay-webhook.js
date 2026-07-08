// netlify/functions/kkiapay-webhook.js
// -----------------------------------------------------------------------------
// Filet de securite cote serveur pour les paiements KkiaPay.
//
// Le chemin PRINCIPAL de confirmation est le verify frontend-triggered
// (verifyKkiapayTopup.js / verifyKkiapayRentalPayment.js), appele juste
// apres le succes du widget. Ce webhook est un FILET DE SECURITE pour le
// cas ou l'utilisateur ferme l'onglet avant que cet appel n'ait lieu.
//
// POINT A VALIDER EN SANDBOX AVANT MISE EN PROD (non garanti a 100% par
// la doc publique KkiaPay au moment de l'ecriture) : on suppose que la
// donnee passee en `data` a l'ouverture du widget (cf.
// frontend/KkiapayCheckout.jsx) est repercutee dans `stateData` du
// payload webhook. Si ce n'est PAS le cas dans tes tests sandbox, ce
// webhook ne pourra pas retrouver la reference Fritok a partir du seul
// transactionId. Dans ce cas le filet de securite perd son utilite et
// il faudra soit interroger l'API KkiaPay "liste des transactions" pour
// faire la correspondance, soit accepter que le verify frontend reste
// la seule voie fiable (ce qui est deja le cas pour la grande majorite
// des paiements qui se terminent normalement).
//
// Idempotence : toutes les branches verifient le statut "completed"
// avant d'ecrire quoi que ce soit -- sur meme si ce webhook et le verify
// frontend s'executent en parallele.
// -----------------------------------------------------------------------------

import admin from 'firebase-admin';
import { adminDb as db } from './_shared/firebaseAdmin.js';
import { isValidKkiapayWebhookSignature, verifyKkiapayTransaction } from './_shared/kkiapayClient.js';
import { applySubscriptionRenewal } from './_shared/applySubscriptionRenewal.js';
import { getPlanAmount } from './_shared/subscriptionPlans.js';
import { finalizeRentalPayment } from './_shared/finalizeRentalPayment.js';

const HEADERS = { 'Content-Type': 'application/json' };
const AMOUNT_TOLERANCE = 1; // XOF est un entier

export const handler = async (event) => {
  try {
    const signature = event.headers['x-kkiapay-secret'];
    if (!isValidKkiapayWebhookSignature(signature)) {
      return { statusCode: 401, body: 'Invalid signature' };
    }

    const payload = JSON.parse(event.body);
    const transactionId = payload.transactionId;
    const isPaymentSucces = payload.isPaymentSucces;
    const eventType = payload.event;
    const stateData = payload.stateData || {};

    if (eventType !== 'transaction.success' || !isPaymentSucces) {
      return { statusCode: 200, body: 'Event ignored' };
    }
    if (!transactionId) {
      return { statusCode: 400, body: 'Invalid payload' };
    }

    const reference = stateData.ref;
    if (!reference) {
      console.warn('[kkiapay-webhook] Pas de reference Fritok dans stateData - transactionId:', transactionId);
      return { statusCode: 200, body: 'No reference - relying on frontend verify path' };
    }

    let tx;
    try {
      tx = await verifyKkiapayTransaction(transactionId);
    } catch (e) {
      console.error('[kkiapay-webhook] verify error:', e);
      return { statusCode: 500, body: 'Verify failed' };
    }
    if (tx.status !== 'SUCCESS') {
      return { statusCode: 400, body: 'Payment not successful' };
    }

    // -----------------------------------------------------------------
    // BRANCHE ABONNEMENT
    // stateData attendu : { ref, type: 'subscription', uid, plan }
    // -----------------------------------------------------------------
    if (stateData.type === 'subscription' && stateData.uid && stateData.plan) {
      const subUid = stateData.uid;
      const plan = stateData.plan;
      const currency = 'XOF';
      const amountPaid = Number(tx.amount);

      const expectedAmount = getPlanAmount(plan, currency);
      if (expectedAmount === null || Math.abs(expectedAmount - amountPaid) > AMOUNT_TOLERANCE) {
        console.error(`[kkiapay-webhook] Montant abonnement inattendu - uid:${subUid} plan:${plan} attendu:${expectedAmount} recu:${amountPaid}`);
        return { statusCode: 400, body: 'Amount mismatch' };
      }

      try {
        const result = await applySubscriptionRenewal({
          userId: subUid,
          plan,
          currency,
          amount: amountPaid,
          moyenPaiement: 'kkiapay',
          reference,
        });
        if (result.alreadyProcessed) return { statusCode: 200, body: 'Already processed' };
        console.log(`Abonnement KkiaPay renouvele - uid:${subUid} plan:${plan} ref:${reference}`);
        return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ ok: true }) };
      } catch (e) {
        console.error('[kkiapay-webhook] applySubscriptionRenewal error:', e);
        return { statusCode: 500, body: 'Subscription renewal failed' };
      }
    }

    // -----------------------------------------------------------------
    // BRANCHE LOCATION POWER BANK
    // reference = pendingRentalPayments/{ref}
    // -----------------------------------------------------------------
    if (stateData.type === 'rental') {
      const pendingRef = db.collection('pendingRentalPayments').doc(reference);
      const pendingSnap = await pendingRef.get();
      if (!pendingSnap.exists) return { statusCode: 404, body: 'Rental reference not found' };

      const pending = pendingSnap.data();
      if (pending.status === 'completed') return { statusCode: 200, body: 'Already processed' };

      try {
        const result = await finalizeRentalPayment({ db, admin, pending, paymentRef: reference, transactionId, provider: 'kkiapay' });
        return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ ok: true, rentalId: result.rentalId }) };
      } catch (e) {
        console.error('[kkiapay-webhook] finalizeRentalPayment error:', e);
        return { statusCode: 500, body: 'Rental finalization failed' };
      }
    }

    // -----------------------------------------------------------------
    // BRANCHE WALLET TOPUP - miroir de flutterwave-webhook.js
    // -----------------------------------------------------------------
    const attemptRef = db.collection('topupAttempts').doc(reference);
    const attemptSnap = await attemptRef.get();
    if (!attemptSnap.exists) {
      console.error('[kkiapay-webhook] topupAttempt introuvable pour ref:', reference);
      return { statusCode: 404, body: 'Attempt not found' };
    }

    const attempt = attemptSnap.data();
    if (attempt.status === 'completed') {
      return { statusCode: 200, body: 'Already processed' };
    }

    const userId = attempt.userId;
    const currency = attempt.currency;
    const amount = attempt.amount;
    const transtetId = attempt.transtetId;
    const amountPaid = Number(tx.amount);

    if (!isFinite(amountPaid) || Math.abs(amountPaid - amount) > AMOUNT_TOLERANCE) {
      await attemptRef.update({ status: 'failed', verifiedAt: admin.firestore.FieldValue.serverTimestamp() });
      return { statusCode: 400, body: 'Amount mismatch' };
    }

    await db.runTransaction(async (t) => {
      const userRef = db.collection('users').doc(userId);
      t.update(userRef, {
        [`wallet.${currency}`]: admin.firestore.FieldValue.increment(amount),
      });
      t.update(attemptRef, {
        status: 'completed',
        kkiapayTransactionId: transactionId,
        verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      if (transtetId) {
        const transtetRef = db.collection('TransfetMoney').doc(transtetId);
        t.update(transtetRef, {
          status: 'completed',
          kkiapayTransactionId: transactionId,
          verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    });

    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ ok: true }) };

  } catch (error) {
    console.error('[kkiapay-webhook] fatal:', error);
    return { statusCode: 500, body: 'Server error' };
  }
};