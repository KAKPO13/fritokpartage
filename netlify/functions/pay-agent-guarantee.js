// netlify/functions/pay-agent-guarantee.js
//
// Même pattern que pay-sourcing-request.js : débit du wallet FriTok du
// candidat, crédit d'un compte escrow DÉDIÉ aux cautions (distinct de
// escrow_fritok qui porte les paiements sourcing en cours de traitement —
// une caution n'est pas une commande, elle ne doit pas se mélanger dans les
// mêmes soldes lors des réconciliations comptables).
//
// Ne peut être appelée qu'après validation admin du dossier (statut
// 'approuve') — sinon un candidat pourrait payer une caution pour un
// dossier encore rejetable.

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

const MONTANTS_AUTORISES = [25000, 50000, 100000];
const DEVISE = 'XOF'; // à généraliser si des agents hors zone XOF paient une caution

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Méthode non autorisée' }) };
  }

  try {
    const idToken = event.headers.authorization?.split('Bearer ')[1];
    if (!idToken) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Non authentifié' }) };
    }
    const decoded = await admin.auth().verifyIdToken(idToken);
    const uid = decoded.uid;

    const resultat = await db.runTransaction(async (tx) => {
      const appRef = db.collection('agent_applications').doc(uid);
      const appSnap = await tx.get(appRef);
      if (!appSnap.exists) throw new Error('Dossier introuvable');

      const data = appSnap.data();
      if (data.statut !== 'approuve') {
        throw new Error('Votre dossier doit être validé par FriTok avant de régler la caution');
      }
      if (data.garantie?.statutPaiement === 'paye') {
        throw new Error('Caution déjà réglée');
      }

      const montant = data.garantie?.montantChoisi;
      if (!MONTANTS_AUTORISES.includes(montant)) {
        throw new Error('Montant de caution invalide — reprenez le formulaire');
      }

      const userRef   = db.collection('users').doc(uid);
      const escrowRef = db.collection('users').doc('escrow_cautions_fritok');
      const [userSnap, escrowSnap] = await Promise.all([tx.get(userRef), tx.get(escrowRef)]);

      if (!userSnap.exists) throw new Error('Compte utilisateur introuvable');
      if (!escrowSnap.exists) throw new Error('Compte escrow cautions introuvable — à créer côté admin avant le premier paiement');

      const walletUser        = userSnap.data().wallet || {};
      const walletEscrow      = escrowSnap.data().wallet || {};
      const soldeEscrowActuel = escrowSnap.data().solde || 0;
      const soldeUserActuel   = walletUser[DEVISE] || 0;

      if (soldeUserActuel < montant) {
        throw new Error(`Solde insuffisant : ${soldeUserActuel.toLocaleString('fr-FR')} ${DEVISE} disponible, ${montant.toLocaleString('fr-FR')} ${DEVISE} requis`);
      }

      tx.update(userRef, { [`wallet.${DEVISE}`]: soldeUserActuel - montant });
      tx.update(escrowRef, {
        [`wallet.${DEVISE}`]: (walletEscrow[DEVISE] || 0) + montant,
        solde: soldeEscrowActuel + montant,
      });

      tx.set(db.collection('TransfetMoney').doc(), {
        type: 'caution_agent',
        agentUid: uid,
        montant, currency: DEVISE,
        de: uid, vers: 'escrow_cautions_fritok',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      tx.update(appRef, {
        'garantie.statutPaiement': 'paye',
        'garantie.payeLe': admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return { montant, currency: DEVISE };
    });

    return { statusCode: 200, body: JSON.stringify({ success: true, ...resultat }) };
  } catch (e) {
    console.error('pay-agent-guarantee:', e);
    return { statusCode: 400, body: JSON.stringify({ error: e.message }) };
  }
};