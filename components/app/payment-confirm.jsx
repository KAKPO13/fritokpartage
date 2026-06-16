// pages/app/payment-confirm.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Page de retour après paiement Flutterwave (redirect_url).
// URL reçue : /app/payment-confirm?ref=PB-PAY-XXXX&pb=PB-ABJ-000193
//             &transaction_id=12345&status=successful
//
// Flow :
//   1. Récupère ref + transaction_id depuis l'URL
//   2. Appelle verifyFlutterwaveRentalPayment (serveur)
//   3. Affiche succès (→ /app) ou erreur
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { verifyFlutterwaveRentalPayment } from '../../hooks/useWallet';

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
  bg: '#FFF8EE', orange: '#FF6B00', green: '#1A9640', greenLight: '#E6F7EC',
  red: '#E53E00', text1: '#2D1500', text2: '#8B5E3C', text3: '#BF9060',
  border: '#FFDDB0', amberLight: '#FEF3C7', amber: '#B45309',
};

export default function PaymentConfirm() {
  const router = useRouter();
  // Flutterwave ajoute status, transaction_id et tx_ref en query params
  const { ref, pb, status, transaction_id } = router.query;

  const [step,    setStep]    = useState('waiting'); // waiting|verifying|success|error|cancelled
  const [message, setMessage] = useState('');
  const [rentalId,setRentalId]= useState('');

  useEffect(() => {
    if (!router.isReady) return;

    // Flutterwave peut renvoyer status=cancelled
    if (status === 'cancelled') { setStep('cancelled'); return; }

    // Attendre que l'utilisateur soit auth avant de vérifier
    const auth  = getAuth(getApp());
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { router.replace('/login?redirect=/app'); return; }
      if (!ref || !transaction_id) { setStep('error'); setMessage('Paramètres manquants dans l\'URL.'); return; }

      setStep('verifying');
      try {
        const result = await verifyFlutterwaveRentalPayment({
          paymentRef    : ref,
          transactionId : transaction_id,
        });

        if (result.verified) {
          setRentalId(result.rentalId ?? '');
          setStep('success');
        } else {
          setStep('error');
          setMessage(result.error ?? 'Paiement non confirmé par le serveur.');
        }
      } catch (e) {
        setStep('error');
        setMessage(e.message);
      }
    });
    return unsub;
  }, [router.isReady, ref, transaction_id, status]);

  const goHome = () => router.replace('/app');

  return (
    <div style={{ minHeight: '100dvh', background: D.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 420, textAlign: 'center' }}>

        {/* Attente / Vérification */}
        {(step === 'waiting' || step === 'verifying') && (
          <>
            <div style={{ fontSize: 52, marginBottom: 20 }}>⏳</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: D.text1, marginBottom: 8 }}>
              {step === 'waiting' ? 'Chargement…' : 'Vérification du paiement…'}
            </div>
            <div style={{ fontSize: 13, color: D.text2 }}>Merci de patienter, ne ferme pas cette page.</div>
            <div style={{ marginTop: 24 }}>
              <span style={{ display: 'inline-block', width: 28, height: 28, border: `3px solid ${D.orange}33`, borderTop: `3px solid ${D.orange}`, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            </div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </>
        )}

        {/* Succès */}
        {step === 'success' && (
          <>
            <div style={{ width: 100, height: 100, borderRadius: '50%', background: D.greenLight, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 48, margin: '0 auto 24px' }}>✓</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: D.text1, marginBottom: 8 }}>Paiement confirmé !</div>
            <div style={{ fontSize: 14, color: D.text2, marginBottom: 6 }}>
              Le commerçant va te remettre le power bank.
            </div>
            {pb && <div style={{ fontSize: 15, color: D.orange, fontWeight: 800, letterSpacing: 0.8, marginBottom: 20 }}>{decodeURIComponent(pb)}</div>}

            {/* Récap */}
            <div style={{ background: '#fff', borderRadius: 16, padding: 20, border: `1px solid ${D.border}`, textAlign: 'left', marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: D.text3, letterSpacing: 1.5, fontWeight: 700, marginBottom: 14 }}>RÉCAPITULATIF</div>
              <Row label="Méthode"    value="Flutterwave" />
              <Row label="Référence"  value={ref ?? '–'} />
              {rentalId && <Row label="Location ID" value={rentalId} />}
            </div>

            <div style={{ background: D.amberLight, borderRadius: 12, padding: 14, display: 'flex', gap: 10, alignItems: 'flex-start', textAlign: 'left', marginBottom: 24 }}>
              <span>⏱️</span>
              <div style={{ fontSize: 12, color: D.amber }}>Restitue avant 48h pour récupérer ta caution.</div>
            </div>

            <button onClick={goHome} style={btn(D.orange)}>Retour à l'accueil</button>
          </>
        )}

        {/* Annulé */}
        {step === 'cancelled' && (
          <>
            <div style={{ fontSize: 52, marginBottom: 20 }}>🚫</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: D.text1, marginBottom: 8 }}>Paiement annulé</div>
            <div style={{ fontSize: 14, color: D.text2, marginBottom: 28 }}>Tu as annulé le paiement. Aucun montant n'a été débité.</div>
            <button onClick={goHome} style={btn(D.orange)}>Retour à l'accueil</button>
          </>
        )}

        {/* Erreur */}
        {step === 'error' && (
          <>
            <div style={{ fontSize: 52, marginBottom: 20 }}>⚠️</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: D.text1, marginBottom: 8 }}>Vérification échouée</div>
            <div style={{ fontSize: 14, color: D.text2, marginBottom: 16, lineHeight: 1.6 }}>{message || 'Une erreur est survenue.'}</div>
            <div style={{ background: D.amberLight, borderRadius: 12, padding: 14, fontSize: 13, color: D.amber, textAlign: 'left', marginBottom: 28 }}>
              Si tu as été débité, contacte le support Fritok avec la référence : <strong>{ref}</strong>
            </div>
            <button onClick={goHome} style={btn(D.orange)}>Retour à l'accueil</button>
          </>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
      <span style={{ fontSize: 13, color: D.text2 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color: D.text1, maxWidth: '60%', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>
    </div>
  );
}

const btn = (bg) => ({
  width: '100%', padding: '14px 0', background: bg, color: '#fff',
  border: 'none', borderRadius: 14, cursor: 'pointer', fontSize: 15, fontWeight: 700,
});