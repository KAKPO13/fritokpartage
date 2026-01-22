import BuyPageClient from '@/components/BuyPageClient';
import MiniChat from '@/components/MiniChat';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebaseConfig';

export const dynamic = 'force-dynamic';

export default async function Page({ params, searchParams }) {
  const { videoId } = params;
  const { ref = null, token = null } = searchParams || {};

  const docRef = doc(db, 'video_playlist', videoId);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) return <h1>🎬 Vidéo introuvable</h1>;

  const data = docSnap.data();
  const price = typeof data.price === 'number' ? data.price : parseFloat(data.price) || 0;

  return (
    <main style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>{data.title}</h1>
      <p>Prix : {price.toLocaleString('fr-FR', { style: 'currency', currency: 'XOF' })}</p>
      <video src={data.url} controls poster={data.thumbnail} style={{ width: '100%', maxWidth: '600px' }} />
      <p>{data.description}</p>
      <BuyPageClient
        title={data.product.name}
        videoUrl={data.url}
        thumbnail={data.thumbnail}
        description={data.description}
        referrer={ref}
        token={token}
      />
      <MiniChat videoId={videoId} />
    </main>
  );
}