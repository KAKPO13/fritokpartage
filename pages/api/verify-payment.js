// pages/api/verify-payment.js (ESM)
import admin from "firebase-admin";

// Initialisation Firebase Admin (évite les doublons)
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
    console.error("[VerifyPayment] ❌ tx_ref manquant");
    return res.status(400).json({ error: "Référence de transaction manquante (tx_ref)" });
  }

  try {
    console.log(`[VerifyPayment] 🔎 Vérification Flutterwave pour tx_ref=${tx_ref}`);

    // 1. Vérification Flutterwave
    const fwResp = await fetch(
      `https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${tx_ref}`,
      {
        headers: { Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}` },
      }
    );

    if (!fwResp.ok) {
      console.error("[VerifyPayment] ❌ Erreur Flutterwave:", fwResp.status);
      return res.status(500).json({ error: "Erreur Flutterwave", status: fwResp.status });
    }

    const fwData = await fwResp.json();
    console.log("[VerifyPayment] ✅ Réponse Flutterwave:", fwData);

    // 2. Vérification du statut
    if (fwData.status === "success" && fwData.data.status === "successful") {
      const { amount, currency, customer, id: flutterwaveId } = fwData.data;

      // ⚠️ Ici, il faut déterminer comment retrouver ton utilisateur Firestore
      // Exemple : par email
      const userEmail = customer.email;
      const userSnap = await db.collection("users").where("email", "==", userEmail).limit(1).get();

      if (userSnap.empty) {
        console.error("[VerifyPayment] ❌ Utilisateur introuvable pour email:", userEmail);
        return res.status(404).json({ error: "Utilisateur introuvable dans Firestore" });
      }

      const userDoc = userSnap.docs[0];
      const userId = userDoc.id;

      // 3. Mise à jour du wallet Firestore
      console.log(`[VerifyPayment] 🔄 Mise à jour wallet ${currency} pour userId=${userId}, +${amount}`);
      await db.collection("users").doc(userId).update({
        [`wallet.${currency}`]: admin.firestore.FieldValue.increment(amount),
      });

      // 4. Log transaction
      await db.collection("wallet_transactions").add({
        userId,
        tx_ref,
        flutterwaveId,
        currency,
        amount,
        status: "success",
        createdAt: admin.firestore.Timestamp.now(),
      });

      console.log("[VerifyPayment] ✅ Paiement validé et wallet mis à jour");
      return res.status(200).json({ status: "successful", amount, currency });
    } else {
      const currentFwStatus = fwData.data?.status || "failed";
      console.warn("[VerifyPayment] ⚠️ Paiement non validé, statut:", currentFwStatus);

      // Log transaction échouée
      await db.collection("wallet_transactions").add({
        tx_ref,
        status: currentFwStatus,
        createdAt: admin.firestore.Timestamp.now(),
      });

      return res.status(200).json({ status: currentFwStatus });
    }
  } catch (err) {
    console.error("[VerifyPayment] ❌ Erreur interne:", err);
    return res.status(500).json({ error: "Erreur interne", message: err.message });
  }
}
