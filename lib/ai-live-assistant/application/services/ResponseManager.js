import { ACTIONABLE_INTENTS } from '../../domain/entities/Intent.js';
import { assertImplementsLlmProvider } from '../../domain/repositories/ILlmProvider.js';
import { assertImplementsKnowledgeProvider } from '../../domain/repositories/IKnowledgeProvider.js';
import { assertImplementsCacheRepository } from '../../domain/repositories/ICacheRepository.js';
import { createNullKnowledgeProvider } from '../../data/knowledge/NullKnowledgeProvider.js';
import { createInMemoryCacheRepository } from '../../data/cache/InMemoryCacheRepository.js';
import { decideResponseMode } from './ResponseModeDecider.js';

/**
 * @param {{ answer: string, sourceRefs?: string[] }} knowledge
 */
function defaultSystemPromptBuilder({ knowledge }) {
  return [
    "Tu es le co-présentateur IA d'un live commerce FriTok.",
    'Réponds au commentaire du spectateur en te basant UNIQUEMENT sur les',
    "informations vérifiées ci-dessous. N'invente jamais un prix, un délai,",
    'un stock ou une politique qui ne figure pas dans ces informations :',
    knowledge.answer,
    'Reste bref, chaleureux, et écris en français.',
  ].join('\n');
}

function buildCacheKey(sessionId, intentResult) {
  // Mutualisation : deux utilisateurs différents posant "la même
  // question" (même intention + même texte normalisé) dans la même
  // session partagent la même entrée de cache — un seul appel LLM sert
  // tout le monde. Portée par session (pas globale) car la connaissance
  // pertinente (produits, promos, vendeur) diffère d'une session à l'autre.
  return `${sessionId}::${intentResult.intent}::${intentResult.normalizedText}`;
}

/**
 * createResponseManager — Module 4, orchestrateur central du FriTok AI
 * Live Assistant.
 *
 * Applique la stratégie de coût du cahier des charges, dans l'ordre :
 *   0. Intention non actionable (CHITCHAT/SPAM) → on ignore, coût nul.
 *   1. Cache (mutualisation inter-utilisateurs) → si trouvé, aucun appel LLM.
 *   2. Knowledge Engine (Module 2) → si aucune connaissance fondée n'est
 *      trouvée, on N'APPELLE PAS le LLM (pas de réponse inventée).
 *   3. LLM (Module 3, fournisseur choisi via la factory, jamais codé en
 *      dur ici) → seulement si les étapes précédentes n'ont pas suffi.
 *
 * Le mode de réponse (texte/voix/avatar) est décidé indépendamment de
 * l'appel LLM lui-même (voir ResponseModeDecider.js) : les Modules 5/6/7
 * (Text/Voice/Avatar Reply) consommeront `mode` pour savoir comment
 * restituer `text` au spectateur — ce n'est pas la responsabilité de ce
 * module.
 *
 * Résilience LLM : l'appel à `llmProvider.generate()` est encadré d'un
 * try/catch. Un fournisseur LLM peut échouer pour des raisons hors du
 * contrôle du code (crédit épuisé, clé invalide, panne réseau) — ce
 * n'est jamais une raison de laisser l'exception remonter jusqu'à
 * `ai-live-respond.js` (qui répondrait 500 et journalise du bruit dans
 * les logs pour un problème de facturation, pas un bug). On renvoie donc
 * un `skipped` avec la raison qualifiée, exactement comme les autres
 * court-circuits (cache manquant, connaissance introuvable) — et
 * surtout, ça n'affecte JAMAIS l'affichage des commentaires humains, qui
 * est un flux Firestore entièrement indépendant de ce module.
 *
 * @param {{
 *   llmProvider: import('../../domain/repositories/ILlmProvider.js').ILlmProvider,
 *   knowledgeProvider?: import('../../domain/repositories/IKnowledgeProvider.js').IKnowledgeProvider,
 *   cacheRepository?: import('../../domain/repositories/ICacheRepository.js').ICacheRepository,
 *   systemPromptBuilder?: (ctx: { intentResult: object, knowledge: object }) => string,
 *   modeRules?: Record<string, string>,
 * }} deps
 */
export function createResponseManager({
  llmProvider,
  knowledgeProvider = createNullKnowledgeProvider(),
  cacheRepository = createInMemoryCacheRepository(),
  systemPromptBuilder = defaultSystemPromptBuilder,
  modeRules,
} = {}) {
  assertImplementsLlmProvider(llmProvider);
  assertImplementsKnowledgeProvider(knowledgeProvider);
  assertImplementsCacheRepository(cacheRepository);

  return {
    /**
     * @param {{
     *   sessionId: string,
     *   comment: { id: string, text: string, [k: string]: any },
     *   intentResult: import('../../domain/entities/Intent.js').CommentIntentResult,
     * }} params
     */
    async handleIntent({ sessionId, comment, intentResult }) {
      if (!sessionId) throw new Error('ResponseManager: sessionId requis.');
      if (!comment?.text) throw new Error('ResponseManager: comment.text requis.');
      if (!intentResult?.intent) throw new Error('ResponseManager: intentResult.intent requis.');

      // Niveau 0 — filtre gratuit, avant tout le reste.
      if (!ACTIONABLE_INTENTS.includes(intentResult.intent)) {
        return { skipped: true, reason: 'not_actionable', mode: null };
      }

      const mode = decideResponseMode(intentResult.intent, modeRules);
      if (!mode) {
        return { skipped: true, reason: 'no_mode_for_intent', mode: null };
      }

      const cacheKey = buildCacheKey(sessionId, intentResult);

      // Niveau 1 — cache / mutualisation.
      const cached = await cacheRepository.get(cacheKey);
      if (cached) {
        return { skipped: false, mode, text: cached, fromCache: true, provider: null, usage: null };
      }

      // Knowledge Engine — pas de réponse inventée si rien n'est trouvé.
      const knowledge = await knowledgeProvider.getAnswer({
        intent: intentResult.intent,
        normalizedText: intentResult.normalizedText,
        sessionId,
      });

      if (!knowledge?.found) {
        return { skipped: true, reason: 'no_knowledge', mode };
      }

      // Niveau 2/3 — appel LLM, seulement maintenant.
      const system = systemPromptBuilder({ intentResult, knowledge });

      let llmResponse;
      try {
        llmResponse = await llmProvider.generate({
          system,
          messages: [{ role: 'user', content: comment.text }],
          maxTokens: 300,
        });
      } catch (err) {
        // Voir la note "Résilience LLM" ci-dessus : on ne relance jamais
        // cette erreur telle quelle. `err.code` vient du provider
        // (ex: ClaudeProvider.js) — 'insufficient_credit' est un cas
        // attendu en production (compte à recharger), tout le reste
        // ('llm_request_failed' ou un code absent) reste distingué dans
        // `reason` pour rester visible dans les logs `ai_events` sans
        // jamais faire planter le pipeline.
        return {
          skipped: true,
          reason: err?.code === 'insufficient_credit' ? 'llm_insufficient_credit' : 'llm_request_failed',
          mode,
        };
      }

      await cacheRepository.set(cacheKey, llmResponse.text);

      return {
        skipped: false,
        mode,
        text: llmResponse.text,
        fromCache: false,
        provider: llmResponse.provider,
        usage: llmResponse.usage,
      };
    },
  };
}