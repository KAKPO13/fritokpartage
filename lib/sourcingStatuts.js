// lib/sourcingStatuts.js
//
// Config partagée CLIENT + SERVEUR pour les statuts de sourcing.
// ⚠️ Doit rester synchronisée avec TRANSITIONS dans
// netlify/functions/_sourcingShared.js (un fichier serveur ne peut pas être
// importé depuis un composant React, donc les deux tables sont dupliquées
// volontairement — si tu ajoutes un statut, mets à jour les DEUX fichiers).

export const SOURCING_STATUTS = {
  en_attente_paiement: {
    label: 'En attente de paiement',
    ordre: 0,
    couleur: '#9CA3AF',
  },
  sourcing_en_cours: {
    label: 'Sourcing en cours',
    ordre: 1,
    couleur: '#F59E0B',
  },
  partiellement_introuvable: {
    label: 'Partiellement introuvable',
    ordre: 1.5,
    couleur: '#F97316',
  },
  en_transit: {
    label: 'En transit',
    ordre: 2,
    couleur: '#3B82F6',
  },
  livree: {
    label: 'Livrée',
    ordre: 3,
    couleur: '#34C759',
  },
  annulee: {
    label: 'Annulée',
    ordre: -1,
    couleur: '#EF4444',
  },
};

// Étapes affichées dans la barre de progression côté client (hors états
// terminaux/annexes en_attente_paiement / partiellement_introuvable / annulee)
export const SOURCING_ETAPES = ['sourcing_en_cours', 'en_transit', 'livree'];

// Copie de TRANSITIONS (voir _sourcingShared.js) restreinte aux transitions
// que L'AGENT a le droit de déclencher lui-même depuis son tableau de bord.
export const TRANSITIONS_AGENT = {
  sourcing_en_cours: ['en_transit', 'partiellement_introuvable', 'annulee'],
  partiellement_introuvable: ['en_transit', 'annulee'],
  en_transit: ['livree'],
};

export function labelStatut(statut) {
  return SOURCING_STATUTS[statut]?.label ?? statut;
}

export function couleurStatut(statut) {
  return SOURCING_STATUTS[statut]?.couleur ?? '#888888';
}

// Statuts au niveau d'un ITEM (voir agent-update-sourcing-status.js,
// action 'update_item') — distinct du statut global de la demande.
export const ITEM_STATUTS = {
  a_verifier:  { label: 'À vérifier', couleur: '#9CA3AF' },
  trouve:      { label: 'Trouvé',     couleur: '#34C759' },
  introuvable: { label: 'Introuvable', couleur: '#EF4444' },
};

export function labelItemStatut(statutItem) {
  return ITEM_STATUTS[statutItem]?.label ?? statutItem;
}

export function couleurItemStatut(statutItem) {
  return ITEM_STATUTS[statutItem]?.couleur ?? '#888888';
}