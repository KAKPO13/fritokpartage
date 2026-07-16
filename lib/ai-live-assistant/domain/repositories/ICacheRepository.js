/**
 * ICacheRepository — contrat du cache de réponses fréquentes (stratégie
 * de coût du cahier des charges : "Utiliser un cache des réponses
 * fréquentes. Mutualiser les réponses identiques lorsque plusieurs
 * utilisateurs posent la même question.").
 *
 * L'implémentation par défaut fournie ici (InMemoryCacheRepository) est
 * volontairement simple et sert au développement/tests. En production,
 * elle devra être remplacée par un adaptateur adossé à la collection
 * Firestore `ai_cache` — mais, comme pour tout le reste de FriTok,
 * l'ÉCRITURE de cette collection devra passer par une Netlify Function
 * (Admin SDK), jamais par un `setDoc` client direct (voir
 * firestore.rules : ce pattern est appliqué à `live_avatar_sessions` et à
 * toutes ses sous-collections). Ce contrat permet ce remplacement sans
 * toucher au Response Manager.
 *
 * @typedef {Object} ICacheRepository
 * @property {(key: string) => Promise<string|null>} get
 * @property {(key: string, value: string) => Promise<void>} set
 */

/**
 * @param {any} repo
 * @returns {ICacheRepository}
 */
export function assertImplementsCacheRepository(repo) {
  if (!repo || typeof repo.get !== 'function' || typeof repo.set !== 'function') {
    throw new Error(
      'Cache de réponses invalide : un ICacheRepository doit exposer { get: Function, set: Function }.'
    );
  }
  return repo;
}
