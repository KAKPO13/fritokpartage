// pages/wallet/topup.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Page de recharge du wallet Fritok via Flutterwave.
// Accessible depuis ProfileTab → "Recharger mon wallet"
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, onSnapshot } from 'firebase/firestore';
import { webcreateTopup } from '../../app/hooks/useWallet';




//TEST

const firebaseConfig = {
  apiKey           : process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain       : process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId        : process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket    : process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId            : process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};
function getApp() { return getApps().length ? getApps()[0] : initializeApp(firebaseConfig); }

const D = {
  bg: '#FFF8EE', surface: '#FFFFFF', orange: '#FF6B00', orangeDim: '#FFEDD5',
  zest: '#FFB700', text1: '#2D1500', text2: '#8B5E3C', text3: '#BF9060',
  border: '#FFDDB0', green: '#1A9640', greenLight: '#E6F7EC',
  amber: '#B45309', amberLight: '#FEF3C7', red: '#E53E00',
};

const PRESETS = {
  XOF: [500, 1000, 2000, 5000],
  GHS: [5, 10, 20, 50],
  NGN: [500, 1000, 2500, 5000],
};

const MIN = { XOF: 100, GHS: 1, NGN: 100 };

const fmt = (n, cur) =>
  new Intl.NumberFormat('fr-FR').format(Math.round(Number(n) || 0)) + ' ' + cur;

export default function TopupPage() {
  const router   = useRouter();
  const [user,   setUser]     = useState(null);
  const [wallet, setWallet]   = useState({});
  const [currency, setCurrency] = useState('XOF');
  const [amount,   setAmount]   = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  // Auth guard
  useEffect(() => {
    const app  = getApp();
    const auth = getAuth(app);
    const db   = getFirestore(app);

    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u || !u.emailVerified) { router.replace('/login?redirect=/wallet/topup'); return; }
      setUser(u);

      // Wallet temps réel
      const unsubWallet = onSnapshot(doc(db, 'users', u.uid), (snap) => {
        const data = snap.data();
        if (data?.wallet)   setWallet(data.wallet);
        if (data?.currency) setCurrency(data.currency);
      });
      return unsubWallet;
    });
    return unsub;
  }, []);

  const handleTopup = async () => {
    setError('');
    const amt = Number(amount);
    if (!amt || amt < (MIN[currency] ?? 100)) {
      setError(`Montant minimum : ${MIN[currency] ?? 100} ${currency}`);
      return;
    }
    setLoading(true);
    try {
      const { payment_url } = await webcreateTopup({ amount: amt, currency });
      // Ouvre le checkout Flutterwave dans le même onglet (redirect_url ramène sur /wallet/confirm)
      window.location.href = payment_url;
    } catch (e) {
      setError(e.message);
      setLoading(false);
    }
  };

  const currentBalance = Number(wallet[currency] ?? 0);

  return (
    <div style={{ minHeight: '100dvh', background: D.bg, maxWidth: 480, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ background: `linear-gradient(135deg, ${D.orange}, ${D.zest})`, padding: '52px 24px 28px', position: 'relative' }}>
        <button onClick={() => router.back()} style={{ position: 'absolute', top: 16, left: 16, background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 10, padding: '6px 12px', color: '#fff', cursor: 'pointer', fontSize: 18 }}>←</button>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.75)', fontWeight: 700, letterSpacing: 1.5, marginBottom: 6 }}>RECHARGE WALLET</div>
        <div style={{ fontSize: 30, fontWeight: 800, color: '#fff' }}>
          {fmt(currentBalance, currency)}
        </div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 4 }}>Solde actuel</div>
      </div>

      <div style={{ padding: 24 }}>

        {/* Sélecteur devise */}
        <div style={{ fontSize: 13, color: D.text2, fontWeight: 700, marginBottom: 10 }}>Devise</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
          {Object.keys(wallet).filter(k => wallet[k] !== undefined).map(c => (
            <button key={c} onClick={() => { setCurrency(c); setAmount(''); setError(''); }}
              style={{ flex: 1, padding: '10px 0', borderRadius: 12, border: `1.5px solid ${currency === c ? D.orange : D.border}`, background: currency === c ? D.orangeDim : D.surface, color: currency === c ? D.orange : D.text2, fontWeight: currency === c ? 700 : 400, fontSize: 14, cursor: 'pointer' }}>
              {c}
            </button>
          ))}
        </div>

        {/* Montants prédéfinis */}
        <div style={{ fontSize: 13, color: D.text2, fontWeight: 700, marginBottom: 10 }}>Montant rapide</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
          {(PRESETS[currency] ?? PRESETS.XOF).map(p => (
            <button key={p} onClick={() => { setAmount(String(p)); setError(''); }}
              style={{ padding: '14px 0', borderRadius: 12, border: `1.5px solid ${String(amount) === String(p) ? D.orange : D.border}`, background: String(amount) === String(p) ? D.orangeDim : D.surface, color: String(amount) === String(p) ? D.orange : D.text1, fontWeight: String(amount) === String(p) ? 700 : 500, fontSize: 16, cursor: 'pointer' }}>
              {fmt(p, currency)}
            </button>
          ))}
        </div>

        {/* Saisie libre */}
        <div style={{ fontSize: 13, color: D.text2, fontWeight: 700, marginBottom: 8 }}>Ou saisir un montant</div>
        <div style={{ position: 'relative', marginBottom: 8 }}>
          <input
            type="number"
            placeholder={`Min. ${MIN[currency] ?? 100}`}
            value={amount}
            onChange={e => { setAmount(e.target.value); setError(''); }}
            onKeyDown={e => e.key === 'Enter' && handleTopup()}
            style={{ width: '100%', padding: '13px 60px 13px 14px', fontSize: 16, fontWeight: 700, border: `1.5px solid ${D.border}`, borderRadius: 12, background: D.surface, color: D.text1, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
          />
          <div style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 13, fontWeight: 700, color: D.text3 }}>{currency}</div>
        </div>

        {error && (
          <div style={{ fontSize: 12, color: D.red, padding: '10px 14px', background: '#FEE2E2', borderRadius: 10, marginBottom: 12 }}>⚠️ {error}</div>
        )}

        {/* Résumé */}
        {Number(amount) >= (MIN[currency] ?? 100) && (
          <div style={{ background: D.greenLight, borderRadius: 12, padding: 14, fontSize: 13, color: D.green, marginBottom: 16, fontWeight: 500 }}>
            ✅ Ton wallet sera crédité de <strong>{fmt(amount, currency)}</strong> après confirmation du paiement.
          </div>
        )}

        <button onClick={handleTopup} disabled={loading || !amount} style={{ width: '100%', padding: '15px 0', background: loading || !amount ? D.text3 : D.orange, color: '#fff', border: 'none', borderRadius: 14, cursor: loading || !amount ? 'not-allowed' : 'pointer', fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, fontFamily: 'inherit' }}>
          {loading
            ? <><Spinner /> Redirection…</>
            : `💳 Recharger ${amount ? fmt(amount, currency) : ''}`
          }
        </button>

        {/* Info sécurité */}
        <div style={{ marginTop: 20, padding: 14, background: D.surface, borderRadius: 12, border: `1px solid ${D.border}`, fontSize: 12, color: D.text3, lineHeight: 1.6, textAlign: 'center' }}>
          🔒 Paiement sécurisé via <strong style={{ color: D.text2 }}>Flutterwave</strong>.<br />
          Ton solde est crédité immédiatement après confirmation.
        </div>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <>
      <span style={{ width: 18, height: 18, border: '2.5px solid rgba(255,255,255,0.3)', borderTop: '2.5px solid #fff', borderRadius: '50%', display: 'inline-block', animation: 'wspin 0.7s linear infinite' }} />
      <style>{`@keyframes wspin{to{transform:rotate(360deg)}}`}</style>
    </>
  );
}
