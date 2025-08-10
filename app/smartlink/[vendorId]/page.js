'use client';

import { useState } from 'react';
import styles from '../../styles/Smartlink.module.css';

export default function SmartlinkPage({ initialVideos }) {
  const [videos] = useState(initialVideos);

  function handleBuy(video) {
    alert(`Tu veux acheter : ${video.title}`);
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
