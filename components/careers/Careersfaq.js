'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

const FAQS = [
  {
    q: 'Faut-il de l\'expérience pour devenir hôte ou hôtesse live ?',
    a: 'Non. Nous recherchons avant tout de l\'aisance à l\'oral et de la fierté pour le Made in Benin. Une formation de 30 jours est assurée par FriTok avant votre premier live en autonomie.',
  },
  {
    q: 'Comment est calculée la commission sur les ventes ?',
    a: 'Elle varie selon le poste : 2 à 4 % des ventes réalisées en direct pour les hôtes et hôtesses salarié·es, et jusqu\'à 15 % pour les créateurs et créatrices du programme Ambassadeurs, versée sur les commandes suivies via leur lien.',
  },
  {
    q: 'Le programme est-il ouvert hors du Bénin ?',
    a: 'Le pilote démarre au Bénin, avec une extension prévue vers le Togo, la Côte d\'Ivoire, le Ghana et le Nigeria. Les candidatures de ces pays sont déjà les bienvenues pour le programme Ambassadeurs.',
  },
  {
    q: 'Puis-je postuler sans vidéo de présentation ?',
    a: 'Oui pour les postes de community manager, monteur vidéo ou coordinateur — une simple candidature par email suffit. Pour les postes d\'hôte·sse, une courte vidéo remplace l\'entretien classique et accélère votre candidature.',
  },
];

export default function CareersFaq() {
  const [open, setOpen] = useState(0);

  return (
    <section className="bg-[#F2F1EC] py-20 sm:py-24">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <p className="text-xs font-semibold uppercase tracking-wider text-[#8A6410]">
          Questions fréquentes
        </p>
        <h2 className="mt-2 text-3xl font-semibold text-[#1B2A4A] sm:text-4xl">
          Avant de postuler
        </h2>

        <div className="mt-10 divide-y divide-[#1B2A4A]/10 rounded-2xl border border-[#1B2A4A]/10 bg-white">
          {FAQS.map((item, i) => {
            const isOpen = open === i;
            return (
              <div key={item.q}>
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? -1 : i)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left"
                >
                  <span className="text-sm font-semibold text-[#1B2A4A]">{item.q}</span>
                  <ChevronDown
                    className={`h-4 w-4 flex-shrink-0 text-[#6B7280] transition-transform ${
                      isOpen ? 'rotate-180' : ''
                    }`}
                    strokeWidth={2}
                  />
                </button>
                {isOpen && (
                  <p className="px-6 pb-5 text-sm leading-relaxed text-[#4B4B47]">{item.a}</p>
                )}
              </div>
            );
          })}
        </div>

        <p className="mt-10 text-center text-sm text-[#6B7280]">
          Une autre question&nbsp;? Écrivez à{' '}
          <a href="mailto:recrutement@fritok.net" className="font-semibold text-[#1B2A4A] underline">
            recrutement@fritok.net
          </a>
        </p>
      </div>
    </section>
  );
}