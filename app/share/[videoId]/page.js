import { doc, getDoc, getFirestore, collection, addDoc } from 'firebase/firestore';
import { initializeApp } from 'firebase/app';
import Link from 'next/link';

const firebaseConfig = {
  apiKey: "AIzaSyDKKayop62AaoC5DnYz5UuDpJIT3RBRX3M",
  authDomain: "cgsp-app.firebaseapp.com",
  projectId: "cgsp-app",
  storageBucket: "cgsp-app.appspot.com",
  messagingSenderId: "463987328508",
  appId: "1:463987328508:android:829287eef68a37af739e79"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export const dynamic = 'force-dynamic';

export default async function Page({ params, searchParams }) {
  const { videoId } = params;
  const { ref, token } = searchParams;

  // 🔐 Tracking du partage
  if (videoId && ref && token) {
    try {
      await addDoc(collection(db, 'share_events'), {
        videoId,
        referrer: ref,
        token,
        timestamp: new Date().toISOString(),
        source: 'web',
      });
    } catch (error) {
      console.error('Erreur Firestore :', error);
    }
  }

  // 🔍 Récupération des infos produit
  const docRef = doc(db, "video_playlist", videoId);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) {
    return (
      <main style={{ textAlign: 'center', padding: '2rem' }}>
        <h1>🎬 Vidéo introuvable</h1>
        <p>Le lien que vous avez suivi ne correspond à aucune vidéo.</p>
      </main>
    );
  }

  const data = docSnap.data();
  const price = new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR'
  }).format(data.price || 4.99);

  const purchaseUrl = `/buy/${videoId}?ref=${ref || 'direct'}&token=${token || 'none'}`;

  return (
    <main style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>{data.title}</h1>

      {data.thumbnail && (
        <img
          src={data.thumbnail}
          alt={`Aperçu de ${data.title}`}
          style={{
            width: '100%',
            maxWidth: '600px',
            marginBottom: '1rem',
            borderRadius: '12px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
          }}
        />
      )}

      <video src={data.url} controls style={{ width: '100%', maxWidth: '600px', marginBottom: '1rem' }} />
      <p>{data.description}</p>
      <p><strong>Prix :</strong> {price}</p>
      {ref && <p>🔗 Partagé par : {ref}</p>}

      <Link href={purchaseUrl}>
        <button style={{
          marginTop: '1rem',
          padding: '1rem 2rem',
          backgroundColor: '#00C851',
          color: '#fff',
          border: 'none',
          borderRadius: '8px',
          cursor: 'pointer',
          fontSize: '1rem'
        }}>
          🛒 Acheter maintenant
        </button>
      </Link>
    </main>
  );
}







