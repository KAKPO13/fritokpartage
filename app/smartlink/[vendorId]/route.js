// app/api/videos/[vendorId]/route.js

import { NextResponse } from 'next/server';
import { getFirestore, collection, query, where, getDocs } from 'firebase/firestore';
import { initializeApp } from 'firebase/app';

const firebaseConfig = {
  apiKey: "AIzaSyDKKayop62AaoC5DnYz5UuDpJIT3RBRX3M",
  authDomain: "cgsp-app.firebaseapp.com",
  projectId: "cgsp-app",
  storageBucket: "cgsp-app.appspot.com",
  messagingSenderId: "463987328508",
  appId: "1:463987328508:android:829287eef68a37af739e79"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export async function GET(request, { params }) {
  const q = query(collection(db, 'video_playlist'), where('vendorId', '==', params.vendorId));
  const querySnapshot = await getDocs(q);
  const videos = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  return NextResponse.json(videos);
}
