import { collection, addDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/firebaseConfig';
import Link from 'next/link';

export default async function Page({ params, searchParams }) {
  const { videoId } = params;
  const ref = searchParams?.ref || null;
  const token = searchParams?.token || null;

  // 🔐 Enregistrement du partage
  try {
    await addDoc(collection(db, 'sharedVideos'), {
      videoId,
      referrer: ref,
      token,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Erreur Firestore :', error);
  }

  // 🔍 Récupération de l'URL de la vidéo depuis Firestore
  let videoUrl = null;
  try {
    const q = query(collection(db, 'video_playlist'), where('id', '==', videoId));
    const querySnapshot = await getDocs(q);
    querySnapshot.forEach((doc) => {
      videoUrl = doc.data().url; // Assure-toi que le champ s'appelle bien 'url'
    });
  } catch (error) {
    console.error('Erreur récupération vidéo :', error);
  }

  const purchaseUrl = `/buy/${videoId}?ref=${ref || 'direct'}&token=${token || 'none'}`;

  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>🎬 Vidéo partagée : {videoId}</h1>

      {videoUrl ? (
        <video
          src={videoUrl}
          controls
          style={{ width: '100%', maxWidth: '600px', marginBottom: '1rem' }}
        />
      ) : (
        <p>❌ Vidéo introuvable</p>
      )}

      <Link href={purchaseUrl}>
        <button style={{
          padding: '0.75rem 1.5rem',
          backgroundColor: '#0070f3',
          color: '#fff',
          border: 'none',
          borderRadius: '5px',
          cursor: 'pointer'
        }}>
          🛒 Acheter cette vidéo
        </button>
      </Link>
    </div>
  );
}





