// netlify/functions/_shared/subscriptionPlans.js
//
// Source de vérité unique des tarifs d'abonnement. Reprend exactement
// les valeurs de create-subscription-payment.js (PLANS + RATES) — si
// vous changez un prix, changez-le ICI et faites pointer
// create-subscription-payment.js vers ce module au lieu de sa propre
// copie locale, pour éviter que les deux se désynchronisent.

const PLANS = {
  essentiel: { label: 'Pack Essentiel FriTok', priceXof: 2500 },
  pro: { label: 'Pack Pro FriTok', priceXof: 5000 },
  elite: { label: 'Pack Elite FriTok', priceXof: 10000 },
};

// Taux de conversion XOF → autres devises (mêmes fallback que
// create-subscription-payment.js). ⚠️ À rafraîchir régulièrement.
const RATES = { XOF: 1, GHS: 0.013, NGN: 4.75 };

function getPlanAmount(plan, currency) {
  const planData = PLANS[plan];
  if (!planData) return null;
  const rate = RATES[currency];
  if (rate === undefined) return null;
  return currency === 'XOF'
    ? planData.priceXof
    : Math.round(planData.priceXof * rate * 100) / 100;
}

module.exports = { PLANS, RATES, getPlanAmount };