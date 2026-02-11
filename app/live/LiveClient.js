// app/live/LiveClient.js
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
  doc,
  updateDoc,
  increment,
} from "firebase/firestore";
import { FaShoppingCart } from "react-icons/fa";
import { useSearchParams } from "next/navigation";

export default function LiveClient() {
  const params = useSearchParams();
  const channel = params.get("channel");
  const token = params.get("token");

  const remoteRef = useRef(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [likes, setLikes] = useState(0);
  const [viewerCount, setViewerCount] = useState(0);
  const [floatingLikes, setFloatingLikes] = useState([]);
  const [floatingGifts, setFloatingGifts] = useState([]);
  const [showComments, setShowComments] = useState(false);

  // Firebase
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

  /* ==============================
        AGORA INIT (Audience)
  =============================== */
  useEffect(() => {
    if (!channel || !token) return;
    let client;

    async function initAgora() {
      const AgoraRTC = (await import("agora-rtc-sdk-ng")).default;
      const appId = process.env.NEXT_PUBLIC_AGORA_APP_ID;
      const uid = Math.floor(Math.random() * 10000);

      client = AgoraRTC.createClient({ mode: "live", codec: "vp8" });
      await client.join(appId, channel, token, uid);
      await client.setClientRole("audience");

      client.on("user-published", async (user, mediaType) => {
        await client.subscribe(user, mediaType);
        if (mediaType === "video") user.videoTrack.play(remoteRef.current);
        if (mediaType === "audio") user.audioTrack.play();
      });
    }

    initAgora();

    return () => {
      if (client) client.leave();
    };
  }, [channel, token]);

  /* ==============================
        VIEWERS LIVE COUNTER
  =============================== */
  useEffect(() => {
    if (!channel) return;

    const liveRef = doc(db, "live_sessions", channel);

    updateDoc(liveRef, { viewerCount: increment(1) });

    const unsubscribe = onSnapshot(liveRef, (snap) => {
      const data = snap.data();
      if (data) setViewerCount(data.viewerCount || 0);
    });

    return () => {
      updateDoc(liveRef, { viewerCount: increment(-1) });
      unsubscribe();
    };
  }, [channel]);

  /* ==============================
        COMMENTS
  =============================== */
  useEffect(() => {
    if (!channel) return;

    const q = query(
      collection(db, "live_comments"),
      where("channelId", "==", channel),
      orderBy("timestamp", "asc")
    );

    return onSnapshot(q, (snapshot) => {
      setMessages(snapshot.docs.map((doc) => doc.data()));
    });
  }, [channel]);

  const sendMessage = async () => {
    if (!input.trim()) return;
    await addDoc(collection(db, "live_comments"), {
      channelId: channel,
      sender: "Anonyme",
      text: input,
      timestamp: serverTimestamp(),
    });
    setInput("");
  };

  /* ==============================
        LIKE SYSTEM + FLOAT
  =============================== */
  const sendLike = async () => {
    const liveRef = doc(db, "live_sessions", channel);
    await updateDoc(liveRef, { likeCount: increment(1) });
    setLikes((v) => v + 1);

    const id = Date.now();
    setFloatingLikes((prev) => [...prev, id]);

    setTimeout(() => {
      setFloatingLikes((prev) => prev.filter((i) => i !== id));
    }, 2000);
  };

  /* ==============================
        GIFT SYSTEM + FLOAT
  =============================== */
  const sendGift = () => {
    const id = Date.now();
    setFloatingGifts((prev) => [...prev, id]);

    setTimeout(() => {
      setFloatingGifts((prev) => prev.filter((i) => i !== id));
    }, 3000);
  };

  const lastMessages = messages.slice(-3);

  return (
    <main className="live-container">
      <div ref={remoteRef} className="video" />

      {/* LIVE BADGE */}
      <div className="live-badge">
        <span className="dot" /> LIVE • {viewerCount}
      </div>

      {/* FLOATING LIKES */}
      {floatingLikes.map((id) => (
        <div key={id} className="floating-like">❤️</div>
      ))}

      {/* FLOATING GIFTS */}
      {floatingGifts.map((id) => (
        <div key={id} className="floating-gift">🎁</div>
      ))}

      {/* RIGHT ACTIONS */}
      <div className="social-buttons">
        <button onClick={sendLike}>❤️</button>
        <button onClick={sendGift}>🎁</button>
        <button onClick={() => setShowComments(true)}>💬</button>
      </div>

      {/* CHAT PREVIEW */}
      <div className="chat-preview">
        {lastMessages.map((msg, i) => (
          <p key={i}><strong>{msg.sender}:</strong> {msg.text}</p>
        ))}
      </div>

      {/* BUY BUTTON */}
      <button
        className="buy-button"
        onClick={() => alert("Redirection vers paiement")}
      >
        <FaShoppingCart /> Acheter
      </button>

      {/* COMMENT MODAL */}
      {showComments && (
        <div className="modal" onClick={() => setShowComments(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-body">
              {messages.map((msg, i) => (
                <p key={i}><strong>{msg.sender}:</strong> {msg.text}</p>
              ))}
            </div>
            <div className="modal-footer">
              <input value={input} onChange={(e) => setInput(e.target.value)} />
              <button onClick={sendMessage}>Envoyer</button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .live-container {
          position: relative;
          height: 100vh;
          width: 100%;
          background: black;
          overflow: hidden;
        }

        .video {
          height: 100%;
          width: 100%;
        }

        .live-badge {
          position: absolute;
          top: 15px;
          left: 15px;
          background: red;
          padding: 6px 14px;
          border-radius: 20px;
          font-weight: bold;
          animation: blink 1s infinite;
        }

        .dot {
          width: 8px;
          height: 8px;
          background: white;
          border-radius: 50%;
          display: inline-block;
          margin-right: 6px;
        }

        .social-buttons {
          position: absolute;
          right: 15px;
          bottom: 120px;
          display: flex;
          flex-direction: column;
          gap: 15px;
        }

        .floating-like {
          position: absolute;
          right: 80px;
          bottom: 100px;
          animation: floatUp 2s ease-out forwards;
        }

        .floating-gift {
          position: absolute;
          right: 100px;
          bottom: 120px;
          animation: floatUp 3s ease-out forwards;
        }

        .chat-preview {
          position: absolute;
          bottom: 80px;
          left: 10px;
          color: white;
          font-size: 14px;
        }

        .buy-button {
          position: absolute;
          bottom: 20px;
          left: 50%;
          transform: translateX(-50%);
          background: #ff6600;
          color: white;
          padding: 12px 24px;
          border-radius: 30px;
          border: none;
          font-weight: bold;
        }

        @keyframes floatUp {
          from { transform: translateY(0); opacity: 1; }
          to { transform: translateY(-250px); opacity: 0; }
        }

        @keyframes blink {
          50% { opacity: 0.4; }
        }
      `}</style>
    </main>
  );
}

