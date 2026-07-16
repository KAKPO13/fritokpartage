import { Intent } from '../../domain/entities/Intent.js';
import { getFraisApprox, findKnownCity, CURRENCY_SUFFIX } from './DeliveryTariffs.js';

function normalize(text) {
  return (text ?? '')
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function fmtPrice(price, currency = 'XOF') {
  const suffix = CURRENCY_SUFFIX[currency] ?? currency;
  return `${Number(price).toLocaleString('fr-FR')} ${suffix}`;
}

/**
 * findMatchingProduct — cherche, dans le texte du commentaire, le produit
 * dont le nom apparaît. Si aucun nom ne correspond, on retombe sur le
 * produit actuellement affiché (`currentProductIndex`) : c'est très
 * probablement de LUI que parle le spectateur, puisque c'est ce qu'il a
 * sous les yeux au moment où il commente.
 *
 * @param {Array<{productId: string, name: string, description: string|null, price: number}>} products
 * @param {string} normalizedText
 * @param {number} currentProductIndex
 */
function findMatchingProduct(products, normalizedText, currentProductIndex) {
  if (!Array.isArray(products) || products.length === 0) return null;

  const byName = products.find((p) => p.name && normalizedText.includes(normalize(p.name)));
  if (byName) return byName;

  return products[currentProductIndex] ?? products[0] ?? null;
}

/**
 * createSessionProductKnowledgeProvider — implémentation RÉELLE (mais
 * volontairement limitée) de IKnowledgeProvider, Module 2.
 *
 * Ne répond QUE ce qui est vérifiable avec les données qui existent
 * aujourd'hui dans `live_avatar_sessions` :
 *   - PRICE_REQUEST / QUESTION / DEMO_REQUEST → nom/description/prix réels
 *     du produit identifié (ou du produit actuellement affiché)
 *   - ORDER → rappel factuel du fonctionnement de l'app (pas une donnée
 *     produit, un fait sur l'UI existante : toucher le produit pour
 *     commander)
 *   - DELIVERY → seulement si une ville connue de DELIVERY_TARIFFS est
 *     citée dans le commentaire ; sinon `found:false` (on ne devine pas
 *     une ville). Réponse toujours annotée "estimation" — voir
 *     l'hypothèse documentée dans DeliveryTariffs.js.
 *   - AVAILABILITY, PAYMENT, COMPLAINT → TOUJOURS `found:false` :
 *     aucun champ stock, aucune source fiable de moyens de paiement,
 *     et une plainte ne doit jamais recevoir de réponse IA auto-générée
 *     (elle doit être escaladée à un humain — hors périmètre de ce module).
 *
 * @param {{ sessionSnapshotSource: { getSnapshot: (sessionId: string) => Promise<object|null> } }} deps
 * @returns {import('../../domain/repositories/IKnowledgeProvider.js').IKnowledgeProvider}
 */
export function createSessionProductKnowledgeProvider({ sessionSnapshotSource }) {
  if (!sessionSnapshotSource || typeof sessionSnapshotSource.getSnapshot !== 'function') {
    throw new Error(
      'createSessionProductKnowledgeProvider: sessionSnapshotSource invalide (getSnapshot manquant).'
    );
  }

  return {
    async getAnswer({ intent, normalizedText, sessionId }) {
      // AVAILABILITY / PAYMENT / COMPLAINT : jamais de réponse générée,
      // quelle que soit la session — ce n'est pas un manque de données à
      // contourner, c'est une limite assumée (voir doc ci-dessus).
      if (intent === Intent.AVAILABILITY || intent === Intent.PAYMENT || intent === Intent.COMPLAINT) {
        return { found: false };
      }

      const snapshot = await sessionSnapshotSource.getSnapshot(sessionId);
      if (!snapshot) return { found: false };

      if (intent === Intent.DELIVERY) {
        const known = findKnownCity(normalizedText);
        if (!known) return { found: false };

        const { fee, currency, hubVille, countryLabel } = getFraisApprox(known.ville, known.countryCode);
        return {
          found: true,
          answer:
            `Estimation des frais de livraison vers ${known.ville} (${countryLabel}), ` +
            `au départ de ${hubVille} : environ ${fmtPrice(fee, currency)}. ` +
            'Le montant exact est confirmé au moment de la commande.',
          sourceRefs: [`delivery_tariffs:${known.countryCode}`],
        };
      }
      

      const { products = [], currentProductIndex = 0 } = snapshot;
      const product = findMatchingProduct(products, normalizedText, currentProductIndex);

      if (intent === Intent.ORDER) {
        const base = 'Pour commander, il suffit de toucher le produit affiché en bas du live.';
        return product
          ? {
              found: true,
              answer: `${base} "${product.name}" est actuellement à ${fmtPrice(product.price)}.`,
              sourceRefs: [product.productId],
            }
          : { found: true, answer: base, sourceRefs: [] };
      }

      if (!product) return { found: false };

      if (intent === Intent.PRICE_REQUEST) {
        return {
          found: true,
          answer: `"${product.name}" est à ${fmtPrice(product.price)}.`,
          sourceRefs: [product.productId],
        };
      }

      if (intent === Intent.QUESTION || intent === Intent.DEMO_REQUEST) {
        const description = product.description ? ` ${product.description}.` : '';
        return {
          found: true,
          answer: `"${product.name}" — ${fmtPrice(product.price)}.${description}`,
          sourceRefs: [product.productId],
        };
      }

      return { found: false };
    },
  };
}