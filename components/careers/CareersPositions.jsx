'use client';
import { useState } from "react";

// components/careers/CareersPositions.js
// -----------------------------------------------------------------------------
// Liste filtrable des postes ouverts, styles inline, tokens de design
// identiques à CareersHero.js / CarrieresBanner.jsx.
// -----------------------------------------------------------------------------

// ─── Design tokens — identiques à CareersHero.js ────────────────────────────
const D = {
  bg:      "#F2F1EC",
  card:    "#FFFFFF",
  border:  "#E3DDC9",
  navy:    "#1B2A4A",
  navyDim: "rgba(27,42,74,0.06)",
  gold:    "#B8860B",
  goldDim: "rgba(184,134,11,0.10)",
  green:   "#1F6F4A",
  greenDim:"rgba(31,111,74,0.10)",
  text1:   "#1B2A4A",
  text2:   "#6B6456",
  text3:   "#9C9382",
};

const CATEGORIES = ["Tous", "Vente & animation", "Contenu & support", "Production", "Croissance"];

const POSITIONS = [
  {
    icon: "🎤",
    title: "Hôte / Hôtesse Live",
    category: "Vente & animation",
    location: "GDIZ, Glo-Djigbé",
    type: "Temps plein",
    pay: "75 000 – 100 000 FCFA + 2-4 % des ventes",
    summary:
      "Présentez les produits en direct depuis les usines, répondez aux questions des spectateurs et animez les offres flash.",
    requirements: [
      "Aisance à l'oral et devant la caméra",
      "Fierté du Made in Benin et sens du commerce",
      "Aucune expérience obligatoire — formation assurée",
    ],
  },
  {
    icon: "💬",
    title: "Community Manager / Modérateur Live",
    category: "Contenu & support",
    location: "Cotonou (hybride)",
    type: "Temps plein",
    pay: "90 000 – 120 000 FCFA + prime trimestrielle",
    summary:
      "Modérez les lives en temps réel, répondez aux messages sur les réseaux sociaux et faites remonter les retours clients.",
    requirements: [
      "Bonne maîtrise de TikTok, Facebook, Instagram, WhatsApp Business",
      "Rédaction claire en français",
      "Réactivité et sang-froid face aux réclamations",
    ],
  },
  {
    icon: "🎬",
    title: "Monteur vidéo / Régisseur",
    category: "Production",
    location: "GDIZ, Glo-Djigbé",
    type: "Temps plein",
    pay: "80 000 – 110 000 FCFA",
    summary:
      "Préparez le tournage (son, lumière, connexion) et montez les extraits courts diffusés après chaque live.",
    requirements: [
      "Bases de montage vidéo mobile (type CapCut)",
      "Notions de diffusion en direct",
      "Matériel fourni par FriTok",
    ],
  },
  {
    icon: "🤝",
    title: "Coordinateur·rice Programme Ambassadeurs",
    category: "Croissance",
    location: "Cotonou",
    type: "Temps plein",
    pay: "120 000 – 150 000 FCFA + prime sur croissance",
    summary:
      "Recrutez et animez le réseau de créateurs affiliés, suivez leurs ventes et gérez le versement des commissions.",
    requirements: [
      "Expérience en gestion de communauté ou en affiliation",
      "À l'aise avec le suivi de données de vente simples",
      "Sens de l'organisation",
    ],
  },
];

function CategoryPill({ label, active, onTap }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onTap}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: "10px 18px",
        borderRadius: 999,
        border: `1.5px solid ${active ? D.navy : D.border}`,
        background: active ? D.navy : hover ? D.navyDim : D.card,
        color: active ? "#fff" : D.text2,
        fontSize: 13,
        fontWeight: 700,
        cursor: "pointer",
        transition: "all 0.15s",
      }}
    >
      {label}
    </button>
  );
}

function JobCard({ job }) {
  return (
    <article
      style={{
        display: "flex",
        flexDirection: "column",
        background: D.card,
        borderRadius: 20,
        border: `1.5px solid ${D.border}`,
        padding: 24,
        boxShadow: `0 4px 12px ${D.navy}0A`,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div
          style={{
            width: 46,
            height: 46,
            borderRadius: 14,
            background: D.navyDim,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 22,
            flexShrink: 0,
          }}
        >
          {job.icon}
        </div>
        <span
          style={{
            background: D.greenDim,
            color: D.green,
            fontSize: 11,
            fontWeight: 700,
            padding: "5px 12px",
            borderRadius: 999,
          }}
        >
          {job.category}
        </span>
      </div>

      <h3 style={{ color: D.text1, fontSize: 17, fontWeight: 800, margin: "16px 0 8px" }}>
        {job.title}
      </h3>
      <p style={{ color: D.text2, fontSize: 13.5, lineHeight: 1.6, margin: 0 }}>{job.summary}</p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, margin: "16px 0", fontSize: 12, color: D.text3 }}>
        <span>📍 {job.location}</span>
        <span>⏱️ {job.type}</span>
        <span>💰 {job.pay}</span>
      </div>

      <ul
        style={{
          flex: 1,
          margin: 0,
          padding: "16px 0 0",
          borderTop: `1px solid ${D.border}`,
          listStyle: "none",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {job.requirements.map((req) => (
          <li key={req} style={{ display: "flex", gap: 8, color: D.text2, fontSize: 13, lineHeight: 1.5 }}>
            <span style={{ color: D.gold, flexShrink: 0 }}>•</span>
            {req}
          </li>
        ))}
      </ul>

      <a
        href={`mailto:recrutement@fritok.net?subject=${encodeURIComponent("Candidature — " + job.title)}`}
        style={{
          marginTop: 20,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: D.navy,
          color: "#fff",
          fontWeight: 700,
          fontSize: 14,
          padding: "13px 0",
          borderRadius: 14,
          textDecoration: "none",
        }}
      >
        Postuler à ce poste
      </a>
    </article>
  );
}

export default function CareersPositions() {
  const [active, setActive] = useState("Tous");
  const filtered = active === "Tous" ? POSITIONS : POSITIONS.filter((p) => p.category === active);

  return (
    <section id="postes" style={{ background: D.bg, padding: "80px 24px" }}>
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
          Postes ouverts
        </p>
        <h2 style={{ color: D.navy, fontSize: 32, fontWeight: 800, margin: "0 0 32px", maxWidth: 520 }}>
          Rejoignez l&apos;équipe Made in Benin Live
        </h2>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 32 }}>
          {CATEGORIES.map((cat) => (
            <CategoryPill key={cat} label={cat} active={active === cat} onTap={() => setActive(cat)} />
          ))}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 20,
          }}
        >
          {filtered.map((job) => (
            <JobCard key={job.title} job={job} />
          ))}
        </div>
      </div>
    </section>
  );
}