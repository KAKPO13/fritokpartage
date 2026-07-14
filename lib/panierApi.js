import { auth } from './firebaseClient';

/**
 * panierApi — ajout au panier via la Netlify Function `add-to-panier`
 * (Admin SDK), plutôt qu'un `addDoc` client direct sur `panier` (voir la
 * note dans add-to-panier.js : cette collection n'a pas de règle
 * Firestore d'écriture cliente).
 */

const ENDPOINT = '/.netlify/functions/add-to-panier';

/**
 * @param {import('../product').Product} product
 * @param {{ quantite?: number }} [opts]
 */
export async function addToPanier(product, opts = {}) {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Connexion requise pour ajouter au panier');
  }
  const idToken = await user.getIdToken();

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      productId: product.productId,
      boutiqueId: product.boutiqueId,
      userIdVend: product.userIdVend ?? '',
      nom_frifri: product.name,
      detail_frifri: product.description ?? '',
      prix_frifri: product.price,
      imageUrl: product.imageUrl ?? '',
      ref_article: product.refArticle,
      quantite: opts.quantite ?? 1,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || "Échec de l'ajout au panier");
  }
  return data; // { panierId }
}