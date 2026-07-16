const DEFAULT_MODEL = 'claude-sonnet-4-6';
const ENDPOINT = 'https://api.anthropic.com/v1/messages';

/**
 * createClaudeProvider — adaptateur Anthropic pour ILlmProvider.
 *
 * SERVER-ONLY (voir domain/repositories/ILlmProvider.js). `fetchImpl` est
 * injectable pour permettre les tests unitaires sans appel réseau réel.
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
        throw new Error('ClaudeProvider: ANTHROPIC_API_KEY manquante.');
      }
      if (!Array.isArray(messages) || messages.length === 0) {
        throw new Error('ClaudeProvider: messages requis (tableau non vide).');
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
        throw new Error(`ClaudeProvider: ${data?.error?.message || res.statusText}`);
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