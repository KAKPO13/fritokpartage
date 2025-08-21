'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebaseConfig';
import { collection, doc, setDoc } from 'firebase/firestore';
import geohash from 'ngeohash';
import { toast, ToastContainer } from 'react-toastify';
import { createClient } from '@supabase/supabase-js';
import 'react-toastify/dist/ReactToastify.css';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export default function AddCommandeForm({ userId, token }) {
  const [imageFile, setImageFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [latitude, setLatitude] = useState(null);
  const [longitude, setLongitude] = useState(null);
  const [address, setAddress] = useState('');
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
          toast.error("❌ Impossible d'obtenir l'adresse.");
        }
      },
      () => toast.error("❌ Impossible d'obtenir votre position."),
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
    const { error } = await supabase.storage.from('imageproduit').upload(filePath, file);
    if (error) {
      setUploading(false);
      throw error;
    }
    const { data: publicUrlData } = supabase.storage.from('imageproduit').getPublicUrl(filePath);
    setUploading(false);
    return publicUrlData.publicUrl;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!imageFile || !address.trim() || !telephone.trim() || !latitude || !longitude) {
      toast.warn("⚠️ Tous les champs requis doivent être remplis.");
      return;
    }

    if (!/^[0-9]{8,15}$/.test(telephone.trim())) {
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
        imageArticle: imageUrl,
        totalPrix: 0,
        latitude,
        longitude,
        geohash: hash,
        adresseLivraison: address,
        telephone: telephone.trim(),
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
      setObservations('');
      setAddress('');
    } catch (error) {
      toast.error('❌ Échec de l’enregistrement.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl mx-auto p-4 md:p-6 bg-white rounded-lg shadow-md">
      <fieldset className="space-y-4">
        <legend className="text-xl font-semibold text-gray-800 mb-2">📦 Nouvelle commande</legend>

        <input type="file" accept="image/*" onChange={handleImageUpload} className="w-full border rounded px-3 py-2" />
        {imageFile && <p className="text-sm text-gray-600">📸 Image sélectionnée : {imageFile.name}</p>}

        {previewUrl && (
          <div>
            <p className="text-sm text-gray-700 mb-1">🖼️ Aperçu :</p>
            <img src={previewUrl} alt="Aperçu" className="w-full max-h-64 object-cover rounded" />
          </div>
        )}

        {uploading && (
          <div className="flex items-center gap-2 text-green-600">
            <div className="animate-spin h-5 w-5 border-4 border-green-400 border-t-transparent rounded-full"></div>
            <span>Téléchargement en cours...</span>
          </div>
        )}

        <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="🏠 Adresse" className="w-full border rounded px-3 py-2" />
        <input type="text" value={telephone} onChange={(e) => setTelephone(e.target.value)} placeholder="📱 Téléphone" className="w-full border rounded px-3 py-2" />
        <textarea value={observations} onChange={(e) => setObservations(e.target.value)} placeholder="📝 Observations" rows={4} className="w-full border rounded px-3 py-2 resize-y" />

        <button type="submit" disabled={loading} className={`w-full py-2 px-4 rounded text-white font-semibold transition ${loading ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'}`}>
          {loading ? '⏳ Enregistrement...' : '✅ Enregistrer la commande'}
        </button>
      </fieldset>

      <ToastContainer position="top-right" autoClose={5000} />
    </form>
  );
}
