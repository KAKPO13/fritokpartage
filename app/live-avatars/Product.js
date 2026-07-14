/**
 * Product — port of the Dart `Product` model.
 *
 * Plain JS object + factory/helper functions (no classes needed on this
 * side — keeps it trivial to serialize to/from Firestore, same spirit as
 * the `Product.fromMap` / `toMap` pair in the Flutter version).
 */

/**
 * @typedef {Object} Product
 * @property {string} refArticle
 * @property {number} price
 * @property {string} name
 * @property {string|null} description
 * @property {string|null} imageUrl
 * @property {string} boutiqueId
 * @property {string} productId
 * @property {string|null} userIdVend
 */

/**
 * Build a Product from a raw Firestore map, tolerant of the same field
 * aliases the Dart factory accepted (ref_article/refArticle, image/
 * imageUrl/thumbnail, id_boutique/boutiqueId, id/product_id/productId…).
 * @param {Record<string, any>} data
 * @returns {Product}
 */
export function productFromMap(data = {}) {
  const rawPrice = data.price;
  const price =
    typeof rawPrice === 'number'
      ? rawPrice
      : Number.parseFloat(rawPrice ?? '') || 0;

  return {
    refArticle: data.ref_article ?? data.refArticle ?? '',
    name: data.name ?? '',
    description: data.description ?? null,
    price,
    imageUrl: data.imageUrl ?? data.image ?? data.thumbnail ?? null,
    boutiqueId: data.boutiqueId ?? data.id_boutique ?? '',
    productId: data.productId ?? data.id ?? data.product_id ?? '',
    userIdVend: data.vendeurId ?? data.ownerId ?? null,
  };
}

/**
 * Build a Product from a Firestore DocumentSnapshot.
 * @param {import('firebase/firestore').DocumentSnapshot} doc
 * @returns {Product}
 */
export function productFromFirestore(doc) {
  return productFromMap(doc.data() ?? {});
}

/**
 * Serialize a Product back to a Firestore-friendly map.
 * @param {Product} product
 */
export function productToMap(product) {
  return {
    ref_article: product.refArticle,
    name: product.name,
    description: product.description ?? '',
    price: product.price,
    boutiqueId: product.boutiqueId,
    productId: product.productId,
    imageUrl: product.imageUrl ?? '',
    userIdVend: product.userIdVend ?? '',
  };
}

/**
 * Two products are considered equal if they share a productId — mirrors
 * the Dart `operator ==` override.
 */
export function productEquals(a, b) {
  return !!a && !!b && a.productId === b.productId;
}