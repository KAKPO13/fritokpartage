// components/B2BSupplierBanner.jsx
'use client';

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
};

export default function B2BSupplierBanner() {
  return (
    <section
      style={{
        margin: "32px auto",
        maxWidth: 1100,
        padding: "0 20px",
      }}
    >
      <div
        style={{
          position: "relative",
          borderRadius: 28,
          overflow: "hidden",
          background: `linear-gradient(135deg, ${D.orange} 0%, #FF9500 55%, ${D.zest} 100%)`,
          boxShadow: `0 12px 32px ${D.orange}40`,
          padding: "36px 28px",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          gap: 16,
        }}
      >
        {/* Motif décoratif en fond, dans le même esprit que les autres bannières */}
        <div
          style={{
            position: "absolute",
            top: -30,
            right: -30,
            fontSize: 160,
            opacity: 0.12,
            lineHeight: 1,
            pointerEvents: "none",
            userSelect: "none",
          }}
        >
          🏭
        </div>

        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            background: "rgba(255,255,255,0.18)",
            border: "1px solid rgba(255,255,255,0.35)",
            borderRadius: 999,
            padding: "6px 14px",
            fontSize: 12.5,
            fontWeight: 800,
            color: "#fff",
            letterSpacing: 0.3,
          }}
        >
          🏭 Espace grossistes & industriels
        </div>

        <h3
          style={{
            color: "#fff",
            fontSize: 24,
            fontWeight: 900,
            letterSpacing: -0.5,
            margin: 0,
            maxWidth: 560,
            lineHeight: 1.25,
          }}
        >
          Devenez fournisseur B2B sur FriTok
        </h3>

        <p
          style={{
            color: "rgba(255,255,255,0.88)",
            fontSize: 14.5,
            lineHeight: 1.6,
            margin: 0,
            maxWidth: 560,
          }}
        >
          Usines PIA, Usines GDIZ, PME référencées, coopératives : ouvrez vos produits aux
          grossistes, supermarchés et hôtels avec des tarifs dégressifs et un
          MOQ adapté à votre production.
        </p>

        <Link
          href="/vendeur/devenir-fournisseur-b2b"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            marginTop: 8,
            padding: "14px 26px",
            borderRadius: 16,
            background: "#fff",
            color: D.orange,
            fontSize: 15,
            fontWeight: 900,
            textDecoration: "none",
            boxShadow: "0 6px 18px rgba(0,0,0,0.15)",
          }}
        >
          📤 Déposer ma demande
        </Link>
      </div>
    </section>
  );
}