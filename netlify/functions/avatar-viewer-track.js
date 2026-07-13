// netlify/functions/avatar-viewer-track.js
//
// Remplace TOUTES les écritures de AvatarTrackingRepository (join/leave/
// pause/resume/heartbeat/like/comment/reaction/click), qui écrivaient
// directement dans Firestore depuis le client. `viewerId` n'est plus lu
// depuis le body envoyé par le client : c'est le uid du token Firebase
// vérifié qui fait foi, donc impossible pour un client d'agir "au nom"
// d'un autre viewer (like/click/comment spoofés).
//
// FIX au passage : dans le code Dart original, leaveViewer() décrémentait
// viewerCount même si le viewer était déjà en pause (donc déjà décompté
// par pauseViewer) → double décrément possible pour un même viewer.
// Corrigé ici : leave ne décrémente que si le viewer n'était pas déjà en
// pause.

const { db, json, admin, requireAuth } = require('./_avatarShared');

const ACTIONS = ['join', 'leave', 'pause', 'resume', 'heartbeat', 'like', 'comment', 'reaction', 'click'];
const MAX_COMMENT_LEN = 300;
const MAX_EMOJI_LEN = 8;

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

  const { sessionId, action } = body;
  const viewerId = decoded.uid;

  if (typeof sessionId !== 'string' || sessionId.trim().length === 0) {
    return json(400, { error: 'invalid_session_id' });
  }
  if (!ACTIONS.includes(action)) {
    return json(400, { error: 'invalid_action' });
  }

  const sessionRef = db.collection('live_avatar_sessions').doc(sessionId);
  const viewerRef = sessionRef.collection('viewers').doc(viewerId);

  try {
    switch (action) {
      case 'join': {
        await db.runTransaction(async (tx) => {
          const viewerSnap = await tx.get(viewerRef);
          tx.set(viewerRef, {
            joinedAt: admin.firestore.FieldValue.serverTimestamp(),
            lastSeen: admin.firestore.FieldValue.serverTimestamp(),
            isPaused: false,
          }, { merge: true });
          // Idempotent : n'incrémente que si le viewer n'existait pas déjà
          // (évite qu'un double appel join() gonfle viewerCount).
          if (!viewerSnap.exists) {
            tx.update(sessionRef, { viewerCount: admin.firestore.FieldValue.increment(1) });
          }
        });
        break;
      }

      case 'resume': {
        await db.runTransaction(async (tx) => {
          const viewerSnap = await tx.get(viewerRef);
          if (!viewerSnap.exists) return;
          const data = viewerSnap.data();
          if (data.isPaused !== true) return;
          tx.update(viewerRef, {
            isPaused: false,
            resumedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          tx.update(sessionRef, { viewerCount: admin.firestore.FieldValue.increment(1) });
        });
        break;
      }

      case 'pause': {
        await db.runTransaction(async (tx) => {
          const viewerSnap = await tx.get(viewerRef);
          if (!viewerSnap.exists) return;
          const data = viewerSnap.data();
          if (data.isPaused === true) return;
          tx.update(viewerRef, {
            isPaused: true,
            pausedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          tx.update(sessionRef, { viewerCount: admin.firestore.FieldValue.increment(-1) });
        });
        break;
      }

      case 'leave': {
        await db.runTransaction(async (tx) => {
          const viewerSnap = await tx.get(viewerRef);
          if (!viewerSnap.exists) return;
          const data = viewerSnap.data();
          tx.update(viewerRef, { leftAt: admin.firestore.FieldValue.serverTimestamp() });
          // Ne décrémente que si le viewer n'était pas déjà en pause
          // (sinon déjà décompté — voir note FIX en tête de fichier).
          if (data.isPaused !== true) {
            tx.update(sessionRef, { viewerCount: admin.firestore.FieldValue.increment(-1) });
          }
        });
        break;
      }

      case 'heartbeat': {
        await viewerRef.update({ lastSeen: admin.firestore.FieldValue.serverTimestamp() });
        break;
      }

      case 'like': {
        await sessionRef.collection('likes').add({
          viewerId,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });
        break;
      }

      case 'comment': {
        const text = (body.text || '').toString().trim();
        if (text.length === 0 || text.length > MAX_COMMENT_LEN) {
          return json(400, { error: 'invalid_comment_text' });
        }
        await sessionRef.collection('comments').add({
          viewerId,
          message: text,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });
        break;
      }

      case 'reaction': {
        const emoji = (body.emoji || '').toString();
        if (emoji.length === 0 || emoji.length > MAX_EMOJI_LEN) {
          return json(400, { error: 'invalid_emoji' });
        }
        await sessionRef.collection('reactions').add({
          viewerId,
          emoji,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });
        break;
      }

      case 'click': {
        const productId = (body.productId || '').toString();
        if (productId.length === 0) {
          return json(400, { error: 'invalid_product_id' });
        }
        await sessionRef.collection('clicks').add({
          productId,
          viewerId,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });
        break;
      }
    }
  } catch (e) {
    return json(500, { error: 'internal_error', detail: e.message });
  }

  return json(200, { ok: true });
};