// netlify/functions/createTopup.js
// ─────────────────────────────────────────────────────────────────────────────
// Crée un lien de paiement Flutterwave pour recharger le wallet Fritok.
//
// POST body : { amount: number, currency: 'XOF'|'GHS'|'NGN' }
// Auth      : Bearer <Firebase ID Token>
//
// Flow :
//   1. Vérifie l'ID token Firebase (Admin SDK)
//   2. Récupère le profil utilisateur dans Firestore
//   3. Initie le paiement via l'API Flutterwave
//   4. Retourne { payment_url, tx_ref }
// ─────────────────────────────────────────────────────────────────────────────

const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getAuth }      = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');

// ── Firebase Admin (singleton) ───────────────────────────────────────────────
function getAdminApp() {
  if (getApps().length) return getApps()[0];
  return initializeApp({
    credential: cert({
      projectId  : process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey : process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function txRef() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const rand  = Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `FRITOK-TOP-${rand}-${Date.now()}`;
}

const CURRENCY_NAMES = { XOF: 'Francs CFA', GHS: 'Ghanaian Cedi', NGN: 'Nigerian Naira' };

// ── Handler ───────────────────────────────────────────────────────────────────
exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin' : '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Content-Type'                : 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  try {
    // 1. Authentification Firebase
    const token = (event.headers.authorization || '').replace('Bearer ', '');
    if (!token) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Token manquant' }) };

    const app      = getAdminApp();
    const decoded  = await getAuth(app).verifyIdToken(token);
    const uid      = decoded.uid;

    // 2. Récupérer le profil Firestore
    const db       = getFirestore(app);
    const userSnap = await db.collection('users').doc(uid).get();
    if (!userSnap.exists) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Utilisateur introuvable' }) };
    const user = userSnap.data();

    // 3. Valider le body
    let body;
    try { body = JSON.parse(event.body); } catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Body JSON invalide' }) }; }

    const { amount, currency = 'XOF' } = body;
    if (!amount || amount < 100) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Montant minimum 100' }) };

    const validCurrencies = ['XOF', 'GHS', 'NGN'];
    if (!validCurrencies.includes(currency)) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Devise invalide' }) };

    // 4. Créer le paiement Flutterwave
    const ref      = txRef();
    const baseUrl  = process.env.NEXT_PUBLIC_BASE_URL || 'https://fritok.net';

    const flwPayload = {
      tx_ref          : ref,
      amount          : Number(amount),
      currency,
      redirect_url    : `${baseUrl}/wallet/confirm?type=topup&ref=${ref}`,
      customer        : {
        email     : user.email || decoded.email || '',
        phonenumber: user.phone || '',
        name      : user.username || user.email || uid,
      },
      customizations  : {
        title      : 'Recharge Wallet Fritok',
        description: `Recharge ${amount} ${currency} — ${CURRENCY_NAMES[currency] || currency}`,
        logo       : `${baseUrl}/logo.png`,
      },
      meta: {
        userId  : uid,
        type    : 'topup',
        currency,
        amount  : Number(amount),
      },
    };

    const flwRes = await fetch('https://api.flutterwave.com/v3/payments', {
      method : 'POST',
      headers: {
        Authorization : `Bearer ${process.env.FLW_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(flwPayload),
    });

    const flwData = await flwRes.json();

    if (flwData.status !== 'success' || !flwData.data?.link) {
      console.error('FLW error:', flwData);
      return { statusCode: 502, headers, body: JSON.stringify({ error: flwData.message || 'Erreur Flutterwave' }) };
    }

    // 5. Enregistrer la tentative en Firestore (pour traçabilité)
    await db.collection('topupAttempts').add({
      userId   : uid,
      txRef    : ref,
      amount   : Number(amount),
      currency,
      status   : 'pending',
      createdAt: new Date(),
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        payment_url: flwData.data.link,
        tx_ref     : ref,
      }),
    };

  } catch (err) {
    console.error('createTopup error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message || 'Erreur interne' }),
    };
  }
};
