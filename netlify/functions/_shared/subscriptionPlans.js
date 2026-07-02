// netlify/functions/_shared/subscriptionPlans.js
// Source de vérité unique des tarifs. Ne JAMAIS accepter un montant
// envoyé par le client : toujours le dériver de (plan, devise) via
// cette table, aussi bien à la création de l'intention de paiement
// qu'à la confirmation dans le webhook.
export const PLAN_TARIFS = {
  essentiel: { XOF: 2500, NGN: 1250, GHS: 45 },
  pro: { XOF: 5000, NGN: 2500, GHS: 90 },
  elite: { XOF: 10000, NGN: 5000, GHS: 180 },
};

export function getPlanAmount(plan, currency) {
  return PLAN_TARIFS[plan]?.[currency] ?? null;
}