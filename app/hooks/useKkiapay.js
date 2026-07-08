// app/hooks/useKkiapay.js
// -----------------------------------------------------------------------------
// Contrepartie côté client de webcreateTopup / createRentalPayment quand le
// provider retourné est "kkiapay". Le script https://cdn.kkiapay.me/k.js est
// chargé globalement dans pages/_document.js (avant </body>, sur toutes les
// pages) — ce hook n'a donc plus besoin de l'injecter dynamiquement, juste
// de déclencher le paiement via window.openKkiapayWidget une fois qu'on sait
// qu'il est disponible.
//
// A VERIFIER EN SANDBOX avant prod : le nom exact des fonctions d'écoute
// globales (addSuccessListener / addFailedListener ci-dessous). Si le
// dashboard KkiaPay -> Développeurs -> SDK Javascript documente un nom
// différent au moment de l'intégration réelle, CE FICHIER est le seul
// endroit à corriger.
// -----------------------------------------------------------------------------

import { getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey           : process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain       : process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId        : process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket    : process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId            : process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};
function getApp() { return getApps().length ? getApps()[0] : initializeApp(firebaseConfig); }

/**
 * Attend que window.openKkiapayWidget soit disponible (le script est chargé
 * sans defer/async, comme demandé par KkiaPay — il devrait donc déjà être
 * prêt au moment où l'utilisateur peut cliquer sur un bouton, mais on
 * garde un petit polling de sécurité pour les connexions lentes).
 */
function waitForKkiapay(timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') return reject(new Error('SSR — pas de widget disponible'));
    if (window.openKkiapayWidget) return resolve();

    const start = Date.now();
    const interval = setInterval(() => {
      if (window.openKkiapayWidget) {
        clearInterval(interval);
        resolve();
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(interval);
        reject(new Error('Module de paiement KkiaPay indisponible — vérifie ta connexion et réessaie.'));
      }
    }, 100);
  });
}

/**
 * Ouvre le widget KkiaPay et branche les listeners de succès/échec.
 * Ne fait AUCUN appel serveur lui-même — c'est le rôle de verifyKkiapayTopup
 * / verifyKkiapayRental ci-dessous, à appeler depuis le callback onSuccess.
 *
 * @param {Object} params
 * @param {number} params.amount
 * @param {string} params.publicKey
 * @param {boolean} params.sandbox
 * @param {string} params.reference   notre référence Fritok (fermée sur cette valeur)
 * @param {Object} [params.customer]  { name, email, phone }
 * @param {(payload: {transactionId: string}) => void} params.onSuccess
 * @param {(message: string) => void} params.onFailed
 */
export async function openKkiapayPayment({ amount, publicKey, sandbox, reference, customer, onSuccess, onFailed }) {
  await waitForKkiapay();

  const widgetData = JSON.stringify({ ref: reference });

  window.openKkiapayWidget({
    amount,
    key: publicKey,
    sandbox: Boolean(sandbox),
    data: widgetData,
    position: 'center',
    theme: '#FF6B00', // Citrus Orange — cohérent avec le design system Fritok
    name: customer?.name || '',
    email: customer?.email || '',
    phone: customer?.phone || '',
  });

  const handleSuccess = (response) => {
    window.removeSuccessListener?.(handleSuccess);
    window.removeFailedListener?.(handleFailed);
    if (!response?.transactionId) {
      onFailed?.('Réponse KkiaPay invalide — transactionId manquant');
      return;
    }
    onSuccess?.(response);
  };

  const handleFailed = (response) => {
    window.removeSuccessListener?.(handleSuccess);
    window.removeFailedListener?.(handleFailed);
    onFailed?.(response?.failureMessage || 'Paiement annulé ou échoué');
  };

  window.addSuccessListener?.(handleSuccess);
  window.addFailedListener?.(handleFailed);
}

async function authedFetch(endpoint, body) {
  const auth = getAuth(getApp());
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) throw new Error('Utilisateur non authentifié');

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Erreur serveur');
  return data;
}

/** Vérifie une recharge wallet KkiaPay côté serveur (verifyKkiapayTopup.js). */
export function verifyKkiapayTopup({ reference, transactionId }) {
  return authedFetch('/.netlify/functions/verifyKkiapayTopup', { reference, transactionId });
}

/** Vérifie une location power bank KkiaPay côté serveur (verifyKkiapayRentalPayment.js). */
export function verifyKkiapayRental({ paymentRef, transactionId }) {
  return authedFetch('/.netlify/functions/verifyKkiapayRentalPayment', { paymentRef, transactionId });
}