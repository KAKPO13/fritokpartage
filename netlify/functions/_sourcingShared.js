// netlify/functions/_sourcingShared.js

import crypto from 'crypto';

/* ══════════════════════════════════════════════════════════
   TOKEN AGENT — lien signé sans login, même logique que les
   tokens Firebase ID mais scopé à une seule demande de sourcing.
   Format décodé : requestId:agentId:expiry:signature

   NOTE : conservé tel quel — utile si tu gardes un lien externe
   (ex: page publique agent) même sans WhatsApp/email. Si tu n'en
   as plus l'usage du tout, tu peux supprimer cette section.
══════════════════════════════════════════════════════════ */
export function genererTokenAgent(requestId, agentId, dureeJours = 7) {
  const expiry = Date.now() + dureeJours * 86400000;
  const payload = `${requestId}:${agentId}:${expiry}`;
  const signature = crypto
    .createHmac('sha256', process.env.AGENT_LINK_SECRET)
    .update(payload)
    .digest('hex');
  return Buffer.from(`${payload}:${signature}`).toString('base64url');
}

export function verifierTokenAgent(token) {
  try {
    const decoded = Buffer.from(token, 'base64url').toString();
    const parts = decoded.split(':');
    if (parts.length !== 4) return null;

    const [requestId, agentId, expiry, signature] = parts;
    const payload = `${requestId}:${agentId}:${expiry}`;
    const attendu = crypto
      .createHmac('sha256', process.env.AGENT_LINK_SECRET)
      .update(payload)
      .digest('hex');

    // Comparaison en temps constant — évite les attaques par timing sur la signature
    const sigBuf = Buffer.from(signature, 'hex');
    const attenduBuf = Buffer.from(attendu, 'hex');
    if (sigBuf.length !== attenduBuf.length || !crypto.timingSafeEqual(sigBuf, attenduBuf)) {
      return null;
    }

    if (Date.now() > Number(expiry)) return null;

    return { requestId, agentId };
  } catch {
    return null;
  }
}

/* ══════════════════════════════════════════════════════════
   MACHINE À ÉTATS — transitions de statut autorisées pour
   sourcing_requests. Toute transition hors de cette table est
   rejetée par agent-update-sourcing-status.js.

   ⚠️ Garder cette table synchronisée avec TRANSITIONS_AGENT dans
   lib/sourcingStatuts.js (fichier client, ne peut pas importer celui-ci).
══════════════════════════════════════════════════════════ */
export const TRANSITIONS = {
  en_attente_paiement: [], // sort de cet état uniquement via pay-sourcing-request.js / verify-sourcing-payment.js
  sourcing_en_cours: ['en_transit', 'partiellement_introuvable', 'annulee'],
  partiellement_introuvable: ['en_transit', 'annulee'],
  en_transit: ['livree'],
  livree: [],
  annulee: [],
};

export function transitionAutorisee(statutActuel, nouveauStatut) {
  return (TRANSITIONS[statutActuel] || []).includes(nouveauStatut);
}

/* ══════════════════════════════════════════════════════════
   LABELS STATUT — copie serveur de lib/sourcingStatuts.js (SOURCING_STATUTS),
   nécessaire ici pour composer le texte des notifications sans dépendre
   d'un import cross-dossier depuis les Netlify Functions.
   ⚠️ Garder synchronisé avec lib/sourcingStatuts.js si tu ajoutes un statut.
══════════════════════════════════════════════════════════ */
const LABELS_STATUT = {
  en_attente_paiement: 'En attente de paiement',
  sourcing_en_cours: 'Sourcing en cours',
  partiellement_introuvable: 'Partiellement introuvable',
  en_transit: 'En transit',
  livree: 'Livrée',
  annulee: 'Annulée',
};

/* ══════════════════════════════════════════════════════════
   NOTIFICATIONS IN-APP — remplace WhatsApp Cloud API / Resend pour
   l'alerte agent. Écrites via firebase-admin (bypass des règles
   Firestore), lues côté client par
   components/sourcing/NotificationsBell.jsx sur users/{uid}/notifications.

   `dbAdmin` = instance Firestore Admin (ex: `db` dans
   submit-sourcing-request.js / agent-update-sourcing-status.js).
══════════════════════════════════════════════════════════ */

// Note : agent.id est l'UID Firebase de l'agent (vendeur avec isAgent=true),
// PAS un numéro whatsapp — on n'a donc plus besoin de agent.whatsapp ici.
export async function creerNotificationAgent(dbAdmin, requestId, agent, devis, totalItems) {
  try {
    await dbAdmin
      .collection('users').doc(agent.id)
      .collection('notifications').add({
        type: 'sourcing_nouvelle_demande',
        requestId,
        titre: 'Nouvelle demande de sourcing',
        corps: `${totalItems} article${totalItems > 1 ? 's' : ''} — ${devis.total.toLocaleString('fr-FR')} ${devis.currency}`,
        lien: `/agent/sourcing/${requestId}`,
        lu: false,
        createdAt: new Date(),
      });
    return { success: true };
  } catch (e) {
    console.error('creerNotificationAgent:', e);
    return { success: false, error: e.message };
  }
}

// Notification générique au CLIENT — utilisée aussi bien pour un changement
// de statut global que pour un item marqué introuvable.
export async function creerNotificationClient(dbAdmin, { requestId, userId, titre, corps, lien }) {
  try {
    await dbAdmin
      .collection('users').doc(userId)
      .collection('notifications').add({
        type: 'sourcing_maj',
        requestId,
        titre,
        corps,
        lien: lien ?? `/sourcing/${requestId}`,
        lu: false,
        createdAt: new Date(),
      });
    return { success: true };
  } catch (e) {
    console.error('creerNotificationClient:', e);
    return { success: false, error: e.message };
  }
}

// Raccourci pour le cas le plus fréquent : le statut global de la demande
// vient de changer (appelé depuis agent-update-sourcing-status.js, action
// 'update_statut').
export async function creerNotificationChangementStatut(dbAdmin, requestId, userId, nouveauStatut) {
  return creerNotificationClient(dbAdmin, {
    requestId,
    userId,
    titre: 'Mise à jour de votre commande sourcing',
    corps: `Nouveau statut : ${LABELS_STATUT[nouveauStatut] ?? nouveauStatut}`,
  });
}

// Raccourci pour le cas où un item passe à 'introuvable' (action
// 'update_item') — informe le client sans attendre le prochain changement
// de statut global.
export async function creerNotificationItemIntrouvable(dbAdmin, requestId, userId, titreProduit) {
  return creerNotificationClient(dbAdmin, {
    requestId,
    userId,
    titre: 'Produit introuvable',
    corps: `« ${titreProduit} » n'a pas pu être trouvé par l'agent. Un remboursement partiel est en cours de traitement.`,
  });
}