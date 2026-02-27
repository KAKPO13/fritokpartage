"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
  serverTimestamp,
  addDoc
} from "firebase/firestore";
import { FaShoppingCart } from "react-icons/fa";
import { useSearchParams, useRouter } from "next/navigation";
import { db, auth } from "../../lib/firebaseClient";

export default function LiveAvatarClient() {
  const params = useSearchParams();
  const channel = params.get("channel");

  const router = useRouter();
  const videoRef = useRef(null);

  const [currency, setCurrency] = useState("XOF");
  const [exchangeRates, setExchangeRates] = useState({ XOF: 1 });

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [likes, setLikes] = useState(0);
  const [products, setProducts] = useState([]);
  const [activeProduct, setActiveProduct] = useState(null);
  const [wallet, setWallet] = useState({});
  const [user, setUser] = useState(null);
  const [loadingPayment, setLoadingPayment] = useState(false);

  // 🔐 Auth
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(setUser);
    return () => unsubscribe();
  }, []);

  // 🎥 Avatar vidéo en boucle
  useEffect(() => {
    if (!videoRef.current) return;
    videoRef.current.play().catch(() => {});
  }, []);

  // 💱 Taux de change
  useEffect(() => {
    const fetchRates = async () => {
      try {
        const res = await fetch(
          `https://v6.exchangerate-api.com/v6/${process.env.NEXT_PUBLIC_EXCHANGE_API_KEY}/latest/XOF`
        );
        const data = await res.json();
        if (data?.conversion_rates) {
          setExchangeRates({
            XOF: 1,
            NGN: data.conversion_rates.NGN,
            GHS: data.conversion_rates.GHS,
            USD: data.conversion_rates.USD,
          });
        }
      } catch (err) {
        console.error("Erreur taux:", err);
      }
    };
    fetchRates();
  }, []);

  const convertPrice = (price) => {
    if (!price) return 0;
    const rate = exchangeRates[currency] || 1;
    return Math.round(price * rate).toLocaleString();
  };

  // 💬 Commentaires
  useEffect(() => {
    if (!channel) return;
    const q = query(
      collection(db, "live_comments"),
      where("channelId", "==", channel),
      orderBy("timestamp", "asc")
    );
    return onSnapshot(q, snap => {
      setMessages(snap.docs.map(d => d.data()));
    });
  }, [channel]);

  // 🛍 Produits live
  useEffect(() => {
    if (!channel) return;
    const q = query(
      collection(db, "live_sessions"),
      where("channelId", "==", channel)
    );
    return onSnapshot(q, snap => {
      if (snap.empty) return;
      const data = snap.docs[0].data();
      const liveProducts = data.products || [];
      setProducts(liveProducts);
      if (!activeProduct && liveProducts.length > 0)
        setActiveProduct(liveProducts[0]);
    });
  }, [channel]);

  // 💰 Wallet
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, "wallet_transactions"),
      where("userId", "==", user.uid),
      orderBy("createdAt", "desc")
    );
    return onSnapshot(q, snap => {
      let newWallet = {};
      snap.docs.forEach(doc => {
        const tx = doc.data();
        if (tx.status === "success") {
          newWallet[tx.currency] =
            (newWallet[tx.currency] || 0) + tx.amount;
        }
      });
      setWallet(newWallet);
    });
  }, [user]);

  // 💬 Envoyer message
  const sendMessage = async () => {
    if (!input.trim()) return;
    await addDoc(collection(db, "live_comments"), {
      channelId: channel,
      sender: "Anonyme",
      text: input,
      timestamp: serverTimestamp()
    });
    setInput("");
  };

  // 💳 Achat sécurisé
  const handleBuy = async () => {
    if (!user) {
      router.push(`/login?redirect=${window.location.pathname}`);
      return;
    }

    if (loadingPayment) return;
    setLoadingPayment(true);

    try {
      const idToken = await user.getIdToken();

      const res = await fetch("/.netlify/functions/pay", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          productId: activeProduct.productId,
          currency,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      window.location.href = data.paymentLink;

    } catch (err) {
      alert(err.message);
    } finally {
      setLoadingPayment(false);
    }
  };

  return (
    <main className="live-container">

      {/* 🎥 AVATAR VIDEO */}
      <video
        ref={videoRef}
        src="/avatar.mp4"
        autoPlay
        loop
        muted
        playsInline
        className="video"
      />

      <div className="live-badge">🔴 LIVE AVATAR</div>

      {/* ❤️ Likes */}
      <div className="social">
        <button onClick={() => setLikes(v => v + 1)}>
          ❤️ {likes}
        </button>
      </div>

      {/* 💬 Chat preview */}
      <div className="chat-preview">
        {messages.slice(-3).map((m, i) => (
          <p key={i}><b>{m.sender}:</b> {m.text}</p>
        ))}
      </div>

      {/* 🛍 Products */}
      {products.length > 0 && (
        <div className="product-bar">
          {products.map((p, i) => (
            <div
              key={i}
              className={`product-item ${activeProduct?.name === p.name ? "active" : ""}`}
              onClick={() => setActiveProduct(p)}
            >
              <img src={p.image} />
              <p>{p.name}</p>
              <span>{convertPrice(p.price)} {currency}</span>
            </div>
          ))}
        </div>
      )}

      {/* 💱 Devise */}
      {activeProduct && (
        <div className="currency-selector">
          <select value={currency} onChange={e => setCurrency(e.target.value)}>
            <option value="XOF">XOF</option>
            <option value="NGN">NGN</option>
            <option value="GHS">GHS</option>
            <option value="USD">USD</option>
          </select>
        </div>
      )}

      {/* 💳 Acheter */}
      {activeProduct && (
        <button className="buy-button" onClick={handleBuy}>
          {loadingPayment ? "Traitement..." :
            <> <FaShoppingCart /> Acheter • {convertPrice(activeProduct.price)} {currency}</>}
        </button>
      )}

      <style jsx>{`
        .live-container { position:relative; height:100vh; background:black; color:white; }
        .video { width:100%; height:100%; object-fit:cover; }
        .live-badge { position:absolute; top:10px; left:10px; background:red; padding:6px 12px; border-radius:20px; font-weight:bold; }
        .social { position:absolute; right:10px; bottom:120px; }
        .chat-preview { position:absolute; bottom:160px; left:10px; background:rgba(0,0,0,0.5); padding:8px; border-radius:10px; }
        .product-bar { position:absolute; bottom:100px; display:flex; gap:10px; overflow-x:auto; padding:10px; width:100%; }
        .product-item { min-width:120px; background:rgba(0,0,0,0.6); padding:8px; border-radius:12px; text-align:center; cursor:pointer; }
        .product-item.active { border:2px solid #ff6600; }
        .buy-button { position:absolute; bottom:20px; left:50%; transform:translateX(-50%); background:#ff6600; border:none; padding:12px 24px; border-radius:30px; font-weight:bold; }
        .currency-selector { position:absolute; bottom:70px; left:50%; transform:translateX(-50%); }
      `}</style>
    </main>
  );
}