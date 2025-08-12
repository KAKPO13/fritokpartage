// firebaseConfig.js
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';

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

// Initialiser Firebase
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

// Exporter les services
export const db = getFirestore(app);
export const functions = getFunctions(app); // ✅ Ajout des fonctions cloud

