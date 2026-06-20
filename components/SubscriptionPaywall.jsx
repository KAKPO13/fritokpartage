// components/SubscriptionPaywall.jsx
// Affiché par SubscriptionGuard quand status = 'expired' | 'cancelled' | 'none'

'use client';
import Link from 'next/link';

const D = {
  bg: '#FFF8EE', surface: '#FFFFFF', border: '#FFDDB0',
  orange: '#FF6B00', orangeDim: '#FFEDD5',
  text1: '#2D1500', text2: '#8B5E3C', text3: '#BF9060',
  red: '#E53E00', amberLight: '#FEF3C7', amber: '#B45309',
};

const STATUS_COPY = {
  expired: {
    icon: '⏰',
    title: 'Votre abonnement a expiré',
    sub: 'Renouvelez pour retrouver l\'accès à toutes vos fonctionnalités vendeur.',
    cta: 'Renouveler mon abonnement',
  },
  cancelled: {
    icon: '⛔',
    title: 'Abonnement résilié',
    sub: 'Votre abonnement a été annulé. Souscrivez à nouveau pour reprendre votre activité.',
    cta: 'Me réabonner',
  },
  none: {
    icon: '🛍️',
    title: 'Activez votre compte vendeur',
    sub: 'Profitez de 14 jours gratuits, sans carte bancaire. Accès complet immédiat.',
    cta: 'Démarrer l\'essai gratuit',
  },
};

export default function SubscriptionPaywall({ status = 'expired' }) {
  const copy = STATUS_COPY[status] ?? STATUS_COPY.expired;

  return (
    <div style={{
      minHeight: '70vh', background: D.bg, display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      padding: 24, fontFamily: 'system-ui, sans-serif',
    }}>
      <div style={{ maxWidth: 420, width: '100%', textAlign: 'center' }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>{copy.icon}</div>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: D.text1, margin: '0 0 10px' }}>
          {copy.title}
        </h2>
        <p style={{ fontSize: 14, color: D.text2, lineHeight: 1.6, margin: '0 0 28px' }}>
          {copy.sub}
        </p>

        {/* Plans rapides */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 24, justifyContent: 'center' }}>
          {[
            { id: 'essentiel', label: 'Essentiel', price: '2 500 FCFA' },
            { id: 'pro',       label: 'Pro',       price: '5 000 FCFA', popular: true },
            { id: 'elite',     label: 'Elite',     price: '10 000 FCFA' },
          ].map(p => (
            <div key={p.id} style={{
              flex: 1, padding: '12px 8px', borderRadius: 12,
              border: `1.5px solid ${p.popular ? D.orange : D.border}`,
              background: p.popular ? D.orangeDim : D.surface,
              position: 'relative',
            }}>
              {p.popular && (
                <div style={{
                  position: 'absolute', top: -9, left: '50%', transform: 'translateX(-50%)',
                  background: D.orange, color: '#fff', fontSize: 9, fontWeight: 700,
                  padding: '2px 8px', borderRadius: 10, whiteSpace: 'nowrap',
                }}>POPULAIRE</div>
              )}
              <div style={{ fontSize: 13, fontWeight: 700, color: p.popular ? D.orange : D.text1 }}>{p.label}</div>
              <div style={{ fontSize: 11, color: D.text3, marginTop: 3 }}>{p.price}/mois</div>
            </div>
          ))}
        </div>

        <Link href="/seller/subscribe" style={{
          display: 'block', width: '100%', padding: '14px 0',
          background: D.orange, color: '#fff', borderRadius: 14,
          fontWeight: 700, fontSize: 15, textDecoration: 'none',
          boxSizing: 'border-box',
        }}>
          {copy.cta}
        </Link>

        {status === 'none' && (
          <p style={{ fontSize: 12, color: D.text3, marginTop: 10 }}>
            14 jours gratuits · Sans carte bancaire · Résiliable à tout moment
          </p>
        )}
      </div>
    </div>
  );
}