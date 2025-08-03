import { doc, getDoc, getFirestore } from 'firebase/firestore';
import { initializeApp } from 'firebase/app';
import BuyPageClient from './BuyPageClient';

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

export const dynamic = 'force-dynamic';

export default async function Page({ params, searchParams }) {
  const { videoId } = params;
  const { ref, token } = searchParams;

  const docRef = doc(db, "video_playlist", videoId);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) {
    return (
      <main style={{ textAlign: 'center', padding: '2rem' }}>
        <h1>❌ Produit introuvable</h1>
        <p>Aucune vidéo ou produit ne correspond à cet identifiant.</p>
      </main>
    );
  }

  const data = docSnap.data();

  return (
    <BuyPageClient
      title={data.title}
      description={data.description}
      videoUrl={data.url}
      thumbnail={data.thumbnail || null}
      price={data.price || "4.99 €"}
      referrer={ref}
      token={token}
    />
  );
}

