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

export const handler = async () => {
  try {
    const now = admin.firestore.Timestamp.now();

    const snapshot = await db
      .collection("live_avatar_sessions")
      .where("isLive", "==", false)
      .where("scheduledAt", "<=", now)
      .get();

    if (snapshot.empty) {
      return {
        statusCode: 200,
        body: "No scheduled avatar lives",
      };
    }

    const batch = db.batch();

    snapshot.docs.forEach((doc) => {
      batch.update(doc.ref, {
        isLive: true,
        startedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    await batch.commit();

    return {
      statusCode: 200,
      body: `Started ${snapshot.size} avatar live(s)`,
    };
  } catch (error) {
    console.error("🔥 startScheduledLives error:", error);
    return {
      statusCode: 500,
      body: "Failed to start scheduled lives",
    };
  }
};