// generate-config.js
// Ce script tourne au moment du BUILD sur Netlify.
// Il lit les variables d'environnement et génère firebase-config.js
// avec les vraies valeurs intégrées (le fichier généré n'est pas commité).

const fs = require('fs');

const required = [
  'NEXT_PUBLIC_FIREBASE_API_KEY',
  'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'NEXT_PUBLIC_FIREBASE_APP_ID',
];

// Vérifie que toutes les variables sont présentes
const missing = required.filter(k => !process.env[k]);
if (missing.length) {
  console.error('❌ Variables Firebase manquantes dans Netlify :', missing.join(', '));
  process.exit(1);
}

const config = `
// ⚠️ FICHIER GÉNÉRÉ AUTOMATIQUEMENT — NE PAS COMMITER
// Généré par generate-config.js lors du build Netlify

window.__FIREBASE_CONFIG__ = {
  apiKey:            "${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}",
  authDomain:        "${process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN}",
  projectId:         "${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}",
  storageBucket:     "${process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET}",
  messagingSenderId: "${process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID}",
  appId:             "${process.env.NEXT_PUBLIC_FIREBASE_APP_ID}",
};
`.trim();

fs.writeFileSync('firebase-config.js', config, 'utf8');
console.log('✅ firebase-config.js généré avec succès.');