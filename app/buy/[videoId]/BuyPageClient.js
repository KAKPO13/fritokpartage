'use client';

import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, collection } from 'firebase/firestore';
import { db } from '../../../firebaseConfig';
import geohash from 'ngeohash';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

export default function BuyPageClient({ videoId, referrer, token }) {
  const [showFullImage, setShowFullImage] = useState(false);
  const [latitude, setLatitude] = useState(null);
  const [longitude, setLongitude] = useState(null);
  const [address, setAddress] = useState('');
  const [telephone, setTelephone] = useState('');
  const [observations, setObservations] = useState('');

  // Données liées à la vidéo
  const [userId, setUserId] = useState('');
  const [boutiqueId, setBoutiqueId] = useState('');
  const [videoPrice, setVideoPrice] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [thumbnail, setThumbnail] = useState('');

  // 📦 Récupération des métadonnées de la vidéo
  useEffect(() => {
    const fetchVideoData = async () => {
      try {
        const videoDoc = await getDoc(doc(db, 'video_playlist', videoId));
        if (videoDoc.exists()) {
          const data = videoDoc.data();
          setUserId(data.userId || '');
          setBoutiqueId(data.boutiqueId || '');
          setVideoPrice(data.price || '');
          setTitle(data.title || '');
          setDescription(data.description || '');
          setVideoUrl(data.url || '');
          setThumbnail(data.thumbnail || '');
        }
      } catch (error) {
        console.error('❌ Erreur lors de la récupération des données vidéo :', error);
      }
    };

    fetchVideoData();
  }, [videoId]);

  // 📍 Géolocalisation
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

  // 💳 Paiement
  const handlePayment = async () => {
    if (!latitude || !longitude || !address || !telephone.trim()) {
      toast.warn("⚠️ Veuillez remplir tous les champs requis.");
      return;
    }

    const numericPrice = Number(videoPrice);
    if (isNaN(numericPrice)) {
      toast.error("❌ Le prix doit être un nombre valide.");
      return;
    }

    const hash = geohash.encode(latitude, longitude);
    const docRef = doc(collection(db, 'commandes'));
    const commandeId = docRef.id;

    const commande = {
      articles: {
        nom_frifri: title,
        videoUrl,
        imageUrl: thumbnail,
        prix_frifri: numericPrice,
        ref_article: referrer,
        token,
        totalPrix: numericPrice
      },
      latitude,
      longitude,
      geohash: hash,
      adresseLivraison: address,
      telephone: telephone.trim(),
      observations,
      statut: "en attente",
      userId,
      boutiqueId,
      commandeId,
      date: new Date().toISOString()
    };

    try {
      await setDoc(docRef, commande);
      toast.success(`✅ Commande enregistrée avec succès ! ID : ${commandeId}`);
      setTelephone('');
      setObservations('');
    } catch (error) {
      console.error('❌ Erreur lors de l’enregistrement de la commande :', error);
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
      {userId && <p>👤 ID utilisateur : {userId}</p>}
      {boutiqueId && <p>🏪 ID boutique : {boutiqueId}</p>}
      {videoPrice && <p>💰 Prix : {videoPrice} €</p>}
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

      <div style={{ marginTop: '1rem' }}>
        <input
          type="text"
          placeholder="📱 Numéro de téléphone"
          value={telephone}
          onChange={(e) => setTelephone(e.target.value)}
          style={{
            width: '100%',
            padding: '0.75rem',
            marginBottom: '1rem',
            borderRadius: '8px',
            border: '1px solid #ccc'
          }}
        />
        <textarea
          placeholder="📝 Observations (facultatif)"
          value={observations}
          onChange={(e) => setObservations(e.target.value)}
          rows={4}
          style={{
            width: '100%',
            padding: '0.75rem',
            borderRadius: '8px',
            border: '1px solid #ccc',
            marginBottom: '1rem'
          }}
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
        💳 Payer maintenant
      </button>

      <ToastContainer position="top-right" autoClose={5000} />
    </main>
  );
}



