/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  Netlify Function : update-engagement                            ║
 * ║  POST /api/update-engagement                                     ║
 * ║                                                                  ║
 * ║  Remplace le updateDoc() client de _updateEngagement().          ║
 * ║  Utilise des FieldValue.increment() atomiques — pas de race      ║
 * ║  condition possible et aucun chiffre ne vient du client.         ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

const admin = require('firebase-admin');

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

async function verifyFirebaseToken(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw Object.assign(new Error('Token manquant'), { status: 401 });
  }
  return admin.auth().verifyIdToken(authHeader.slice(7));
}

// Actions autorisées et leur delta respectif
const ALLOWED_ACTIONS = {
  like:   { likeCount: 1,  giftCount: 0 },
  unlike: { likeCount: -1, giftCount: 0 },
  gift:   { likeCount: 0,  giftCount: 1 },
};

exports.handler = async (event) => {
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
    // 1. Auth
    await verifyFirebaseToken(event.headers.authorization);

    // 2. Parsing
    let body;
    try { body = JSON.parse(event.body || '{}'); }
    catch { return { statusCode: 400, body: JSON.stringify({ error: 'Body JSON invalide' }) }; }

    const { channelId, action } = body;

    if (typeof channelId !== 'string' || !channelId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'channelId requis' }) };
    }
    if (!ALLOWED_ACTIONS[action]) {
      return { statusCode: 400, body: JSON.stringify({ error: `Action invalide. Valeurs : ${Object.keys(ALLOWED_ACTIONS).join(', ')}` }) };
    }

    // 3. Vérifier que le live est actif
    const sessionSnap = await db.collection('live_sessions').doc(channelId).get();
    if (!sessionSnap.exists || !sessionSnap.data().isLive) {
      return { statusCode: 409, body: JSON.stringify({ error: 'Session inactive' }) };
    }

    // 4. Incrément atomique — les valeurs viennent du serveur, pas du client
    const delta = ALLOWED_ACTIONS[action];
    const inc   = admin.firestore.FieldValue.increment;

    const updateData = {};
    if (delta.likeCount !== 0) updateData.likeCount = inc(delta.likeCount);
    if (delta.giftCount !== 0) updateData.giftCount = inc(delta.giftCount);
    // engagementScore recalculé en lecture (viewerCount + likeCount + giftCount)
    // pour éviter les dérives dues aux incréments concurrents

    await db.collection('live_sessions').doc(channelId).update(updateData);

    return {
      statusCode: 200,
      headers: {
        'Content-Type':                'application/json',
        'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
      },
      body: JSON.stringify({ ok: true, action }),
    };

  } catch (err) {
    console.error('[update-engagement]', err.message);
    return {
      statusCode: err.status ?? 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message ?? 'Erreur serveur' }),
    };
  }
};