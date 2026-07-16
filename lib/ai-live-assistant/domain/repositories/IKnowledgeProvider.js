/**
 * IKnowledgeProvider — contrat que devra respecter le futur Knowledge
 * Engine (Module 2, PAS ENCORE CONSTRUIT — schéma stock/variantes/
 * promotions/FAQ/retours pas encore fourni).
 *
 * Cette interface existe pour que le Response Manager (Module 4) puisse
 * être développé et testé DÈS MAINTENANT, sans bloquer sur le Module 2.
 * Le jour où le vrai Knowledge Engine sera construit, il suffira de lui
 * faire respecter ce contrat et de le passer à `createResponseManager` —
 * aucune ligne du Response Manager n'aura à changer.
 *
 * Principe non négociable hérité du cahier des charges : "ne jamais
 * inventer une réponse". Concrètement, si `getAnswer` retourne
 * `{ found: false }`, le Response Manager DOIT s'abstenir d'appeler le
 * LLM à l'aveugle plutôt que de lui laisser deviner une réponse produit.
 *
 * @typedef {Object} KnowledgeQuery
 * @property {string} intent
 * @property {string} normalizedText
 * @property {string} sessionId
 *
 * @typedef {Object} KnowledgeAnswer
 * @property {boolean} found
 * @property {string} [answer] - texte factuel, présent seulement si found === true
 * @property {string[]} [sourceRefs] - ex: ids de produits/FAQ utilisés, pour audit
 *
 * @typedef {Object} IKnowledgeProvider
 * @property {(query: KnowledgeQuery) => Promise<KnowledgeAnswer>} getAnswer
 */

/**
 * @param {any} provider
 * @returns {IKnowledgeProvider}
 */
export function assertImplementsKnowledgeProvider(provider) {
  if (!provider || typeof provider.getAnswer !== 'function') {
    throw new Error(
      'Fournisseur de connaissance invalide : un IKnowledgeProvider doit exposer { getAnswer: Function }.'
    );
  }
  return provider;
}