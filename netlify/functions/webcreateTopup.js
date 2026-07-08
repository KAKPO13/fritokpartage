// netlify/functions/webcreateTopup.js
// ─────────────────────────────────────────────────────────────────────────────
// Crée une tentative de recharge wallet Fritok, routée par devise :
//   • XOF          → KkiaPay  : pas de payment_url, le frontend ouvre le
//                                widget KkiaPay avec la référence retournée.
//   • GHS / NGN    → Flutterwave : comportement INCHANGÉ (payment_url à
//                                  rediriger, cf. version originale).
//
// Dans les deux cas :
//   - TransfetMoney "topup" créé en "pending" (mis à jour "completed" par
//     verifyKkiapayTopup.js OU kkiapay-webhook.js / flutterwave-webhook.js).
//   - topupAttempts/{txRef} créé en "pending", avec un champ `provider`
//     explicite pour que les webhooks/verify sachent quoi vérifier.
// ─────────────────────────────────────────────────────────────────────────────

import admin from 'firebase-admin';
import { createTranstetEntry } from './_transtet.js';
import { resolveProvider, PROVIDERS, CURRENCY_LABEL, MIN_AMOUNT } from './_shared/paymentProvider.js';

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
const auth = admin.auth();

const HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

function ok(body) { return { statusCode: 200, headers: HEADERS, body: JSON.stringify(body) }; }
function err(code, msg) { return { statusCode: code, headers: HEADERS, body: JSON.stringify({ error: msg }) }; }

const FRITOK_SYSTEM_ID = process.env.FRITOK_SYSTEM_UID || 'fritok-system';
const FRITOK_SYSTEM_NOM = 'Fritok Wallet';

function generateTxRef() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const rand = Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `FRITOK-TOP-${rand}-${Date.now()}`;
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: HEADERS };
  if (event.httpMethod !== 'POST') return err(405, 'Method not allowed');

  try {
    // 1. Auth
    const authHeader = event.headers['authorization'] || event.headers['Authorization'] || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
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

    if (!CURRENCY_LABEL[currency]) return err(400, `Devise invalide : ${currency}`);
    if (!amt || amt < (MIN_AMOUNT[currency] ?? 100)) {
      return err(400, `Montant minimum : ${MIN_AMOUNT[currency] ?? 100} ${currency}`);
    }

    // 4. Routage provider
    let provider;
    try { provider = resolveProvider(currency); }
    catch (e) { return err(e.code || 400, e.message); }

    const txRef = generateTxRef();
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://fritok.net';

    // 5. TransfetMoney — statut "pending", commun aux deux providers
    const txId = await createTranstetEntry(db, {
      type: 'topup',
      currency,
      montantEnvoye: amt,
      frais: 0,
      expediteurId: uid,
      expediteurEmail: user.email || decoded.email || '',
      expediteurPhoto: user.photoUrl || '',
      destinataireId: FRITOK_SYSTEM_ID,
      destinataireNom: FRITOK_SYSTEM_NOM,
      destinataireTel: '',
      status: 'pending',
    });

    // 6. topupAttempts — commun aux deux providers, avec `provider` explicite
    await db.collection('topupAttempts').doc(txRef).set({
      userId: uid,
      txRef,
      transtetId: txId,
      amount: amt,
      currency,
      provider,
      status: 'pending',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // ── Branche KkiaPay (XOF) ────────────────────────────────────────────────
    if (provider === PROVIDERS.KKIAPAY) {
      // Pas d'appel API sortant ici : KkiaPay fonctionne par widget côté
      // client. On retourne juste tout ce dont le frontend a besoin pour
      // ouvrir le widget avec la bonne référence.
      return ok({
        provider: 'kkiapay',
        reference: txRef,
        amount: amt,
        currency,
        publicKey: process.env.KKIAPAY_PUBLIC_KEY,
        sandbox: process.env.KKIAPAY_SANDBOX === 'true',
        customer: {
          name: user.username || user.email || uid,
          email: user.email || decoded.email || '',
          phone: user.phone || '',
        },
      });
    }

    // ── Branche Flutterwave (GHS / NGN) — comportement INCHANGÉ ──────────────
    const flwRes = await fetch('https://api.flutterwave.com/v3/payments', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tx_ref: txRef,
        amount: amt,
        currency,
        redirect_url: `${baseUrl}/wallet/confirm?ref=${txRef}`,
        customer: {
          email: user.email || decoded.email || '',
          phonenumber: user.phone || '',
          name: user.username || user.email || uid,
        },
        customizations: {
          title: 'Recharge Wallet Fritok',
          description: `Recharge ${amt} ${currency}`,
          logo: `${baseUrl}/logo.png`,
        },
        meta: { userId: uid, type: 'topup', currency, amount: amt },
      }),
    });

    const flwData = await flwRes.json();
    if (flwData.status !== 'success' || !flwData.data?.link) {
      console.error('FLW topup error:', flwData);
      // On nettoie la tentative pour ne pas laisser un "pending" orphelin
      await db.collection('topupAttempts').doc(txRef).update({ status: 'failed' });
      return err(502, flwData.message || 'Erreur Flutterwave');
    }

    return ok({ provider: 'flutterwave', payment_url: flwData.data.link, tx_ref: txRef });

  } catch (e) {
    console.error('webcreateTopup fatal:', e);
    return err(500, e.message || 'Erreur interne');
  }
};