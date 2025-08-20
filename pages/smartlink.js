import { useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebaseConfig';
import VideoCard from '../components/VideoCard';
import dynamic from 'next/dynamic';
import { Dialog } from '@headlessui/react';
import AddCommandeForm from '../app/capture/AddCommandeForm';
const MiniChat = dynamic(() => import('../app/share/[videoId]/MiniChat'), { ssr: false });
import Head from 'next/head';

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
  const [isOpen, setIsOpen] = useState(false);
  const data = videoData?.[0];
  const [showModal, setShowModal] = useState(true);

  return (
    <>
      <Head>
        <title>{data?.title || 'Vidéos partagées | FriTok'}</title>
        <meta name="description" content={data?.description || 'Découvrez les vidéos partagées via FriTok.'} />
        <meta property="og:title" content={data?.title || 'Vidéos partagées'} />
        <meta property="og:description" content={data?.description || 'Découvrez les vidéos partagées via FriTok.'} />
        <meta property="og:image" content={data?.thumbnail || '/default-thumbnail.jpg'} />
        <meta property="og:type" content="video.other" />
        <meta property="og:url" content={`https://fritok.net/video/${data?.id || 'shared'}`} />
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
          {videoData?.[0] && <MiniChat videoId={videoData[0].id} />}
        </section>
        
        {showModal && (
          <div className="modal">
            <AddCommandeForm />
          </div>
        )}

      </main>
    </>
  );
}

