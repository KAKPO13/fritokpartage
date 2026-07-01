// netlify/functions/create-ad-campaign.js
// ─────────────────────────────────────────────────────────────────────────────
//  Fritok — Création de campagne publicitaire
//  Hébergement : https://fritok.net/.netlify/functions/create-ad-campaign
//
//  Flux sécurisé :
//  1. Vérifie le token Firebase (Admin SDK)
//  2. Valide tous les champs (budget, ciblage, URL vidéo, titre, lien)
//  3. Vérifie le rôle Vendeur et le solde wallet
//  4. Transaction atomique Firestore :
//       - Débit wallet annonceur
//       - Création ads_campaigns (valeurs imposées côté serveur)
//       - Entrée TransfetMoney pour traçabilité
//  5. Retourne l'ID de la campagne créée
//
//  Variables d'environnement requises :
//    FIREBASE_PROJECT_ID
//    FIREBASE_CLIENT_EMAIL
//    FIREBASE_PRIVATE_KEY      (clé PEM — les \n sont résolus automatiquement)
// ─────────────────────────────────────────────────────────────────────────────

import admin from 'firebase-admin';

// ── Init Firebase Admin (singleton — même pattern que le reste de la codebase) ──
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId:   process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

const adminDb   = admin.firestore();
const adminAuth = admin.auth();

// ── Constantes métier ─────────────────────────────────────────────────────────
const CPM        = 200;        // FCFA pour 1 000 impressions
const CPC        = 50;         // FCFA par clic
const MIN_BUDGET = 1_000;      // FCFA
const MAX_BUDGET = 10_000_000; // FCFA

const ALLOWED_COUNTRIES = [
  "Côte d'Ivoire", 'Sénégal', 'Mali',
  'Burkina Faso', 'Cameroun', 'France',
];
const ALLOWED_AGE_RANGES = ['13-17', '18-24', '18-35', '25-45', '45+'];

// ── Helpers ───────────────────────────────────────────────────────────────────
function isValidUrl(str) {
  try {
    const u = new URL(str);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

function validatePayload(body) {
  const errors = [];

  if (!body.title || typeof body.title !== 'string') {
    errors.push('title manquant');
  } else if (body.title.trim().length < 3 || body.title.trim().length > 150) {
    errors.push('title : 3–150 caractères requis');
  }

  if (!body.ctaLink || !isValidUrl(body.ctaLink)) {
    errors.push('ctaLink : URL valide requise (https://...)');
  }

  if (!body.videoUrl || !isValidUrl(body.videoUrl)) {
    errors.push('videoUrl : URL valide requise');
  }

  const budget = Number(body.budget);
  if (!Number.isInteger(budget) || budget < MIN_BUDGET || budget > MAX_BUDGET) {
    errors.push(`budget : entier entre ${MIN_BUDGET} et ${MAX_BUDGET} FCFA`);
  }

  if (!ALLOWED_COUNTRIES.includes(body.targetCountry)) {
    errors.push(`targetCountry : valeur inconnue "${body.targetCountry}"`);
  }

  if (!ALLOWED_AGE_RANGES.includes(body.targetAge)) {
    errors.push(`targetAge : valeur inconnue "${body.targetAge}"`);
  }

  return errors;
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

function json(status, body) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    body: JSON.stringify(body),
  };
}

// ── Handler principal ─────────────────────────────────────────────────────────
export const handler = async (event) => {

  // ── CORS preflight ─────────────────────────────────────────────────────────
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(), body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Méthode non autorisée' });
  }

  // ── 1. Authentification Firebase ───────────────────────────────────────────
  const authHeader = event.headers['authorization'] || '';
  if (!authHeader.startsWith('Bearer ')) {
    return json(401, { error: 'Token Firebase manquant' });
  }

  let uid;
  try {
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    uid           = decoded.uid;
  } catch (err) {
    console.error('[create-ad-campaign] Auth error:', err.message);
    return json(401, { error: 'Token Firebase invalide ou expiré' });
  }

  // ── 2. Parse body ──────────────────────────────────────────────────────────
  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: 'Corps JSON invalide' });
  }

  // ── 3. Validation des champs ───────────────────────────────────────────────
  const validationErrors = validatePayload(body);
  if (validationErrors.length > 0) {
    return json(400, { error: 'Validation échouée', details: validationErrors });
  }

  const budget         = Number(body.budget);
  const estimatedViews = Math.floor((budget / CPM) * 1000);

  // ── 4. Lecture user — rôle + solde ────────────────────────────────────────
  const userRef  = adminDb.collection('users').doc(uid);
  const userSnap = await userRef.get();

  if (!userSnap.exists) {
    return json(404, { error: 'Utilisateur introuvable' });
  }

  const userData = userSnap.data();

  // Seuls les Vendeurs peuvent créer des campagnes
  if (userData.role !== 'Vendeur') {
    return json(403, { error: 'Seuls les Vendeurs peuvent créer des campagnes' });
  }

  // Pré-vérification du solde avant d'ouvrir la transaction
  const currency    = userData.currency || 'XOF';
  const walletSolde = userData.wallet?.[currency] ?? 0;

  if (walletSolde < budget) {
    return json(402, {
      error:   'Solde insuffisant',
      details: {
        solde:    walletSolde,
        budget:   budget,
        currency: currency,
        manque:   budget - walletSolde,
      },
    });
  }

  // ── 5. Transaction atomique Firestore ─────────────────────────────────────
  //
  //  a) Relire le wallet dans la transaction (anti race-condition)
  //  b) Débit wallet annonceur
  //  c) Création campagne — valeurs sensibles imposées côté serveur :
  //       approved: false  → validation admin obligatoire avant diffusion
  //       spent: 0         → le client ne peut jamais gonfler cette valeur
  //       views: 0, clicks: 0
  //  d) Entrée TransfetMoney pour traçabilité financière
  //
  const campaignRef = adminDb.collection('ads_campaigns').doc();
  const txRef       = adminDb.collection('TransfetMoney').doc();
  const campaignId  = campaignRef.id;

  try {
    await adminDb.runTransaction(async (tx) => {

      // a) Relecture atomique du wallet
      const freshUserSnap = await tx.get(userRef);
      const freshWallet   = freshUserSnap.data().wallet?.[currency] ?? 0;
      if (freshWallet < budget) {
        throw new Error('INSUFFICIENT_FUNDS');
      }

      // b) Débit wallet
      tx.update(userRef, {
        [`wallet.${currency}`]: admin.firestore.FieldValue.increment(-budget),
      });

      // c) Création campagne
      tx.set(campaignRef, {
        advertiserId:   uid,
        videoUrl:       body.videoUrl.trim(),
        title:          body.title.trim(),
        ctaLink:        body.ctaLink.trim(),
        budget:         budget,
        spent:          0.0,
        views:          0,
        clicks:         0,
        cpm:            CPM,
        cpc:            CPC,
        targetCountry:  body.targetCountry,
        targetAge:      body.targetAge,
        active:         true,
        approved:       false,
        estimatedViews: estimatedViews,
        currency:       currency,
        createdAt:      admin.firestore.FieldValue.serverTimestamp(),
      });

      // d) Entrée TransfetMoney
      tx.set(txRef, {
        expediteurId:   uid,
        destinataireId: 'ads_system',
        montantEnvoye:  budget,
        frais:          0,
        currency:       currency,
        type:           'ad_campaign',
        status:         'completed',
        campaignId:     campaignId,
        campaignTitle:  body.title.trim(),
        timestamp:      admin.firestore.FieldValue.serverTimestamp(),
      });
    });

  } catch (err) {
    if (err.message === 'INSUFFICIENT_FUNDS') {
      return json(402, { error: 'Solde insuffisant (vérification transactionnelle)' });
    }
    console.error('[create-ad-campaign] Firestore transaction error:', err);
    return json(500, { error: 'Erreur serveur lors de la création de la campagne' });
  }

  // ── 6. Succès ──────────────────────────────────────────────────────────────
  return json(201, {
    success:        true,
    campaignId:     campaignId,
    estimatedViews: estimatedViews,
    message:        'Campagne créée — en attente de validation administrateur',
  });
};