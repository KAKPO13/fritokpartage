// verify-phone-otp.js
// Netlify Function — Vérifie l'OTP soumis par l'utilisateur.
//
// Body attendu : { uid, code }
// Header       : Authorization: Bearer <Firebase ID token>
//
// Règles :
//  - Max 5 tentatives avant invalidation de l'OTP
//  - OTP expiré → erreur explicite
//  - Succès → users/{uid}.phoneVerified = true
//             users/{uid}.phoneVerifiedAt = timestamp
//             phoneOtps/{uid} supprimé

import admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId  : process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey : process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

export const adminDb   = admin.firestore();
export const adminAuth = admin.auth();

const MAX_ATTEMPTS = 5;

const HEADERS = {
  'Access-Control-Allow-Origin' : '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type'                : 'application/json',
};

const ok  = (body)       => ({ statusCode: 200, headers: HEADERS, body: JSON.stringify(body) });
const err = (code, msg, extra = {}) => ({
  statusCode: code,
  headers   : HEADERS,
  body      : JSON.stringify({ error: msg, ...extra }),
});

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: HEADERS, body: '' };
  if (event.httpMethod !== 'POST')   return err(405, 'Méthode non autorisée');

  try {
    // ── 1. Vérifier l'ID token ───────────────────────────────────────────────
    const authHeader = event.headers.authorization || event.headers.Authorization || '';
    if (!authHeader.startsWith('Bearer ')) return err(401, 'Token manquant');

    const idToken  = authHeader.slice(7);
    const decoded  = await adminAuth.verifyIdToken(idToken);
    const tokenUid = decoded.uid;

    // ── 2. Parser le body ────────────────────────────────────────────────────
    let uid, code;
    try {
      ({ uid, code } = JSON.parse(event.body || '{}'));
    } catch {
      return err(400, 'Body JSON invalide');
    }

    if (!uid || !code) return err(400, 'uid et code sont requis');
    if (uid !== tokenUid) return err(403, 'uid ne correspond pas au token');

    // ── 3. Lire l'OTP en attente ─────────────────────────────────────────────
    const otpRef  = adminDb.collection('phoneOtps').doc(uid);
    const otpSnap = await otpRef.get();

    if (!otpSnap.exists) {
      return err(404, 'Aucun code en attente. Demande un nouveau code.');
    }

    const otpData = otpSnap.data();

    // ── 4. Vérifier expiration ───────────────────────────────────────────────
    if (Date.now() > otpData.expiresAt) {
      await otpRef.delete();
      return err(410, 'Code expiré. Demande un nouveau code.');
    }

    // ── 5. Vérifier tentatives max ───────────────────────────────────────────
    if (otpData.attempts >= MAX_ATTEMPTS) {
      await otpRef.delete();
      return err(429, 'Trop de tentatives. Demande un nouveau code.');
    }

    // ── 6. Vérifier le code ──────────────────────────────────────────────────
    const submittedCode = String(code).trim();

    if (submittedCode !== otpData.code) {
      await otpRef.update({ attempts: admin.firestore.FieldValue.increment(1) });
      const remaining = MAX_ATTEMPTS - otpData.attempts - 1;
      return err(400, `Code incorrect. ${remaining} tentative${remaining > 1 ? 's' : ''} restante${remaining > 1 ? 's' : ''}.`, { remaining });
    }

    // ── 7. Succès : marquer phoneVerified dans Firestore ────────────────────
    const batch = adminDb.batch();

    batch.update(adminDb.collection('users').doc(uid), {
      phoneVerified  : true,
      phoneVerifiedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    batch.delete(otpRef);

    await batch.commit();

    console.log(`Téléphone vérifié pour uid=${uid}, phone=${otpData.phone}`);

    return ok({
      success        : true,
      message        : 'Numéro de téléphone vérifié avec succès.',
      phoneVerified  : true,
      phoneVerifiedAt: Date.now(),
    });

  } catch (e) {
    console.error('verify-phone-otp error:', e);
    return err(500, e.message || 'Erreur serveur');
  }
};