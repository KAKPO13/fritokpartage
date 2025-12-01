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
      try {
        const AgoraRTC = (await import("agora-rtc-sdk-ng")).default;

        const appId = process.env.NEXT_PUBLIC_AGORA_APP_ID;
        const uid = Math.floor(Math.random() * 10000);

        client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
        await client.join(appId, channel, token, uid);

        client.on("user-published", async (user, mediaType) => {
          await client.subscribe(user, mediaType);
          if (mediaType === "video" && remoteRef.current) {
            user.videoTrack.play(remoteRef.current);
          }
          if (mediaType === "audio") {
            user.audioTrack.play();
          }
        });

        client.on("user-unpublished", (user) => {
          if (remoteRef.current) remoteRef.current.innerHTML = "";
        });
      } catch (err) {
        console.error("Erreur Agora:", err);
      }
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

  // ✅ Envoi d’un message dans Firestore
  const sendMessage = async () => {
    if (input.trim() !== "") {
      await addDoc(collection(db, "channels", channel, "messages"), {
        user: "Moi",
        text: input,
        timestamp: new Date(),
      });
      setInput("");
    }
  };

  return (
    <main style={{ display: "flex", flexDirection: "row", height: "100vh" }}>
      {/* Zone vidéo distante */}
      <div
        ref={remoteRef}
        style={{ flex: 2, background: "black", display: "flex", alignItems: "center", justifyContent: "center" }}
      >
        <h2 style={{ color: "white" }}>🎥 Flux distant</h2>
      </div>

      {/* Zone chat connecté à Firestore */}
      <div style={{ flex: 1, background: "#111", color: "white", display: "flex", flexDirection: "column" }}>
        <h2 style={{ padding: "10px" }}>💬 Chat en direct</h2>
        <div style={{ flex: 1, overflowY: "auto", padding: "10px" }}>
          {messages.map((msg, i) => (
            <p key={i}>
              <strong>{msg.user}:</strong> {msg.text}
            </p>
          ))}
        </div>
        <div style={{ display: "flex", padding: "10px" }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            style={{ flex: 1, padding: "5px" }}
            placeholder="Écris un message..."
          />
          <button onClick={sendMessage} style={{ marginLeft: "5px" }}>
            Envoyer
          </button>
        </div>
      </div>
    </main>
  );
}
