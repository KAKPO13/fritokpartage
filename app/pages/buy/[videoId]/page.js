// web_app/pages/buy/[videoId].js
'use client';

import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import BuyPageClient from '../../lib/BuyPageClient';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebaseConfig';

export default function BuyPagePage() {
  const router = useRouter();
  const { videoId } = router.query;
  const [videoData, setVideoData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!videoId) return;

    const fetchVideo = async () => {
      try {
        const docRef = doc(db, 'video_playlist', videoId);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
          setVideoData(null);
        } else {
          setVideoData(docSnap.data());
        }
      } catch (error) {
        console.error('Erreur récupération vidéo:', error);
        setVideoData(null);
      } finally {
        setLoading(false);
      }
    };

    fetchVideo();
  }, [videoId]);

  if (loading) {
    return <p style={{ padding: '2rem' }}>⏳ Chargement...</p>;
  }

  if (!videoData) {
    return (
      <main style={{ padding: '2rem', textAlign: 'center' }}>
        <h1>🎬 Vidéo introuvable</h1>
        <p>Le lien que vous avez suivi ne correspond à aucune vidéo.</p>
      </main>
    );
  }

  // Récupération des paramètres de query (ref, token, price, userId)
  const { ref = null, token = null, price = null } = router.query;

  return (
    <BuyPageClient
      title={videoData.title}
      description={videoData.description}
      videoUrl={videoData.url}
      thumbnail={videoData.thumbnail}
      referrer={ref}
      token={token}
      price={price}
    />
  );
}