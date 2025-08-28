import { doc, getDoc, collection, addDoc } from 'firebase/firestore';
import { db } from '@/lib/firebaseConfig';
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

  const formattedPrice = new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'XOF',
    minimumFractionDigits: 0
  }).format(data.price || 0);

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
    price: formattedPrice,
  };
}

export default async function Page({ params, searchParams }) {
  const { videoId } = params;
  const { ref, token, price: priceParam, userId } = searchParams;

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
        userId, // ✅ identifiant réel de l'utilisateur connecté
        token,
        timestamp: new Date().toISOString(),
        source: 'web',
        imageUrl: data.thumbnail ?? '',
        title: data.title ?? '',
        description: data.description ?? '',
        price: rawPrice,
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
        <meta name="product:price:amount" content={rawPrice.toString()} />
        <meta name="product:price:currency" content="XOF" />
        <meta name="product:formatted_price" content={formattedPrice} />
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
        <p><strong>Prix :</strong> {formattedPrice}</p>
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
      </main>
    </>
  );
}



