import { createClient } from "@supabase/supabase-js";
import * as admin from "firebase-admin";

// --- Supabase ---
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) throw new Error("❌ SUPABASE_URL manquant");
if (!supabaseServiceKey) throw new Error("❌ SUPABASE_SERVICE_ROLE_KEY manquant");

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// --- Firebase Admin ---
const privateKey = process.env.NEXT_PUBLIC_FIREBASE_PRIVATE_KEY;
if (!privateKey) throw new Error("❌ FIREBASE_PRIVATE_KEY manquant");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
      clientEmail: process.env.NEXT_PUBLIC_FIREBASE_CLIENT_EMAIL || "",
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
      return { statusCode: 400, body: "❌ videoId requis" };
    }

    const docSnap = await firestore.collection("video_playlist").doc(videoId).get();
    if (!docSnap.exists) {
      return { statusCode: 404, body: "Vidéo introuvable" };
    }

    const data = docSnap.data() || {};

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

    const html = `
      <html>
        <head>
          <title>${data.title || "Vidéo"}</title>
          <meta property="og:title" content="${data.title || "Vidéo"}" />
          <meta property="og:description" content="${data.description || "Découvrez cette vidéo sur FriTok."}" />
          <meta property="og:image" content="${data.thumbnail || ""}" />
          <meta http-equiv="refresh" content="0; url=/share/${videoId}?ref=${ref || "direct"}&token=${token || "none"}" />
        </head>
        <body><p>Redirection...</p></body>
      </html>`;

    return {
      statusCode: 200,
      headers: { "Content-Type": "text/html" },
      body: html,
    };
  } catch (err) {
    console.error("🔥 Server error:", err);
    return { statusCode: 500, body: "Erreur interne: " + err.message };
  }
}
