import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  const { reference } = await req.json();
  console.log("🔍 Vérification du paiement pour:", reference);

  const MOMO_SUBSCRIPTION_KEY = Deno.env.get("MOMO_SUBSCRIPTION_KEY");
  const MOMO_API_USER = Deno.env.get("MOMO_API_USER");
  const MOMO_API_KEY = Deno.env.get("MOMO_API_KEY");
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  const tokenUrl = "https://sandbox.momodeveloper.mtn.com/collection/token/";
  const authHeaderMoMo = `Basic ${btoa(`${MOMO_API_USER}:${MOMO_API_KEY}`)}`;

  try {
    const tokenRes = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": MOMO_SUBSCRIPTION_KEY!,
        Authorization: authHeaderMoMo,
      },
    });

    if (!tokenRes.ok) throw new Error("Échec de l'obtention du token MoMo");

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;
    console.log("🔐 Token MoMo obtenu");

    const statusUrl = `https://sandbox.momodeveloper.mtn.com/collection/v1/requesttopay/${reference}`;
    const statusRes = await fetch(statusUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "X-Target-Environment": "sandbox",
        "Ocp-Apim-Subscription-Key": MOMO_SUBSCRIPTION_KEY!,
      },
    });

    if (!statusRes.ok) throw new Error(`Échec de récupération du statut MoMo: ${statusRes.status}`);

    const statusData = await statusRes.json();
    const paymentStatus = statusData.status || "UNKNOWN";
    console.log("📦 Statut MoMo:", paymentStatus);

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    const { error } = await supabase
      .from("payments")
      .update({
        momo_response: JSON.stringify(statusData),
        status_code: statusRes.status,
        payment_status: paymentStatus,
        updated_at: new Date().toISOString(),
        is_simulated: false,
      })
      .eq("reference", reference);

    if (error) {
      console.error("❌ Erreur mise à jour Supabase:", error.message);
    } else {
      console.log("✅ Paiement mis à jour dans Supabase");
    }

    return new Response(JSON.stringify({ status: statusRes.status, data: statusData }), {
      headers: { "Content-Type": "application/json" },
      status: statusRes.status,
    });
  } catch (err) {
    console.error("❌ Erreur MoMo:", err);
    return new Response(JSON.stringify({ error: "Échec de la vérification MoMo", details: err.message }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    });
  }
});
