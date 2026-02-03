// pages/api/init-payment.js
import admin from "firebase-admin";
import crypto from "crypto";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
  });
}
const db = admin.firestore();

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { userId, amount, currency } = req.body;

    // Validation des paramètres
    if (!userId || !amount || !currency) {
      console.error("[InitPayment] ❌ Paramètres manquants");
      return res.status(400).json({ error: "Paramètres manquants" });
    }

    // 1. Générer un tx_ref unique
    const tx_ref = `FRITOK-${crypto.randomUUID()}`;

    // 2. Enregistrer dans Firestore
    await db.collection("pending_payments").doc(tx_ref).set({
      userId,
      amount,
      currency,
      tx_ref,
      status: "pending",
      createdAt: admin.firestore.Timestamp.now(),
    });

    console.log(`[InitPayment] ✅ Paiement initialisé pour userId=${userId}, tx_ref=${tx_ref}`);

    // 3. Retourner tx_ref au frontend (pour initier Flutterwave)
    return res.status(200).json({ tx_ref, amount, currency });
  } catch (err) {
    console.error("[InitPayment] ❌ Erreur interne:", err);
    return res.status(500).json({ error: "Erreur interne", message: err.message });
  }
}
