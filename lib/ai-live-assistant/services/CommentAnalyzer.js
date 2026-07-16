import { Intent } from '../domain/entities/Intent.js';

/**
 * CommentAnalyzer — Module 1 du FriTok AI Live Assistant.
 *
 * Détecte l'intention d'un commentaire de live à partir de règles
 * lexicales (français, avec variantes courantes CI/Afrique de l'Ouest :
 * "combien ça fait", "c'est combien", "orange money", "wave", etc.).
 * Aucun appel réseau, aucun LLM : coût nul, latence nulle, 100%
 * déterministe et testable.
 *
 * Conforme à la philosophie du système :
 *   Niveau 1 (règles locales) → seul ce module tourne par défaut.
 *   Escalade vers Knowledge Engine / LLM (Modules 2-4) uniquement si
 *   l'intention est "actionable" (voir ACTIONABLE_INTENTS) ET qu'aucune
 *   réponse en cache ne correspond déjà (Module Cost Guard, plus tard).
 *
 * Ce module est un plain-object/fonctions pures, sans dépendance
 * Firestore/React : utilisable côté client (hook léger sur le flux
 * `comments` déjà en lecture) ET côté serveur (future Netlify Function)
 * sans dupliquer la logique.
 */

// ── Normalisation ────────────────────────────────────────────────────────
function normalize(text) {
  return (text ?? '')
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // retire les accents
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Règles par intention, ordre = priorité de tie-break ──────────────────
// Chaque règle est une liste de regex ; le score d'une intention est le
// nombre de règles distinctes qui matchent (pas le nombre d'occurrences).
const RULES = [
  {
    intent: Intent.ORDER,
    patterns: [
      /\bje prends\b/, /\bje commande\b/, /\bje veux (ca|ça|celui|celle|le|la)\b/,
      /\breserve(r|z)?\b/, /\bje le prends\b/, /\bok je prends\b/, /\bvalide(r|z)?\b/,
      /\bje l'achete\b/, /\bje l'achète\b/, /\bachete(r|z)? le\b/,
    ],
  },
  {
    intent: Intent.PRICE_REQUEST,
    patterns: [
      /\bcombien\b/, /\bc'est combien\b/, /\bca coute\b/, /\bça coûte\b/,
      /\bquel(le)? est le prix\b/, /\bprix\b/, /\btarif\b/, /\bcout\b/,
    ],
  },
  {
    intent: Intent.AVAILABILITY,
    patterns: [
      /\bdispo(nible)?\b/, /\bvous en avez encore\b/, /\ben stock\b/,
      /\bil en reste\b/, /\bencore disponible\b/, /\btaille\b.*\bdispo/,
    ],
  },
  {
    intent: Intent.DELIVERY,
    patterns: [
      /\blivr(e|é|ez|aison)\w*\b/, /\bvous livrez\b/, /\bdelai\b/, /\bdélai\b/,
      /\bcombien de temps\b.*\b(livr|arrive)/, /\bfrais de livraison\b/,
    ],
  },
  {
    intent: Intent.PAYMENT,
    patterns: [
      /\bpay(er|é)\b/, /\bpaiement\b/, /\borange money\b/, /\bwave\b/, /\bmtn money\b/,
      /\bmoov money\b/, /\ba la livraison\b/, /\bcash\b/, /\ben ligne\b.*\bpay/,
      /\bcarte bancaire\b/, /\bcb\b/,
    ],
  },
  {
    intent: Intent.DEMO_REQUEST,
    patterns: [
      /\bmontre(z)?\b/, /\bfaites voir\b/, /\bautre angle\b/, /\bzoom\b/,
      /\ba l'envers\b/, /\ben vrai\b/, /\bcomment ca marche\b/, /\bdemo\b/, /\bdémo\b/,
    ],
  },
  {
    intent: Intent.COMPLAINT,
    patterns: [
      /\barnaque\b/, /\bdecu\b/, /\bdéçu\b/, /\bnul\b/, /\bpas content\b/,
      /\bjamais recu\b/, /\bjamais reçu\b/, /\bprobleme\b/, /\bproblème\b/,
      /\bremboursement\b/, /\bplainte\b/, /\bscandaleux\b/,
    ],
  },
  {
    intent: Intent.QUESTION,
    patterns: [
      /\?\s*$/, /^(est-ce|comment|pourquoi|quand|ou|où|qui|quoi)\b/,
    ],
  },
];

// ── Détection spam ────────────────────────────────────────────────────────
// Override immédiat : liens, sollicitation vers un autre canal, flood de
// caractères. Ces signaux priment sur toute autre intention détectée.
const SPAM_PATTERNS = [
  /https?:\/\//, /\bwww\./, /\.(com|net|org|xyz|info)\b/,
  /\bwhatsapp\b.*\b\d{6,}/, /\btelegram\b/, /\bcontact(ez)?[- ]moi (au|sur)\b/,
  /(.)\1{6,}/, // un même caractère répété 7+ fois (flood)
];

function detectSpam(normalizedText) {
  return SPAM_PATTERNS.some((re) => re.test(normalizedText));
}

/**
 * Analyse un commentaire et retourne son intention dominante.
 * @param {string} rawText
 * @returns {import('../domain/entities/Intent').CommentIntentResult}
 */
export function analyzeComment(rawText) {
  const normalizedText = normalize(rawText);

  if (!normalizedText) {
    return {
      intent: Intent.CHITCHAT,
      confidence: 0,
      isSpam: false,
      matchedKeywords: [],
      normalizedText,
    };
  }

  if (detectSpam(normalizedText)) {
    return {
      intent: Intent.SPAM,
      confidence: 1,
      isSpam: true,
      matchedKeywords: [],
      normalizedText,
    };
  }

  let best = null;

  for (const rule of RULES) {
    const matched = rule.patterns.filter((re) => re.test(normalizedText));
    if (matched.length === 0) continue;

    const score = matched.length;
    if (!best || score > best.score) {
      best = {
        intent: rule.intent,
        score,
        matchedKeywords: matched.map((re) => re.source),
      };
    }
  }

  if (!best) {
    return {
      intent: Intent.CHITCHAT,
      confidence: 0,
      isSpam: false,
      matchedKeywords: [],
      normalizedText,
    };
  }

  // Confiance heuristique bornée à 1 : 1 règle matchée = 0.6, chaque règle
  // supplémentaire ajoute 0.2 (plafonné). Suffisant pour trier "actionable
  // avec confiance" vs "à surveiller" côté Response Manager (Module 4),
  // sans prétendre à une vraie probabilité statistique.
  const confidence = Math.min(1, 0.6 + (best.score - 1) * 0.2);

  return {
    intent: best.intent,
    confidence,
    isSpam: false,
    matchedKeywords: best.matchedKeywords,
    normalizedText,
  };
}

/**
 * Analyse un lot de commentaires (utile pour un traitement groupé côté
 * Netlify Function, ou pour du debug/tests).
 * @param {string[]} texts
 */
export function analyzeComments(texts) {
  return (texts ?? []).map((t) => analyzeComment(t));
}