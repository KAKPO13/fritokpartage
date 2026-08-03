// lib/agentBadges.js
//
// Deux échelles distinctes, à ne pas confondre :
//  - BADGES        : niveau de VÉRIFICATION du dossier (KYC, contrat, formation, caution)
//  - TIERS         : niveau de RÉPUTATION (calculé sur l'historique des missions
//                    réellement effectuées — ordersCompleted, rating, litiges...)
// Un agent tout neuf peut être "🟢 certifié" (dossier complet) mais rester
// "🥉 Bronze" (aucune mission encore réalisée) — les deux évoluent séparément.

export const BADGES = {
  non_verifie:       { emoji: '🔴', label: 'Non vérifié' },
  identite_verifiee: { emoji: '🟡', label: 'Identité vérifiée' },
  certifie:          { emoji: '🟢', label: 'Agent certifié FriTok' },
  premium:           { emoji: '🔵', label: 'Agent Premium' },
  expert:            { emoji: '🟣', label: 'Agent Expert' },
};

export const TIERS = {
  bronze:  { emoji: '🥉', label: 'Bronze',  seuil: 0 },
  argent:  { emoji: '🥈', label: 'Argent',  seuil: 20 },
  or:      { emoji: '🥇', label: 'Or',      seuil: 50 },
  platine: { emoji: '💎', label: 'Platine', seuil: 80 },
  elite:   { emoji: '👑', label: 'Elite',   seuil: 95 },
};

// Calcule le badge de VÉRIFICATION à partir du dossier agent_applications.
// Ne reflète PAS encore la décision admin — sert d'indicateur de complétude
// côté formulaire (ex: "vous êtes éligible au niveau Certifié, il vous
// manque juste la caution pour le niveau Premium").
export function calculerBadgeDossier(application) {
  if (!application) return 'non_verifie';
  const { identite, adresse, contrat, formation, garantie, confiance } = application;

  const identiteOk = !!(
    identite?.pieceIdentiteUrl && identite?.selfieUrl &&
    identite?.nomComplet && identite?.dateNaissance && identite?.nationalite &&
    identite?.adresseResidence
  );
  if (!identiteOk) return 'non_verifie';

  const adresseOk    = !!(adresse?.justificatifUrl || adresse?.demandeVisiteGps);
  const contratOk    = !!(contrat?.cguAcceptees && contrat?.confidentialiteAcceptee &&
                          contrat?.anticorruptionAcceptee && contrat?.interdictionArgentDirectAcceptee &&
                          contrat?.reglesQualiteAcceptees && contrat?.sanctionsAcceptees && contrat?.signatureNom);
  const formationOk  = !!formation?.quizValide;

  if (!(adresseOk && contratOk && formationOk)) return 'identite_verifiee';

  const referencesOk = confiance?.mode === 'lettre'
    ? !!confiance?.lettreRecommandationUrl
    : (confiance?.references || []).filter(r => r?.nom && r?.telephone).length >= 2;
  const garantieOk = garantie?.statutPaiement === 'paye';

  if (!(referencesOk && garantieOk)) return 'certifie';

  // "Expert" nécessite un historique réel (missions réussies, faible litige)
  // — non déductible du dossier seul, calculé ailleurs à partir de
  // agent_local_fritok.ordersCompleted / rating / litiges.
  return 'premium';
}

export function calculerTier(scoreReputation) {
  const entries = Object.entries(TIERS).sort((a, b) => b[1].seuil - a[1].seuil);
  for (const [key, val] of entries) {
    if (scoreReputation >= val.seuil) return key;
  }
  return 'bronze';
}

export function labelBadge(cle) { return BADGES[cle]?.label ?? cle; }
export function emojiBadge(cle) { return BADGES[cle]?.emoji ?? ''; }
export function labelTier(cle)  { return TIERS[cle]?.label ?? cle; }
export function emojiTier(cle)  { return TIERS[cle]?.emoji ?? ''; }