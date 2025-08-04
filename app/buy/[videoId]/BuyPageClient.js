'use client';

import { useState } from 'react';
import OrderConfirmation from './OrderConfirmation'; // ✅ Importation

export default function BuyPageClient({ title, description, videoUrl, thumbnail, price, referrer, token }) {
  const [showFullImage, setShowFullImage] = useState(false);
  const [confirming, setConfirming] = useState(false); // 👈 État pour afficher OrderConfirmation

  if (confirming) {
    return (
      <OrderConfirmation
        title={title}
        price={price}
        thumbnail={thumbnail}
        token={token}
      />
    );
  }

  return (
    <main style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>🛒 Acheter : {title}</h1>

      {thumbnail && (
        <>
          <img
            src={thumbnail}
            alt={`Aperçu de ${title}`}
            onClick={() => setShowFullImage(true)}
            style={{
              width: '100%',
              maxWidth: '600px',
              marginBottom: '1rem',
              borderRadius: '12px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
              cursor: 'zoom-in'
            }}
          />
          {showFullImage && (
            <div
              onClick={() => setShowFullImage(false)}
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100vw',
                height: '100vh',
                backgroundColor: 'rgba(0,0,0,0.8)',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                zIndex: 9999,
                cursor: 'zoom-out'
              }}
            >
              <img
                src={thumbnail}
                alt="Image agrandie"
                style={{
                  maxWidth: '90%',
                  maxHeight: '90%',
                  borderRadius: '12px',
                  boxShadow: '0 0 20px rgba(255,255,255,0.3)'
                }}
              />
            </div>
          )}
        </>
      )}

      <video src={videoUrl} controls style={{ width: '100%', maxWidth: '600px', marginBottom: '1rem' }} />
      <p>{description}</p>
      <p><strong>Prix :</strong> {price}</p>
      {referrer && <p>🔗 Référent : {referrer}</p>}
      {token && <p>🛡️ Jeton : {token}</p>}

      <button
        onClick={() => setConfirming(true)} // 👈 Affiche OrderConfirmation
        style={{
          marginTop: '1rem',
          padding: '1rem 2rem',
          backgroundColor: '#ff5722',
          color: '#fff',
          border: 'none',
          borderRadius: '8px',
          cursor: 'pointer',
          fontSize: '1rem'
        }}
      >
        💳 Payer maintenant
      </button>
    </main>
  );
}
