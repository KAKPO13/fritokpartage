// netlify/functions/_sourcingShared.js

import crypto from 'crypto';

/* ══════════════════════════════════════════════════════════
   TOKEN AGENT — lien signé sans login, même logique que les
   tokens Firebase ID mais scopé à une seule demande de sourcing.
   Format décodé : requestId:agentId:expiry:signature
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
   NOTIFICATION AGENT — envoi WhatsApp Cloud API (template Utility)
   Voir section "Créer le template" pour l'approbation Meta requise
   avant que ceci fonctionne réellement.
══════════════════════════════════════════════════════════ */
export async function envoyerNotificationAgent(requestId, agent, devis, totalItems) {
  if (!process.env.WHATSAPP_TOKEN || !process.env.WHATSAPP_PHONE_NUMBER_ID) {
    console.warn('WhatsApp non configuré — notification ignorée');
    return { success: false, error: 'WhatsApp non configuré' };
  }

  const token = genererTokenAgent(requestId, agent.id);
  const lienPage = `https://fritok.net/agent/sourcing/${requestId}?token=${token}`;
  const numeroAgent = String(agent.whatsapp).replace(/\D/g, '');

  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: numeroAgent,
          type: 'template',
          template: {
            name: 'nouvelle_demande_sourcing',
            language: { code: 'fr' },
            components: [{
              type: 'body',
              parameters: [
                { type: 'text', text: requestId },
                { type: 'text', text: String(totalItems) },
                { type: 'text', text: devis.total.toLocaleString('fr-FR') },
                { type: 'text', text: devis.currency },
                { type: 'text', text: lienPage },
              ],
            }],
          },
        }),
      }
    );

    const data = await res.json();
    if (!res.ok) {
      console.error('WhatsApp send error:', data);
      return { success: false, error: data?.error?.message || 'Erreur inconnue' };
    }
    return { success: true, messageId: data.messages[0].id };
  } catch (e) {
    console.error('envoyerNotificationAgent:', e);
    return { success: false, error: e.message };
  }
}