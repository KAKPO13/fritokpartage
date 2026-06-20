// pages/seller/subscribe/callback.jsx
// Flutterwave redirige ici après le paiement.
// Vérifie le statut via l'API FLW, affiche succès ou échec.
// URL : /seller/subscribe/callback?plan=pro&tx_ref=sub_xxx&status=successful

'use client';

import { useEffect, useState } from 'react';
import { useRouter }           from 'next/router';
import Link                    from 'next/link';

const D = {
  bg: '#FFF8EE', surface: '#FFFFFF', border: '#FFDDB0',
  orange: '#FF6B00', orangeDim: '#FFEDD5',
  text1: '#2D1500', text2: '#8B5E3C', text3: '#BF9060',
  green: '#1A9640', greenLight: '#E6F7EC', red: '#E53E00',
};

export default function SubscribeCallbackPage() {
  const router                     = useRouter();
  const { status, tx_ref, plan }   = router.query;
  const [phase, setPhase]          = useState('checking'); // checking | success | failed
  const [error, setError]          = useState('');

  useEffect(() => {
    if (!router.isReady) return;

    // FLW envoie status=successful ou status=failed dans l'URL
    if (status === 'successful' && tx_ref) {
      // Le webhook FLW a déjà traité le paiement de façon asynchrone.
      // On affiche simplement la confirmation ; le statut Firestore est mis
      // à jour par flw-subscription-webhook.js (généralement en quelques secondes).
      setPhase('success');
    } else if (status === 'cancelled' || status === 'failed') {
      setError(status === 'cancelled' ? 'Paiement annulé.' : 'Le paiement a échoué. Réessayez.');
      setPhase('failed');
    } else {
      // Statut inconnu ou page chargée directement
      setPhase('success'); // optimiste si tx_ref présent
    }
  }, [router.isReady, status, tx_ref]);

  if (phase === 'checking') return <Loader />;

  if (phase === 'failed') return (
    <Screen icon="❌" title="Paiement non abouti" sub={error || 'Une erreur est survenue.'} bg="#FEF2F2">
      <Link href="/seller/subscribe" style={btnStyle(D.orange)}>Réessayer</Link>
      <Link href="/app"              style={btnStyle('transparent', D.text2, `1px solid ${D.border}`)}>Retour à l'accueil</Link>
    </Screen>
  );

  const PLAN_LABELS = { essentiel: 'Pack Essentiel', pro: 'Pack Pro', elite: 'Pack Elite' };

  return (
    <Screen icon="🎉" title="Abonnement activé !" sub="Votre compte vendeur est maintenant actif. Toutes les fonctionnalités sont débloquées.">
      <div style={{
        background: D.surface, borderRadius: 14, border: `1px solid ${D.border}`,
        padding: '16px 20px', marginBottom: 20, textAlign: 'left',
      }}>
        <Row label="Plan"            value={PLAN_LABELS[plan] ?? plan ?? '–'} />
        <Row label="Statut"          value="✅ Actif" color={D.green} />
        <Row label="Référence"       value={tx_ref ? tx_ref.slice(0, 22) + '…' : '–'} last />
      </div>
      <Link href="/golive"  style={btnStyle(D.orange)}>🔴 Lancer mon premier live</Link>
      <Link href="/seller"  style={btnStyle('transparent', D.text2, `1px solid ${D.border}`)}>Mon espace vendeur</Link>
    </Screen>
  );
}

function Screen({ icon, title, sub, bg = D.greenLight, children }) {
  return (
    <div style={{ background: D.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: 400, width: '100%', textAlign: 'center' }}>
        <div style={{ width: 96, height: 96, borderRadius: '50%', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 44, margin: '0 auto 20px' }}>
          {icon}
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: D.text1, margin: '0 0 10px' }}>{title}</h1>
        <p style={{ fontSize: 14, color: D.text2, lineHeight: 1.6, margin: '0 0 24px' }}>{sub}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{children}</div>
      </div>
    </div>
  );
}

function Row({ label, value, color, last }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: last ? 'none' : `0.5px solid ${D.border}` }}>
      <span style={{ fontSize: 13, color: D.text2 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color: color ?? D.text1 }}>{value}</span>
    </div>
  );
}

function btnStyle(bg, color = '#fff', border = 'none') {
  return {
    display: 'block', padding: '13px 0', borderRadius: 12,
    background: bg, color, border,
    fontWeight: 700, fontSize: 14, textDecoration: 'none', textAlign: 'center',
  };
}

function Loader() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: D.bg, fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>⚡</div>
        <div style={{ fontSize: 14, color: D.text2 }}>Vérification du paiement…</div>
      </div>
    </div>
  );
}
