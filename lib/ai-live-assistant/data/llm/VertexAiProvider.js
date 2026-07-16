const DEFAULT_MODEL = 'gemini-1.5-flash';

/**
 * createVertexAiProvider — adaptateur Vertex AI (Google Cloud) pour
 * ILlmProvider.
 *
 * Différence structurelle avec GeminiProvider : Vertex AI s'authentifie
 * par OAuth2 (compte de service), pas par une simple clé API. Plutôt que
 * de coder en dur une librairie d'auth (google-auth-library, JWT signing,
 * etc.) dans ce module, `getAccessToken` est reçu en injection de
 * dépendance — à brancher plus tard (ex: google-auth-library côté
 * Netlify Function) sans toucher à cet adaptateur ni à
 * LlmProviderFactory. C'est le même principe d'abstraction que pour les
 * autres fournisseurs : rien dans le reste du système ne dépend du détail
 * d'authentification d'un fournisseur donné.
 *
 * SERVER-ONLY (voir domain/repositories/ILlmProvider.js). `fetchImpl` est
 * injectable pour les tests.
 *
 * @param {{
 *   project?: string,
 *   location?: string,
 *   model?: string,
 *   getAccessToken?: () => Promise<string>,
 *   fetchImpl?: typeof fetch
 * }} [config]
 * @returns {import('../../domain/repositories/ILlmProvider.js').ILlmProvider}
 */
export function createVertexAiProvider({
  project = process.env.VERTEX_PROJECT_ID,
  location = process.env.VERTEX_LOCATION || 'us-central1',
  model = DEFAULT_MODEL,
  getAccessToken,
  fetchImpl = fetch,
} = {}) {
  return {
    name: 'vertex',

    async generate({ messages, system, maxTokens = 1000, temperature = 0.7 }) {
      if (!project) {
        throw new Error('VertexAiProvider: VERTEX_PROJECT_ID manquant.');
      }
      if (typeof getAccessToken !== 'function') {
        throw new Error(
          'VertexAiProvider: getAccessToken (OAuth2 compte de service) manquant — voir le commentaire en tête de fichier.'
        );
      }
      if (!Array.isArray(messages) || messages.length === 0) {
        throw new Error('VertexAiProvider: messages requis (tableau non vide).');
      }

      const accessToken = await getAccessToken();
      const endpoint =
        `https://${location}-aiplatform.googleapis.com/v1/projects/${project}` +
        `/locations/${location}/publishers/google/models/${model}:generateContent`;

      const contents = messages.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

      const res = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          contents,
          ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
          generationConfig: { maxOutputTokens: maxTokens, temperature },
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(`VertexAiProvider: ${data?.error?.message || res.statusText}`);
      }

      const text = (data.candidates?.[0]?.content?.parts ?? [])
        .map((p) => p.text)
        .join('\n');

      return {
        text,
        provider: 'vertex',
        usage: {
          inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
          outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
        },
        raw: data,
      };
    },
  };
}