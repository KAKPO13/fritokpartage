const DEFAULT_MODEL = 'claude-sonnet-4-6';
const ENDPOINT = 'https://api.anthropic.com/v1/messages';

/**
 * createClaudeProvider — adaptateur Anthropic pour ILlmProvider.
 *
 * SERVER-ONLY (voir domain/repositories/ILlmProvider.js). `fetchImpl` est
 * injectable pour permettre les tests unitaires sans appel réseau réel.
 *
 * Les erreurs renvoyées par generate() portent un champ `.code` :
 *   - 'insufficient_credit' : solde de crédit Anthropic insuffisant
 *     (message API contenant "credit balance") — cas attendu en
 *     production tant que le compte n'est pas rechargé, PAS un bug de
 *     code. ResponseManager.js intercepte ce code pour renvoyer un
 *     `skipped` propre plutôt que de laisser planter tout le pipeline
 *     (voir ce fichier pour le traitement).
 *   - 'llm_request_failed' : toute autre erreur API (clé invalide,
 *     requête malformée, erreur réseau, etc.).
 * Ce code permet à l'appelant de distinguer une erreur "config/billing"
 * (récupérable en rechargeant le compte, ne doit jamais faire planter
 * l'affichage des commentaires humains) d'un vrai bug à corriger.
 *
 * @param {{ apiKey?: string, model?: string, fetchImpl?: typeof fetch }} [config]
 * @returns {import('../../domain/repositories/ILlmProvider.js').ILlmProvider}
 */
export function createClaudeProvider({
  apiKey = process.env.ANTHROPIC_API_KEY,
  model = DEFAULT_MODEL,
  fetchImpl = fetch,
} = {}) {
  return {
    name: 'claude',

    async generate({ messages, system, maxTokens = 1000, temperature = 0.7 }) {
      if (!apiKey) {
        const error = new Error('ClaudeProvider: ANTHROPIC_API_KEY manquante.');
        error.code = 'llm_request_failed';
        error.provider = 'claude';
        throw error;
      }
      if (!Array.isArray(messages) || messages.length === 0) {
        const error = new Error('ClaudeProvider: messages requis (tableau non vide).');
        error.code = 'llm_request_failed';
        error.provider = 'claude';
        throw error;
      }

      const res = await fetchImpl(ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          temperature,
          ...(system ? { system } : {}),
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message = data?.error?.message || res.statusText;
        const error = new Error(`ClaudeProvider: ${message}`);
        error.code = /credit balance/i.test(message) ? 'insufficient_credit' : 'llm_request_failed';
        error.provider = 'claude';
        error.status = res.status;
        throw error;
      }

      const text = (data.content ?? [])
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('\n');

      return {
        text,
        provider: 'claude',
        usage: {
          inputTokens: data.usage?.input_tokens ?? 0,
          outputTokens: data.usage?.output_tokens ?? 0,
        },
        raw: data,
      };
    },
  };
}