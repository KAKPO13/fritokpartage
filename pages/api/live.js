import admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    }),
  });
}

const db = admin.firestore();

export default async function handler(req, res) {
  const { sessionId } = req.query;

  if (!sessionId) {
    return res.status(400).json({ error: "sessionId manquant" });
  }

  const snap = await db
    .collection("live_avatar_sessions")
    .doc(sessionId)
    .get();

  if (!snap.exists) {
    return res.status(404).json({ error: "Live introuvable" });
  }

  const data = snap.data();

  if (!data.isLive) {
    return res.status(403).json({ error: "Live terminé" });
  }

  res.status(200).json({
    avatarVideoUrl: data.avatarVideoUrl,
    sellerId: data.sellerId,
    products: data.products || [],
  });
}