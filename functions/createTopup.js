// netlify/functions/createTopup.js
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

exports.handler = async function (event, context) {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method not allowed" };
    }

    // ✅ Vérification Firebase token
    const authHeader = event.headers.authorization;
    if (!authHeader) return { statusCode: 401, body: "Missing Authorization header" };

    const idToken = authHeader.replace("Bearer ", "");
    let decodedToken;
    try {
      decodedToken = await admin.auth().verifyIdToken(idToken);
    } catch (err) {
      return { statusCode: 401, body: "Invalid Firebase token" };
    }

    const uid = decodedToken.uid;
    const email = decodedToken.email;

    // ✅ Récupération payload
    const { amount, currency } = JSON.parse(event.body);
    if (!amount || !currency) return { statusCode: 400, body: "Missing amount or currency" };

    // ✅ Création paiement Flutterwave
    const txRef = `topup-${uid}-${Date.now()}`;
    const fwResp = await axios.post(
      "https://api.flutterwave.com/v3/payments",
      {
        tx_ref: txRef,
        amount,
        currency,
        redirect_url: "https://fritok.net/payment-callback",
        customer: { email },
      },
      {
        headers: { Authorization: `Bearer ${FLUTTERWAVE_SECRET_KEY}` },
      }
    );

    if (!fwResp.data?.data?.link) {
      console.error("Flutterwave error:", fwResp.data);
      return { statusCode: 500, body: "Failed to create Flutterwave payment" };
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
    return {
      statusCode: 200,
      body: JSON.stringify({ payment_url: fwResp.data.data.link, tx_ref: txRef }),
    };

  } catch (err) {
    console.error("createTopup error:", err);
    return { statusCode: 500, body: "Internal Server Error" };
  }
};
