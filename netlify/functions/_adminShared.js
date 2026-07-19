// netlify/functions/_adminShared.js

import admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
  });
}

/* ══════════════════════════════════════════════════════════
   Vérifie que la requête vient d'un compte avec le custom claim
   admin: true. Lève une erreur avec statusCode attaché plutôt que
   de retourner un objet — permet un throw direct dans le handler
   appelant, sans dupliquer la logique de réponse HTTP partout.
══════════════════════════════════════════════════════════ */
export async function requireAdmin(event) {
  const idToken = event.headers.authorization?.split('Bearer ')[1];
  if (!idToken) {
    const err = new Error('Non authentifié');
    err.statusCode = 401;
    throw err;
  }

  let decoded;
  try {
    decoded = await admin.auth().verifyIdToken(idToken);
  } catch {
    const err = new Error('Token invalide ou expiré');
    err.statusCode = 401;
    throw err;
  }

  if (!decoded.admin) {
    const err = new Error('Accès réservé aux admins');
    err.statusCode = 403;
    throw err;
  }

  return decoded; // contient decoded.uid, réutilisable pour la traçabilité
}