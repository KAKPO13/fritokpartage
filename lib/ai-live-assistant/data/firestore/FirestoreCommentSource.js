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
 * nouvelle règle Firestore. Il rejoue la même requête que celle utilisée
 * par UltraLivePage.js — orderBy('timestamp','desc'), limit 20 — qui est
 * le nom de champ réel des documents `comments` (confirmé via la console
 * Firebase). Le champ de texte s'appelle `message`, pas `text` : cet
 * adaptateur fait le mapping vers `text` ici, pour que le contrat
 * `{id, text, ...}` attendu par observeSessionComments et CommentAnalyzer
 * reste stable même si le nom du champ Firestore change un jour.
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
      orderBy('timestamp', 'desc'),
      limit(20)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const comments = snap.docs.map((d) => {
          const data = d.data();
          return { id: d.id, ...data, text: data.message };
        });
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
