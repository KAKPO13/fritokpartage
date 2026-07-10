import { RtcTokenBuilder, RtcRole } from 'agora-token';
import { NextResponse } from 'next/server';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

/**
 * GET /api/agora-token?channelId=...
 *
 * Mise à jour (juillet 2026) — la version précédente délivrait un token
 * Agora valide 2h pour N'IMPORTE QUEL channelId, sans aucune vérification :
 * un client pouvait donc obtenir un token pour un canal inventé ou pour un
 * live déjà terminé. Conséquences concrètes :
 *   1. Abus de facturation Agora — chaque token + connexion consomme du
 *      temps d'usage facturé (RtcTokenBuilder + join sont gratuits à
 *      appeler, mais la connexion RTC qui suit est facturée par Agora).
 *   2. Aucune garantie que le canal correspond à un live réel : un
 *      attaquant pouvait rejoindre n'importe quel canal Agora existant
 *      côté hôte simplement en devinant/récupérant un channelId.
 *
 * Corrigé en ajoutant : (a) une vérification Firestore que le live existe
 * et est actuellement diffusé (isLive === true) avant de générer le token,
 * (b) un anti-abus basique par IP.
 */

// ── Init Firebase Admin (idempotent — évite la ré-init sur invocations à chaud) ──
// ⚠️ Si un module d'init Admin SDK partagé existe déjà ailleurs dans le
// projet (utilisé par vos Netlify Functions type create-colis/start-live),
// préférez l'importer depuis là plutôt que dupliquer cette init ici — deux
// initializeApp() avec des configs différentes dans le même process
// peuvent entrer en conflit. Adapter les noms de variables d'env ci-dessous
// à ceux réellement définis dans votre projet.
if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId:   process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}
const adminDb = getFirestore();

// Token valable 2 heures
const TOKEN_EXPIRY_SECONDS = 7200;

// ── Anti-abus best-effort (mémoire du process) ───────────────────────────
// ⚠️ Sur une plateforme serverless, chaque requête peut atterrir sur une
// instance différente : cette Map ne protège que les requêtes qui
// retombent sur la même instance "chaude" (donc pas une garantie absolue).
// C'est une défense en profondeur simple à déployer immédiatement — pour
// une protection fiable et partagée entre toutes les instances, migrer
// vers un store partagé (ex. Upstash Redis) ou un rate-limit au niveau
// edge/CDN (Cloudflare, Vercel Edge Config, etc.).
const recentRequests = new Map(); // ip -> [timestamps]
const RATE_LIMIT_WINDOW_MS = 10_000;
const RATE_LIMIT_MAX = 5;

function isRateLimited(ip) {
  const now = Date.now();
  const timestamps = (recentRequests.get(ip) ?? []).filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  timestamps.push(now);
  recentRequests.set(ip, timestamps);
  // Nettoyage paresseux pour éviter une fuite mémoire sur une instance
  // longtemps chaude avec beaucoup d'IP distinctes.
  if (recentRequests.size > 5000) recentRequests.clear();
  return timestamps.length > RATE_LIMIT_MAX;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const channelId = searchParams.get('channelId');

  if (!channelId) {
    return NextResponse.json(
      { error: 'channelId requis' },
      { status: 400 }
    );
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: 'Trop de requêtes, réessayez dans quelques secondes.' },
      { status: 429 }
    );
  }

  const appId          = process.env.NEXT_PUBLIC_AGORA_APP_ID;
  const appCertificate = process.env.AGORA_APP_CERTIFICATE;

  if (!appId || !appCertificate) {
    return NextResponse.json(
      { error: 'NEXT_PUBLIC_AGORA_APP_ID ou AGORA_APP_CERTIFICATE manquant' },
      { status: 500 }
    );
  }

  // ⚠️ Vérification obligatoire AVANT de délivrer un token : le canal doit
  // correspondre à une session live_sessions réelle et actuellement
  // diffusée. Sans ce contrôle, RtcTokenBuilder générerait un token valide
  // pour n'importe quelle chaîne fournie en paramètre, live ou non.
  let session;
  try {
    const snap = await adminDb.collection('live_sessions').doc(channelId).get();
    if (!snap.exists) {
      return NextResponse.json({ error: 'Live introuvable.' }, { status: 404 });
    }
    session = snap.data();
  } catch (e) {
    console.error('Firestore lookup error (agora-token):', e);
    return NextResponse.json({ error: 'Erreur de vérification du live.' }, { status: 500 });
  }

  if (session.isLive !== true) {
    // Live terminé : pas de token émis. Évite de laisser un token valide
    // 2h pour un canal qui ne diffuse plus rien, et confirme côté serveur
    // ce que useAgoraPlayer.js applique déjà côté client (il ne tente
    // même pas de join si isLive est false).
    return NextResponse.json({ error: 'Ce live est terminé.' }, { status: 410 });
  }

  try {
    const now        = Math.floor(Date.now() / 1000);
    const expireTime = now + TOKEN_EXPIRY_SECONDS;

    // uid = 0 → token générique valable pour n'importe quel uid que le
    // SDK client assignera au join (cohérent avec client.join(app, chan,
    // token, null) dans useAgoraPlayer.js).
    const token = RtcTokenBuilder.buildTokenWithUid(
      appId,
      appCertificate,
      channelId,
      0,                   // uid spectateur
      RtcRole.SUBSCRIBER,  // rôle audience
      expireTime,
      expireTime
    );

    return NextResponse.json({ token, expireTime });
  } catch (err) {
    console.error('Agora token error:', err);
    return NextResponse.json(
      { error: 'Impossible de générer le token : ' + err.message },
      { status: 500 }
    );
  }
}