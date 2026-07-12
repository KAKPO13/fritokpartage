import { FileText, Video, GraduationCap, Radio } from 'lucide-react';

const STEPS = [
  {
    icon: FileText,
    title: 'Postulez',
    text: 'Envoyez votre candidature par email ou via le formulaire du poste qui vous intéresse.',
  },
  {
    icon: Video,
    title: 'Casting filmé',
    text: 'Pour les postes d\'hôte·sse : une courte présentation d\'un produit face caméra, pas un entretien classique.',
  },
  {
    icon: GraduationCap,
    title: 'Formation de 30 jours',
    text: 'Prise de parole, outils FriTok, studio — la formation est prise en charge intégralement.',
  },
  {
    icon: Radio,
    title: 'Premier live encadré',
    text: 'Vous démarrez accompagné·e par un hôte ou une hôtesse expérimenté·e avant de prendre votre autonomie.',
  },
];

export default function CareersProcess() {
  return (
    <section className="bg-white py-20 sm:py-24">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <p className="text-xs font-semibold uppercase tracking-wider text-[#8A6410]">
          Comment ça se passe
        </p>
        <h2 className="mt-2 max-w-xl text-3xl font-semibold text-[#1B2A4A] sm:text-4xl">
          De la candidature à votre premier live
        </h2>

        <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(({ icon: Icon, title, text }, i) => (
            <div key={title} className="relative">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#1B2A4A]">
                <Icon className="h-5 w-5 text-[#D9B45C]" strokeWidth={2} />
              </div>
              <p className="mt-4 text-xs font-semibold text-[#B8860B]">
                Étape {i + 1}
              </p>
              <h3 className="mt-1 text-base font-semibold text-[#1B2A4A]">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[#4B4B47]">{text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}