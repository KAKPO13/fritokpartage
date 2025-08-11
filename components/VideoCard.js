// components/VideoCard.jsx
import React from 'react';
import Link from 'next/link';

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
