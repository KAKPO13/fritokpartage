// netlify/functions/_shared/kkiapayClient.js
// ─────────────────────────────────────────────────────────────────────────────
// Wrapper autour du SDK officiel @kkiapay-org/nodejs-sdk.
//
// ⚠️ Installer la dépendance avant déploiement :
//     npm install @kkiapay-org/nodejs-sdk
//
// On utilise le SDK officiel plutôt que de réimplémenter les appels REST
// à la main (contrairement à Flutterwave où on tape directement l'API v3
// via fetch) car KkiaPay expose 3 clés (publique / privée / secrète) et
// le SDK gère correctement leur combinaison pour la vérification serveur.
// Toute divergence avec la doc officielle serait plus risquée à maintenir
// qu'un simple wrapper autour du SDK.
//
// Variables d'environnement requises (Netlify) :
//   KKIAPAY_PUBLIC_KEY   → exposée au frontend (pas un secret)
//   KKIAPAY_PRIVATE_KEY  → vérification des transactions (serveur uniquement)
//   KKIAPAY_SECRET_KEY   → mutations sur le compte KkiaPay (serveur uniquement)
//   KKIAPAY_WEBHOOK_SECRET → hash secret configuré dans le dashboard KkiaPay,
//                            comparé au header x-kkiapay-secret du webhook
//   KKIAPAY_SANDBOX       → "true" en dev/test, absent ou "false" en prod
// ─────────────────────────────────────────────────────────────────────────────

import { kkiapay } from '@kkiapay-org/nodejs-sdk';

let client;

function getClient() {
  if (!client) {
    client = kkiapay({
      privatekey: process.env.KKIAPAY_PRIVATE_KEY,
      publickey: process.env.KKIAPAY_PUBLIC_KEY,
      secretkey: process.env.KKIAPAY_SECRET_KEY,
      sandbox: process.env.KKIAPAY_SANDBOX === 'true',
    });
  }
  return client;
}

/**
 * Vérifie une transaction KkiaPay côté serveur — TOUJOURS appeler ceci
 * avant de créditer quoi que ce soit. Ne jamais faire confiance au
 * seul événement reçu côté client (widget) ou au payload du webhook brut.
 *
 * Réponse attendue (cf. doc KkiaPay Node.js Admin SDK) :
 *   { status: 'SUCCESS' | 'FAILED' | ..., amount, transactionId,
 *     performedAt, source, client: { fullname, phone, email }, ... }
 */
export async function verifyKkiapayTransaction(transactionId) {
  const k = getClient();
  return k.verify(transactionId);
}

/**
 * Compare le header x-kkiapay-secret reçu au hash secret configuré
 * dans le dashboard KkiaPay (comparaison directe, pas de HMAC —
 * cf. doc officielle "Verification of webhook signatures").
 */
export function isValidKkiapayWebhookSignature(headerValue) {
  return Boolean(headerValue) && headerValue === process.env.KKIAPAY_WEBHOOK_SECRET;
}