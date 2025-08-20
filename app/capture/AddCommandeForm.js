'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebaseConfig';
import { collection, doc, setDoc } from 'firebase/firestore';
import geohash from 'ngeohash';
import { toast, ToastContainer } from 'react-toastify';
import { createClient } from '@supabase/supabase-js';
import 'react-toastify/dist/ReactToastify.css';

// Supabase config
const supabaseUrl = process.env.supabaseUrl;
const supabaseKey = process.env.supabaseKey;
const supabase = createClient(supabaseUrl, supabaseKey);

export default function AddCommandeForm() {
  const [imageFile, setImageFile] = useState(null);
  const [latitude, setLatitude] = useState(null);
  const [longitude, setLongitude] = useState(null);
  const [address, setAddress] = useState('');
  const [telephone, setTelephone] = useState('');
  const [observations, setObservations] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        setLatitude(latitude);
        setLongitude(longitude);

        try {
          const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`);
          const data = await response.json();
          setAddress(data.display_name || '');
        } catch (err) {
          console.error('Erreur adresse :', err);
          toast.error("❌ Impossible d'obtenir l'adresse.");
        }
      },
      (error) => {
        console.error('Erreur géolocalisation :', error);
        toast.error("❌ Impossible d'obtenir votre position.");
      },
      { enableHighAccuracy: true }
    );
  }, []);

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        toast.warn("⚠️ L’image est trop volumineuse (max 2 Mo).");
        return;
      }
      setImageFile(file);
    }
  };

  const uploadImageToSupabase = async (file, commandeId) => {
    const filePath = `imageproduit/${commandeId}-${Date.now()}.${file.name.split('.').pop()}`;
    const { data, error } = await supabase.storage.from('imageproduit').upload(filePath, file);

    if (error) throw error;

    const { data: publicUrlData } = supabase.storage.from('imageproduit').getPublicUrl(filePath);
    return publicUrlData.publicUrl;
  };

  const handleSubmit = async () => {
    if (!imageFile || !address.trim() || !telephone.trim() || !latitude || !longitude) {
      toast.warn("⚠️ Tous les champs requis doivent être remplis.");
      return;
    }

    const regexTel = /^[0-9]{8,15}$/;
    if (!regexTel.test(telephone.trim())) {
      toast.warn("⚠️ Numéro de téléphone invalide.");
      return;
    }

    setLoading(true);
    const hash = geohash.encode(latitude, longitude);
    const docRef = doc(collection(db, 'commandes'));
    const commandeId = docRef.id;

    try {
      const imageUrl = await uploadImageToSupabase(imageFile, commandeId);

      const commande = {
        imageArticle: imageUrl,
        adresse: address,
        latitude,
        longitude,
        geohash: hash,
        telephone: telephone.trim(),
        observations: observations.trim(),
        date: new Date().toISOString(),
        commandeId,
        statut: 'en attente'
      };

      await setDoc(docRef, commande);
      toast.success('✅ Commande enregistrée avec succès !');

      // Reset
      setImageFile(null);
      setTelephone('');
      setObservations('');
    } catch (error) {
      console.error('Erreur enregistrement :', error);
      toast.error('❌ Échec de l’enregistrement.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h2>📦 Ajouter une commande</h2>

      <input type="file" accept="image/*" onChange={handleImageUpload} style={inputStyle} />
      {imageFile && <p>📸 Image sélectionnée : {imageFile.name}</p>}

      <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="🏠 Adresse" style={inputStyle} />
      <input type="text" value={telephone} onChange={(e) => setTelephone(e.target.value)} placeholder="📱 Téléphone" style={inputStyle} />
      <textarea value={observations} onChange={(e) => setObservations(e.target.value)} placeholder="📝 Observations" rows={4} style={{ ...inputStyle, resize: 'vertical' }} />

      <button onClick={handleSubmit} style={buttonStyle} disabled={loading}>
        {loading ? '⏳ Enregistrement...' : '✅ Enregistrer la commande'}
      </button>

      <ToastContainer position="top-right" autoClose={5000} />
    </div>
  );
}

const inputStyle = {
  width: '100%',
  padding: '0.75rem',
  marginBottom: '1rem',
  borderRadius: '8px',
  border: '1px solid #ccc'
};

const buttonStyle = {
  padding: '1rem 2rem',
  backgroundColor: '#4caf50',
  color: '#fff',
  border: 'none',
  borderRadius: '8px',
  cursor: 'pointer',
  fontSize: '1rem'
};
