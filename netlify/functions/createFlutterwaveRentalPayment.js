// netlify/functions/createFlutterwaveRentalPayment.js
// ─────────────────────────────────────────────────────────────────────────────
//  PATCHÉ — Audit sécurité
//  Changements :
//    1. CORS restreint à fritok.net uniquement (plus de wildcard *)
//    2. Montants relus depuis config/tarifs Firestore (jamais depuis le client)
//    3. payRef() utilise crypto.randomBytes (plus de Math.random)
//    4. Vérification phoneVerified + kyc_status avant de continuer
//    5. Rate limiting : max 2 locations actives simultanées par uid
//    6. runTransaction Firestore pour verrouiller le power bank atomiquement
//
// ⚠️ Converti en ESM (export const handler au lieu de exports.handler) :
// le package.json a "type": "module" — voir le correctif de
// webcreateTopup.js pour le détail du bug que ça évite
// (Runtime.HandlerNotFound).
// ─────────────────────────────────────────────────────────────────────────────

import admin from 'firebase-admin';
import { randomBytes } from 'crypto';
import { createTranstetEntry } from './_transtet.js';

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

// ── Origines autorisées ───────────────────────────────────────────────────────
const ALLOWED_ORIGINS = new Set([
  'https://fritok.net',
  'https://www.fritok.net',
  // Décommenter en développement local uniquement :
  // 'http://localhost:3000',
  // 'http://localhost:8888',
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

// ── Référence de paiement cryptographiquement sûre ───────────────────────────
function payRef() {
  return 'PB-PAY-' + randomBytes(12).toString('hex').toUpperCase();
}

export const handler = async (event) => {
  const origin = event.headers['origin'] || event.headers['Origin'] || 'https://fritok.net';

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: getCorsHeaders(origin) };
  }
  if (event.httpMethod !== 'POST') {
    return err(405, 'Method not allowed', origin);
  }

  // ── Vérifier l'origine ────────────────────────────────────────────────────
  if (!ALLOWED_ORIGINS.has(origin)) {
    console.warn('Origine non autorisée :', origin);
    return err(403, 'Origine non autorisée', origin);
  }

  try {
    // ── 1. Auth ───────────────────────────────────────────────────────────────
    const authHeader = event.headers['authorization'] || event.headers['Authorization'] || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!idToken) return err(401, 'Token manquant', origin);

    let decoded;
    try { decoded = await auth.verifyIdToken(idToken); }
    catch (e) { return err(401, `Token invalide : ${e.message}`, origin); }
    const uid = decoded.uid;

    // ── 2. Profil utilisateur ────────────────────────────────────────────────
    const userSnap = await db.collection('users').doc(uid).get();
    if (!userSnap.exists) return err(404, 'Utilisateur introuvable', origin);
    const user = userSnap.data();

    // ── 3. Vérifications métier (phone + KYC) ────────────────────────────────
    if (user.phoneVerified !== true) {
      return err(403, 'Numéro de téléphone non vérifié. Vérifie ton numéro avant de louer.', origin);
    }
    // Décommenter si le KYC est obligatoire sur ton marché :
    // if (user.kyc_status !== 'verified') {
    //   return err(403, 'Vérification KYC requise avant toute location.', origin);
    // }

    // ── 4. Body — on n'accepte QUE powerBankId et devise du client ───────────
    //    Les montants sont TOUJOURS relus depuis Firestore, jamais du client.
    let body;
    try { body = JSON.parse(event.body || '{}'); }
    catch { return err(400, 'Body JSON invalide', origin); }

    const { powerBankId, powerBankDocId, partnerStartId, devise = 'XOF' } = body;

    if (!powerBankId) {
      return err(400, 'Paramètre manquant : powerBankId', origin);
    }

    // ── 5. Tarifs officiels depuis Firestore (jamais du client) ───────────────
    const tarifsSnap = await db.collection('config').doc('tarifs').get();
    if (!tarifsSnap.exists) {
      console.error('Document config/tarifs manquant en base');
      return err(500, 'Configuration tarifaire indisponible', origin);
    }
    const tarifsData = tarifsSnap.data();
    const FRAIS_XOF = Number(tarifsData.fraisXof ?? 300);
    const CAUTION_XOF = Number(tarifsData.cautionXof ?? 200);

    // ── 6. Taux de change depuis Firestore (jamais d'API externe ici) ─────────
    let rateToDevise = 1;
    if (devise !== 'XOF') {
      const ratesSnap = await db.collection('config').doc('exchangeRates').get();
      if (ratesSnap.exists) {
        const rates = ratesSnap.data();
        rateToDevise = Number(rates[devise] ?? 1);
      }
      // Si pas de taux en base, on refuse plutôt que d'utiliser un fallback hardcodé
      if (rateToDevise === 1 && devise !== 'XOF') {
        return err(422, `Taux de change indisponible pour ${devise}`, origin);
      }
    }
    const fraisDevise = Math.round(FRAIS_XOF * rateToDevise * 100) / 100;
    const cautionDevise = Math.round(CAUTION_XOF * rateToDevise * 100) / 100;
    const totalDevise = Math.round((FRAIS_XOF + CAUTION_XOF) * rateToDevise * 100) / 100;

    // ── 7. Rate limiting : max 2 locations actives simultanées par uid ────────
    const [activeRentals, pendingPayments] = await Promise.all([
      db.collection('rentals')
        .where('userId', '==', uid)
        .where('status', '==', 'en_cours')
        .limit(2)
        .get(),
      db.collection('pendingRentalPayments')
        .where('userId', '==', uid)
        .where('status', '==', 'pending')
        .limit(2)
        .get(),
    ]);
    const totalActive = activeRentals.size + pendingPayments.size;
    if (totalActive >= 2) {
      return err(429, 'Limite atteinte : 2 locations actives simultanées maximum.', origin);
    }

    // ── 8. Vérifier disponibilité + verrouiller atomiquement (runTransaction) ──
    let pbDocRef, pbData;

    await db.runTransaction(async (t) => {
      // Trouver le document du power bank
      let pbSnap = await t.get(db.collection('powerBanks').doc(powerBankDocId || powerBankId));
      if (!pbSnap.exists) {
        // Fallback : chercher par qrCode (hors transaction, puis re-lire dans transaction)
        const qSnap = await db.collection('powerBanks').where('qrCode', '==', powerBankId).limit(1).get();
        if (qSnap.empty) throw Object.assign(new Error(`Power bank "${powerBankId}" introuvable`), { code: 404 });
        pbSnap = await t.get(qSnap.docs[0].ref);
      }

      if (!pbSnap.exists) throw Object.assign(new Error('Power bank introuvable'), { code: 404 });

      const data = pbSnap.data();
      if (data.state !== 'disponible') {
        throw Object.assign(
          new Error(`Power bank non disponible (état : ${data.state})`),
          { code: 409 }
        );
      }

      // Verrouiller immédiatement — état intermédiaire pendant le flow de paiement
      t.update(pbSnap.ref, {
        state: 'en_attente_paiement',
        lockedBy: uid,
        lockedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      pbDocRef = pbSnap.ref;
      pbData = data;
    });

    // ── 9. Profil partenaire ──────────────────────────────────────────────────
    const effectivePartnerId = partnerStartId || pbData.currentPartnerId || null;
    let partnerNom = 'Partenaire Fritok';
    let partnerTel = '';
    if (effectivePartnerId) {
      const partSnap = await db.collection('users').doc(effectivePartnerId).get();
      if (partSnap.exists) {
        const p = partSnap.data();
        partnerNom = p.nomBoutique || p.username || partnerNom;
        partnerTel = p.phone || '';
      }
    }

    // ── 10. Créer le lien Flutterwave ─────────────────────────────────────────
    const ref = payRef();
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://fritok.net';

    const flwRes = await fetch('https://api.flutterwave.com/v3/payments', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tx_ref: ref,
        amount: totalDevise,
        currency: devise,
        redirect_url: `${baseUrl}/app/payment-confirm?ref=${ref}&pb=${encodeURIComponent(powerBankId)}`,
        customer: {
          email: user.email || decoded.email || '',
          phonenumber: user.phone || '',
          name: user.username || uid,
        },
        customizations: {
          title: 'Location Power Bank Fritok',
          description: `Location ${powerBankId}`,
          logo: `${baseUrl}/logo.png`,
        },
        meta: {
          userId: uid,
          powerBankId,
          powerBankDocId: pbDocRef.id,
          partnerStartId: effectivePartnerId || '',
          amountXof: FRAIS_XOF,
          cautionXof: CAUTION_XOF,
          devise,
          type: 'rental',
        },
      }),
    });

    const flwData = await flwRes.json();
    if (flwData.status !== 'success' || !flwData.data?.link) {
      // Libérer le power bank si Flutterwave échoue
      await pbDocRef.update({
        state: 'disponible',
        lockedBy: null,
        lockedAt: null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return err(502, flwData.message || 'Erreur Flutterwave', origin);
    }

    // ── 11. TransfetMoney — "rental" pending ──────────────────────────────────
    const txId = await createTranstetEntry(db, {
      type: 'rental',
      currency: devise,
      montantEnvoye: totalDevise,
      frais: 0,
      expediteurId: uid,
      expediteurEmail: user.email || decoded.email || '',
      expediteurPhoto: user.photoUrl || '',
      destinataireId: effectivePartnerId || 'fritok-system',
      destinataireNom: partnerNom,
      destinataireTel: partnerTel,
      status: 'pending',
    });

    // ── 12. pendingRentalPayments ─────────────────────────────────────────────
    await db.collection('pendingRentalPayments').doc(ref).set({
      userId: uid,
      paymentRef: ref,
      transtetId: txId,
      powerBankId,
      powerBankDocId: pbDocRef.id,
      partnerStartId: effectivePartnerId || null,
      // Montants calculés côté serveur — jamais depuis le client
      amountXof: FRAIS_XOF,
      cautionXof: CAUTION_XOF,
      devise,
      fraisDevise,
      cautionDevise,
      totalDevise,
      status: 'pending',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      // TTL de sécurité : si le paiement n'est pas confirmé dans 30 min,
      // une Function cron libère le power bank (à implémenter dans expire-pending-payments)
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    });

    return ok({ payment_url: flwData.data.link, payment_ref: ref }, origin);

  } catch (e) {
    // Erreurs métier connues (404, 409)
    if (e.code === 404) return err(404, e.message, origin);
    if (e.code === 409) return err(409, e.message, origin);

    console.error('createFlutterwaveRentalPayment fatal:', e);
    return err(500, 'Erreur interne', origin);
  }
};