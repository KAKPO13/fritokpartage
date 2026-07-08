// netlify/functions/_shared/paymentProvider.js
// ─────────────────────────────────────────────────────────────────────────────
// Point unique de vérité pour le routage devise → provider de paiement.
// Toute nouvelle devise / tout nouveau marché se déclare ICI, pas dans
// chaque function individuellement — ça évite d'avoir 6 endroits différents
// où la logique "XOF = KkiaPay" est dupliquée et risque de diverger.
// ─────────────────────────────────────────────────────────────────────────────

export const PROVIDERS = Object.freeze({
  KKIAPAY: 'kkiapay',
  FLUTTERWAVE: 'flutterwave',
});

// Devise → provider
const CURRENCY_PROVIDER_MAP = {
  XOF: PROVIDERS.KKIAPAY,      // Côte d'Ivoire, Sénégal, Mali, Burkina, Togo, Bénin...
  GHS: PROVIDERS.FLUTTERWAVE,  // Ghana
  NGN: PROVIDERS.FLUTTERWAVE,  // Nigeria
};

export const CURRENCY_LABEL = {
  XOF: 'Francs CFA',
  GHS: 'Ghanaian Cedi',
  NGN: 'Nigerian Naira',
};

// Montant minimum par devise (repris de webcreateTopup.js, centralisé ici)
export const MIN_AMOUNT = { XOF: 100, GHS: 1, NGN: 100 };

/**
 * Détermine le provider à utiliser pour une devise donnée.
 * Lève une erreur explicite si la devise n'est pas supportée —
 * on préfère un 400 clair côté function plutôt qu'un comportement
 * silencieux qui route vers le mauvais provider.
 */
export function resolveProvider(currency) {
  const provider = CURRENCY_PROVIDER_MAP[currency];
  if (!provider) {
    throw Object.assign(new Error(`Devise non supportée : ${currency}`), { code: 400 });
  }
  return provider;
}

export function isValidCurrency(currency) {
  return Boolean(CURRENCY_PROVIDER_MAP[currency]);
}