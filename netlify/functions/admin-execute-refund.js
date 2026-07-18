//netlify/functions/admin-execute-refund.js

const admin = require('firebase-admin');
if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Méthode non autorisée' }) };
  }

  try {
    /* ── 1. Authentification admin ──────────────────────── */
    const idToken = event.headers.authorization?.split('Bearer ')[1];
    if (!idToken) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Non authentifié' }) };
    }
    const decoded = await admin.auth().verifyIdToken(idToken);
    if (!decoded.admin) {
      return { statusCode: 403, body: JSON.stringify({ error: 'Accès réservé aux admins' }) };
    }

    const { requestId, itemIndex } = JSON.parse(event.body || '{}');
    if (!requestId || typeof itemIndex !== 'number') {
      return { statusCode: 400, body: JSON.stringify({ error: 'requestId ou itemIndex manquant' }) };
    }

    /* ── 2. Transaction : validation + exécution ─────────── */
    const resultat = await db.runTransaction(async (tx) => {
      const reqRef = db.collection('sourcing_requests').doc(requestId);
      const reqSnap = await tx.get(reqRef);
      if (!reqSnap.exists) throw new Error('Demande introuvable');
      const data = reqSnap.data();

      const remboursements = data.remboursementsEnAttente || [];
      const remb = remboursements.find(r => r.itemIndex === itemIndex && r.statut === 'en_attente_validation');
      if (!remb) throw new Error('Remboursement déjà traité ou introuvable');

      // Garde-fou supplémentaire : l'item doit toujours être "introuvable"
      // au moment de l'exécution. Si l'agent l'a re-marqué "trouve" entre la
      // notification WhatsApp et la validation admin, agent-update-sourcing-status.js
      // a déjà dû retirer l'entrée de remboursementsEnAttente — mais on vérifie
      // quand même l'état de l'item pour ne jamais exécuter un remboursement
      // devenu obsolète si les deux écritures se chevauchaient.
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

      // Créditer le client
      tx.update(userRef, {
        [`wallet.${currency}`]: (walletUser[currency] || 0) + montant,
      });

      // Débiter l'escrow
      tx.update(escrowRef, {
        [`wallet.${currency}`]: (walletEscrow[currency] || 0) - montant,
        solde: soldeEscrowActuel - montant,
      });

      // Historique — même modèle que TransfetMoney existant
      tx.set(db.collection('TransfetMoney').doc(), {
        type: 'remboursement_sourcing',
        requestId, itemIndex,
        montant, currency,
        de: 'escrow_fritok', vers: data.userId,
        executePar: decoded.uid,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Marquer le remboursement comme exécuté + recalculer le total
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
    return { statusCode: 400, body: JSON.stringify({ error: e.message }) };
  }
};