// netlify/functions/verify-b2b-supplier.js
//
// Remplace verify-b2b-account.js (v1, abandonné — le statut B2B se porte
// sur le VENDEUR/boutique, pas sur le client acheteur, voir
// firestore-rules-b2b-final.js).
//
// Appelée depuis le back-office admin FriTok après examen manuel des
// documents (registre de commerce / NIF) d'un compte Vendeur ayant déposé
// b2bSupplier.status = 'pending'. C'est ICI, et seulement ici, que la
// grille tarifaire (pricingTiers), le MOQ final et les conditions de
// paiement sont fixés — jamais auto-déclarés par le vendeur lui-même
// (voir isValidB2BSupplierClientWrite() dans les règles, qui exclut ces
// champs de ce que le client peut écrire).

import admin from 'firebase-admin';
import { requireAdmin } from './_adminShared.js';

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
  });
}
const db = admin.firestore();

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  try {
    const decoded = await requireAdmin(event); // remplace le TODO — vérifie Bearer token + claim admin

    const { uid, decision, pricingTiers, moq, paymentTerms } = JSON.parse(event.body || '{}');

    if (!uid || !['verified', 'rejected'].includes(decision)) {
      return { statusCode: 400, body: JSON.stringify({ error: 'uid et decision (verified|rejected) requis' }) };
    }

    const userRef = db.collection('users').doc(uid);
    const snap = await userRef.get();
    if (!snap.exists) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Utilisateur introuvable' }) };
    }

    const data = snap.data();
    if (data.role !== 'Vendeur') {
      return { statusCode: 409, body: JSON.stringify({ error: 'Seul un compte Vendeur peut être fournisseur B2B' }) };
    }

    const current = data.b2bSupplier;
    if (!current || current.status !== 'pending') {
      return { statusCode: 409, body: JSON.stringify({ error: 'Aucune demande B2B en attente pour ce compte' }) };
    }

    const update = {
      'b2bSupplier.status':     decision,
      'b2bSupplier.verifiedAt': admin.firestore.FieldValue.serverTimestamp(),
      'b2bSupplier.verifiedPar': decoded.uid, // traçabilité — qui a validé/rejeté
    };

    const publicRef = db.collection('b2b_suppliers_public').doc(uid);

    if (decision === 'verified') {
      if (!Array.isArray(pricingTiers) || pricingTiers.length === 0) {
        return { statusCode: 400, body: JSON.stringify({ error: 'pricingTiers requis pour valider (au moins un palier)' }) };
      }
      const tiersOk = pricingTiers.every(t =>
        typeof t.minQty === 'number' && t.minQty > 0 &&
        (t.maxQty === null || (typeof t.maxQty === 'number' && t.maxQty > t.minQty)) &&
        typeof t.unitPriceFCFA === 'number' && t.unitPriceFCFA > 0
      );
      if (!tiersOk) {
        return { statusCode: 400, body: JSON.stringify({ error: 'pricingTiers invalide (minQty/maxQty/unitPriceFCFA)' }) };
      }
      if (!Number.isFinite(moq) || moq <= 0) {
        return { statusCode: 400, body: JSON.stringify({ error: 'moq requis (nombre positif)' }) };
      }
      const validTerms = ['comptant', 'net30', 'net60'];
      if (!Array.isArray(paymentTerms) || paymentTerms.length === 0 || !paymentTerms.every(t => validTerms.includes(t))) {
        return { statusCode: 400, body: JSON.stringify({ error: 'paymentTerms requis, parmi comptant/net30/net60' }) };
      }

      update['b2bSupplier.pricingTiers'] = pricingTiers;
      update['b2bSupplier.moq']          = moq;
      update['b2bSupplier.paymentTerms'] = paymentTerms;

      await publicRef.set({
        sellerId:      uid,
        nomBoutique:   data.nomBoutique || data.username || 'Boutique',
        ville:         data.location?.address || data.adresse || '',
        accountType:   current.accountType,
        filiere:       current.filiere,
        pricingTiers,
        moq,
        paymentTerms,
        certifications: current.accountType === 'usine_pia' ? ['PIA référencé'] : [],
        verifiedAt:    admin.firestore.FieldValue.serverTimestamp(),
      });
    } else {
      await publicRef.delete().catch(() => {});
    }

    await userRef.update(update);

    return { statusCode: 200, body: JSON.stringify({ ok: true, uid, decision }) };
  } catch (e) {
    console.error('verify-b2b-supplier:', e);
    return { statusCode: e.statusCode || 500, body: JSON.stringify({ error: e.message || 'Erreur serveur' }) };
  }
};