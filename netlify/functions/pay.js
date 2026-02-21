import admin from "firebase-admin";
import fetch from "node-fetch";

/* =============================
   🔥 INIT FIREBASE SAFE
============================= */

if (!admin.apps.length) {
  const raw = process.env.FIREBASE_ADMIN_JSON;

  if (!raw) {
    throw new Error("FIREBASE_ADMIN_JSON missing in env");
  }

  const serviceAccount = JSON.parse(raw);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

/* =============================
   🚀 HANDLER
============================= */

export const handler = async (event) => {
  try {
    /* =============================
       🔐 AUTH CHECK
    ============================= */

    const authHeader = event.headers.authorization;

    if (!authHeader) {
      return { statusCode: 401, body: "Unauthorized" };
    }

    const idToken = authHeader.split("Bearer ")[1];
    const decoded = await admin.auth().verifyIdToken(idToken);
    const userId = decoded.uid;

    /* =============================
       📦 BODY SAFE PARSE
    ============================= */

    const body = event.body ? JSON.parse(event.body) : {};
    const { productId } = body;

    if (!productId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Produit invalide" }),
      };
    }

    /* =============================
       🔍 SEARCH PRODUCT
    ============================= */

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

    const video = snap.docs[0].data();
    const product = video.product;

    if (!product?.price) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Prix invalide" }),
      };
    }

    /* =============================
       🛡 ANTI DOUBLE PAYMENT
    ============================= */

    const existingTx = await db
      .collection("wallet_transactions")
      .where("userId", "==", userId)
      .where("productId", "==", productId)
      .where("status", "in", ["pending", "processing"])
      .limit(1)
      .get();

    if (!existingTx.empty) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Paiement déjà en cours" }),
      };
    }

    /* =============================
       💳 CREATE TRANSACTION
    ============================= */

    const txRef = db.collection("wallet_transactions").doc();

    await txRef.set({
      userId,
      productId,
      amount: product.price,
      currency: "XOF",
      status: "pending",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    /* =============================
       🔥 CALL FLUTTERWAVE
    ============================= */

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

    if (!flutterData?.data?.link) {
      throw new Error("Flutterwave response invalid");
    }

    /* =============================
       ✅ RETURN PAYMENT LINK
    ============================= */

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