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
//  `partnerCode` est le code de restitution à 6 chiffres généré par le
//  partenaire (voir generateRestitutionCode ci-dessous) — le serveur
//  vérifie qu'il existe, n'est pas expiré, pas déjà utilisé, et correspond
//  au partenaire attendu pour ce power bank avant d'effectuer le
//  remboursement (mesure anti-fraude).
//  Retourne { success: bool, cautionRefunded?: number, devise?: string }
// ─────────────────────────────────────────────────────────────────────────────
export async function confirmRestitution({ rentalId, partnerCode }) {
  return post('confirmRestitution', { rentalId, partnerCode });
}

// ─────────────────────────────────────────────────────────────────────────────
//  4bis. generateRestitutionCode
//  Réservé aux comptes partenaires (role: 'Vendeur'). Génère un code à
//  6 chiffres, valable 5 minutes, à usage unique, que le partenaire
//  communique au client au moment de la restitution.
//  Retourne { code: string, expiresAt: number (ms epoch) }
// ─────────────────────────────────────────────────────────────────────────────
export async function generateRestitutionCode() {
  return post('generateRestitutionCode', {});
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
//  Initie une location de powerbank avec paiement wallet.
//  IMPORTANT : `devise` doit être transmise au serveur — c'est elle qui
//  détermine quelle clé du wallet est débitée (wallet.XOF / .GHS / .NGN).
//  Sans ce champ, le serveur retombe sur user.currency par défaut, ce qui
//  cause un débit dans la mauvaise devise si l'utilisateur a choisi une
//  devise différente de sa devise de profil.
//  Retourne { rentalId, qrCode, devise, fraisDevise, cautionDevise, totalDevise, batteryLevel }
// ─────────────────────────────────────────────────────────────────────────────
export async function createWalletRental({ powerBankId, devise, partnerId, amountXof, cautionXof }) {
  return post('createWalletRental', {
    powerBankId,
    devise,
    partnerId,
    amountXof : amountXof  != null ? Number(amountXof)  : undefined,
    cautionXof: cautionXof != null ? Number(cautionXof) : undefined,
  });
}
