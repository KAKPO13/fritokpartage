import { withTtlCache } from '../shared/withTtlCache.js';

/**
 * createAdminSessionSnapshotSource — équivalent serveur (Admin SDK) de
 * data/firestore/FirestoreSessionSnapshotSource.js (Module 2, côté
 * client). Même contrat `{ getSnapshot(sessionId) }`, donc branchable
 * tel quel dans `createSessionProductKnowledgeProvider` sans aucune
 * modification du Knowledge Engine.
 *
 * Le cache TTL a moins d'intérêt ici que côté client (chaque invocation
 * Netlify Function correspond à UN commentaire, donc en général un seul
 * appel), mais reste utile si le conteneur reste "chaud" (warm start) et
 * traite plusieurs commentaires de la même session à la suite.
 *
 * @param {{ db: FirebaseFirestore.Firestore, cacheTtlMs?: number }} config
 */
export function createAdminSessionSnapshotSource({ db, cacheTtlMs = 10_000 }) {
  if (!db) throw new Error('createAdminSessionSnapshotSource: db (Admin Firestore) requis.');

  const fetchSessionDoc = async (sessionId) => {
    const snap = await db.collection('live_avatar_sessions').doc(sessionId).get();
    if (!snap.exists) return null;

    const data = snap.data();
    return {
      products: Array.isArray(data.products) ? data.products : [],
      currentProductIndex: data.currentProductIndex ?? 0,
      sellerId: data.sellerId ?? '',
    };
  };

  return {
    getSnapshot: withTtlCache(fetchSessionDoc, { ttlMs: cacheTtlMs }),
  };
}