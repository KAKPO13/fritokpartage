'use client';

import { useState } from 'react';
import { doc, setDoc, getFirestore } from 'firebase/firestore';
import { geohashForLocation } from 'geofire-common'; // npm install geofire-common

const db = getFirestore();

export default function OrderConfirmation({ title, price, thumbnail, token }) {
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [geohash, setGeohash] = useState('');
  const [status, setStatus] = useState('');

  const handleLocation = () => {
    if (!navigator.geolocation) {
      alert("La géolocalisation n'est pas disponible.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setLatitude(lat);
        setLongitude(lng);
        setGeohash(geohashForLocation([lat, lng]));
      },
      (err) => alert("Erreur de géolocalisation : " + err.message)
    );
  };

  const confirmOrder = async () => {
    if (!latitude || !longitude || !geohash) {
      alert("Veuillez remplir tous les champs.");
      return;
    }

    const orderData = {
      title,
      price,
      thumbnail,
      token,
      latitude,
      longitude,
      geohash,
      status: "en attente",
      createdAt: new Date().toISOString()
    };

    try {
      const orderRef = doc(db, "commande", token || `cmd-${Date.now()}`);
      await setDoc(orderRef, orderData);
      setStatus("✅ Commande enregistrée !");
    } catch (error) {
      console.error("Erreur lors de l'enregistrement :", error);
      setStatus("❌ Échec de l'enregistrement.");
    }
  };

  return (
    <section style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h2>📦 Confirmation de commande</h2>
      <img src={thumbnail} alt={title} style={{ maxWidth: '300px', borderRadius: '8px' }} />
      <p><strong>Produit :</strong> {title}</p>
      <p><strong>Prix :</strong> {price}</p>

      <div style={{ marginTop: '1rem' }}>
        <label>Latitude : <input value={latitude} onChange={e => setLatitude(e.target.value)} /></label><br />
        <label>Longitude : <input value={longitude} onChange={e => setLongitude(e.target.value)} /></label><br />
        <label>Geohash : <input value={geohash} readOnly /></label><br />
        <button onClick={handleLocation} style={{ marginTop: '0.5rem' }}>📍 Ma position actuelle</button>
      </div>

      <button
        onClick={confirmOrder}
        style={{
          marginTop: '1rem',
          padding: '1rem 2rem',
          backgroundColor: '#4caf50',
          color: '#fff',
          border: 'none',
          borderRadius: '8px',
          cursor: 'pointer'
        }}
      >
        ✅ Confirmer la commande
      </button>

      {status && <p style={{ marginTop: '1rem' }}>{status}</p>}
    </section>
  );
}
