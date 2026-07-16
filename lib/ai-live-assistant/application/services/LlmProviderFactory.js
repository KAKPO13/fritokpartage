import { createClaudeProvider } from '../../data/llm/ClaudeProvider.js';
import { createOpenAiProvider } from '../../data/llm/OpenAiProvider.js';
import { createGeminiProvider } from '../../data/llm/GeminiProvider.js';
import { createVertexAiProvider } from '../../data/llm/VertexAiProvider.js';
import { assertImplementsLlmProvider } from '../../domain/repositories/ILlmProvider.js';

const PROVIDER_BUILDERS = Object.freeze({
  claude: createClaudeProvider,
  openai: createOpenAiProvider,
  gemini: createGeminiProvider,
  vertex: createVertexAiProvider,
});

/**
 * createLlmProvider — point d'entrée UNIQUE du Module 3.
 *
 * Aucun fournisseur n'est codé en dur ailleurs dans le système : tout
 * appelant (Response Manager, Module 4, etc.) passe par cette factory en
 * lui donnant un nom de fournisseur qui vient de la config (variable
 * d'environnement, réglage vendeur en base, etc.) — jamais une valeur
 * figée dans le code appelant. Changer de fournisseur par défaut, ou
 * permettre à un vendeur de choisir le sien, ne touche donc à rien
 * d'autre que cette fonction ou la source de config qui l'alimente.
 *
 * @param {'claude'|'openai'|'gemini'|'vertex'} providerName
 * @param {object} [options] - transmis tel quel à l'adaptateur choisi
 *   (apiKey, model, fetchImpl, getAccessToken selon le fournisseur —
 *   voir chaque fichier dans data/llm/ pour ses options spécifiques)
 * @returns {import('../../domain/repositories/ILlmProvider.js').ILlmProvider}
 */
export function createLlmProvider(providerName, options = {}) {
  const build = PROVIDER_BUILDERS[providerName];
  if (!build) {
    throw new Error(
      `createLlmProvider: fournisseur inconnu "${providerName}". ` +
      `Valeurs valides: ${Object.keys(PROVIDER_BUILDERS).join(', ')}.`
    );
  }
  return assertImplementsLlmProvider(build(options));
}

/**
 * resolveDefaultProviderName — centralise la lecture du fournisseur par
 * défaut (variable d'environnement AI_LLM_PROVIDER), avec repli explicite
 * sur 'claude'. Évite de disperser ce choix dans chaque appelant.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {'claude'|'openai'|'gemini'|'vertex'}
 */
export function resolveDefaultProviderName(env = process.env) {
  return env.AI_LLM_PROVIDER || 'claude';
}

/**
 * Liste des noms de fournisseurs supportés — utile pour valider un choix
 * venant d'une config externe (ex: réglage vendeur) avant d'appeler
 * createLlmProvider.
 */
export const SUPPORTED_PROVIDERS = Object.freeze(Object.keys(PROVIDER_BUILDERS));