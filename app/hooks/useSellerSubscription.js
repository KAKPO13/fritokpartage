// hooks/useSellerSubscription.js
// Lit le champ subscription depuis users/{uid} en temps réel.
// Expose un helper hasAccess() et une fonction pour lancer le paiement.

import { useState, useEffect, useCallback } from 'react';
import { getAuth }                          from 'firebase/auth';
import { getFirestore, doc, onSnapshot }    from 'firebase/firestore';

// ── Types de statut ────────────────────────────────────────
// trial      : 14j gratuits, accès complet
// active     : abonné payant, accès complet
// expired    : trial ou abo expiré, accès bloqué (mais pas résilié)
// cancelled  : résilié, accès bloqué
// none       : champ subscription absent (nouveau compte non encore initialisé)

export function useSellerSubscription() {
  const auth = getAuth();
  const db   = getFirestore();

  const [subscription, setSubscription] = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(null);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) { setLoading(false); return; }

    const unsub = onSnapshot(
      doc(db, 'users', uid),
      (snap) => {
        if (!snap.exists()) { setSubscription(null); setLoading(false); return; }
        const sub = snap.data()?.subscription ?? null;
        setSubscription(sub);
        setLoading(false);
      },
      (err) => { setError(err); setLoading(false); },
    );
    return unsub;
  }, [auth.currentUser?.uid]);

  // ── Helpers ────────────────────────────────────────────
  const status = subscription?.status ?? 'none';

  // Retourne true si le vendeur peut accéder aux fonctionnalités premium
  const hasAccess = useCallback(() => {
    if (!subscription) return false;
    const s = subscription.status;
    if (s !== 'trial' && s !== 'active') return false;
    // Vérifier que la période n'est pas dépassée côté client (double-check)
    const end = subscription.currentPeriodEnd?.toDate?.() ?? null;
    if (end && end < new Date()) return false;
    return true;
  }, [subscription]);

  // Calcule le nombre de jours restants (trial ou période payante)
  const daysLeft = useCallback(() => {
    if (!subscription) return 0;
    const end = subscription.currentPeriodEnd?.toDate?.() ?? null;
    if (!end) return 0;
    const diff = end.getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / (24 * 60 * 60 * 1000)));
  }, [subscription]);

  // Lance le paiement Flutterwave (redirige)
  const startPayment = useCallback(async ({ plan = 'pro', currency = 'XOF', phone = '' } = {}) => {
    const user = auth.currentUser;
    if (!user) throw new Error('Non connecté');
    const token = await user.getIdToken();
    const res = await fetch('/.netlify/functions/create-subscription-payment', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ plan, currency, phone }),
    });
    const data = await res.json();
    if (!res.ok || !data.payment_url) throw new Error(data.error ?? 'Erreur paiement');
    window.location.href = data.payment_url;
  }, [auth]);

  // Initialise le trial (à appeler au bon moment après inscription)
  const initTrial = useCallback(async ({ plan = 'pro' } = {}) => {
    const user = auth.currentUser;
    if (!user) throw new Error('Non connecté');
    const token = await user.getIdToken();
    const res = await fetch('/.netlify/functions/create-seller-trial', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ plan }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'Erreur initialisation trial');
    return data;
  }, [auth]);

  return {
    subscription,
    loading,
    error,
    status,          // 'trial' | 'active' | 'expired' | 'cancelled' | 'none'
    hasAccess,       // () => boolean
    daysLeft,        // () => number
    startPayment,    // ({ plan, currency, phone }) => Promise<void>
    initTrial,       // ({ plan }) => Promise<any>
  };
}