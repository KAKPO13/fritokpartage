// netlify/functions/_constants.js
// ─────────────────────────────────────────────────────────────────────────────
//  Constantes partagées entre toutes les Netlify Functions.
//  Source unique de vérité — ne jamais dupliquer ces valeurs.
// ─────────────────────────────────────────────────────────────────────────────

// UID du compte Escrow Fritok dans Firestore users/{ESCROW_UID}
const ESCROW_UID = 'escrow_fritok';

// Devises supportées
const SUPPORTED_CURRENCIES = ['XOF', 'GHS', 'NGN'];

// Nombre max de locations actives simultanées par utilisateur
const MAX_ACTIVE_RENTALS = 2;

// Durée max d'un verrou de paiement en attente (30 minutes)
const PENDING_PAYMENT_TTL_MS = 30 * 60 * 1000;

// Statut par défaut d'une location wallet
const WALLET_RENTAL_STATUS = 'active';

// Devise par défaut
const DEFAULT_CURRENCY = 'XOF';

module.exports = {
  ESCROW_UID,
  SUPPORTED_CURRENCIES,
  MAX_ACTIVE_RENTALS,
  PENDING_PAYMENT_TTL_MS,
  WALLET_RENTAL_STATUS,
  DEFAULT_CURRENCY,
};