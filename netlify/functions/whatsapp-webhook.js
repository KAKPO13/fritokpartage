//netlify/functions/whatsapp-webhook.js

const crypto = require('crypto');
const admin = require('firebase-admin');
if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

exports.handler = async (event) => {
  /* ── Vérification initiale de l'abonnement webhook (GET, fait
     une seule fois par Meta au moment de la configuration)      */
  if (event.httpMethod === 'GET') {
    const params = event.queryStringParameters || {};
    if (params['hub.verify_token'] === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
      return { statusCode: 200, body: params['hub.challenge'] };
    }
    return { statusCode: 403, body: 'Forbidden' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Méthode non autorisée' };
  }

  /* ── Vérification de la signature Meta ────────────────────
     Empêche quiconque d'appeler cette URL publique en se faisant
     passer pour Meta (ex: pour forger un faux statut "livré" ou
     usurper une réponse d'agent).                               */
  try {
    const signature = event.headers['x-hub-signature-256'];
    if (!signature) {
      return { statusCode: 403, body: 'Signature manquante' };
    }

    const attendu = 'sha256=' + crypto
      .createHmac('sha256', process.env.WHATSAPP_APP_SECRET)
      .update(event.body)
      .digest('hex');

    const sigBuf = Buffer.from(signature);
    const attenduBuf = Buffer.from(attendu);
    if (sigBuf.length !== attenduBuf.length || !crypto.timingSafeEqual(sigBuf, attenduBuf)) {
      return { statusCode: 403, body: 'Signature invalide' };
    }
  } catch (e) {
    console.error('whatsapp-webhook signature check:', e);
    return { statusCode: 403, body: 'Signature invalide' };
  }

  /* ── Traitement de l'événement ─────────────────────────────
     Toujours répondre 200 même en cas d'erreur interne — sinon
     Meta considère l'événement en échec et le renvoie en boucle. */
  try {
    const body = JSON.parse(event.body);
    const changes = body.entry?.[0]?.changes?.[0]?.value;

    /* Statuts de livraison (sent / delivered / read / failed) */
    if (Array.isArray(changes?.statuses)) {
      for (const s of changes.statuses) {
        const snap = await db.collection('sourcing_requests')
          .where('notifMessageId', '==', s.id)
          .limit(1)
          .get();

        if (!snap.empty) {
          await snap.docs[0].ref.update({
            notifStatus: s.status,
            notifUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
      }
    }

    /* Réponses texte de l'agent — loggées pour l'instant, pas
       d'action automatique déclenchée (voir note ci-dessous)     */
    if (Array.isArray(changes?.messages)) {
      for (const m of changes.messages) {
        console.log('Réponse agent WhatsApp:', {
          from: m.from,
          type: m.type,
          texte: m.text?.body,
          timestamp: m.timestamp,
        });

        // Traçabilité minimale — permet de retrouver plus tard "qu'a répondu
        // cet agent" sans devoir fouiller les logs Netlify. Aucun impact sur
        // le statut de la demande : uniquement la page agent (boutons) déclenche
        // des changements de statut, jamais un message WhatsApp entrant.
        await db.collection('whatsapp_messages_recus').add({
          from: m.from,
          type: m.type,
          texte: m.text?.body || null,
          receivedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    }

    return { statusCode: 200, body: 'EVENT_RECEIVED' };
  } catch (e) {
    console.error('whatsapp-webhook processing:', e);
    return { statusCode: 200, body: 'EVENT_RECEIVED' }; // 200 quand même, voir note ci-dessus
  }
};