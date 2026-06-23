/**
 * verify-phone-otp.js
 * Netlify Function — Vérifie l'OTP soumis par l'utilisateur.
 *
 * Body attendu : { uid, code }
 * Header       : Authorization: Bearer <Firebase ID token>
 *
 * Règles :
 *  - Max 5 tentatives avant invalidation de l'OTP
 *  - OTP expiré → erreur explicite
 *  - Succès → users/{uid}.phoneVerified = true
 *             users/{uid}.phoneVerifiedAt = timestamp
 *             phoneOtps/{uid} supprimé
 */

const admin = require('firebase-admin');

if (!admin.apps.length) {
  const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({
    credential: admin.credential.cert(sa),
    projectId : process.env.FIREBASE_PROJECT_ID,
  });
}

const db = admin.firestore();

const MAX_ATTEMPTS = 5;

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin' : '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type'                : 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST')   return { statusCode: 405, headers, body: JSON.stringify({ error: 'Méthode non autorisée' }) };

  try {
    // ── 1. Vérifier l'ID token ───────────────────────────────────────────────
    const authHeader = event.headers.authorization || event.headers.Authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Token manquant' }) };
    }
    const idToken  = authHeader.slice(7);
    const decoded  = await admin.auth().verifyIdToken(idToken);
    const tokenUid = decoded.uid;

    // ── 2. Parser le body ────────────────────────────────────────────────────
    const { uid, code } = JSON.parse(event.body || '{}');

    if (!uid || !code) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'uid et code sont requis' }) };
    }
    if (uid !== tokenUid) {
      return { statusCode: 403, headers, body: JSON.stringify({ error: 'uid ne correspond pas au token' }) };
    }

    // ── 3. Lire l'OTP en attente ─────────────────────────────────────────────
    const otpRef  = db.collection('phoneOtps').doc(uid);
    const otpSnap = await otpRef.get();

    if (!otpSnap.exists) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'Aucun code en attente. Demande un nouveau code.' }) };
    }

    const otpData = otpSnap.data();

    // ── 4. Vérifier expiration ───────────────────────────────────────────────
    if (Date.now() > otpData.expiresAt) {
      await otpRef.delete();
      return { statusCode: 410, headers, body: JSON.stringify({ error: 'Code expiré. Demande un nouveau code.' }) };
    }

    // ── 5. Vérifier tentatives max ───────────────────────────────────────────
    if (otpData.attempts >= MAX_ATTEMPTS) {
      await otpRef.delete();
      return { statusCode: 429, headers, body: JSON.stringify({ error: 'Trop de tentatives. Demande un nouveau code.' }) };
    }

    // ── 6. Vérifier le code ──────────────────────────────────────────────────
    const submittedCode = String(code).trim();

    if (submittedCode !== otpData.code) {
      // Incrémenter les tentatives
      await otpRef.update({ attempts: admin.firestore.FieldValue.increment(1) });
      const remaining = MAX_ATTEMPTS - otpData.attempts - 1;
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error    : `Code incorrect. ${remaining} tentative${remaining > 1 ? 's' : ''} restante${remaining > 1 ? 's' : ''}.`,
          remaining,
        }),
      };
    }

    // ── 7. Succès : marquer phoneVerified dans Firestore ────────────────────
    const batch = db.batch();

    batch.update(db.collection('users').doc(uid), {
      phoneVerified  : true,
      phoneVerifiedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    batch.delete(otpRef);

    await batch.commit();

    console.log(`Téléphone vérifié pour uid=${uid}, phone=${otpData.phone}`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success        : true,
        message        : 'Numéro de téléphone vérifié avec succès.',
        phoneVerified  : true,
        phoneVerifiedAt: Date.now(),
      }),
    };
  } catch (err) {
    console.error('verify-phone-otp error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message || 'Erreur serveur' }),
    };
  }
};