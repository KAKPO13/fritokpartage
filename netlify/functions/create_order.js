import { createClient } from '@supabase/supabase-js';
import * as admin from 'firebase-admin';
import geohash from 'ngeohash';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Supabase URL ou Service Key manquante');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

if (!admin.apps.length) admin.initializeApp();
const firestore = admin.firestore();

export async function handler(event) {
  try {
    const body = JSON.parse(event.body);
    const { videoId, referrer, token, details } = body;

    // 🔹 Vérification de la vidéo
    const videoDoc = await firestore.collection('video_playlist').doc(videoId).get();
    if (!videoDoc.exists) {
      return { statusCode: 404, body: JSON.stringify({ success: false, message: 'Vidéo introuvable' }) };
    }

    const videoData = videoDoc.data();
    const price = parseFloat(details?.price) || videoData.price || 0;
    const commissionAmount = Math.round(price * 0.05); // 5% de commission
    const orderId = `${Date.now()}_${Math.floor(Math.random() * 9999)}`;

    // 🔹 Préparation des coordonnées
    let latitude = details?.latitude || null;
    let longitude = details?.longitude || null;
    let geo = null;
    if (latitude && longitude) {
      geo = geohash.encode(latitude, longitude);
    }

    // 🔹 Insertion dans Supabase
    const { error } = await supabase.from('orders').insert([{
      order_id: orderId,
      video_id: videoId,
      referrer,
      token,
      price,
      commission: commissionAmount,
      latitude,
      longitude,
      geohash: geo,
      address: details?.address || '',
      phone: details?.phone || '',
      observations: details?.observations || '',
      status: 'pending',
      timestamp: new Date().toISOString()
    }]);

    if (error) {
      console.error('❌ Supabase insert error:', error);
      return { statusCode: 500, body: JSON.stringify({ success: false, message: error.message }) };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, orderId })
    };

  } catch (err) {
    console.error('❌ create_order error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, message: err.message })
    };
  }
}
