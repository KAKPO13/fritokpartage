// pages/smartlink.js
import { useState } from 'react';
import dynamic from 'next/dynamic';
import Head from 'next/head';
import Link from 'next/link';
import { Dialog } from '@headlessui/react';

// 🔹 Firebase côté client
import { db } from '@/lib/firebaseClient';

// 🔹 Firebase côté serveur
import { adminDb } from '@/lib/firebaseAdmin';

// 🔹 Composants
import VideoCard from '../components/VideoCard';
import AddCommandeForm from '../app/capture/AddCommandeForm';
const MiniChat = dynamic(() => import('../components/MiniChat'), { ssr: false });

// ============================================================
// 🔹 Partie serveur : récupération des données Firestore via Admin SDK
// ============================================================
export async function getServerSideProps(context) {
  const { videos, ref, token } = context.query;
  const videoData = [];
  let validRef = null;

  // Vérification utilisateur via Firebase Admin
  if (ref) {
    try {
      const userSnap = await adminDb.collection('users').doc(ref).get();
      if (userSnap.exists) {
        validRef = ref;
      } else {
        console.warn(`⚠️ Aucun utilisateur trouvé avec l'ID : ${ref}`);
      }
    } catch (error) {
      console.error(`Erreur lors de la vérification du ref :`, error);
    }
  }

  // Récupération des vidéos via Firebase Admin
  if (videos) {
    const videoIds = videos.split(',');
    for (const id of videoIds) {
      try {
        const docSnap = await adminDb.collection('video_playlist').doc(id).get();
        if (docSnap.exists) {
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
      ref: validRef,
      token: token || null,
    },
  };
}

// ============================================================
// 🔹 Partie client : rendu React
// ============================================================
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
        {ref ? (
          <p>🔗 Partagé par : <strong>{ref}</strong></p>
        ) : (
          <p>⚠️ Aucun utilisateur valide trouvé pour ce lien.</p>
        )}
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
            <AddCommandeForm userId={ref} token={token} />
          </div>
        )}

        {/* ✅ Lien vers la page juridique */}
        <section style={{ marginTop: '4rem', textAlign: 'center' }}>
          <Link href="/legal">
            <button style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: '#007bff',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '1rem'
            }}>
              📚 Centre juridique
            </button>
          </Link>
        </section>
      </main>
    </>
  );
}
