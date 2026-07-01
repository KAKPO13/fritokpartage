'use client';

// CommandeBanner.jsx
// Bandeau marketing "Suivez vos commandes" → /mes-commandes
// Design tokens — identiques à AjouterColisPage / AddVideoPage.

import Link from 'next/link';

const D = {
  orange:    "#FF6B00",
  orangeHot: "#FF8C00",
  zest:      "#FFB700",
  text1:     "#2D1500",
  text2:     "#8B5E3C",
  card:      "#FFFFFF",
  border:    "#FFDDB0",
  orangeDim: "#FFEDD5",
  bg:        "#FFF8EE",
  green:     "#1A9640",
  red:       "#E53E00",
};

export default function CommandeBanner() {
  return (
    <section
      style={{
        padding: '48px 22px',
        display: 'flex',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 960,
          borderRadius: 28,
          background: `linear-gradient(135deg, ${D.orange} 0%, #FF9500 55%, ${D.zest} 100%)`,
          boxShadow: `0 12px 32px ${D.orange}33`,
          padding: '36px 32px',
          display: 'flex',
          alignItems: 'center',
          gap: 28,
          flexWrap: 'wrap',
        }}
      >
        {/* Icône */}
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: 20,
            background: 'rgba(255,255,255,0.22)',
            border: '1.5px solid rgba(255,255,255,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 34,
            flexShrink: 0,
          }}
        >
          📦
        </div>

        {/* Texte */}
        <div style={{ flex: 1, minWidth: 220 }}>
          <div
            style={{
              color: '#fff',
              fontSize: 22,
              fontWeight: 900,
              letterSpacing: -0.5,
            }}
          >
            Suivez vos commandes
          </div>
          <div
            style={{
              color: 'rgba(255,255,255,0.85)',
              fontSize: 14,
              marginTop: 6,
              lineHeight: 1.5,
            }}
          >
            Statut en temps réel, code QR de validation et historique complet — tout est là.
          </div>
        </div>

        {/* CTA */}
        <Link
          href="/mes-commandes"
          style={{
            flexShrink: 0,
            padding: '14px 26px',
            borderRadius: 16,
            background: '#fff',
            color: D.orangeHot,
            fontSize: 15,
            fontWeight: 800,
            textDecoration: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            boxShadow: '0 6px 16px rgba(0,0,0,0.12)',
            transition: 'transform 0.15s',
          }}
        >
          Voir mes commandes
          <span style={{ fontSize: 17 }}>→</span>
        </Link>
      </div>
    </section>
  );
}