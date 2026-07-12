import { Radio, GraduationCap, Wallet, MapPin } from 'lucide-react';

const badges = [
  { icon: GraduationCap, label: 'Formation assurée, aucune expérience obligatoire' },
  { icon: Wallet, label: 'Fixe + commission sur les ventes en direct' },
  { icon: MapPin, label: 'Zone Industrielle de Glo-Djigbé, Bénin' },
];

export default function CareersHero() {
  return (
    <section className="relative overflow-hidden bg-[#1B2A4A]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            'repeating-linear-gradient(135deg, #F2F1EC 0px, #F2F1EC 1px, transparent 1px, transparent 14px)',
        }}
      />

      <div className="relative mx-auto max-w-5xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
        <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-[#D9B45C]">
          <Radio className="h-3.5 w-3.5" strokeWidth={2.5} />
          Recrutement · Made in Benin Live
        </span>

        <h1 className="mt-6 max-w-3xl text-4xl font-semibold leading-[1.1] text-white sm:text-5xl lg:text-6xl">
          Devenez le visage du Made in&nbsp;Benin, en direct.
        </h1>

        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-white/75">
          Made in Benin Live est le programme de live commerce de FriTok avec la GDIZ. Nous
          recrutons les hôtes et hôtesses, créateurs et créatrices, et l'équipe qui feront vivre
          en direct les usines de Glo-Djigbé — pour le Bénin, puis pour l'Afrique de l'Ouest.
        </p>

        <div className="mt-10 flex flex-wrap gap-3">
          {badges.map(({ icon: Icon, label }) => (
            <span
              key={label}
              className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm text-white/85"
            >
              <Icon className="h-4 w-4 text-[#D9B45C]" strokeWidth={2} />
              {label}
            </span>
          ))}
        </div>

        <div className="mt-10 flex flex-wrap items-center gap-4">
          <a
            href="#postes"
            className="inline-flex items-center gap-2 rounded-full bg-[#B8860B] px-6 py-3.5 text-sm font-semibold text-[#1B2A4A] transition-colors hover:bg-[#D9B45C]"
          >
            Voir les postes ouverts
          </a>
          <a
            href="#ambassadeurs"
            className="inline-flex items-center gap-2 rounded-full border border-white/20 px-6 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-white/10"
          >
            Devenir créateur ambassadeur
          </a>
        </div>
      </div>
    </section>
  );
}