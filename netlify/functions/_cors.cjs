// netlify/functions/_cors.js
// ─────────────────────────────────────────────────────────────────────────────
//  Module partagé — CORS restreint à fritok.net
//  Usage : const { getCorsHeaders, ok, err, handleOptions, isAllowedOrigin } = require('./_cors.cjs');
// ─────────────────────────────────────────────────────────────────────────────

const ALLOWED_ORIGINS = new Set([
  'https://fritok.net',
  'https://www.fritok.net',
  // Décommenter uniquement en développement local :
  // 'http://localhost:3000',
  // 'http://localhost:8888',
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

function isAllowedOrigin(origin) {
  return ALLOWED_ORIGINS.has(origin);
}

function handleOptions(origin) {
  return { statusCode: 204, headers: getCorsHeaders(origin) };
}

module.exports = { getCorsHeaders, ok, err, handleOptions, isAllowedOrigin };