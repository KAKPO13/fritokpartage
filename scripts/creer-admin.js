// scripts/creer-admin.js
import admin from 'firebase-admin';
import { config } from 'dotenv';
config({ path: '.env.local' });

console.log('PROJECT_ID:', process.env.FIREBASE_PROJECT_ID);
console.log('CLIENT_EMAIL:', process.env.FIREBASE_CLIENT_EMAIL);
console.log('PRIVATE_KEY existe:', !!process.env.FIREBASE_PRIVATE_KEY);

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  }),
});

const email = process.argv[2];
const password = process.argv[3];

if (!email || !password) {
  console.error('Usage : node scripts/creer-admin.js email motdepasse');
  process.exit(1);
}
if (password.length < 6) {
  console.error('Le mot de passe doit faire au moins 6 caractères (minimum imposé par Firebase Auth).');
  process.exit(1);
}

const user = await admin.auth().createUser({ email, password });
await admin.auth().setCustomUserClaims(user.uid, { admin: true });

console.log('Compte admin créé avec succès.');
console.log('UID:', user.uid);
console.log('Email:', email);
console.log('Claim admin: true');