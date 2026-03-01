"use client";

import React, { useEffect, useRef, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
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

  const [user, setUser] = useState(null);
  const [loadingPayment, setLoadingPayment] = useState(false);

  /* 🔐 Auth */
  useEffect(() => {
    return auth.onAuthStateChanged(setUser);
  }, []);

  /* 🔴 LIVE AVATAR SESSION */
  useEffect(() => {
    if (!sessionId) return;

    const q = query(
      collection(db, "live_avatar_sessions"),
      where("sessionId", "==", sessionId)
    );

    const unsubscribe = onSnapshot(q, snap => {
      if (snap.empty) return;

      const data = snap.docs[0].data();
      setSession(data);

      const prods = data.products || [];
      setProducts(prods);

      if (!activeProduct && prods.length > 0) {
        setActiveProduct(prods[0]);
      }
    });

    return () => unsubscribe();
  }, [sessionId]);

  /* 🎥 Autoplay vidéo avatar */
  useEffect(() => {
    if (!videoRef.current) return;
    videoRef.current.muted = true;
    videoRef.current.play().catch(() => {});
  }, [session]);

  /* 💱 Taux de change */
  useEffect(() => {
    const loadRates = async () => {
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
      } catch (e) {
        console.error("Erreur change:", e);
      }
    };
    loadRates();
  }, []);

  /* 💱 Conversion prix */
  const convertPrice = (price) => {
    if (!price) return 0;
    return Math.round(price * (exchangeRates[currency] || 1)).toLocaleString();
  };

  /* 💳 Paiement Flutterwave */
  const handleBuy = async () => {
    if (!user) {
      alert("Connexion requise");
      router.push(`/login?redirect=${window.location.pathname}`);
      return;
    }

    if (!activeProduct?.productId || loadingPayment) return;

    setLoadingPayment(true);

    try {
      const idToken = await user.getIdToken();

      const res = await fetch("/.netlify/functions/pay-avatar", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          sessionId,
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

  /* 📱 Ouvrir app */
  const openApp = () => {
    window.location.href = `fritok://avatarLive?sessionId=${sessionId}`;
    setTimeout(() => {
      window.location.href =
        "https://play.google.com/store/apps/details?id=com.fritok.app";
    }, 1200);
  };

  if (!session) return null;

  return (
    <div className="avatar-embed">
      <video
        ref={videoRef}
        src={session.avatarVideoUrl}
        autoPlay
        muted
        playsInline
        controls
      />

      {/* 🛍 MINI BAR PRODUITS */}
      {products.length > 0 && (
        <div className="product-bar">
          {products.map((p, i) => (
            <div
              key={i}
              className={`product ${activeProduct?.productId === p.productId ? "active" : ""}`}
              onClick={() => setActiveProduct(p)}
            >
              <img src={p.image} />
              <p>{p.name}</p>
              <span>{convertPrice(p.price)} {currency}</span>
            </div>
          ))}
        </div>
      )}

      {/* 💱 DEVISE */}
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

      {/* 💳 ACHAT */}
      {activeProduct && (
        <button
          className="buy-btn"
          onClick={handleBuy}
          disabled={loadingPayment}
        >
          <FaShoppingCart />
          {loadingPayment
            ? "Paiement..."
            : `Acheter • ${convertPrice(activeProduct.price)} ${currency}`}
        </button>
      )}

      {/* 📱 APP */}
      <button className="open-app" onClick={openApp}>
        📱 Ouvrir dans l’app
      </button>

      <style jsx>{`
        .avatar-embed { width:100vw;height:100vh;position:relative;background:black }
        video { width:100%;height:100%;object-fit:cover }
        .product-bar { position:absolute;bottom:100px;display:flex;gap:12px;padding:10px;overflow-x:auto }
        .product { min-width:120px;background:rgba(0,0,0,.7);color:white;border-radius:12px;padding:8px;text-align:center }
        .product.active { border:2px solid #ff6600;transform:scale(1.05) }
        .product img { width:100%;height:80px;object-fit:cover;border-radius:8px }
        .currency-selector { position:absolute;bottom:155px;left:50%;transform:translateX(-50%) }
        .currency-selector select { background:#ff6600;color:white;padding:6px 14px;border-radius:20px;border:none }
        .buy-btn { position:absolute;bottom:20px;left:50%;transform:translateX(-50%);background:#ff6600;color:white;padding:12px 24px;border-radius:30px;border:none;font-weight:bold;display:flex;gap:8px }
        .open-app { position:absolute;top:20px;right:20px;background:#ff0044;color:white;padding:10px 18px;border-radius:30px;border:none }
      `}</style>
    </div>
  );
}