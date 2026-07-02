// netlify/functions/createSubscriptionAttempt.js
// Appelée par le client juste avant d'ouvrir le checkout Flutterwave
// pour un (re)nouvellement d'abonnement. Crée un document dans
// topupAttempts (même collection que les recharges wallet, distinguée
// par le champ `type: "subscription"`) avec un montant dérivé
// SERVEUR de (plan, devise) — jamais accepté depuis le corps de la
// requête. Le webhook Flutterwave s'appuiera sur ce document pour
// savoir quoi faire une fois le paiement confirmé.
//
// Réponse : { txRef, amount, currency } — le client utilise ces
// valeurs pour initialiser le widget/redirect Flutterwave, exactement
// comme pour un topup wallet classique.

import { adminAuth, adminDb } from "./_shared/firebaseAdmin.js";
import { FieldValue } from "firebase-admin/firestore";
import { getPlanAmount } from "./_shared/subscriptionPlans.js";

const ALLOWED_PAYMENT_METHODS = ["orange_money", "mtn_momo", "wave", "card"];

export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Méthode non autorisée" }) };
  }

  // ── Authentification ──────────────────────────────────────
  const authHeader = event.headers.authorization || event.headers.Authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.split("Bearer ")[1] : null;
  if (!token) {
    return { statusCode: 401, body: JSON.stringify({ error: "Token manquant" }) };
  }

  let userId;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    userId = decoded.uid;
  } catch {
    return { statusCode: 401, body: JSON.stringify({ error: "Token invalide" }) };
  }

  // ── Validation payload ────────────────────────────────────
  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "JSON invalide" }) };
  }

  const { plan, currency, moyenPaiement } = payload;

  const amount = getPlanAmount(plan, currency);
  if (!amount) {
    return { statusCode: 400, body: JSON.stringify({ error: "Plan ou devise invalide" }) };
  }
  if (moyenPaiement && !ALLOWED_PAYMENT_METHODS.includes(moyenPaiement)) {
    return { statusCode: 400, body: JSON.stringify({ error: "Moyen de paiement invalide" }) };
  }

  // ── Création de l'intention ───────────────────────────────
  const attemptRef = adminDb.collection("topupAttempts").doc();
  await attemptRef.set({
    userId,
    type: "subscription",
    plan,
    currency,
    amount,
    moyenPaiement: moyenPaiement ?? null,
    status: "pending",
    createdAt: FieldValue.serverTimestamp(),
  });

  return {
    statusCode: 200,
    body: JSON.stringify({ txRef: attemptRef.id, amount, currency }),
  };
};