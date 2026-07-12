// components/CarrieresBanner.jsx
// -----------------------------------------------------------------------------
// Bannière CTA homepage — met en avant le recrutement du programme
// "Made in Benin Live" (hôtes/hôtesses, community manager, créateurs ambassadeurs).
// Suit le même pattern que KkiapayBanner / PublierColisBanner / CommandeBanner :
// composant autonome, styles inline, design tokens Made in Benin Live.
// -----------------------------------------------------------------------------

import Link from 'next/link';

const D = {
  bg: '#F2F1EC', surface: '#FFFFFF', navy: '#1B2A4A', navyDeep: '#0F1B32',
  gold: '#B8860B', goldLight: '#D9B45C', text1: '#FFFFFF', text2: 'rgba(255,255,255,0.85)',
  text3: 'rgba(255,255,255,0.7)', border: 'rgba(255,255,255,0.3)',
};

const OPEN_ROLES = ['Hôte / Hôtesse Live', 'Community Manager', 'Créateur Ambassadeur'];

export default function CarrieresBanner() {
  return (
    <section
      style={{
        background: `linear-gradient(135deg, ${D.navy}, ${D.navyDeep})`,
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
            background: 'rgba(255,255,255,0.12)',
            color: D.goldLight,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 1.2,
            padding: '5px 12px',
            borderRadius: 999,
            marginBottom: 14,
          }}
        >
          🎙️ RECRUTEMENT — MADE IN BENIN LIVE
        </div>

        <h2 style={{ color: D.text1, fontSize: 28, fontWeight: 800, margin: '0 0 10px', lineHeight: 1.25 }}>
          Devenez le visage du Made in Benin, en direct
        </h2>

        <p style={{ color: D.text2, fontSize: 15, lineHeight: 1.6, margin: '0 0 18px', maxWidth: 460 }}>
          FriTok recrute pour animer les ventes en direct des usines de la GDIZ. Aucune
          expérience obligatoire — formation assurée, fixe + commission sur vos ventes.
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 22 }}>
          {OPEN_ROLES.map((role) => (
            <span
              key={role}
              style={{
                background: 'rgba(255,255,255,0.1)',
                color: D.text1,
                fontSize: 12,
                fontWeight: 600,
                padding: '6px 12px',
                borderRadius: 999,
                border: `1px solid ${D.border}`,
              }}
            >
              {role}
            </span>
          ))}
        </div>

        <Link
          href="/carrieres"
          style={{
            display: 'inline-block',
            background: D.gold,
            color: D.navy,
            fontWeight: 700,
            fontSize: 15,
            padding: '13px 28px',
            borderRadius: 14,
            textDecoration: 'none',
          }}
        >
          📡 Voir les postes ouverts
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
          background: 'rgba(255,255,255,0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 56,
        }}
      >
        🎥🇧🇯
      </div>
    </section>
  );
}