'use client';

import Link from 'next/link';

export default function PublierColisBanner() {
  return (
    <section className="relative overflow-hidden bg-[#1A0A00] py-16 sm:py-20">
      {/* halo décoratif */}
      <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[#FF6B00]/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-[#FF9A3C]/10 blur-3xl" />

      <div className="relative mx-auto flex max-w-5xl flex-col items-center gap-8 px-6 text-center md:flex-row md:text-left">
        <div className="flex-1">
          <span className="inline-block rounded-full border border-[#FF6B00]/40 bg-[#FF6B00]/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[#FF9A3C]">
            🚚 Livraison de colis
          </span>
          <h2 className="mt-4 text-3xl font-extrabold leading-tight text-white sm:text-4xl">
            Envoyez un colis,
            <br className="hidden md:block" /> en quelques clics
          </h2>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-white/70 md:text-base">
            Décrivez votre colis, fixez vos frais de livraison, et il devient
            immédiatement visible par tous les livreurs disponibles près de
            chez vous.
          </p>

          <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row md:items-start">
            <Link
              href="/colis/nouveau"
              className="inline-flex items-center gap-2 rounded-full bg-[#FF6B00] px-6 py-3 text-sm font-bold text-white shadow-lg shadow-[#FF6B00]/30 transition-transform hover:scale-[1.03]"
            >
              📦 Publier un colis
            </Link>
            <span className="text-xs text-white/50">
              Aucune commission cachée — vous fixez vos frais
            </span>
          </div>
        </div>

        {/* visuel simple façon mockup */}
        <div className="flex-1">
          <div className="mx-auto w-full max-w-xs rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
            <div className="mb-3 flex items-center justify-between text-xs text-white/50">
              <span>Nouveau colis</span>
              <span className="rounded-full bg-[#FF6B00]/20 px-2 py-0.5 text-[#FF9A3C]">
                en attente
              </span>
            </div>
            <div className="space-y-2">
              <div className="h-3 w-3/4 rounded bg-white/10" />
              <div className="h-3 w-1/2 rounded bg-white/10" />
              <div className="h-3 w-2/3 rounded bg-white/10" />
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3">
              <span className="text-xs text-white/50">Total</span>
              <span className="font-mono text-sm font-bold text-[#FF9A3C]">
                2 300 FCFA
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}