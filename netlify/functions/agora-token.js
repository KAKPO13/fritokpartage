// netlify/functions/agora-token.js
// ─────────────────────────────────────────────────────────────
// Correction CORS : accepte fritok.net + localhost en dev
// ─────────────────────────────────────────────────────────────
const { RtcTokenBuilder, RtcRole } = require("agora-access-token");

// Origines autorisées
const ALLOWED_ORIGINS = [
  "https://fritok.net",
  "https://www.fritok.net",
  "http://localhost:3000",
  "http://localhost:3001",
];

exports.handler = async (event, context) => {
  const origin = event.headers?.origin || event.headers?.Origin || "";

  // Header CORS : origin exact si dans la liste, sinon premier de la liste
  const allowOrigin = ALLOWED_ORIGINS.includes(origin)
    ? origin
    : ALLOWED_ORIGINS[0];

  const corsHeaders = {
    "Access-Control-Allow-Origin":  allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age":       "86400",
  };

  // ── Preflight OPTIONS (navigateur envoie ça avant POST) ──────
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: corsHeaders,
      body: "",
    };
  }

  // ── Vérification credentials ──────────────────────────────────
  const appId          = process.env.AGORA_APP_ID;
  const appCertificate = process.env.AGORA_APP_CERTIFICATE;

  if (!appId || !appCertificate) {
    return {
      statusCode: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Missing Agora credentials" }),
    };
  }

  // ── Génération du token ───────────────────────────────────────
  try {
    const { channelName, uid, role = "PUBLISHER" } = JSON.parse(event.body);

    if (!channelName) {
      return {
        statusCode: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Channel name is required" }),
      };
    }

    const parsedUid  = Number.isInteger(uid) ? uid : 0;
    const agoraRole  = role === "SUBSCRIBER"
      ? RtcRole.SUBSCRIBER
      : RtcRole.PUBLISHER;

    const expireTimeInSeconds = 3600;
    const privilegeExpiredTs  =
      Math.floor(Date.now() / 1000) + expireTimeInSeconds;

    const token = RtcTokenBuilder.buildTokenWithUid(
      appId,
      appCertificate,
      channelName,
      parsedUid,
      agoraRole,
      privilegeExpiredTs
    );

    return {
      statusCode: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    };
  } catch (err) {
    console.error("Erreur génération token:", err);
    return {
      statusCode: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Token generation failed" }),
    };
  }
};
