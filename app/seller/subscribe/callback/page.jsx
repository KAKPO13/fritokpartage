// app/seller/subscribe/callback/page.jsx
// Flutterwave redirige ici après le paiement.
// URL : /seller/subscribe/callback?plan=pro&tx_ref=sub_xxx&status=successful
//
// ⚠️ App Router : ce fichier DOIT s'appeler page.jsx et vivre dans un
// dossier "callback/" — un fichier "callback.jsx" au même niveau que
// "subscribe/" n'est PAS une route reconnue par Next.js (silencieusement
// ignoré, d'où le 404 précédent). Utilise next/navigation, pas
// next/router (API Pages Router, incompatible ici : pas de router.query
// ni router.isReady).

'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/firebaseClient';
import { onAuthStateChanged } from 'firebase/auth';

const D = {
  bg: '#FFF8EE', surface: '#FFFFFF', border: '#FFDDB0',
  orange: '#FF6B00', orangeDim: '#FFEDD5',
  text1: '#2D1500', text2: '#8B5E3C', text3: '#BF9060',
  green: '#1A9640', greenLight: '#E6F7EC', red: '#E53E00',
};

export default function SubscribeCallbackPage() {
  const searchParams = useSearchParams();
  const status = searchParams.get('status');
  const tx_ref = searchParams.get('tx_ref');
  const plan = searchParams.get('plan');

  const [phase, setPhase] = useState('checking'); // checking | success | failed
  const [error, setError] = useState('');

  useEffect(() => {
    // Contrairement au Pages Router, useSearchParams() est disponible
    // dès le premier rendu côté client — pas besoin d'attendre un
    // équivalent de router.isReady.

    // FLW envoie status=successful ou status=failed dans l'URL
    if (status === 'successful' && tx_ref) {
      // Le webhook FLW a déjà traité le paiement de façon asynchrone.
      // On affiche simplement la confirmation ; le statut Firestore est mis
      // à jour par flutterwave-webhook.js (généralement en quelques secondes).
      setPhase('success');
    } else if (status === 'cancelled' || status === 'failed') {
      setError(status === 'cancelled' ? 'Paiement annulé.' : 'Le paiement a échoué. Réessayez.');
      setPhase('failed');
    } else {
      // Statut inconnu ou page chargée directement
      setPhase('success'); // optimiste si tx_ref présent
    }
  }, [status, tx_ref]);

  // ── Rafraîchissement forcé du token après succès ────────────
  // Le webhook pose le custom claim subscriptionActive sur le compte
  // Firebase Auth du vendeur, mais le SDK client ne relit ce claim
  // qu'au rafraîchissement du token — normalement automatique toutes
  // les ~1h. Sans cet appel, un vendeur qui vient de payer et clique
  // aussitôt sur "Lancer mon premier live" / "Publier une vidéo" se
  // verrait refuser l'upload par le Worker Cloudflare (claim encore
  // absent de son token en cours), alors que Firestore est déjà à jour.
  //
  // ⚠️ Le webhook peut mettre quelques secondes à traiter le paiement
  // après la redirection Flutterwave — un getIdToken(true) lancé trop
  // tôt peut donc encore renvoyer l'ancien claim. On retente quelques
  // fois avec un court délai plutôt que de forcer une seule fois.
  useEffect(() => {
    if (phase !== 'success') return;

    let cancelled = false;

    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user || cancelled) return;

      const maxAttempts = 5;
      const delayMs = 1500;

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        if (cancelled) return;
        try {
          const tokenResult = await user.getIdTokenResult(true);
          if (tokenResult.claims?.subscriptionActive === true) {
            return; // claim propagé, terminé
          }
        } catch (e) {
          console.error('Rafraîchissement du token échoué:', e);
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
      // Après maxAttempts, on abandonne silencieusement : le claim finira
      // par se propager au rafraîchissement automatique (~1h). L'UI ne
      // bloque pas l'utilisateur pour autant, voir les liens ci-dessous.
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, [phase]);

  if (phase === 'checking') return <Loader />;

  if (phase === 'failed') return (
    <Screen icon="❌" title="Paiement non abouti" sub={error || 'Une erreur est survenue.'} bg="#FEF2F2">
      <Link href="/seller/subscribe" style={btnStyle(D.orange)}>Réessayer</Link>
      <Link href="/app" style={btnStyle('transparent', D.text2, `1px solid ${D.border}`)}>Retour à l'accueil</Link>
    </Screen>
  );

  const PLAN_LABELS = { essentiel: 'Pack Essentiel', pro: 'Pack Pro', elite: 'Pack Elite' };

  return (
    <Screen icon="🎉" title="Abonnement activé !" sub="Votre compte vendeur est maintenant actif. Toutes les fonctionnalités sont débloquées.">
      <div style={{
        background: D.surface, borderRadius: 14, border: `1px solid ${D.border}`,
        padding: '16px 20px', marginBottom: 20, textAlign: 'left',
      }}>
        <Row label="Plan" value={PLAN_LABELS[plan] ?? plan ?? '–'} />
        <Row label="Statut" value="✅ Actif" color={D.green} />
        <Row label="Référence" value={tx_ref ? tx_ref.slice(0, 22) + '…' : '–'} last />
      </div>
      <Link href="/golive" style={btnStyle(D.orange)}>🔴 Lancer mon premier live</Link>
      <Link href="/seller" style={btnStyle('transparent', D.text2, `1px solid ${D.border}`)}>Mon espace vendeur</Link>
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