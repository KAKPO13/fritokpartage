const { createClient } = require("@supabase/supabase-js");
const admin = require("firebase-admin");
const fetch = require("node-fetch");
const { v4: uuidv4 } = require("uuid");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    }),
  });
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };

  try {
    // 1. Authentification Firebase
    const token = event.headers.authorization?.split("Bearer ")[1];
    if (!token) return { statusCode: 401, body: "Missing Token" };
    const decodedToken = await admin.auth().verifyIdToken(token);
    const userId = decodedToken.uid;

    const { amount, currency } = JSON.parse(event.body);
    const tx_ref = `FRITOK-${uuidv4()}`;

    // 2. Enregistrement Supabase
    await supabase.from("pending_payments").insert({
      user_id: userId,
      amount: amount,
      currency: currency,
      tx_ref: tx_ref,
      status: "PENDING"
    });

    // 3. Appel API Flutterwave (Standard Checkout)
    const response = await fetch("https://api.flutterwave.com/v3/payments", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tx_ref: tx_ref,
        amount: amount,
        currency: currency,
        redirect_url: "https://fritok.net/payment-callback",
        payment_options: "card,mobilemoney,ussd,banktransfer",
        customer: {
          email: decodedToken.email,
          name: decodedToken.name || "User FriTok",
          phonenumber: "+2250700000000" // numéro ivoirien pour Mobile Money
        },
        customizations: {
          title: "FriTok Wallet",
          description: `Recharge de ${amount} ${currency}`,
          logo: "https://fritok.com/logo.png",
        },
      })
    });

    const data = await response.json();
    return {
      statusCode: 200,
      body: JSON.stringify({ payment_url: data.data.link }),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};