import { Intent } from '../../domain/entities/Intent.js';
import { ResponseMode } from '../../domain/entities/ResponseMode.js';

/**
 * DEFAULT_MODE_RULES — table de décision par défaut, conforme au cahier
 * des charges :
 *   "Si la question est simple → réponse texte
 *    Si la réponse nécessite une explication → voix
 *    Si la réponse mérite une démonstration → avatar"
 *
 * Exposée en tant que config (pas un switch enfoui dans une fonction) —
 * un vendeur ou un futur réglage produit pourra la surcharger sans
 * toucher à decideResponseMode lui-même.
 */
export const DEFAULT_MODE_RULES = Object.freeze({
  // Réponse courte et factuelle → texte, le plus rapide et le moins cher.
  [Intent.PRICE_REQUEST]: ResponseMode.TEXT,
  [Intent.AVAILABILITY]: ResponseMode.TEXT,
  [Intent.ORDER]: ResponseMode.TEXT,

  // Réponse qui bénéficie d'une explication (ton, nuance, empathie) → voix.
  [Intent.DELIVERY]: ResponseMode.VOICE,
  [Intent.PAYMENT]: ResponseMode.VOICE,
  [Intent.COMPLAINT]: ResponseMode.VOICE,
  [Intent.QUESTION]: ResponseMode.VOICE,

  // Mérite une démonstration visuelle → avatar (coût le plus élevé, donc
  // réservé aux cas qui le justifient vraiment).
  [Intent.DEMO_REQUEST]: ResponseMode.AVATAR,

  // CHITCHAT / SPAM : volontairement absents de cette table → aucun mode,
  // donc aucune réponse IA (voir ACTIONABLE_INTENTS dans Intent.js).
});


/**
 * decideResponseMode — choisit le mode de réponse pour une intention
 * donnée. Retourne `null` si l'intention ne doit déclencher aucune
 * réponse IA (CHITCHAT, SPAM, ou toute intention absente de la table).
 *
 * @param {string} intent - une valeur de Intent
 * @param {Record<string, string>} [rules] - table de décision (surchargeable)
 * @returns {string|null} une valeur de ResponseMode, ou null
 */
export function decideResponseMode(intent, rules = DEFAULT_MODE_RULES) {
  return rules[intent] ?? null;
}