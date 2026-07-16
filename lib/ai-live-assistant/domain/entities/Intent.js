/**
 * Intent — types d'intention qu'un commentaire de live peut exprimer.
 *
 * Module 1 (CommentAnalyzer) — FriTok AI Live Assistant.
 * Ce fichier n'a AUCUNE dépendance (ni Firestore, ni React, ni LLM) :
 * c'est une entité de domaine pure, réutilisable côté client comme
 * côté serveur (future Netlify Function), et facilement testable.
 */

export const Intent = Object.freeze({
  QUESTION: 'QUESTION',                 // question générale sur le produit
  PRICE_REQUEST: 'PRICE_REQUEST',        // "combien ça coûte ?"
  AVAILABILITY: 'AVAILABILITY',          // "vous avez encore du stock ?"
  DELIVERY: 'DELIVERY',                  // "vous livrez où / en combien de temps ?"
  PAYMENT: 'PAYMENT',                    // "je peux payer comment ?"
  ORDER: 'ORDER',                        // "je prends / je commande"
  DEMO_REQUEST: 'DEMO_REQUEST',          // "montrez sous un autre angle"
  COMPLAINT: 'COMPLAINT',                // insatisfaction / réclamation
  SPAM: 'SPAM',                          // lien, sollicitation hors-sujet, flood
  CHITCHAT: 'CHITCHAT',                  // aucune intention actionnable détectée
});

/**
 * Intentions qui doivent normalement déclencher une escalade vers le
 * Response Manager (Module 4). CHITCHAT et SPAM ne déclenchent jamais
 * de réponse IA — c'est le premier filtre gratuit de la stratégie de
 * coût (Niveau 0 : ignorer avant même de penser à un LLM).
 */
export const ACTIONABLE_INTENTS = Object.freeze([
  Intent.QUESTION,
  Intent.PRICE_REQUEST,
  Intent.AVAILABILITY,
  Intent.DELIVERY,
  Intent.PAYMENT,
  Intent.ORDER,
  Intent.DEMO_REQUEST,
  Intent.COMPLAINT,
]);

/**
 * @typedef {Object} CommentIntentResult
 * @property {string} intent          - une valeur de Intent
 * @property {number} confidence      - 0..1, heuristique (nb de règles matchées)
 * @property {boolean} isSpam
 * @property {string[]} matchedKeywords
 * @property {string} normalizedText  - texte tel qu'analysé (utile pour debug/tests)
 */