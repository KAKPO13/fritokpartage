// netlify/functions/agent-update-sourcing-status.js
//
// ⚠️ CHANGEMENT D'ARCHITECTURE : l'agent traite désormais ses commandes
// depuis un dashboard in-app (components/sourcing/SourcingAgentDashboard.jsx),
// donc authentifié via Firebase comme n'importe quel compte "vendeur".
// L'ancien système de lien signé sans login (verifierTokenAgent, envoyé par
// WhatsApp) n'est plus le chemin principal — on vérifie maintenant
// idToken.uid === sourcing_requests.agentId, ET que ce compte a bien
// isAgent === true (tous les vendeurs ne sont pas agents).
//
// genererTokenAgent / verifierTokenAgent restent disponibles dans
// _sourcingShared.js si tu gardes un canal externe en secours, mais ne sont
// plus utilisés ici.

import admin from 'firebase-admin';
import {
  transitionAutorisee,
  creerNotificationChangementStatut,
  creerNotificationItemIntrouvable,
} from './_sourcingShared.js';

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
    /* ── 1. Authentification Firebase (plus de token de lien) ── */
    const idToken = event.headers.authorization?.split('Bearer ')[1];
    if (!idToken) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Non authentifié' }) };
    }
    const decoded = await admin.auth().verifyIdToken(idToken);
    const agentUid = decoded.uid;

    /* ── 2. Vérifier que ce compte est bien agent (pas juste vendeur) ──
       Défense en profondeur : même si data.agentId correspondait par
       erreur, un vendeur sans isAgent=true ne doit jamais pouvoir agir. */
    const userSnap = await db.collection('users').doc(agentUid).get();
    if (!userSnap.exists || userSnap.data()?.isAgent !== true) {
      return { statusCode: 403, body: JSON.stringify({ error: 'Ce compte n\'est pas agent sourcing' }) };
    }

    const body = JSON.parse(event.body || '{}');
    const { requestId, action } = body;

    if (!requestId || typeof requestId !== 'string') {
      return { statusCode: 400, body: JSON.stringify({ error: 'requestId requis' }) };
    }

    const reqRef = db.collection('sourcing_requests').doc(requestId);
    const reqSnap = await reqRef.get();
    if (!reqSnap.exists) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Demande introuvable' }) };
    }

    const data = reqSnap.data();
    if (data.agentId !== agentUid) {
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

      // Notification in-app au client — seulement pour 'introuvable', pas
      // pour chaque 'trouvé' (trop bruyant). Ne bloque jamais la réponse.
      if (statutItem === 'introuvable') {
        creerNotificationItemIntrouvable(db, requestId, data.userId, item.titre)
          .catch(e => console.error('notif item introuvable:', e));
      }

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

      // Notification in-app au client — ne bloque jamais la réponse.
      creerNotificationChangementStatut(db, requestId, data.userId, nouveauStatut)
        .catch(e => console.error('notif changement statut:', e));

      return { statusCode: 200, body: JSON.stringify({ success: true, statut: nouveauStatut }) };
    }

    return { statusCode: 400, body: JSON.stringify({ error: 'Action inconnue' }) };
  } catch (e) {
    console.error('agent-update-sourcing-status:', e);
    return { statusCode: 500, body: JSON.stringify({ error: 'Erreur serveur' }) };
  }
};