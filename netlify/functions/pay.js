import admin from "firebase-admin";
import fetch from "node-fetch";

/**
 * 🔥 Initialisation Firebase Admin (compatible Netlify 4KB limit)
 */
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    }),
  });
}

const db = admin.firestore();

export const handler = async (event) => {
  try {
    // 🔐 Vérification auth
    const authHeader = event.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: "Unauthorized" }),
      };
    }

    const idToken = authHeader.split("Bearer ")[1];
    const decoded = await admin.auth().verifyIdToken(idToken);
    const userId = decoded.uid;

    // 📦 Body parsing sécurisé
    if (!event.body) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Body manquant" }),
      };
    }

    const { productId } = JSON.parse(event.body);

    if (!productId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Produit invalide" }),
      };
    }

    /**
     * 🔎 Recherche produit via champ imbriqué
     */
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

    const productData = snap.docs[0].data();
    const product = productData.product;

    /**
     * 🛡 Anti double paiement
     */
    const existingTx = await db
      .collection("wallet_transactions")
      .where("userId", "==", userId)
      .where("productId", "==", productId)
      .where("status", "==", "pending")
      .limit(1)
      .get();

    if (!existingTx.empty) {
  const txDoc = existingTx.docs[0];
  const txData = txDoc.data();

  // si transaction trop vieille (ex: +15 min)
  const createdAt = txData.createdAt?.toDate();
  const now = new Date();

  if (createdAt && now - createdAt > 15 * 60 * 1000) {
    // on la supprime
    await txDoc.ref.delete();
  } else {
    // on renvoie l'ancien lien
    return {
      statusCode: 200,
      body: JSON.stringify({
        payment_url: txData.paymentLink,
      }),
    };
  }
}
    /**
     * 💳 Création transaction
     */
    const txRef = await db.collection("wallet_transactions").add({
      userId,
      productId,
      amount: product.price,
      currency: "XOF",
      status: "pending",
      paymentLink: flutterData.data.link, // AJOUTE ÇA
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    /**
     * 🚀 Appel Flutterwave
     */
    const flutterRes = await fetch(
      "https://api.flutterwave.com/v3/payments",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}`,
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

    if (!flutterData?.data?.link) {
      console.error("Flutterwave error:", flutterData);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Erreur paiement Flutterwave" }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        payment_url: flutterData.data.link,
      }),
    };
  } catch (error) {
    console.error("PAY FUNCTION ERROR:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Erreur serveur" }),
    };
  }
};