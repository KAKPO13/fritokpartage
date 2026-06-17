// netlify/functions/createTopup.js
// ─────────────────────────────────────────────────────────────────────────────
// Crée un lien Flutterwave pour recharger le wallet Fritok.
// ➜ Enregistre une entrée TranstetMoney type "topup" en "pending"
//   (mise à jour en "completed" par verifyTopup ou webhook FLW)
// ─────────────────────────────────────────────────────────────────────────────

const admin = require('firebase-admin');
const { createTranstetEntry } = require('./_transtet');

// ── Firebase Admin singleton ─────────────────────────────────────────────────
// Netlify réutilise les instances entre appels — on vérifie avant d'init.
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId  : process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      // Netlify stocke la clé avec des \n littéraux — on les restaure
      privateKey : (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    }),
  });
}


const db   = admin.firestore();
const auth = admin.auth();

// ── CORS ─────────────────────────────────────────────────────────────────────
const HEADERS = {
  'Access-Control-Allow-Origin' : '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type'                : 'application/json',
};

function ok(body)  { return { statusCode: 200, headers: HEADERS, body: JSON.stringify(body) }; }
function err(code, msg) { return { statusCode: code, headers: HEADERS, body: JSON.stringify({ error: msg }) }; }

// ── Devises supportées ────────────────────────────────────────────────────────
const CURRENCY_LABEL = { XOF: 'Francs CFA', GHS: 'Ghanaian Cedi', NGN: 'Nigerian Naira' };
const MIN_AMOUNT     = { XOF: 100, GHS: 1, NGN: 100 };
// Fritok Wallet (destinataire système pour les topups)
const FRITOK_SYSTEM_ID  = process.env.FRITOK_SYSTEM_UID  || 'fritok-system';
const FRITOK_SYSTEM_NOM = 'Fritok Wallet';

// ── Handler ───────────────────────────────────────────────────────────────────
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: HEADERS };
  if (event.httpMethod !== 'POST')    return err(405, 'Method not allowed');

  try {
    // 1. Extraire et vérifier l'ID Token Firebase
    const authHeader = event.headers['authorization'] || event.headers['Authorization'] || '';
    const idToken    = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!idToken) return err(401, 'Token d\'authentification manquant');

    let decoded;
    try {
      decoded = await auth.verifyIdToken(idToken);
    } catch (e) {
      console.error('verifyIdToken error:', e.code, e.message);
      return err(401, `Token invalide : ${e.message}`);
    }
    const uid = decoded.uid;

    // 2. Profil Firestore
    const userSnap = await db.collection('users').doc(uid).get();
    if (!userSnap.exists) return err(404, 'Utilisateur introuvable');
    const user = userSnap.data();

    // 3. Valider le body
    let body;
    try { body = JSON.parse(event.body || '{}'); }
    catch { return err(400, 'Body JSON invalide'); }

    const { amount, currency = 'XOF' } = body;
    const amt = Number(amount);

    if (!amt || amt < (MIN_AMOUNT[currency] ?? 100)) {
      return err(400, `Montant minimum : ${MIN_AMOUNT[currency] ?? 100} ${currency}`);
    }
    if (!CURRENCY_LABEL[currency]) return err(400, `Devise invalide : ${currency}`);

    // 4. Référence unique
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const rand  = Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    const txRef = `FRITOK-TOP-${rand}-${Date.now()}`;

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://fritok.net';

    // 5. Initier le paiement Flutterwave
    const flwRes = await fetch('https://api.flutterwave.com/v3/payments', {
      method : 'POST',
      headers: {
        Authorization : `Bearer ${process.env.FLW_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tx_ref      : txRef,
        amount      : amt,
        currency,
        redirect_url: `${baseUrl}/wallet/confirm?ref=${txRef}`,
        customer    : {
          email      : user.email || decoded.email || '',
          phonenumber: user.phone || '',
          name       : user.username || user.email || uid,
        },
        customizations: {
          title      : 'Recharge Wallet Fritok',
          description: `Recharge ${amt} ${currency}`,
          logo       : `${baseUrl}/logo.png`,
        },
        meta: { userId: uid, type: 'topup', currency, amount: amt },
      }),
    });

    const flwData = await flwRes.json();
    if (flwData.status !== 'success' || !flwData.data?.link) {
      console.error('FLW topup error:', flwData);
      return err(502, flwData.message || 'Erreur Flutterwave');
    }

    // 6. TranstetMoney — statut "pending" (mis à jour après confirmation FLW)
    const txId = await createTranstetEntry(db, {
      type              : 'topup',
      currency,
      montantEnvoye     : amt,
      frais             : 0,
      expediteurId      : uid,
      expediteurEmail   : user.email || decoded.email || '',
      expediteurPhoto   : user.photoUrl || '',
      destinataireId    : FRITOK_SYSTEM_ID,
      destinataireNom   : FRITOK_SYSTEM_NOM,
      destinataireTel   : '',
      status            : 'pending',
    });

    // 7. topupAttempts pour traçabilité + lien avec TranstetMoney
    await db.collection('topupAttempts').doc(txRef).set({
      userId       : uid,
      txRef,
      transtetId   : txId,
      amount       : amt,
      currency,
      status       : 'pending',
      createdAt    : admin.firestore.FieldValue.serverTimestamp(),
    });

    return ok({ payment_url: flwData.data.link, tx_ref: txRef });

  } catch (e) {
    console.error('webcreateTopup fatal:', e);
    return err(500, e.message || 'Erreur interne');
  }
};
