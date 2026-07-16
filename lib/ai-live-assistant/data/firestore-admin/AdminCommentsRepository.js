import admin from 'firebase-admin';

/**
 * createAdminCommentsRepository — lit le commentaire RÉEL d'un spectateur
 * (jamais le texte fourni par le client, voir AiReplyOrchestrator.js) et
 * écrit la réponse IA comme un commentaire NORMAL dans la même
 * sous-collection `live_avatar_sessions/{sessionId}/comments`.
 *
 * Confirmé en lisant le rendu réel de UltraLivePage.js :
 *   <ChatBubble key={c.id} user={c.viewerId ?? 'user'} text={c.text ?? ''} />
 * → seuls `text` et `viewerId` sont utilisés à l'affichage, aucune
 * contrainte de schéma stricte. Écrire { text, viewerId: 'Assistant IA',
 * time } suffit à faire apparaître la réponse dans le fil de TOUS les
 * spectateurs, via le onSnapshot déjà en place — zéro ligne changée dans
 * UltraLivePage.js.
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
      return typeof data?.text === 'string' ? { text: data.text } : null;
    },

    /**
     * @param {string} sessionId
     * @param {string} commentId - id du commentaire humain auquel on répond (traçabilité)
     * @param {string} text
     */
    async writeAiReply(sessionId, commentId, text) {
      await commentsRef(sessionId).add({
        text,
        viewerId: aiViewerLabel,
        time: admin.firestore.FieldValue.serverTimestamp(),
        isAI: true,
        respondingTo: commentId,
      });
    },
  };
}