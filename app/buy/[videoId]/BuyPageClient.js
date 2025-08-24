'use client';

import { useState, useEffect } from 'react';
import { doc, setDoc, collection } from 'firebase/firestore';
import { db } from '../../../lib/firebaseConfig';
import geohash from 'ngeohash';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

export default function BuyPageClient({ title, description, videoUrl, thumbnail, referrer, token }) {
  const [showFullImage, setShowFullImage] = useState(false);
  const [latitude, setLatitude] = useState(null);
  const [longitude, setLongitude] = useState(null);
  const [address, setAddress] = useState('');
  const [codePays, setCodePays] = useState('+225');
  const [telephone, setTelephone] = useState('');
  const [observations, setObservations] = useState('');
  const [price, setPrice] = useState('');
  const [refArticle, setRefArticle] = useState('');
 


  useEffect(() => {
    const fetchLocation = async () => {
      try {
        const position = await new Promise((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true })
        );

        const { latitude, longitude } = position.coords;
        setLatitude(latitude);
        setLongitude(longitude);

        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`);
        const data = await response.json();
        setAddress(data.display_name || '');
      } catch (error) {
        console.error('Erreur géolocalisation ou récupération adresse :', error);
        toast.error("❌ Impossible d'obtenir votre position.");
      }
    };

    fetchLocation();
  }, []);

useEffect(() => {
  const urlParams = new URLSearchParams(window.location.search);
  const refFromUrl = urlParams.get('refArticle');
  if (refFromUrl) {
    setRefArticle(refFromUrl);
  }
}, []);
 

  const handlePayment = async () => {
    const numericPrice = Number(price || 0);
    const numeroComplet = `${codePays.trim()}${telephone.trim()}`;
    const regexTelComplet = /^\+\d{1,4}\d{8,15}$/;

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

    const hash = geohash.encode(latitude, longitude);
    const docRef = doc(collection(db, 'commandes'));
    const commandeId = docRef.id;

    const commande = {
      articles: [
        {
          nom_frifri: title ?? '',
          videoUrl: videoUrl ?? '',
          imageUrl: thumbnail ?? '',
          prix_frifri: numericPrice,
          ref_article: refArticle ?? '',
          token: token ?? ''
        }
      ],
      totalPrix: numericPrice,
      latitude,
      longitude,
      geohash: hash,
      adresseLivraison: address,
      phone: numeroComplet,
      observations: observations ?? '',
      statut: "en attente",
      userId: referrer ?? '',
      boutiqueId: '',
      commandeId,
      date: new Date().toISOString()
    };

    try {
      await setDoc(docRef, commande);
      toast.success(`✅ Commande enregistrée avec succès ! ID : ${commandeId}`);
      setTelephone('');
      setCodePays('+225');
      setObservations('');
      setPrice('');
    } catch (error) {
      console.error('❌ Erreur lors de l’enregistrement ou de la notification:', error);
      toast.error('Erreur lors de l’enregistrement de la commande.');
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

      <div style={{ marginTop: '1rem' }}>
        <input
          type="text"
          placeholder="🏠 Adresse de livraison"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
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
        style={{
          padding: '1rem 2rem',
          backgroundColor: '#ff5722',
          color: '#fff',
          border: 'none',
          borderRadius: '8px',
          cursor: 'pointer',
          fontSize: '1rem'
        }}
      >
        🛒 Commande avec livraison
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
