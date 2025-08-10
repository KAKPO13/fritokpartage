// app/smartlink/[vendorId]/SmartlinkClient.js
"use client";

import { useEffect, useState } from 'react';
import styles from '../../../styles/Smartlink.module.css';

export default function SmartlinkClient({ vendorId }) {
  const [videos, setVideos] = useState([]);

  useEffect(() => {
    fetch(`/api/videos/${vendorId}`)
      .then(res => res.json())
      .then(setVideos);
  }, [vendorId]);

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
