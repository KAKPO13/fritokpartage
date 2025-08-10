import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, where, getDocs } from 'firebase/firestore';
import { NextResponse } from 'next/server';

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
  const { vendorId } = params;

  try {
    const q = query(collection(db, 'video_playlist'), where('vendorId', '==', vendorId));
    const querySnapshot = await getDocs(q);
    const videos = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    return NextResponse.json({ success: true, videos });
  } catch (error) {
    console.error('Erreur lors de la récupération des vidéos :', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
