/**
 * createInMemoryCacheRepository — implémentation par défaut de
 * ICacheRepository, pour le développement et les tests.
 *
 * ⚠️ Ne persiste rien entre deux exécutions/déploiements, et n'est pas
 * partagée entre plusieurs instances serverless — donc PAS adaptée à la
 * production telle quelle. En production, remplacer par un adaptateur
 * `ai_cache` (Firestore, écrit via Netlify Function, voir la note dans
 * ICacheRepository.js) sans changer le Response Manager.
 *
 * @param {{ maxEntries?: number }} [options]
 * @returns {import('../../domain/repositories/ICacheRepository.js').ICacheRepository}
 */
export function createInMemoryCacheRepository({ maxEntries = 500 } = {}) {
  const store = new Map();

  return {
    async get(key) {
      return store.has(key) ? store.get(key) : null;
    },
    async set(key, value) {
      store.set(key, value);
      // FIFO simple si la limite est dépassée — même politique que
      // WatchedAvatarStore côté client (voir MultiLiveFeedPage.js) : on
      // évite une croissance non bornée sans complexifier avec un LRU.
      if (store.size > maxEntries) {
        const oldestKey = store.keys().next().value;
        store.delete(oldestKey);
      }
    },
  };
}
