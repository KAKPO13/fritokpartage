// netlify/functions/_shared/currency.js
//
// Conversion vers XOF pour normaliser le reporting revenus multi-pays
// dans escrow_fritok. Réutilise les mêmes taux que subscriptionPlans.js
// (RATES est XOF → devise ; on inverse pour devise → XOF).

const { RATES } = require('./subscriptionPlans');

function convertToXOF(montant, devise) {
  if (devise === 'XOF') return montant;
  const rate = RATES[devise]; // XOF * rate = devise
  if (!rate) {
    throw new Error(`Devise non supportée pour la conversion : ${devise}`);
  }
  return Math.round(montant / rate);
}

function getRateToXOF(devise) {
  if (devise === 'XOF') return 1;
  const rate = RATES[devise];
  return rate ? 1 / rate : null;
}

module.exports = { convertToXOF, getRateToXOF };