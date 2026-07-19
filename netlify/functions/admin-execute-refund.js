// netlify/functions/admin-execute-refund.js

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
    return { statusCode: 405, body: JSON.stringify({ error: 'Méthode non autorisée' }) };
  }

  try {
    const decoded = await requireAdmin(event); // remplace le bloc dupliqué

    const { requestId, itemIndex } = JSON.parse(event.body || '{}');
    if (!requestId || typeof itemIndex !== 'number') {
      return { statusCode: 400, body: JSON.stringify({ error: 'requestId ou itemIndex manquant' }) };
    }

    /* ── Transaction : validation + exécution ─────────── */
    const resultat = await db.runTransaction(async (tx) => {
      const reqRef = db.collection('sourcing_requests').doc(requestId);
      const reqSnap = await tx.get(reqRef);
      if (!reqSnap.exists) throw new Error('Demande introuvable');
      const data = reqSnap.data();

      const remboursements = data.remboursementsEnAttente || [];
      const remb = remboursements.find(r => r.itemIndex === itemIndex && r.statut === 'en_attente_validation');
      if (!remb) throw new Error('Remboursement déjà traité ou introuvable');

      const item = data.items[itemIndex];
      if (!item || item.statutItem !== 'introuvable') {
        throw new Error('Cet item n\'est plus marqué comme introuvable — remboursement annulé');
      }

      const userRef   = db.collection('users').doc(data.userId);
      const escrowRef = db.collection('users').doc('escrow_fritok');
      const [userSnap, escrowSnap] = await Promise.all([tx.get(userRef), tx.get(escrowRef)]);
      if (!userSnap.exists) throw new Error('Compte utilisateur introuvable');
      if (!escrowSnap.exists) throw new Error('Compte escrow introuvable');

      const currency = data.devis.currency;
      const montant  = remb.montant;

      const walletUser   = userSnap.data().wallet || {};
      const walletEscrow = escrowSnap.data().wallet || {};
      const soldeEscrowActuel = escrowSnap.data().solde || 0;

      if ((walletEscrow[currency] || 0) < montant) {
        throw new Error('Solde escrow insuffisant pour ce remboursement');
      }

      tx.update(userRef, {
        [`wallet.${currency}`]: (walletUser[currency] || 0) + montant,
      });

      tx.update(escrowRef, {
        [`wallet.${currency}`]: (walletEscrow[currency] || 0) - montant,
        solde: soldeEscrowActuel - montant,
      });

      tx.set(db.collection('TransfetMoney').doc(), {
        type: 'remboursement_sourcing',
        requestId, itemIndex,
        montant, currency,
        de: 'escrow_fritok', vers: data.userId,
        executePar: decoded.uid,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      const nouveauxRemb = remboursements.map(r =>
        r.itemIndex === itemIndex
          ? { ...r, statut: 'execute', executeLe: new Date().toISOString(), executePar: decoded.uid }
          : r
      );
      const aEnAttente = nouveauxRemb.some(r => r.statut === 'en_attente_validation');
      const nouveauTotal = data.devis.total - montant;

      tx.update(reqRef, {
        remboursementsEnAttente: nouveauxRemb,
        aRemboursementEnAttente: aEnAttente,
        'devis.total': nouveauTotal,
        'devis.montantRembourse': (data.devis.montantRembourse || 0) + montant,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return { montant, currency, nouveauTotal };
    });

    return { statusCode: 200, body: JSON.stringify({ success: true, ...resultat }) };
  } catch (e) {
    console.error('admin-execute-refund:', e);
    return { statusCode: e.statusCode || 400, body: JSON.stringify({ error: e.message }) };
  }
};