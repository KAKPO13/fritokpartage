// netlify/functions/verifyKkiapayRentalPayment.js
// -----------------------------------------------------------------------------
// Equivalent KkiaPay de verifyFlutterwaveRentalPayment.js. Meme structure
// de controles de securite (ownership, idempotence, montant NaN-safe),
// mais la finalisation atomique (creation du rental, deverrouillage du
// power bank) est deleguee a _shared/finalizeRentalPayment.js, partagee
// avec kkiapay-webhook.js.
// -----------------------------------------------------------------------------

import admin from 'firebase-admin';
import { verifyKkiapayTransaction } from './_shared/kkiapayClient.js';
import { finalizeRentalPayment } from './_shared/finalizeRentalPayment.js';

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    }),
  });
}

const db = admin.firestore();
const auth = admin.auth();

const ALLOWED_ORIGINS = new Set([
  'https://fritok.net',
  'https://www.fritok.net',
]);

function getCorsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.has(origin) ? origin : 'https://fritok.net';
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
    'Vary': 'Origin',
    'Content-Type': 'application/json',
  };
}

function ok(body, origin) { return { statusCode: 200, headers: getCorsHeaders(origin), body: JSON.stringify(body) }; }
function err(code, msg, origin) { return { statusCode: code, headers: getCorsHeaders(origin), body: JSON.stringify({ error: msg }) }; }

const AMOUNT_TOLERANCE = { XOF: 1, GHS: 0.01, NGN: 0.01 };

export const handler = async (event) => {
  const origin = event.headers['origin'] || event.headers['Origin'] || '';

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: getCorsHeaders(origin) };
  if (event.httpMethod !== 'POST') return err(405, 'Method not allowed', origin);
  if (!ALLOWED_ORIGINS.has(origin)) {
    console.warn('[verifyKkiapayRental] Origine non autorisee :', origin);
    return err(403, 'Origine non autorisee', origin);
  }

  try {
    // 1. Auth
    const authHeader = event.headers['authorization'] || event.headers['Authorization'] || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!idToken) return err(401, 'Token manquant', origin);

    let decoded;
    try { decoded = await auth.verifyIdToken(idToken); }
    catch (e) { return err(401, `Token invalide : ${e.message}`, origin); }
    const uid = decoded.uid;

    // 2. Body
    let body;
    try { body = JSON.parse(event.body || '{}'); }
    catch { return err(400, 'Body invalide', origin); }

    const { paymentRef, transactionId } = body;
    if (!paymentRef || !transactionId) return err(400, 'paymentRef et transactionId requis', origin);

    // 3. Charger la pre-commande, verifier ownership AVANT l'appel KkiaPay
    const pendingSnap = await db.collection('pendingRentalPayments').doc(paymentRef).get();
    if (!pendingSnap.exists) {
      return ok({ verified: false, error: 'Reference de transaction introuvable' }, origin);
    }
    const pending = pendingSnap.data();
    if (pending.userId !== uid) return err(403, 'Acces non autorise', origin);
    if (pending.provider !== 'kkiapay') return err(400, 'Cette reference n\'est pas une transaction KkiaPay', origin);

    // 4. Idempotence
    if (pending.status === 'completed' && pending.rentalId) {
      return ok({ verified: true, rentalId: pending.rentalId }, origin);
    }

    // 5. Verification serveur KkiaPay
    let tx;
    try {
      tx = await verifyKkiapayTransaction(transactionId);
    } catch (e) {
      console.error('[verifyKkiapayRental] verify error:', e);
      return ok({ verified: false, error: 'Verification KkiaPay echouee' }, origin);
    }
    if (tx.status !== 'SUCCESS') {
      return ok({ verified: false, error: `Statut transaction KkiaPay : ${tx.status}` }, origin);
    }

    // 6. Montant — NaN-safe, tolerance par devise
    const devise = pending.devise || 'XOF';
    const expectedAmount = pending.totalDevise
      ?? (devise === 'XOF'
        ? (pending.amountXof ?? NaN) + (pending.cautionXof ?? NaN)
        : (pending.fraisDevise ?? NaN) + (pending.cautionDevise ?? NaN));

    if (!isFinite(expectedAmount)) {
      console.error('[verifyKkiapayRental] Montant attendu invalide pour paymentRef:', paymentRef);
      return ok({ verified: false, error: 'Montant attendu invalide — contacter le support' }, origin);
    }

    const tolerance = AMOUNT_TOLERANCE[devise] ?? 1;
    const amountPaid = Number(tx.amount);
    if (!isFinite(amountPaid) || Math.abs(amountPaid - expectedAmount) > tolerance) {
      console.error(`[verifyKkiapayRental] Amount mismatch: expected=${expectedAmount} got=${tx.amount} devise=${devise}`);
      return ok({ verified: false, error: 'Montant de la transaction incorrect' }, origin);
    }

    // 7. Finalisation atomique — logique partagee avec kkiapay-webhook.js
    try {
      const result = await finalizeRentalPayment({ db, admin, pending, paymentRef, transactionId, provider: 'kkiapay' });
      return ok({ verified: true, rentalId: result.rentalId }, origin);
    } catch (e) {
      if (e.code === 404) return err(404, e.message, origin);
      if (e.code === 409) return err(409, e.message, origin);
      throw e;
    }

  } catch (e) {
    console.error('[verifyKkiapayRentalPayment] fatal:', e);
    return err(500, 'Erreur interne', origin);
  }
};