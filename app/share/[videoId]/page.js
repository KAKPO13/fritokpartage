import { doc, getDoc, collection, addDoc } from 'firebase/firestore';
import { db } from '@/lib/firebaseConfig';
import MiniChat from './MiniChat';
import React from 'react';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  const { videoId } = params;

  const docRef = doc(db, "video_playlist", videoId);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) {
    return {
      title: "Vidéo introuvable",
      description: "Ce lien ne correspond à aucune vidéo.",
    };
  }

  const data = docSnap.data() || {};
  const title = data.title ?? "Vidéo FriTok";
  const description = data.description ?? "Découvrez cette vidéo partagée sur FriTok.";
  const thumbnail = data.thumbnail ?? "/default-thumbnail.png";
  const priceValue = typeof data.price === 'number' ? data.price : parseFloat(data.price) || 0;

  const formattedPrice = new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'XOF',
    minimumFractionDigits: 0
  }).format(priceValue);

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [{ url: thumbnail }],
      type: "video.other",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [thumbnail],
    },
    price: formattedPrice,
  };
}

export default async function Page({ params, searchParams }) {
  const { videoId } = params;
  const { ref = null, token = null, price: priceParam = null, userId = null } = searchParams || {};

  const docRef = doc(db, "video_playlist", videoId);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) {
    return (
      <main style={{ textAlign: 'center', padding: '2rem' }}>
        <h1>🎬 Vidéo introuvable</h1>
        <p>Le lien que vous avez suivi ne correspond à aucune vidéo...</p>
      </main>
    );
  }

  const data = docSnap.data() || {};
  const title = data.title ?? "Vidéo FriTok";
  const description = data.description ?? "";
  const thumbnail = data.thumbnail ?? "/default-thumbnail.png";
  const videoUrl = data.url ?? "";

  // 🔄 Priorité au paramètre d’URL "price", sinon Firestore
  const rawPriceParam = parseFloat(priceParam);
  const rawPrice = !isNaN(rawPriceParam)
    ? rawPriceParam
    : typeof data.price === 'number'
      ? data.price
      : parseFloat(data.price) || 0;

  const formattedPrice = new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'XOF',
    minimumFractionDigits: 0
  }).format(rawPrice);

  if (videoId && ref && token && userId) {
    try {
      await addDoc(collection(db, 'share_events'), {
        videoId,
        referrer: ref,
        userId,
        token,
        timestamp: new Date().toISOString(),
        source: 'web',
        imageUrl: thumbnail,
        title,
        description,
        price: rawPrice,
      });
    } catch (error) {
      console.error('Erreur Firestore :', error);
    }
  }

  const paymentUrl = `/buy/${videoId}?ref=${ref || 'direct'}&token=${token || 'none'}`;

  return (
    <main style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>{title}</h1>
      <p><strong>Prix :</strong> {formattedPrice}</p>
      <video
        src={videoUrl}
        controls
        style={{ width: '100%', maxWidth: '600px', marginBottom: '1rem' }}
        poster={thumbnail}
      />
      <p>{description}</p>
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
    </main>
  );
}
