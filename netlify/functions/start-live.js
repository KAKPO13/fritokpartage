/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  Netlify Function : start-live                                   ║
 * ║  POST /api/start-live                                            ║
 * ║                                                                  ║
 * ║  Responsabilités :                                               ║
 * ║  1. Vérifie le Firebase ID token du vendeur                      ║
 * ║  2. Valide les produits contre le catalogue Firestore            ║
 * ║  3. Génère le token Agora hôte via le service existant           ║
 * ║  4. Crée /live_sessions/{channelId} avec Admin SDK               ║
 * ║  5. Retourne channelId + token à l'appelant légitime             ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * Variables d'environnement requises (Netlify UI → Site settings → Env vars) :
 *   FIREBASE_PROJECT_ID
 *   FIREBASE_CLIENT_EMAIL
 *   FIREBASE_PRIVATE_KEY       (remplacer les \n littéraux par des sauts de ligne réels)
 *   AGORA_APP_ID
 *   AGORA_APP_CERTIFICATE      (secret — jamais dans le code client)
 */

const admin = require('firebase-admin');
const { RtcTokenBuilder, RtcRole } = require('agora-token');

// ── Init Firebase Admin (singleton) ─────────────────────────────────────────
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId:   process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey:  (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    }),
  });
}

const db = admin.firestore();

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Génère un token Agora RTC côté serveur (sécurisé). */
function buildAgoraToken(channelName, uid, role = RtcRole.PUBLISHER) {
  const expireSeconds = 3600; // 1 heure
  const currentTime   = Math.floor(Date.now() / 1000);
  const privilegeExpiredTs = currentTime + expireSeconds;
  return RtcTokenBuilder.buildTokenWithUid(
    process.env.AGORA_APP_ID,
    process.env.AGORA_APP_CERTIFICATE,
    channelName,
    uid,
    role,
    privilegeExpiredTs
  );
}

/** Vérifie et retourne le payload du Firebase ID token. */
async function verifyFirebaseToken(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw Object.assign(new Error('Token manquant'), { status: 401 });
  }
  const idToken = authHeader.slice(7);
  return admin.auth().verifyIdToken(idToken);
}

/**
 * Valide les produits reçus contre /video_playlist en Firestore.
 * Retourne les produits nettoyés avec les prix officiels (jamais ceux du client).
 */
async function validateProducts(productIds, sellerId) {
  if (!Array.isArray(productIds) || productIds.length === 0) {
    throw Object.assign(new Error('Au moins un produit requis'), { status: 400 });
  }
  if (productIds.length > 20) {
    throw Object.assign(new Error('Maximum 20 produits par live'), { status: 400 });
  }

  const validated = [];
  for (const refArticle of productIds) {
    if (typeof refArticle !== 'string' || refArticle.length > 128) {
      throw Object.assign(new Error(`refArticle invalide : ${refArticle}`), { status: 400 });
    }
    const snap = await db.collection('video_playlist').doc(refArticle).get();
    if (!snap.exists) {
      throw Object.assign(new Error(`Produit introuvable : ${refArticle}`), { status: 404 });
    }
    const d = snap.data();

    // Le vendeur ne peut diffuser que ses propres produits
    if (d.userId !== sellerId) {
      throw Object.assign(new Error(`Produit ${refArticle} n'appartient pas au vendeur`), { status: 403 });
    }

    const p = d.product ?? {};
    const price = Number(p.price ?? d.price ?? 0);
    if (!Number.isFinite(price) || price <= 0) {
      throw Object.assign(new Error(`Prix invalide pour ${refArticle}`), { status: 422 });
    }

    // On retourne les données du catalogue (prix officiel, jamais celui du client)
    validated.push({
      refArticle,
      name:        d.title       ?? d.name        ?? '',
      price,                        // ← prix du catalogue, pas du client
      image:       d.thumbnail   ?? d.imageUrl     ?? '',
      description: p.name        ?? d.description  ?? '',
      productId:   p.productId   ?? d.productId    ?? refArticle,
      boutiqueId:  p.boutiqueId  ?? d.boutiqueId   ?? '',
    });
  }
  return validated;
}

// ── Handler ──────────────────────────────────────────────────────────────────
exports.handler = async (event) => {
  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin':  process.env.ALLOWED_ORIGIN || '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Méthode non autorisée' }) };
  }

  try {
    // 1. Authentification Firebase
    const decodedToken = await verifyFirebaseToken(event.headers.authorization);
    const sellerId     = decodedToken.uid;
    const sellerName   = decodedToken.name   ?? '';
    const sellerAvatar = decodedToken.picture ?? null;

    // 2. Parsing du body
    let body;
    try { body = JSON.parse(event.body || '{}'); }
    catch { return { statusCode: 400, body: JSON.stringify({ error: 'Body JSON invalide' }) }; }

    const { productIds, sellerLanguage = 'fr' } = body;

    if (!['fr', 'zh', 'en'].includes(sellerLanguage)) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Langue non supportée' }) };
    }

    // 3. Validation des produits (prix depuis le catalogue)
    const validatedProducts = await validateProducts(productIds, sellerId);

    // 4. Génération du canal et token Agora
    const channelId  = `live_${sellerId}_${Date.now()}`;
    const agoraToken = buildAgoraToken(channelId, 0); // uid 0 = hôte principal

    // 5. Création de la session en Firestore (Admin SDK — contourne les règles client)
    await db.collection('live_sessions').doc(channelId).set({
      channelId,
      sellerId,
      sellerName,
      sellerAvatar,
      sellerLanguage,
      translationEnabled: sellerLanguage === 'zh',
      coHostEnabled:      true,
      maxCoHosts:         3,
      products:           validatedProducts, // prix certifiés catalogue
      isLive:             true,
      startedAt:          admin.firestore.FieldValue.serverTimestamp(),
      viewerCount:        0,
      likeCount:          0,
      giftCount:          0,
      engagementScore:    0,
    });

    // 6. Réponse — le token Agora est transmis UNIQUEMENT ici, jamais en Firestore
    return {
      statusCode: 200,
      headers: {
        'Content-Type':                'application/json',
        'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
      },
      body: JSON.stringify({
        channelId,
        agoraToken, // token hôte, transmis seulement à l'appelant authentifié
        agoraAppId: process.env.AGORA_APP_ID,
        products:   validatedProducts,
      }),
    };

  } catch (err) {
    console.error('[start-live]', err.message);
    return {
      statusCode: err.status ?? 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message ?? 'Erreur serveur' }),
    };
  }
};