// format-firebase-key.js
const fs = require("fs");

// Lis ton fichier JSON de service account
const serviceAccount = JSON.parse(fs.readFileSync("serviceAccount.json", "utf8"));

// Récupère la clé privée
const rawKey = serviceAccount.private_key;

// Transforme les vrais retours à la ligne en "\n"
const formattedKey = rawKey.replace(/\n/g, "\\n");

// Affiche la valeur prête à coller dans Netlify
console.log("FIREBASE_PRIVATE_KEY=");
console.log(formattedKey);
