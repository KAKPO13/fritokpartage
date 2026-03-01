"use client";

import React, { useEffect, useRef, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
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

  /* 🔐 Auth */
  useEffect(() => auth.onAuthStateChanged(setUser), []);

  /* 🔴 LIVE AVATAR SESSION — PAR ID */
  useEffect(() => {
    if (!sessionId) return;

    const ref = doc(db, "live_avatar_sessions", sessionId);

    const unsubscribe = onSnapshot(ref, snap => {
      if (!snap.exists()) {
        console.error("❌ Session avatar introuvable");
        return;
      }

      const data = snap.data();
      console.log("✅ LIVE AVATAR:", data);

      setSession(data);

      const prods = data.products || [];
      setProducts(prods);

      if (prods.length > 0) setActiveProduct(prods[0]);
    });

    return () => unsubscribe();
  }, [sessionId]);

  /* 🎥 Autoplay vidéo */
  useEffect(() => {
    if (!videoRef.current) return;
    videoRef.current.muted = true;
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

  const convertPrice = (price) =>
    Math.round(price * (exchangeRates[currency] || 1)).toLocaleString();

  if (!session) {
    return (
      <div style={{ color: "white", padding: 40 }}>
        🔴 Live avatar introuvable ou terminé
      </div>
    );
  }

  return (
    <div className="container">
      {/* 🎥 VIDEO */}
      <video
        ref={videoRef}
        src={session.avatarVideoUrl}
        autoPlay
        muted
        playsInline
        controls
      />

      {/* 🛍 PRODUITS */}
      {products.length > 0 && (
        <div className="product-bar">
          {products.map((p) => (
            <div
              key={p.productId}
              className={`product ${
                activeProduct?.productId === p.productId ? "active" : ""
              }`}
              onClick={() => setActiveProduct(p)}
            >
              <img src={p.imageUrl} />
              <p>{p.name}</p>
              <span>{convertPrice(p.price)} {currency}</span>
            </div>
          ))}
        </div>
      )}

      {/* 💳 ACHAT */}
      {activeProduct && (
        <button className="buy">
          <FaShoppingCart />
          Acheter {convertPrice(activeProduct.price)} {currency}
        </button>
      )}

      <style jsx>{`
        .container { width:100vw;height:100vh;background:black;position:relative }
        video { width:100%;height:100%;object-fit:cover }
        .product-bar { position:absolute;bottom:90px;display:flex;gap:12px;padding:10px }
        .product { width:120px;background:rgba(0,0,0,.7);color:white;border-radius:12px;padding:8px }
        .product img { width:100%;height:80px;object-fit:cover;border-radius:8px }
        .product.active { border:2px solid #ff6600 }
        .buy { position:absolute;bottom:20px;left:50%;transform:translateX(-50%);
               background:#ff6600;color:white;padding:12px 22px;border-radius:30px }
      `}</style>
    </div>
  );
}