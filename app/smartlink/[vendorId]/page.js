import styles from '../../../styles/Smartlink.module.css';

async function fetchVideos(vendorId) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/videos?vendorId=${vendorId}`, {
    next: { revalidate: 60 }
  });

  if (!res.ok) {
    console.error('Erreur API:', res.statusText);
    return [];
  }

  const data = await res.json();
  return data.videos || [];
}

export default async function SmartlinkPage({ params }) {
  const videos = await fetchVideos(params.vendorId);

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


