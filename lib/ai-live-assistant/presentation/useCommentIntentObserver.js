'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { observeSessionComments } from '../application/use-cases/ObserveSessionComments.js';
import { firestoreCommentSource } from '../data/firestore/FirestoreCommentSource.js';
import { ACTIONABLE_INTENTS } from '../domain/entities/Intent.js';

/**
 * useCommentIntentObserver — Module 1 (CommentAnalyzer), couche
 * présentation.
 *
 * Usage prévu : monté en FRÈRE de <UltraLivePage> dans
 * MultiLiveFeedPage.js (jamais en parent/enfant modifié), il observe le
 * même flux de commentaires en lecture seule et expose la dernière
 * intention "actionable" détectée — prête à être consommée par le futur
 * Response Manager (Module 4). Aucune ligne des fichiers existants n'a
 * besoin d'être modifiée pour brancher ce hook.
 *
 * @param {string} sessionId
 * @param {{ enabled?: boolean }} [options] - enabled: false coupe l'écoute
 *   (ex: session hors-écran dans le flux vertical, pour ne pas analyser
 *   des commentaires que le viewer ne regarde pas — cohérent avec la
 *   fenêtre de préchargement PRELOAD_RADIUS de MultiLiveFeedPage.js).
 * @returns {{ lastActionable: null | { comment: object, result: object }, history: Array }}
 */
export function useCommentIntentObserver(sessionId, { enabled = true } = {}) {
  const [lastActionable, setLastActionable] = useState(null);
  const historyRef = useRef([]);

  const handleIntent = useCallback(({ comment, result }) => {
    // Historique borné (50 derniers) — utile pour un futur debug/analytics
    // (Module 12), jamais persisté depuis ce hook (lecture seule).
    historyRef.current = [...historyRef.current.slice(-49), { comment, result }];

    if (ACTIONABLE_INTENTS.includes(result.intent)) {
      setLastActionable({ comment, result });
    }
  }, []);


  useEffect(() => {
    if (!enabled || !sessionId) return undefined;

    const unsubscribe = observeSessionComments(
      firestoreCommentSource,
      sessionId,
      handleIntent
    );

    return () => {
      unsubscribe();
      historyRef.current = [];
    };
  }, [sessionId, enabled, handleIntent]);

  return { lastActionable, history: historyRef.current };
}