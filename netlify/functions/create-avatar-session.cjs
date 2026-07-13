// netlify/functions/create-avatar-session.js
//
// Remplace l'ancienne écriture directe (AvatarSessionRepository.startSession /
// createScheduledSession côté client). Le client ne fournit plus `sellerId` :
// il est forcé au uid du token vérifié, sinon un vendeur pourrait démarrer
// un live "au nom" d'un autre. hasActiveSubscription() est aussi vérifiée
// ici côté serveur (miroir de la règle Firestore sur video_playlist), pour
// fermer la même faille "paywall UI only".

const { db, json, admin, requireAuth, requireActiveSellerSubscription } = require('./_avatarShared.cjs');

const MAX_PRODUCTS = 20;
const MAX_NAME_LEN = 100;
const MAX_PRICE = 10000000;

function validateProducts(products) {
  if (!Array.isArray(products) || products.length === 0) return 'products_required';
  if (products.length > MAX_PRODUCTS) return 'too_many_products';

  for (const p of products) {
    if (!p || typeof p !== 'object') return 'invalid_product';
    if (typeof p.productId !== 'string' || p.productId.trim().length === 0) {
      return 'invalid_product_id';
    }
    if (typeof p.name !== 'string' || p.name.trim().length === 0 || p.name.length > MAX_NAME_LEN) {
      return 'invalid_product_name';
    }
    if (typeof p.price !== 'number' || !(p.price > 0) || p.price >= MAX_PRICE) {
      return 'invalid_product_price';
    }
    if (p.imageUrl !== undefined && p.imageUrl !== null && typeof p.imageUrl !== 'string') {
      return 'invalid_product_image';
    }
  }
  return null;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(200, {});
  if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });

  let decoded;
  try {
    decoded = await requireAuth(event);
  } catch (e) {
    return json(e.statusCode || 401, { error: e.message });
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return json(400, { error: 'invalid_json' });
  }

  const { avatarVideoUrl, products, scheduledAt } = body;
  const sellerId = decoded.uid; // jamais celui envoyé par le client

  if (typeof avatarVideoUrl !== 'string' || avatarVideoUrl.trim().length === 0) {
    return json(400, { error: 'invalid_avatar_video_url' });
  }

  const productsError = validateProducts(products);
  if (productsError) {
    return json(400, { error: productsError });
  }

  let scheduledDate = null;
  if (scheduledAt !== undefined && scheduledAt !== null) {
    scheduledDate = new Date(scheduledAt);
    if (isNaN(scheduledDate.getTime())) {
      return json(400, { error: 'invalid_scheduled_at' });
    }
  }

  try {
    await requireActiveSellerSubscription(sellerId);
  } catch (e) {
    return json(e.statusCode || 403, { error: e.message });
  }

  const isImmediateLive = scheduledDate === null;
  const docRef = db.collection('live_avatar_sessions').doc();

  await docRef.set({
    sellerId,
    avatarVideoUrl,
    products,
    isLive: isImmediateLive,
    scheduledAt: scheduledDate ? admin.firestore.Timestamp.fromDate(scheduledDate) : null,
    currentProductIndex: 0,
    startedAt: isImmediateLive ? admin.firestore.FieldValue.serverTimestamp() : null,
    endedAt: null,
    viewerCount: 0,
    likes: 0,
    totalClicks: 0,
    totalOrders: 0,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return json(200, { sessionId: docRef.id });
};