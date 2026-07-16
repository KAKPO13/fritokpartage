/**
 * createAdminAiCacheRepository — implémentation PERSISTANTE de
 * ICacheRepository (Module 4), collection `ai_cache`, Admin SDK
 * uniquement.
 *
 * `InMemoryCacheRepository` (utilisé en dev/tests) ne survit pas entre
 * deux invocations d'une Netlify Function — chaque requête peut
 * atterrir sur un conteneur différent. Sans cache persistant, la
 * mutualisation entre utilisateurs promise par le Module 4 ne se
 * produit jamais en production : c'est cet adaptateur qui la rend
 * réelle.
 *
 * Même contrat `{ get, set }` que ICacheRepository — aucune modification
 * de ResponseManager.js nécessaire pour passer de l'un à l'autre.
 *
 * @param {{ db: FirebaseFirestore.Firestore, ttlMs?: number }} config
 */
export function createAdminAiCacheRepository({ db, ttlMs = 6 * 60 * 60 * 1000 }) {
  if (!db) throw new Error('createAdminAiCacheRepository: db (Admin Firestore) requis.');

  // Les clés de cache (voir buildCacheKey dans ResponseManager.js) contiennent
  // `::` — invalide comme id de document Firestore s'il contient des
  // caractères problématiques, donc on encode en base64 URL-safe pour
  // obtenir un id de document toujours valide et stable.
  const toDocId = (key) => Buffer.from(key).toString('base64url');

  return {
    /**
     * @param {string} key
     * @returns {Promise<string|null>}
     */
    async get(key) {
      const snap = await db.collection('ai_cache').doc(toDocId(key)).get();
      if (!snap.exists) return null;

      const data = snap.data();
      // Expiration applicative : un TTL trop long finirait par répondre
      // avec un prix ou une info périmée. On ignore une entrée expirée
      // plutôt que de la servir, sans bloquer sur un job de nettoyage.
      if (data.expiresAtMs && data.expiresAtMs < Date.now()) return null;

      return typeof data.value === 'string' ? data.value : null;
    },

    /**
     * @param {string} key
     * @param {string} value
     */
    async set(key, value) {
      await db.collection('ai_cache').doc(toDocId(key)).set({
        value,
        cacheKey: key,
        expiresAtMs: Date.now() + ttlMs,
      });
    },
  };
}