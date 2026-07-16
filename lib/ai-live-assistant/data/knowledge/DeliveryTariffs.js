/**
 * DELIVERY_TARIFFS — copie fidèle de la table `COUNTRIES` déjà définie
 * dans UltraLivePage.js (lignes ~22-100), utilisée là-bas par
 * `getFrais()`/`fmtColis()` pour le calcul des frais de livraison lors
 * d'une commande.
 *
 * ⚠️ DUPLIQUÉE ICI, PAS IMPORTÉE : UltraLivePage.js est un composant de
 * page, pas un module partagé, et la règle absolue du projet est de ne
 * jamais modifier les fichiers existants. Importer directement depuis un
 * composant 'use client' aurait aussi couplé ce module serveur/partagé à
 * une page React — ce n'est structurellement pas souhaitable même si
 * c'était possible.
 *
 * → Voir la proposition d'amélioration en fin de réponse : extraire cette
 * table dans un module partagé (ex: lib/shared/delivery-tariffs.js) le
 * jour où on retouchera UltraLivePage.js pour une autre raison, pour que
 * les deux ne divergent jamais. Pour l'instant, en cas de changement de
 * tarifs, il faudra mettre à jour les DEUX fichiers.
 *
 * Valeurs identiques à la source — aucune donnée inventée ici.
 */
export const DELIVERY_TARIFFS = {
  CI: {
    label: "Côte d'Ivoire",
    currency: 'XOF',
    hub: 'Abidjan',
    villes: [
      'Abidjan', 'Bouaké', 'Daloa', 'Korhogo', 'Yamoussoukro', 'San-Pédro',
      'Man', 'Divo', 'Gagnoa', 'Abengourou', 'Soubré', 'Odienné', 'Duekoué',
      'Bondoukou', 'Mankono', 'Séguéla', 'Touba', 'Ferkessédougou', 'Katiola',
      'Agboville', 'Adzopé', 'Tiassalé', 'Lakota', 'Issia', 'Sassandra',
    ],
    tarifs: {
      'Abidjan': { 'Abidjan': 1500, 'Bouaké': 2500, default: 3000 },
      'Bouaké': { 'Bouaké': 1500, 'Abidjan': 2500, default: 3500 },
      default: { default: 3000 },
    },
    fallback: 8000,
    
  },
  SN: {
    label: 'Sénégal',
    currency: 'XOF',
    hub: 'Dakar',
    villes: ['Dakar', 'Thiès', 'Rufisque', 'Mbour', 'Saint-Louis', 'Kaolack', 'Ziguinchor', 'Touba', 'Diourbel', 'Louga', 'Tambacounda', 'Kolda'],
    tarifs: { 'Dakar': { 'Dakar': 1500, 'Thiès': 2500, default: 3000 }, default: { default: 3500 } },
    fallback: 8000,
  },
  GH: {
    label: 'Ghana',
    currency: 'GHS',
    hub: 'Accra',
    villes: ['Accra', 'Kumasi', 'Tamale', 'Sekondi-Takoradi', 'Ashaiman', 'Sunyani', 'Cape Coast', 'Obuasi', 'Teshie', 'Tema'],
    tarifs: {
      'Accra': { 'Accra': 20, 'Kumasi': 35, default: 40 },
      'Kumasi': { 'Kumasi': 20, 'Accra': 35, default: 40 },
      default: { default: 45 },
    },
    fallback: 100,
  },
  NG: {
    label: 'Nigeria',
    currency: 'NGN',
    hub: 'Lagos',
    villes: ['Lagos', 'Abuja', 'Kano', 'Ibadan', 'Port Harcourt', 'Benin City', 'Kaduna', 'Enugu', 'Aba', 'Onitsha'],
    tarifs: {
      'Lagos': { 'Lagos': 1000, 'Abuja': 2500, default: 3000 },
      'Abuja': { 'Abuja': 1000, 'Lagos': 2500, default: 3000 },
      default: { default: 3500 },
    },
    fallback: 6000,
  },
  BJ: {
    label: 'Bénin',
    currency: 'XOF',
    hub: 'Cotonou',
    villes: ['Cotonou', 'Porto-Novo', 'Parakou', 'Djougou', 'Bohicon', 'Kandi', 'Ouidah', 'Abomey', 'Natitingou', 'Lokossa'],
    tarifs: { 'Cotonou': { 'Cotonou': 1000, 'Porto-Novo': 2000, default: 2500 }, default: { default: 3000 } },
    fallback: 8000,
  },
  TG: {
    label: 'Togo',
    currency: 'XOF',
    hub: 'Lomé',
    villes: ['Lomé', 'Sokodé', 'Kara', 'Kpalimé', 'Atakpamé', 'Dapaong', 'Tsévié', 'Aného', 'Bassar', 'Notsé'],
    tarifs: { 'Lomé': { 'Lomé': 1000, 'Sokodé': 2500, default: 3000 }, default: { default: 3500 } },
    fallback: 8000,
  },
  BF: {
    label: 'Burkina Faso',
    currency: 'XOF',
    hub: 'Ouagadougou',
    villes: ['Ouagadougou', 'Bobo-Dioulasso', 'Koudougou', 'Banfora', 'Ouahigouya', 'Kaya', 'Tenkodogo', "Fada N'Gourma", 'Dédougou', 'Gaoua'],
    tarifs: {
      'Ouagadougou': { 'Ouagadougou': 1000, 'Bobo-Dioulasso': 2500, default: 3000 },
      'Bobo-Dioulasso': { 'Bobo-Dioulasso': 1000, 'Ouagadougou': 2500, default: 3000 },
      default: { default: 3500 },
    },
    fallback: 8000,
  },
};

export const DEFAULT_DELIVERY_COUNTRY = 'CI';
export const CURRENCY_SUFFIX = { XOF: 'XOF', GHS: 'GH₵', NGN: '₦' };

/**
 * getFraisApprox — équivalent de `getFrais()` dans UltraLivePage.js, mais
 * SANS l'option `typeLivr === 'groupee'` (-20%) : un commentaire de live
 * ne permet pas de savoir si le client fera une commande groupée, donc on
 * renvoie le tarif standard, jamais une réduction supposée.
 *
 * Hypothèse assumée et documentée : faute de connaître la ville du
 * vendeur pour cette session (champ absent de `live_avatar_sessions`),
 * on utilise le `hub` du pays par défaut comme ville de départ. C'est une
 * approximation, explicitement signalée dans la réponse générée (voir
 * SessionProductKnowledgeProvider.js) — pas une donnée inventée présentée
 * comme certaine.
 *
 * @param {string} villeClient
 * @param {string} [countryCode]
 * @returns {{ fee: number, currency: string, hubVille: string, countryLabel: string }}
 */
export function getFraisApprox(villeClient, countryCode = DEFAULT_DELIVERY_COUNTRY) {
  const country = DELIVERY_TARIFFS[countryCode] ?? DELIVERY_TARIFFS[DEFAULT_DELIVERY_COUNTRY];
  const table = country.tarifs;
  const hubVille = country.hub;
  const fee =
    (table[hubVille] ?? table.default)[villeClient] ??
    (table[hubVille] ?? table.default).default ??
    country.fallback;

  return { fee, currency: country.currency, hubVille, countryLabel: country.label };
}

/**
 * findKnownCity — cherche, dans un texte déjà normalisé (minuscules, sans
 * accents — voir CommentAnalyzer.js), une ville connue de DELIVERY_TARIFFS.
 * Comparaison elle-même normalisée (les villes de la table ont des
 * accents/majuscules).
 *
 * @param {string} normalizedText
 * @returns {{ ville: string, countryCode: string }|null}
 */
export function findKnownCity(normalizedText) {
  const normalize = (s) => s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  for (const [countryCode, country] of Object.entries(DELIVERY_TARIFFS)) {
    for (const ville of country.villes) {
      if (normalizedText.includes(normalize(ville))) {
        return { ville, countryCode };
      }
    }
  }
  return null;
}