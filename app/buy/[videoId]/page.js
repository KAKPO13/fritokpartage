import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebaseConfig'; // ✅ chemin à adapter selon ta structure
import BuyPageClient from './BuyPageClient';

export const dynamic = 'force-dynamic';

export default async function Page({ params, searchParams }) {
  const { videoId } = params;
 const { ref, token, refArticle } = searchParams;

  try {
    const docRef = doc(db, "video_playlist", videoId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      console.warn(`Document introuvable pour l'ID: ${videoId}`);
      return (
        <main style={{ textAlign: 'center', padding: '2rem' }}>
          <h1>❌ Produit introuvable</h1>
          <p>Aucune vidéo ou produit ne correspond à cet identifiant.</p>
        </main>
      );
    }

    const data = docSnap.data();

    return (
      <BuyPageClient
        title={data.title}
        description={data.description}
        videoUrl={data.url}
        thumbnail={data.thumbnail || null}
        price={data.price || 3000}
        referrer={ref}
        refArticle={refArticle}
        token={token}
      />
    );
  } catch (error) {
    console.error('Erreur Firestore dans /buy/[videoId]:', error);
    return (
      <main style={{ textAlign: 'center', padding: '2rem' }}>
        <h1>🚨 Erreur serveur</h1>
        <p>Impossible de charger les données du produit. Veuillez réessayer plus tard.</p>
      </main>
    );
  }
}
