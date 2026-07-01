// statutUtils.js
// Helpers partagés pour l'affichage des statuts de commande.
// Équivalent JS de StatutCommandeExt (commande_model.dart).
// Utilise le système de tokens D — identique à AjouterColisPage / AddVideoPage.

export const STATUTS = [
  { value: null, label: 'Toutes' },
  { value: 'en_attente', label: 'En attente' },
  { value: 'confirmee', label: 'Confirmées' },
  { value: 'en_cours', label: 'En cours' },
  { value: 'livree', label: 'Livrées' },
  { value: 'annulee', label: 'Annulées' },
];

const LABELS = {
  en_attente: 'En attente',
  confirmee: 'Confirmée',
  en_cours: 'En cours de livraison',
  livree: 'Livrée',
  annulee: 'Annulée',
};

export function labelStatut(statut) {
  return LABELS[statut] || LABELS.en_attente;
}

// D = objet de tokens { orange, orangeHot, zest, text1, text2, card, border, orangeDim, bg, green, red }
export function couleurStatut(statut, D) {
  switch (statut) {
    case 'livree':
      return D.green;
    case 'annulee':
      return D.red;
    case 'en_cours':
      return '#2563EB'; // bleu — hors palette D, réservé au statut "en cours"
    case 'confirmee':
      return D.orange;
    default:
      return D.text2;
  }
}

// Emoji utilisé pour chaque statut (cohérent avec le style emoji d'AjouterColisPage)
export function emojiStatut(statut) {
  switch (statut) {
    case 'livree':
      return '✅';
    case 'annulee':
      return '❌';
    case 'en_cours':
      return '🚚';
    case 'confirmee':
      return '👍';
    default:
      return '⏳';
  }
}