import { useRouter } from "next/router";

export default function PublicLive() {
  const { sessionId } = useRouter().query;

  if (!sessionId) return null;

  return (
    <main style={{ padding: 24 }}>
      <h2>🔴 Live shopping en direct</h2>

      <iframe
        src={`/embed/liveAvatar?sessionId=${sessionId}`}
        width="100%"
        height="520"
        style={{ borderRadius: 12 }}
      />

      <button
        style={{ marginTop: 20, padding: 12 }}
        onClick={() =>
          (window.location.href = `fritok://liveAvatar?sessionId=${sessionId}`)
        }
      >
        📱 Ouvrir dans l’app
      </button>
    </main>
  );
}