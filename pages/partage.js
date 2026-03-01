"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { db } from "../lib/firebaseClient"; // ✅ Import unique
import { doc, getDoc, updateDoc, increment } from "firebase/firestore";

export default function PartagePage() {
  const searchParams = useSearchParams();
  const session = searchParams.get("session");

  const [products, setProducts] = useState([]);
  const [seller, setSeller] = useState(null);
  const [currency, setCurrency] = useState("XOF");
  const [rates, setRates] = useState({ XOF: 1 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session) return;

    const loadSession = async () => {
      const snap = await getDoc(doc(db, "partage_sessions", session));
      if (!snap.exists()) {
        setLoading(false);
        return;
      }

      const data = snap.data();

      setProducts(data.products || []);
      setSeller({
        name: data.sellerName,
        avatar: data.sellerAvatar,
      });

      await updateDoc(doc(db, "partage_sessions", session), {
        viewCount: increment(1),
      });

      setLoading(false);
    };

    loadSession();
  }, [session]);

  // 💱 Charger taux de conversion
  useEffect(() => {
    const fetchRates = async () => {
      try {
        const res = await fetch(
          `https://v6.exchangerate-api.com/v6/${process.env.NEXT_PUBLIC_EXCHANGE_API_KEY}/latest/XOF`
        );
        const data = await res.json();

        if (data?.conversion_rates) {
          setRates({
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

  // 🔄 Conversion dynamique
  const convertPrice = (price) => {
    if (!rates[currency]) return price;
    const converted = price * rates[currency];

    return new Intl.NumberFormat("fr-FR", {
      maximumFractionDigits: 0,
    }).format(converted);
  };

  // 💳 Achat sécurisé
  const handleBuy = async (productId) => {
    const res = await fetch("/.netlify/functions/pay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId,
        currency,
      }),
    });

    const data = await res.json();
    if (data.paymentLink) {
      window.location.href = data.paymentLink;
    }
  };

  if (loading) return <div>Chargement...</div>;
  if (!products.length) return <div>Page introuvable</div>;

  return (
    <div className="wrapper">

      {/* 👤 Seller Info */}
      {seller && (
        <div className="seller-info">
          {seller.avatar && (
            <img src={seller.avatar} alt="seller" />
          )}
          <span>{seller.name}</span>
        </div>
      )}

      {/* 💱 Devise */}
      <div className="currency-selector">
        <select
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
        >
          <option value="XOF">XOF (FCFA)</option>
          <option value="NGN">NGN</option>
          <option value="GHS">GHS</option>
          <option value="USD">USD</option>
        </select>
      </div>

      {/* 🎬 Swipe vertical type TikTok */}
      <div className="tiktok-container">
        {products.map((product, index) => (
          <div key={index} className="video-slide">
            <video
              src={product.videoUrl}
              autoPlay
              loop
              muted
              playsInline
              className="video"
            />

            <div className="overlay">
              <h2>{product.name}</h2>
              <p>
                {convertPrice(product.price)} {currency}
              </p>

              <button
                className="buy-btn"
                onClick={() => handleBuy(product.productId)}
              >
                Acheter
              </button>
            </div>
          </div>
        ))}
      </div>

      <style jsx>{`
        .wrapper {
          height: 100vh;
          overflow: hidden;
          background: black;
        }

        .seller-info {
          position: fixed;
          top: 20px;
          left: 20px;
          z-index: 1000;
          display: flex;
          align-items: center;
          gap: 10px;
          color: white;
        }

        .seller-info img {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          object-fit: cover;
        }

        .currency-selector {
          position: fixed;
          top: 20px;
          right: 20px;
          z-index: 1000;
        }

        select {
          background: #ff2d55;
          border: none;
          padding: 8px 14px;
          border-radius: 20px;
          color: white;
          font-weight: bold;
          cursor: pointer;
        }

        .tiktok-container {
          height: 100vh;
          overflow-y: scroll;
          scroll-snap-type: y mandatory;
        }

        .video-slide {
          height: 100vh;
          position: relative;
          scroll-snap-align: start;
        }

        .video {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .overlay {
          position: absolute;
          bottom: 80px;
          left: 20px;
          color: white;
          text-shadow: 0 0 10px black;
        }

        .buy-btn {
          margin-top: 10px;
          padding: 10px 20px;
          background: #00c853;
          border: none;
          color: white;
          font-weight: bold;
          border-radius: 8px;
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}