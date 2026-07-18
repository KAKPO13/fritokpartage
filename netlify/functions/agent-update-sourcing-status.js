//netlify/functions/agent-update-sourcing-status.js

const admin = require('firebase-admin');
if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const { verifierTokenAgent, transitionAutorisee } = require('./_sourcingShared');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Méthode non autorisée' }) };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { token, action } = body;

    const auth = verifierTokenAgent(token);
    if (!auth) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Lien invalide ou expiré' }) };
    }

    const reqRef = db.collection('sourcing_requests').doc(auth.requestId);
    const reqSnap = await reqRef.get();
    if (!reqSnap.exists) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Demande introuvable' }) };
    }

    const data = reqSnap.data();
    if (data.agentId !== auth.agentId) {
      return { statusCode: 403, body: JSON.stringify({ error: 'Cette demande ne vous est pas assignée' }) };
    }

    /* ── Action 1 : marquer un item trouvé / introuvable ──── */
    if (action === 'update_item') {
      const { itemIndex, statutItem, noteAgent } = body;

      if (!['trouve', 'introuvable'].includes(statutItem)) {
        return { statusCode: 400, body: JSON.stringify({ error: 'statutItem invalide' }) };
      }
      if (typeof itemIndex !== 'number' || itemIndex < 0 || itemIndex >= data.items.length) {
        return { statusCode: 400, body: JSON.stringify({ error: 'itemIndex invalide' }) };
      }

      // Statuer un item n'a de sens que pendant le traitement actif
      if (!['sourcing_en_cours', 'partiellement_introuvable'].includes(data.statut)) {
        return { statusCode: 400, body: JSON.stringify({ error: `Impossible de modifier un item au statut ${data.statut}` }) };
      }

      const item = data.items[itemIndex];

      // Idempotence — si déjà statué de la même façon, ne rien refaire
      if (item.statutItem === statutItem) {
        return { statusCode: 200, body: JSON.stringify({ success: true, items: data.items, inchange: true }) };
      }

      const items = [...data.items];
      items[itemIndex] = {
        ...item,
        statutItem,
        noteAgent: String(noteAgent || '').slice(0, 300),
      };

      const updatePayload = {
        items,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      // Si l'item devient introuvable, préparer le remboursement (calculé,
      // pas exécuté — voir admin-execute-refund.js pour la validation manuelle)
      if (statutItem === 'introuvable') {
        const montantARembourser = item.prixUnitaire * item.quantite;
        updatePayload.remboursementsEnAttente = admin.firestore.FieldValue.arrayUnion({
          itemIndex,
          videoId: item.videoId,
          titre: item.titre,
          montant: montantARembourser,
          statut: 'en_attente_validation',
          creeLe: new Date().toISOString(),
        });
        updatePayload.aRemboursementEnAttente = true;
      }

      // Si l'item repasse de introuvable à trouvé, retirer le remboursement
      // en attente correspondant (annulé avant validation admin)
      if (statutItem === 'trouve' && item.statutItem === 'introuvable') {
        const remboursements = (data.remboursementsEnAttente || [])
          .filter(r => !(r.itemIndex === itemIndex && r.statut === 'en_attente_validation'));
        updatePayload.remboursementsEnAttente = remboursements;
        updatePayload.aRemboursementEnAttente = remboursements.some(r => r.statut === 'en_attente_validation');
      }

      await reqRef.update(updatePayload);
      return { statusCode: 200, body: JSON.stringify({ success: true, items }) };
    }

    /* ── Action 2 : changer le statut global ──────────────── */
    if (action === 'update_statut') {
      const { nouveauStatut } = body;

      if (!transitionAutorisee(data.statut, nouveauStatut)) {
        return { statusCode: 400, body: JSON.stringify({ error: `Transition ${data.statut} → ${nouveauStatut} non autorisée` }) };
      }

      // Passage à en_transit interdit si des items n'ont pas encore été statués
      if (nouveauStatut === 'en_transit') {
        const nonTraites = data.items.some(i => i.statutItem === 'a_verifier');
        if (nonTraites) {
          return { statusCode: 400, body: JSON.stringify({ error: 'Statuez chaque produit avant de passer à l\'expédition' }) };
        }
      }

      await reqRef.update({
        statut: nouveauStatut,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return { statusCode: 200, body: JSON.stringify({ success: true, statut: nouveauStatut }) };
    }

    return { statusCode: 400, body: JSON.stringify({ error: 'Action inconnue' }) };
  } catch (e) {
    console.error('agent-update-sourcing-status:', e);
    return { statusCode: 500, body: JSON.stringify({ error: 'Erreur serveur' }) };
  }
};