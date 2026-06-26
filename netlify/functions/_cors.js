// netlify/functions/_cors.js
// ─────────────────────────────────────────────────────────────────────────────
//  Module partagé — CORS restreint à fritok.net
//  Usage : const { getCorsHeaders, ok, err, handleOptions } = require('./_cors');
// ─────────────────────────────────────────────────────────────────────────────

const ALLOWED_ORIGINS = new Set([
  'https://fritok.net',
  'https://www.fritok.net',
  // Décommenter uniquement en développement local :
  // 'http://localhost:3000',
  /// 'http://localhost:8888',
]);

function getCorsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.has(origin) ? origin : 'https://fritok.net';
  return {
    'Access-Control-Allow-Origin'      : allowed,
    'Access-Control-Allow-Headers'     : 'Authorization, Content-Type',
    'Access-Control-Allow-Methods'     : 'POST, OPTIONS',
    'Access-Control-Allow-Credentials' : 'true',
    'Vary'                             : 'Origin',
    'Content-Type'                     : 'application/json',
  };
}

function ok(body, origin) {
  return { statusCode: 200, headers: getCorsHeaders(origin), body: JSON.stringify(body) };
}

function err(code, msg, origin) {
  return { statusCode: code, headers: getCorsHeaders(origin), body: JSON.stringify({ error: msg }) };
}

function handleOptions(origin) {
  return { statusCode: 204, headers: getCorsHeaders(origin) };
}

function isAllowedOrigin(origin) {
  return ALLOWED_ORIGINS.has(origin);
}

module.exports = { getCorsHeaders, ok, err, handleOptions, isAllowedOrigin };


// ─────────────────────────────────────────────────────────────────────────────
// netlify/functions/_constants.js
// ─────────────────────────────────────────────────────────────────────────────
//  Constantes partagées entre toutes les Netlify Functions.
//  Source unique de vérité — ne jamais dupliquer ces valeurs.
// ─────────────────────────────────────────────────────────────────────────────

// UID du compte Escrow Fritok dans Firestore users/{ESCROW_UID}
const ESCROW_UID = 'escrow_fritok';

// Devises supportées
const SUPPORTED_CURRENCIES = ['XOF', 'GHS', 'NGN'];

// Nombre max de locations actives simultanées par utilisateur
const MAX_ACTIVE_RENTALS = 2;

// Durée max d'un verrou de paiement en attente (30 minutes)
const PENDING_PAYMENT_TTL_MS = 30 * 60 * 1000;

module.exports = {
  ESCROW_UID,
  SUPPORTED_CURRENCIES,
  MAX_ACTIVE_RENTALS,
  PENDING_PAYMENT_TTL_MS,
};