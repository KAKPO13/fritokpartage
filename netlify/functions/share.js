import { createClient } from "@supabase/supabase-js";
import * as admin from "firebase-admin";

// --- Supabase ---
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) throw new Error("❌ SUPABASE_URL manquant");
if (!supabaseServiceKey) throw new Error("❌ SUPABASE_SERVICE_ROLE_KEY manquant");

const supabase = createClient(supabaseUrl, supabaseServiceKey);

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

const firestore = admin.firestore();

// --- Netlify Function handler ---
export async function handler(event) {
  try {
    const { videoId, ref, token, userId } = event.queryStringParameters || {};
    if (!videoId) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "text/html" },
        body: "<h1>❌ Paramètre videoId requis</h1>",
      };
    }

    let docSnap;
    try {
      docSnap = await firestore.collection("video_playlist").doc(videoId).get();
    } catch (err) {
      console.error("🔥 Erreur Firestore:", err);
      return {
        statusCode: 500,
        headers: { "Content-Type": "text/html" },
        body: `<h1>⚠️ Vidéo trouvée mais erreur de lecture Firestore</h1>
               <p>Détails: ${err.message}</p>`,
      };
    }

    if (!docSnap.exists) {
      return {
        statusCode: 404,
        headers: { "Content-Type": "text/html" },
        body: "<h1>🎬 Vidéo introuvable</h1><p>Le document n'existe pas dans Firestore.</p>",
      };
    }

    const data = docSnap.data() || {};

    // Log event dans Supabase si paramètres présents
    if (token && ref && userId) {
      await supabase.from("share_events").insert([{
        video_id: videoId,
        referrer: ref,
        token,
        user_id: userId,
        timestamp: new Date().toISOString(),
        title: data.title || "Sans titre",
        image_url: data.thumbnail || "",
        price: data.price || 0,
      }]);
    }

    // Page HTML avec redirection
    const html = `
      <html>
        <head>
          <title>${data.title || "Vidéo"}</title>
          <meta property="og:title" content="${data.title || "Vidéo"}" />
          <meta property="og:description" content="${data.description || "Découvrez cette vidéo sur FriTok."}" />
          <meta property="og:image" content="${data.thumbnail || ""}" />
          <meta http-equiv="refresh" content="0; url=/share/${videoId}?ref=${ref || "direct"}&token=${token || "none"}" />
        </head>
        <body>
          <h1>✅ Vidéo trouvée</h1>
          <p>Redirection en cours vers la page de partage...</p>
        </body>
      </html>`;

    return {
      statusCode: 200,
      headers: { "Content-Type": "text/html" },
      body: html,
    };
  } catch (err) {
    console.error("🔥 Server error:", err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "text/html" },
      body: `<h1>❌ Erreur interne</h1><p>${err.message}</p>`,
    };
  }
}
