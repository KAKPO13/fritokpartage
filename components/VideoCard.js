// components/VideoCard.jsx
import React from 'react';
import Link from 'next/link';
import { db } from '../firebaseConfig';
import { collection, addDoc } from 'firebase/firestore';

async function logClick(videoId, referrer, token) {
  try {
    await addDoc(collection(db, 'click_logs'), {
      videoId,
      referrer: referrer || 'inconnu',
      token: token || null,
      timestamp: new Date().toISOString(),
    });
    console.log('✅ Clic enregistré depuis VideoCard');
  } catch (error) {
    console.error('❌ Erreur enregistrement clic :', error);
  }
}

export default function VideoCard({ video, referrer, token }) {
  const handleClick = async () => {
    await logClick(video.id, referrer, token);
  };

  return (
    <div style={{
      marginBottom: '2rem',
      border: '1px solid #ccc',
      padding: '1rem',
      borderRadius: '8px'
    }}>
      <video
        src={video.url}
        controls
        style={{ width: '100%' }}
        poster={video.thumbnail}
      />
      <h3>{video.title}</h3>
      <p>{video.description}</p>
      <p><strong>💰 Prix :</strong> {video.price ? `${video.price.toFixed(2)} €` : 'Non spécifié'}</p>

      <Link href={`/buy/${video.id}?ref=${referrer || 'direct'}&token=${token || 'none'}`}>
        <button
          onClick={handleClick}
          style={{
            marginTop: '1rem',
            padding: '0.5rem 1rem',
            backgroundColor: '#00C851',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer'
          }}
        >
          🛒 Acheter
        </button>
      </Link>
    </div>
  );
}

