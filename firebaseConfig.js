// firebaseConfig.js
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
 apiKey: "AIzaSyDKKayop62AaoC5DnYz5UuDpJIT3RBRX3M",
  authDomain: "cgsp-app.firebaseapp.com",
  projectId: "cgsp-app",
  storageBucket: "cgsp-app.appspot.com",
  messagingSenderId: "463987328508",
  appId: "1:463987328508:android:829287eef68a37af739e79"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
