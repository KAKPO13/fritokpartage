// app/api/upload/route.js
//
// NE relaie PLUS le fichier binaire.
// Génère une URL présignée R2 → le client uploade directement vers R2.
// Avantages :
//   ✅ Aucune limite de taille (Netlify bloque les body > 4.5 MB)
//   ✅ Vraie progression côté client (XHR → R2 direct)
//   ✅ Moins de bande passante serveur
//   ✅ Le token Firebase est quand même vérifié côté serveur

import { adminAuth } from "@/lib/firebaseAdmin";
import { NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── Client S3 compatible R2 ─────────────────────────────────
const R2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId:     process.env.R2_ACCESS_KEY,
    secretAccessKey: process.env.R2_SECRET_KEY,
  },
});

export async function POST(request) {
  try {
    // ── 1. Vérifie le token Firebase ────────────────────────
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

    // ── 2. Paramètres ───────────────────────────────────────
    const { searchParams } = new URL(request.url);
    const filePath    = searchParams.get("filePath");    // ex: shop-videos/uid/uuid.mp4
    const contentType = searchParams.get("contentType"); // ex: video/mp4
    const bucket      = searchParams.get("bucket");      // ex: shop-videos

    if (!filePath || !contentType || !bucket) {
      return NextResponse.json(
        { success: false, error: "filePath, contentType et bucket requis" },
        { status: 400 }
      );
    }

    // Sécurité : le chemin doit contenir l'uid de l'utilisateur connecté
    if (!filePath.includes(userId)) {
      return NextResponse.json({ success: false, error: "Accès refusé" }, { status: 403 });
    }

    // ── 3. Génère l'URL présignée R2 (valable 15 min) ──────
    const command = new PutObjectCommand({
      Bucket:      bucket,
      Key:         filePath,
      ContentType: contentType,
    });

    const presignedUrl = await getSignedUrl(R2, command, { expiresIn: 900 });

    // ── 4. URL publique du fichier après upload ─────────────
    // Format : https://pub-<hash>.r2.dev/<bucket>/<filePath relatif au bucket>
    const keyInBucket = filePath.replace(`${bucket}/`, "");
    const publicUrl   = `https://pub-ddbc1ebe88d64eaf9fa704987db262ac.r2.dev/${bucket}/${keyInBucket}`;

    return NextResponse.json({ success: true, presignedUrl, publicUrl });

  } catch (err) {
    console.error("[upload] Erreur:", err);
    return NextResponse.json(
      { success: false, error: err.message ?? "Erreur serveur" },
      { status: 500 }
    );
  }
}