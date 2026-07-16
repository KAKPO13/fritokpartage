import admin from 'firebase-admin';

/**
 * createAdminCommentsRepository — lit le commentaire RÉEL d'un spectateur
 * (jamais le texte fourni par le client, voir AiReplyOrchestrator.js) et
 * écrit la réponse IA comme un commentaire NORMAL dans la même
 * sous-collection `live_avatar_sessions/{sessionId}/comments`.
 *
 * Schéma réel confirmé via la console Firebase sur un document
 * `comments` existant : le champ de texte s'appelle `message` (pas
 * `text`) et le champ de date `timestamp` (pas `time`). C'est aussi ce
 * qu'écrit `avatar-viewer-track.js` côté serveur pour les commentaires
 * humains, et ce que lit désormais `UltraLivePage.js` côté client
 * (corrigé le même jour — l'ancienne version du composant lisait `c.text`
 * / triait sur `time`, ce qui masquait silencieusement TOUS les
 * commentaires, humains comme IA).
 *
 * `getComment` et `writeAiReply` utilisent donc `message`/`timestamp` en
 * interne, tout en conservant le contrat `{ text: string }` côté
 * AiReplyOrchestrator.js — c'est cette fonction qui fait le mapping entre
 * le nom de champ Firestore et le nom de propriété métier, pour que le
 * reste du pipeline IA n'ait jamais à connaître le schéma réel.
 *
 * Écriture faite en Admin SDK uniquement, cohérent avec
 * `allow write: if false` sur cette sous-collection (voir
 * firestore.rules — seule une Netlify Function peut y écrire).
 *
 * @param {{ db: FirebaseFirestore.Firestore, aiViewerLabel?: string }} config
 */
export function createAdminCommentsRepository({ db, aiViewerLabel = 'Assistant IA' }) {
  if (!db) throw new Error('createAdminCommentsRepository: db (Admin Firestore) requis.');

  const commentsRef = (sessionId) =>
    db.collection('live_avatar_sessions').doc(sessionId).collection('comments');

  return {
    /**
     * @param {string} sessionId
     * @param {string} commentId
     * @returns {Promise<{ text: string }|null>}
     */
    async getComment(sessionId, commentId) {
      const snap = await commentsRef(sessionId).doc(commentId).get();
      if (!snap.exists) return null;
      const data = snap.data();
      return typeof data?.message === 'string' ? { text: data.message } : null;
    },

    /**
     * @param {string} sessionId
     * @param {string} commentId - id du commentaire humain auquel on répond (traçabilité)
     * @param {string} text
     */
    async writeAiReply(sessionId, commentId, text) {
      await commentsRef(sessionId).add({
        message: text,
        viewerId: aiViewerLabel,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        isAI: true,
        respondingTo: commentId,
      });
    },
  };
}