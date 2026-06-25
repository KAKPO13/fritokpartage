// netlify/functions/createWalletRental.js
// ─────────────────────────────────────────────────────────────────────────────
//  Flow de location par Wallet Fritok — ENTIÈREMENT côté serveur.
//
//  Remplace le flow client dans pages/app.js (confirmRent → wallet).
//  Le client n'envoie QUE { powerBankId, devise }.
//  Toute la logique financière est ici : tarifs, débit, escrow, transtet.
//
//  POST body : { powerBankId: string, devise?: 'XOF'|'GHS'|'NGN' }
//  Réponse   : { rentalId: string, fraisDevise: number, cautionDevise: number, devise: string }
// ─────────────────────────────────────────────────────────────────────────────

const admin = require('firebase-admin');
const { createTranstetEntry } = require('./_transtet');
const { ok, err, handleOptions, isAllowedOrigin } = require('./_cors');
const { ESCROW_UID, SUPPORTED_CURRENCIES, MAX_ACTIVE_RENTALS } = require('./_constants');

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

exports.handler = async (event) => {
  const origin = event.headers['origin'] || event.headers['Origin'] || '';

  if (event.httpMethod === 'OPTIONS') return handleOptions(origin);
  if (event.httpMethod !== 'POST')    return err(405, 'Method not allowed', origin);

  // ── Vérification origine ───────────────────────────────────────────────────
  if (!isAllowedOrigin(origin)) {
    console.warn('[createWalletRental] Origine non autorisée :', origin);
    return err(403, 'Origine non autorisée', origin);
  }

  try {
    // ── 1. Vérification token Firebase ────────────────────────────────────────
    const authHeader = event.headers['authorization'] || event.headers['Authorization'] || '';
    const idToken    = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!idToken) return err(401, 'Token manquant', origin);

    let decoded;
    try { decoded = await auth.verifyIdToken(idToken); }
    catch (e) { return err(401, `Token invalide : ${e.message}`, origin); }
    const uid = decoded.uid;

    // ── 2. Profil utilisateur ─────────────────────────────────────────────────
    const userSnap = await db.collection('users').doc(uid).get();
    if (!userSnap.exists) return err(404, 'Utilisateur introuvable', origin);
    const user = userSnap.data();

    // ── 3. Vérifications métier ───────────────────────────────────────────────
    if (user.phoneVerified !== true) {
      return err(403, 'Numéro de téléphone non vérifié. Vérifie ton numéro avant de louer.', origin);
    }
    // Décommenter si KYC obligatoire :
    // if (user.kyc_status !== 'verified') {
    //   return err(403, 'Vérification KYC requise.', origin);
    // }

    // ── 4. Body — uniquement powerBankId et devise acceptés du client ─────────
    let body;
    try { body = JSON.parse(event.body || '{}'); }
    catch { return err(400, 'Body JSON invalide', origin); }

    const { powerBankId, devise = user.currency || 'XOF' } = body;

    if (!powerBankId) return err(400, 'powerBankId requis', origin);
    if (!SUPPORTED_CURRENCIES.includes(devise)) {
      return err(400, `Devise non supportée : ${devise}`, origin);
    }

    // ── 5. Tarifs officiels depuis Firestore ──────────────────────────────────
    const tarifsSnap = await db.collection('config').doc('tarifs').get();
    if (!tarifsSnap.exists) {
      console.error('[createWalletRental] config/tarifs manquant');
      return err(500, 'Configuration tarifaire indisponible', origin);
    }
    const { fraisXof: FRAIS_XOF = 300, cautionXof: CAUTION_XOF = 200 } = tarifsSnap.data();

    // ── 6. Taux de change depuis Firestore ────────────────────────────────────
    let fraisDevise   = FRAIS_XOF;
    let cautionDevise = CAUTION_XOF;
    let totalDevise   = FRAIS_XOF + CAUTION_XOF;

    if (devise !== 'XOF') {
      const ratesSnap = await db.collection('config').doc('exchangeRates').get();
      if (!ratesSnap.exists || !ratesSnap.data()[devise]) {
        return err(422, `Taux de change indisponible pour ${devise}`, origin);
      }
      const rate  = Number(ratesSnap.data()[devise]);
      fraisDevise   = Math.round(FRAIS_XOF   * rate * 100) / 100;
      cautionDevise = Math.round(CAUTION_XOF * rate * 100) / 100;
      totalDevise   = Math.round((FRAIS_XOF + CAUTION_XOF) * rate * 100) / 100;
    }

    // ── 7. Vérification solde wallet côté serveur ─────────────────────────────
    const walletBalance = Number(user.wallet?.[devise] ?? 0);
    if (walletBalance < totalDevise) {
      return err(402, `Solde ${devise} insuffisant. Requis : ${totalDevise} · Disponible : ${walletBalance}`, origin);
    }

    // ── 8. Rate limiting : max locations actives simultanées par uid ──────────
    const activeSnap = await db.collection('rentals')
      .where('userId', '==', uid)
      .where('status', '==', 'en_cours')
      .limit(MAX_ACTIVE_RENTALS)
      .get();
    if (activeSnap.size >= MAX_ACTIVE_RENTALS) {
      return err(429, `Limite atteinte : ${MAX_ACTIVE_RENTALS} locations actives simultanées maximum.`, origin);
    }

    // ── 9. Trouver le power bank ──────────────────────────────────────────────
    // On fait un pre-fetch hors transaction pour avoir l'ID du document
    let pbDocRef = null;
    const directSnap = await db.collection('powerBanks').doc(powerBankId).get();
    if (directSnap.exists) {
      pbDocRef = directSnap.ref;
    } else {
      const qSnap = await db.collection('powerBanks')
        .where('qrCode', '==', powerBankId)
        .limit(1)
        .get();
      if (qSnap.empty) return err(404, `Power bank "${powerBankId}" introuvable`, origin);
      pbDocRef = qSnap.docs[0].ref;
    }

    // ── 10. Transaction Firestore atomique ────────────────────────────────────
    //  Lit et modifie en une seule opération atomique :
    //  - powerBank   : vérifie 'disponible' → passe à 'en_location'
    //  - user wallet : débite le montant total
    //  - escrow      : crédite frais + caution
    //  - rental      : crée le document
    // ─────────────────────────────────────────────────────────────────────────
    const rentalRef  = db.collection('rentals').doc();
    const userRef    = db.collection('users').doc(uid);
    const escrowRef  = db.collection('users').doc(ESCROW_UID);

    let pbData;

    await db.runTransaction(async (t) => {
      // Lecture atomique des 3 documents
      const [pbSnap, userSnap2, escrowSnap] = await Promise.all([
        t.get(pbDocRef),
        t.get(userRef),
        t.get(escrowRef),
      ]);

      // Vérifier état power bank
      if (!pbSnap.exists) throw Object.assign(new Error('Power bank introuvable'), { code: 404 });
      pbData = pbSnap.data();
      if (pbData.state !== 'disponible') {
        throw Object.assign(
          new Error(`Power bank non disponible (état actuel : ${pbData.state})`),
          { code: 409 }
        );
      }

      // Re-vérifier le solde dans la transaction (évite les doubles dépenses simultanées)
      const currentBalance = Number(userSnap2.data()?.wallet?.[devise] ?? 0);
      if (currentBalance < totalDevise) {
        throw Object.assign(
          new Error(`Solde insuffisant dans la transaction (${currentBalance} < ${totalDevise})`),
          { code: 402 }
        );
      }

      // Récupérer et mettre à jour l'Escrow (read-modify-write sur les maps)
      const escrowData    = escrowSnap.exists ? escrowSnap.data() : {};
      const oldTotalCaution = typeof escrowData.totalCaution === 'object' ? escrowData.totalCaution : {};
      const oldTotalFrais   = typeof escrowData.totalFrais   === 'object' ? escrowData.totalFrais   : {};

      const newTotalCaution = {
        XOF: Number(oldTotalCaution.XOF ?? 0),
        GHS: Number(oldTotalCaution.GHS ?? 0),
        NGN: Number(oldTotalCaution.NGN ?? 0),
        [devise]: Number(oldTotalCaution[devise] ?? 0) + cautionDevise,
      };
      const newTotalFrais = {
        XOF: Number(oldTotalFrais.XOF ?? 0),
        GHS: Number(oldTotalFrais.GHS ?? 0),
        NGN: Number(oldTotalFrais.NGN ?? 0),
        [devise]: Number(oldTotalFrais[devise] ?? 0) + fraisDevise,
      };

      // Écriture 1 : power bank → en_location
      t.update(pbDocRef, {
        state        : 'en_location',
        currentUserId: uid,
        updatedAt    : admin.firestore.FieldValue.serverTimestamp(),
      });

      // Écriture 2 : débit wallet utilisateur
      t.update(userRef, {
        [`wallet.${devise}`]: admin.firestore.FieldValue.increment(-totalDevise),
      });

      // Écriture 3 : crédit Escrow (setDoc merge pour gérer le premier accès)
      t.set(escrowRef, {
        totalCaution: newTotalCaution,
        totalFrais  : newTotalFrais,
        updatedAt   : admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      // Écriture 4 : créer le rental
      t.set(rentalRef, {
        userId        : uid,
        qrCode        : pbData.qrCode || pbDocRef.id,
        partnerId     : pbData.currentPartnerId || null,
        status        : 'en_cours',
        paymentMethod : 'wallet',
        fraisXof      : FRAIS_XOF,
        cautionXof    : CAUTION_XOF,
        devise,
        fraisDevise,
        cautionDevise,
        transtetWritten: false, // sera mis à true après écriture des TransfetMoney
        startTime     : admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    // ── 11. Profil partenaire ─────────────────────────────────────────────────
    const partnerId = pbData.currentPartnerId || null;
    let partnerNom  = 'Partenaire Fritok';
    let partnerTel  = '';
    if (partnerId) {
      const pSnap = await db.collection('users').doc(partnerId).get();
      if (pSnap.exists) {
        partnerNom = pSnap.data().nomBoutique || pSnap.data().username || partnerNom;
        partnerTel = pSnap.data().phone || '';
      }
    }

    // ── 12. Écriture des TransfetMoney (hors transaction — pas critique) ──────
    //  Si cette étape échoue, le rental existe déjà et est valide.
    //  Une Function de réconciliation peut retrouver les rentals sans TransfetMoney.
    try {
      await Promise.all([
        // Frais de location → partenaire
        createTranstetEntry(db, {
          type           : 'rental',
          currency       : devise,
          montantEnvoye  : fraisDevise,
          frais          : 0,
          expediteurId   : uid,
          expediteurEmail: user.email || decoded.email || '',
          expediteurPhoto: user.photoUrl || '',
          destinataireId : partnerId || 'fritok-system',
          destinataireNom: partnerNom,
          destinataireTel: partnerTel,
          status         : 'completed',
        }),
        // Caution → Escrow
        createTranstetEntry(db, {
          type           : 'caution',
          currency       : devise,
          montantEnvoye  : cautionDevise,
          frais          : 0,
          expediteurId   : uid,
          expediteurEmail: user.email || decoded.email || '',
          expediteurPhoto: user.photoUrl || '',
          destinataireId : ESCROW_UID,
          destinataireNom: 'Fritok Escrow',
          destinataireTel: '',
          status         : 'completed',
        }),
        // Restitution future (pending) → utilisateur
        createTranstetEntry(db, {
          type           : 'restitution',
          currency       : devise,
          montantEnvoye  : cautionDevise,
          frais          : 0,
          expediteurId   : ESCROW_UID,
          expediteurEmail: 'escrow@fritok.net',
          expediteurPhoto: '',
          destinataireId : uid,
          destinataireNom: user.username || user.email || uid,
          destinataireTel: user.phone || '',
          status         : 'pending',
        }),
      ]);

      // Marquer les TransfetMoney comme écrites sur le rental
      await rentalRef.update({ transtetWritten: true });

    } catch (txErr) {
      // Non bloquant — le rental est valide, les TransfetMoney seront réconciliées
      console.error('[createWalletRental] Erreur écriture TransfetMoney (non bloquant):', txErr.message);
    }

    return ok({
      rentalId    : rentalRef.id,
      qrCode      : pbData.qrCode || pbDocRef.id,
      devise,
      fraisDevise,
      cautionDevise,
      totalDevise,
      batteryLevel: pbData.batteryLevel ?? null,
    }, origin);

  } catch (e) {
    if (e.code === 402) return err(402, e.message, origin);
    if (e.code === 404) return err(404, e.message, origin);
    if (e.code === 409) return err(409, e.message, origin);
    console.error('[createWalletRental] fatal:', e);
    return err(500, 'Erreur interne', origin);
  }
};
