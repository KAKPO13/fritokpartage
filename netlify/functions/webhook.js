import admin from "firebase-admin";
import fetch from "node-fetch";

/**
 * 🔥 Firebase Admin init
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
    /**
     * 🔐 1️⃣ Vérification signature Flutterwave
     */
    const signature = event.headers["verif-hash"];

    if (!signature || signature !== process.env.FLUTTERWAVE_SECRET_KEY) {
      return {
        statusCode: 401,
        body: "Invalid signature",
      };
    }

    /**
     * 📦 2️⃣ Parse body
     */
    const payload = JSON.parse(event.body);

    if (payload.event !== "charge.completed") {
      return { statusCode: 200, body: "Event ignored" };
    }

    const txRef = payload.data.tx_ref;
    const transactionId = payload.data.id;

    if (!txRef || !transactionId) {
      return { statusCode: 400, body: "Invalid payload" };
    }

    /**
     * 🔍 3️⃣ Double vérification API Flutterwave
     */
    const verifyRes = await fetch(
      `https://api.flutterwave.com/v3/transactions/${transactionId}/verify`,
      {
        headers: {
          Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}`,
        },
      }
    );

    const verifyData = await verifyRes.json();

    if (
      verifyData.status !== "success" ||
      verifyData.data.status !== "successful"
    ) {
      await db.collection("wallet_transactions").doc(txRef).update({
        status: "failed",
        verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return { statusCode: 400, body: "Payment failed" };
    }

    /**
     * 💰 4️⃣ Vérification montant & devise
     */
    const txDoc = await db.collection("wallet_transactions").doc(txRef).get();

    if (!txDoc.exists) {
      return { statusCode: 404, body: "Transaction not found" };
    }

    const txData = txDoc.data();

    if (
      verifyData.data.amount !== txData.amount ||
      verifyData.data.currency !== txData.currency
    ) {
      await txDoc.ref.update({
        status: "failed",
        verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return { statusCode: 400, body: "Amount mismatch" };
    }

    /**
     * ✅ 5️⃣ Validation finale
     */
    await txDoc.ref.update({
      status: "success",
      flutterId: transactionId,
      verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return {
      statusCode: 200,
      body: "Payment verified successfully",
    };

  } catch (error) {
    console.error("WEBHOOK ERROR:", error);
    return {
      statusCode: 500,
      body: "Server error",
    };
  }
};