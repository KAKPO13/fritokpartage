// netlify/functions/verifyFlutterwaveRentalPayment.js
// ─────────────────────────────────────────────────────────────────────────────
//  PATCHÉ — Audit sécurité
//  Changements :
//    1. CORS restreint via _cors.js
//    2. Vérification montant NaN-safe + tolérance par devise
//    3. State check accepte 'en_attente_paiement' + vérifie lockedBy === uid
//    4. Vérification tx.meta.userId === uid (prévient réutilisation de tx tierce)
//    5. expediteurId ESCROW_UID (cohérence avec le reste du codebase)
// ─────────────────────────────────────────────────────────────────────────────

const admin = require('firebase-admin');
const { createTranstetEntry } = require('./_transtet');
const { ok, err, handleOptions, isAllowedOrigin } = require('./_cors.cjs');
import constants from '../_constants.cjs';
const { ESCROW_UID } = constants;

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId  : process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey : (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    }),
  });
}

const db   = admin.firestore();
const auth = admin.auth();

// Tolérance de vérification montant selon la devise
// XOF : entier, tolérance 1 FCFA
// GHS/NGN : décimaux, tolérance 0.01
const AMOUNT_TOLERANCE = { XOF: 1, GHS: 0.01, NGN: 0.01 };

exports.handler = async (event) => {
  const origin = event.headers['origin'] || event.headers['Origin'] || '';

  if (event.httpMethod === 'OPTIONS') return handleOptions(origin);
  if (event.httpMethod !== 'POST')    return err(405, 'Method not allowed', origin);

  if (!isAllowedOrigin(origin)) {
    console.warn('[verifyFLW] Origine non autorisée :', origin);
    return err(403, 'Origine non autorisée', origin);
  }

  try {
    // ── 1. Auth ───────────────────────────────────────────────────────────────
    const authHeader = event.headers['authorization'] || event.headers['Authorization'] || '';
    const idToken    = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!idToken) return err(401, 'Token manquant', origin);

    let decoded;
    try { decoded = await auth.verifyIdToken(idToken); }
    catch (e) { return err(401, `Token invalide : ${e.message}`, origin); }
    const uid = decoded.uid;

    // ── 2. Body ───────────────────────────────────────────────────────────────
    let body;
    try { body = JSON.parse(event.body || '{}'); }
    catch { return err(400, 'Body invalide', origin); }

    const { paymentRef, transactionId } = body;
    if (!paymentRef || !transactionId) {
      return err(400, 'paymentRef et transactionId requis', origin);
    }

    // ── 3. Récupérer la pré-commande en premier ───────────────────────────────
    //  On vérifie l'ownership AVANT d'appeler l'API Flutterwave
    //  pour éviter des appels API inutiles sur des refs invalides
    const pendingSnap = await db.collection('pendingRentalPayments').doc(paymentRef).get();
    if (!pendingSnap.exists) {
      return ok({ verified: false, error: 'Référence de transaction introuvable' }, origin);
    }
    const pending = pendingSnap.data();

    if (pending.userId !== uid) {
      return err(403, 'Accès non autorisé', origin);
    }

    // ── 4. Idempotence — déjà traité ? ────────────────────────────────────────
    if (pending.status === 'completed' && pending.rentalId) {
      return ok({ verified: true, rentalId: pending.rentalId }, origin);
    }

    // ── 5. Vérification Flutterwave côté serveur ──────────────────────────────
    const flwRes = await fetch(
      `https://api.flutterwave.com/v3/transactions/${encodeURIComponent(transactionId)}/verify`,
      { headers: { Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}` } },
    );
    const flwData = await flwRes.json();

    if (flwData.status !== 'success') {
      return ok({ verified: false, error: flwData.message || 'Vérification FLW échouée' }, origin);
    }
    const tx = flwData.data;

    // ── 6. Contrôles de sécurité sur la transaction FLW ──────────────────────

    // 6a. Référence cohérente
    if (tx.tx_ref !== paymentRef) {
      return ok({ verified: false, error: 'Référence transaction incorrecte' }, origin);
    }

    // 6b. Statut du paiement
    if (tx.status !== 'successful') {
      return ok({ verified: false, error: `Statut transaction FLW : ${tx.status}` }, origin);
    }

    // 6c. Le paiement appartient bien à cet utilisateur
    //     (empêche la réutilisation d'une transaction légitime d'un autre compte)
    const metaUserId = tx.meta?.userId || tx.meta?.metaData?.userId;
    if (metaUserId && metaUserId !== uid) {
      console.error(`[verifyFLW] userId mismatch: tx.meta.userId=${metaUserId} uid=${uid}`);
      return ok({ verified: false, error: 'Transaction non associée à ce compte' }, origin);
    }

    // 6d. Vérification montant — NaN-safe, tolérance par devise
    const devise = pending.devise || 'XOF';
    const expectedAmount = devise === 'XOF'
      ? (pending.amountXof   ?? NaN) + (pending.cautionXof   ?? NaN)
      : (pending.fraisDevise ?? NaN) + (pending.cautionDevise ?? NaN);

    if (!isFinite(expectedAmount)) {
      console.error('[verifyFLW] Montant attendu invalide (NaN/Infinity) pour paymentRef:', paymentRef);
      return ok({ verified: false, error: 'Montant attendu invalide — contacter le support' }, origin);
    }

    const tolerance = AMOUNT_TOLERANCE[devise] ?? 1;
    if (Math.abs(tx.amount - expectedAmount) > tolerance) {
      console.error(`[verifyFLW] Amount mismatch: expected=${expectedAmount} got=${tx.amount} devise=${devise}`);
      return ok({ verified: false, error: 'Montant de la transaction incorrect' }, origin);
    }

    // ── 7. Trouver le document powerBanks ─────────────────────────────────────
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
      if (qSnap.empty) return ok({ verified: false, error: 'Power bank introuvable' }, origin);
      pbDocRef = qSnap.docs[0].ref;
    }

    // ── 8. Profils utilisateur + partenaire ───────────────────────────────────
    const userSnap = await db.collection('users').doc(uid).get();
    const user     = userSnap.exists ? userSnap.data() : {};

    let partnerNom = 'Partenaire Fritok';
    let partnerTel = '';
    if (pending.partnerStartId) {
      const pSnap = await db.collection('users').doc(pending.partnerStartId).get();
      if (pSnap.exists) {
        partnerNom = pSnap.data().nomBoutique || pSnap.data().username || partnerNom;
        partnerTel = pSnap.data().phone || '';
      }
    }

    // ── 9. Transaction Firestore atomique ─────────────────────────────────────
    //  Vérifie l'état du power bank, crée le rental, met à jour le PB,
    //  clôture le pendingRentalPayment — tout en une seule opération.
    const rentalRef = db.collection('rentals').doc();

    await db.runTransaction(async (t) => {
      const pbSnap = await t.get(pbDocRef);

      if (!pbSnap.exists) {
        throw Object.assign(new Error('Power bank introuvable dans la transaction'), { code: 404 });
      }

      const pbState = pbSnap.data().state;

      // Accepte 'disponible' (flow sans verrouillage préalable)
      // et 'en_attente_paiement' (flow avec verrouillage via createFlutterwaveRentalPayment)
      if (!['disponible', 'en_attente_paiement'].includes(pbState)) {
        throw Object.assign(
          new Error(`Power bank non disponible (état : ${pbState})`),
          { code: 409 }
        );
      }

      // Si verrouillé, vérifier que c'est bien par cet utilisateur
      if (pbState === 'en_attente_paiement' && pbSnap.data().lockedBy !== uid) {
        throw Object.assign(
          new Error('Power bank verrouillé par un autre utilisateur'),
          { code: 409 }
        );
      }

      // Créer le rental
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
        startTime     : admin.firestore.FieldValue.serverTimestamp(),
      });

      // Mettre à jour le power bank
      t.update(pbDocRef, {
        state        : 'en_location',
        currentUserId: uid,
        lockedBy     : null,
        lockedAt     : null,
        updatedAt    : admin.firestore.FieldValue.serverTimestamp(),
      });

      // Clôturer la pré-commande
      t.update(
        db.collection('pendingRentalPayments').doc(paymentRef),
        {
          status     : 'completed',
          rentalId   : rentalRef.id,
          completedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
      );
    });

    // ── 10. TransfetMoney "rental" → completed ────────────────────────────────
    if (pending.transtetId) {
      await db.collection('TransfetMoney').doc(pending.transtetId).update({
        status       : 'completed',
        transactionId,
      }).catch(e => console.error('[verifyFLW] Mise à jour TransfetMoney rental échouée (non bloquant):', e.message));
    }

    // ── 11. TransfetMoney "restitution" pending ───────────────────────────────
    //  expediteurId = ESCROW_UID (cohérence avec createWalletRental et doReturn)
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
    }).catch(e => console.error('[verifyFLW] Écriture TransfetMoney restitution échouée (non bloquant):', e.message));

    return ok({ verified: true, rentalId: rentalRef.id }, origin);

  } catch (e) {
    if (e.code === 404) return err(404, e.message, origin);
    if (e.code === 409) return err(409, e.message, origin);
    console.error('[verifyFlutterwaveRentalPayment] fatal:', e);
    return err(500, 'Erreur interne', origin);
  }
};