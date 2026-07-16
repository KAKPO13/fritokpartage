/**
 * withTtlCache — mémoïse une fonction asynchrone à un seul paramètre
 * (ex: sessionId → snapshot) pendant `ttlMs`, pour éviter de refaire un
 * appel coûteux (lecture Firestore, appel réseau...) à chaque
 * commentaire analysé alors que la donnée sous-jacente change rarement
 * en quelques secondes.
 *
 * Fonction pure et sans dépendance externe (ni Firebase, ni horloge
 * réelle imposée) — voir FirestoreSessionSnapshotSource.js pour
 * l'utilisation concrète avec Firestore, et
 * __tests__/WithTtlCache.test.js pour les tests qui ne dépendent que de
 * cet helper.
 *
 * @template T
 * @param {(key: string) => Promise<T>} fetchFn
 * @param {{ ttlMs?: number, now?: () => number }} [options]
 * @returns {(key: string) => Promise<T>}
 */
export function withTtlCache(fetchFn, { ttlMs = 10_000, now = () => Date.now() } = {}) {
  const cache = new Map(); // key -> { value, expiresAt }

  return async (key) => {
    const cached = cache.get(key);
    if (cached && cached.expiresAt > now()) {
      return cached.value;
    }

    const value = await fetchFn(key);
    cache.set(key, { value, expiresAt: now() + ttlMs });
    return value;
  };
}
