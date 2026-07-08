// components/KkiapayBanner.jsx
// -----------------------------------------------------------------------------
// Bannière CTA homepage — met en avant la recharge wallet en Mobile Money
// (Orange Money, MTN MoMo, Wave) via KkiaPay pour les utilisateurs XOF.
// Suit le même pattern que PublierColisBanner / CommandeBanner / GoLivebanner :
// composant autonome, styles inline, design tokens Citrus Orange.
// -----------------------------------------------------------------------------

import Link from 'next/link';

const D = {
  bg: '#FFF8EE', surface: '#FFFFFF', orange: '#FF6B00', orangeDim: '#FFEDD5',
  zest: '#FFB700', text1: '#2D1500', text2: '#8B5E3C', text3: '#BF9060',
  border: '#FFDDB0',
};

const MOBILE_MONEY_OPERATORS = ['Orange Money', 'MTN MoMo', 'Wave'];

export default function KkiapayBanner() {
  return (
    <section
      style={{
        background: `linear-gradient(135deg, ${D.orange}, ${D.zest})`,
        borderRadius: 24,
        margin: '32px auto',
        maxWidth: 1100,
        padding: '40px 32px',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 24,
      }}
    >
      <div style={{ flex: '1 1 320px', minWidth: 260 }}>
        <div
          style={{
            display: 'inline-block',
            background: 'rgba(255,255,255,0.2)',
            color: '#fff',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 1.2,
            padding: '5px 12px',
            borderRadius: 999,
            marginBottom: 14,
          }}
        >
          📲 NOUVEAU — PAIEMENT MOBILE MONEY
        </div>

        <h2 style={{ color: '#fff', fontSize: 28, fontWeight: 800, margin: '0 0 10px', lineHeight: 1.25 }}>
          Rechargez votre wallet en un clic
        </h2>

        <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: 15, lineHeight: 1.6, margin: '0 0 18px', maxWidth: 460 }}>
          Payez directement avec votre Mobile Money habituel — plus besoin de carte bancaire.
          Vos locations, colis et achats Fritok, réglés en quelques secondes.
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 22 }}>
          {MOBILE_MONEY_OPERATORS.map((op) => (
            <span
              key={op}
              style={{
                background: 'rgba(255,255,255,0.18)',
                color: '#fff',
                fontSize: 12,
                fontWeight: 600,
                padding: '6px 12px',
                borderRadius: 999,
                border: '1px solid rgba(255,255,255,0.3)',
              }}
            >
              {op}
            </span>
          ))}
        </div>

        <Link
          href="/wallet/topup"
          style={{
            display: 'inline-block',
            background: '#fff',
            color: D.orange,
            fontWeight: 700,
            fontSize: 15,
            padding: '13px 28px',
            borderRadius: 14,
            textDecoration: 'none',
          }}
        >
          💳 Recharger mon wallet
        </Link>
      </div>

      {/* Illustration légère — remplaçable par une vraie image plus tard */}
      <div
        aria-hidden="true"
        style={{
          flex: '0 0 auto',
          width: 140,
          height: 140,
          borderRadius: 28,
          background: 'rgba(255,255,255,0.15)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 56,
        }}
      >
        📱💸
      </div>
    </section>
  );
}