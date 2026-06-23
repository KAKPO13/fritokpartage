// netlify/functions/flutterwave-webhook.js

import admin from "firebase-admin";
import fetch from "node-fetch";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId  : process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey : process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    }),
  });
}

const db = admin.firestore();

const HEADERS = { "Content-Type": "application/json" };

export const handler = async (event) => {
  try {
    // 1. Vérification signature
    const signature = event.headers["verif-hash"];
    if (!signature || signature !== process.env.FLUTTERWAVE_WEBHOOK_SECRET) {
      return { statusCode: 401, body: "Invalid signature" };
    }

    const payload = JSON.parse(event.body);
    if (payload.event !== "charge.completed") {
      return { statusCode: 200, body: "Event ignored" };
    }

    const txRef        = payload.data?.tx_ref;
    const transactionId = payload.data?.id;
    if (!txRef || !transactionId) {
      return { statusCode: 400, body: "Invalid payload" };
    }

    // 2. Vérification Flutterwave
    const verifyRes = await fetch(
      `https://api.flutterwave.com/v3/transactions/${transactionId}/verify`,
      { headers: { Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}` } }
    );
    const verifyData = await verifyRes.json();

    if (
      verifyData.status !== "success" ||
      verifyData.data?.status !== "successful"
    ) {
      return { statusCode: 400, body: "Payment not successful" };
    }

    // ─── 3. Récupérer topupAttempts (PAS wallet_transactions) ───────────────
    const attemptRef  = db.collection("topupAttempts").doc(txRef);
    const attemptSnap = await attemptRef.get();

    if (!attemptSnap.exists) {
      console.error("topupAttempt introuvable pour txRef:", txRef);
      return { statusCode: 404, body: "Attempt not found" };
    }

    const attempt = attemptSnap.data();

    // Idempotence — évite le double crédit si le webhook arrive deux fois
    if (attempt.status === "completed") {
      return { statusCode: 200, body: "Already processed" };
    }

    const { userId, currency, amount, transtetId } = attempt;

    // 4. Vérification montant & devise
    if (
      verifyData.data.amount   !== amount ||
      verifyData.data.currency !== currency
    ) {
      await attemptRef.update({ status: "failed",
        verifiedAt: admin.firestore.FieldValue.serverTimestamp() });
      return { statusCode: 400, body: "Amount mismatch" };
    }

    // ─── 5. Écriture atomique ────────────────────────────────────────────────
    await db.runTransaction(async (t) => {

      // a) Crédite le wallet
      const userRef = db.collection("users").doc(userId);
      t.update(userRef, {
        [`wallet.${currency}`]: admin.firestore.FieldValue.increment(amount),
      });

      // b) Met topupAttempts en completed
      t.update(attemptRef, {
        status    : "completed",
        flutterId : transactionId,
        verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // c) Met TransfetMoney en completed (créé en pending par createTopup)
      if (transtetId) {
        const txRef2 = db.collection("TransfetMoney").doc(transtetId);  // ← note: "TransfetMoney" (faute conservée)
        t.update(txRef2, {
          status    : "completed",
          flutterId : transactionId,
          verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    });

    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ ok: true }) };

  } catch (error) {
    console.error("WEBHOOK ERROR:", error);
    return { statusCode: 500, body: "Server error" };
  }
};