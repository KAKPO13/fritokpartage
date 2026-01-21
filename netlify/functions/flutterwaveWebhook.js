const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event, context) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  try {
    const payload = JSON.parse(event.body);

    // Vérification signature Flutterwave
    const signature = event.headers["verif-hash"];
    if (signature !== process.env.FLUTTERWAVE_WEBHOOK_SECRET) {
      return { statusCode: 401, body: "Unauthorized" };
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

    // Transaction + wallet update
    await supabase.from("transactions").insert({
      user_id: pending.user_id,
      type: "TOPUP",
      amount: pending.amount,
      currency: pending.currency,
      provider: "FLUTTERWAVE",
      tx_ref: txRef,
      status: "SUCCESS",
    });

    // ⚠️ Ici, si tes soldes sont dans Firebase, remplace l’appel RPC par Firebase Admin SDK
    // await supabase.rpc("increment_wallet", { … });

    await supabase
      .from("pending_payments")
      .update({ status: "COMPLETED" })
      .eq("tx_ref", txRef);

    return { statusCode: 200, body: "OK" };
  } catch (err) {
    console.error("🔥 Webhook error:", err);
    return { statusCode: 500, body: "Server error" };
  }
};
