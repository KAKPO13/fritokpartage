'use client';

import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebaseClient';

/**
 * firestoreCommentSource — adaptateur concret de "comment source" pour
 * observeSessionComments (couche application, Module 1).
 *
 * LECTURE SEULE sur `live_avatar_sessions/{sessionId}/comments` :
 * - autorisée par firestore.rules (`allow read: if isAuth()`)
 * - écriture verrouillée côté client (`allow write: if false` — seule
 *   la Netlify Function `avatar-viewer-track.js` écrit les commentaires)
 *
 * Cet adaptateur n'écrit donc jamais rien et ne nécessite AUCUNE
 * nouvelle règle Firestore. Il rejoue exactement la même requête que
 * celle déjà utilisée par UltraLivePage.js (orderBy('time','desc'),
 * limit 20) : le module IA observe le flux existant, il ne le duplique
 * pas avec une requête différente et ne le modifie pas.
 */
export const firestoreCommentSource = {
  /**
   * @param {string} sessionId
   * @param {(comments: Array<{id: string, text: string, [k: string]: any}>) => void} onComments
   * @returns {() => void}
   */
  subscribe(sessionId, onComments) {
    if (!sessionId) return () => {};

    const q = query(
      collection(db, 'live_avatar_sessions', sessionId, 'comments'),
      orderBy('time', 'desc'),
      limit(20)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const comments = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        onComments(comments);
      },
      () => {
        // permission-denied ou session inexistante : on n'émet rien et on
        // ne casse rien côté UI existante — même posture défensive que
        // l'onError de MultiLiveFeedPage.js sur son propre onSnapshot.
        onComments([]);
      }
    );

    return unsub;
  },
};