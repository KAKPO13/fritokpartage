/**
 * createNullKnowledgeProvider — implémentation PLACEHOLDER de
 * IKnowledgeProvider, en attendant la construction réelle du Module 2
 * (Knowledge Engine).
 *
 * Retourne systématiquement `{ found: false }` : c'est un choix
 * DÉLIBÉRÉ, pas un oubli. Tant que le Knowledge Engine réel n'existe
 * pas, le Response Manager ne doit jamais prétendre avoir une réponse
 * fondée sur des données produit — "ne jamais inventer une réponse"
 * s'applique dès ce stade, pas seulement une fois le Module 2 écrit.
 *
 * À remplacer par le vrai Knowledge Engine (lecture products/boutiques/
 * FAQ/politiques de retour — schéma encore à fournir) sans toucher au
 * Response Manager : il suffit de passer une autre implémentation de
 * IKnowledgeProvider à `createResponseManager`.
 *
 * @returns {import('../../domain/repositories/IKnowledgeProvider.js').IKnowledgeProvider}
 */
export function createNullKnowledgeProvider() {
  return {
    async getAnswer(/* query */) {
      return { found: false };
    },
  };
}