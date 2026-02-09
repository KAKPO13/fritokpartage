"use client";

import React, { useEffect, useRef, useState } from "react";
import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collection,
  addDoc,
  onSnapshot,
  orderBy,
  query,
  where,
  serverTimestamp,
} from "firebase/firestore";
import { FaShoppingCart } from "react-icons/fa";
import { useSearchParams } from "next/navigation";

export default function LiveClient() {
  const params = useSearchParams();
  const channel = params.get("channel");
  const token = params.get("token");

  const remoteRef = useRef(null);
  const clientRef = useRef(null);

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [likes, setLikes] = useState(0);
  const [showComments, setShowComments] = useState(false);
  const [copiedToast, setCopiedToast] = useState(false);
  const [started, setStarted] = useState(false);

  /* ================= FIREBASE ================= */
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

  /* ================= AGORA ================= */
  useEffect(() => {
    if (!started || !channel || !token) return;
    if (typeof window === "undefined") return;

    let client;

    const initAgora = async () => {
      try {
        const AgoraRTC = (await import("agora-rtc-sdk-ng")).default;
        const appId = process.env.NEXT_PUBLIC_AGORA_APP_ID;
        const uid = Math.floor(Math.random() * 100000);

        client = AgoraRTC.createClient({ mode: "live", codec: "vp8" });
        clientRef.current = client;

        // ✅ Low stream AVANT join (important pour mobile)
        client.setLowStreamParameter({
          width: 640,
          height: 360,
          framerate: 15,
          bitrate: 400,
        });

        await client.setClientRole("audience");
        await client.join(appId, channel, token, uid);

        client.on("user-published", async (user, mediaType) => {
          await client.subscribe(user, mediaType);

          if (mediaType === "video" && remoteRef.current) {
            user.videoTrack.play(remoteRef.current, { fit: "cover" });
          }

          if (mediaType === "audio") {
            user.audioTrack.play();
          }
        });

        client.on("user-unpublished", () => {
          if (remoteRef.current) remoteRef.current.innerHTML = "";
        });
      } catch (err) {
        console.error("❌ Erreur Agora:", err);
      }
    };

    initAgora();

    return () => {
      if (clientRef.current) {
        clientRef.current.leave();
        clientRef.current = null;
      }
      if (remoteRef.current) remoteRef.current.innerHTML = "";
    };
  }, [started, channel, token]);

  /* ================= FIRESTORE COMMENTS ================= */
  useEffect(() => {
    if (!channel) return;

    const q = query(
      collection(db, "live_comments"),
      where("channelId", "==", channel),
      orderBy("timestamp", "asc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setMessages(snapshot.docs.map((doc) => doc.data()));
    });

    return () => unsubscribe();
  }, [channel, db]);

  const sendMessage = async () => {
    if (!input.trim()) return;

    await addDoc(collection(db, "live_comments"), {
      channelId: channel,
      sender: "Anonyme",
      text: input.trim(),
      timestamp: serverTimestamp(),
    });

    setInput("");
  };

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      await navigator.share({
        title: "Live en cours",
        text: "Viens voir ce live 🔴",
        url,
      });
    } else {
      await navigator.clipboard.writeText(url);
      setCopiedToast(true);
    }
  };

  useEffect(() => {
    if (!copiedToast) return;
    const t = setTimeout(() => setCopiedToast(false), 2000);
    return () => clearTimeout(t);
  }, [copiedToast]);

  const lastMessages = messages.slice(-3);

  return (
    <main className="live-container">
      {!started && (
        <button className="start-button" onClick={() => setStarted(true)}>
          ▶️ Regarder le live
        </button>
      )}

      <div ref={remoteRef} className="video" />

      <div className="live-badge">
        <span className="dot" /> LIVE
      </div>

      <div className="social-buttons">
        <button onClick={() => setLikes((v) => v + 1)}>❤️ {likes}</button>
        <button onClick={handleShare}>🔗</button>
        <button onClick={() => setShowComments(true)}>💬</button>
      </div>

      <div className="chat-preview">
        {lastMessages.map((m, i) => (
          <p key={i}>
            <strong>{m.sender}:</strong> {m.text}
          </p>
        ))}
      </div>

      {showComments && (
        <div className="modal" onClick={() => setShowComments(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>💬 Commentaires</h3>
            <div className="modal-body">
              {messages.map((m, i) => (
                <p key={i}>
                  <strong>{m.sender}:</strong> {m.text}
                </p>
              ))}
            </div>
            <div className="modal-footer">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Écris un commentaire..."
              />
              <button onClick={sendMessage}>Envoyer</button>
            </div>
          </div>
        </div>
      )}

      {copiedToast && <div className="toast">Lien copié ✔</div>}

      <button className="buy-button">
        <FaShoppingCart /> Acheter
      </button>

      {/* ================= STYLES ================= */}
      <style jsx>{`
        .live-container {
          position: relative;
          width: 100%;
          height: 100vh;
          background: black;
        }
        .video video {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .start-button {
          position: absolute;
          inset: 0;
          z-index: 1000;
          background: rgba(0, 0, 0, 0.85);
          color: white;
          font-size: 22px;
          border: none;
        }
        .live-badge {
          position: absolute;
          top: 10px;
          left: 10px;
          background: red;
          color: white;
          padding: 6px 12px;
          border-radius: 20px;
          display: flex;
          gap: 8px;
          font-weight: bold;
        }
        .dot {
          width: 8px;
          height: 8px;
          background: white;
          border-radius: 50%;
        }
        .social-buttons {
          position: absolute;
          right: 10px;
          bottom: 100px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .chat-preview {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          background: rgba(0, 0, 0, 0.5);
          color: white;
          padding: 10px;
        }
        .buy-button {
          position: fixed;
          bottom: 20px;
          left: 50%;
          transform: translateX(-50%);
          background: #ff6600;
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 30px;
          font-weight: bold;
          z-index: 10001;
        }
        .modal {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.7);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 9999;
        }
        .modal-content {
          background: white;
          width: 90%;
          max-width: 400px;
          padding: 20px;
          border-radius: 10px;
        }
        .toast {
          position: fixed;
          bottom: 80px;
          right: 20px;
          background: black;
          color: white;
          padding: 8px 12px;
          border-radius: 8px;
        }
      `}</style>
    </main>
  );
}
