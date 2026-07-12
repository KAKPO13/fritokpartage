import { Percent, Link2, Package } from 'lucide-react';

const PERKS = [
  {
    icon: Percent,
    title: 'Jusqu\'à 15 % de commission',
    text: 'Sur chaque vente générée via votre lien ou votre code créateur — pas de fixe, pas de plafond.',
  },
  {
    icon: Package,
    title: 'Accès produits',
    text: 'Échantillons des usines partenaires de la GDIZ pour vos propres contenus (textile, cajou, cosmétique...).',
  },
  {
    icon: Link2,
    title: 'Votre lien, vos audiences',
    text: 'Publiez sur TikTok, Instagram ou WhatsApp avec votre lien de suivi — vous gardez votre communauté.',
  },
];

export default function CareersAmbassador() {
  return (
    <section id="ambassadeurs" className="bg-[#1F6F4A] py-20 sm:py-24">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-10 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-md">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#C8E6A0]">
              Sans contrat, sans exclusivité
            </p>
            <h2 className="mt-2 text-3xl font-semibold text-white sm:text-4xl">
              Créateur, créatrice&nbsp;? Devenez ambassadeur·rice
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-white/80">
              Vous créez déjà du contenu et vous voulez être payé·e pour vos ventes, pas pour vos
              vues. Le programme Ambassadeurs Made in Benin Live vous rémunère directement sur
              les commandes que vous générez.
            </p>
            <a
              href="mailto:recrutement@fritok.net?subject=Candidature — Programme Ambassadeurs"
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-[#1F6F4A] transition-colors hover:bg-white/90"
            >
              Rejoindre le programme
            </a>
          </div>

          <div className="grid flex-1 gap-4 sm:max-w-md">
            {PERKS.map(({ icon: Icon, title, text }) => (
              <div
                key={title}
                className="flex gap-4 rounded-xl bg-white/10 p-5"
              >
                <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-white/15">
                  <Icon className="h-5 w-5 text-white" strokeWidth={2} />
                </span>
                <div>
                  <h3 className="text-sm font-semibold text-white">{title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-white/75">{text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}