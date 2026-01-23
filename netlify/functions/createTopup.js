const { createClient } = require("@supabase/supabase-js");
const admin = require("firebase-admin");

// --- Firebase Admin ---
const privateKey = process.env.FIREBASE_PRIVATE_KEY;
if (!privateKey) throw new Error("❌ FIREBASE_PRIVATE_KEY manquant");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL || "",
      privateKey: privateKey.replace(/\\n/g, "\n"),
    }),
  });
}

// --- Supabase ---
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error("❌ Supabase URL ou Service Key manquante");
}
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// --- Netlify Function handler ---
exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  try {
    const signature = event.headers["verif-hash"];
    if (signature !== process.env.FLUTTERWAVE_WEBHOOK_SECRET) {
      return { statusCode: 401, body: "Unauthorized" };
    }

    if (!event.body) {
      return { statusCode: 400, body: "❌ Body manquant" };
    }

    let payload;
    try {
      payload = JSON.parse(event.body);
    } catch (parseErr) {
      console.error("❌ JSON parse error:", parseErr);
      return { statusCode: 400, body: "Invalid JSON body" };
    }

    if (payload.event !== "charge.completed") {
      return { statusCode: 200, body: "Ignored" };
    }

    const txRef = payload.data?.tx_ref;
    const txId = payload.data?.id;
    if (!txRef || !txId) {
      return { statusCode: 400, body: "Missing tx_ref or id" };
    }

    // Charger transaction interne
    const { data: pending } = await supabase
      .from("pending_payments")
      .select("*")
      .eq("tx_ref", txRef)
      .maybeSingle();

    if (!pending || pending.status === "COMPLETED") {
      return { statusCode: 200, body: "Already processed" };
    }

    // Vérification Flutterwave serveur
    const verifyResp = await fetch(
      `https://api.flutterwave.com/v3/transactions/${txId}/verify`,
      {
        headers: {
          Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}`,
        },
      }
    );
    const verifyData = await verifyResp.json();
    const tx = verifyData.data;

    if (
      tx.status !== "successful" ||
      tx.tx_ref !== txRef ||
      Number(tx.amount) !== Number(pending.amount) ||
      tx.currency !== pending.currency
    ) {
      console.error("Verification failed:", tx, pending);
      return { statusCode: 400, body: "Verification failed" };
    }

    // 💾 Transaction Supabase
    await supabase.from("transactions").insert({
      user_id: pending.user_id,
      type: "TOPUP",
      amount: pending.amount,
      currency: pending.currency,
      provider: "FLUTTERWAVE",
      tx_ref: txRef,
      status: "SUCCESS",
    });

    // 🔄 Update Firebase balance
    const userRef = admin.firestore().collection("users").doc(pending.user_id);
    await userRef.update({
      [`balances.${pending.currency}`]: admin.firestore.FieldValue.increment(pending.amount),
    });

    // ✅ Marquer paiement comme complété
    await supabase
      .from("pending_payments")
      .update({ status: "COMPLETED" })
      .eq("tx_ref", txRef);

    return { statusCode: 200, body: "OK" };
  } catch (err) {
    console.error("🔥 Webhook error:", err);
    return { statusCode: 500, body: "Server error: " + err.message };
  }
};
