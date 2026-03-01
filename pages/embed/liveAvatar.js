import { useRouter } from "next/router";
import { useEffect, useRef } from "react";

export default function LiveAvatarEmbed() {
  const router = useRouter();
  const { sessionId } = router.query;
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = true;
      videoRef.current.play().catch(() => {});
    }
  }, []);

  if (!sessionId) return null;

  const openApp = () => {
    const deepLink = `fritok://liveAvatar?sessionId=${sessionId}`;
    window.location.href = deepLink;

    setTimeout(() => {
      window.location.href =
        "https://play.google.com/store/apps/details?id=com.fritok.app";
    }, 1500);
  };

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        background: "black",
        position: "relative",
      }}
    >
      {/* 🎥 PLAYER WEB */}
      <video
        ref={videoRef}
        src={`https://stream.fritok.net/live/${sessionId}.m3u8`}
        autoPlay
        muted
        playsInline
        controls
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
        }}
      />

      {/* 📱 OPEN APP */}
      <button
        onClick={openApp}
        style={{
          position: "absolute",
          bottom: 20,
          left: "50%",
          transform: "translateX(-50%)",
          padding: "14px 20px",
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