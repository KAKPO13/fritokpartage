"use client";
import React, { useEffect, useRef, useState } from "react";
import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, onSnapshot, orderBy, query } from "firebase/firestore";

export default function LivePage({ searchParams }) {
  const { channel, token } = searchParams;
  const remoteRef = useRef(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");

  // ✅ Configuration Firebase (remplace par tes vraies clés)
  const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };

  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let client;

    async function initAgora() {
      const AgoraRTC = (await import("agora-rtc-sdk-ng")).default;
      const appId = process.env.NEXT_PUBLIC_AGORA_APP_ID;
      const uid = Math.floor(Math.random() * 10000);

      // ✅ Audience seulement
      client = AgoraRTC.createClient({ mode: "live", codec: "vp8" });
      await client.join(appId, channel, token, uid);
      client.setClientRole("audience");

      client.on("user-published", async (user, mediaType) => {
        await client.subscribe(user, mediaType);
        if (mediaType === "video" && remoteRef.current) {
          user.videoTrack.play(remoteRef.current);
        }
        if (mediaType === "audio") {
          user.audioTrack.play();
        }
      });

      client.on("user-unpublished", () => {
        if (remoteRef.current) remoteRef.current.innerHTML = "";
      });
    }

    if (channel && token) initAgora();

    return () => {
      if (client) client.leave();
      if (remoteRef.current) remoteRef.current.innerHTML = "";
    };
  }, [channel, token]);

  // ✅ Ecoute en temps réel des messages Firestore
  useEffect(() => {
    const q = query(collection(db, "channels", channel, "messages"), orderBy("timestamp", "asc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setMessages(snapshot.docs.map((doc) => doc.data()));
    });
    return () => unsubscribe();
  }, [channel]);

  // ✅ Envoi d’un message
  const sendMessage = async () => {
    if (input.trim() !== "") {
      await addDoc(collection(db, "channels", channel, "messages"), {
        user: "Spectateur",
        text: input,
        timestamp: new Date(),
      });
      setInput("");
    }
  };

  // ✅ Limiter à 3 derniers messages
  const lastMessages = messages.slice(-3);

  return (
    <main style={{ position: "relative", width: "100%", height: "100vh", background: "black" }}>
      {/* Vidéo distante en plein écran */}
      <div
        ref={remoteRef}
        style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", background: "black" }}
      ></div>

      {/* Chat superposé en bas */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          width: "100%",
          background: "rgba(0,0,0,0.5)",
          color: "white",
          padding: "10px",
          fontSize: "14px",
        }}
      >
        {/* Messages (3 max, défilant) */}
        <div style={{ maxHeight: "60px", overflowY: "auto" }}>
          {lastMessages.map((msg, i) => (
            <p key={i} style={{ margin: "2px 0" }}>
              <strong>{msg.user}:</strong> {msg.text}
            </p>
          ))}
        </div>

        {/* Champ de saisie */}
        <div style={{ display: "flex", marginTop: "5px" }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            style={{ flex: 1, padding: "5px", borderRadius: "4px", border: "none" }}
            placeholder="Écris un message..."
          />
          <button
            onClick={sendMessage}
            style={{
              marginLeft: "5px",
              padding: "5px 10px",
              borderRadius: "4px",
              background: "#ff0050",
              color: "white",
              border: "none",
            }}
          >
            Envoyer
          </button>
        </div>
      </div>
    </main>
  );
}
