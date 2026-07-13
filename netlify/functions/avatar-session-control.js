// netlify/functions/avatar-session-control.js
//
// Remplace updateCurrentProduct() / startLiveNow() / stopSession() qui
// écrivaient directement dans Firestore depuis AvatarSessionRepository.
// Une seule fonction avec un champ `action` (au lieu de 3 fichiers) : les
// trois opérations partagent la même vérification de propriété
// (session.sellerId === uid du token), donc pas de gain à les séparer.

const { db, json, admin, requireAuth } = require('./_avatarShared');

const ACTIONS = ['updateCurrentProduct', 'startLiveNow', 'stopSession'];

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

  const { sessionId, action, index } = body;

  if (typeof sessionId !== 'string' || sessionId.trim().length === 0) {
    return json(400, { error: 'invalid_session_id' });
  }
  if (!ACTIONS.includes(action)) {
    return json(400, { error: 'invalid_action' });
  }

  const sessionRef = db.collection('live_avatar_sessions').doc(sessionId);
  const sessionSnap = await sessionRef.get();
  if (!sessionSnap.exists) {
    return json(404, { error: 'session_not_found' });
  }
  const session = sessionSnap.data();

  // Seul le vendeur propriétaire de la session peut la piloter — sinon
  // n'importe quel utilisateur connecté pourrait changer le produit en
  // vedette ou couper le live d'un tiers.
  if (session.sellerId !== decoded.uid) {
    return json(403, { error: 'not_session_owner' });
  }

  if (action === 'updateCurrentProduct') {
    const products = session.products || [];
    if (typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index >= products.length) {
      return json(400, { error: 'invalid_index' });
    }
    await sessionRef.update({
      currentProductIndex: index,
      lastProductChange: admin.firestore.FieldValue.serverTimestamp(),
    });
    return json(200, { ok: true });
  }

  if (action === 'startLiveNow') {
    await sessionRef.update({
      isLive: true,
      startedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return json(200, { ok: true });
  }

  // action === 'stopSession'
  await sessionRef.update({
    isLive: false,
    endedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return json(200, { ok: true });
};