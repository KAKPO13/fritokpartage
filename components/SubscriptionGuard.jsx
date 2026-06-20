// components/SubscriptionGuard.jsx
// Enveloppe une page/section réservée aux vendeurs abonnés.
// Affiche une bannière trial, un paywall ou laisse passer selon le statut.
//
// Usage :
//   <SubscriptionGuard>
//     <GoLivePage />
//   </SubscriptionGuard>

'use client';

import { useRouter }               from 'next/navigation';

import useSellerSubscription from '../app/hooks/useSellerSubscription';

import SubscriptionPaywall         from './SubscriptionPaywall';

export default function SubscriptionGuard({ children, redirectOnExpired = false }) {
  const router                               = useRouter();
  const { loading, hasAccess, status, daysLeft } = useSellerSubscription();

  if (loading) return <GuardLoader />;

  // Accès autorisé → afficher le contenu avec éventuellement une bannière
  if (hasAccess()) {
    return (
      <>
        {/* Bannière d'urgence : trial avec ≤ 3 jours restants */}
        {status === 'trial' && daysLeft() <= 3 && (
          <TrialWarningBanner days={daysLeft()} />
        )}
        {/* Bannière standard trial */}
        {status === 'trial' && daysLeft() > 3 && (
          <TrialInfoBanner days={daysLeft()} />
        )}
        {children}
      </>
    );
  }

  // Accès refusé
  if (redirectOnExpired) {
    if (typeof window !== 'undefined') {
      router.replace('/seller/subscribe');
    }
    return <GuardLoader />;
  }

  return <SubscriptionPaywall status={status} />;
}

// ── Loader ─────────────────────────────────────────────────
function GuardLoader() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '60vh', background: '#FFF8EE',
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>⚡</div>
        <div style={{ fontSize: 14, color: '#8B5E3C' }}>Vérification de l'abonnement…</div>
      </div>
    </div>
  );
}

// ── Bannière trial info ────────────────────────────────────
function TrialInfoBanner({ days }) {
  return (
    <div style={{
      background: '#FFFBEB', borderBottom: '1px solid #FDE68A',
      padding: '10px 20px', display: 'flex', alignItems: 'center',
      justifyContent: 'space-between', gap: 12,
      fontFamily: 'system-ui, sans-serif', fontSize: 13,
    }}>
      <span style={{ color: '#92400E' }}>
        🎁 <strong>Période d'essai gratuite</strong> — {days} jour{days > 1 ? 's' : ''} restant{days > 1 ? 's' : ''}
      </span>
      <a href="/seller/subscribe" style={{
        background: '#F97316', color: '#fff', padding: '5px 14px',
        borderRadius: 20, fontWeight: 700, fontSize: 12,
        textDecoration: 'none', whiteSpace: 'nowrap',
      }}>
        S'abonner →
      </a>
    </div>
  );
}

// ── Bannière trial urgente ─────────────────────────────────
function TrialWarningBanner({ days }) {
  return (
    <div style={{
      background: '#FEF2F2', borderBottom: '1px solid #FECACA',
      padding: '10px 20px', display: 'flex', alignItems: 'center',
      justifyContent: 'space-between', gap: 12,
      fontFamily: 'system-ui, sans-serif', fontSize: 13,
    }}>
      <span style={{ color: '#991B1B' }}>
        ⚠️ <strong>Essai expirant dans {days} jour{days > 1 ? 's' : ''}</strong> — Abonnez-vous pour conserver l'accès
      </span>
      <a href="/seller/subscribe" style={{
        background: '#EF4444', color: '#fff', padding: '5px 14px',
        borderRadius: 20, fontWeight: 700, fontSize: 12,
        textDecoration: 'none', whiteSpace: 'nowrap',
      }}>
        S'abonner maintenant
      </a>
    </div>
  );
}
