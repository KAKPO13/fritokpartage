// netlify/functions/create-seller-trial.js
// Appelée lors de l'inscription d'un compte Vendeur.
// Initialise subscription { status: 'trial', trialEndsAt: now + 14j }
// Route : POST /.netlify/functions/create-seller-trial
// Auth  : Firebase ID Token dans le header Authorization: Bearer <token>

const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore, Timestamp }       = require('firebase-admin/firestore');

function getAdminApp() {
  if (getApps().length) return getApps()[0];
  return initializeApp({
    credential: cert({
      projectId:   process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey:  (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    }),
  });
}

// ── Plans disponibles ──────────────────────────────────────
const PLANS = {
  essentiel: { label: 'Pack Essentiel', priceXof: 2500, flwPlanId: process.env.FLW_PLAN_ESSENTIEL ?? '' },
  pro:       { label: 'Pack Pro',       priceXof: 5000, flwPlanId: process.env.FLW_PLAN_PRO       ?? '' },
  elite:     { label: 'Pack Elite',     priceXof: 10000,flwPlanId: process.env.FLW_PLAN_ELITE     ?? '' },
};

const TRIAL_DAYS = 14;
const ESCROW_UID = 'escrow_fritok';
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://fritok.net').split(',');

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin':  allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

exports.handler = async (event) => {
  const origin = event.headers?.origin ?? '';
  const cors   = corsHeaders(origin);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: cors, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: cors, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  // ── Vérifier le token Firebase ─────────────────────────
  const authHeader = event.headers?.authorization ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return { statusCode: 401, headers: cors, body: JSON.stringify({ error: 'Token manquant' }) };
  }
  const idToken = authHeader.slice(7);

  let uid, userEmail;
  try {
    const { getAuth } = require('firebase-admin/auth');
    const decoded = await getAuth(getAdminApp()).verifyIdToken(idToken);
    uid       = decoded.uid;
    userEmail = decoded.email ?? '';
  } catch {
    return { statusCode: 401, headers: cors, body: JSON.stringify({ error: 'Token invalide' }) };
  }

  // ── Parser le body ─────────────────────────────────────
  let plan = 'pro';
  try {
    const body = JSON.parse(event.body ?? '{}');
    if (body.plan && PLANS[body.plan]) plan = body.plan;
  } catch {}

  const db       = getFirestore(getAdminApp());
  const userRef  = db.collection('users').doc(uid);
  const userSnap = await userRef.get();

  if (!userSnap.exists) {
    return { statusCode: 404, headers: cors, body: JSON.stringify({ error: 'Utilisateur introuvable' }) };
  }

  const userData = userSnap.data();

  // ── Vérifier que l'utilisateur est bien Vendeur ────────
  if (userData.role !== 'Vendeur') {
    return { statusCode: 403, headers: cors, body: JSON.stringify({ error: 'Réservé aux comptes Vendeur' }) };
  }

  // ── Éviter la double initialisation ───────────────────
  if (userData.subscription?.status) {
    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({ already: true, subscription: userData.subscription }),
    };
  }

  // ── Créer le trial ─────────────────────────────────────
  const now          = Date.now();
  const trialEndsAt  = Timestamp.fromMillis(now + TRIAL_DAYS * 24 * 60 * 60 * 1000);
  const subscription = {
    plan,
    status:             'trial',
    trialEndsAt,
    currentPeriodStart: Timestamp.fromMillis(now),
    currentPeriodEnd:   trialEndsAt,
    flwPlanId:          PLANS[plan]?.flwPlanId ?? '',
    lastPaymentAt:      null,
    cancelledAt:        null,
    createdAt:          Timestamp.fromMillis(now),
  };

  await userRef.update({ subscription, updatedAt: Timestamp.fromMillis(now) });

  // ── Log dans subscriptions (collection globale) ────────
  await db.collection('subscriptions').doc(uid).set({
    uid,
    email: userEmail,
    plan,
    status:        'trial',
    trialStartedAt: Timestamp.fromMillis(now),
    trialEndsAt,
    updatedAt:     Timestamp.fromMillis(now),
  }, { merge: true });

  console.log(`✅ Trial créé — uid:${uid} plan:${plan} endsAt:${trialEndsAt.toDate().toISOString()}`);

  return {
    statusCode: 200,
    headers:    { ...cors, 'Content-Type': 'application/json' },
    body:       JSON.stringify({ ok: true, subscription }),
  };
};