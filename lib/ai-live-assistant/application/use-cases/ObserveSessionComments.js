import { analyzeComment } from '../../services/CommentAnalyzer.js';

/**
 * observeSessionComments — orchestration pure (Module 1, couche
 * application). Ne connaît PAS Firestore : reçoit une "source" abstraite
 * de commentaires et un callback invoqué pour chaque commentaire
 * NOUVELLEMENT vu (dédoublonné par id). Cette séparation permet de
 * tester toute la logique de dédoublonnage + analyse sans dépendance
 * Firebase — voir data/firestore/FirestoreCommentSource.js pour
 * l'implémentation réelle branchée sur `live_avatar_sessions/{id}/comments`.
 *
 * @param {{ subscribe: (sessionId: string, onComments: (comments: Array<{id: string, text: string, [k: string]: any}>) => void) => (() => void) }} commentSource
 * @param {string} sessionId
 * @param {(event: { comment: object, result: import('../../domain/entities/Intent.js').CommentIntentResult }) => void} onIntent
 * @returns {() => void} fonction de désabonnement
 */
export function observeSessionComments(commentSource, sessionId, onIntent) {
  if (!commentSource || typeof commentSource.subscribe !== 'function') {
    throw new Error('observeSessionComments: commentSource invalide (subscribe manquant).');
  }

  const seen = new Set();

  const unsubscribe = commentSource.subscribe(sessionId, (comments) => {
    for (const comment of comments ?? []) {
      if (!comment?.id || seen.has(comment.id)) continue;
      seen.add(comment.id);

      const result = analyzeComment(comment.text);
      onIntent({ comment, result });
    }
  });

  return typeof unsubscribe === 'function' ? unsubscribe : () => {};
}