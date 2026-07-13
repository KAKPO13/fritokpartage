// components/careers/CareersProcess.js
// -----------------------------------------------------------------------------
// Étapes du processus de recrutement — styles inline, tokens de design
// identiques à CareersHero.js / CareersPositions.js.
// -----------------------------------------------------------------------------

// ─── Design tokens — identiques à CareersPositions.js ───────────────────────
const D = {
  card:  "#FFFFFF",
  navy:  "#1B2A4A",
  gold:  "#B8860B",
  text1: "#1B2A4A",
  text2: "#6B6456",
};

const STEPS = [
  {
    icon: "📝",
    title: "Postulez",
    text: "Envoyez votre candidature par email ou via le bouton du poste qui vous intéresse.",
  },
  {
    icon: "🎥",
    title: "Casting filmé",
    text: "Pour les postes d'hôte·sse : une courte présentation d'un produit face caméra, pas un entretien classique.",
  },
  {
    icon: "🎓",
    title: "Formation de 30 jours",
    text: "Prise de parole, outils FriTok, studio — la formation est prise en charge intégralement.",
  },
  {
    icon: "📡",
    title: "Premier live encadré",
    text: "Vous démarrez accompagné·e par un hôte ou une hôtesse expérimenté·e avant de prendre votre autonomie.",
  },
];

function StepCard({ n, icon, title, text }) {
  return (
    <div>
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: 14,
          background: D.navy,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 22,
        }}
      >
        {icon}
      </div>
      <p style={{ color: D.gold, fontSize: 12, fontWeight: 800, margin: "16px 0 4px" }}>
        Étape {n}
      </p>
      <h3 style={{ color: D.text1, fontSize: 15.5, fontWeight: 800, margin: "0 0 8px" }}>{title}</h3>
      <p style={{ color: D.text2, fontSize: 13.5, lineHeight: 1.6, margin: 0 }}>{text}</p>
    </div>
  );
}

export default function CareersProcess() {
  return (
    <section style={{ background: D.card, padding: "80px 24px" }}>
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <p
          style={{
            color: D.gold,
            fontSize: 12,
            fontWeight: 800,
            letterSpacing: 1.2,
            textTransform: "uppercase",
            margin: "0 0 8px",
          }}
        >
          Comment ça se passe
        </p>
        <h2 style={{ color: D.navy, fontSize: 32, fontWeight: 800, margin: "0 0 48px", maxWidth: 460 }}>
          De la candidature à votre premier live
        </h2>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 32,
          }}
        >
          {STEPS.map((step, i) => (
            <StepCard key={step.title} n={i + 1} icon={step.icon} title={step.title} text={step.text} />
          ))}
        </div>
      </div>
    </section>
  );
}