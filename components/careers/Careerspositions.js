'use client';

import { useState } from 'react';
import { Mic2, MessageCircle, Clapperboard, Users2, MapPin, Clock, Wallet } from 'lucide-react';

const CATEGORIES = ['Tous', 'Vente & animation', 'Contenu & support', 'Production', 'Croissance'];

const POSITIONS = [
  {
    icon: Mic2,
    title: 'Hôte / Hôtesse Live',
    category: 'Vente & animation',
    location: 'GDIZ, Glo-Djigbé',
    type: 'Temps plein',
    pay: '75 000 – 100 000 FCFA + 2-4 % des ventes',
    summary:
      'Présentez les produits en direct depuis les usines, répondez aux questions des spectateurs et animez les offres flash.',
    requirements: [
      'Aisance à l\'oral et devant la caméra',
      'Fierté du Made in Benin et sens du commerce',
      'Aucune expérience obligatoire — formation assurée',
    ],
  },
  {
    icon: MessageCircle,
    title: 'Community Manager / Modérateur Live',
    category: 'Contenu & support',
    location: 'Cotonou (hybride)',
    type: 'Temps plein',
    pay: '90 000 – 120 000 FCFA + prime trimestrielle',
    summary:
      'Modérez les lives en temps réel, répondez aux messages sur les réseaux sociaux et faites remonter les retours clients.',
    requirements: [
      'Bonne maîtrise de TikTok, Facebook, Instagram, WhatsApp Business',
      'Rédaction claire en français',
      'Réactivité et sang-froid face aux réclamations',
    ],
  },
  {
    icon: Clapperboard,
    title: 'Monteur vidéo / Régisseur',
    category: 'Production',
    location: 'GDIZ, Glo-Djigbé',
    type: 'Temps plein',
    pay: '80 000 – 110 000 FCFA',
    summary:
      'Préparez le tournage (son, lumière, connexion) et montez les extraits courts diffusés après chaque live.',
    requirements: [
      'Bases de montage vidéo mobile (type CapCut)',
      'Notions de diffusion en direct',
      'Matériel fourni par FriTok',
    ],
  },
  {
    icon: Users2,
    title: 'Coordinateur·rice Programme Ambassadeurs',
    category: 'Croissance',
    location: 'Cotonou',
    type: 'Temps plein',
    pay: '120 000 – 150 000 FCFA + prime sur croissance',
    summary:
      'Recrutez et animez le réseau de créateurs affiliés, suivez leurs ventes et gérez le versement des commissions.',
    requirements: [
      'Expérience en gestion de communauté ou en affiliation',
      'À l\'aise avec le suivi de données de vente simples',
      'Sens de l\'organisation',
    ],
  },
];

export default function CareersPositions() {
  const [active, setActive] = useState('Tous');

  const filtered =
    active === 'Tous' ? POSITIONS : POSITIONS.filter((p) => p.category === active);

  return (
    <section id="postes" className="bg-[#F2F1EC] py-20 sm:py-24">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#8A6410]">
            Postes ouverts
          </p>
          <h2 className="mt-2 text-3xl font-semibold text-[#1B2A4A] sm:text-4xl">
            Rejoignez l'équipe Made in Benin Live
          </h2>
        </div>

        <div className="mt-8 flex flex-wrap gap-2">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setActive(cat)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                active === cat
                  ? 'bg-[#1B2A4A] text-white'
                  : 'bg-white text-[#1B2A4A]/70 hover:bg-[#1B2A4A]/5'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="mt-8 grid gap-5 sm:grid-cols-2">
          {filtered.map((job) => (
            <article
              key={job.title}
              className="flex flex-col rounded-2xl border border-[#1B2A4A]/10 bg-white p-6"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-[#1B2A4A]/5">
                  <job.icon className="h-5 w-5 text-[#1B2A4A]" strokeWidth={2} />
                </span>
                <span className="rounded-full bg-[#1F6F4A]/10 px-3 py-1 text-xs font-medium text-[#1F6F4A]">
                  {job.category}
                </span>
              </div>

              <h3 className="mt-4 text-lg font-semibold text-[#1B2A4A]">{job.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[#4B4B47]">{job.summary}</p>

              <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-[#6B7280]">
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" strokeWidth={2} />
                  {job.location}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" strokeWidth={2} />
                  {job.type}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Wallet className="h-3.5 w-3.5" strokeWidth={2} />
                  {job.pay}
                </span>
              </div>

              <ul className="mt-4 flex-1 space-y-1.5 border-t border-[#1B2A4A]/10 pt-4 text-sm text-[#4B4B47]">
                {job.requirements.map((req) => (
                  <li key={req} className="flex gap-2">
                    <span className="mt-2 h-1 w-1 flex-shrink-0 rounded-full bg-[#B8860B]" />
                    {req}
                  </li>
                ))}
              </ul>

              <a
                href={`mailto:recrutement@fritok.net?subject=Candidature — ${encodeURIComponent(
                  job.title
                )}`}
                className="mt-5 inline-flex items-center justify-center rounded-full bg-[#1B2A4A] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#28406b]"
              >
                Postuler à ce poste
              </a>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}