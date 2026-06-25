// netlify/functions/flutterwave-webhook.js
// ─────────────────────────────────────────────────────────────────────────────
//  Webhook Flutterwave — reçoit les notifications de paiement côté serveur.
//
//  À configurer dans le dashboard Flutterwave :
//  Settings → Webhooks → URL : https://fritok.net/.netlify/functions/flutterwave-webhook
//  Hash secret : variable d'env FLW_WEBHOOK_HASH
//
//  Ce endpoint est le seul chemin "sans token Firebase" — il est protégé
//  par le HMAC verif-hash de Flutterwave à la place.
//
//  Il agit comme filet de sécurité : si le client ne confirme pas son paiement
//  (crash, fermeture navigateur), ce webhook finalise la location automatiquement.
// ─────────────────────────────────────────────────────────────────────────────

const admin = require('firebase-admin');
const { createTranstetEntry } = require('./_transtet');
const { ESCROW_UID } = require('./_constants');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId  : process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey : (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    }),
  });
}

const db = admin.firestore();

function json(code, body) {
  return { statusCode: code, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

exports.handler = async (event) => {
  // Flutterwave envoie des POST uniquement
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  // ── 1. Vérification HMAC — première ligne de défense ─────────────────────
  //  Flutterwave envoie le secret dans le header 'verif-hash'.
  //  Sans cette vérification, n'importe qui peut forger un webhook.
  const receivedHash = event.headers['verif-hash'] || event.headers['Verif-Hash'] || '';
  const expectedHash = process.env.FLW_WEBHOOK_HASH || '';

  if (!expectedHash) {
    console.error('[webhook] FLW_WEBHOOK_HASH non configuré — rejet par sécurité');
    return json(500, { error: 'Webhook non configuré' });
  }

  if (receivedHash !== expectedHash) {
    console.warn('[webhook] HMAC invalide — tentative de forge ?', { receivedHash: receivedHash.slice(0, 8) + '...' });
    return json(401, { error: 'Signature invalide' });
  }

  // ── 2. Parser le body ─────────────────────────────────────────────────────
  let payload;
  try { payload = JSON.parse(event.body || '{}'); }
  catch { return json(400, { error: 'Body invalide' }); }

  const { event: eventType, data: tx } = payload;

  // On ne traite que les paiements réussis
  if (eventType !== 'charge.completed' || tx?.status !== 'successful') {
    return json(200, { received: true, action: 'ignored' });
  }

  const paymentRef    = tx.tx_ref;
  const transactionId = String(tx.id);

  if (!paymentRef) {
    console.warn('[webhook] tx_ref manquant dans le payload');
    return json(400, { error: 'tx_ref manquant' });
  }

  try {
    // ── 3. Récupérer la pré-commande ─────────────────────────────────────────
    const pendingSnap = await db.collection('pendingRentalPayments').doc(paymentRef).get();
    if (!pendingSnap.exists) {
      // Peut arriver si c'est un paiement de type topup ou autre — ignorer
      console.log('[webhook] pendingRentalPayment introuvable pour ref:', paymentRef, '— ignoré');
      return json(200, { received: true, action: 'not_found' });
    }
    const pending = pendingSnap.data();

    // ── 4. Idempotence ────────────────────────────────────────────────────────
    if (pending.status === 'completed') {
      console.log('[webhook] Déjà traité pour ref:', paymentRef);
      return json(200, { received: true, action: 'already_processed' });
    }

    const uid = pending.userId;

    // ── 5. Re-vérifier avec l'API Flutterwave (double confirmation) ───────────
    const verifyRes = await fetch(
      `https://api.flutterwave.com/v3/transactions/${encodeURIComponent(transactionId)}/verify`,
      { headers: { Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}` } },
    );
    const verifyData = await verifyRes.json();

    if (verifyData.status !== 'success' || verifyData.data?.status !== 'successful') {
      console.error('[webhook] Re-vérification FLW échouée:', verifyData.message);
      return json(200, { received: true, action: 'verification_failed' });
    }

    const verifiedTx = verifyData.data;

    // ── 6. Vérification montant NaN-safe ──────────────────────────────────────
    const devise = pending.devise || 'XOF';
    const expectedAmount = devise === 'XOF'
      ? (pending.amountXof   ?? NaN) + (pending.cautionXof   ?? NaN)
      : (pending.fraisDevise ?? NaN) + (pending.cautionDevise ?? NaN);

    const TOLERANCE = { XOF: 1, GHS: 0.01, NGN: 0.01 };
    if (!isFinite(expectedAmount) || Math.abs(verifiedTx.amount - expectedAmount) > (TOLERANCE[devise] ?? 1)) {
      console.error('[webhook] Montant incorrect — attendu:', expectedAmount, 'reçu:', verifiedTx.amount);
      return json(200, { received: true, action: 'amount_mismatch' });
    }

    // ── 7. Trouver le power bank ──────────────────────────────────────────────
    let pbDocRef;
    const directSnap = await db.collection('powerBanks')
      .doc(pending.powerBankDocId || pending.powerBankId)
      .get();
    if (directSnap.exists) {
      pbDocRef = directSnap.ref;
    } else {
      const qSnap = await db.collection('powerBanks')
        .where('qrCode', '==', pending.powerBankId)
        .limit(1)
        .get();
      if (qSnap.empty) {
        console.error('[webhook] Power bank introuvable:', pending.powerBankId);
        return json(200, { received: true, action: 'powerbank_not_found' });
      }
      pbDocRef = qSnap.docs[0].ref;
    }

    // ── 8. Transaction Firestore atomique ─────────────────────────────────────
    const rentalRef = db.collection('rentals').doc();

    await db.runTransaction(async (t) => {
      const pbSnap = await t.get(pbDocRef);
      if (!pbSnap.exists) throw new Error('Power bank introuvable dans la transaction');

      const pbState = pbSnap.data().state;
      if (!['disponible', 'en_attente_paiement'].includes(pbState)) {
        // Peut être déjà en location si le client a déjà confirmé — idempotent
        throw Object.assign(new Error(`Power bank état: ${pbState}`), { code: 'ALREADY_RENTED' });
      }

      t.set(rentalRef, {
        userId        : uid,
        qrCode        : pending.powerBankId,
        partnerId     : pending.partnerStartId || null,
        status        : 'en_cours',
        paymentMethod : 'flutterwave',
        paymentRef,
        transactionId,
        fraisXof      : pending.amountXof,
        cautionXof    : pending.cautionXof,
        devise,
        fraisDevise   : pending.fraisDevise   || pending.amountXof,
        cautionDevise : pending.cautionDevise || pending.cautionXof,
        createdByWebhook: true,
        startTime     : admin.firestore.FieldValue.serverTimestamp(),
      });

      t.update(pbDocRef, {
        state        : 'en_location',
        currentUserId: uid,
        lockedBy     : null,
        lockedAt     : null,
        updatedAt    : admin.firestore.FieldValue.serverTimestamp(),
      });

      t.update(db.collection('pendingRentalPayments').doc(paymentRef), {
        status      : 'completed',
        rentalId    : rentalRef.id,
        completedAt : admin.firestore.FieldValue.serverTimestamp(),
        completedBy : 'webhook',
      });
    });

    // ── 9. TransfetMoney ──────────────────────────────────────────────────────
    const userSnap = await db.collection('users').doc(uid).get();
    const user     = userSnap.exists ? userSnap.data() : {};

    if (pending.transtetId) {
      await db.collection('TransfetMoney').doc(pending.transtetId).update({
        status       : 'completed',
        transactionId,
      }).catch(e => console.error('[webhook] Mise à jour TransfetMoney échouée:', e.message));
    }

    await createTranstetEntry(db, {
      type           : 'restitution',
      currency       : devise,
      montantEnvoye  : pending.cautionDevise || pending.cautionXof,
      frais          : 0,
      expediteurId   : ESCROW_UID,
      expediteurEmail: 'escrow@fritok.net',
      expediteurPhoto: '',
      destinataireId : uid,
      destinataireNom: user.username || user.email || uid,
      destinataireTel: user.phone || '',
      status         : 'pending',
    }).catch(e => console.error('[webhook] Écriture restitution échouée (non bloquant):', e.message));

    console.log('[webhook] Location confirmée via webhook — rentalId:', rentalRef.id, 'ref:', paymentRef);
    return json(200, { received: true, action: 'rental_created', rentalId: rentalRef.id });

  } catch (e) {
    if (e.code === 'ALREADY_RENTED') {
      return json(200, { received: true, action: 'already_rented' });
    }
    console.error('[webhook] fatal:', e);
    // Retourner 200 à Flutterwave pour éviter les retries infinis
    // Logger l'erreur pour traitement manuel
    return json(200, { received: true, action: 'error', message: e.message });
  }
};