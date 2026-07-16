'use client';

import { useEffect, useRef } from 'react';
import { useCommentIntentObserver } from './useCommentIntentObserver.js';
import { triggerAiReply } from '../data/firestore/TriggerAiReply.js';

/**
 * AiLiveAssistantBridge — point de câblage unique entre l'existant et le
 * FriTok AI Live Assistant.
 *
 * Usage prévu (voir la proposition d'architecture) : monté en FRÈRE de
 * `<UltraLivePage>` dans MultiLiveFeedPage.js, jamais en parent/enfant
 * modifié :
 *
 *   <UltraLivePage sessionId={sess.id} viewerId={viewerId} isActive={...} />
 *   <AiLiveAssistantBridge sessionId={sess.id} enabled={isActive && isCurrent} />
 *
 * Ne rend RIEN visuellement (retourne null) : la réponse IA apparaît
 * dans le fil de commentaires existant, via le onSnapshot déjà en place
 * dans UltraLivePage.js — ce composant ne fait qu'observer et déclencher.
 *
 * Dédoublonnage CÔTÉ CLIENT (best-effort, pas la garantie principale) :
 * évite de rappeler la fonction serveur plusieurs fois pour le même
 * commentaire depuis CE navigateur si le hook re-déclenche par erreur.
 * Le verrou serveur (`ai_events`, voir AdminAiEventsRepository.js) reste
 * la seule garantie réelle contre les doublons entre spectateurs
 * différents.
 *
 * @param {{ sessionId: string, enabled?: boolean }} props
 */
export default function AiLiveAssistantBridge({ sessionId, enabled = true }) {
  const { lastActionable } = useCommentIntentObserver(sessionId, { enabled });
  const triggeredIds = useRef(new Set());

  useEffect(() => {
    if (!lastActionable?.comment?.id) return;

    const commentId = lastActionable.comment.id;
    if (triggeredIds.current.has(commentId)) return;
    triggeredIds.current.add(commentId);

    triggerAiReply(sessionId, commentId).catch((e) => {
      // Échec silencieux côté UI : un raté ici ne doit jamais perturber
      // l'expérience du live existant (comme les catch silencieux déjà
      // présents dans UltraLivePage.js pour like/comment/reaction).
      console.warn('⚠️ triggerAiReply:', e.message);
    });
  }, [lastActionable, sessionId]);

  return null;
}
