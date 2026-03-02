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
  const [showChat, setShowChat] = useState(true);

  /* 🔐 Auth */
  useEffect(() => auth.onAuthStateChanged(setUser), []);

  /* 🔴 LIVE AVATAR SESSION */
  useEffect(() => {
    if (!sessionId) return;

    const ref = doc(db, "live_avatar_sessions", sessionId);

    const unsub = onSnapshot(ref, snap => {
      if (!snap.exists()) return;

      const data = snap.data();
      setSession(data);

      const prods = data.products || [];
      setProducts(prods);
      if (prods.length > 0) setActiveProduct(prods[0]);
    });

    return () => unsub();
  }, [sessionId]);

  /* 🎥 Lecture vidéo auto + boucle */
  useEffect(() => {
    if (!videoRef.current) return;
    videoRef.current.muted = true;
    videoRef.current.loop = true;
    videoRef.current.play().catch(() => {});
  }, [session]);

  /* 💱 Taux de change */
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

  useEffect(() => {
  if (!sessionId) return;

  const q = query(
    collection(db, "live_avatar_sessions", sessionId, "comments"),
    orderBy("createdAt", "desc")
  );

  const unsub = onSnapshot(q, snap => {
    setComments(
      snap.docs.map(d => ({
        id: d.id,
        ...d.data()
      }))
    );
  });

  return () => unsub();
}, [sessionId]);

  /* 💰 Wallet temps réel */
  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, "wallet_transactions"),
      where("userId", "==", user.uid),
      where("status", "==", "success"),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(q, snap => {
      const w = {};
      snap.docs.forEach(d => {
        const tx = d.data();
        w[tx.currency] = (w[tx.currency] || 0) + tx.amount;
      });
      setWallet(w);
    });

    return () => unsub();
  }, [user]);


  /* 💱 Conversion */
  const convertPrice = (price) =>
    Math.round(price * (exchangeRates[currency] || 1)).toLocaleString();

  /* 💳 Achat Flutterwave */
  const handleBuy = async () => {
    if (!user) {
      router.push(`/login?redirect=${window.location.pathname}`);
      return;
    }

    if (!activeProduct || loadingPayment) return;

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

  const toggleMute = () => {
  if (!videoRef.current) return;
  videoRef.current.muted = !muted;
  setMuted(!muted);
};

const togglePlay = () => {
  if (!videoRef.current) return;

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
      viewerId: auth.currentUser?.uid || "guest",
      createdAt: serverTimestamp(),
    }
  );

  setCommentInput("");
};

const enterFullscreen = () => {
  if (!videoRef.current) return;

  if (videoRef.current.requestFullscreen) {
    videoRef.current.requestFullscreen();
  } else if (videoRef.current.webkitRequestFullscreen) {
    videoRef.current.webkitRequestFullscreen();
  }
};

  if (!session) {
    return <div style={{ color: "white", padding: 40 }}>Live introuvable</div>;
  }

  return (
    <div className="container">
      {/* 🎥 VIDEO */}
      <video
        ref={videoRef}
        src={session.avatarVideoUrl}
        autoPlay
        loop
        playsInline
        muted={muted}
        onClick={() => togglePlay()}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
        }}
      />

      {/* 🎛️ MEDIA CONTROLS */}
        <div className="media-controls">
          <button onClick={togglePlay}>
            {playing ? "⏸️" : "▶️"}
          </button>

          <button onClick={toggleMute}>
            {muted ? "🔇" : "🔊"}
          </button>

          <button onClick={enterFullscreen}>
            ⛶
          </button>
        </div>

        {/* 🔴 LIVE BADGE */}
        <div className="live-badge">
          <span className="dot" /> LIVE
        </div>

        {/* 💬 CHAT OVERLAY */}
        {showChat && (
          <div className="chat-overlay">
            {comments.slice(0, 15).map(c => (
              <div key={c.id} className="chat-bubble">
                <strong>{c.viewerId.slice(0, 6)}:</strong> {c.text}
              </div>
            ))}
          </div>
        )}

     
   {/* 🛍 PRODUITS - SCROLL HORIZONTAL */}
      <div className="product-wrapper">
        <div className="product-bar">
          {products.map((p, index) => (
            <div
              key={p.productId}
              className={`product ${
                activeProduct?.productId === p.productId ? "active" : ""
              }`}
              onClick={() => setActiveProduct(p)}
            >
              <img src={p.imageUrl} alt={p.name} />
              <p className="name">{p.name}</p>
              <span className="price">
                {convertPrice(p.price)} {currency}
              </span>
            </div>
          ))}
        </div>

        {/* ▬▬▬ MINI BAR ▬▬▬ */}
        <div className="mini-bar">
          {products.map(p => (
            <span
              key={p.productId}
              className={
                activeProduct?.productId === p.productId ? "dot active" : "dot"
              }
            />
          ))}
        </div>
      </div>

      {/* 💱 DEVISE */}
      <div className="currency">
        <select value={currency} onChange={e => setCurrency(e.target.value)}>
          <option value="XOF">XOF (FCFA)</option>
          <option value="NGN">NGN</option>
          <option value="GHS">GHS</option>
          <option value="USD">USD</option>
        </select>
      </div>

      {/* 💳 ACHAT */}
      {activeProduct && (
        <button className="buy" onClick={handleBuy} disabled={loadingPayment}>
          <FaShoppingCart />
          {loadingPayment
            ? "Traitement..."
            : `Acheter ${convertPrice(activeProduct.price)} ${currency}`}
        </button>
      )}

      {/* 🟢 WALLET */}
      <div className="wallet">
        {Object.entries(wallet).map(([c, a]) => (
          <div key={c}>{c}: {a}</div>
        ))}
      </div>

      {/* ✍️ COMMENT INPUT */}
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
        .media-controls {
  position: absolute;
  bottom: 160px;
  right: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  z-index: 1000;
}

.media-controls button {
  background: rgba(0,0,0,0.6);
  color: white;
  border: none;
  border-radius: 50%;
  width: 44px;
  height: 44px;
  font-size: 18px;
  cursor: pointer;
}

.media-controls button:hover {
  background: rgba(0,0,0,0.85);
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
  display: flex;
  align-items: center;
  gap: 8px;
  z-index: 1000;
  animation: blink 1s infinite;
}

.dot {
  width: 8px;
  height: 8px;
  background: white;
  border-radius: 50%;
}

@keyframes blink {
  0% { opacity: 1 }
  50% { opacity: .4 }
  100% { opacity: 1 }
}

.chat-overlay {
  position: absolute;
  bottom: 180px;
  left: 12px;
  width: 70%;
  max-height: 240px;
  display: flex;
  flex-direction: column-reverse;
  gap: 6px;
  z-index: 1000;
  pointer-events: none;
}

.chat-bubble {
  background: rgba(0,0,0,0.45);
  color: white;
  padding: 6px 10px;
  border-radius: 14px;
  font-size: 14px;
  animation: fadeUp .25s ease-out;
}

@keyframes fadeUp {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.chat-input {
  position: fixed;
  bottom: 20px;
  left: 12px;
  right: 12px;
  display: flex;
  gap: 8px;
  background: rgba(0,0,0,0.65);
  padding: 8px 12px;
  border-radius: 30px;
  z-index: 1001;
}

.chat-input input {
  flex: 1;
  background: transparent;
  border: none;
  color: white;
  outline: none;
}

.chat-input button {
  background: #ff0050;
  color: white;
  border: none;
  border-radius: 50%;
  width: 36px;
  height: 36px;
  font-size: 18px;
}

.product-wrapper {
  position: absolute;
  bottom: 110px;
  left: 0;
  right: 0;
  z-index: 1000;
}

/* SCROLL HORIZONTAL */
.product-bar {
  display: flex;
  gap: 12px;
  padding: 10px 14px;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  -webkit-overflow-scrolling: touch;
}

/* Masquer scrollbar */
.product-bar::-webkit-scrollbar {
  display: none;
}

.product {
  min-width: 120px;
  max-width: 120px;
  background: rgba(0, 0, 0, 0.7);
  color: white;
  border-radius: 14px;
  padding: 8px;
  scroll-snap-align: start;
  transition: transform 0.2s, border 0.2s;
}

.product.active {
  border: 2px solid #ff6600;
  transform: scale(1.05);
}

.product img {
  width: 100%;
  height: 80px;
  object-fit: cover;
  border-radius: 10px;
}

.product .name {
  font-size: 13px;
  font-weight: bold;
  margin: 6px 0 2px;
}

.product .price {
  font-size: 12px;
  color: #ffcc00;
}

/* ▬▬▬ MINI BAR ▬▬▬ */
.mini-bar {
  display: flex;
  justify-content: center;
  gap: 6px;
  margin-top: 6px;
}

.mini-bar .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.4);
  transition: all 0.2s;
}

.mini-bar .dot.active {
  width: 16px;
  border-radius: 6px;
  background: #ff6600;
}
      `}</style>
    </div>
  );
}