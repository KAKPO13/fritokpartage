import { useRouter } from "next/router";
import { useEffect, useRef, useState } from "react";

export default function LiveAvatarEmbed() {
  const router = useRouter();
  const { sessionId } = router.query;
  const videoRef = useRef(null);

  const [live, setLive] = useState(null);

  useEffect(() => {
    if (!sessionId) return;

    fetch(`/api/live?sessionId=${sessionId}`)
      .then((r) => r.json())
      .then(setLive)
      .catch(console.error);
  }, [sessionId]);

  useEffect(() => {
    if (videoRef.current && live?.avatarVideoUrl) {
      videoRef.current.muted = true;
      videoRef.current.play().catch(() => {});
    }
  }, [live]);

  if (!live) {
    return (
      <div style={{ color: "white", padding: 20 }}>
        Chargement du live…
      </div>
    );
  }

  const openApp = () => {
    window.location.href = `fritok://liveAvatar?sessionId=${sessionId}`;
    setTimeout(() => {
      window.location.href =
        "https://play.google.com/store/apps/details?id=com.fritok.app";
    }, 1500);
  };

  return (
    <div style={{ width: "100vw", height: "100vh", background: "black" }}>
      {/* 🎥 VIDEO */}
      <video
        ref={videoRef}
        src={live.avatarVideoUrl}
        autoPlay
        muted
        playsInline
        controls
        preload="auto"
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
        }}
      />

      {/* 📱 OUVRIR APP */}
      <button
        onClick={openApp}
        style={{
          position: "absolute",
          bottom: 20,
          left: "50%",
          transform: "translateX(-50%)",
          padding: "14px 22px",
          borderRadius: 30,
          background: "#ff0044",
          color: "white",
          fontWeight: "bold",
          border: "none",
        }}
      >
        📱 Ouvrir dans l’app
      </button>
    </div>
  );
}