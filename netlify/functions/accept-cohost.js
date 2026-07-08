/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  Netlify Function : accept-cohost                                ║
 * ║  POST /api/accept-cohost                                         ║
 * ║                                                                  ║
 * ║  Responsabilités :                                               ║
 * ║  1. Vérifie que l'appelant est bien le sellerId de la session    ║
 * ║  2. Vérifie que le co-host a bien fait une demande pending       ║
 * ║  3. Génère un token Agora PUBLISHER pour le co-host              ║
 * ║  4. Met à jour co_hosts/{uid} en status='active' SANS le token   ║
 * ║  5. Envoie le token UNIQUEMENT via /notifications/{uid}/items/   ║
 * ║     (collection privée protégée par les règles Firestore)        ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * Même variables d'env que start-live.js
 *
 * ⚠️ Converti en ESM (export const handler au lieu de exports.handler) :
 * le package.json a "type": "module" — voir le correctif de
 * webcreateTopup.js pour le détail du bug que ça évite
 * (Runtime.HandlerNotFound).
 */

import admin from 'firebase-admin';
import { RtcTokenBuilder, RtcRole } from 'agora-token';

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
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

/** Détermine un agoraUid stable et reproductible depuis un Firebase uid (string). */
function deriveAgoraUid(firebaseUid) {
  let hash = 0;
  for (let i = 0; i < firebaseUid.length; i++) {
    hash = Math.imul(31, hash) + firebaseUid.charCodeAt(i) | 0;
  }
  return (Math.abs(hash) % 100000) + 1000; // range [1000, 101000]
}

function buildAgoraToken(channelName, uid) {
  const expireSeconds = 3600;
  const privilegeExpiredTs = Math.floor(Date.now() / 1000) + expireSeconds;
  return RtcTokenBuilder.buildTokenWithUid(
    process.env.AGORA_APP_ID,
    process.env.AGORA_APP_CERTIFICATE,
    channelName,
    uid,
    RtcRole.PUBLISHER,
    privilegeExpiredTs
  );
}

// ── Handler ──────────────────────────────────────────────────────────────────
export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
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
    // 1. Authentification — l'appelant doit être le vendeur hôte
    const decoded = await verifyFirebaseToken(event.headers.authorization);
    const callerId = decoded.uid;

    // 2. Parsing
    let body;
    try { body = JSON.parse(event.body || '{}'); }
    catch { return { statusCode: 400, body: JSON.stringify({ error: 'Body JSON invalide' }) }; }

    const { channelId, coHostUid } = body;

    if (typeof channelId !== 'string' || typeof coHostUid !== 'string') {
      return { statusCode: 400, body: JSON.stringify({ error: 'channelId et coHostUid requis' }) };
    }

    // 3. Vérifier que l'appelant est bien le sellerId de cette session
    const sessionSnap = await db.collection('live_sessions').doc(channelId).get();
    if (!sessionSnap.exists) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Session introuvable' }) };
    }
    const session = sessionSnap.data();
    if (session.sellerId !== callerId) {
      return { statusCode: 403, body: JSON.stringify({ error: 'Non autorisé : vous n\'êtes pas l\'hôte' }) };
    }
    if (!session.isLive) {
      return { statusCode: 409, body: JSON.stringify({ error: 'La session n\'est plus en live' }) };
    }

    // 4. Vérifier la demande pending du co-host
    const coHostRef = db.collection('live_sessions').doc(channelId).collection('co_hosts').doc(coHostUid);
    const coHostSnap = await coHostRef.get();
    if (!coHostSnap.exists || coHostSnap.data().status !== 'pending') {
      return { statusCode: 409, body: JSON.stringify({ error: 'Aucune demande pending pour ce co-host' }) };
    }

    // 5. Vérifier la limite de co-hosts actifs
    const activeQuery = await db
      .collection('live_sessions').doc(channelId).collection('co_hosts')
      .where('status', '==', 'active')
      .get();
    if (activeQuery.size >= (session.maxCoHosts || 3)) {
      return { statusCode: 409, body: JSON.stringify({ error: 'Nombre maximum de co-hosts atteint' }) };
    }

    // 6. Générer token Agora pour le co-host
    const agoraUid = deriveAgoraUid(coHostUid);
    const agoraToken = buildAgoraToken(channelId, agoraUid);

    // 7. Mettre à jour co_hosts/{uid} SANS inclure le token
    await coHostRef.update({
      status: 'active',
      agoraUid,             // uid numérique pour rejoindre le canal (pas secret)
      acceptedAt: admin.firestore.FieldValue.serverTimestamp(),
      // ⚠️ token Agora ABSENT intentionnellement — transmis via notification privée
    });

    // 8. Envoyer le token via /notifications/{coHostUid}/items/ (règle : isOwner uniquement)
    const notifRef = db
      .collection('notifications').doc(coHostUid)
      .collection('items').doc(`cohost_token_${channelId}`);

    await notifRef.set({
      type: 'cohost_invite',
      channelId,
      agoraUid,
      agoraToken,           // ← uniquement ici, visible seulement par le co-host
      agoraAppId: process.env.AGORA_APP_ID,
      sellerName: session.sellerName ?? '',
      issuedAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
      read: false,
    });

    // 9. Réponse à l'hôte (pas de token ici — l'hôte n'en a pas besoin)
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
      },
      body: JSON.stringify({
        ok: true,
        coHostUid,
        agoraUid,
        message: 'Co-host accepté, token transmis via notification privée',
      }),
    };

  } catch (err) {
    console.error('[accept-cohost]', err.message);
    return {
      statusCode: err.status ?? 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message ?? 'Erreur serveur' }),
    };
  }
};