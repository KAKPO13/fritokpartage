import BuyPageClient from '@/components/BuyPageClient';
import MiniChat from '@/components/MiniChat';
import { adminDb } from '@/lib/firebaseAdmin';

export const dynamic = 'force-dynamic';

// ✅ Métadonnées SEO / Open Graph
export async function generateMetadata({ params }) {
  console.log("videoId reçu:", params?.videoId); // ✅ log direct
  return { title: "FriTok" };
}

export default async function Page({ params, searchParams }) {
  console.log("params reçu:", JSON.stringify(params));       // ✅ affiche l’objet brut
  console.log("searchParams reçu:", JSON.stringify(searchParams)); // ✅ affiche ref et token

  const { videoId } = params || {};
  const { ref = null, token = null } = searchParams || {};

  if (!videoId) {
    return <h1>❌ Paramètre videoId invalide</h1>;
  }

  let docSnap;
  try {
    docSnap = await adminDb.collection('video_playlist').doc(videoId).get();
  } catch (err) {
    return (
      <main style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
        <h1>⚠️ Erreur Firestore</h1>
        <p>{err.message}</p>
      </main>
    );
  }

  if (!docSnap.exists) {
    return (
      <main style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
        <h1>🎬 Vidéo introuvable</h1>
        <p>Le document <strong>{videoId}</strong> n’existe pas dans Firestore.</p>
      </main>
    );
  }

  const data = docSnap.data();
  const price = Number.isFinite(data.price)
    ? data.price
    : parseFloat(data.price) || 0;

  return (
    <main style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>{data.title}</h1>
      <p>
        Prix :{' '}
        {price.toLocaleString('fr-FR', {
          style: 'currency',
          currency: 'XOF',
        })}
      </p>

      <video
        src={data.url}
        controls
        poster={data.thumbnail}
        aria-label={`Vidéo ${data.title}`}
        style={{ width: '100%', maxWidth: '600px', borderRadius: '8px' }}
      />

      <p style={{ marginTop: '1rem' }}>{data.description}</p>

      <BuyPageClient
        title={data.product?.name}
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
