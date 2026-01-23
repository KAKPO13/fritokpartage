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
    const { videoId, ref, token, userId, debug } = event.queryStringParameters || {};
    if (!videoId) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "text/html; charset=utf-8" },
        body: "<h1>❌ Paramètre videoId requis</h1>",
      };
    }

    let docSnap;
    try {
      docSnap = await firestore.collection("video_playlist").doc(videoId).get();
    } catch (err) {
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
        body: "<h1>🎬 Vidéo introuvable</h1><p>Le document n'existe pas dans Firestore.</p>",
      };
    }

    const data = docSnap.data() || {};

    // Mode debug : afficher les infos sans redirection
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

    // Sinon, page avec redirection
    const html = `
      <html>
        <head>
          <meta charset="UTF-8" />
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
      headers: { "Content-Type": "text/html; charset=utf-8" },
      body: html,
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "text/html; charset=utf-8" },
      body: `<h1>❌ Erreur interne</h1><p>${err.message}</p>`,
    };
  }
}
