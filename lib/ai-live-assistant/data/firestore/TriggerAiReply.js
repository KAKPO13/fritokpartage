'use client';

import { auth } from '@/lib/firebaseClient';

const ENDPOINT = '/.netlify/functions/ai-live-respond';

/**
 * triggerAiReply — déclenche le pipeline de réponse IA pour un
 * commentaire donné. Même convention d'authentification que
 * `avatarSessionApi.js` (Bearer idToken) — voir ce fichier pour le
 * précédent exact.
 *
 * N'envoie QUE `sessionId` + `commentId`, jamais le texte du
 * commentaire : le serveur relit le texte réel depuis Firestore (voir
 * netlify/functions/ai-live-respond.js) pour ne jamais faire confiance à
 * une valeur fournie par le client.
 *
 * @param {string} sessionId
 * @param {string} commentId
 */
export async function triggerAiReply(sessionId, commentId) {
  const user = auth.currentUser;
  if (!user) return; // pas connecté : rien à déclencher, pas une erreur bloquante

  const idToken = await user.getIdToken();

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ sessionId, commentId }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error || 'triggerAiReply a échoué');
  }

  return res.json();
}
