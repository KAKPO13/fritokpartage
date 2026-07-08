// netlify/functions/generateRestitutionCode.js
// ─────────────────────────────────────────────────────────────────────────────
// Génère un code de restitution à 6 chiffres, réservé aux comptes
// partenaires (role: 'Vendeur'), valable 5 minutes, à usage unique.
//
// Sécurité : ce code remplace un QR statique affiché en boutique (qui
// pourrait être photographié une fois et réutilisé indéfiniment sans que
// le gérant en ait connaissance). En générant le code lui-même, au moment
// précis de la restitution, le partenaire prouve sa présence et son
// implication active dans chaque transaction.
//
// Traçabilité / anti-falsification : chaque code porte une SIGNATURE HMAC
// (partnerId + code + date de création) calculée avec un secret connu
// uniquement du serveur (RESTITUTION_CODE_SECRET). Le document Firestore
// restitutionCodes/{code} n'est de toute façon accessible en écriture que
// via l'Admin SDK (le client n'a aucun accès direct), mais cette signature
// ajoute une preuve cryptographique supplémentaire : si un document venait
// à être créé ou modifié par un autre chemin que cette fonction (erreur de
// configuration des Security Rules, script d'admin mal utilisé, etc.),
// confirmRestitution.js détecterait l'incohérence de signature et
// rejetterait la restitution plutôt que de faire confiance aveuglément au
// contenu du document.
//
// POST body : {} (aucun paramètre — le partenaire est identifié par son
//                  Firebase ID Token)
// Auth      : Bearer <Firebase ID Token>, doit correspondre à un compte
//             users/{uid} avec role === 'Vendeur'
// ─────────────────────────────────────────────────────────────────────────────

const admin  = require('firebase-admin');
const crypto = require('crypto');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId  : process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey : (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    }),
  });
}

const db   = admin.firestore();
const auth = admin.auth();

// Durée de validité du code — volontairement courte pour limiter la
// fenêtre d'exploitation en cas d'interception (capture d'écran partagée,
// etc.). 5 minutes laisse largement le temps au client de le saisir.
const CODE_TTL_MS = 5 * 60 * 1000;

// Secret utilisé pour signer le lien (partnerId ↔ code). Doit être défini
// dans les variables d'environnement Netlify — une chaîne aléatoire longue
// (ex. générée avec `openssl rand -hex 32`), distincte des identifiants
// Firebase. Ne jamais exposer cette valeur côté client.
const SIGNING_SECRET = process.env.RESTITUTION_CODE_SECRET;

function signCode({ partnerId, code, createdAtMs }) {
  return crypto
    .createHmac('sha256', SIGNING_SECRET)
    .update(`${partnerId}:${code}:${createdAtMs}`)
    .digest('hex');
}

const HEADERS = {
  'Access-Control-Allow-Origin' : '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type'                : 'application/json',
};
function ok(body)       { return { statusCode: 200, headers: HEADERS, body: JSON.stringify(body) }; }
function err(code, msg) { return { statusCode: code, headers: HEADERS, body: JSON.stringify({ error: msg }) }; }

function randomCode() {
  // 6 chiffres, toujours entre 100000 et 999999 (jamais de zéro en tête,
  // pour un affichage/saisie sans ambiguïté).
  return String(Math.floor(100000 + Math.random() * 900000));
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: HEADERS };
  if (event.httpMethod !== 'POST')    return err(405, 'Method not allowed');

  if (!SIGNING_SECRET) {
    console.error('[generateRestitutionCode] RESTITUTION_CODE_SECRET manquant dans les variables d\'environnement');
    return err(500, 'Configuration serveur incomplète. Contacte le support.');
  }

  try {
    // 1. Auth
    const authHeader = event.headers['authorization'] || event.headers['Authorization'] || '';
    const idToken    = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!idToken) return err(401, 'Token manquant');

    let decoded;
    try { decoded = await auth.verifyIdToken(idToken); }
    catch (e) { return err(401, `Token invalide : ${e.message}`); }
    const uid = decoded.uid;

    // 2. Seuls les partenaires peuvent générer un code de restitution.
    const userSnap = await db.collection('users').doc(uid).get();
    if (!userSnap.exists) return err(404, 'Utilisateur introuvable');
    const user = userSnap.data();
    if (user.role !== 'Vendeur') {
      return err(403, 'Seuls les comptes partenaires peuvent générer un code de restitution.');
    }

    // 3. Génère un code non actuellement actif (évite d'écraser par
    //    coïncidence un code encore valide utilisé ailleurs — collision
    //    statistiquement rare sur 900 000 valeurs possibles, mais on
    //    vérifie par prudence, avec un nombre limité de tentatives).
    const now = Date.now();
    let code;
    let attempts = 0;
    while (attempts < 5) {
      code = randomCode();
      const existing = await db.collection('restitutionCodes').doc(code).get();
      const stillActive = existing.exists
        && existing.data().used !== true
        && (existing.data().expiresAt?.toMillis?.() ?? 0) > now;
      if (!stillActive) break;
      attempts++;
    }

    const createdAtMs = now;
    const expiresAtTs = admin.firestore.Timestamp.fromMillis(now + CODE_TTL_MS);
    const signature    = signCode({ partnerId: uid, code, createdAtMs });

    await db.collection('restitutionCodes').doc(code).set({
      partnerId  : uid,
      createdAt  : admin.firestore.FieldValue.serverTimestamp(),
      createdAtMs, // valeur numérique déterministe utilisée pour (re)calculer la signature
      expiresAt  : expiresAtTs,
      used       : false,
      signature,
    });

    return ok({ code, expiresAt: expiresAtTs.toMillis() });

  } catch (e) {
    console.error('[generateRestitutionCode] fatal:', e);
    return err(500, e.message || 'Erreur interne');
  }
};