// pages/wallet/confirm.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Page de retour après recharge wallet via Flutterwave.
// URL : /wallet/confirm?type=topup&ref=FRITOK-TOP-XXXX
//       &transaction_id=12345&status=successful
//
// Note : la mise à jour du wallet est gérée par un Webhook Flutterwave
// ou une Netlify Function dédiée. Cette page confirme visuellement.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';

const D = {
  bg: '#FFF8EE', orange: '#FF6B00', green: '#1A9640', greenLight: '#E6F7EC',
  text1: '#2D1500', text2: '#8B5E3C', text3: '#BF9060',
  border: '#FFDDB0', amberLight: '#FEF3C7', amber: '#B45309', red: '#E53E00',
};

export default function WalletConfirm() {
  const router = useRouter();
  const { status, ref, transaction_id } = router.query;
  const [countdown, setCountdown] = useState(5);

  const success = status === 'successful';

  // Compte à rebours → redirect automatique
  useEffect(() => {
    if (!router.isReady || !success) return;
    const t = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) { clearInterval(t); router.replace('/app'); }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [router.isReady, success]);

  if (!router.isReady) return null;

  return (
    <div style={{ minHeight: '100dvh', background: D.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 400, textAlign: 'center' }}>

        {success ? (
          <>
            <div style={{ width: 100, height: 100, borderRadius: '50%', background: D.greenLight, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 48, margin: '0 auto 24px' }}>✓</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: D.text1, marginBottom: 8 }}>Recharge réussie !</div>
            <div style={{ fontSize: 14, color: D.text2, marginBottom: 24 }}>
              Ton wallet Fritok a été crédité.<br />
              <span style={{ color: D.text3, fontSize: 12 }}>Référence : {ref}</span>
            </div>
            <div style={{ fontSize: 13, color: D.text3, marginBottom: 20 }}>
              Redirection dans <strong style={{ color: D.orange }}>{countdown}s</strong>…
            </div>
            <button onClick={() => router.replace('/app')} style={btnStyle(D.orange)}>
              Retour à l'accueil
            </button>
          </>
        ) : status === 'cancelled' ? (
          <>
            <div style={{ fontSize: 52, marginBottom: 20 }}>🚫</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: D.text1, marginBottom: 8 }}>Recharge annulée</div>
            <div style={{ fontSize: 14, color: D.text2, marginBottom: 28 }}>Aucun montant n'a été débité.</div>
            <button onClick={() => router.replace('/wallet/topup')} style={btnStyle(D.orange)}>Réessayer</button>
            <button onClick={() => router.replace('/app')} style={btnStyle('#fff', D.text2, D.border)}>Retour à l'accueil</button>
          </>
        ) : (
          <>
            <div style={{ fontSize: 52, marginBottom: 20 }}>⚠️</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: D.text1, marginBottom: 8 }}>Paiement non confirmé</div>
            <div style={{ fontSize: 14, color: D.text2, marginBottom: 16 }}>Statut : {status ?? 'inconnu'}</div>
            {ref && (
              <div style={{ background: D.amberLight, borderRadius: 12, padding: 14, fontSize: 13, color: D.amber, marginBottom: 28, textAlign: 'left' }}>
                Si tu as été débité, contacte le support avec la référence : <strong>{ref}</strong>
              </div>
            )}
            <button onClick={() => router.replace('/wallet/topup')} style={btnStyle(D.orange)}>Réessayer</button>
            <button onClick={() => router.replace('/app')} style={{ ...btnStyle('#fff', D.text2, D.border), marginTop: 10 }}>Retour à l'accueil</button>
          </>
        )}
      </div>
    </div>
  );
}

const btnStyle = (bg, color = '#fff', border = 'none') => ({
  display: 'block', width: '100%', padding: '14px 0', marginTop: 12,
  background: bg, color, border: `1px solid ${border}`,
  borderRadius: 14, cursor: 'pointer', fontSize: 15, fontWeight: 700,
  fontFamily: 'inherit',
});
