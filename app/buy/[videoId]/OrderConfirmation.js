'use client';

import { useState, useEffect } from 'react';
import { doc, setDoc, getFirestore } from 'firebase/firestore';
import { geohashForLocation } from 'geofire-common';

const db = getFirestore();

export default function OrderConfirmation({
  title = "Produit mystère",
  price = "4.99 €",
  thumbnail = "",
  token = `cmd-${Date.now()}`
}) {
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [geohash, setGeohash] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLocation = () => {
    if (!navigator.geolocation) {
      alert("La géolocalisation n'est pas disponible.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setLatitude(lat.toFixed(6));
        setLongitude(lng.toFixed(6));
        setGeohash(geohashForLocation([lat, lng]));
      },
      (err) => alert("Erreur de géolocalisation : " + err.message)
    );
  };

  const confirmOrder = async () => {
    if (!latitude || !longitude || !geohash) {
      alert("Veuillez obtenir votre position avant de confirmer.");
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
      setLoading(true);
      const orderRef = doc(db, "commande", token);
      await setDoc(orderRef, orderData);
      setStatus("✅ Commande enregistrée !");
    } catch (error) {
      console.error("Erreur lors de l'enregistrement :", error);
      setStatus("❌ Échec de l'enregistrement.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section style={{ padding: '2rem', fontFamily: 'sans-serif', textAlign: 'center' }}>
      <h2>📦 Confirmation de commande</h2>

      {thumbnail && (
        <img
          src={thumbnail}
          alt={title}
          style={{ maxWidth: '300px', borderRadius: '8px', boxShadow: '0 4px 8px rgba(0,0,0,0.1)' }}
        />
      )}

      <p><strong>Produit :</strong> {title}</p>
      <p><strong>Prix :</strong> {price}</p>

      <div style={{ marginTop: '1rem' }}>
        <button onClick={handleLocation} style={{ marginBottom: '1rem' }}>
          📍 Obtenir ma position
        </button><br />
        <input placeholder="Latitude" value={latitude} onChange={e => setLatitude(e.target.value)} /><br />
        <input placeholder="Longitude" value={longitude} onChange={e => setLongitude(e.target.value)} /><br />
        <input placeholder="Geohash" value={geohash} readOnly /><br />
      </div>

      <button
        onClick={confirmOrder}
        disabled={loading}
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
        {loading ? '⏳ Enregistrement...' : '✅ Confirmer la commande'}
      </button>

      {status && (
        <p style={{ marginTop: '1rem', fontWeight: 'bold', color: status.includes('✅') ? 'green' : 'red' }}>
          {status}
        </p>
      )}
    </section>
  );
}
