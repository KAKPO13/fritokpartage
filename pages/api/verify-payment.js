// pages/api/verify-payment.js
import admin from "firebase-admin";

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

export default async function handler(req, res) {
  if (!["GET", "POST"].includes(req.method)) {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const tx_ref = req.query.tx_ref || req.body?.tx_ref;
  if (!tx_ref) {
    console.error("[VerifyPayment] ❌ tx_ref manquant");
    return res.status(400).json({ error: "tx_ref manquant" });
  }

  try {
    console.log(`[VerifyPayment] 🔎 Vérification Flutterwave: ${tx_ref}`);

    // 1️⃣ Vérification Flutterwave
    const fwResp = await fetch(
      `https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${tx_ref}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}`,
        },
      }
    );

    if (!fwResp.ok) {
      return res.status(500).json({ error: "Erreur Flutterwave" });
    }

    const fwData = await fwResp.json();
    console.log("[VerifyPayment] Flutterwave response:", fwData);

    const fwStatus = fwData?.data?.status;

    // 2️⃣ Récupération du paiement en attente
    const pendingRef = db.collection("pending_payments").doc(tx_ref);
    const pendingSnap = await pendingRef.get();

    if (!pendingSnap.exists) {
      return res.status(404).json({ error: "Paiement introuvable" });
    }

    const pendingData = pendingSnap.data();

    // 🛑 Déjà traité → idempotence
    if (pendingData.status === "successful") {
      console.warn("[VerifyPayment] ⚠️ Paiement déjà validé");
      return res.status(200).json({ status: "already_processed" });
    }

    // 3️⃣ Paiement réussi
    if (fwData.status === "success" && fwStatus === "successful") {
      const { amount, currency, id: flutterwaveId } = fwData.data;
      const {
        userId,
        destinataireId,
        destinataireNom,
        destinataireTelephone,
      } = pendingData;

      await db.runTransaction(async (transaction) => {
        const userRef = db.collection("users").doc(userId);

        // 💰 Crédit du wallet
        transaction.update(userRef, {
          [`wallet.${currency}`]:
            admin.firestore.FieldValue.increment(amount),
        });

        // 🧾 Historique wallet_transactions
        const walletTxRef = db.collection("wallet_transactions").doc(tx_ref);
        transaction.set(walletTxRef, {
          userId,
          tx_ref,
          flutterwaveId,
          type: "topup",
          currency,
          amount,
          status: "success",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // 📜 Historique TransfetMoney (pour l’app Flutter)
        transaction.set(db.collection("TransfetMoney").doc(tx_ref), {
          transactionId: tx_ref,
          type: "topup",
          expediteurId: userId,
          destinataireId: destinataireId || userId,
          destinataireNom: destinataireNom || "N/A",
          destinataireTelephone: destinataireTelephone || "N/A",
          profilePictureUrl: "",
          expediteurEmail: "",
          frais: 0,
          montantEnvoye: amount,
          montantRecu: amount,
          currency,
          timestamp: Date.now(),
          date: new Date().toISOString().split("T")[0],
        });

        // ✅ Mise à jour pending_payments
        transaction.update(pendingRef, {
          status: "successful",
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      });

      console.log("[VerifyPayment] ✅ Paiement validé et crédité");
      return res.status(200).json({
        status: "successful",
        amount,
        currency,
      });
    }

    // 4️⃣ Paiement échoué ou en attente
    await pendingRef.update({
      status: fwStatus || "failed",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await db.collection("wallet_transactions").add({
      tx_ref,
      status: fwStatus || "failed",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.warn("[VerifyPayment] ⚠️ Paiement non validé:", fwStatus);
    return res.status(200).json({ status: fwStatus });
  } catch (err) {
    console.error("[VerifyPayment] ❌ Erreur interne:", err);
    return res.status(500).json({
      error: "Erreur interne",
      message: err.message,
    });
  }
}
