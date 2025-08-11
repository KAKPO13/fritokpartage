import { getFirestore, doc, getDoc } from 'firebase/firestore';
import { initializeApp } from 'firebase/app';
import VideoCard from '../../components/VideoCard'; // adapte selon l'emplacement du fichier
import React from 'react';
import Head from 'next/head';

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

export default async function SmartlinkPage({ searchParams }) {
  const { videos, ref, token } = searchParams;

  if (!videos) {
    return (
      <main style={{ padding: '2rem', textAlign: 'center' }}>
        <h1>📭 Aucun contenu partagé</h1>
        <p>Ce lien ne contient pas de vidéos à afficher.</p>
      </main>
    );
  }

  const videoIds = videos.split(',');
  const videoData = [];

  for (const id of videoIds) {
    const docRef = doc(db, 'video_playlist', id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      videoData.push({ id, ...docSnap.data() });
    }
  }

  const data = videoData[0]; // première vidéo pour les métadonnées

  return (
    <>
      <Head>
        <title>{data?.title || 'Vidéos partagées | FriTok'}</title>
        <meta name="description" content={data?.description || 'Découvrez les vidéos partagées via FriTok.'} />
        <meta property="og:title" content={data?.title || 'Vidéos partagées'} />
        <meta property="og:description" content={data?.description || 'Découvrez les vidéos partagées via FriTok.'} />
        <meta property="og:image" content={data?.thumbnail || '/default-thumbnail.jpg'} />
        <meta property="og:type" content="video.other" />
        <meta property="og:url" content={`https://fritok.netlify.app/video/${data?.id || 'shared'}`} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={data?.title || 'Vidéos partagées'} />
        <meta name="twitter:description" content={data?.description || 'Découvrez les vidéos partagées via FriTok.'} />
        <meta name="twitter:image" content={data?.thumbnail || '/default-thumbnail.jpg'} />
      </Head>

      <main style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
        <h1>🎥 Vidéos partagées</h1>
        {ref && <p>🔗 Partagé par : <strong>{ref}</strong></p>}
        {token && <p>🧩 Jeton de session : <code>{token}</code></p>}

        {videoData.length === 0 ? (
          <p>Aucune vidéo trouvée.</p>
        ) : (
          videoData.map((video) => (
            <VideoCard key={video.id} video={video} referrer={ref} token={token} />
          ))
        )}
      </main>
    </>
  );
}

