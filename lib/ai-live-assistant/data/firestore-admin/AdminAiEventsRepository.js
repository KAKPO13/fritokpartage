import admin from 'firebase-admin';

const EVENTS_COLLECTION = 'ai_events';

/**
 * createAdminAiEventsRepository — verrou de dédoublonnage entre
 * spectateurs + rate-limit par session, via la collection `ai_events`
 * (Admin SDK uniquement — voir la note dans ICacheRepository.js sur ce
 * pattern déjà appliqué partout ailleurs dans FriTok : le client ne doit
 * JAMAIS lire ni écrire cette collection directement).
 *
 * Dédoublonnage : plusieurs spectateurs peuvent détecter le même
 * commentaire actionable en même temps et appeler la Netlify Function
 * simultanément. `acquireLock` utilise `create()` (et non `set()`) —
 * Firestore refuse la création si le document existe déjà
 * (ALREADY_EXISTS), ce qui donne un verrou atomique sans transaction
 * explicite : le premier appel "gagne", tous les autres se voient
 * refuser le verrou.
 *
 * Rate-limit : compte les événements de la session sur une fenêtre
 * glissante, pour éviter qu'un pic de commentaires actionables ne
 * déclenche une rafale d'appels LLM coûteux.
 *
 * @param {{ db: FirebaseFirestore.Firestore, maxPerMinute?: number, windowMs?: number }} config
 */
export function createAdminAiEventsRepository({ db, maxPerMinute = 6, windowMs = 60_000 }) {
  if (!db) throw new Error('createAdminAiEventsRepository: db (Admin Firestore) requis.');

  const eventId = (sessionId, commentId) => `${sessionId}_${commentId}`;

  return {
    /**
     * @param {string} sessionId
     * @param {string} commentId
     * @returns {Promise<boolean>} true si le verrou a été obtenu, false si déjà pris
     */
    async acquireLock(sessionId, commentId) {
      const ref = db.collection(EVENTS_COLLECTION).doc(eventId(sessionId, commentId));
      try {
        await ref.create({
          sessionId,
          commentId,
          status: 'pending',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return true;
      } catch (err) {
        // code 6 = ALREADY_EXISTS côté Admin SDK (google-gax) : un autre
        // spectateur a déjà pris le verrou pour ce commentaire.
        if (err?.code === 6 || /ALREADY_EXISTS/i.test(err?.message ?? '')) {
          return false;
        }
        throw err;
      }
    },

    /**
     * @param {string} sessionId
     * @param {string} commentId
     * @param {object} outcome
     */
    async markOutcome(sessionId, commentId, outcome) {
      const ref = db.collection(EVENTS_COLLECTION).doc(eventId(sessionId, commentId));
      await ref.set(
        { ...outcome, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
        { merge: true }
      );
    },

    /**
     * @param {string} sessionId
     * @returns {Promise<boolean>} true si sous la limite, false si atteinte
     */
    async checkRateLimit(sessionId) {
      const cutoff = admin.firestore.Timestamp.fromMillis(Date.now() - windowMs);
      const snap = await db
        .collection(EVENTS_COLLECTION)
        .where('sessionId', '==', sessionId)
        .where('createdAt', '>=', cutoff)
        .count()
        .get();

      return snap.data().count < maxPerMinute;
    },
  };
}