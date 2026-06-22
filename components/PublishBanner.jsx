'use client';
import { useState } from 'react';
import Link from 'next/link';

// Design tokens matching the Flutter AddVideoPage
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

/**
 * PublishBanner — à insérer dans la page marketing Home entre <AppBanner /> et <Ticker />.
 * Redirige vers /publish (la route qui rend <AddVideoPage />).
 */
export default function PublishBanner() {
  const [hover, setHover] = useState(false);

  return (
    <section
      style={{
        background: D.bg,
        padding: "40px 24px",
        display: "flex",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          maxWidth: 720,
          width: "100%",
          borderRadius: 28,
          overflow: "hidden",
          background: "linear-gradient(135deg, #FF6B00 0%, #FF9500 55%, #FFB700 100%)",
          boxShadow: `0 16px 48px ${D.orange}40`,
          padding: "36px 40px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 24,
          flexWrap: "wrap",
        }}
      >
        {/* Left: icon + text */}
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              width: 68,
              height: 68,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.25)",
              border: "2px solid rgba(255,255,255,0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 32,
              flexShrink: 0,
            }}
          >
            🎬
          </div>
          <div>
            <div
              style={{
                color: "#fff",
                fontSize: 22,
                fontWeight: 900,
                letterSpacing: -0.5,
                lineHeight: 1.2,
              }}
            >
              Publie ta vidéo produit
            </div>
            <div
              style={{
                color: "rgba(255,255,255,0.8)",
                fontSize: 14,
                marginTop: 6,
                lineHeight: 1.4,
              }}
            >
              Télécharge ta vidéo, ajoute ton produit et publie en 3 étapes.
            </div>
            {/* Step badges */}
            <div
              style={{
                display: "flex",
                gap: 8,
                marginTop: 14,
                flexWrap: "wrap",
              }}
            >
              {[
                { n: "1", label: "Vidéo" },
                { n: "2", label: "Image" },
                { n: "3", label: "Infos" },
              ].map(({ n, label }) => (
                <span
                  key={n}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "4px 10px",
                    borderRadius: 20,
                    background: "rgba(255,255,255,0.2)",
                    border: "1px solid rgba(255,255,255,0.4)",
                    fontSize: 12,
                    fontWeight: 700,
                    color: "#fff",
                  }}
                >
                  <span
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: "50%",
                      background: "rgba(255,255,255,0.3)",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 9,
                      fontWeight: 800,
                    }}
                  >
                    {n}
                  </span>
                  {label}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* CTA button */}
        <Link href="/publish">
          <button
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
            style={{
              padding: "15px 32px",
              borderRadius: 18,
              background: hover ? "#fff" : "rgba(255,255,255,0.92)",
              color: D.orange,
              fontSize: 15,
              fontWeight: 900,
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 8,
              boxShadow: hover
                ? "0 8px 28px rgba(0,0,0,0.18)"
                : "0 4px 16px rgba(0,0,0,0.12)",
              transform: hover ? "scale(1.03)" : "scale(1)",
              transition: "all 0.18s",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            🚀 Commencer maintenant
          </button>
        </Link>
      </div>
    </section>
  );
}