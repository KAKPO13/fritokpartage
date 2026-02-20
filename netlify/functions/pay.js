import admin from "firebase-admin";
import fetch from "node-fetch";

if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_ADMIN_JSON);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

export const handler = async (event) => {
  try {
    const authHeader = event.headers.authorization;
    if (!authHeader) {
      return { statusCode: 401, body: "Unauthorized" };
    }

    const idToken = authHeader.split("Bearer ")[1];
    const decoded = await admin.auth().verifyIdToken(idToken);
    const userId = decoded.uid;

    const { productId } = JSON.parse(event.body);

    if (!productId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Produit invalide" }),
      };
    }

    // 🔥 Recherche sécurisée par champ imbriqué
    const snap = await db
      .collection("video_playlist")
      .where("product.productId", "==", productId)
      .limit(1)
      .get();

    if (snap.empty) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Produit invalide" }),
      };
    }

    const product = productSnap.docs[0].data();

    // 🔥 Anti double paiement
    const existingTx = await db
      .collection("wallet_transactions")
      .where("userId", "==", userId)
      .where("productId", "==", productId)
      .where("status", "==", "pending")
      .limit(1)
      .get();

    if (!existingTx.empty) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Paiement déjà en cours" }),
      };
    }

    // 🔥 Création transaction
    const txRef = await db.collection("wallet_transactions").add({
      userId,
      productId,
      amount: product.price,
      currency: "XOF",
      status: "pending",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // 🔥 Flutterwave call
    const flutterRes = await fetch(
      "https://api.flutterwave.com/v3/payments",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tx_ref: txRef.id,
          amount: product.price,
          currency: "XOF",
          redirect_url: `${process.env.SITE_URL}/wallet`,
          customer: {
            email: decoded.email,
          },
          customizations: {
            title: product.name,
          },
        }),
      }
    );

    const flutterData = await flutterRes.json();

    return {
      statusCode: 200,
      body: JSON.stringify({
        payment_url: flutterData.data.link,
      }),
    };
  } catch (error) {
    console.error(error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Erreur serveur" }),
    };
  }
};