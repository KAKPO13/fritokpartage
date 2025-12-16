import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  const { phone, amount, reference } = await req.json();
  console.log("📲 Paiement reçu:", { phone, amount, reference });

  const MOMO_SUBSCRIPTION_KEY = Deno.env.get("MOMO_SUBSCRIPTION_KEY");
  const MOMO_API_USER = Deno.env.get("MOMO_API_USER");
  const MOMO_API_KEY = Deno.env.get("MOMO_API_KEY");
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  const firestoreToken = await getFirestoreAccessToken();
  const firestoreProjectId = Deno.env.get("FIRESTORE_PROJECT_ID");

  const momoReferenceId = crypto.randomUUID();
  const userId = "anonymous"; // 👤 Aucun token requis

  try {
    const tokenRes = await fetch("https://sandbox.momodeveloper.mtn.com/collection/token/", {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": MOMO_SUBSCRIPTION_KEY!,
        Authorization: `Basic ${btoa(`${MOMO_API_USER}:${MOMO_API_KEY}`)}`,
      },
    });

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;
    console.log("🔐 Token MoMo obtenu");

    const paymentRes = await fetch("https://sandbox.momodeveloper.mtn.com/collection/v1/requesttopay", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "X-Reference-Id": momoReferenceId,
        "X-Target-Environment": "sandbox",
        "Ocp-Apim-Subscription-Key": MOMO_SUBSCRIPTION_KEY!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount,
        currency: "XOF",
        externalId: reference,
        payer: { partyIdType: "MSISDN", partyId: phone },
        payerMessage: "Paiement FriTok",
        payeeNote: "FriTok",
      }),
    });

    const status = paymentRes.status;
    const result = await paymentRes.json();
    console.log("📦 Réponse MoMo:", result);

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
    const { error } = await supabase.from("payments").insert([{
      user_id: userId,
      phone,
      amount: parseFloat(amount),
      reference,
      status_code: status,
      momo_response: JSON.stringify(result),
      momo_reference_id: momoReferenceId,
      is_simulated: false,
    }]);

    if (error) {
      console.error("❌ Erreur d’insertion Supabase :", error.message);
    }

    await updateFirestoreTransaction(reference, status === 202 ? "PENDING" : "FAILED", userId, firestoreToken, firestoreProjectId, momoReferenceId);

    return new Response(JSON.stringify({ status, result, userId }), {
      headers: { "Content-Type": "application/json" },
      status,
    });
  } catch (err) {
    console.error("❌ Erreur lors du paiement MoMo :", err);
    return new Response(JSON.stringify({ error: "Échec du paiement MoMo", details: err.message }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    });
  }
});

// 🔐 Génération du token OAuth2 via Service Account
async function getFirestoreAccessToken(): Promise<string> {
  const GOOGLE_CLIENT_EMAIL = Deno.env.get("GOOGLE_CLIENT_EMAIL");
  const GOOGLE_PRIVATE_KEY = Deno.env.get("GOOGLE_PRIVATE_KEY")?.replace(/\\n/g, "\n");
  if (!GOOGLE_PRIVATE_KEY || GOOGLE_PRIVATE_KEY.length < 100) {
  console.error("❌ Clé privée Google manquante ou trop courte");
  return new Response(JSON.stringify({ error: "Clé privée Google invalide" }), {
    status: 500,
    headers: { "Content-Type": "application/json" },
  });
}

  const jwtHeader = { alg: "RS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const jwtPayload = {
    iss: GOOGLE_CLIENT_EMAIL,
    scope: "https://www.googleapis.com/auth/datastore",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };

  const encoder = new TextEncoder();
  const headerBase64 = btoa(JSON.stringify(jwtHeader));
  const payloadBase64 = btoa(JSON.stringify(jwtPayload));
  const toSign = `${headerBase64}.${payloadBase64}`;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    encoder.encode(GOOGLE_PRIVATE_KEY!),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, encoder.encode(toSign));
  const jwt = `${toSign}.${btoa(String.fromCharCode(...new Uint8Array(signature)))}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  const data = await res.json();
  return data.access_token;
}

// 🔄 Mise à jour Firestore
async function updateFirestoreTransaction(reference: string, status: string, userId: string, token: string, projectId: string, momoReferenceId: string) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/transactions/${reference}`;
  const body = {
    fields: {
      reference: { stringValue: reference },
      status: { stringValue: status },
      user_id: { stringValue: userId },
      momo_reference_id: { stringValue: momoReferenceId },
      updated_at: { timestampValue: new Date().toISOString() }
    }
  };

  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    console.error("❌ Échec de mise à jour Firestore :", await res.text());
  }
}
