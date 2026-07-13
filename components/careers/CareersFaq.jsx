'use client';
import { useState } from "react";

// components/careers/CareersFaq.js
// -----------------------------------------------------------------------------
// Accordéon de questions fréquentes — styles inline, tokens de design
// identiques aux autres sections carrières.
// -----------------------------------------------------------------------------

// ─── Design tokens ───────────────────────────────────────────────────────────
const D = {
  bg:     "#F2F1EC",
  card:   "#FFFFFF",
  border: "#E3DDC9",
  navy:   "#1B2A4A",
  gold:   "#B8860B",
  text1:  "#1B2A4A",
  text2:  "#6B6456",
  text3:  "#9C9382",
};

const FAQS = [
  {
    q: "Faut-il de l'expérience pour devenir hôte ou hôtesse live ?",
    a: "Non. Nous recherchons avant tout de l'aisance à l'oral et de la fierté pour le Made in Benin. Une formation de 30 jours est assurée par FriTok avant votre premier live en autonomie.",
  },
  {
    q: "Comment est calculée la commission sur les ventes ?",
    a: "Elle varie selon le poste : 2 à 4 % des ventes réalisées en direct pour les hôtes et hôtesses salarié·es, et jusqu'à 15 % pour les créateurs et créatrices du programme Ambassadeurs, versée sur les commandes suivies via leur lien.",
  },
  {
    q: "Le programme est-il ouvert hors du Bénin ?",
    a: "Le pilote démarre au Bénin, avec une extension prévue vers le Togo, la Côte d'Ivoire, le Ghana et le Nigeria. Les candidatures de ces pays sont déjà les bienvenues pour le programme Ambassadeurs.",
  },
  {
    q: "Puis-je postuler sans vidéo de présentation ?",
    a: "Oui pour les postes de community manager, monteur vidéo ou coordinateur — une simple candidature par email suffit. Pour les postes d'hôte·sse, une courte vidéo remplace l'entretien classique et accélère votre candidature.",
  },
];

function FaqRow({ q, a, isOpen, onTap, isLast }) {
  return (
    <div style={{ borderBottom: isLast ? "none" : `1px solid ${D.border}` }}>
      <button
        type="button"
        onClick={onTap}
        aria-expanded={isOpen}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          padding: "20px 24px",
          background: "transparent",
          border: "none",
          textAlign: "left",
          cursor: "pointer",
        }}
      >
        <span style={{ color: D.text1, fontSize: 14.5, fontWeight: 700 }}>{q}</span>
        <span
          style={{
            color: D.text3,
            fontSize: 13,
            flexShrink: 0,
            transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.2s",
          }}
        >
          ▾
        </span>
      </button>
      {isOpen && (
        <p style={{ margin: 0, padding: "0 24px 22px", color: D.text2, fontSize: 13.5, lineHeight: 1.65 }}>
          {a}
        </p>
      )}
    </div>
  );
}

export default function CareersFaq() {
  const [open, setOpen] = useState(0);

  return (
    <section style={{ background: D.bg, padding: "80px 24px" }}>
      <div style={{ maxWidth: 680, margin: "0 auto" }}>
        <p
          style={{
            color: D.gold,
            fontSize: 12,
            fontWeight: 800,
            letterSpacing: 1.2,
            textTransform: "uppercase",
            margin: "0 0 8px",
            textAlign: "center",
          }}
        >
          Questions fréquentes
        </p>
        <h2 style={{ color: D.navy, fontSize: 30, fontWeight: 800, margin: "0 0 32px", textAlign: "center" }}>
          Avant de postuler
        </h2>

        <div
          style={{
            background: D.card,
            borderRadius: 20,
            border: `1.5px solid ${D.border}`,
            overflow: "hidden",
          }}
        >
          {FAQS.map((item, i) => (
            <FaqRow
              key={item.q}
              q={item.q}
              a={item.a}
              isOpen={open === i}
              onTap={() => setOpen(open === i ? -1 : i)}
              isLast={i === FAQS.length - 1}
            />
          ))}
        </div>

        <p style={{ marginTop: 32, textAlign: "center", color: D.text2, fontSize: 13.5 }}>
          Une autre question&nbsp;? Écrivez à{" "}
          <a href="mailto:recrutement@fritok.net" style={{ color: D.navy, fontWeight: 700 }}>
            recrutement@fritok.net
          </a>
        </p>
      </div>
    </section>
  );
}