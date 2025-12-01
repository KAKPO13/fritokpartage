"use client";
import React, { useEffect, useRef } from "react";

export default function LivePage({ searchParams }) {
  const { channel, token } = searchParams;
  const localRef = useRef(null);
  const remoteRef = useRef(null);

  useEffect(() => {
    // ✅ Vérifie que le code s'exécute côté client
    if (typeof window === "undefined") return;

    async function initAgora() {
      const AgoraRTC = (await import("agora-rtc-sdk-ng")).default;

      const appId = process.env.NEXT_PUBLIC_AGORA_APP_ID;
      const uid = Math.floor(Math.random() * 10000);
      const client = AgoraRTC.createClient({ mode: "live", codec: "vp8" });

      await client.join(appId, channel, token, uid);

      const [micTrack, camTrack] = await AgoraRTC.createMicrophoneAndCameraTracks();
      camTrack.play(localRef.current);
      await client.publish([micTrack, camTrack]);

      client.on("user-published", async (user, mediaType) => {
        await client.subscribe(user, mediaType);
        if (mediaType === "video") user.videoTrack.play(remoteRef.current);
        if (mediaType === "audio") user.audioTrack.play();
      });
    }

    if (channel && token) initAgora();
  }, [channel, token]);

  return (
    <main>
      <h1>🎥 Live Agora</h1>
      <div ref={localRef} style={{ width: "100%", height: "240px", background: "black" }}></div>
      <div ref={remoteRef} style={{ width: "100%", height: "240px", background: "black" }}></div>
    </main>
  );
}
