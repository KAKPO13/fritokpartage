// netlify/functions/create-colis.js
//
// Création sécurisée d'un colis manuel — remplace l'écriture directe
// client → Firestore. Le client envoie les champs bruts, le serveur
// valide, recalcule le total, et écrit avec l'Admin SDK (bypass des
// règles Firestore, contrôle total côté serveur).
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

function uuidNoDashes() {
  return crypto.randomUUID().replace(/-/g, '');
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
    modePaiement = 'aLaLivraison',
    typeLivraison = 'solo',
    articles = [],
    photoUrl = '',
  } = payload;

  const errors = [];

  if (typeof nomDestinataire !== 'string' || !nomDestinataire.trim())
    errors.push('nomDestinataire requis');
  if (typeof telDestinataire !== 'string' || telDestinataire.trim().length < 8)
    errors.push('telDestinataire invalide');
  if (typeof villeDepart !== 'string' || !villeDepart.trim())
    errors.push('villeDepart requis');
  if (typeof villeDestination !== 'string' || !villeDestination.trim())
    errors.push('villeDestination requis');
  if (typeof adresseLivraison !== 'string' || !adresseLivraison.trim())
    errors.push('adresseLivraison requis');
  if (!['aLaLivraison', 'mobile'].includes(modePaiement))
    errors.push('modePaiement invalide');
  if (!['solo', 'batch'].includes(typeLivraison))
    errors.push('typeLivraison invalide');

  const frais = Number(fraisLivraison);
  if (!Number.isFinite(frais) || frais < 0 || frais > FRAIS_MAX)
    errors.push(`fraisLivraison invalide (0 – ${FRAIS_MAX})`);

  if (!Array.isArray(articles) || articles.length === 0 || articles.length > MAX_ARTICLES)
    errors.push(`articles : entre 1 et ${MAX_ARTICLES} requis`);
  else if (articles.some((a) => typeof a?.nom !== 'string' || !a.nom.trim()))
    errors.push('Tous les articles doivent avoir un nom');

  if (errors.length) {
    return json(400, { success: false, error: errors.join(' ; ') });
  }

  // ── 3. Recalcul serveur du total — jamais fait confiance au client ─────
  const totalArticles = articles.reduce(
    (s, a) => s + (Number.isFinite(Number(a.prix)) ? Number(a.prix) : 0),
    0
  );
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
    const commandeId = uuidNoDashes().substring(0, 20);

    const articlesMap = articles
      .filter((a) => a.nom?.trim())
      .map((a) => ({
        nom_frifri: a.nom.trim(),
        prix_frifri: Number.isFinite(Number(a.prix)) ? Number(a.prix) : 0,
        imageUrl: photoUrl,
        boutiqueId: '',
        ref_article: '',
        userIdVend: uid,
      }));

    await db.collection('commandes').doc(commandeId).set({
      commandeId,
      clientId: uid,
      userIdVend: uid,

      telephoneClient: telDestinataire.trim(),
      nomDestinataire: nomDestinataire.trim(),

      villeDepart: villeDepart.trim(),
      villeDestination: villeDestination.trim(),
      adresseLivraison: adresseLivraison.trim(),
      clientLat: 0,
      clientLng: 0,
      latLivraison: null,
      lngLivraison: null,

      vendeurLat: loc.lat ?? 0,
      vendeurLng: loc.lng ?? 0,
      vendeurAdresse: loc.address ?? vd.adresse ?? '',

      photoColis: photoUrl,
      articles: articlesMap,
      refArticles: articlesMap.map(() => ''),
      descriptionColis: descriptionColis.trim(),

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
      qrCode: null,

      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),

      extraData: {
        fraisLivraison: frais,
        devise: 'XOF',
        clientLat: 0,
        clientLng: 0,
        telephoneClient: telDestinataire.trim(),
        userIdVend: uid,
        photoColis: photoUrl,
      },
    });

    return json(200, { success: true, commandeId });
  } catch (err) {
    console.error('create-colis error:', err);
    return json(500, { success: false, error: 'Erreur serveur' });
  }
};