/**
 * send-phone-otp.js
 * Netlify Function — Génère un OTP 6 chiffres et l'envoie par SMS.
 *
 * Body attendu : { uid, phone }   (phone au format international : +2250XXXXXXXXX)
 * Header       : Authorization: Bearer <Firebase ID token>
 *
 * Variables d'environnement requises :
 *   AFRICASTALKING_API_KEY      — clé API Africa's Talking
 *   AFRICASTALKING_USERNAME     — username du compte AT (sandbox → "sandbox")
 *   FIREBASE_PROJECT_ID         — pour valider le token via Firebase Auth REST
 *   FIREBASE_SERVICE_ACCOUNT    — JSON stringifié du service account
 *
 * Note Sender ID : pas de champ `from` — Africa's Talking utilise un numéro
 * générique de leur pool. Ajoute AFRICASTALKING_SENDER_ID et décommente le
 * champ `from` ci-dessous une fois ton alphanumeric approuvé.
 *
 * Firestore : écrit dans phoneOtps/{uid} → { code, phone, expiresAt, attempts }
 * Limite     : 1 OTP/2min par UID (anti-spam)
 */

const admin = require('firebase-admin');

// ── Init Firebase Admin (singleton) ─────────────────────────────────────────
if (!admin.apps.length) {
  const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({
    credential: admin.credential.cert(sa),
    projectId : process.env.FIREBASE_PROJECT_ID,
  });
}

const db = admin.firestore();

// ── Helpers ──────────────────────────────────────────────────────────────────
function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/**
 * Normalise un numéro vers le format international +XXX...
 * Accepte : 07XXXXXXXX, 0XXXXXXXXX, +225XXXXXXXXX, 225XXXXXXXXX
 * Préfixe CI par défaut si pas de préfixe pays.
 */
function normalizePhone(raw) {
  const cleaned = raw.replace(/[\s\-().]/g, '');
  if (cleaned.startsWith('+')) return cleaned;
  if (cleaned.startsWith('00')) return '+' + cleaned.slice(2);
  // Numéros locaux CI commençant par 0
  if (cleaned.startsWith('0') && cleaned.length === 10) return '+225' + cleaned.slice(1);
  // Déjà avec indicatif sans +
  if (cleaned.length > 10) return '+' + cleaned;
  return '+225' + cleaned;
}

async function sendSmsAfricasTalking(phone, message) {
  const AfricasTalking = require('africastalking')({
    apiKey  : process.env.AFRICASTALKING_API_KEY,
    username: process.env.AFRICASTALKING_USERNAME,
  });
  const sms = AfricasTalking.SMS;
  await sms.send({
    to     : [phone],
    message,
    // from : process.env.AFRICASTALKING_SENDER_ID, // ← décommenter quand alphanumeric approuvé
  });
}

// ── Handler ──────────────────────────────────────────────────────────────────
exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin' : '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type'                : 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST')   return { statusCode: 405, headers, body: JSON.stringify({ error: 'Méthode non autorisée' }) };

  try {
    // ── 1. Vérifier l'ID token Firebase ─────────────────────────────────────
    const authHeader = event.headers.authorization || event.headers.Authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Token manquant' }) };
    }
    const idToken   = authHeader.slice(7);
    const decoded   = await admin.auth().verifyIdToken(idToken);
    const tokenUid  = decoded.uid;

    // ── 2. Parser le body ───────────────────────────────────────────────────
    const { uid, phone } = JSON.parse(event.body || '{}');

    if (!uid || !phone) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'uid et phone sont requis' }) };
    }
    if (uid !== tokenUid) {
      return { statusCode: 403, headers, body: JSON.stringify({ error: 'uid ne correspond pas au token' }) };
    }

    const normalizedPhone = normalizePhone(phone);

    // ── 3. Vérifier que le téléphone appartient bien au profil user ─────────
    const userSnap = await db.collection('users').doc(uid).get();
    if (!userSnap.exists) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'Utilisateur introuvable' }) };
    }
    const userData = userSnap.data();
    const storedPhone = normalizePhone(userData.phone || '');

    if (storedPhone !== normalizedPhone) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Ce numéro ne correspond pas à votre profil. Mettez à jour votre profil d\'abord.' }),
      };
    }

    // ── 4. Anti-spam : max 1 OTP / 2 min ────────────────────────────────────
    const otpRef  = db.collection('phoneOtps').doc(uid);
    const otpSnap = await otpRef.get();
    if (otpSnap.exists) {
      const existing = otpSnap.data();
      const age      = Date.now() - (existing.createdAt || 0);
      if (age < 2 * 60 * 1000) {
        const waitSec = Math.ceil((2 * 60 * 1000 - age) / 1000);
        return {
          statusCode: 429,
          headers,
          body: JSON.stringify({ error: `Attends encore ${waitSec}s avant de renvoyer un code.`, retryAfter: waitSec }),
        };
      }
    }

    // ── 5. Générer et stocker l'OTP ──────────────────────────────────────────
    const code      = generateOtp();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 min

    await otpRef.set({
      code,
      phone    : normalizedPhone,
      uid,
      createdAt: Date.now(),
      expiresAt,
      attempts : 0,
      verified : false,
    });

    // ── 6. Envoyer le SMS ────────────────────────────────────────────────────
    const message = `Fritok - Votre code de vérification : ${code}\nValable 10 minutes. Ne le partagez jamais.`;
    await sendSmsAfricasTalking(normalizedPhone, message);

    console.log(`OTP envoyé à ${normalizedPhone} pour uid=${uid}`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success  : true,
        message  : `Code envoyé au ${normalizedPhone.slice(0, 6)}***${normalizedPhone.slice(-2)}`,
        expiresAt,
      }),
    };
  } catch (err) {
    console.error('send-phone-otp error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message || 'Erreur serveur' }),
    };
  }
};