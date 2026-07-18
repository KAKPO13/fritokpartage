// netlify/functions/pay-sourcing-request.js

import admin from 'firebase-admin';

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Méthode non autorisée' }) };
  }

  try {
    /* ── 1. Authentification ────────────────────────────── */
    const idToken = event.headers.authorization?.split('Bearer ')[1];
    if (!idToken) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Non authentifié' }) };
    }
    const decoded = await admin.auth().verifyIdToken(idToken);
    const uid = decoded.uid;

    const { requestId } = JSON.parse(event.body || '{}');
    if (!requestId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'requestId manquant' }) };
    }

    /* ── 2. Transaction unique : validation + débit + crédit
       escrow + écriture historique + changement de statut.
       Tout ou rien — même pattern que la restitution de caution
       power bank (read-modify-write dans une transaction).      */
    const resultat = await db.runTransaction(async (tx) => {
      const reqRef = db.collection('sourcing_requests').doc(requestId);
      const reqSnap = await tx.get(reqRef);
      if (!reqSnap.exists) throw new Error('Demande introuvable');

      const data = reqSnap.data();
      if (data.userId !== uid) throw new Error('Cette demande ne vous appartient pas');
      if (data.statut !== 'en_attente_paiement') {
        throw new Error(`Cette demande n'est plus en attente de paiement (statut actuel : ${data.statut})`);
      }

      const currency = data.devis.currency;
      const montant  = data.devis.total;

      const userRef   = db.collection('users').doc(uid);
      const escrowRef = db.collection('users').doc('escrow_fritok');
      const [userSnap, escrowSnap] = await Promise.all([tx.get(userRef), tx.get(escrowRef)]);

      if (!userSnap.exists) throw new Error('Compte utilisateur introuvable');
      if (!escrowSnap.exists) throw new Error('Compte escrow introuvable');

      const walletUser   = userSnap.data().wallet || {};
      const walletEscrow = escrowSnap.data().wallet || {};
      const soldeEscrowActuel = escrowSnap.data().solde || 0;
      const soldeUserActuel   = walletUser[currency] || 0;

      if (soldeUserActuel < montant) {
        throw new Error(`Solde insuffisant : ${soldeUserActuel.toLocaleString('fr-FR')} ${currency} disponible, ${montant.toLocaleString('fr-FR')} ${currency} requis`);
      }

      // Débiter le client
      tx.update(userRef, {
        [`wallet.${currency}`]: soldeUserActuel - montant,
      });

      // Créditer l'escrow
      tx.update(escrowRef, {
        [`wallet.${currency}`]: (walletEscrow[currency] || 0) + montant,
        solde: soldeEscrowActuel + montant,
      });

      // Historique — même modèle que le flux power bank
      tx.set(db.collection('TransfetMoney').doc(), {
        type: 'paiement_sourcing',
        requestId,
        montant, currency,
        de: uid, vers: 'escrow_fritok',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Le paiement confirmé déclenche directement sourcing_en_cours —
      // l'agent n'a pas de bouton pour sortir de en_attente_paiement lui-même
      // (voir TRANSITIONS dans _sourcingShared.js : liste vide pour cet état)
      tx.update(reqRef, {
        statut: 'sourcing_en_cours',
        payeLe: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return { montant, currency };
    });

    return { statusCode: 200, body: JSON.stringify({ success: true, ...resultat }) };
  } catch (e) {
    console.error('pay-sourcing-request:', e);
    // Message d'erreur renvoyé tel quel — les erreurs levées ci-dessus sont
    // déjà rédigées pour être affichées directement au client (solde insuffisant, etc.)
    return { statusCode: 400, body: JSON.stringify({ error: e.message }) };
  }
};