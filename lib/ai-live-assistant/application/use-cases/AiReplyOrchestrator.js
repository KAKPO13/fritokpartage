import { analyzeComment } from '../../services/CommentAnalyzer.js';
import { ACTIONABLE_INTENTS } from '../../domain/entities/Intent.js';

/**
 * handleCommentAiReply — orchestrateur du pipeline "brancher l'IA au live
 * avatar", entièrement DÉCOUPLÉ de Firestore/Admin SDK. Toutes les
 * dépendances sont injectées (voir `deps`), ce qui permet de tester toute
 * la logique métier (verrou, rate-limit, re-détection d'intention,
 * court-circuits) sans jamais toucher à Firebase — les implémentations
 * réelles vivent dans data/firestore-admin/ et sont branchées uniquement
 * dans la Netlify Function `ai-live-respond.js`.
 *
 * Étapes, dans cet ordre :
 *   1. Verrou (`acquireLock`) — plusieurs spectateurs peuvent déclencher
 *      le même commentaire en même temps ; un seul doit produire une
 *      réponse.
 *   2. Lecture du commentaire RÉEL depuis Firestore (jamais le texte
 *      envoyé par le client — un client pourrait mentir sur le contenu
 *      pour forcer un appel LLM arbitraire).
 *   3. RE-détection de l'intention côté serveur (Module 1) — jamais
 *      confiance à une intention envoyée par le client, pour la même
 *      raison.
 *   4. Rate-limit par session — évite un pic de coût si beaucoup de
 *      commentaires actionables arrivent d'un coup.
 *   5. Response Manager (Module 4, qui enchaîne lui-même Knowledge
 *      Engine puis LLM Provider).
 *   6. Écriture de la réponse IA comme un commentaire normal, puis
 *      journalisation du résultat (`markOutcome`) pour analytics/debug.
 *
 * @param {{
 *   sessionId: string,
 *   commentId: string,
 *   deps: {
 *     acquireLock: (sessionId: string, commentId: string) => Promise<boolean>,
 *     getComment: (sessionId: string, commentId: string) => Promise<{ text: string }|null>,
 *     checkRateLimit: (sessionId: string) => Promise<boolean>,
 *     responseManager: { handleIntent: (params: object) => Promise<object> },
 *     writeAiReply: (sessionId: string, commentId: string, text: string) => Promise<void>,
 *     markOutcome: (sessionId: string, commentId: string, outcome: object) => Promise<void>,
 *   }
 * }} params
 * @returns {Promise<{ outcome: string, reason?: string, mode?: string }>}
 */
export async function handleCommentAiReply({ sessionId, commentId, deps }) {
  if (!sessionId) throw new Error('handleCommentAiReply: sessionId requis.');
  if (!commentId) throw new Error('handleCommentAiReply: commentId requis.');

  const { acquireLock, getComment, checkRateLimit, responseManager, writeAiReply, markOutcome } = deps;

  // 1. Verrou — dédoublonnage entre spectateurs qui déclenchent le même commentaire.
  const gotLock = await acquireLock(sessionId, commentId);
  if (!gotLock) {
    return { outcome: 'skipped', reason: 'already_handled' };
  }

  // 2. Lecture réelle du commentaire (jamais le texte fourni par le client).
  const comment = await getComment(sessionId, commentId);
  if (!comment?.text) {
    await markOutcome(sessionId, commentId, { status: 'error', reason: 'comment_not_found' });
    return { outcome: 'error', reason: 'comment_not_found' };
  }

  // 3. Re-détection serveur de l'intention (Module 1).
  const intentResult = analyzeComment(comment.text);
  if (!ACTIONABLE_INTENTS.includes(intentResult.intent)) {
    await markOutcome(sessionId, commentId, { status: 'skipped', reason: 'not_actionable' });
    return { outcome: 'skipped', reason: 'not_actionable' };
  }

  // 4. Rate-limit par session.
  const withinRateLimit = await checkRateLimit(sessionId);
  if (!withinRateLimit) {
    await markOutcome(sessionId, commentId, { status: 'skipped', reason: 'rate_limited' });
    return { outcome: 'skipped', reason: 'rate_limited' };
  }

  // 5. Response Manager (Module 4) : cache → Knowledge Engine → LLM.
  const result = await responseManager.handleIntent({
    sessionId,
    comment: { id: commentId, text: comment.text },
    intentResult,
  });

  if (result.skipped || !result.text) {
    await markOutcome(sessionId, commentId, { status: 'skipped', reason: result.reason ?? 'no_text' });
    return { outcome: 'skipped', reason: result.reason ?? 'no_text' };
  }

  // 6. Écriture + journalisation.
  //
  // Note : on écrit `result.text` quel que soit `result.mode`
  // (TEXT/VOICE/AVATAR). Les Modules 6/7 (Voice/Avatar Reply) n'existent
  // pas encore — en attendant, TOUTE réponse s'affiche en texte dans le
  // chat, ce qui satisfait "texte fonctionnel à 100%" dès maintenant.
  // `mode` reste journalisé dans `ai_events` pour que les Modules 6/7,
  // une fois construits, puissent reprendre exactement ces décisions
  // sans recalculer quoi que ce soit.
  await writeAiReply(sessionId, commentId, result.text);
  await markOutcome(sessionId, commentId, {
    status: 'answered',
    mode: result.mode,
    fromCache: result.fromCache,
    provider: result.provider,
  });

  return { outcome: 'answered', mode: result.mode };
}