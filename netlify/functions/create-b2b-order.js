// netlify/functions/create-b2b-order.js
//
// Écrit /commandes_b2b/{id} — jamais le client directement (voir
// firestore-rules-b2b-loop-closure.js : allow create,update,delete: if
// false). Même principe que create-colis.js pour le grand public : le
// client envoie son intention (lignes + quantités + conditions de
// paiement souhaitées), le serveur revalide tout contre la source de
// vérité (users/{sellerId}.b2bSupplier, PAS b2b_suppliers_public qui n'est
// qu'un miroir de lecture) avant d'écrire quoi que ce soit.
//
// Une commande = un seul fournisseur (le regroupement multi-fournisseurs
// se fait côté client, dans /b2b/commande, qui appelle cette fonction une
// fois par fournisseur si le panier en contient plusieurs).

const admin = require('firebase-admin');
if (!admin.apps.length) {
  admin.initializeApp();
}
const db = admin.firestore();

function tierForQty(tiers, qty) {
  return tiers.find(t => qty >= t.minQty && (t.maxQty === null || qty <= t.maxQty))
      ?? tiers[tiers.length - 1];
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  try {
    const idToken = (event.headers.authorization || '').replace('Bearer ', '');
    if (!idToken) return { statusCode: 401, body: JSON.stringify({ error: 'Non authentifié' }) };
    const decoded = await admin.auth().verifyIdToken(idToken);
    const buyerId = decoded.uid;

    const { sellerId, lignes, paymentTerm, entreprise } = JSON.parse(event.body || '{}');

    if (!sellerId || !Array.isArray(lignes) || lignes.length === 0) {
      return { statusCode: 400, body: JSON.stringify({ error: 'sellerId et lignes requis' }) };
    }
    if (!entreprise?.nom || !entreprise?.telephone || !entreprise?.adresseFacturation) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Coordonnées entreprise incomplètes' }) };
    }

    // ── Source de vérité : le document vendeur lui-même, jamais le miroir
    //    public ni une valeur envoyée par le client. ─────────────────────
    const sellerSnap = await db.collection('users').doc(sellerId).get();
    if (!sellerSnap.exists) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Fournisseur introuvable' }) };
    }
    const seller = sellerSnap.data();
    const supplier = seller.b2bSupplier;
    if (seller.role !== 'Vendeur' || !supplier || supplier.status !== 'verified') {
      return { statusCode: 403, body: JSON.stringify({ error: 'Ce vendeur n\'est pas un fournisseur B2B vérifié' }) };
    }

    if (!supplier.paymentTerms.includes(paymentTerm)) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Condition de paiement non proposée par ce fournisseur' }) };
    }

    // ── Total et lignes recalculés serveur, à partir des seules quantités
    //    envoyées par le client (jamais son prix). ─────────────────────
    const totalQty = lignes.reduce((s, l) => s + Number(l.quantite || 0), 0);
    if (totalQty < supplier.moq) {
      return { statusCode: 400, body: JSON.stringify({ error: `Quantité totale (${totalQty}) sous le MOQ requis (${supplier.moq})` }) };
    }

    const tier = tierForQty(supplier.pricingTiers, totalQty);
    const lignesResolues = lignes.map(l => ({
      videoId:        l.videoId ?? null,
      nom:            String(l.nom || '').slice(0, 200),
      quantite:       Number(l.quantite),
      unitPriceFCFA:  tier.unitPriceFCFA,
      sousTotalFCFA:  tier.unitPriceFCFA * Number(l.quantite),
    }));
    const totalFCFA = tier.unitPriceFCFA * totalQty;

    // ── Écriture : document public (sans coordonnées précises) + sous-doc
    //    privé (visible acheteur/vendeur uniquement), même schéma que
    //    /commandes/{id}/private/contact déjà en place. ─────────────────
    const orderRef = db.collection('commandes_b2b').doc();
    await orderRef.set({
      buyerId,
      sellerId,
      sellerName:     seller.nomBoutique || seller.username || 'Boutique',
      statut:         'en_attente',
      lignes:         lignesResolues,
      totalQty,
      totalFCFA,
      unitPriceAppliqueFCFA: tier.unitPriceFCFA,
      paymentTerm,
      createdAt:      admin.firestore.FieldValue.serverTimestamp(),
    });

    await orderRef.collection('private').doc('contact').set({
      entrepriseNom:        entreprise.nom,
      telephone:            entreprise.telephone,
      adresseFacturation:   entreprise.adresseFacturation,
      registreCommerce:     entreprise.registreCommerce ?? null,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, commandeId: orderRef.id, totalFCFA, unitPriceAppliqueFCFA: tier.unitPriceFCFA }),
    };
  } catch (e) {
    console.error('create-b2b-order:', e);
    return { statusCode: 500, body: JSON.stringify({ error: 'Erreur serveur' }) };
  }
};