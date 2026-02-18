// pages/api/flutterwave/init-payment.js
import admin from "firebase-admin";
import crypto from "crypto";

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
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const {
      userId,
      amount,
      currency,
      customerEmail,
      customerName,
      redirect_url,
    } = req.body;

    // Validation minimale
    if (!userId || !amount || !currency || !redirect_url) {
      return res.status(400).json({ error: "Paramètres manquants" });
    }

    // 1️⃣ Générer tx_ref unique
    const tx_ref = `FRITOK-${crypto.randomUUID()}`;

    // 2️⃣ Enregistrer paiement en attente dans Firestore
    await db.collection("pending_payments").doc(tx_ref).set({
      userId,
      amount,
      currency,
      tx_ref,
      status: "pending",
      createdAt: admin.firestore.Timestamp.now(),
    });

    // 3️⃣ Appel API Flutterwave Standard Checkout
    const fwResp = await fetch("https://api.flutterwave.com/v3/payments", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tx_ref,
        amount,
        currency,
        redirect_url, // ✅ redirection automatique après paiement
        payment_options: "card,mobilemoney,ussd,banktransfer",
        customer: {
          email: customerEmail,
          name: customerName || "Utilisateur FriTok",
          phonenumber: "+2250700000000",
        },
        customizations: {
          title: "FriTok Wallet",
          description: `Recharge de ${amount} ${currency}`,
          logo: "https://fritok.com/logo.png",
        },
      }),
    });

    const data = await fwResp.json();

    if (!data?.status || data.status !== "success") {
      console.error("[InitPayment] ❌ Erreur Flutterwave:", data);
      return res.status(500).json({ error: "Erreur Flutterwave", details: data });
    }

    // 4️⃣ Retourner lien de paiement au frontend
    return res.status(200).json({ payment_url: data.data.link, tx_ref });
  } catch (err) {
    console.error("[InitPayment] ❌ Erreur interne:", err);
    return res.status(500).json({ error: "Erreur interne", message: err.message });
  }
}
