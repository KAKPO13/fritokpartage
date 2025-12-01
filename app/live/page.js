"use client";
import React, { useEffect, useRef } from "react";
import AgoraRTC from "agora-rtc-sdk-ng";

export default function LivePage({ searchParams }) {
  const { channel, token } = searchParams;
  const localRef = useRef(null);
  const remoteRef = useRef(null);

  useEffect(() => {
    if (!channel || !token) {
      console.warn("❌ Paramètres manquants: channel et token");
      return;
    }

    const appId = "5bbfd51877e2435f87afef0f89cebda3"; // 👉 Remplace par ton App ID Agora
    const uid = Math.floor(Math.random() * 10000); // UID unique

    const client = AgoraRTC.createClient({ mode: "live", codec: "vp8" });

    async function join() {
      try {
        // Rejoindre le canal
        await client.join(appId, channel, token, uid);

        // Tracks locaux (caméra + micro)
        const [micTrack, camTrack] = await AgoraRTC.createMicrophoneAndCameraTracks();
        camTrack.play(localRef.current);
        await client.publish([micTrack, camTrack]);

        // Tracks distants
        client.on("user-published", async (user, mediaType) => {
          await client.subscribe(user, mediaType);
          if (mediaType === "video") {
            user.videoTrack.play(remoteRef.current);
          }
          if (mediaType === "audio") {
            user.audioTrack.play();
          }
        });

        console.log("✅ Rejoint canal:", channel, "UID:", uid);
      } catch (err) {
        console.error("Erreur Agora:", err);
      }
    }

    join();

    return () => {
      client.leave();
    };
  }, [channel, token]);

  return (
    <main style={{ padding: "2rem", fontFamily: "sans-serif" }}>
      <h1>🎥 Live Agora</h1>
      <div
        ref={localRef}
        style={{ width: "100%", height: "240px", background: "black", marginBottom: "1rem" }}
      ></div>
      <div
        ref={remoteRef}
        style={{ width: "100%", height: "240px", background: "black" }}
      ></div>
      <p>Canal : <strong>{channel || "non défini"}</strong></p>
    </main>
  );
}
