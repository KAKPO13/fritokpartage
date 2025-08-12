import { db } from '../firebaseConfig'; // ✅ Utilise ton fichier existant
import { doc, getDoc, collection, addDoc } from 'firebase/firestore';
import VideoCard from '../components/VideoCard';
import dynamic from 'next/dynamic';
const MiniChat = dynamic(() => import('../app/share/[videoId]/MiniChat'), { ssr: false });
import Head from 'next/head';


async function logClick(videoId, referrer, token) {
  try {
    const logRef = collection(db, 'click_logs');
    await addDoc(logRef, {
      videoId,
      referrer: referrer || null,
      token: token || null,
      timestamp: new Date().toISOString(),
    });
    console.log('✅ Clic enregistré');
  } catch (error) {
    console.error('❌ Erreur lors de l’enregistrement du clic :', error);
  }
}


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
         <section style={{ marginTop: '3rem' }}>
        <MiniChat videoId={videoData[0].id} />
      </section>
      </main>
    </>
  );
}

