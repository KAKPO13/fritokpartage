"use client";
import React, { useEffect, useRef, useState } from "react";
import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, onSnapshot, orderBy, query } from "firebase/firestore";

export default function LivePage({ searchParams }) {
  const { channel, token } = searchParams;
  const remoteRef = useRef(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [likes, setLikes] = useState(0);
  const [showComments, setShowComments] = useState(false);
  const [copiedToast, setCopiedToast] = useState(false);

  // Firebase config
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

  // Agora init (audience)
  useEffect(() => {
    if (typeof window === "undefined") return;
    let client;

    async function initAgora() {
      const AgoraRTC = (await import("agora-rtc-sdk-ng")).default;
      const appId = process.env.NEXT_PUBLIC_AGORA_APP_ID;
      const uid = Math.floor(Math.random() * 10000);

      client = AgoraRTC.createClient({ mode: "live", codec: "vp8" });
      await client.join(appId, channel, token, uid);
      client.setClientRole("audience");

      client.on("user-published", async (user, mediaType) => {
        await client.subscribe(user, mediaType);
        if (mediaType === "video" && remoteRef.current) user.videoTrack.play(remoteRef.current);
        if (mediaType === "audio") user.audioTrack.play();
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

  // Firestore messages (live)
  useEffect(() => {
    if (!channel) return;
    const q = query(collection(db, "channels", channel, "messages"), orderBy("timestamp", "asc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setMessages(snapshot.docs.map((doc) => doc.data()));
    });
    return () => unsubscribe();
  }, [channel, db]);

  // Send message
  const sendMessage = async () => {
    if (input.trim() === "" || !channel) return;
    await addDoc(collection(db, "channels", channel, "messages"), {
      user: "Spectateur",
      text: input.trim(),
      timestamp: new Date(),
    });
    setInput("");
  };

  // Share (navigator.share with clipboard fallback, no alert)
  const handleShare = async () => {
    const shareData = {
      title: "Live en cours",
      text: "Viens voir ce live 🔴",
      url: typeof window !== "undefined" ? window.location.href : "",
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else if (navigator.clipboard && shareData.url) {
        await navigator.clipboard.writeText(shareData.url);
        setCopiedToast(true);
      }
    } catch (err) {
      // Optionally show a non-blocking toast on error
      console.error("Erreur partage:", err);
    }
  };

  // Hide toast automatically
  useEffect(() => {
    if (!copiedToast) return;
    const t = setTimeout(() => setCopiedToast(false), 2000);
    return () => clearTimeout(t);
  }, [copiedToast]);

  const lastMessages = messages.slice(-3);

  return (
    <main style={{ position: "relative", width: "100%", height: "100vh", background: "black" }}>
      {/* Remote video */}
      <div
        ref={remoteRef}
        style={{ position: "absolute", inset: 0, background: "black" }}
      />

      {/* LIVE badge */}
      <div
        style={{
          position: "absolute",
          top: 10,
          left: 10,
          background: "red",
          color: "white",
          padding: "5px 10px",
          borderRadius: 20,
          fontWeight: "bold",
          animation: "blink 1s infinite",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
        aria-label="Live en cours"
      >
        <span style={{ display: "inline-block", width: 8, height: 8, background: "white", borderRadius: "50%" }} />
        LIVE
      </div>

      {/* Social buttons */}
      <div
        style={{
          position: "absolute",
          right: 10,
          bottom: 100,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <button
          onClick={() => setLikes((v) => v + 1)}
          style={{
            background: "#ff0050",
            color: "white",
            border: "none",
            borderRadius: "50%",
            width: 50,
            height: 50,
            fontSize: 20,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
          }}
          aria-label="Aimer"
        >
          ❤️
          <span
            style={{
              position: "absolute",
              top: -10,
              right: -10,
              background: "rgba(0,0,0,0.6)",
              color: "white",
              fontSize: 12,
              padding: "2px 6px",
              borderRadius: 10,
            }}
          >
            {likes}
          </span>
        </button>

        <button
          onClick={handleShare}
          style={{
            background: "#007bff",
            color: "white",
            border: "none",
            borderRadius: "50%",
            width: 50,
            height: 50,
            fontSize: 20,
          }}
          aria-label="Partager"
        >
          🔗
        </button>

        <button
          onClick={() => setShowComments(true)}
          style={{
            background: "#28a745",
            color: "white",
            border: "none",
            borderRadius: "50%",
            width: 50,
            height: 50,
            fontSize: 20,
          }}
          aria-label="Commentaires"
        >
          💬
        </button>
      </div>

      {/* Compact chat preview */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          width: "100%",
          background: "rgba(0,0,0,0.5)",
          color: "white",
          padding: 10,
          fontSize: 14,
        }}
      >
        <div style={{ maxHeight: 60, overflowY: "auto" }}>
          {lastMessages.map((msg, i) => (
            <p key={i} style={{ margin: "2px 0" }}>
              <strong>{msg.user}:</strong> {msg.text}
            </p>
          ))}
        </div>
      </div>

      {/* Comments modal */}
      {showComments && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Commentaires"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.7)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 9999,
          }}
          onClick={() => setShowComments(false)}
        >
          <div
            style={{
              background: "white",
              width: "90%",
              maxWidth: 420,
              borderRadius: 10,
              padding: 20,
              color: "black",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <h3 style={{ margin: 0 }}>💬 Commentaires</h3>
              <button
                onClick={() => setShowComments(false)}
                style={{
                  background: "transparent",
                  border: "none",
                  fontSize: 20,
                  cursor: "pointer",
                }}
                aria-label="Fermer"
              >
                ✖
              </button>
            </div>

            <div style={{ maxHeight: 320, overflowY: "auto", marginBottom: 12 }}>
              {messages.length === 0 ? (
                <p style={{ color: "#666" }}>Aucun commentaire pour le moment.</p>
              ) : (
                messages.map((msg, i) => (
                  <p key={i} style={{ margin: "6px 0" }}>
                    <strong>{msg.user}:</strong> {msg.text}
                  </p>
                ))
              )}
            </div>

            <div style={{ display: "flex" }}>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                style={{ flex: 1, padding: 8, borderRadius: 6, border: "1px solid #ddd" }}
                placeholder="Écris un commentaire..."
              />
              <button
                onClick={sendMessage}
                style={{
                  marginLeft: 8,
                  padding: "8px 12px",
                  borderRadius: 6,
                  background: "#ff0050",
                  color: "white",
                  border: "none",
                }}
              >
                Envoyer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Non-blocking clipboard toast */}
      {copiedToast && (
        <div
          style={{
            position: "fixed",
            bottom: 20,
            right: 20,
            background: "rgba(0,0,0,0.8)",
            color: "white",
            padding: "8px 12px",
            borderRadius: 8,
            fontSize: 14,
            zIndex: 10000,
          }}
        >
          Lien copié dans le presse‑papier
        </div>
      )}

      {/* CSS animations */}
      <style jsx>{`
        @keyframes blink {
          0% { opacity: 1; }
          50% { opacity: 0.35; }
          100% { opacity: 1; }
        }
      `}</style>
    </main>
  );
}
