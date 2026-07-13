// components/careers/CareersHero.js
// -----------------------------------------------------------------------------
// Section héro de la page /carrieres. Styles inline, tokens de design
// identiques à CarrieresBanner.jsx pour cohérence visuelle sur tout le
// programme Made in Benin Live.
// -----------------------------------------------------------------------------

// ─── Design tokens — identiques à CarrieresBanner.jsx ───────────────────────
const D = {
  navy:      "#1B2A4A",
  navyDeep:  "#0F1B32",
  gold:      "#B8860B",
  goldLight: "#D9B45C",
  goldDim:   "rgba(217,180,92,0.14)",
  white:     "#FFFFFF",
  text2:     "rgba(255,255,255,0.85)",
  text3:     "rgba(255,255,255,0.7)",
  border:    "rgba(255,255,255,0.25)",
};

const BADGES = [
  { icon: "🎓", label: "Formation assurée, aucune expérience obligatoire" },
  { icon: "💰", label: "Fixe + commission sur les ventes en direct" },
  { icon: "📍", label: "Zone Industrielle de Glo-Djigbé, Bénin" },
];

function Badge({ icon, label }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        background: "rgba(255,255,255,0.08)",
        border: `1px solid ${D.border}`,
        borderRadius: 999,
        padding: "9px 16px",
        color: D.text2,
        fontSize: 13,
        fontWeight: 600,
      }}
    >
      <span style={{ fontSize: 15 }}>{icon}</span>
      {label}
    </span>
  );
}

export default function CareersHero() {
  return (
    <section
      style={{
        position: "relative",
        background: `linear-gradient(135deg, ${D.navy}, ${D.navyDeep})`,
        padding: "76px 24px 88px",
        overflow: "hidden",
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.07,
          backgroundImage:
            "repeating-linear-gradient(135deg, #F2F1EC 0px, #F2F1EC 1px, transparent 1px, transparent 14px)",
        }}
      />

      <div style={{ position: "relative", maxWidth: 760, margin: "0 auto" }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            background: D.goldDim,
            borderRadius: 999,
            padding: "7px 16px",
            marginBottom: 24,
          }}
        >
          <span style={{ fontSize: 14 }}>🎙️</span>
          <span
            style={{
              color: D.goldLight,
              fontSize: 12,
              fontWeight: 800,
              letterSpacing: 1.2,
              textTransform: "uppercase",
            }}
          >
            Recrutement · Made in Benin Live
          </span>
        </div>

        <h1
          style={{
            color: D.white,
            fontSize: 44,
            fontWeight: 800,
            lineHeight: 1.12,
            margin: "0 0 20px",
            letterSpacing: -0.5,
          }}
        >
          Devenez le visage du Made in&nbsp;Benin, en direct.
        </h1>

        <p
          style={{
            color: D.text2,
            fontSize: 17,
            lineHeight: 1.65,
            margin: "0 0 32px",
            maxWidth: 620,
          }}
        >
          Made in Benin Live est le programme de live commerce de FriTok avec la GDIZ. Nous
          recrutons les hôtes et hôtesses, créateurs et créatrices, et l&apos;équipe qui feront
          vivre en direct les usines de Glo-Djigbé — pour le Bénin, puis pour l&apos;Afrique de
          l&apos;Ouest.
        </p>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 36 }}>
          {BADGES.map((b) => (
            <Badge key={b.label} icon={b.icon} label={b.label} />
          ))}
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
          <a
            href="#postes"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              background: D.gold,
              color: D.navy,
              fontWeight: 700,
              fontSize: 15,
              padding: "15px 28px",
              borderRadius: 999,
              textDecoration: "none",
            }}
          >
            📡 Voir les postes ouverts
          </a>
          <a
            href="#ambassadeurs"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              background: "transparent",
              color: D.white,
              fontWeight: 700,
              fontSize: 15,
              padding: "15px 28px",
              borderRadius: 999,
              border: `1.5px solid ${D.border}`,
              textDecoration: "none",
            }}
          >
            🤝 Devenir créateur ambassadeur
          </a>
        </div>
      </div>
    </section>
  );
}