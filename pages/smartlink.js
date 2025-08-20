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
  const [showModal, setShowModal] = useState(true);
  const data = videoData?.[0];

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

        {/* ✅ Bouton toggle pour afficher/masquer le formulaire */}
        <button
          onClick={() => setShowModal(!showModal)}
          style={{
            padding: '0.75rem 1.5rem',
            backgroundColor: showModal ? '#dc3545' : '#28a745',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: 'bold',
            marginBottom: '1rem'
          }}
        >
          {showModal ? 'Masquer le formulaire' : 'Afficher le formulaire'}
        </button>

        {showModal && (
          <div className="modal">
            <AddCommandeForm />
          </div>
        )}

        <button
          onClick={() => setIsOpen(true)}
          style={{
            padding: '1rem 2rem',
            backgroundColor: '#007bff',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '1rem',
            marginTop: '2rem'
          }}
        >
          ➕ Ajouter une commande
        </button>

        <Dialog open={isOpen} onClose={() => setIsOpen(false)} className="fixed inset-0 z-50 flex items-center justify-center">
          <Dialog.Panel className="bg-white p-6 rounded shadow-xl max-w-md w-full">
            <Dialog.Title className="text-lg font-bold mb-4">Nouvelle commande</Dialog.Title>
            <AddCommandeForm />
            <button
              onClick={() => setIsOpen(false)}
              style={{
                marginTop: '1rem',
                padding: '0.5rem 1rem',
                backgroundColor: '#dc3545',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
            >
              Fermer
            </button>
          </Dialog.Panel>
        </Dialog>
      </main>
    </>
  );
}

