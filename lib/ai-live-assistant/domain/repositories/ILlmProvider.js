/**
 * ILlmProvider — contrat commun à tous les fournisseurs LLM (Module 3,
 * FriTok AI Live Assistant).
 *
 * ⚠️ SERVER-ONLY : les implémentations lisent des clés API / secrets
 * depuis process.env. Aucun fichier de data/llm/ ne doit jamais être
 * importé dans un composant 'use client' ou finir dans un bundle
 * navigateur. Ils sont destinés à être appelés depuis une future Netlify
 * Function (même posture que avatar-viewer-track.js /
 * create-avatar-session.js : logique sensible côté serveur uniquement),
 * jamais directement depuis le client — cohérent avec le pattern déjà en
 * place dans tout le reste de FriTok (voir firestore.rules :
 * `allow write: if false` partout où une Netlify Function fait foi).
 *
 * @typedef {Object} LlmMessage
 * @property {'user'|'assistant'} role
 * @property {string} content
 *
 * @typedef {Object} LlmGenerateParams
 * @property {LlmMessage[]} messages
 * @property {string} [system] - instruction système (persona du
 *   co-présentateur IA, contraintes de style, etc.)
 * @property {number} [maxTokens]
 * @property {number} [temperature]
 *
 * @typedef {Object} LlmUsage
 * @property {number} inputTokens
 * @property {number} outputTokens
 *
 * @typedef {Object} LlmResponse
 * @property {string} text
 * @property {string} provider
 * @property {LlmUsage} usage
 * @property {any} raw - réponse brute du fournisseur, pour debug/logs uniquement
 *
 * @typedef {Object} ILlmProvider
 * @property {string} name
 * @property {(params: LlmGenerateParams) => Promise<LlmResponse>} generate
 */

/**
 * Garde-fou d'exécution : vérifie qu'un objet respecte bien le contrat
 * ILlmProvider avant de le laisser circuler dans le reste du système.
 * Utile car JS n'a pas d'interfaces statiques — sans ça, une erreur de
 * câblage dans un adaptateur ne se verrait qu'au premier appel réel
 * (donc en prod, potentiellement après avoir déjà payé un appel LLM).
 *
 * @param {any} provider
 * @returns {ILlmProvider}
 */
export function assertImplementsLlmProvider(provider) {
  if (
    !provider ||
    typeof provider.name !== 'string' ||
    provider.name.length === 0 ||
    typeof provider.generate !== 'function'
  ) {
    throw new Error(
      'Fournisseur LLM invalide : un ILlmProvider doit exposer { name: string, generate: Function }.'
    );
  }
  return provider;
}