const DEFAULT_MODEL = 'gpt-4o-mini';
const ENDPOINT = 'https://api.openai.com/v1/chat/completions';

/**
 * createOpenAiProvider — adaptateur GPT (OpenAI) pour ILlmProvider.
 *
 * SERVER-ONLY (voir domain/repositories/ILlmProvider.js). `fetchImpl` est
 * injectable pour les tests.
 *
 * @param {{ apiKey?: string, model?: string, fetchImpl?: typeof fetch }} [config]
 * @returns {import('../../domain/repositories/ILlmProvider.js').ILlmProvider}
 */
export function createOpenAiProvider({
  apiKey = process.env.OPENAI_API_KEY,
  model = DEFAULT_MODEL,
  fetchImpl = fetch,
} = {}) {
  return {
    name: 'openai',

    async generate({ messages, system, maxTokens = 1000, temperature = 0.7 }) {
      if (!apiKey) {
        throw new Error('OpenAiProvider: OPENAI_API_KEY manquante.');
      }
      if (!Array.isArray(messages) || messages.length === 0) {
        throw new Error('OpenAiProvider: messages requis (tableau non vide).');
      }

      const chatMessages = [
        ...(system ? [{ role: 'system', content: system }] : []),
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ];

      const res = await fetchImpl(ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: chatMessages,
          max_tokens: maxTokens,
          temperature,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(`OpenAiProvider: ${data?.error?.message || res.statusText}`);
      }

      const text = data.choices?.[0]?.message?.content ?? '';

      return {
        text,
        provider: 'openai',
        usage: {
          inputTokens: data.usage?.prompt_tokens ?? 0,
          outputTokens: data.usage?.completion_tokens ?? 0,
        },
        raw: data,
      };
    },
  };
}