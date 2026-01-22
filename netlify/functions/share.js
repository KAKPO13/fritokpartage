import { createClient } from '@supabase/supabase-js';
import * as admin from 'firebase-admin';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEYY;

if (!supabaseUrl || !supabaseServiceKey) throw new Error('Supabase URL ou Service Key manquante');

const supabase = createClient(supabaseUrl, supabaseServiceKey);

if (!admin.apps.length) admin.initializeApp();
const firestore = admin.firestore();

export async function handler(event) {
  const { videoId, ref, token, userId } = event.queryStringParameters || {};
  if (!videoId) return { statusCode: 400, body: '❌ videoId requis' };

  const docSnap = await firestore.collection('video_playlist').doc(videoId).get();
  if (!docSnap.exists) return { statusCode: 404, body: 'Vidéo introuvable' };

  const data = docSnap.data();

  if (token && ref && userId) {
    await supabase
      .from('share_events')
      .insert([{ video_id: videoId, referrer: ref, token, user_id: userId, timestamp: new Date().toISOString(), title: data.title, image_url: data.thumbnail, price: data.price || 0 }]);
  }

  const html = `
    <html>
      <head>
        <title>${data.title}</title>
        <meta property="og:title" content="${data.title}" />
        <meta property="og:description" content="${data.description || 'Découvrez cette vidéo sur FriTok.'}" />
        <meta property="og:image" content="${data.thumbnail}" />
        <meta http-equiv="refresh" content="0; url=/share/${videoId}?ref=${ref||'direct'}&token=${token||'none'}" />
      </head>
      <body><p>Redirection...</p></body>
    </html>`;
  
  return { statusCode: 200, headers: { 'Content-Type': 'text/html' }, body: html };
}