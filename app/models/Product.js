// ─────────────────────────────────────────────────────────────
// 📦 models/Product.js — Miroir exact du modèle Dart Product
// ─────────────────────────────────────────────────────────────

export class Product {
  constructor({ refArticle, price, name, description, imageUrl, boutiqueId, productId, userIdVend }) {
    // assert miroir Dart
    if (!refArticle || String(refArticle).trim() === '') throw new Error('refArticle ne peut pas être vide');
    if (!productId  || String(productId).trim()  === '') throw new Error('productId ne peut pas être vide');
    if (typeof price !== 'number' || price < 0)          throw new Error('Le prix ne peut pas être négatif');

    this.refArticle  = refArticle;
    this.price       = price;
    this.name        = name       ?? '';
    this.description = description ?? null;
    this.imageUrl    = imageUrl    ?? null;
    this.boutiqueId  = boutiqueId  ?? '';
    this.productId   = productId;
    this.userIdVend  = userIdVend  ?? null;
  }

  // Miroir Product.fromMap
  static fromMap(data) {
    return new Product({
      refArticle:  data.ref_article  ?? data.refArticle  ?? '',
      name:        data.name         ?? '',
      description: data.description  ?? null,
      price:       typeof data.price === 'number'
                     ? data.price
                     : parseFloat(String(data.price ?? '0')) || 0,
      imageUrl:    data.imageUrl ?? data.image ?? data.thumbnail ?? null,
      boutiqueId:  data.boutiqueId   ?? data.id_boutique ?? '',
      productId:   data.productId    ?? data.id ?? data.product_id ?? '',
      userIdVend:  data.vendeurId    ?? data.ownerId ?? null,
    });
  }

  // Miroir Product.fromFirestore
  static fromFirestore(doc) {
    return Product.fromMap({ ...doc.data(), id: doc.id });
  }

  // Miroir toMap()
  toMap() {
    return {
      ref_article: this.refArticle,
      name:        this.name,
      description: this.description ?? '',
      price:       this.price,
      boutiqueId:  this.boutiqueId,
      productId:   this.productId,
      imageUrl:    this.imageUrl    ?? '',
      userIdVend:  this.userIdVend  ?? '',
    };
  }

  // Miroir copyWith()
  copyWith(overrides = {}) {
    return new Product({
      refArticle:  overrides.refArticle  ?? this.refArticle,
      price:       overrides.price       ?? this.price,
      name:        overrides.name        ?? this.name,
      description: overrides.description ?? this.description,
      imageUrl:    overrides.imageUrl    ?? this.imageUrl,
      boutiqueId:  overrides.boutiqueId  ?? this.boutiqueId,
      productId:   overrides.productId   ?? this.productId,
      userIdVend:  overrides.userIdVend  ?? this.userIdVend,
    });
  }

  // Miroir operator== (par productId)
  equals(other) { return other instanceof Product && this.productId === other.productId; }

  get formattedPrice() { return `${Number(this.price).toLocaleString('fr-FR')} FCFA`; }

  toString() { return `Product{name: ${this.name}, price: ${this.price}, productId: ${this.productId}}`; }
}

export default Product;
