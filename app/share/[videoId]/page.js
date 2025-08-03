// pages/share/[videoId].js
import Head from 'next/head';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
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

export async function getServerSideProps(context) {
  const { videoId, ref, token } = context.query;
  const docRef = doc(db, "video_playlist", videoId);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) {
    return { notFound: true };
  }

  const data = docSnap.data();
  return {
    props: {
      title: data.title,
      description: data.description,
      url: data.url,
      ref
    }
  };
}

export default function SharePage({ title, description, url, ref }) {
  return (
    <>
      <Head>
        <title>{title} - FriTok</title>
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:video" content={url} />
        <meta property="og:type" content="video.other" />
        <meta property="og:image" content="https://cdn.fritok.com/og-default.jpg" />
      </Head>
      <main>
        <h1>🎥 Produit recommandé sur FriTok</h1>
        <h2>{title}</h2>
        <p>{description}</p>
        <video controls src={url}></video>
        <p>Recommandé par : {ref}</p>
      </main>
    </>
  );
}
