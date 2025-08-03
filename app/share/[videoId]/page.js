import { doc, getDoc, getFirestore, collection, getDocs } from 'firebase/firestore';
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

export async function generateStaticParams() {
  const snapshot = await getDocs(collection(db, "video_playlist"));
  const params = [];

  snapshot.forEach(doc => {
    params.push({ videoId: doc.id });
  });

  return params;
}

export const dynamic = 'force-static';

export default async function Page({ params, searchParams }) {
  const { videoId } = params;
  const { ref, token } = searchParams;

  const docRef = doc(db, "video_playlist", videoId);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) {
    return <h1>404 - Vidéo introuvable</h1>;
  }

  const data = docSnap.data();

  return (
    <>
      <head>
        <title>{data.title} - FriTok</title>
        <meta property="og:title" content={data.title} />
        <meta property="og:description" content={data.description} />
        <meta property="og:video" content={data.url} />
        <meta property="og:type" content="video.other" />
        <meta property="og:image" content="https://cdn.fritok.com/og-default.jpg" />
      </head>
      <main>
        <h1>🎥 Produit recommandé sur FriTok</h1>
        <h2>{data.title}</h2>
        <p>{data.description}</p>
        <video controls src={data.url}></video>
        <p>Recommandé par : {ref}</p>
      </main>
    </>
  );
}

