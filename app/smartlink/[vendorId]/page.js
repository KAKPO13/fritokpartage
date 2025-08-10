// app/smartlink/[vendorId]/page.js

import styles from '../../../styles/Smartlink.module.css';
import { getFirestore, collection, query, where, getDocs } from 'firebase/firestore';
import { initializeApp } from 'firebase/app';

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

async function getVideos(vendorId) {
  const q = query(collection(db, 'video_playlist'), where('vendorId', '==', vendorId));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

export default async function SmartlinkPage({ params }) {
  const videos = await getVideos(params.vendorId);

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
              <button className={styles.buyButton}>Acheter</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


