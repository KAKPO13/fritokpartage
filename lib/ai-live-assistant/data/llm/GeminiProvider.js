const DEFAULT_MODEL = 'gemini-1.5-flash';
const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * createGeminiProvider — adaptateur Gemini (API clé simple, Google AI
 * Studio — distinct de Vertex AI qui utilise OAuth2, voir
 * VertexAiProvider.js) pour ILlmProvider.
 *
 * SERVER-ONLY (voir domain/repositories/ILlmProvider.js). `fetchImpl` est
 * injectable pour les tests.
 *
 * @param {{ apiKey?: string, model?: string, fetchImpl?: typeof fetch }} [config]
 * @returns {import('../../domain/repositories/ILlmProvider.js').ILlmProvider}
 */
export function createGeminiProvider({
  apiKey = process.env.GEMINI_API_KEY,
  model = DEFAULT_MODEL,
  fetchImpl = fetch,
} = {}) {
  return {
    name: 'gemini',

    async generate({ messages, system, maxTokens = 1000, temperature = 0.7 }) {
      if (!apiKey) {
        throw new Error('GeminiProvider: GEMINI_API_KEY manquante.');
      }
      if (!Array.isArray(messages) || messages.length === 0) {
        throw new Error('GeminiProvider: messages requis (tableau non vide).');
      }
      

      const endpoint = `${BASE_URL}/${model}:generateContent?key=${apiKey}`;

      const contents = messages.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

      const res = await fetchImpl(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
          generationConfig: { maxOutputTokens: maxTokens, temperature },
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(`GeminiProvider: ${data?.error?.message || res.statusText}`);
      }

      const text = (data.candidates?.[0]?.content?.parts ?? [])
        .map((p) => p.text)
        .join('\n');

      return {
        text,
        provider: 'gemini',
        usage: {
          inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
          outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
        },
        raw: data,
      };
    },
  };
}