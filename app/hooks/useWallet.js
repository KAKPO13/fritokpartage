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
//  1. createTopup
//  Retourne { payment_url, tx_ref }
// ─────────────────────────────────────────────────────────────────────────────
export async function createTopup({ amount, currency }) {
  return post('createTopup', { amount: Number(amount), currency });
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