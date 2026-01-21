import { serve } from "https://deno.land/std/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    // 🔐 Vérification signature Flutterwave
    const signature = req.headers.get("verif-hash");
    if (signature !== Deno.env.get("FLUTTERWAVE_WEBHOOK_SECRET")) {
      return new Response("Unauthorized", { status: 401 });
    }

    const payload = await req.json();
    if (payload.event !== "charge.completed") {
      return new Response("Ignored", { status: 200 });
    }

    const txRef = payload.data?.tx_ref;
    const txId = payload.data?.id;
    if (!txRef || !txId) {
      return new Response("Missing tx_ref or id", { status: 400 });
    }

     const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

      if (!supabaseUrl || !supabaseKey) {
        throw new Error("Missing Supabase environment variables");
      }


    // 🔎 Charger transaction interne
    const { data: pending } = await supabase
      .from("pending_payments")
      .select("*")
      .eq("tx_ref", txRef)
      .maybeSingle();

    if (!pending || pending.status === "COMPLETED") {
      return new Response("Already processed", { status: 200 });
    }

    // 🔐 Vérification Flutterwave serveur
    const verifyResp = await fetch(
      `https://api.flutterwave.com/v3/transactions/${txId}/verify`,
      {
        headers: {
          Authorization: `Bearer ${Deno.env.get("FLUTTERWAVE_SECRET_KEY")}`,
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
      return new Response("Verification failed", { status: 400 });
    }

    // 💾 Transaction + wallet update atomique
    await supabase.from("transactions").insert({
      user_id: pending.user_id,
      type: "TOPUP",
      amount: pending.amount,
      currency: pending.currency,
      provider: "FLUTTERWAVE",
      tx_ref: txRef,
      status: "SUCCESS",
    });

    await supabase.rpc("increment_wallet", {
      uid: pending.user_id,
      currency_code: pending.currency,
      amount_value: pending.amount,
    });

    await supabase
      .from("pending_payments")
      .update({ status: "COMPLETED" })
      .eq("tx_ref", txRef);

    return new Response("OK", { status: 200 });

  } catch (err) {
    console.error("🔥 Webhook error:", err);
    return new Response("Server error", { status: 500 });
  }
});
