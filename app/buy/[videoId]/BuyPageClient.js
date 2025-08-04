'use client';

import { useState } from 'react';
import OrderConfirmation from './OrderConfirmation'; // Assure-toi que ce fichier existe

export default function BuyPageClient({
  title = "Produit mystère",
  description = "Aucune description disponible.",
  videoUrl = "",
  thumbnail = "",
  price = "4.99 €",
  referrer = "",
  token = ""
}) {
  const [showFullImage, setShowFullImage] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const colors = {
    primary: '#ff5722',
    background: '#f9f9f9',
    text: '#333',
    accent: '#ffc107'
  };

  if (confirming) {
    return (
      <OrderConfirmation
        title={title}
        price={price}
        thumbnail={thumbnail}
        token={token}
        referrer={referrer}
      />
    );
  }

  return (
    <main style={{
      padding: '2rem',
      fontFamily: 'system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji"',
      backgroundColor: colors.background,
      color: colors.text
    }}>
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

      {videoUrl && (
        <video
          src={videoUrl}
          controls
          style={{ width: '100%', maxWidth: '600px', marginBottom: '1rem', borderRadius: '12px' }}
        />
      )}

      <p>{description}</p>
      <p><strong>Prix :</strong> {price}</p>
      {referrer && <p>🔗 Référent : {referrer}</p>}
      {token && <p>🛡️ Jeton : {token}</p>}

      <button
        onClick={() => setConfirming(true)}
        style={{
          marginTop: '1rem',
          padding: '1rem 2rem',
          background: `linear-gradient(135deg, ${colors.primary}, ${colors.accent})`,
          color: '#fff',
          border: 'none',
          borderRadius: '12px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
          cursor: 'pointer',
          fontSize: '1rem',
          transition: 'transform 0.2s ease'
        }}
        onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.05)'}
        onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
      >
        💳 Payer maintenant
      </button>
    </main>
  );
}

