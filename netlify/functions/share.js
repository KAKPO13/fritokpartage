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
    // 🔎 Lecture des paramètres de manière robuste
    let params =
      event.queryStringParameters ||
      event.multiValueQueryStringParameters ||
      {};

    // Si vide, parser l'URL brute
    if (!params.videoId && event.rawUrl) {
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

    // ✅ Redirection HTTP standard
    return {
      statusCode: 302,
      headers: {
        Location: `/share/${videoId}?ref=${ref || "direct"}&token=${token || "none"}`,
      },
      body: "",
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
