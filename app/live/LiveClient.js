"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
  serverTimestamp,
  addDoc,
} from "firebase/firestore";
import { FaShoppingCart } from "react-icons/fa";
import { useSearchParams } from "next/navigation";
import { db, auth } from "../../lib/firebaseClient";
import { useRouter } from "next/navigation";

// ─────────────────────────────────────────────
// 🔐 Token Agora récupéré depuis le serveur
// JAMAIS dans l'URL, JAMAIS dans Firestore
// ─────────────────────────────────────────────
async function fetchAgoraToken(channelName) {
  const response = await fetch(
    "https://fritok1.netlify.app/.netlify/functions/agora-token",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelName, uid: 0 }),
    }
  );
  if (!response.ok) throw new Error("Impossible d'obtenir le token Agora");
  const data = await response.json();
  if (!data.token) throw new Error("Token manquant dans la réponse");
  return data.token;
}

// ─────────────────────────────────────────────
// 💱 Conversion de prix
// ─────────────────────────────────────────────
function convertPrice(price, currency, rates) {
  if (!price) return "0";
  const rate = rates[currency] || 1;
  return Math.round(price * rate).toLocaleString();
}

// ─────────────────────────────────────────────
// 🎨 Styles isolés (évite le re-render inutile)
// ─────────────────────────────────────────────
function Styles() {
  return (
    <style jsx>{`
      * { box-sizing: border-box; }

      .live-container {
        position: relative;
        width: 100%;
        height: 100vh;
        background: black;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }

      .video {
        flex: 1;
        background: #111;
        min-height: 0;
      }

      /* Overlay chargement / erreur */
      .status-overlay {
        position: absolute;
        inset: 0;
        background: rgba(0,0,0,0.78);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 16px;
        z-index: 200;
        color: white;
        font-size: 16px;
        text-align: center;
        padding: 20px;
      }
      .status-overlay button {
        padding: 10px 24px;
        background: #ff6600;
        color: white;
        border: none;
        border-radius: 20px;
        font-weight: bold;
        cursor: pointer;
      }
      .spinner {
        width: 40px;
        height: 40px;
        border: 4px solid rgba(255,255,255,0.25);
        border-top-color: #ff6600;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
      }

      /* Badge LIVE */
      .live-badge {
        position: absolute;
        top: 10px;
        left: 10px;
        background: red;
        color: white;
        padding: 5px 12px;
        border-radius: 20px;
        font-weight: bold;
        font-size: 13px;
        display: flex;
        align-items: center;
        gap: 8px;
        animation: blink 1.2s ease-in-out infinite;
        z-index: 100;
      }
      .dot {
        width: 8px; height: 8px;
        background: white;
        border-radius: 50%;
      }

      /* Wallet */
      .wallet-display {
        position: absolute;
        top: 10px;
        right: 10px;
        color: #00ff88;
        font-weight: bold;
        font-size: 13px;
        display: flex;
        flex-direction: column;
        gap: 4px;
        z-index: 100;
        text-shadow: 0 1px 4px rgba(0,0,0,0.8);
      }

      /* Boutons sociaux */
      .social-buttons {
        position: absolute;
        right: 10px;
        bottom: 115px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        z-index: 100;
      }
      .social-buttons button {
        background: rgba(0,0,0,0.55);
        border: none;
        color: white;
        padding: 10px;
        border-radius: 50%;
        font-size: 20px;
        cursor: pointer;
        transition: transform 0.15s;
      }
      .social-buttons button:active { transform: scale(0.88); }

      /* Aperçu chat */
      .chat-preview {
        position: absolute;
        bottom: 115px;
        left: 10px;
        right: 68px;
        background: rgba(0,0,0,0.42);
        color: white;
        padding: 8px 12px;
        font-size: 13px;
        border-radius: 12px;
        pointer-events: none;
        z-index: 100;
      }
      .chat-preview p { margin: 2px 0; }

      /* Modal commentaires */
      .modal {
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.65);
        display: flex;
        justify-content: center;
        align-items: flex-end;
        z-index: 9999;
      }
      .modal-content {
        background: white;
        width: 100%;
        max-width: 480px;
        border-radius: 20px 20px 0 0;
        padding: 20px;
        color: black;
        max-height: 70vh;
        display: flex;
        flex-direction: column;
      }
      .modal-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 10px;
      }
      .modal-header h3 { margin: 0; font-size: 16px; }
      .modal-header button { background: none; border: none; font-size: 18px; cursor: pointer; }
      .modal-body {
        flex: 1; overflow-y: auto;
        margin-bottom: 10px; font-size: 14px;
      }
      .modal-body p { margin: 6px 0; }
      .modal-body .empty { color: #aaa; text-align: center; margin-top: 24px; }
      .modal-footer { display: flex; gap: 8px; }
      .modal-footer input {
        flex: 1; padding: 8px 12px;
        border: 1px solid #ddd; border-radius: 20px;
        outline: none; font-size: 14px;
      }
      .modal-footer button {
        padding: 8px 16px; background: #ff6600;
        color: white; border: none; border-radius: 20px;
        font-weight: bold; cursor: pointer;
      }

      /* Barre produits */
      .product-bar {
        position: absolute;
        bottom: 158px;
        left: 0; width: 100%;
        display: flex;
        overflow-x: auto;
        gap: 12px;
        padding: 10px 12px;
        scroll-snap-type: x mandatory;
        scrollbar-width: none;
        z-index: 100;
      }
      .product-bar::-webkit-scrollbar { display: none; }
      .product-item {
        min-width: 108px;
        background: rgba(0,0,0,0.62);
        border-radius: 12px;
        padding: 8px;
        color: white;
        text-align: center;
        cursor: pointer;
        scroll-snap-align: center;
        transition: transform 0.2s, box-shadow 0.2s;
        flex-shrink: 0;
        border: 2px solid transparent;
      }
      .product-item img {
        width: 100%; height: 72px;
        object-fit: cover; border-radius: 8px;
      }
      .product-item p {
        margin: 4px 0 2px; font-size: 12px; font-weight: 600;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .product-item span { font-size: 11px; color: #ff9944; }
      .product-item.active {
        transform: scale(1.08);
        box-shadow: 0 0 18px rgba(255,102,0,0.85);
        border-color: #ff6600;
      }

      /* Sélecteur devise */
      .currency-selector {
        position: fixed;
        bottom: 88px; left: 50%;
        transform: translateX(-50%);
        background: rgba(0,0,0,0.85);
        padding: 8px 16px; border-radius: 25px;
        display: flex; align-items: center; gap: 10px;
        z-index: 10002; color: white;
        font-weight: 500; font-size: 14px; white-space: nowrap;
      }
      .currency-selector select {
        background: #ff6600; border: none;
        padding: 5px 10px; border-radius: 20px;
        color: white; font-weight: bold;
        cursor: pointer; outline: none; font-size: 13px;
      }

      /* Bouton Acheter */
      .buy-button {
        position: fixed;
        bottom: 20px; left: 50%;
        transform: translateX(-50%);
        background: #ff6600; color: white;
        border: none; padding: 14px 28px;
        border-radius: 30px; font-size: 15px;
        font-weight: bold; cursor: pointer;
        z-index: 10001;
        display: flex; align-items: center; gap: 8px;
        box-shadow: 0 4px 22px rgba(255,102,0,0.5);
        transition: background 0.2s, transform 0.15s;
        white-space: nowrap;
        max-width: 90vw; overflow: hidden; text-overflow: ellipsis;
      }
      .buy-button:hover:not(:disabled) {
        background: #e65c00;
        transform: translateX(-50%) scale(1.03);
      }
      .buy-button:disabled { opacity: 0.7; cursor: not-allowed; }
      .btn-spinner {
        width: 16px; height: 16px;
        border: 2px solid rgba(255,255,255,0.4);
        border-top-color: white; border-radius: 50%;
        animation: spin 0.7s linear infinite;
        flex-shrink: 0;
      }

      /* Toast */
      .toast {
        position: fixed; bottom: 24px; right: 16px;
        background: rgba(0,0,0,0.85); color: white;
        padding: 10px 16px; border-radius: 10px;
        font-size: 13px; z-index: 10000;
        animation: fadeIn 0.3s ease;
      }

      /* Desktop */
      @media (min-width: 1024px) {
        .live-container { flex-direction: row; }
        .video { width: 70%; height: 100%; }
        .chat-preview {
          position: static; width: 30%; height: 100%;
          overflow-y: auto; background: rgba(0,0,0,0.9);
          pointer-events: all; border-radius: 0;
          padding: 16px;
        }
      }

      @keyframes blink {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.3; }
      }
      @keyframes spin { to { transform: rotate(360deg); } }
      @keyframes fadeIn {
        from { opacity: 0; transform: translateY(8px); }
        to   { opacity: 1; transform: translateY(0); }
      }
    `}</style>
  );
}

// ─────────────────────────────────────────────
// 🎥 Composant principal
// ─────────────────────────────────────────────
export default function LiveClient() {
  const params = useSearchParams();
  // ✅ Seul `channel` est dans l'URL — le token est toujours récupéré côté client
  const channel = params.get("channel");

  const router = useRouter();
  const remoteRef = useRef(null);
  const agoraClientRef = useRef(null);

  const [user, setUser] = useState(null);
  const [agoraStatus, setAgoraStatus] = useState("idle");
  // "idle" | "loading" | "connected" | "error"
  const [errorMsg, setErrorMsg] = useState(null);

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [showComments, setShowComments] = useState(false);

  const [products, setProducts] = useState([]);
  const [activeProduct, setActiveProduct] = useState(null);

  const [currency, setCurrency] = useState("XOF");
  const [exchangeRates, setExchangeRates] = useState({ XOF: 1 });

  const [wallet, setWallet] = useState({});
  const [likes, setLikes] = useState(0);
  const [loadingPayment, setLoadingPayment] = useState(false);
  const [copiedToast, setCopiedToast] = useState(false);

  // ── Auth ──────────────────────────────────────
  useEffect(() => {
    return auth.onAuthStateChanged(setUser);
  }, []);

  // ── Taux de change ────────────────────────────
  useEffect(() => {
    (async () => {
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
        console.error("Taux de change:", err);
      }
    })();
  }, []);

  // ── Agora — token récupéré depuis le serveur ──
  useEffect(() => {
    if (typeof window === "undefined" || !channel) return;
    let cancelled = false;

    (async () => {
      setAgoraStatus("loading");
      setErrorMsg(null);
      try {
        // 1️⃣ Demande du token au serveur (jamais depuis l'URL ni Firestore)
        const token = await fetchAgoraToken(channel);
        if (cancelled) return;

        const AgoraRTC = (await import("agora-rtc-sdk-ng")).default;
        const uid = Math.floor(Math.random() * 100000);
        const client = AgoraRTC.createClient({ mode: "live", codec: "vp8" });
        agoraClientRef.current = client;

        // Gestion autoplay bloqué par le navigateur
        AgoraRTC.onAutoplayFailed = () => {
          const btn = document.createElement("button");
          btn.innerText = "▶️ Activer le son";
          btn.style.cssText =
            "position:fixed;bottom:80px;left:50%;transform:translateX(-50%);z-index:99999;padding:10px 20px;background:#ff6600;color:white;border:none;border-radius:20px;font-weight:bold;cursor:pointer;";
          btn.onclick = () => { AgoraRTC.resumeAudio(); AgoraRTC.resumeVideo(); btn.remove(); };
          document.body.appendChild(btn);
        };

        // 2️⃣ Connexion au canal avec le token frais
        await client.join(process.env.NEXT_PUBLIC_AGORA_APP_ID, channel, token, uid);
        if (cancelled) { client.leave(); return; }

        await client.setClientRole("audience");

        client.on("user-published", async (remoteUser, mediaType) => {
          await client.subscribe(remoteUser, mediaType);
          if (mediaType === "video" && remoteRef.current) {
            remoteUser.videoTrack.play(remoteRef.current);
          }
          if (mediaType === "audio") remoteUser.audioTrack.play();
        });

        client.on("user-unpublished", () => {
          if (remoteRef.current) remoteRef.current.innerHTML = "";
        });

        client.on("connection-state-change", (state) => {
          if (state === "DISCONNECTED" && !cancelled) setAgoraStatus("error");
        });

        setAgoraStatus("connected");
      } catch (err) {
        if (!cancelled) {
          console.error("Agora:", err);
          setAgoraStatus("error");
          setErrorMsg("Impossible de rejoindre le live. Réessayez.");
        }
      }
    })();

    return () => {
      cancelled = true;
      agoraClientRef.current?.leave().catch(() => {});
      agoraClientRef.current = null;
      if (remoteRef.current) remoteRef.current.innerHTML = "";
    };
  }, [channel]);

  // ── Commentaires (temps réel) ─────────────────
  useEffect(() => {
    if (!channel) return;
    return onSnapshot(
      query(collection(db, "live_comments"), where("channelId", "==", channel), orderBy("timestamp", "asc")),
      (snap) => setMessages(snap.docs.map((d) => d.data()))
    );
  }, [channel]);

  // ── Produits du live ──────────────────────────
  useEffect(() => {
    if (!channel) return;
    return onSnapshot(
      query(collection(db, "live_sessions"), where("channelId", "==", channel)),
      (snap) => {
        if (snap.empty) return;
        const liveProducts = snap.docs[0].data().products || [];
        setProducts(liveProducts);
        setActiveProduct((prev) => prev ?? liveProducts[0] ?? null);
      }
    );
  }, [channel]);

  // ── Wallet (temps réel) ───────────────────────
  useEffect(() => {
    if (!user) return;
    return onSnapshot(
      query(collection(db, "wallet_transactions"), where("userId", "==", user.uid), orderBy("createdAt", "desc")),
      (snap) => {
        const w = {};
        snap.docs.forEach((d) => {
          const tx = d.data();
          if (tx.status === "success") w[tx.currency] = (w[tx.currency] || 0) + tx.amount;
        });
        setWallet(w);
      }
    );
  }, [user]);

  // ── Envoi commentaire ─────────────────────────
  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || !channel) return;
    await addDoc(collection(db, "live_comments"), {
      channelId: channel,
      sender: user?.displayName || "Anonyme",
      text,
      timestamp: serverTimestamp(),
    });
    setInput("");
  }, [input, channel, user]);

  // ── Partage — token absent de l'URL ──────────
  const handleShare = async () => {
    const shareUrl = `${window.location.origin}/live?channel=${channel}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Live FriTok 🔴", text: "Viens voir ce live !", url: shareUrl });
      } else {
        await navigator.clipboard.writeText(shareUrl);
        setCopiedToast(true);
        setTimeout(() => setCopiedToast(false), 2500);
      }
    } catch (err) {
      console.error("Partage:", err);
    }
  };

  // ── Paiement sécurisé ─────────────────────────
  const handleBuy = async () => {
    if (!user) {
      router.push(`/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`);
      return;
    }
    if (!activeProduct?.productId || loadingPayment) return;
    setLoadingPayment(true);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/.netlify/functions/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ productId: activeProduct.productId, currency }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur paiement");
      window.location.href = data.paymentLink;
    } catch (err) {
      console.error("Paiement:", err);
      alert(err.message);
    } finally {
      setLoadingPayment(false);
    }
  };

  // ─────────────────────────────────────────────
  // 🎨 Rendu — channelId manquant
  // ─────────────────────────────────────────────
  if (!channel) {
    return (
      <main className="live-container">
        <div className="status-overlay">
          <p>❌ Lien invalide — identifiant du live manquant.</p>
          <button onClick={() => router.push("/")}>Retour à l'accueil</button>
        </div>
        <Styles />
      </main>
    );
  }

  const lastMessages = messages.slice(-3);

  return (
    <main className="live-container">

      {/* 📹 Vidéo Agora */}
      <div ref={remoteRef} className="video" />

      {/* ── Overlay statut ── */}
      {agoraStatus === "loading" && (
        <div className="status-overlay">
          <div className="spinner" />
          <p>Connexion au live en cours...</p>
        </div>
      )}
      {agoraStatus === "error" && (
        <div className="status-overlay">
          <p>⚠️ {errorMsg}</p>
          <button onClick={() => window.location.reload()}>🔄 Réessayer</button>
        </div>
      )}

      {/* 🔴 Badge LIVE */}
      <div className="live-badge"><span className="dot" /> LIVE</div>

      {/* 💰 Wallet */}
      {Object.keys(wallet).length > 0 && (
        <div className="wallet-display">
          {Object.entries(wallet).map(([cur, amt]) => (
            <span key={cur}>{cur}: {amt.toLocaleString()}</span>
          ))}
        </div>
      )}

      {/* 🎛️ Boutons sociaux */}
      <div className="social-buttons">
        <button onClick={() => setLikes((v) => v + 1)}>❤️ {likes}</button>
        <button onClick={handleShare}>🔗</button>
        <button onClick={() => setShowComments(true)}>💬</button>
      </div>

      {/* 💬 Aperçu derniers messages */}
      <div className="chat-preview">
        {lastMessages.map((msg, i) => (
          <p key={i}><strong>{msg.sender}:</strong> {msg.text}</p>
        ))}
      </div>

      {/* 💬 Modal commentaires */}
      {showComments && (
        <div className="modal" onClick={() => setShowComments(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>💬 Commentaires</h3>
              <button onClick={() => setShowComments(false)}>✖</button>
            </div>
            <div className="modal-body">
              {messages.length === 0
                ? <p className="empty">Aucun commentaire pour l'instant.</p>
                : messages.map((msg, i) => (
                    <p key={i}><strong>{msg.sender}:</strong> {msg.text}</p>
                  ))}
            </div>
            <div className="modal-footer">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                placeholder="Écris un commentaire..."
              />
              <button onClick={sendMessage}>Envoyer</button>
            </div>
          </div>
        </div>
      )}

      {/* 🛍️ Barre produits */}
      {products.length > 0 && (
        <div className="product-bar">
          {products.map((p, i) => (
            <div
              key={i}
              className={`product-item ${activeProduct?.productId === p.productId ? "active" : ""}`}
              onClick={() => setActiveProduct(p)}
            >
              <img src={p.image} alt={p.name} />
              <p>{p.name}</p>
              <span>{convertPrice(p.price, currency, exchangeRates)} {currency}</span>
            </div>
          ))}
        </div>
      )}

      {/* 💱 Sélecteur devise */}
      {activeProduct && (
        <div className="currency-selector">
          <label>Devise :</label>
          <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
            <option value="XOF">XOF (FCFA)</option>
            <option value="NGN">NGN (Naira)</option>
            <option value="GHS">GHS (Cedi)</option>
            <option value="USD">USD ($)</option>
          </select>
        </div>
      )}

      {/* 💳 Bouton Acheter */}
      {activeProduct && (
        <button className="buy-button" onClick={handleBuy} disabled={loadingPayment}>
          {loadingPayment
            ? <><span className="btn-spinner" /> Traitement...</>
            : <><FaShoppingCart /> Acheter {activeProduct.name} • {convertPrice(activeProduct.price, currency, exchangeRates)} {currency}</>
          }
        </button>
      )}

      {/* ✅ Toast */}
      {copiedToast && <div className="toast">✅ Lien copié !</div>}

      <Styles />
    </main>
  );
}