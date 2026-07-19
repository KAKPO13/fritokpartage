import admin from 'firebase-admin';
import 'dotenv/config';

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  }),
});

const email = process.argv[2]; // récupère l'email passé en argument
if (!email) {
  console.error('Usage : node scripts/verifier-claim.js ton-email@fritok.net');
  process.exit(1);
}

const user = await admin.auth().getUserByEmail(email);
console.log('UID:', user.uid);
console.log('Custom claims:', user.customClaims);