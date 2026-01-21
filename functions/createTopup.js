// createTopup.js
const fetch = require("node-fetch"); // si Netlify, Node 18+ fetch est natif
const admin = require("firebase-admin");
const axios = require("axios");

// Initialise Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    }),
  });
}

// Supabase REST API
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Flutterwave Secret
const FLUTTERWAVE_SECRET_KEY = process.env.FLUTTERWAVE_SECRET_KEY;

module.exports = async function (req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).send("Method not allowed");
    }

    // ✅ Vérification Firebase token
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).send("Missing Authorization header");

    const idToken = authHeader.replace("Bearer ", "");
    let decodedToken;
    try {
      decodedToken = await admin.auth().verifyIdToken(idToken);
    } catch (err) {
      return res.status(401).send("Invalid Firebase token");
    }

    const uid = decodedToken.uid;
    const email = decodedToken.email;

    // ✅ Récupération payload
    const { amount, currency } = req.body;
    if (!amount || !currency) return res.status(400).send("Missing amount or currency");

    // ✅ Création paiement Flutterwave
    const txRef = `topup-${uid}-${Date.now()}`;
    const fwResp = await axios.post(
      "https://api.flutterwave.com/v3/payments",
      {
        tx_ref: txRef,
        amount,
        currency,
        redirect_url: "https://yourapp.com/payment-callback",
        customer: { email },
      },
      {
        headers: { Authorization: `Bearer ${FLUTTERWAVE_SECRET_KEY}` },
      }
    );

    if (!fwResp.data?.data?.link) {
      console.error("Flutterwave error:", fwResp.data);
      return res.status(500).send("Failed to create Flutterwave payment");
    }

    // ✅ Mettre à jour Supabase wallet (via REST API ou RPC)
    await axios.post(
      `${SUPABASE_URL}/rest/v1/rpc/increment_wallet`,
      {
        uid,
        currency_code: currency,
        amount_value: amount,
      },
      {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    // ✅ Retour JSON
    return res.status(200).json({ payment_url: fwResp.data.data.link, tx_ref: txRef });

  } catch (err) {
    console.error("createTopup error:", err);
    return res.status(500).send("Internal Server Error");
  }
};
