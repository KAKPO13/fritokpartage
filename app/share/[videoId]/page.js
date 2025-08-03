import { collection, addDoc } from 'firebase/firestore';
import { db } from '@/firebaseConfig'; // ajuste le chemin si nécessaire
import Link from 'next/link';

export default async function Page({ params, searchParams }) {
  const { videoId } = params;
  const ref = searchParams?.ref || null;
  const token = searchParams?.token || null;

  // Enregistrement dans Firestore
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

  // Construction du lien d’achat avec tracking
  const purchaseUrl = `/buy/${videoId}?ref=${ref || 'direct'}&token=${token || 'none'}`;

  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>🎬 Vidéo partagée : {videoId}</h1>
      {ref && <p>🔗 Référent : {ref}</p>}
      {token && <p>🛡️ Jeton : {token}</p>}

      <Link href={purchaseUrl}>
        <button style={{
          marginTop: '1rem',
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




