import { useRouter } from "next/router";

export default function GuestLive() {
  const router = useRouter();
  const { sessionId } = router.query;

  return (
    <main style={{ padding: 24 }}>
      <h2>👀 Live en cours</h2>
      <p>Vous regardez le live en mode invité</p>

      <div style={{ marginTop: 20 }}>
        <iframe
          src={`https://fritok.net/embed/liveAvatar?sessionId=${sessionId}`}
          width="100%"
          height="500"
          style={{ borderRadius: 12 }}
        />
      </div>

      <button
        style={{ marginTop: 20, padding: 12 }}
        onClick={() => router.push("/login")}
      >
        🔐 Se connecter pour commenter & acheter
      </button>
    </main>
  );
}