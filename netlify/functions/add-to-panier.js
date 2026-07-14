// netlify/functions/add-to-panier.js
//
// Ajout au panier — ÉCRITURE SERVEUR UNIQUEMENT, même pattern que
// create-colis.js pour /commandes (voir live.js, confirmer() dans
// OrderModal) :
//   - Vérifie le token Firebase (Authorization: Bearer <idToken>)
//   - Valide tous les champs reçus du client (aucune confiance dans le
//     payload brut : prix, ids, chaînes bornées en taille)
//   - Écrit le document avec l'Admin SDK, qui n'est PAS soumis aux
//     Firestore security rules — donc aucune règle `/panier/{docId}`
//     n'est nécessaire côté client pour que ÇA fonctionne. (Si vous
//     voulez que l'utilisateur puisse RELIRE son panier depuis le
//     client, il faudra quand même une règle de lecture, voir note en
//     bas de fichier.)
//
// Le client ne peut donc plus écrire sur `panier` directement — voir
// UltraLivePage.js / lib/panierApi.js, qui appelle cet endpoint au lieu
// d'un addDoc().

const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      // Les clés privées stockées en variable d'env Netlify contiennent
      // des \n littéraux — il faut les reconvertir en vrais retours à
      // la ligne avant de les passer au SDK.
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    }),
  });
}

const db = admin.firestore();

const MAX_STR = 500;
const MAX_NAME = 150;

function isNonEmptyString(v, maxLen = MAX_STR) {
  return typeof v === 'string' && v.trim().length > 0 && v.length <= maxLen;
}

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Méthode non autorisée' });
  }

  // ── Vérification du token Firebase ────────────────────────────
  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!idToken) {
    return jsonResponse(401, { error: 'Token manquant' });
  }

  let decoded;
  try {
    decoded = await admin.auth().verifyIdToken(idToken);
  } catch (e) {
    return jsonResponse(401, { error: 'Token invalide' });
  }
  const userId = decoded.uid;

  // ── Validation du payload ─────────────────────────────────────
  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return jsonResponse(400, { error: 'JSON invalide' });
  }

  const {
    productId,
    boutiqueId,
    userIdVend,
    nom_frifri,
    detail_frifri,
    prix_frifri,
    imageUrl,
    ref_article,
    quantite,
  } = payload;

  if (!isNonEmptyString(productId, 200)) {
    return jsonResponse(400, { error: 'productId invalide' });
  }
  if (!isNonEmptyString(boutiqueId, 200)) {
    return jsonResponse(400, { error: 'boutiqueId invalide' });
  }
  if (!isNonEmptyString(nom_frifri, MAX_NAME)) {
    return jsonResponse(400, { error: 'nom_frifri invalide' });
  }
  if (!isNonEmptyString(ref_article, 200)) {
    return jsonResponse(400, { error: 'ref_article invalide' });
  }
  if (typeof prix_frifri !== 'number' || !(prix_frifri > 0) || prix_frifri >= 10_000_000) {
    return jsonResponse(400, { error: 'prix_frifri invalide' });
  }
  if (detail_frifri != null && (typeof detail_frifri !== 'string' || detail_frifri.length > MAX_STR)) {
    return jsonResponse(400, { error: 'detail_frifri invalide' });
  }
  if (imageUrl != null && (typeof imageUrl !== 'string' || imageUrl.length > MAX_STR)) {
    return jsonResponse(400, { error: 'imageUrl invalide' });
  }
  if (userIdVend != null && (typeof userIdVend !== 'string' || userIdVend.length > 200)) {
    return jsonResponse(400, { error: 'userIdVend invalide' });
  }
  const qte = Number.isInteger(quantite) && quantite > 0 && quantite <= 100 ? quantite : 1;

  try {
    const docRef = await db.collection('panier').add({
      productId,
      boutiqueId,
      userId,                       // dérivé du token, jamais du payload
      userIdVend: userIdVend ?? '',
      nom_frifri,
      detail_frifri: detail_frifri ?? '',
      prix_frifri,
      imageUrl: imageUrl ?? '',
      ref_article,
      quantite: qte,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    return jsonResponse(200, { panierId: docRef.id });
  } catch (e) {
    console.error('add-to-panier:', e);
    return jsonResponse(500, { error: "Échec de l'ajout au panier" });
  }
};

// ── Note lecture ──────────────────────────────────────────────────
// Cette fonction résout l'ÉCRITURE. Si une page "Mon panier" doit lire
// `panier` directement depuis le client (onSnapshot/getDocs), il faudra
// une règle explicite en plus, p. ex. :
//
//   match /panier/{docId} {
//     allow read: if isAuth() && resource.data.userId == request.auth.uid;
//     allow write: if false; // exclusivement via add-to-panier (Admin SDK)
//   }