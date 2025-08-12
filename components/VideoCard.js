// components/VideoCard.jsx
import React from 'react';
import Link from 'next/link';
import { db } from '../firebaseClient';
import { collection, addDoc } from 'firebase/firestore';

async function trackClick(videoId, sharedBy, token) {
  try {
    await addDoc(collection(db, 'shareEvents'), {
      videoId,
      sharedBy: sharedBy || 'inconnu',
      token: token || null,
      timestamp: Date.now()
    });
    console.log('Clic enregistré');
  } catch (error) {
    console.error('Erreur enregistrement clic :', error);
  }
}

export default function VideoCard({ video, referrer, token }) {
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

      <button
        onClick={() => trackClick(video.id, referrer, token)}
        style={{
          marginTop: '0.5rem',
          padding: '0.5rem 1rem',
          backgroundColor: '#33b5e5',
          color: '#fff',
          border: 'none',
          borderRadius: '6px',
          cursor: 'pointer'
        }}
      >
        👀 Voir la vidéo
      </button>

      <Link href={`/buy/${video.id}?ref=${referrer || 'direct'}&token=${token || 'none'}`}>
        <button style={{
          marginTop: '1rem',
          padding: '0.5rem 1rem',
          backgroundColor: '#00C851',
          color: '#fff',
          border: 'none',
          borderRadius: '6px',
          cursor: 'pointer'
        }}>
          🛒 Acheter
        </button>
      </Link>
    </div>
  );
}


