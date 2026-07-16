/**
 * ResponseMode — les 3 modes de réponse du FriTok AI Live Assistant,
 * dans l'ordre STRICT de la stratégie de coût du cahier des charges :
 *
 *   Niveau 1 → TEXT   (le plus rapide, le moins cher)
 *   Niveau 2 → VOICE  (nécessite une explication)
 *   Niveau 3 → AVATAR (mérite une démonstration)
 *
 * Le Response Manager (Module 4) ne choisit JAMAIS un niveau plus coûteux
 * que nécessaire — voir ResponseModeDecider.js.
 */
export const ResponseMode = Object.freeze({
  TEXT: 'TEXT',
  VOICE: 'VOICE',
  AVATAR: 'AVATAR',
});
