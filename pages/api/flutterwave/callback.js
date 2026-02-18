// pages/api/flutterwave/callback.js
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
  try {
    // Flutterwave renvoie tx_ref en query param
    const tx_ref = req.query.tx_ref;
    if (!tx_ref) {
      console.error("[FW Callback] ❌ tx_ref manquant");
      return res.status(400).send("tx_ref manquant");
    }

    console.log(`[FW Callback] 🔎 Vérification tx_ref=${tx_ref}`);

    // 1️⃣ Vérifier le paiement via Flutterwave
    const fwResp = await fetch(
      `https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${tx_ref}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}`,
        },
      }
    );

    if (!fwResp.ok) {
      console.error("[FW Callback] ❌ Erreur vérification Flutterwave");
      return res.status(500).send("Erreur vérification Flutterwave");
    }

    const fwData = await fwResp.json();
    const fwStatus = fwData?.data?.status;

    if (fwData.status !== "success" || !fwData.data) {
      console.error("[FW Callback] ❌ Paiement non validé", fwData);
      return res.status(400).send("Paiement non validé");
    }

    const pendingRef = db.collection("pending_payments").doc(tx_ref);
    const pendingSnap = await pendingRef.get();

    if (!pendingSnap.exists) {
      console.error("[FW Callback] ❌ Paiement introuvable dans Firestore");
      return res.status(404).send("Paiement introuvable");
    }

    const pendingData = pendingSnap.data();

    // 🛑 Idempotence : déjà traité
    if (pendingData.status === "successful") {
      console.warn("[FW Callback] ⚠️ Paiement déjà traité");
      return res.redirect(`${process.env.NEXT_PUBLIC_BASE_URL}/live?success=true&tx_ref=${tx_ref}`);
    }

    // 2️⃣ Paiement réussi ?
    if (fwStatus === "successful") {
      const { amount, currency, id: flutterwaveId } = fwData.data;
      const { userId } = pendingData;

      await db.runTransaction(async (transaction) => {
        const userRef = db.collection("users").doc(userId);

        // 💰 Crédit wallet
        transaction.update(userRef, {
          [`wallet.${currency}`]: admin.firestore.FieldValue.increment(amount),
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

        // ✅ Mettre à jour pending_payments
        transaction.update(pendingRef, {
          status: "successful",
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      });

      console.log("[FW Callback] ✅ Paiement validé et wallet crédité");

      // 3️⃣ Redirection vers le live avec succès
      return res.redirect(`${process.env.NEXT_PUBLIC_BASE_URL}/live?success=true&tx_ref=${tx_ref}`);
    }

    // 4️⃣ Paiement échoué
    await pendingRef.update({
      status: fwStatus || "failed",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.warn("[FW Callback] ⚠️ Paiement échoué:", fwStatus);
    return res.redirect(`${process.env.NEXT_PUBLIC_BASE_URL}/live?success=false&tx_ref=${tx_ref}`);
  } catch (err) {
    console.error("[FW Callback] ❌ Erreur interne:", err);
    return res.status(500).send("Erreur interne");
  }
}
