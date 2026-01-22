'use client';

import { useState, useEffect } from 'react';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

// 🔹 Utilitaire de logs premium
function logEvent(type, message, payload = {}) {
  const logs = JSON.parse(localStorage.getItem('orderLogs') || '[]');
  const newLog = {
    id: `${Date.now()}_${Math.floor(Math.random() * 9999)}`,
    type,
    message,
    payload,
    timestamp: new Date().toISOString()
  };
  logs.push(newLog);
  localStorage.setItem('orderLogs', JSON.stringify(logs));
  console.info(`[LOG-${type}]`, message, payload);
}

// 🔹 Hook réutilisable pour géolocalisation
function useGeolocation() {
  const [coords, setCoords] = useState({ latitude: null, longitude: null });
  const [address, setAddress] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchLocation = async () => {
      try {
        const position = await new Promise((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true })
        );

        const { latitude, longitude } = position.coords;
        setCoords({ latitude, longitude });

        const response = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`
        );
        const data = await response.json();
        setAddress(data.display_name || '');
        logEvent('INFO', 'Geolocation success', { latitude, longitude, address: data.display_name });
      } catch (err) {
        setError(err.message);
        logEvent('ERROR', 'Geolocation failed', { error: err.message });
      }
    };

    fetchLocation();
  }, []);

  return { ...coords, address, error };
}

// 🔹 Hook pour gérer les commandes
function useOrder() {
  const [status, setStatus] = useState('idle'); // idle | loading | success | error
  const [orderId, setOrderId] = useState(null);

  const createOrder = async (payload) => {
    setStatus('loading');
    logEvent('INFO', 'Order creation started', payload);

    try {
      const response = await fetch('/.netlify/functions/create_order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (data.success) {
        setStatus('success');
        setOrderId(data.orderId);
        logEvent('SUCCESS', 'Order created successfully', { orderId: data.orderId });
        toast.success(`✅ Commande enregistrée avec succès ! ID : ${data.orderId}`);
      } else {
        setStatus('error');
        logEvent('ERROR', 'Order creation failed', { message: data.message });
        toast.error(`❌ Erreur serveur : ${data.message}`);
      }
    } catch (err) {
      setStatus('error');
      logEvent('ERROR', 'Order API call failed', { error: err.message });
      toast.error("❌ Impossible d'enregistrer la commande. Réessayez.");
    }
  };

  return { status, orderId, createOrder };
}

// 🔹 Composant principal
export default function BuyPageClient({ title, description, videoUrl, thumbnail, referrer, token }) {
  const { latitude, longitude, address, error } = useGeolocation();
  const { status, orderId, createOrder } = useOrder();

  const [codePays, setCodePays] = useState('+225');
  const [telephone, setTelephone] = useState('');
  const [observations, setObservations] = useState('');
  const [price, setPrice] = useState('');

  const handlePayment = () => {
    const numeroComplet = `${codePays.trim()}${telephone.trim()}`;
    const regexTelComplet = /^\+\d{1,4}\d{8,15}$/;
    const numericPrice = Number(price || 0);

    if (!latitude || !longitude || !address.trim() || !telephone.trim()) {
      toast.warn("⚠️ Veuillez remplir tous les champs requis.");
      return;
    }

    if (!regexTelComplet.test(numeroComplet)) {
      toast.error("❌ Numéro de téléphone invalide.");
      return;
    }

    if (isNaN(numericPrice) || numericPrice <= 0) {
      toast.error("❌ Le prix doit être un nombre valide supérieur à zéro.");
      return;
    }

    const payload = {
      videoId: videoUrl,
      referrer,
      token,
      details: {
        price: numericPrice,
        latitude,
        longitude,
        address,
        phone: numeroComplet,
        observations
      }
    };

    createOrder(payload);

    // Reset après succès
    if (status === 'success') {
      setTelephone('');
      setCodePays('+225');
      setObservations('');
      setPrice('');
    }
  };

  return (
    <main style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>🛒 Acheter : {title}</h1>

      {thumbnail && (
        <img
          src={thumbnail}
          alt={`Aperçu de ${title}`}
          style={{
            width: '100%',
            maxWidth: '600px',
            marginBottom: '1rem',
            borderRadius: '12px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
          }}
        />
      )}

      <video src={videoUrl} controls style={{ width: '100%', maxWidth: '600px', marginBottom: '1rem' }} />
      <p>{description}</p>

      <div style={{ marginTop: '1rem' }}>
        <input
          type="text"
          placeholder="🏠 Adresse de livraison"
          value={address}
          onChange={(e) => logEvent('INFO', 'Manual address edit', { value: e.target.value }) || setAddress(e.target.value)}
          style={inputStyle}
        />

        <select value={codePays} onChange={(e) => setCodePays(e.target.value)} style={inputStyle}>
          <option value="+225">🇨🇮 Côte d’Ivoire (+225)</option>
          <option value="+229">🇧🇯 Bénin (+229)</option>
          <option value="+228">🇹🇬 Togo (+228)</option>
        </select>

        <input
          type="text"
          placeholder="📱 Numéro de téléphone"
          value={telephone}
          onChange={(e) => setTelephone(e.target.value)}
          style={inputStyle}
        />
        <input
          type="text"
          placeholder="💰 Prix (€)"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          style={inputStyle}
        />
        <textarea
          placeholder="📝 Observations (facultatif)"
          value={observations}
          onChange={(e) => setObservations(e.target.value)}
          rows={4}
          style={{ ...inputStyle, resize: 'vertical' }}
        />
      </div>

      <button
        onClick={handlePayment}
        disabled={status === 'loading'}
        style={{
          padding: '1rem 2rem',
          backgroundColor: status === 'loading' ? '#ccc' : '#ff5722',
          color: '#fff',
          border: 'none',
          borderRadius: '8px',
          cursor: status === 'loading' ? 'not-allowed' : 'pointer',
          fontSize: '1rem'
        }}
      >
        {status === 'loading' ? '⏳ Traitement...' : '🛒 Commander via Netlify Function'}
      </button>

      <ToastContainer position="top-right" autoClose={5000} />
    </main>
  );
}

const inputStyle = {
  width: '100%',
  padding: '0.75rem',
  marginBottom: '1rem',
  borderRadius: '8px',
  border: '1px solid #ccc'
};
