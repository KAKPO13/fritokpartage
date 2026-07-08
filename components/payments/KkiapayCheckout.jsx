// frontend/KkiapayCheckout.jsx
// -----------------------------------------------------------------------------
// Hook + composant pour declencher un paiement KkiaPay depuis le web app
// Next.js. Remplace le flux "redirect vers payment_url" utilise pour
// Flutterwave : ici on ouvre un widget (popup), on ecoute son evenement
// de succes, puis on appelle le verify backend correspondant.
//
// A VERIFIER EN SANDBOX avant mise en prod : le nom exact des fonctions
// d'ecoute d'evenements globales injectees par le script KkiaPay
// (addSuccessListener / addFailedListener ci-dessous) doit etre confirme
// contre le dashboard KkiaPay -> Developpeurs -> SDK Javascript au moment
// de l'integration, la doc publique ne montrant pas leur signature
// complete. Si les noms different, ce fichier est le SEUL endroit a
// modifier (toute la logique d'appel backend reste identique).
// -----------------------------------------------------------------------------

'use client';

import { useEffect, useCallback, useRef } from 'react';
import { auth } from '@/lib/firebase'; // adapter au chemin reel du client Firebase Auth du projet

const KKIAPAY_SCRIPT_SRC = 'https://cdn.kkiapay.me/k.js';

function loadKkiapayScript() {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') return reject(new Error('SSR — pas de widget disponible'));
    if (window.openKkiapayWidget) return resolve();

    const existing = document.querySelector(`script[src="${KKIAPAY_SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', reject);
      return;
    }

    const script = document.createElement('script');
    script.src = KKIAPAY_SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = reject;
    document.body.appendChild(script);
  });
}

/**
 * Hook generique de paiement KkiaPay.
 *
 * @param {Object} params
 * @param {'topup'|'rental'} params.type
 * @param {string} params.verifyEndpoint  ex: '/.netlify/functions/verifyKkiapayTopup'
 * @param {(result: {verified: boolean, rentalId?: string}) => void} params.onVerified
 * @param {(error: string) => void} params.onError
 */
export function useKkiapayCheckout({ type, verifyEndpoint, onVerified, onError }) {
  const scriptReady = useRef(false);

  useEffect(() => {
    loadKkiapayScript().then(() => { scriptReady.current = true; }).catch(() => {
      onError?.('Impossible de charger le module de paiement KkiaPay');
    });
  }, [onError]);

  const pay = useCallback(async ({ amount, reference, publicKey, sandbox, customer, extra }) => {
    if (!scriptReady.current) {
      await loadKkiapayScript();
    }

    // Le champ `data` du widget doit rester un STRING (JSON.stringify).
    // Cote webhook, on suppose que cette donnee est repercutee dans
    // `stateData` (cf. avertissement dans kkiapay-webhook.js) — sur le
    // chemin frontend (celui-ci), on n'en depend pas : on garde `reference`
    // en closure et on l'envoie nous-memes au verify backend ci-dessous.
    const widgetData = JSON.stringify({ ref: reference, type, ...extra });

    window.openKkiapayWidget({
      amount,
      key: publicKey,
      sandbox: Boolean(sandbox),
      data: widgetData,
      position: 'center',
      theme: '#FF6B00', // Citrus Orange — coherent avec le design system Fritok
      name: customer?.name || '',
      email: customer?.email || '',
      phone: customer?.phone || '',
    });

    // Ecoute du succes — a confirmer contre la doc/dashboard KkiaPay
    // (cf. avertissement en tete de fichier).
    const handleSuccess = async (response) => {
      window.removeSuccessListener?.(handleSuccess);
      window.removeFailedListener?.(handleFailed);

      const transactionId = response?.transactionId;
      if (!transactionId) {
        onError?.('Reponse KkiaPay invalide — transactionId manquant');
        return;
      }

      try {
        const idToken = await auth.currentUser?.getIdToken();
        const verifyBody = type === 'topup'
          ? { reference, transactionId }
          : { paymentRef: reference, transactionId };

        const res = await fetch(verifyEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify(verifyBody),
        });
        const data = await res.json();

        if (!res.ok || data.verified === false) {
          onError?.(data.error || 'La verification du paiement a echoue');
          return;
        }

        onVerified?.(data);
      } catch (e) {
        console.error('[useKkiapayCheckout] verify call failed:', e);
        onError?.('Erreur reseau pendant la verification du paiement');
      }
    };

    const handleFailed = (response) => {
      window.removeSuccessListener?.(handleSuccess);
      window.removeFailedListener?.(handleFailed);
      onError?.(response?.failureMessage || 'Paiement echoue ou annule');
    };

    window.addSuccessListener?.(handleSuccess);
    window.addFailedListener?.(handleFailed);
  }, [type, verifyEndpoint, onVerified, onError]);

  return { pay };
}
