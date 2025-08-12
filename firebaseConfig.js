// firebaseConfig.js
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyARds0nMh9M1KBSPiCVrmCtH9IVEh4x5CI",
  authDomain: "cgsp-app.firebaseapp.com",
  databaseURL: "https://cgsp-app-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "cgsp-app",
  storageBucket: "cgsp-app.appspot.com",
  messagingSenderId: "463987328508",
  appId: "1:463987328508:web:dc6c86e684a04b45739e79",
  measurementId: "G-R5MKMQKBWH"
};

// ✅ Vérifie si une app Firebase existe déjà
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

const db = getFirestore(app);

export { db };