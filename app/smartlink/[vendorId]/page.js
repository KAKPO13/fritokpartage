import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { getFirestore, collection, query, where, getDocs } from 'firebase/firestore';
import { initializeApp } from 'firebase/app';
import styles from '../../styles/Smartlink.module.css';

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

export default function SmartlinkPage({ initialVideos }) {
  const [videos, setVideos] = useState(initialVideos);
  const router = useRouter();
  const { vendorId } = router.query;

  function handleBuy(video) {
    alert(`Tu veux acheter : ${video.title}`);
    // Optionnel : router.push(`/produit/${video.id}`);
  }

  return (
    <div className={styles.container}>
      <h1>🎥 Produits du vendeur</h1>
      <div className={styles.grid}>
        {videos.map((video) => (
          <div key={video.id} className={styles.card}>
            <video controls width="100%" src={video.videoUrl} />
            <div className={styles.meta}>
              <img src={video.avatarUrl || '/default-avatar.png'} alt="Avatar" className={styles.avatar} />
              <h3>{video.title}</h3>
            </div>
            <p>{video.description}</p>
            <div className={styles.actions}>
              <button className={styles.likeButton}>❤️ {video.likes || 0}</button>
              <button className={styles.buyButton} onClick={() => handleBuy(video)}>Acheter</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export async function getServerSideProps(context) {
  const { vendorId } = context.params;
  const db = getFirestore(initializeApp(firebaseConfig));

  const q = query(collection(db, 'video_playlist'), where('vendorId', '==', vendorId));
  const querySnapshot = await getDocs(q);

  const videos = querySnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));

  return {
    props: {
      initialVideos: videos
    }
  };
}
