/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  Netlify Function : end-live                                     ║
 * ║  POST /api/end-live                                              ║
 * ║                                                                  ║
 * ║  Responsabilités :                                               ║
 * ║  1. Vérifie que l'appelant est bien le sellerId de la session    ║
 * ║  2. Marque isLive=false + endedAt en Firestore (Admin SDK)       ║
 * ║  3. Passe tous les co_hosts actifs en status='ended'             ║
 * ║  4. Supprime la notification token du co-host (révocation)       ║
 * ║  5. Retourne les statistiques finales de la session              ║
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

// ── Helpers ──────────────────────────────────────────────────────────────────

async function verifyFirebaseToken(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw Object.assign(new Error('Token manquant'), { status: 401 });
  }
  return admin.auth().verifyIdToken(authHeader.slice(7));
}

/**
 * Révoque les tokens Agora des co-hosts en supprimant leurs notifications privées.
 * Passe également leur statut à 'ended' dans la sous-collection co_hosts.
 */
async function revokeCoHosts(channelId) {
  const coHostsSnap = await db
    .collection('live_sessions').doc(channelId)
    .collection('co_hosts')
    .where('status', 'in', ['active', 'waiting', 'pending'])
    .get();

  const batch = db.batch();

  for (const docSnap of coHostsSnap.docs) {
    const coHostUid = docSnap.id;

    // Passer le co-host en statut 'ended'
    batch.update(docSnap.ref, {
      status:  'ended',
      endedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Supprimer la notification privée contenant le token Agora
    const notifRef = db
      .collection('notifications').doc(coHostUid)
      .collection('items').doc(`cohost_token_${channelId}`);
    batch.delete(notifRef);
  }

  await batch.commit();
  return coHostsSnap.size;
}

/**
 * Supprime tous les viewers de la session.
 * Firestore ne permet pas de supprimer une sous-collection entière en une seule
 * opération — on passe par des batches de 500 max.
 */
async function clearViewers(channelId) {
  const viewersSnap = await db
    .collection('live_sessions').doc(channelId)
    .collection('viewers')
    .limit(500)
    .get();

  if (viewersSnap.empty) return 0;

  const batch = db.batch();
  viewersSnap.docs.forEach(d => batch.delete(d.ref));
  await batch.commit();
  return viewersSnap.size;
}

// ── Handler ──────────────────────────────────────────────────────────────────
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
    // 1. Authentification
    const decoded  = await verifyFirebaseToken(event.headers.authorization);
    const callerId = decoded.uid;

    // 2. Parsing
    let body;
    try { body = JSON.parse(event.body || '{}'); }
    catch { return { statusCode: 400, body: JSON.stringify({ error: 'Body JSON invalide' }) }; }

    const { channelId } = body;
    if (typeof channelId !== 'string' || !channelId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'channelId requis' }) };
    }

    // 3. Vérifier que l'appelant est bien l'hôte
    const sessionRef  = db.collection('live_sessions').doc(channelId);
    const sessionSnap = await sessionRef.get();

    if (!sessionSnap.exists) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Session introuvable' }) };
    }
    const session = sessionSnap.data();

    if (session.sellerId !== callerId) {
      return { statusCode: 403, body: JSON.stringify({ error: 'Non autorisé : vous n\'êtes pas l\'hôte' }) };
    }
    if (!session.isLive) {
      // Idempotent : déjà terminé, on retourne quand même les stats
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*' },
        body: JSON.stringify({ ok: true, alreadyEnded: true, stats: extractStats(session) }),
      };
    }

    // 4. Clôturer la session
    await sessionRef.update({
      isLive:  false,
      endedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // 5. Révoquer les co-hosts (parallèle avec nettoyage viewers)
    const [coHostsRevoked] = await Promise.all([
      revokeCoHosts(channelId),
      clearViewers(channelId),
    ]);

    // 6. Statistiques finales
    const stats = extractStats(session);

    console.log(`[end-live] Session ${channelId} terminée — ${coHostsRevoked} co-hosts révoqués`);

    return {
      statusCode: 200,
      headers: {
        'Content-Type':                'application/json',
        'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
      },
      body: JSON.stringify({
        ok: true,
        channelId,
        coHostsRevoked,
        stats,
      }),
    };

  } catch (err) {
    console.error('[end-live]', err.message);
    return {
      statusCode: err.status ?? 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message ?? 'Erreur serveur' }),
    };
  }
};

function extractStats(session) {
  return {
    viewerCount:     session.viewerCount     ?? 0,
    likeCount:       session.likeCount       ?? 0,
    giftCount:       session.giftCount       ?? 0,
    engagementScore: session.engagementScore ?? 0,
  };
}