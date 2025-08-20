'use client';

import { useState, useEffect } from 'react';
import { doc, getDoc, collection, addDoc } from 'firebase/firestore';
import { db } from '@/lib/firebaseConfig';
import AddCommandeForm from '../../capture/AddCommandeForm';
import MiniChat from './MiniChat';
import Head from 'next/head';

export default function Page({ params, searchParams }) {
  const { videoId } = params;
  const { ref, token } = searchParams;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    const fetchVideo = async () => {
      const docRef = doc(db, 'video_playlist', videoId);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const videoData = docSnap.data();
        setData(videoData);

        if (videoId && ref && token) {
          try {
            await addDoc(collection(db, 'share_events'), {
              videoId,
              referrer: ref,
              userId: ref,
              token,
              timestamp: new Date().toISOString(),
              source: 'web',
              imageUrl: videoData.thumbnail ?? '',
              title: videoData.title ?? '',
              description: videoData.description ?? '',
              price: videoData.price ?? '',
            });
          } catch (error) {
            console.error('Erreur Firestore :', error);
          }
        }
      }

      setLoading(false);
    };

    fetchVideo();
  }, [videoId, ref, token]);

  if (loading) {
    return <main style={{ padding: '2rem' }}>⏳ Chargement...</main>;
  }

  if (!data) {
    return (
      <main style={{ textAlign: 'center', padding: '2rem' }}>
        <h1>🎬 Vidéo introuvable</h1>
        <p>Le lien que vous avez suivi ne correspond à aucune vidéo.</p>
      </main>
    );
  }

  const paymentUrl = `/buy/${videoId}?ref=${ref || 'direct'}&token=${token || 'none'}`;

  return (
    <>
      <Head>
        <title>{data.title}</title>
        <meta name="description" content={data.description} />
        <meta property="og:title" content={data.title} />
        <meta property="og:description" content={data.description} />
        <meta property="og:image" content={data.thumbnail} />
        <meta property="og:type" content="video.other" />
        <meta property="og:url" content={`https://fritok.net/video/${videoId}`} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={data.title} />
        <meta name="twitter:description" content={data.description} />
        <meta name="twitter:image" content={data.thumbnail} />
      </Head>

      <main style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
        <h1>{data.title}</h1>
        <p><strong>Prix :</strong> {data.price}</p>
        <video
          src={data.url}
          controls
          style={{ width: '100%', maxWidth: '600px', marginBottom: '1rem' }}
          poster={data.thumbnail}
        />
        <p>{data.description}</p>
        {ref && <p>🔗 Partagé par : {ref}</p>}

        <a href={paymentUrl}>
          <button style={{
            marginTop: '1rem',
            padding: '1rem 2rem',
            backgroundColor: '#00C851',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '1rem'
          }}>
            🛒 Plus De Détail
          </button>
        </a>

        <MiniChat videoId={videoId} />

        <button
          onClick={() => setShowForm(!showForm)}
          style={{
            padding: '1rem 2rem',
            backgroundColor: '#007bff',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '1rem',
            marginTop: '1rem'
          }}
        >
          📸 Capture
        </button>

        {showForm && <AddCommandeForm />}
      </main>
    </>
  );
}






