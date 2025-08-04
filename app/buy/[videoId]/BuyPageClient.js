 
'use client';

import { useState, useEffect } from 'react';
import { addDoc, collection } from 'firebase/firestore';
import { db } from '../firebase'; // adapte le chemin selon ton projet
import geohash from 'ngeohash';

export default function BuyPageClient({ title, description, videoUrl, thumbnail, price, referrer, token }) {
  const [showFullImage, setShowFullImage] = useState(false);
  const [latitude, setLatitude] = useState(null);
  const [longitude, setLongitude] = useState(null);
  const [address, setAddress] = useState('');

  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        setLatitude(latitude);
        setLongitude(longitude);

        // Optionnel : récupérer l’adresse via une API
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`);
        const data = await response.json();
        setAddress(data.display_name || '');
      },
      (error) => console.error('Erreur géolocalisation:', error),
      { enableHighAccuracy: true }
    );
  }, []);

  const handlePayment = async () => {
    const hash = geohash.encode(latitude, longitude);
    const commande = {
      produit: {
        title,
        description,
        videoUrl,
        thumbnail,
        price,
        referrer,
        token
      },
      latitude,
      longitude,
      geohash: hash,
      adresse: address,
      date: new Date().toISOString()
    };

    try {
      await addDoc(collection(db, 'commande'), commande);
      alert('✅ Commande enregistrée avec succès !');
    } catch (error) {
      console.error('❌ Erreur lors de l’enregistrement:', error);
      alert('Erreur lors de l’enregistrement de la commande.');
    }
  };

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
      {latitude && longitude && (
        <>
          <p>📍 Latitude : {latitude}</p>
          <p>📍 Longitude : {longitude}</p>
          <p>🔢 Geohash : {geohash.encode(latitude, longitude)}</p>
          <p>🏠 Adresse : {address}</p>
        </>
      )}

      <button
        onClick={handlePayment}
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
        onClick={() => alert(`Paiement simulé pour ${title}`)}
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
