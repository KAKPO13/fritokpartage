// netlify/functions/verify-sourcing-payment.js

import admin from 'firebase-admin';

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

const FLUTTERWAVE_SECRET_KEY = process.env.FLUTTERWAVE_SECRET_KEY;

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

    const { requestId, transactionId } = JSON.parse(event.body || '{}');
    if (!requestId || !transactionId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'requestId ou transactionId manquant' }) };
    }

    /* ── 2. Vérification AUPRÈS DE FLUTTERWAVE — jamais confiance
       dans le statut renvoyé par le client après le checkout.     */
    const verifRes = await fetch(
      `https://api.flutterwave.com/v3/transactions/${transactionId}/verify`,
      { headers: { Authorization: `Bearer ${FLUTTERWAVE_SECRET_KEY}` } }
    );
    const verifData = await verifRes.json();

    if (!verifRes.ok || verifData.status !== 'success' || verifData.data?.status !== 'successful') {
      return { statusCode: 400, body: JSON.stringify({ error: 'Paiement non confirmé par Flutterwave' }) };
    }

    const montantPaye = Number(verifData.data.amount);
    const currencyPaye = verifData.data.currency;

    /* ── 3. Transaction Firestore : re-vérifie le montant contre
       le devis stocké AVANT de créditer l'escrow — empêche un
       paiement d'un montant inférieur d'être accepté.            */
    const resultat = await db.runTransaction(async (tx) => {
      const reqRef = db.collection('sourcing_requests').doc(requestId);
      const reqSnap = await tx.get(reqRef);
      if (!reqSnap.exists) throw new Error('Demande introuvable');

      const data = reqSnap.data();
      if (data.userId !== uid) throw new Error('Cette demande ne vous appartient pas');
      if (data.statut !== 'en_attente_paiement') {
        throw new Error(`Cette demande n'est plus en attente de paiement (statut actuel : ${data.statut})`);
      }

      // Idempotence — si ce transactionId a déjà été traité, ne pas créditer deux fois
      if (data.flutterwaveTransactionId === String(transactionId)) {
        throw new Error('Ce paiement a déjà été traité');
      }

      const devisCurrency = data.devis.currency;
      const devisTotal    = data.devis.total;

      // Flutterwave facture toujours en devise réelle (XOF/GHS/NGN), pas en
      // "FCFA" générique — mappe si besoin selon la config Flutterwave du compte
      if (currencyPaye !== devisCurrency && !(devisCurrency === 'FCFA' && currencyPaye === 'XOF')) {
        throw new Error(`Devise du paiement (${currencyPaye}) ne correspond pas au devis (${devisCurrency})`);
      }
      if (montantPaye < devisTotal) {
        throw new Error(`Montant payé (${montantPaye}) inférieur au devis (${devisTotal})`);
      }

      const escrowRef = db.collection('users').doc('escrow_fritok');
      const escrowSnap = await tx.get(escrowRef);
      if (!escrowSnap.exists) throw new Error('Compte escrow introuvable');

      const walletEscrow = escrowSnap.data().wallet || {};
      const soldeEscrowActuel = escrowSnap.data().solde || 0;

      // Créditer l'escrow (pas de débit wallet ici — l'argent vient de Flutterwave, pas du wallet FriTok)
      tx.update(escrowRef, {
        [`wallet.${devisCurrency}`]: (walletEscrow[devisCurrency] || 0) + devisTotal,
        solde: soldeEscrowActuel + devisTotal,
      });

      tx.set(db.collection('TransfetMoney').doc(), {
        type: 'paiement_sourcing_flutterwave',
        requestId,
        montant: devisTotal, currency: devisCurrency,
        de: uid, vers: 'escrow_fritok',
        flutterwaveTransactionId: String(transactionId),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      tx.update(reqRef, {
        statut: 'sourcing_en_cours',
        payeLe: admin.firestore.FieldValue.serverTimestamp(),
        flutterwaveTransactionId: String(transactionId),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return { montant: devisTotal, currency: devisCurrency };
    });

    return { statusCode: 200, body: JSON.stringify({ success: true, ...resultat }) };
  } catch (e) {
    console.error('verify-sourcing-payment:', e);
    return { statusCode: 400, body: JSON.stringify({ error: e.message }) };
  }
};