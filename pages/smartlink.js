import { getFirestore, doc, getDoc } from 'firebase/firestore';
import { initializeApp } from 'firebase/app';
import VideoCard from '../components/VideoCard';
import dynamic from 'next/dynamic';
const MiniChat = dynamic(() => import('../app/share/[videoId]/MiniChat'), { ssr: false });
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

export async function getServerSideProps(context) {
  const { videos, ref, token } = context.query;

  const videoData = [];

  if (videos) {
    const videoIds = videos.split(',');

    for (const id of videoIds) {
      try {
        const docRef = doc(db, 'video_playlist', id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          videoData.push({ id, ...docSnap.data() });
        }
      } catch (error) {
        console.error(`Erreur Firestore pour ${id}:`, error);
      }
    }
  }

  return {
    props: {
      videoData,
      ref: ref || null,
      token: token || null,
    },
  };
}

export default function SmartlinkPage({ videoData, ref, token }) {
  const data = videoData[0];

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

      <main style={{
  padding: '2rem',
  fontFamily: 'sans-serif',
  maxWidth: '800px',
  margin: '0 auto'
}}>
  <h1 style={{ fontSize: '2rem', marginBottom: '1rem' }}>🎥 Vidéos partagées</h1>

  {ref && (
    <p style={{ marginBottom: '0.5rem' }}>
      🔗 <strong>Partagé par :</strong> <span style={{ color: '#007E33' }}>{ref}</span>
    </p>
  )}

  {token && (
    <p style={{ marginBottom: '1.5rem' }}>
      🧩 <strong>Jeton de session :</strong> <code>{token}</code>
    </p>
  )}

  {videoData.length === 0 ? (
    <p style={{ fontStyle: 'italic', color: '#999' }}>Aucune vidéo trouvée.</p>
  ) : (
    <>
      {videoData.map((video) => (
        <div key={video.id} style={{ marginBottom: '2rem' }}>
          <VideoCard video={video} referrer={ref} token={token} />
        </div>
      ))}

      <section style={{ marginTop: '3rem' }}>
        <MiniChat videoId={videoData[0].id} />
      </section>
    </>
  )}
</main>

    </>
  );
}

