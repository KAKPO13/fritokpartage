import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { collection, addDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig'; // adapte selon ton chemin

export default function SharePage() {
  const router = useRouter();
  const { videoId, ref, token } = router.query;

  useEffect(() => {
    if (videoId && ref && token) {
      logShareEvent(videoId, ref, token);
    }
  }, [videoId, ref, token]);

  const logShareEvent = async (videoId, ref, token) => {
    try {
      await addDoc(collection(db, "share_events"), {
        videoId,
        ref,
        token,
        timestamp: new Date().toISOString(),
        source: "web"
      });
    } catch (error) {
      console.error("Erreur lors du tracking du partage :", error);
    }
  };

  const handleBuyClick = () => {
    const buyUrl = `https://fritok.netlify.app/buy/${videoId}?ref=${ref}&token=${token}`;
    window.location.href = buyUrl;
  };

  return (
    <div style={{ textAlign: 'center', padding: '2rem' }}>
      <h1>🎬 Vidéo partagée</h1>
      {videoId ? (
        <>
          <video src={`https://yourcdn.com/videos/${videoId}.mp4`} controls width="600" />
          <br />
          <button
            onClick={handleBuyClick}
            style={{
              marginTop: '1rem',
              padding: '1rem 2rem',
              fontSize: '1.2rem',
              backgroundColor: '#00C851',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer'
            }}
          >
            Acheter 🛒
          </button>
        </>
      ) : (
        <p>Chargement de la vidéo...</p>
      )}
    </div>
  );
}


