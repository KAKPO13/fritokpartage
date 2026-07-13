// netlify/functions/_avatarShared.js
//
// Helpers partagés pour les fonctions "Avatar Live" (create-avatar-session,
// avatar-session-control, avatar-viewer-track). Si un module `_shared.js`
// existe déjà pour les fonctions financières (createFlutterwaveRentalPayment,
// createWalletRental, flutterwave-webhook...), fusionner ce fichier avec lui
// (mêmes exports : admin, db, json, requireAuth) plutôt que de garder les
// deux en parallèle. Livré autonome ici pour être déployable indépendamment.

const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    }),
  });
}

const db = admin.firestore();

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
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

/**
 * Vérifie le token Firebase envoyé en `Authorization: Bearer <idToken>`.
 * Retourne le decoded token (contient `uid`) ou lève une erreur avec
 * `statusCode` attaché.
 */
async function requireAuth(event) {
  const authHeader = event.headers.authorization || event.headers.Authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    const err = new Error('missing_token');
    err.statusCode = 401;
    throw err;
  }
  const idToken = authHeader.slice('Bearer '.length);
  try {
    return await admin.auth().verifyIdToken(idToken);
  } catch (e) {
    const err = new Error('invalid_token');
    err.statusCode = 401;
    throw err;
  }
}

/**
 * Vérifie que l'utilisateur est un Vendeur avec un abonnement actif
 * (trial ou payant, non expiré) — même condition que hasActiveSubscription()
 * dans les règles Firestore (rules_firestore), dupliquée ici côté serveur
 * car les fonctions Admin SDK ne passent pas par les Firestore Rules.
 */
async function requireActiveSellerSubscription(uid) {
  const userSnap = await db.collection('users').doc(uid).get();
  if (!userSnap.exists) {
    const err = new Error('user_not_found');
    err.statusCode = 404;
    throw err;
  }
  const user = userSnap.data();
  if (user.role !== 'Vendeur') {
    const err = new Error('not_a_seller');
    err.statusCode = 403;
    throw err;
  }
  const sub = user.subscription;
  const now = admin.firestore.Timestamp.now();
  const isActive = !!sub
    && ['trial', 'active'].includes(sub.status)
    && sub.currentPeriodEnd
    && sub.currentPeriodEnd.toMillis() > now.toMillis();
  if (!isActive) {
    const err = new Error('subscription_expired');
    err.statusCode = 403;
    throw err;
  }
  return user;
}

module.exports = {
  admin,
  db,
  json,
  CORS_HEADERS,
  requireAuth,
  requireActiveSellerSubscription,
};