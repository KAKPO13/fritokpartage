"use client";

import React, { useEffect, useRef, useState } from "react";
import { doc, onSnapshot, collection, query, where, orderBy } from "firebase/firestore";
import { useSearchParams, useRouter } from "next/navigation";
import { FaShoppingCart } from "react-icons/fa";
import { db, auth } from "../../lib/firebaseClient";

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

  if (!session) {
    return <div style={{ color: "white", padding: 40 }}>Live introuvable</div>;
  }

  return (
    <div className="container">
      {/* 🎥 VIDEO */}
      <video ref={videoRef} src={session.avatarVideoUrl} autoPlay muted loop playsInline />

      {/* 🛍 PRODUITS */}
      <div className="product-bar">
        {products.map(p => (
          <div
            key={p.productId}
            className={`product ${activeProduct?.productId === p.productId ? "active" : ""}`}
            onClick={() => setActiveProduct(p)}
          >
            <img src={p.imageUrl} />
            <p>{p.name}</p>
            <span>{convertPrice(p.price)} {currency}</span>
          </div>
        ))}
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
      `}</style>
    </div>
  );
}