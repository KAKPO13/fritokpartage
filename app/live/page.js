"use client";
import React, { useEffect, useRef } from "react";

export default function LivePage({ searchParams }) {
  const { channel, token } = searchParams;
  const localRef = useRef(null);
  const remoteRef = useRef(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let client, micTrack, camTrack;

    async function initAgora() {
      try {
        const AgoraRTC = (await import("agora-rtc-sdk-ng")).default;

        const appId = process.env.NEXT_PUBLIC_AGORA_APP_ID;
        const uid = Math.floor(Math.random() * 10000);

        // ✅ Utiliser "rtc" pour une visio classique
        client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });

        await client.join(appId, channel, token, uid);

        [micTrack, camTrack] = await AgoraRTC.createMicrophoneAndCameraTracks();

        // ✅ Affiche la vidéo locale
        if (localRef.current) {
          camTrack.play(localRef.current);
        }

        await client.publish([micTrack, camTrack]);
        console.log("Local tracks publiés");

        // ✅ Gestion des flux distants
        client.on("user-published", async (user, mediaType) => {
          console.log("User published:", user.uid, mediaType);
          await client.subscribe(user, mediaType);

          if (mediaType === "video" && remoteRef.current) {
            console.log("Lecture de la vidéo distante");
            user.videoTrack.play(remoteRef.current);
          }
          if (mediaType === "audio") {
            console.log("Lecture de l’audio distant");
            user.audioTrack.play();
          }
        });
      } catch (err) {
        console.error("Erreur Agora:", err);
      }
    }

    if (channel && token) initAgora();

    // ✅ Nettoyage à la fin
    return () => {
      if (client) {
        client.leave();
      }
      micTrack?.close();
      camTrack?.close();
      if (localRef.current) localRef.current.innerHTML = "";
      if (remoteRef.current) remoteRef.current.innerHTML = "";
    };
  }, [channel, token]);

  return (
    <main>
      <h1>🎥 Live Agora</h1>
      <div
        ref={localRef}
        style={{ width: "100%", height: "240px", background: "black" }}
      ></div>
      <div
        ref={remoteRef}
        style={{ width: "100%", height: "240px", background: "black" }}
      ></div>
    </main>
  );
}
