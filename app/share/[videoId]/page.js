import { doc, getDoc, collection, addDoc } from 'firebase/firestore';
import { db } from '@/lib/firebaseConfig'; // ✅ adapte le chemin si nécessaire
import MiniChat from './MiniChat';
import React from 'react';
import Head from 'next/head';

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

  const data = docSnap.data();

  return {
    title: data.title || "Vidéo FriTok",
    description: data.description || "Découvrez cette vidéo partagée sur FriTok.",
    openGraph: {
      title: data.title,
      description: data.description,
      images: [
        {
          url: data.thumbnail,
          width: 1200,
          height: 630,
        },
      ],
      type: "video.other",
    },
    twitter: {
      card: "summary_large_image",
      title: data.title,
      description: data.description,
      images: [data.thumbnail],
    },
  };
}

export default async function Page({ params, searchParams }) {
  const { videoId } = params;
  const { ref, token } = searchParams;

  const docRef = doc(db, "video_playlist", videoId);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) {
    return (
      <main style={{ textAlign: 'center', padding: '2rem' }}>
        <h1>🎬 Vidéo introuvable</h1>
        <p>Le lien que vous avez suivi ne correspond à aucune vidéo.</p>
      </main>
    );
  }

  const data = docSnap.data();

  if (videoId && ref && token) {
    try {
      await addDoc(collection(db, 'share_events'), {
        videoId,
        referrer: ref,
        userId: ref,
        token,
        timestamp: new Date().toISOString(),
        source: 'web',
        imageUrl: data.thumbnail ?? '',
        title: data.title ?? '',
        description: data.description ?? '',
        price: data.price ?? '',
      });
    } catch (error) {
      console.error('Erreur Firestore :', error);
    }
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
            🛒 Plus De Detail
          </button>
        </a>

        {/* 💬 Mini Chat intégré ici */}
        <MiniChat videoId={videoId} />
      </main>
    </>
  );
}






