// netlify/functions/create-colis.js
//
// Création sécurisée d'un colis manuel — remplace l'écriture directe
// client → Firestore. Le client envoie les champs bruts, le serveur
// valide, recalcule le total, sépare les données de contact dans une
// sous-collection privée, et écrit avec l'Admin SDK (bypass des règles
// Firestore, contrôle total côté serveur).
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

// Vocabulaire normalisé — DOIT rester identique à celui utilisé par les
// autres écritures dans /commandes (flux vidéo-shop), sinon tout code qui
// lit modePaiement/typeLivraison sur cette collection doit gérer deux
// vocabulaires différents pour la même signification.
const MODE_PAIEMENT_ALIASES = { mobile: 'enLigne', enLigne: 'enLigne', aLaLivraison: 'aLaLivraison' };
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

  const frais = Number(fraisLivraison);
  if (!Number.isFinite(frais) || frais < 0 || frais > FRAIS_MAX)
    errors.push(`fraisLivraison invalide (0 – ${FRAIS_MAX})`);

  if (!Array.isArray(articles) || articles.length === 0 || articles.length > MAX_ARTICLES)
    errors.push(`articles : entre 1 et ${MAX_ARTICLES} requis`);
  else if (articles.some((a) => typeof a?.nom !== 'string' || !a.nom.trim() || a.nom.trim().length > 150))
    errors.push('Tous les articles doivent avoir un nom (1–150 caractères)');

  if (errors.length) {
    return json(400, { success: false, error: errors.join(' ; ') });
  }

  // ── 3. Recalcul serveur du total — jamais fait confiance au client ─────
  // Chaque prix d'article est clampé à [0, MAX_ARTICLE_PRIX] : un prix
  // négatif ou aberrant ne peut plus fausser le total final.
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
        ref_article: '',
        userIdVend: uid,
      };
    });

  const totalArticles = articlesMap.reduce((s, a) => s + a.prix_frifri, 0);
  const total = totalArticles + frais;

  if (total <= 0 || total >= TOTAL_MAX) {
    return json(400, { success: false, error: 'Total de commande invalide' });
  }

  try {
    // ── 4. Infos vendeur ──────────────────────────────────────────────────
    const vendeurSnap = await db.collection('users').doc(uid).get();
    const vd = vendeurSnap.exists ? vendeurSnap.data() : {};
    const loc = vd.location || {};

    // ── 5. Construction et écriture du document ──────────────────────────
    // Firestore génère l'ID (plus besoin de crypto.randomUUID, qui n'était
    // jamais importé et faisait planter chaque appel).
    const docRef = db.collection('commandes').doc();
    const commandeId = docRef.id;

    // Document PUBLIC : pas de téléphone, pas d'adresse précise, pas de GPS.
    // Visible par tout utilisateur connecté tant que la commande est active
    // (modèle marketplace ouvert — cf. firestore.rules), donc uniquement des
    // infos "vitrine" (villes, description, montant, statut).
    const publicPayload = {
      commandeId,
      clientId: uid,
      userIdVend: uid,

      villeDepart: villeDepart.trim(),
      villeDestination: villeDestination.trim(),
      latLivraison: null,
      lngLivraison: null,

      photoColis: isSafeHttpUrl(photoUrl) ? photoUrl : '',
      articles: articlesMap,
      refArticles: articlesMap.map(() => ''),
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

      source: 'manuel',
      batchId: null,
      transactionId: null,

      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    // Document PRIVÉ : téléphone/nom du destinataire, adresse précise, GPS
    // client ET vendeur. Lisible uniquement par clientId, userIdVend, ou le
    // livreurId une fois assigné (voir firestore.rules —
    // /commandes/{id}/private/{privateDocId}).
    const privatePayload = {
      nomDestinataire: nomTrim,
      telephoneClient: telDigits,
      adresseLivraison: adresseTrim,
      clientLat: 0,
      clientLng: 0,
      vendeurLat: loc.lat ?? 0,
      vendeurLng: loc.lng ?? 0,
      vendeurAdresse: loc.address ?? vd.adresse ?? '',
    };

    const batch = db.batch();
    batch.set(docRef, publicPayload);
    batch.set(docRef.collection('private').doc('contact'), privatePayload);
    await batch.commit();

    // Payload minimal pour un QR généré côté client (lib `qrcode`) —
    // aucune donnée de contact ne doit y figurer.
    const qrPayload = JSON.stringify({
      commandeId,
      userIdVend: uid,
      total,
      ts: Date.now(),
    });

    return json(200, { success: true, commandeId, fraisLivraison: frais, totalXof: total, qrPayload });
  } catch (err) {
    console.error('create-colis error:', err);
    return json(500, { success: false, error: 'Erreur serveur' });
  }
};