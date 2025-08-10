'use client'; // 👈 à ajouter tout en haut

import styles from './page.module.css';


async function fetchVideos(vendorId) {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/videos?vendorId=${vendorId}`);
    if (!res.ok) throw new Error('Erreur API');
    const data = await res.json();
    return data.videos || [];
  } catch (error) {
    console.error('Erreur fetchVideos:', error);
    return null; // null pour distinguer erreur réseau vs liste vide
  }
}

export default async function SmartlinkPage({ params }) {
  const { vendorId } = params;

  if (!vendorId) {
    return (
      <div className={styles.container}>
        <p>❌ Paramètre <code>vendorId</code> manquant.</p>
      </div>
    );
  }

  const videos = await fetchVideos(vendorId);

  if (videos === null) {
    return (
      <div className={styles.container}>
        <p>⚠️ Une erreur est survenue lors du chargement des vidéos.</p>
      </div>
    );
  }

  if (videos.length === 0) {
    return (
      <div className={styles.container}>
        <p>📭 Aucun contenu disponible pour ce vendeur.</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {videos.map((video, index) => (
        <div key={index} className={styles.videoCard}>
          <video src={video.url} controls />
          <p>{video.title}</p>
        </div>
      ))}
    </div>
  );
}

