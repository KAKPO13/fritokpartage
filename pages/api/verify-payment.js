// pages/api/verify-payment.js
import admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
}
const db = admin.firestore();

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const tx_ref = req.query.tx_ref || (req.body ? req.body.tx_ref : null);
  if (!tx_ref) {
    return res.status(400).json({ error: "Référence de transaction manquante (tx_ref)" });
  }

  try {
    // 1. Vérification externe Flutterwave
    const fwResp = await fetch(
      `https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${tx_ref}`,
      {
        headers: { Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}` },
      }
    );

    if (!fwResp.ok) {
      return res.status(500).json({ error: "Erreur Flutterwave", status: fwResp.status });
    }

    const fwData = await fwResp.json();

    if (fwData.status === "success" && fwData.data.status === "successful") {
      const transaction = fwData.data;
      const { amount, currency, customer, id: flutterwaveId } = transaction;

      // ⚠️ Ici, il faut déterminer comment retrouver ton userId Firestore
      // Exemple : si tu stockes l'email comme clé secondaire
      const userEmail = customer.email;
      const userSnap = await db.collection("users").where("email", "==", userEmail).limit(1).get();

      if (userSnap.empty) {
        return res.status(404).json({ error: "Utilisateur introuvable dans Firestore" });
      }

      const userDoc = userSnap.docs[0];
      const userId = userDoc.id;

      // 2. Mise à jour du wallet Firestore
      await db.collection("users").doc(userId).update({
        [`wallet.${currency}`]: admin.firestore.FieldValue.increment(amount),
      });

      // 3. Log transaction
      await db.collection("wallet_transactions").add({
        userId,
        tx_ref,
        flutterwaveId,
        currency,
        amount,
        status: "success",
        createdAt: admin.firestore.Timestamp.now(),
      });

      return res.status(200).json({
        status: "successful",
        amount,
        currency,
      });
    } else {
      const currentFwStatus = fwData.data?.status || "failed";

      // Log transaction échouée
      await db.collection("wallet_transactions").add({
        tx_ref,
        status: currentFwStatus,
        createdAt: admin.firestore.Timestamp.now(),
      });

      return res.status(200).json({ status: currentFwStatus });
    }
  } catch (err) {
    console.error("Verify-Payment Error:", err.message);
    return res.status(500).json({ error: "Erreur interne", message: err.message });
  }
}
