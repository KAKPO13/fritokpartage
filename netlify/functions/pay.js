const admin = require("firebase-admin");
const fetch = require("node-fetch");

if (!admin.apps.length) {
  const serviceAccount = require("../../serviceAccountKey.json");

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405 };
  }

  try {
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

    const productData = snap.docs[0].data();
    const product = productData.product;

    const txRef = "FRITOK-" + Date.now();

    // 🔥 Enregistrer pending payment
    await db.collection("pending_payments").doc(txRef).set({
      tx_ref: txRef,
      productId,
      amount: product.price,
      currency: "XOF",
      status: "pending",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // 💳 Flutterwave paiement
    const payment = await fetch("https://api.flutterwave.com/v3/payments", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tx_ref: txRef,
        amount: product.price,
        currency: "XOF",
        redirect_url: "https://fritok.net/wallet",
        customer: {
          email: "client@email.com",
        },
        customizations: {
          title: product.name,
        },
      }),
    });

    const paymentData = await payment.json();

    return {
      statusCode: 200,
      body: JSON.stringify({
        payment_url: paymentData.data.link,
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