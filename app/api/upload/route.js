// app/api/upload/route.js   (Next.js 13+ App Router)
// OU pages/api/upload.js    (Pages Router — voir note en bas)
//
// Cette route reçoit le fichier depuis le navigateur,
// vérifie le token Firebase côté serveur,
// puis relaie l'upload vers le worker Cloudflare R2.
// → Aucun problème CORS car c'est un appel serveur→serveur.

import { adminAuth } from "@/lib/firebaseAdmin";
import { NextResponse } from "next/server";

const WORKER_URL = "https://divine-haze-26a2.fritok013.workers.dev";

export const runtime = "nodejs"; // le streaming de gros fichiers nécessite Node
export const maxDuration = 60;   // 60 s max (augmente si vidéos très lourdes)

// Désactive le body parser Next.js pour recevoir le binaire brut
export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    // ── 1. Vérification du token Firebase ──────────────────
    const authHeader = request.headers.get("authorization") ?? "";
    const token = authHeader.replace("Bearer ", "").trim();

    if (!token) {
      return NextResponse.json({ success: false, error: "Token manquant" }, { status: 401 });
    }

    let decodedToken;
    try {
      decodedToken = await adminAuth.verifyIdToken(token);
    } catch {
      return NextResponse.json({ success: false, error: "Token invalide" }, { status: 403 });
    }

    const userId = decodedToken.uid;

    // ── 2. Paramètres de l'upload ───────────────────────────
    const { searchParams } = new URL(request.url);
    const filePath    = searchParams.get("filePath");
    const contentType = searchParams.get("contentType");

    if (!filePath || !contentType) {
      return NextResponse.json(
        { success: false, error: "filePath et contentType requis" },
        { status: 400 }
      );
    }

    // Vérification de sécurité : le filePath doit appartenir à l'uid
    if (!filePath.includes(userId)) {
      return NextResponse.json({ success: false, error: "Accès refusé" }, { status: 403 });
    }

    // ── 3. Lecture du corps binaire ─────────────────────────
    const fileBuffer = await request.arrayBuffer();

    if (fileBuffer.byteLength === 0) {
      return NextResponse.json({ success: false, error: "Fichier vide" }, { status: 400 });
    }

    // ── 4. Relais vers le worker Cloudflare R2 ──────────────
    //    Le worker reçoit exactement le même appel qu'en Flutter.
    const workerRes = await fetch(
      `${WORKER_URL}?filePath=${encodeURIComponent(filePath)}&contentType=${encodeURIComponent(contentType)}`,
      {
        method:  "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type":  contentType,
        },
        body: fileBuffer,
        // @ts-ignore — nécessaire pour les gros fichiers avec Node fetch
        duplex: "half",
      }
    );

    const workerData = await workerRes.json();

    if (!workerData.success) {
      return NextResponse.json(
        { success: false, error: workerData.error ?? "Échec worker" },
        { status: 502 }
      );
    }

    return NextResponse.json({ success: true, url: workerData.url });

  } catch (err) {
    console.error("[upload] Erreur serveur :", err);
    return NextResponse.json(
      { success: false, error: err.message ?? "Erreur serveur" },
      { status: 500 }
    );
  }
}

// ─────────────────────────────────────────────────────────────
// NOTE — Pages Router (pages/api/upload.js)
// Si tu utilises encore le Pages Router, remplace tout ce fichier par :
//
// import { adminAuth } from "@/lib/firebaseAdmin";
//
// export const config = { api: { bodyParser: false } };
//
// export default async function handler(req, res) {
//   if (req.method !== "POST") return res.status(405).end();
//   // ... même logique avec req/res au lieu de Request/NextResponse
// }
// ─────────────────────────────────────────────────────────────