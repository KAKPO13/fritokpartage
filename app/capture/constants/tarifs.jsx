// app/constants/tarifs.js
// ─────────────────────────────────────────────────────────────────────────────
//  Tarifs — AFFICHAGE UNIQUEMENT
//  Les montants réels sont toujours calculés et validés côté serveur depuis
//  config/tarifs (Firestore). Ne jamais les envoyer comme montants à débiter.
//
//  ► Pour changer les tarifs après la promo de lancement :
//     1. modifier CAUTION_XOF ci-dessous
//     2. modifier `caution` dans Firestore : config/tarifs
//    Toute l'UI (bandeau promo, lignes de caution, textes) se met à jour seule.
// ─────────────────────────────────────────────────────────────────────────────

export const FRAIS_XOF   = 150;
export const CAUTION_XOF = 0;            // ← promo de lancement : à fixer plus tard
export const TOTAL_XOF   = FRAIS_XOF + CAUTION_XOF;

// Vrai si le TARIF ACTUEL comporte une caution (à utiliser pour une NOUVELLE location).
// Pour une location existante, utiliser rentalCaution(rental) à la place.
export const HAS_CAUTION = CAUTION_XOF > 0;

// ── Montants propres à une location (figés au moment de la location) ─────────
// Priorité : montant dans la devise de la location → montant XOF → tarif actuel.
export const rentalFrais   = (r) => r?.fraisDevise   ?? r?.fraisXof   ?? FRAIS_XOF;
export const rentalCaution = (r) => r?.cautionDevise ?? r?.cautionXof ?? CAUTION_XOF;
export const rentalDevise  = (r) => r?.devise ?? 'XOF';