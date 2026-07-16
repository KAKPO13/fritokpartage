'use client';

import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebaseClient';
import { withTtlCache } from '../shared/withTtlCache.js';

/**
 * @typedef {Object} SessionSnapshot
 * @property {Array<{productId: string, name: string, description: string|null, price: number, imageUrl: string|null}>} products
 * @property {number} currentProductIndex
 * @property {string} sellerId
 */

/**
 * defaultFetchSessionDoc — lecture RÉELLE et SEULE de
 * `live_avatar_sessions/{sessionId}` (autorisée par firestore.rules :
 * `allow read: if isAuth()`). Aucune écriture, aucune nouvelle règle.
 *
 * @param {string} sessionId
 * @returns {Promise<SessionSnapshot|null>}
 */
async function defaultFetchSessionDoc(sessionId) {
  const snap = await getDoc(doc(db, 'live_avatar_sessions', sessionId));
  if (!snap.exists()) return null;

  const data = snap.data();
  return {
    products: Array.isArray(data.products) ? data.products : [],
    currentProductIndex: data.currentProductIndex ?? 0,
    sellerId: data.sellerId ?? '',
  };
}

/**
 * createFirestoreSessionSnapshotSource — fournit un instantané (produits +
 * index courant) d'une session avec un cache court en mémoire, pour ne
 * pas relire Firestore à chaque commentaire analysé (un live peut recevoir
 * des dizaines de commentaires/minute — chaque `getAnswer()` du Knowledge
 * Engine n'a pas besoin d'un `getDoc` frais à chaque fois, les produits
 * d'un live changent rarement en quelques secondes).
 *
 * `fetchSessionDoc` et `now` sont injectables pour permettre des tests
 * unitaires déterministes, sans dépendance Firebase ni horloge réelle.
 *
 * @param {{ fetchSessionDoc?: (sessionId: string) => Promise<SessionSnapshot|null>, cacheTtlMs?: number, now?: () => number }} [config]
 */
export function createFirestoreSessionSnapshotSource({
  fetchSessionDoc = defaultFetchSessionDoc,
  cacheTtlMs = 10_000,
  now = () => Date.now(),
} = {}) {
  const getCachedSnapshot = withTtlCache(fetchSessionDoc, { ttlMs: cacheTtlMs, now });

  return {
    /**
     * @param {string} sessionId
     * @returns {Promise<SessionSnapshot|null>}
     */
    getSnapshot: getCachedSnapshot,
  };
}
