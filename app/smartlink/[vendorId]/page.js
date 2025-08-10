import { doc, getDoc, getFirestore, collection, addDoc } from 'firebase/firestore';
import { initializeApp } from 'firebase/app';
import React from 'react';
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

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  const { vendorId } = params;

  const docRef = doc(db, "video_playlist", videoId);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) {
    return {
      title: "Vendeur introuvable",
      description: "Ce lien ne correspond à aucun vendeur.",
    };
  }

  const data = docSnap.data();

  return {
    title: data.name || "SmartLink FriTok",
    description: data.description || "Découvrez les vidéos partagées par ce vendeur.",
    openGraph: {
      title: data.name,
      description: data.description,
      images: [
        {
          url: data.avatar,
          width: 1200,
          height: 630,
        },
      ],
      type: "profile",
    },
    twitter: {
      card: "summary_large_image",
      title: data.name,
      description: data.description,
      images: [data.avatar],
    },
  };
}

export default async function SmartlinkPage({ params, searchParams }) {
  const { vendorId } = params;
  const { ref, token } = searchParams;

  const docRef = doc(db, "video_playlist", videoId);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) {
    return (
      <main style={{ textAlign: 'center', padding: '2rem' }}>
        <h1>🛍️ Vendeur introuvable</h1>
        <p>Ce lien ne correspond à aucun profil vendeur.</p>
      </main>
    );
  }

  const vendor = docSnap.data();

  const videosRef = collection(db, "video_playlist");
  const videosSnap = await getDoc(doc(db, "vendor_videos", vendorId));
  const videos = videosSnap.exists() ? videosSnap.data().videos || [] : [];

  if (vendorId && ref && token) {
    try {
      await addDoc(collection(db, 'smartlink_events'), {
        vendorId,
        referrer: ref,
        token,
        timestamp: new Date().toISOString(),
        source: 'web',
        vendorName: vendor.name ?? '',
      });
    } catch (error) {
      console.error('Erreur Firestore :', error);
    }
  }

  return (
    <>
      <Head>
        <title>{vendor.name}</title>
        <meta name="description" content={vendor.description} />
        <meta property="og:title" content={vendor.name} />
        <meta property="og:description" content={vendor.description} />
        <meta property="og:image" content={vendor.avatar} />
        <meta property="og:type" content="profile" />
        <meta property="og:url" content={`https://fritok.netlify.app/smartlink/${vendorId}`} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={vendor.name} />
        <meta name="twitter:description" content={vendor.description} />
        <meta name="twitter:image" content={vendor.avatar} />
      </Head>

      <main style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
        <h1>{vendor.name}</h1>
        <p>{vendor.description}</p>
        <img src={vendor.avatar} alt="Avatar vendeur" style={{ width: '120px', borderRadius: '50%' }} />

        {videos.length === 0 ? (
          <p style={{ marginTop: '2rem' }}>📭 Aucun contenu disponible pour ce vendeur.</p>
        ) : (
          <div style={{ marginTop: '2rem' }}>
            {videos.map((video, index) => (
              <div key={index} style={{
                marginBottom: '2rem',
                border: '1px solid #ccc',
                padding: '1rem',
                borderRadius: '8px'
              }}>
                <video src={video.url} controls style={{ width: '100%' }} poster={video.thumbnail} />
                <h3>{video.title}</h3>
                <p>{video.description}</p>
                <a href={`/buy/${video.id}?ref=${ref || 'direct'}&token=${token || 'none'}`}>
                  <button style={{
                    marginTop: '1rem',
                    padding: '0.5rem 1rem',
                    backgroundColor: '#ff4081',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer'
                  }}>
                    🛒 Acheter
                  </button>
                </a>
              </div>
            ))}
          </div>
        )}
      </main>
    </>
  );
}


