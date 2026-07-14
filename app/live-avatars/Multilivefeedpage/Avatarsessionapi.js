import { auth } from '../../lib/firebaseClient';

/**
 * avatarSessionApi — tout accès en écriture à `live_avatar_sessions` (doc
 * parent et sous-collections viewers/likes/comments/reactions/clicks) passe
 * par la Netlify Function `avatar-viewer-track`, jamais par le SDK client :
 * les règles Firestore posent `allow create, update, delete: if false` sur
 * toute cette collection (voir firestore.rules, section
 * `/live_avatar_sessions/{sessionId}`). Le client ne conserve que la
 * lecture temps réel via onSnapshot.
 *
 * Chaque appel exige un utilisateur Firebase authentifié (même anonyme,
 * `isAuth()` ne demande que `request.auth != null`) puisque la LECTURE de
 * cette collection est elle-même soumise à `isAuth()`.
 */

const ENDPOINT = '/.netlify/functions/avatar-viewer-track';

async function callAvatarTrack(action, payload = {}) {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Utilisateur non authentifié (avatar-viewer-track requiert isAuth()).');
  }
  const idToken = await user.getIdToken();

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ action, ...payload }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `avatar-viewer-track (${action}) a échoué`);
  }
  return data;
}

export const joinAvatarSession = (sessionId) =>
  callAvatarTrack('join', { sessionId });

export const leaveAvatarSession = (sessionId) =>
  callAvatarTrack('leave', { sessionId });

export const pauseAvatarSession = (sessionId) =>
  callAvatarTrack('pause', { sessionId });

export const resumeAvatarSession = (sessionId) =>
  callAvatarTrack('resume', { sessionId });

export const heartbeatAvatarSession = (sessionId) =>
  callAvatarTrack('heartbeat', { sessionId });

export const likeAvatarSession = (sessionId) =>
  callAvatarTrack('like', { sessionId });

export const commentAvatarSession = (sessionId, text) =>
  callAvatarTrack('comment', { sessionId, text });

export const reactAvatarSession = (sessionId, reaction) =>
  callAvatarTrack('reaction', { sessionId, reaction });

export const clickAvatarProduct = (sessionId, productId) =>
  callAvatarTrack('click', { sessionId, productId });