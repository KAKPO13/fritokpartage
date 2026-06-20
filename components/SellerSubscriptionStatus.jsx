// components/SellerSubscriptionStatus.jsx
// Encart affiché dans le dashboard vendeur (/seller ou profil)
// Montre le statut, la date d'expiration et le CTA selon le cas.

'use client';

import Link                        from 'next/link';
import { useSellerSubscription }   from '../hooks/useSellerSubscription';

const D = {
  surface: '#FFFFFF', border: '#FFDDB0',
  orange: '#FF6B00', orangeDim: '#FFEDD5',
  text1: '#2D1500', text2: '#8B5E3C', text3: '#BF9060',
  green: '#1A9640', greenLight: '#E6F7EC',
  amber: '#B45309', amberLight: '#FEF3C7',
  red: '#E53E00',
};

const PLAN_LABEL = { essentiel: 'Essentiel', pro: 'Pro', elite: 'Elite' };

export default function SellerSubscriptionStatus() {
  const { subscription, status, daysLeft, loading } = useSellerSubscription();

  if (loading) return (
    <div style={{ background: D.surface, borderRadius: 14, border: `1px solid ${D.border}`, padding: '16px 20px' }}>
      <div style={{ fontSize: 12, color: D.text3 }}>Chargement de l'abonnement…</div>
    </div>
  );

  const plan      = subscription?.plan ?? 'pro';
  const periodEnd = subscription?.currentPeriodEnd?.toDate?.() ?? null;
  const fmtDate   = (d) => d ? d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }) : '–';

  // ── Variantes visuelles ──────────────────────────────────
  const variants = {
    trial: {
      bg: D.amberLight, borderColor: `${D.amber}44`,
      icon: '🎁', iconBg: '#FDE68A',
      badge: 'ESSAI GRATUIT', badgeBg: D.amber, badgeColor: '#fff',
      title: `${daysLeft()} jour${daysLeft() > 1 ? 's' : ''} restant${daysLeft() > 1 ? 's' : ''} dans votre essai`,
      sub: `Fin d'essai le ${fmtDate(periodEnd)} — Souscrivez pour continuer`,
      cta: 'S\'abonner', ctaHref: '/seller/subscribe', ctaBg: D.orange,
    },
    active: {
      bg: D.greenLight, borderColor: `${D.green}33`,
      icon: '✅', iconBg: '#BBF7D0',
      badge: `PLAN ${(PLAN_LABEL[plan] ?? plan).toUpperCase()}`, badgeBg: D.green, badgeColor: '#fff',
      title: 'Abonnement actif',
      sub: `Renouvellement le ${fmtDate(periodEnd)}`,
      cta: 'Gérer', ctaHref: '/seller/subscribe', ctaBg: D.text2,
    },
    expired: {
      bg: '#FEF2F2', borderColor: `${D.red}33`,
      icon: '⏰', iconBg: '#FECACA',
      badge: 'EXPIRÉ', badgeBg: D.red, badgeColor: '#fff',
      title: 'Abonnement expiré',
      sub: 'Renouvelez pour retrouver l\'accès à vos outils vendeur',
      cta: 'Renouveler', ctaHref: '/seller/subscribe', ctaBg: D.red,
    },
    cancelled: {
      bg: '#F9FAFB', borderColor: D.border,
      icon: '⛔', iconBg: '#F3F4F6',
      badge: 'RÉSILIÉ', badgeBg: '#6B7280', badgeColor: '#fff',
      title: 'Abonnement résilié',
      sub: 'Votre compte vendeur est désactivé',
      cta: 'Me réabonner', ctaHref: '/seller/subscribe', ctaBg: D.orange,
    },
    none: {
      bg: D.orangeDim, borderColor: `${D.orange}44`,
      icon: '🛍️', iconBg: '#FED7AA',
      badge: 'NOUVEAU', badgeBg: D.orange, badgeColor: '#fff',
      title: 'Activez votre compte vendeur',
      sub: '14 jours gratuits, sans carte bancaire requise',
      cta: 'Démarrer gratuitement', ctaHref: '/seller/subscribe', ctaBg: D.orange,
    },
  };

  const v = variants[status] ?? variants.none;

  return (
    <div style={{
      background: v.bg, borderRadius: 16, border: `1px solid ${v.borderColor}`,
      padding: '18px 20px', fontFamily: 'system-ui, sans-serif',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
        {/* Icône */}
        <div style={{
          width: 44, height: 44, borderRadius: 12, background: v.iconBg,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 20, flexShrink: 0,
        }}>
          {v.icon}
        </div>

        {/* Infos */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
            <div style={{
              fontSize: 10, fontWeight: 700, padding: '2px 8px',
              borderRadius: 6, background: v.badgeBg, color: v.badgeColor,
              letterSpacing: 0.8,
            }}>
              {v.badge}
            </div>
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: D.text1, marginBottom: 3 }}>{v.title}</div>
          <div style={{ fontSize: 12, color: D.text2 }}>{v.sub}</div>
        </div>

        {/* CTA */}
        <Link href={v.ctaHref} style={{
          padding: '8px 16px', borderRadius: 10, background: v.ctaBg,
          color: '#fff', fontWeight: 700, fontSize: 12,
          textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0,
        }}>
          {v.cta}
        </Link>
      </div>

      {/* Barre de progression pour le trial */}
      {status === 'trial' && (
        <div style={{ marginTop: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: D.text3, marginBottom: 5 }}>
            <span>Essai gratuit</span>
            <span>{daysLeft()} / 14 jours</span>
          </div>
          <div style={{ height: 5, background: '#FDE68A', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${Math.min(100, (daysLeft() / 14) * 100)}%`,
              background: daysLeft() <= 3 ? D.red : D.amber,
              borderRadius: 99,
              transition: 'width 0.4s',
            }} />
          </div>
        </div>
      )}
    </div>
  );
}
