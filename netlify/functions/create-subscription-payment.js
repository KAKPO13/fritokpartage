// netlify/functions/create-subscription-payment.js
// Crée un lien de paiement Flutterwave pour un abonnement vendeur.
// POST /.netlify/functions/create-subscription-payment
// Body: { plan: 'essentiel'|'pro'|'elite', currency?: 'XOF'|'GHS'|'NGN' }
// Auth: Firebase ID Token — Authorization: Bearer <token>

const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

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

const PLANS = {
  essentiel: { label: 'Pack Essentiel FriTok', priceXof: 2500 },
  pro:       { label: 'Pack Pro FriTok',       priceXof: 5000 },
  elite:     { label: 'Pack Elite FriTok',     priceXof: 10000 },
};

// Taux de conversion XOF → autres devises (fallback)
const RATES = { XOF: 1, GHS: 0.013, NGN: 4.75 };

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
    return { statusCode: 405, headers: cors, body: 'Method not allowed' };
  }

  // ── Auth Firebase ──────────────────────────────────────
  const authHeader = event.headers?.authorization ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return { statusCode: 401, headers: cors, body: JSON.stringify({ error: 'Token manquant' }) };
  }
  const idToken = authHeader.slice(7);

  let uid, userEmail, displayName;
  try {
    const { getAuth } = require('firebase-admin/auth');
    const decoded = await getAuth(getAdminApp()).verifyIdToken(idToken);
    uid         = decoded.uid;
    userEmail   = decoded.email ?? '';
    displayName = decoded.name  ?? '';
  } catch {
    return { statusCode: 401, headers: cors, body: JSON.stringify({ error: 'Token invalide' }) };
  }

  // ── Parser le body ─────────────────────────────────────
  let plan = 'pro', currency = 'XOF', phone = '';
  try {
    const body = JSON.parse(event.body ?? '{}');
    if (body.plan && PLANS[body.plan]) plan = body.plan;
    if (['XOF', 'GHS', 'NGN'].includes(body.currency)) currency = body.currency;
    if (body.phone) phone = body.phone;
  } catch {}

  // ── Vérifier le rôle Vendeur ───────────────────────────
  const db       = getFirestore(getAdminApp());
  const userSnap = await db.collection('users').doc(uid).get();
  const userData = userSnap.exists ? userSnap.data() : {};
  if (userData.role !== 'Vendeur') {
    return { statusCode: 403, headers: cors, body: JSON.stringify({ error: 'Réservé aux vendeurs' }) };
  }

  const planData  = PLANS[plan];
  const priceXof  = planData.priceXof;
  const rate      = RATES[currency] ?? 1;
  const amount    = currency === 'XOF' ? priceXof : Math.round(priceXof * rate * 100) / 100;

  // Référence unique pour idempotence
  const txRef = `sub_${uid}_${plan}_${Date.now()}`;

  // ── Appel Flutterwave Standard API ─────────────────────
  const FLW_SECRET = process.env.FLW_SECRET_KEY ?? '';
  const flwPayload = {
    tx_ref:       txRef,
    amount,
    currency,
    redirect_url: `${process.env.SITE_URL ?? 'https://fritok.net'}/seller/subscribe/callback?plan=${plan}`,
    customer: {
      email:       userEmail,
      name:        displayName || userEmail,
      phonenumber: phone || userData.phone || '',
    },
    customizations: {
      title:       'FriTok — Abonnement Vendeur',
      description: planData.label,
      logo:        `${process.env.SITE_URL ?? 'https://fritok.net'}/logo.png`,
    },
    meta: {
      uid,      // ← transmis au webhook pour identifier le vendeur
      plan,
    },
    payment_options: 'card,mobilemoneyfranco,mobilemoneyrwanda,ussd,account',
  };

  let paymentLink;
  try {
    const response = await fetch('https://api.flutterwave.com/v3/payments', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${FLW_SECRET}`,
      },
      body: JSON.stringify(flwPayload),
    });
    const flwData = await response.json();
    if (flwData.status !== 'success') {
      throw new Error(flwData.message ?? 'Erreur Flutterwave');
    }
    paymentLink = flwData.data.link;
  } catch (e) {
    console.error('❌ FLW create payment:', e);
    return { statusCode: 502, headers: cors, body: JSON.stringify({ error: e.message }) };
  }

  console.log(`✅ Lien paiement abonnement créé — uid:${uid} plan:${plan} txRef:${txRef}`);
  return {
    statusCode: 200,
    headers:    { ...cors, 'Content-Type': 'application/json' },
    body:       JSON.stringify({ ok: true, payment_url: paymentLink, txRef, plan, amount, currency }),
  };
};