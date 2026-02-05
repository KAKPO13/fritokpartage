// pages/api/verify-payment.js
import admin from "firebase-admin";

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
      const { amount, currency, id: flutterwaveId } = fwData.data;

      // 3. Récupérer l'utilisateur via tx_ref
      const paymentSnap = await db.collection("pending_payments").doc(tx_ref).get();
      if (!paymentSnap.exists) {
        console.error("[VerifyPayment] ❌ Transaction introuvable pour tx_ref:", tx_ref);
        return res.status(404).json({ error: "Transaction introuvable" });
      }

      const { userId, destinataireId, destinataireNom, destinataireTelephone } = paymentSnap.data();

      // 4. Mise à jour du wallet Firestore
      console.log(`[VerifyPayment] 🔄 Mise à jour wallet ${currency} pour userId=${userId}, +${amount}`);
      await db.collection("users").doc(userId).update({
        [`wallet.${currency}`]: admin.firestore.FieldValue.increment(amount),
      });

      // 5. Log transaction dans wallet_transactions
      await db.collection("wallet_transactions").add({
        userId,
        tx_ref,
        flutterwaveId,
        currency,
        amount,
        status: "success",
        createdAt: admin.firestore.Timestamp.now(),
      });

      // 6. Ajouter la transaction dans TransfetMoney pour historique complet
      await db.collection("TransfetMoney").add({
        date: new Date().toISOString().split("T")[0], // YYYY-MM-DD
        destinataireNom: destinataireNom || "N/A",
        destinataireTelephone: destinataireTelephone || "N/A",
        profilePictureUrl: "", // si tu veux l’ajouter plus tard
        expediteurEmail: "", // si disponible
        expediteurId: userId,
      
        frais: 0,
        montantEnvoye: amount,
        montantRecu: amount,
        timestamp: Date.now(),
        transactionId: tx_ref,
        currency,
      });

      // 7. Mettre à jour le statut du paiement
      await db.collection("pending_payments").doc(tx_ref).update({
        status: "successful",
        updatedAt: admin.firestore.Timestamp.now(),
      });

      console.log("[VerifyPayment] ✅ Paiement validé, wallet et historique TransfetMoney mis à jour");
      return res.status(200).json({ status: "successful", amount, currency });
    } else {
      const currentFwStatus = fwData.data?.status || "failed";
      console.warn("[VerifyPayment] ⚠️ Paiement non validé, statut:", currentFwStatus);

      // Mettre à jour le statut en base
      await db.collection("pending_payments").doc(tx_ref).update({
        status: currentFwStatus,
        updatedAt: admin.firestore.Timestamp.now(),
      });

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
