'use client';

import Link from 'next/link';
import { Radio, ArrowRight, Sparkles } from 'lucide-react';

/**
 * CarrieresBanner
 * Bandeau CTA "Rejoignez Made in Benin Live" à insérer sur la page d'accueil.
 * Reprend le gabarit visuel des autres bannières (KkiapayBanner, LiveBanner, ...) :
 * fond plein, icône dans un badge, titre + description, CTA à droite.
 */
export default function CarrieresBanner() {
  return (
    <section className="relative overflow-hidden bg-[#1B2A4A] py-10 sm:py-12">
      {/* motif discret en fond, cohérent avec l'identité Made in Benin Live */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            'repeating-linear-gradient(135deg, #F2F1EC 0px, #F2F1EC 1px, transparent 1px, transparent 14px)',
        }}
      />

      <div className="relative mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
          <div className="flex items-start gap-4">
            <span className="mt-1 flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-[#B8860B]">
              <Radio className="h-5 w-5 text-[#1B2A4A]" strokeWidth={2} />
            </span>

            <div>
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[#D9B45C]">
                <Sparkles className="h-3.5 w-3.5" strokeWidth={2.5} />
                Recrutement · Made in Benin Live
              </p>
              <h3 className="mt-1.5 text-xl font-semibold leading-snug text-white sm:text-2xl">
                Devenez le visage du Made in&nbsp;Benin, en direct
              </h3>
              <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-white/70">
                FriTok recrute des hôtes et hôtesses live, des créateurs ambassadeurs et des
                community managers pour animer les ventes en direct des usines de la GDIZ.
                Aucune expérience obligatoire — formation assurée, fixe&nbsp;+&nbsp;commission.
              </p>
            </div>
          </div>

          <Link
            href="/carrieres"
            className="group inline-flex flex-shrink-0 items-center gap-2 rounded-full bg-[#B8860B] px-5 py-3 text-sm font-semibold text-[#1B2A4A] transition-colors hover:bg-[#D9B45C]"
          >
            Voir les postes ouverts
            <ArrowRight
              className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
              strokeWidth={2.5}
            />
          </Link>
        </div>
      </div>
    </section>
  );
}