'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebaseClient'; // ✅ correction
import { collection, doc, setDoc } from 'firebase/firestore';
import geohash from 'ngeohash';
import { toast, ToastContainer } from 'react-toastify';
import { createClient } from '@supabase/supabase-js';
import 'react-toastify/dist/ReactToastify.css';

// Supabase config
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);


export default function AddCommandeForm({ userId, token }) {
  const [imageFile, setImageFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [latitude, setLatitude] = useState(null);
  const [longitude, setLongitude] = useState(null);
  const [address, setAddress] = useState('');
  const [codePays, setCodePays] = useState('+225');
  const [telephone, setTelephone] = useState('');
  const [observations, setObservations] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

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
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const uploadImageToSupabase = async (file, commandeId) => {
    setUploading(true);
    const filePath = `imageproduit/${commandeId}-${Date.now()}.${file.name.split('.').pop()}`;
    try {
      const { error } = await supabase.storage.from('imageproduit').upload(filePath, file);
      if (error) throw error;
      const { data: publicUrlData } = supabase.storage.from('imageproduit').getPublicUrl(filePath);
      setUploading(false);
      return publicUrlData.publicUrl;
    } catch (error) {
      setUploading(false);
      toast.error("❌ Échec du téléchargement de l'image.");
      throw error;
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!imageFile || !address.trim() || !telephone.trim() || !codePays.trim() || !latitude || !longitude) {
      toast.warn("⚠️ Tous les champs requis doivent être remplis.");
      return;
    }

    const numeroComplet = `${codePays.trim()}${telephone.trim()}`;
    const regexTelComplet = /^\+\d{1,4}\d{8,15}$/;
    if (!regexTelComplet.test(numeroComplet)) {
      toast.warn("⚠️ Numéro de téléphone complet invalide.");
      return;
    }

    setLoading(true);
    const hash = geohash.encode(latitude, longitude);
    const docRef = doc(collection(db, 'commandes'));
    const commandeId = docRef.id;

    try {
      const imageUrl = await uploadImageToSupabase(imageFile, commandeId);

      const commande = {
        articles: [
          {
            nom_frifri: 'capture écran',
            prix_frifri: 0,
            ref_article: userId ?? '',
            imageUrl: imageUrl,
            videoUrl: '',
            token: token ?? ''
          }
        ],
        totalPrix: 0,
        latitude,
        longitude,
        geohash: hash,
        adresseLivraison: address,
        phone: numeroComplet,
        observations: observations ?? '',
        statut: 'en attente',
        userId: userId ?? '',
        boutiqueId: '',
        commandeId,
        date: new Date().toISOString()
      };

      await setDoc(docRef, commande);
      toast.success('✅ Commande enregistrée avec succès !');

      setImageFile(null);
      setPreviewUrl(null);
      setTelephone('');
      setCodePays('+225');
      setObservations('');
      setAddress('');
    } catch (error) {
      console.error('Erreur enregistrement :', error);
      toast.error('❌ Échec de l’enregistrement.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <fieldset style={{ border: '1px solid #ddd', borderRadius: '8px', padding: '1rem' }}>
        <legend><h2>📦 Nouvelle commande par capture d'écran</h2></legend>
        <p>🖼️ Ajouter ici la capture d'écran du produit prise lors du live ou d'une vidéo de mon compte, pour lancer votre commande.</p>

        <input type="file" accept="image/*" onChange={handleImageUpload} style={inputStyle} />
        {imageFile && <p>📸 Image sélectionnée : {imageFile.name}</p>}

        {previewUrl && (
          <div style={{ marginBottom: '1rem' }}>
            <p>🖼️ Aperçu :</p>
            <img src={previewUrl} alt="Aperçu" style={{ maxWidth: '100%', borderRadius: '8px' }} />
          </div>
        )}

        {uploading && (
          <div style={{ marginBottom: '1rem' }}>
            <p>⏳ Téléchargement de l’image en cours...</p>
            <div className="spinner" />
          </div>
        )}

        <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="🏠 Adresse" style={inputStyle} />
        <select value={codePays} onChange={(e) => setCodePays(e.target.value)} style={inputStyle}>
  <option value="+225">🇨🇮 Côte d’Ivoire (+225)</option>
  <option value="+229">🇧🇯 Bénin (+229)</option>
  <option value="+228">🇹🇬 Togo (+228)</option>
</select>

        <input type="text" value={telephone} onChange={(e) => setTelephone(e.target.value)} placeholder="📱 Numéro de téléphone" style={inputStyle} />
        <textarea value={observations} onChange={(e) => setObservations(e.target.value)} placeholder="📝 Observations" rows={4} style={{ ...inputStyle, resize: 'vertical' }} />

        <button type="submit" style={{ ...buttonStyle, opacity: loading ? 0.6 : 1 }} disabled={loading}>
          {loading ? '⏳ Enregistrement...' : '✅ Enregistrer la commande'}
        </button>
      </fieldset>

      <ToastContainer position="top-right" autoClose={5000} />

      <style jsx>{`
        .spinner {
          border: 4px solid #f3f3f3;
          border-top: 4px solid #4caf50;
          border-radius: 50%;
          width: 30px;
          height: 30px;
          animation: spin 1s linear infinite;
          margin: auto;
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </form>
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
  fontSize: '1rem',
  transition: 'opacity 0.3s ease'
};
