import { createClient } from '@supabase/supabase-js';
import * as admin from 'firebase-admin';
import geohash from 'ngeohash';

// Supabase côté serveur
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // ⚠️ sans NEXT_PUBLIC

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Supabase URL ou Service Key manquante');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Firebase Admin côté serveur
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
    databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
  });
}
const firestore = admin.firestore();

export async function handler(event) {
  try {
    const body = JSON.parse(event.body);
    const { videoId, referrer, token, details } = body;

    // Vérification de la vidéo
    const videoDoc = await firestore.collection('video_playlist').doc(videoId).get();
    if (!videoDoc.exists) {
      return { statusCode: 404, body: JSON.stringify({ success: false, message: 'Vidéo introuvable' }) };
    }

    const videoData = videoDoc.data();
    const price = parseFloat(details?.price) || videoData.price || 0;
    const commissionAmount = Math.round(price * 0.05);
    const orderId = `${Date.now()}_${Math.floor(Math.random() * 9999)}`;

    // Coordonnées
    let latitude = details?.latitude || null;
    let longitude = details?.longitude || null;
    let geo = latitude && longitude ? geohash.encode(latitude, longitude) : null;

    // Insertion dans Supabase
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
