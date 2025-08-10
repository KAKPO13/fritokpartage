'use client';

async function fetchVideos(vendorId) {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/videos?vendorId=${vendorId}`);
    if (!res.ok) throw new Error('Erreur API');
    const data = await res.json();
    return data.videos || [];
  } catch (error) {
    console.error('Erreur fetchVideos:', error);
    return null;
  }
}

export default async function SmartlinkPage({ params }) {
  const { vendorId } = params;

  const containerStyle = {
    padding: '2rem',
    textAlign: 'center',
    fontFamily: 'sans-serif',
  };

  const videoCardStyle = {
    marginBottom: '2rem',
    border: '1px solid #ccc',
    padding: '1rem',
    borderRadius: '8px',
  };

  if (!vendorId) {
    return (
      <div style={containerStyle}>
        <p>❌ Paramètre <code>vendorId</code> manquant.</p>
      </div>
    );
  }

  const videos = await fetchVideos(vendorId);

  if (videos === null) {
    return (
      <div style={containerStyle}>
        <p>⚠️ Une erreur est survenue lors du chargement des vidéos.</p>
      </div>
    );
  }

  if (videos.length === 0) {
    return (
      <div style={containerStyle}>
        <p>📭 Aucun contenu disponible pour ce vendeur.</p>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      {videos.map((video, index) => (
        <div key={index} style={videoCardStyle}>
          <video src={video.url} controls style={{ width: '100%' }} />
          <p>{video.title}</p>
        </div>
      ))}
    </div>
  );
}
