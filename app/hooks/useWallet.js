// hooks/useWallet.js
// ─────────────────────────────────────────────────────────────────────────────
// Miroir JS de WalletService.dart
// Appelle les Netlify Functions avec le Firebase ID Token en Authorization.
// ─────────────────────────────────────────────────────────────────────────────

import { getAuth } from 'firebase/auth';

const BASE = process.env.NEXT_PUBLIC_FUNCTIONS_URL
  ?? '/.netlify/functions'; // fonctionne en local ET sur Netlify

// ── Helper interne ────────────────────────────────────────────────────────────
async function post(fn, payload) {
  const user  = getAuth().currentUser;
  if (!user)  throw new Error('Utilisateur non connecté');
  const token = await user.getIdToken(true);

  const res  = await fetch(`${BASE}/${fn}`, {
    method : 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body   : JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `Erreur serveur ${res.status}`);
  return data;
}

// ─────────────────────────────────────────────────────────────────────────────
//  1. webcreateTopup
//  Retourne { payment_url, tx_ref }
// ─────────────────────────────────────────────────────────────────────────────
export async function webcreateTopup({ amount, currency }) {
  return post('webcreateTopup', { amount: Number(amount), currency });
}

// ─────────────────────────────────────────────────────────────────────────────
//  2. createFlutterwaveRentalPayment
//  Retourne { payment_url, payment_ref }
// ─────────────────────────────────────────────────────────────────────────────
export async function createFlutterwaveRentalPayment({
  powerBankId, powerBankDocId, partnerStartId,
  amountXof, cautionXof,
  devise = 'XOF', amountDevise, cautionDevise,
}) {
  return post('createFlutterwaveRentalPayment', {
    powerBankId, powerBankDocId, partnerStartId,
    amountXof : Number(amountXof),
    cautionXof: Number(cautionXof),
    devise,
    amountDevise  : amountDevise  != null ? Number(amountDevise)  : Number(amountXof),
    cautionDevise : cautionDevise != null ? Number(cautionDevise) : Number(cautionXof),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  3. verifyFlutterwaveRentalPayment
//  Retourne { verified: bool, rentalId?: string, error?: string }
// ─────────────────────────────────────────────────────────────────────────────
export async function verifyFlutterwaveRentalPayment({ paymentRef, transactionId }) {
  return post('verifyFlutterwaveRentalPayment', { paymentRef, transactionId });
}

// ─────────────────────────────────────────────────────────────────────────────
//  4. confirmRestitution
//  Retourne { success: bool, cautionRefunded?: number }
// ─────────────────────────────────────────────────────────────────────────────
export async function confirmRestitution({ rentalId }) {
  return post('confirmRestitution', { rentalId });
}

// ─────────────────────────────────────────────────────────────────────────────
//  5. createWalletRentalRecord
//  Enregistre TranstetMoney après paiement wallet (côté serveur)
// ─────────────────────────────────────────────────────────────────────────────
export async function createWalletRentalRecord({ rentalId, powerBankId, partnerId }) {
  return post('createWalletRentalRecord', { rentalId, powerBankId, partnerId: partnerId || null });
}

// ─────────────────────────────────────────────────────────────────────────────
//  6. createWalletRental
//  Initie une location de powerbank avec paiement wallet
//  Retourne { rentalId, payment_url?, status }
// ─────────────────────────────────────────────────────────────────────────────
export async function createWalletRental({ powerBankId, partnerId, amountXof, cautionXof }) {
  return post('createWalletRental', {
    powerBankId,
    partnerId,
    amountXof : Number(amountXof),
    cautionXof: Number(cautionXof),
  });
}
