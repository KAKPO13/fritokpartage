// netlify/functions/create-colis.js
//
// Point d'entrée UNIQUE pour la création d'une commande dans /commandes —
// sert à la fois :
//   (a) le flux "colis manuel" : un vendeur s'auto-expédie un colis vers un
//       destinataire (pas de sellerId dans le payload → clientId == userIdVend == uid)
//   (b) le flux "commande vidéo-shop" : un acheteur commande un produit chez
//       un vendeur (sellerId fourni et différent de uid → clientId = acheteur,
//       userIdVend = sellerId)
//
// Le client envoie les champs bruts, le serveur valide, recalcule le total,
// sépare les données de contact dans une sous-collection privée, et écrit
// avec l'Admin SDK (bypass des règles Firestore, contrôle total côté serveur).
//
// Auth : Authorization: Bearer <Firebase ID Token>

import admin from 'firebase-admin';

// ─── Init Admin SDK (singleton — réutilisé entre invocations à chaud) ──────
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
  });
}

const db = admin.firestore();

// ─── Limites de validation (source de vérité — le client fait un miroir) ──
const FRAIS_MAX = 500000;
const TOTAL_MAX = 9999999;
const MAX_ARTICLES = 50;
const MAX_ARTICLE_PRIX = 5000000;

const MODE_PAIEMENT_ALIASES = { mobile: 'enLigne', enLigne: 'enLigne', aLaLivraison: 'aLaLivraison', immediat: 'enLigne', livraison: 'aLaLivraison' };
const TYPE_LIVRAISON_ALIASES = { batch: 'groupee', groupee: 'groupee', solo: 'solo' };

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'https://fritok.net',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(statusCode, body) {
  return {
    statusCode,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function isSafeHttpUrl(url) {
  if (typeof url !== 'string' || !url) return true; // champ optionnel
  if (url.length > 2000) return false;
  return /^https:\/\//i.test(url) || /^http:\/\//i.test(url);
}

// Coordonnée arrondie à ~1km de précision — assez pour qu'un livreur juge
// la faisabilité d'une course sur une carte, pas assez pour retrouver une
// porte d'entrée précise. Sert de champ PUBLIC (voir pickupZone/destZone),
// en complément — pas en remplacement — de l'adresse exacte privée.
function roundZone(lat, lng) {
  if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }
  return { lat: Math.round(lat * 100) / 100, lng: Math.round(lng * 100) / 100 };
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return json(405, { success: false, error: 'Méthode non autorisée' });
  }

  // ── 1. Authentification ────────────────────────────────────────────────
  const authHeader = event.headers.authorization || event.headers.Authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return json(401, { success: false, error: 'Non authentifié' });
  }

  let uid;
  try {
    const decoded = await admin.auth().verifyIdToken(authHeader.split('Bearer ')[1]);
    if (!decoded.email_verified) {
      return json(403, { success: false, error: 'Email non vérifié' });
    }
    uid = decoded.uid;
  } catch {
    return json(401, { success: false, error: 'Token invalide ou expiré' });
  }

  // ── 2. Parsing et validation des champs ────────────────────────────────
  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { success: false, error: 'Corps de requête invalide' });
  }

  const {
    sellerId = '',           // optionnel — flux marketplace (commande vidéo-shop)
    nomDestinataire = '',
    telDestinataire = '',
    villeDepart = '',
    villeDestination = '',
    adresseLivraison = '',
    fraisLivraison,
    descriptionColis = '',
    modePaiement: modePaiementRaw = 'aLaLivraison',
    typeLivraison: typeLivraisonRaw = 'solo',
    articles = [],
    photoUrl = '',
    gpsCoords = null,        // optionnel — position du destinataire {lat,lng}
  } = payload;

  const errors = [];

  const nomTrim = String(nomDestinataire).trim();
  if (!nomTrim || nomTrim.length > 100) errors.push('nomDestinataire invalide (1–100 caractères)');

  const telDigits = String(telDestinataire).replace(/\D/g, '');
  if (telDigits.length < 8 || telDigits.length > 15) errors.push('telDestinataire invalide');

  if (typeof villeDepart !== 'string' || !villeDepart.trim())
    errors.push('villeDepart requis');
  if (typeof villeDestination !== 'string' || !villeDestination.trim())
    errors.push('villeDestination requis');

  const adresseTrim = String(adresseLivraison).trim();
  if (!adresseTrim || adresseTrim.length > 300) errors.push('adresseLivraison invalide (1–300 caractères)');

  const descTrim = String(descriptionColis).trim();
  if (descTrim.length > 500) errors.push('descriptionColis trop longue (max 500 caractères)');

  const modePaiement = MODE_PAIEMENT_ALIASES[modePaiementRaw];
  if (!modePaiement) errors.push('modePaiement invalide');

  const typeLivraison = TYPE_LIVRAISON_ALIASES[typeLivraisonRaw];
  if (!typeLivraison) errors.push('typeLivraison invalide');

  if (!isSafeHttpUrl(photoUrl)) errors.push('photoUrl invalide');

  if (
    gpsCoords != null &&
    (typeof gpsCoords.lat !== 'number' || typeof gpsCoords.lng !== 'number')
  ) errors.push('gpsCoords invalide');

  const frais = Number(fraisLivraison);
  if (!Number.isFinite(frais) || frais < 0 || frais > FRAIS_MAX)
    errors.push(`fraisLivraison invalide (0 – ${FRAIS_MAX})`);

  if (!Array.isArray(articles) || articles.length === 0 || articles.length > MAX_ARTICLES)
    errors.push(`articles : entre 1 et ${MAX_ARTICLES} requis`);
  else if (articles.some((a) => typeof a?.nom !== 'string' || !a.nom.trim() || a.nom.trim().length > 150))
    errors.push('Tous les articles doivent avoir un nom (1–150 caractères)');

  if (sellerId != null && typeof sellerId !== 'string') errors.push('sellerId invalide');

  if (errors.length) {
    return json(400, { success: false, error: errors.join(' ; ') });
  }

  // ── 3. Identité client / vendeur ────────────────────────────────────────
  // Si sellerId est fourni et différent de l'appelant → commande marketplace
  // (l'acheteur commande chez un vendeur). Sinon → auto-expédition (le
  // vendeur s'envoie un colis à lui-même vers un destinataire).
  const sellerIdTrim = String(sellerId || '').trim();
  const userIdVend = sellerIdTrim && sellerIdTrim !== uid ? sellerIdTrim : uid;
  const clientId = uid;

  // ── 4. Recalcul serveur du total — jamais fait confiance au client ─────
  const articlesMap = articles
    .filter((a) => a.nom?.trim())
    .map((a) => {
      const prixNum = Number(a.prix);
      const prixClamped = Number.isFinite(prixNum)
        ? Math.min(Math.max(prixNum, 0), MAX_ARTICLE_PRIX)
        : 0;
      return {
        nom_frifri: a.nom.trim().slice(0, 150),
        prix_frifri: prixClamped,
        imageUrl: isSafeHttpUrl(photoUrl) ? photoUrl : '',
        boutiqueId: '',
        ref_article: a.refArticle ? String(a.refArticle).slice(0, 100) : '',
        userIdVend,
      };
    });

  const totalArticles = articlesMap.reduce((s, a) => s + a.prix_frifri, 0);
  const total = totalArticles + frais;

  if (total <= 0 || total >= TOTAL_MAX) {
    return json(400, { success: false, error: 'Total de commande invalide' });
  }

  try {
    // ── 5. Infos vendeur — TOUJOURS depuis userIdVend, pas depuis uid ─────
    // (sinon, en commande marketplace, on récupérerait la localisation de
    // l'acheteur au lieu de celle du vendeur pour le point de collecte)
    const vendeurSnap = await db.collection('users').doc(userIdVend).get();
    const vd = vendeurSnap.exists ? vendeurSnap.data() : {};
    const loc = vd.location || {};

    const pickupZone = roundZone(loc.lat, loc.lng);
    const destZone = gpsCoords ? roundZone(gpsCoords.lat, gpsCoords.lng) : null;

    // ── 6. Construction et écriture du document ──────────────────────────
    const docRef = db.collection('commandes').doc();
    const commandeId = docRef.id;

    // Document PUBLIC : pas de téléphone, pas d'adresse précise, pas de GPS
    // précis. pickupZone/destZone sont volontairement arrondis (~1km) pour
    // que la carte de livraison (DeliveryMap) reste utilisable pour
    // browser les commandes en_attente sans exposer d'adresse exacte.
    const publicPayload = {
      commandeId,
      clientId,
      userIdVend,

      villeDepart: villeDepart.trim(),
      villeDestination: villeDestination.trim(),
      pickupZone,     // { lat, lng } arrondis, ou null
      destZone,       // { lat, lng } arrondis, ou null
      latLivraison: null,
      lngLivraison: null,

      photoColis: isSafeHttpUrl(photoUrl) ? photoUrl : '',
      articles: articlesMap,
      refArticles: articlesMap.map((a) => a.ref_article),
      descriptionColis: descTrim,

      fraisLivraison: frais,
      totalXof: total,
      totalDevise: total,
      devise: 'XOF',

      modePaiement,
      typeLivraison,

      statut: 'en_attente',
      livreurId: null,
      livreur: null,
      codeVerification: null,

      source: sellerIdTrim && sellerIdTrim !== uid ? 'video_shop' : 'manuel',
      batchId: null,
      transactionId: null,

      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    // Document PRIVÉ : téléphone/nom du destinataire, adresse précise, GPS
    // exact client ET vendeur. Lisible uniquement par clientId, userIdVend,
    // ou le livreurId une fois assigné (voir firestore.rules).
    const privatePayload = {
      nomDestinataire: nomTrim,
      telephoneClient: telDigits,
      adresseLivraison: adresseTrim,
      clientLat: gpsCoords?.lat ?? null,
      clientLng: gpsCoords?.lng ?? null,
      vendeurLat: loc.lat ?? null,
      vendeurLng: loc.lng ?? null,
      vendeurAdresse: loc.address ?? vd.adresse ?? '',
    };

    const batch = db.batch();
    batch.set(docRef, publicPayload);
    batch.set(docRef.collection('private').doc('contact'), privatePayload);
    await batch.commit();

    const qrPayload = JSON.stringify({
      commandeId,
      userIdVend,
      total,
      ts: Date.now(),
    });

    return json(200, { success: true, commandeId, fraisLivraison: frais, totalXof: total, qrPayload });
  } catch (err) {
    console.error('create-colis error:', err);
    return json(500, { success: false, error: 'Erreur serveur' });
  }
};