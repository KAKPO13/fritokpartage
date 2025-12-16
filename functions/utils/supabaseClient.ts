import { serve } from "https://deno.land/std@0.192.0/http/server.ts"
import { verifyFirebaseToken } from "../utils/auth/verifyFirebaseToken.ts"
import { getOrCreateProfile, updateLastLogin, updatePreferences } from "../utils/supabaseClient.ts"

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Méthode non autorisée" }), { status: 405 })
  }

  const authHeader = req.headers.get("Authorization")
  const token = authHeader?.startsWith("Bearer ") ? authHeader.replace("Bearer ", "").trim() : null
  if (!token) {
    return new Response(JSON.stringify({ error: "Token Firebase manquant" }), { status: 401 })
  }

  let uid = ""
  let email = ""

  try {
    // 🔐 Vérification complète du token Firebase
    const verified = await verifyFirebaseToken(token)
    uid = verified.uid
    email = verified.email ?? ""

    const body = await req.json()
    const user = body.profile

    if (!user || !user.personality || !user.preferences?.length || !user.occasion) {
      return new Response(JSON.stringify({ error: "Paramètres utilisateur incomplets" }), { status: 400 })
    }

    // 🧾 Audit
    console.log(`[${new Date().toISOString()}] Requête UID=${uid}, Email=${email} :`, user)

    // 🔄 Synchronisation Supabase
    await getOrCreateProfile(uid, email)
    await updateLastLogin(uid)
    await updatePreferences(uid, user.preferences)

    // 💡 Recommandation (OpenAI ou fallback local)
    // ... (ton code de génération de recommandation ici)

    return new Response(JSON.stringify({ recommendation: { name: "Bleu de Chanel", description: "Exemple de réponse" } }), {
      headers: { "Content-Type": "application/json" }
    })

  } catch (err) {
    console.error("❌ Erreur traitement requête :", err)
    return new Response(JSON.stringify({ error: err.message }), { status: 401 })
  }
})
