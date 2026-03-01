"use client";

import React, { useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { FaShoppingCart } from "react-icons/fa";
import {
  doc,
  onSnapshot,
  collection,
  query,
  addDoc,
  serverTimestamp,
  where,
  orderBy,
} from "firebase/firestore";
import { db, auth } from "@/lib/firebaseClient";

export default function LiveAvatarEmbed() {
  const params = useSearchParams();
  const sessionId = params.get("sessionId");
  const router = useRouter();

  const videoRef = useRef(null);

  const [session, setSession] = useState(null);
  const [products, setProducts] = useState([]);
  const [activeProduct, setActiveProduct] = useState(null);

  const [currency, setCurrency] = useState("XOF");
  const [exchangeRates, setExchangeRates] = useState({ XOF: 1 });
  const [wallet, setWallet] = useState({});
  const [user, setUser] = useState(null);
  const [loadingPayment, setLoadingPayment] = useState(false);

  const [muted, setMuted] = useState(true);
  const [playing, setPlaying] = useState(true);

  const [comments, setComments] = useState([]);
  const [commentInput, setCommentInput] = useState("");
  const [showChat] = useState(true);

  /* 🔐 AUTH */
  useEffect(() => auth.onAuthStateChanged(setUser), []);

  /* 🔴 SESSION LIVE */
  useEffect(() => {
    if (!sessionId) return;

    const ref = doc(db, "live_avatar_sessions", sessionId);
    return onSnapshot(ref, snap => {
      if (!snap.exists()) return;
      const data = snap.data();
      setSession(data);
      setProducts(data.products || []);
      setActiveProduct(data.products?.[0] || null);
    });
  }, [sessionId]);

  /* 🎥 VIDEO AUTO LOOP */
  useEffect(() => {
    if (!videoRef.current) return;
    videoRef.current.muted = true;
    videoRef.current.loop = true;
    videoRef.current.play().catch(() => {});
  }, [session]);

  /* 💱 EXCHANGE */
  useEffect(() => {
    fetch(
      `https://v6.exchangerate-api.com/v6/${process.env.NEXT_PUBLIC_EXCHANGE_API_KEY}/latest/XOF`
    )
      .then(r => r.json())
      .then(d => {
        if (d?.conversion_rates) {
          setExchangeRates({
            XOF: 1,
            NGN: d.conversion_rates.NGN,
            GHS: d.conversion_rates.GHS,
            USD: d.conversion_rates.USD,
          });
        }
      });
  }, []);

  /* 💬 COMMENTS */
  useEffect(() => {
    if (!sessionId) return;
    const q = query(
      collection(db, "live_avatar_sessions", sessionId, "comments"),
      orderBy("createdAt", "desc")
    );
    return onSnapshot(q, snap =>
      setComments(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
  }, [sessionId]);

  /* 💰 WALLET */
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, "wallet_transactions"),
      where("userId", "==", user.uid),
      where("status", "==", "success")
    );
    return onSnapshot(q, snap => {
      const w = {};
      snap.docs.forEach(d => {
        const t = d.data();
        w[t.currency] = (w[t.currency] || 0) + t.amount;
      });
      setWallet(w);
    });
  }, [user]);

  const convertPrice = p =>
    Math.round(p * (exchangeRates[currency] || 1)).toLocaleString();

  /* 💳 BUY */
  const handleBuy = async () => {
    if (!user) {
      router.push(`/login?redirect=${window.location.pathname}`);
      return;
    }
    if (!activeProduct) return;

    setLoadingPayment(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/.netlify/functions/pay", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          productId: activeProduct.productId,
          currency,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      window.location.href = data.paymentLink;
    } catch (e) {
      alert(e.message);
    } finally {
      setLoadingPayment(false);
    }
  };

  /* 🎛️ CONTROLS */
  const toggleMute = () => {
    videoRef.current.muted = !muted;
    setMuted(!muted);
  };

  const togglePlay = () => {
    if (videoRef.current.paused) {
      videoRef.current.play();
      setPlaying(true);
    } else {
      videoRef.current.pause();
      setPlaying(false);
    }
  };

  const sendComment = async () => {
    if (!commentInput.trim()) return;
    await addDoc(
      collection(db, "live_avatar_sessions", sessionId, "comments"),
      {
        text: commentInput.trim(),
        viewerId: user?.uid || "guest",
        createdAt: serverTimestamp(),
      }
    );
    setCommentInput("");
  };

  if (!session)
    return <div style={{ color: "white", padding: 40 }}>Live introuvable</div>;

  return (
    <div className="container">
      <video
        ref={videoRef}
        src={session.avatarVideoUrl}
        autoPlay
        loop
        playsInline
        muted={muted}
        onClick={togglePlay}
      />

      <div className="media-controls">
        <button onClick={togglePlay}>{playing ? "⏸️" : "▶️"}</button>
        <button onClick={toggleMute}>{muted ? "🔇" : "🔊"}</button>
      </div>

      <div className="live-badge">
        <span className="dot" /> LIVE
      </div>

      {showChat && (
        <div className="chat-overlay">
          {comments.slice(0, 15).map(c => (
            <div key={c.id} className="chat-bubble">
              <strong>{c.viewerId.slice(0, 6)}:</strong> {c.text}
            </div>
          ))}
        </div>
      )}

      <div className="product-bar">
        {products.map(p => (
          <div
            key={p.productId}
            className={`product ${
              activeProduct?.productId === p.productId ? "active" : ""
            }`}
            onClick={() => setActiveProduct(p)}
          >
            <img src={p.imageUrl} />
            <p>{p.name}</p>
            <span>
              {convertPrice(p.price)} {currency}
            </span>
          </div>
        ))}
      </div>

      <div className="currency">
        <select value={currency} onChange={e => setCurrency(e.target.value)}>
          <option value="XOF">XOF</option>
          <option value="NGN">NGN</option>
          <option value="GHS">GHS</option>
          <option value="USD">USD</option>
        </select>
      </div>

      {activeProduct && (
        <button className="buy" onClick={handleBuy}>
          <FaShoppingCart /> Acheter
        </button>
      )}

      <div className="chat-input">
        <input
          value={commentInput}
          onChange={e => setCommentInput(e.target.value)}
          placeholder="Écrire un commentaire..."
        />
        <button onClick={sendComment}>➤</button>
      </div>

      <style jsx>{`
        .container { width:100vw;height:100vh;background:black;position:relative }
        video { width:100%;height:100%;object-fit:cover }
        .product-bar { position:absolute;bottom:100px;display:flex;gap:12px;padding:10px;overflow-x:auto }
        .product { width:120px;background:rgba(0,0,0,.7);color:white;border-radius:12px;padding:8px }
        .product img { width:100%;height:80px;object-fit:cover;border-radius:8px }
        .product.active { border:2px solid #ff6600 }
        .buy { position:absolute;bottom:20px;left:50%;transform:translateX(-50%);
               background:#ff6600;color:white;padding:14px 26px;border-radius:30px }
        .currency { position:absolute;bottom:70px;left:50%;transform:translateX(-50%) }
        select { padding:6px 14px;border-radius:20px;font-weight:bold }
        .wallet { position:absolute;top:10px;right:10px;color:lime }
        .container {
          width: 100vw;
          height: 100vh;
          background: black;
          position: relative;
        }
        video {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .media-controls {
          position: absolute;
          bottom: 160px;
          right: 12px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .media-controls button {
          background: rgba(0, 0, 0, 0.6);
          color: white;
          border-radius: 50%;
          width: 44px;
          height: 44px;
        }
        .live-badge {
          position: absolute;
          top: 12px;
          left: 12px;
          background: red;
          color: white;
          padding: 6px 14px;
          border-radius: 20px;
          font-weight: bold;
        }
        .dot {
          width: 8px;
          height: 8px;
          background: white;
          border-radius: 50%;
          display: inline-block;
          margin-right: 6px;
        }
        .chat-overlay {
          position: absolute;
          bottom: 180px;
          left: 12px;
          width: 70%;
          display: flex;
          flex-direction: column-reverse;
          gap: 6px;
        }
        .chat-bubble {
          background: rgba(0, 0, 0, 0.45);
          color: white;
          padding: 6px 10px;
          border-radius: 14px;
        }
        .chat-input {
          position: fixed;
          bottom: 20px;
          left: 12px;
          right: 12px;
          display: flex;
          gap: 8px;
          background: rgba(0, 0, 0, 0.65);
          padding: 8px 12px;
          border-radius: 30px;
        }
        .chat-input input {
          flex: 1;
          background: transparent;
          border: none;
          color: white;
        }
        .chat-input button {
          background: #ff0050;
          color: white;
          border-radius: 50%;
          width: 36px;
          height: 36px;
        }
      `}</style>
    </div>
  );
}
