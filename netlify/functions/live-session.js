import { adminDb } from "../../lib/firebaseAdmin";

export const handler = async (event) => {
  try {
    const params = event.queryStringParameters || {};
    const { sessionId, sellerId, productId } = params;

    if (!sessionId) {
      return {
        statusCode: 400,
        body: "sessionId manquant",
      };
    }

    // 🔹 Récupération session live
    const sessionRef = adminDb
      .collection("live_avatar_sessions")
      .doc(sessionId);

    const snap = await sessionRef.get();

    if (!snap.exists) {
      return {
        statusCode: 404,
        body: "Live introuvable",
      };
    }

    const session = snap.data();

    // 🔹 Vérifie si live actif
    if (session.isLive !== true) {
      return {
        statusCode: 302,
        headers: {
          Location: `/live-ended?sessionId=${sessionId}`,
        },
      };
    }

    // 🔹 Tracking view web
    await sessionRef.update({
      totalClicks: adminDb.FieldValue
        ? adminDb.FieldValue.increment(1)
        : 0,
    });

    // 🔹 Redirection vers page web live (PAS embed)
    const redirectUrl = `/liveAvatar?sessionId=${sessionId}` +
      (sellerId ? `&sellerId=${sellerId}` : "") +
      (productId ? `&productId=${productId}` : "");

    return {
      statusCode: 302,
      headers: {
        Location: redirectUrl,
        "Cache-Control": "no-store",
      },
    };
  } catch (e) {
    console.error("live-session error", e);
    return {
      statusCode: 500,
      body: "Erreur serveur",
    };
  }
};