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

export const handler = async (event) => {
  const p = event.queryStringParameters || {};

  await db.collection("share_tracking").add({
    sessionId: p.sessionId,
    sellerId: p.sellerId,
    productId: p.productId || null,
    source: p.utm_source || "unknown",
    medium: p.utm_medium || "social",
    campaign: p.utm_campaign || "avatar_live",
    ref: p.ref || "share",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return {
    statusCode: 302,
    headers: {
      Location: `/liveAvatar?sessionId=${p.sessionId}&sellerId=${p.sellerId}&productId=${p.productId || ""}`,
    },
  };
};