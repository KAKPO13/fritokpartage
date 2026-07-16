import { adminAuth, adminDb } from '../../app/lib/firebaseAdmin.js';
import { handleCommentAiReply } from '../../app/lib/ai-live-assistant/application/services/AiReplyOrchestrator.js';
import { createResponseManager } from '../../app/lib/ai-live-assistant/application/services/ResponseManager.js';
import { createLlmProvider, resolveDefaultProviderName } from '../../app/lib/ai-live-assistant/application/services/LlmProviderFactory.js';
import { createSessionProductKnowledgeProvider } from '../../app/lib/ai-live-assistant/data/knowledge/SessionProductKnowledgeProvider.js';
import { createAdminSessionSnapshotSource } from '../../app/lib/ai-live-assistant/data/firestore-admin/AdminSessionSnapshotSource.js';
import { createAdminAiCacheRepository } from '../../app/lib/ai-live-assistant/data/firestore-admin/AdminAiCacheRepository.js';
import { createAdminAiEventsRepository } from '../../app/lib/ai-live-assistant/data/firestore-admin/AdminAiEventsRepository.js';
import { createAdminCommentsRepository } from '../../app/lib/ai-live-assistant/data/firestore-admin/AdminCommentsRepository.js';

/**
 * POST /.netlify/functions/ai-live-respond
 * Body attendu : { sessionId: string, commentId: string }
 *
 * ⚠️ Chemins d'import ci-dessus supposent : ce fichier dans
 * `netlify/functions/ai-live-respond.js` (racine du repo, hors de
 * `app/` — convention Netlify par défaut), et `app/lib/firebaseAdmin.js`
 * + `app/lib/ai-live-assistant/` au même niveau que `app/lib/firebaseClient.js`
 * et `app/lib/avatarSessionApi.js` (déduit des imports croisés de
 * UltraLivePage.js : `@/lib/firebaseClient` + `../../lib/avatarSessionApi`
 * ne peuvent coïncider que si `@/` pointe vers `app/`). À corriger si
 * votre `netlify.toml` place `functions` ailleurs, ou si
 * `firebaseAdmin.js` vit hors de `app/lib/`.
 *
 * Ne fait AUCUNE logique métier elle-même : vérifie le token, câble les
 * adaptateurs Admin SDK, délègue tout à `handleCommentAiReply`
 * (Modules 1-4, entièrement testés sans Firebase — voir __tests__/).
 *
 * Sécurité :
 *   - Le texte du commentaire n'est jamais pris depuis le body de la
 *     requête, seulement `commentId` — le texte réel est relu depuis
 *     Firestore côté serveur (voir AdminCommentsRepository.js), pour
 *     qu'un client ne puisse pas faire dire n'importe quoi au commentaire
 *     et forcer un appel LLM arbitraire.
 *   - Idem pour l'intention : re-détectée serveur, jamais reçue du client.
 */
const ALLOWED_ORIGINS = ['https://fritok.net', 'http://localhost:8888'];

function corsHeaders(event) {
  const origin = event.headers.origin || event.headers.Origin;
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function handler(event) {
  // Préflight CORS : le header `Authorization` + `Content-Type: application/json`
  // déclenche un préflight navigateur. Sans réponse explicite à OPTIONS,
  // le POST réel n'est jamais envoyé — voir netlify.toml, section
  // Netlify Functions : "le header dynamique Access-Control-Allow-Origin
  // doit être géré dans chaque Function".
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(event), body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders(event), body: JSON.stringify({ error: 'Méthode non autorisée' }) };
  }

  const authHeader = event.headers.authorization || event.headers.Authorization;
  const idToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!idToken) {
    return { statusCode: 401, headers: corsHeaders(event), body: JSON.stringify({ error: 'Token manquant' }) };
  }

  try {
    await adminAuth.verifyIdToken(idToken);
  } catch {
    return { statusCode: 401, headers: corsHeaders(event), body: JSON.stringify({ error: 'Token invalide' }) };
  }

  let sessionId, commentId;
  try {
    ({ sessionId, commentId } = JSON.parse(event.body || '{}'));
  } catch {
    return { statusCode: 400, headers: corsHeaders(event), body: JSON.stringify({ error: 'Corps de requête invalide' }) };
  }

  if (!sessionId || !commentId) {
    return { statusCode: 400, headers: corsHeaders(event), body: JSON.stringify({ error: 'sessionId et commentId requis' }) };
  }

  try {
    const aiEvents = createAdminAiEventsRepository({ db: adminDb });
    const comments = createAdminCommentsRepository({ db: adminDb });

    const responseManager = createResponseManager({
      llmProvider: createLlmProvider(resolveDefaultProviderName()),
      knowledgeProvider: createSessionProductKnowledgeProvider({
        sessionSnapshotSource: createAdminSessionSnapshotSource({ db: adminDb }),
      }),
      cacheRepository: createAdminAiCacheRepository({ db: adminDb }),
    });

    const result = await handleCommentAiReply({
      sessionId,
      commentId,
      deps: {
        acquireLock: aiEvents.acquireLock,
        markOutcome: aiEvents.markOutcome,
        checkRateLimit: aiEvents.checkRateLimit,
        getComment: comments.getComment,
        writeAiReply: comments.writeAiReply,
        responseManager,
      },
    });

    return { statusCode: 200, headers: corsHeaders(event), body: JSON.stringify(result) };
  } catch (err) {
    console.error('⚠️ ai-live-respond:', err);
    return { statusCode: 500, headers: corsHeaders(event), body: JSON.stringify({ error: 'Erreur interne' }) };
  }
}