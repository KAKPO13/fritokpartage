import { createClient } from "@supabase/supabase-js";
import * as admin from "firebase-admin";

// --- Supabase ---
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// --- Firebase Admin ---
const privateKey = process.env.FIREBASE_PRIVATE_KEY;
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

export async function handler(event) {
  try {
    // 🔎 Lecture des paramètres avec fallback
    let params =
      event.queryStringParameters ||
      event.multiValueQueryStringParameters ||
      {};

    // Si videoId n'est pas dans query, récupérer depuis pathParameters
    if (!params.videoId && event.pathParameters) {
      params.videoId = event.pathParameters.videoId;
    }

    // Si toujours vide, parser l'URL brute
    if ((!params.videoId || params.videoId === "undefined") && event.rawUrl) {
      const url = new URL(event.rawUrl);
      params.videoId = url.searchParams.get("videoId");
      params.ref = url.searchParams.get("ref");
      params.token = url.searchParams.get("token");
      params.userId = url.searchParams.get("userId");
      params.debug = url.searchParams.get("debug");
    }

    const { videoId, ref, token, userId, debug } = params;

    console.log("params reçu:", params);
    console.log("videoId reçu:", videoId);

    if (!videoId || typeof videoId !== "string" || videoId.trim() === "") {
      return {
        statusCode: 400,
        headers: { "Content-Type": "text/html; charset=utf-8" },
        body: `<h1>❌ Paramètre videoId invalide</h1><p>Reçu: ${JSON.stringify(videoId)}</p>`,
      };
    }

    let docSnap;
    try {
      docSnap = await firestore.collection("video_playlist").doc(videoId).get();
    } catch (err) {
      console.error("Erreur Firestore:", err);
      return {
        statusCode: 500,
        headers: { "Content-Type": "text/html; charset=utf-8" },
        body: `<h1>⚠️ Vidéo trouvée mais erreur de lecture Firestore</h1><p>${err.message}</p>`,
      };
    }

    if (!docSnap.exists) {
      return {
        statusCode: 404,
        headers: { "Content-Type": "text/html; charset=utf-8" },
        body: `<h1>🎬 Vidéo introuvable</h1><p>videoId: ${videoId}</p>`,
      };
    }

    const data = docSnap.data() || {};

    if (debug === "true") {
      return {
        statusCode: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
        body: `<h1>🔎 Debug Mode</h1>
               <p>videoId: ${videoId}</p>
               <p>ref: ${ref}</p>
               <p>token: ${token}</p>
               <p>userId: ${userId}</p>
               <p>title: ${data.title}</p>`,
      };
    }

    // ✅ Partie HTML avec balises OG + lien de secours
    const html = `
      <html>
        <head>
          <meta charset="UTF-8" />
          <title>${data.title || "Vidéo"}</title>
          <meta property="og:title" content="${data.title || "Vidéo"}" />
          <meta property="og:description" content="${data.description || "Découvrez cette vidéo sur FriTok."}" />
          <meta property="og:image" content="${data.thumbnail || ""}" />
        </head>
        <body>
          <h1>✅ Vidéo trouvée</h1>
          <p>Redirection en cours vers la page de partage...</p>
          <p><a href="/share/${videoId}?ref=${ref || "direct"}&token=${token || "none"}">
            Cliquez ici si la redirection ne fonctionne pas
          </a></p>
        </body>
      </html>`;

    // ✅ Redirection HTTP standard + fallback HTML
    return {
      statusCode: 302,
      headers: {
        Location: `/share/${videoId}?ref=${ref || "direct"}&token=${token || "none"}`,
        "Content-Type": "text/html; charset=utf-8",
      },
      body: html,
    };
  } catch (err) {
    console.error("Erreur interne:", err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "text/html; charset=utf-8" },
      body: `<h1>❌ Erreur interne</h1><p>${err.message}</p>`,
    };
  }
}
