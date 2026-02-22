import admin from "firebase-admin";
import fetch from "node-fetch";

/**
 * 🔥 Firebase Init
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
     * 🛡 1️⃣ Vérification signature Flutterwave
     */
    const signature = event.headers["verif-hash"];

    if (!signature || signature !== process.env.FLUTTERWAVE_SECRET_HASH) {
      console.error("❌ Signature invalide");
      return { statusCode: 401 };
    }

    const payload = JSON.parse(event.body);
    const tx_ref = payload?.data?.tx_ref;

    if (!tx_ref) {
      return { statusCode: 400 };
    }

    /**
     * 🔎 2️⃣ Double vérification via API Flutterwave
     */
    const verifyRes = await fetch(
      `https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${tx_ref}`,
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
      console.warn("⚠️ Paiement non validé");
      return { statusCode: 200 };
    }

    const {
      amount,
      currency,
      id: flutterwaveId,
    } = verifyData.data;

    /**
     * 🛡 3️⃣ Transaction Firestore blindée
     */
    await db.runTransaction(async (transaction) => {
      const txRef = db.collection("wallet_transactions").doc(tx_ref);
      const txSnap = await transaction.get(txRef);

      if (!txSnap.exists) {
        throw new Error("Transaction introuvable");
      }

      const txData = txSnap.data();

      // 🛑 Idempotence (déjà traité)
      if (txData.status === "success") {
        return;
      }

      // 🛡 Vérification montant + devise anti fraude
      if (
        txData.amount !== amount ||
        txData.currency !== currency
      ) {
        throw new Error("Mismatch montant/devise");
      }

      const userRef = db.collection("users").doc(txData.userId);

      // 💰 Crédit wallet sécurisé
      transaction.update(userRef, {
        [`wallet.${currency}`]:
          admin.firestore.FieldValue.increment(amount),
      });

      // ✅ Mise à jour transaction
      transaction.update(txRef, {
        status: "success",
        flutterwaveId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    console.log("✅ Paiement validé et crédité");

    return { statusCode: 200 };
  } catch (error) {
    console.error("🚨 WEBHOOK ERROR:", error);
    return { statusCode: 500 };
  }
};