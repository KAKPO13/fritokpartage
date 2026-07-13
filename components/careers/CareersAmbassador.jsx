// components/careers/CareersAmbassador.js
// -----------------------------------------------------------------------------
// Section programme Ambassadeurs (créateurs externes / affiliation) —
// styles inline, tokens de design identiques aux autres sections carrières.
// -----------------------------------------------------------------------------

// ─── Design tokens ───────────────────────────────────────────────────────────
const D = {
  green:     "#1F6F4A",
  greenDeep: "#154E34",
  white:     "#FFFFFF",
  text2:     "rgba(255,255,255,0.82)",
  card:      "rgba(255,255,255,0.10)",
  cardIcon:  "rgba(255,255,255,0.16)",
};

const PERKS = [
  {
    icon: "💵",
    title: "Jusqu'à 15 % de commission",
    text: "Sur chaque vente générée via votre lien ou votre code créateur — pas de fixe, pas de plafond.",
  },
  {
    icon: "📦",
    title: "Accès produits",
    text: "Échantillons des usines partenaires de la GDIZ pour vos propres contenus (textile, cajou, cosmétique...).",
  },
  {
    icon: "🔗",
    title: "Votre lien, vos audiences",
    text: "Publiez sur TikTok, Instagram ou WhatsApp avec votre lien de suivi — vous gardez votre communauté.",
  },
];

function PerkRow({ icon, title, text }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 16,
        background: D.card,
        borderRadius: 16,
        padding: 20,
      }}
    >
      <span
        style={{
          width: 42,
          height: 42,
          borderRadius: 12,
          background: D.cardIcon,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 20,
          flexShrink: 0,
        }}
      >
        {icon}
      </span>
      <div>
        <h3 style={{ color: D.white, fontSize: 14.5, fontWeight: 800, margin: "0 0 6px" }}>{title}</h3>
        <p style={{ color: D.text2, fontSize: 13.5, lineHeight: 1.55, margin: 0 }}>{text}</p>
      </div>
    </div>
  );
}

export default function CareersAmbassador() {
  return (
    <section
      id="ambassadeurs"
      style={{
        background: `linear-gradient(135deg, ${D.green}, ${D.greenDeep})`,
        padding: "80px 24px",
      }}
    >
      <div
        style={{
          maxWidth: 980,
          margin: "0 auto",
          display: "flex",
          flexWrap: "wrap",
          gap: 40,
          justifyContent: "space-between",
        }}
      >
        <div style={{ flex: "1 1 320px", maxWidth: 420 }}>
          <p
            style={{
              color: "#C8E6A0",
              fontSize: 12,
              fontWeight: 800,
              letterSpacing: 1.2,
              textTransform: "uppercase",
              margin: "0 0 8px",
            }}
          >
            Sans contrat, sans exclusivité
          </p>
          <h2 style={{ color: D.white, fontSize: 30, fontWeight: 800, lineHeight: 1.2, margin: "0 0 16px" }}>
            Créateur, créatrice&nbsp;? Devenez ambassadeur·rice
          </h2>
          <p style={{ color: D.text2, fontSize: 14.5, lineHeight: 1.65, margin: "0 0 24px" }}>
            Vous créez déjà du contenu et vous voulez être payé·e pour vos ventes, pas pour vos
            vues. Le programme Ambassadeurs Made in Benin Live vous rémunère directement sur les
            commandes que vous générez.
          </p>
          <a
            href="mailto:recrutement@fritok.net?subject=Candidature — Programme Ambassadeurs"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              background: D.white,
              color: D.green,
              fontWeight: 700,
              fontSize: 14.5,
              padding: "13px 26px",
              borderRadius: 999,
              textDecoration: "none",
            }}
          >
            🚀 Rejoindre le programme
          </a>
        </div>

        <div style={{ flex: "1 1 320px", maxWidth: 440, display: "flex", flexDirection: "column", gap: 14 }}>
          {PERKS.map((p) => (
            <PerkRow key={p.title} icon={p.icon} title={p.title} text={p.text} />
          ))}
        </div>
      </div>
    </section>
  );
}