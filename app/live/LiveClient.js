// app/live/LiveClient.js
"use client";
import React, { useEffect, useRef, useState } from "react";
import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, onSnapshot, orderBy, query, where, serverTimestamp } from "firebase/firestore";
import { FaShoppingCart } from "react-icons/fa";
import { useSearchParams } from "next/navigation";

export default function LiveClient() {
  const params = useSearchParams();
  const channel = params.get("channel");
  const token = params.get("token");

  console.log("Channel:", channel, "Token:", token);

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

      console.log("Agora appId:", appId, "channel:", channel, "token:", token);

      try {
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
      } catch (err) {
        console.error("Erreur Agora join:", err);
      }
    }

    if (channel && token) {
      initAgora();
    } else {
      console.warn("⚠️ channel ou token manquant:", channel, token);
    }

    return () => {
      if (client) client.leave();
      if (remoteRef.current) remoteRef.current.innerHTML = "";
    };
  }, [channel, token]);

  // Firestore commentaires (collection racine live_comments)
  useEffect(() => {
    if (!channel) return;
    const q = query(
      collection(db, "live_comments"),
      where("channelId", "==", channel),
      orderBy("timestamp", "asc")
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setMessages(snapshot.docs.map((doc) => doc.data()));
      console.log("Commentaires Firestore:", snapshot.docs.map((doc) => doc.data()));
    });
    return () => unsubscribe();
  }, [channel, db]);

  // Envoi d’un commentaire
  const sendMessage = async () => {
    if (input.trim() === "" || !channel) return;
        await addDoc(collection(db, "live_comments"), {
        channelId: channel,
        sender: "Anonyme",
        text: input.trim(),
        timestamp: serverTimestamp(), // ✅ vrai Timestamp Firestore
        });
    setInput("");
  };

  // Share
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
    <main className="live-container">
      <div ref={remoteRef} className="video" />
      <div className="live-badge"><span className="dot" /> LIVE</div>
      <div className="social-buttons">
        <button onClick={() => setLikes((v) => v + 1)}>❤️ {likes}</button>
        <button onClick={handleShare}>🔗</button>
        <button onClick={() => setShowComments(true)}>💬</button>
      </div>
      <div className="chat-preview">
        {lastMessages.map((msg, i) => (
          <p key={i}><strong>{msg.sender}:</strong> {msg.text}</p>
        ))}
      </div>
      {showComments && (
        <div className="modal" onClick={() => setShowComments(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>💬 Commentaires</h3>
              <button onClick={() => setShowComments(false)}>✖</button>
            </div>
            <div className="modal-body">
              {messages.length === 0 ? <p>Aucun commentaire.</p> : messages.map((msg, i) => (
                <p key={i}><strong>{msg.sender}:</strong> {msg.text}</p>
              ))}
            </div>
            <div className="modal-footer">
              <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Écris un commentaire..." />
              <button onClick={sendMessage}>Envoyer</button>
            </div>
          </div>
        </div>
      )}
      {copiedToast && <div className="toast">Lien copié dans le presse‑papier</div>}
      <button className="buy-button"><FaShoppingCart /> Acheter</button>


      {copiedToast && <div className="toast">Lien copié dans le presse‑papier</div>}
       {/* ✅ Bouton flottant Acheter */}
         
      
            <button className="buy-button">
              <FaShoppingCart style={{ marginRight: "8px" }} />
              Acheter
            </button>
      
      
          {/* Styles */}
          <style jsx>{`
            .live-container {
              position: relative;
              width: 100%;
              height: 100vh;
              background: black;
              display: flex;
              flex-direction: column;
            }
            .video {
              flex: 1;
              background: black;
            }
            .live-badge {
              position: absolute;
              top: 10px;
              left: 10px;
              background: red;
              color: white;
              padding: 5px 10px;
              border-radius: 20px;
              font-weight: bold;
              animation: blink 1s infinite;
              display: flex;
              align-items: center;
              gap: 8px;
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
              background: rgba(0,0,0,0.5);
              color: white;
              padding: 10px;
              font-size: 14px;
            }
            .modal {
              position: fixed;
              inset: 0;
              background: rgba(0,0,0,0.7);
              display: flex;
              justify-content: center;
              align-items: center;
              z-index: 9999;
            }
            .modal-content {
              background: white;
              width: 90%;
              max-width: 420px;
              border-radius: 10px;
              padding: 20px;
              color: black;
            }
            .toast {
              position: fixed;
              bottom: 20px;
              right: 20px;
              background: rgba(0,0,0,0.8);
              color: white;
              padding: 8px 12px;
              border-radius: 8px;
              font-size: 14px;
              z-index: 10000;
            }
            @keyframes blink {
              0% { opacity: 1; }
              50% { opacity: 0.35; }
              100% { opacity: 1; }
            }
            /* ✅ Responsive desktop layout */
            @media (min-width: 1024px) {
              .live-container {
                flex-direction: row;
                height: 100vh; /* garde la hauteur écran */
              }
              .video {
                width: 70%;
                height: 100%; /* occupe toute la hauteur */
                object-fit: cover; /* adapte la vidéo */
              }
              .chat-preview {
                width: 30%;
                height: 100%;
                overflow-y: auto;
              }
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
              font-size: 16px;
              font-weight: bold;
              cursor: pointer;
              z-index: 10001;
              box-shadow: 0 4px 8px rgba(0,0,0,0.3);
              transition: background 0.3s;
              display: flex;
              align-items: center;
              justify-content: center;
              gap: 8px; /* espace entre icône et texte */
            }
            .buy-button:hover {
              background: #e65c00;
            }
              
          `}</style>
        </main>
      );
      
      }
      
