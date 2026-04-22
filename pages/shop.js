// pages/shop.js
// ─────────────────────────────────────────────────────────────
// Route : https://fritok.net/shop?userId=XXX
// Rendu  : SSR (getServerSideProps) → meta OG correctes pour
//          WhatsApp / Facebook + feed TikTok côté client
// ─────────────────────────────────────────────────────────────
import Head from "next/head";
import { useEffect, useRef, useState } from "react";
import { initializeApp, getApps }      from "firebase/app";
import {
  getFirestore, collection,
  query, where, getDocs,
} from "firebase/firestore";

// ── Firebase config (déplace dans .env.local en production) ──
const firebaseConfig = {
  apiKey           : process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain       : process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId        : process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket    : process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId            : process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

function getFirebaseApp() {
  return getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
}

// ─────────────────────────────────────────────────────────────
// SSR : récupère le 1er document pour les meta OG
// (WhatsApp/Facebook scrape côté serveur — pas de JS exécuté)
// ─────────────────────────────────────────────────────────────
export async function getServerSideProps({ query: q }) {
  const userId = q.userId || q.sellerId || null;

  if (!userId) {
    return { props: { userId: null, ogData: null } };
  }

  let ogData = null;

  try {
    // Import admin SDK si dispo, sinon REST Firestore
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}`
      + `/databases/(default)/documents/shop_videos`
      + `?pageSize=1`
      + `&orderBy=createdAt+desc`;

    // On utilise la Firebase REST API (sans auth → règles Firestore doivent
    // autoriser la lecture publique sur shop_videos, ou utilise Admin SDK)
    const res  = await fetch(url);
    const data = await res.json();

    if (data.documents?.length) {
      const fields = data.documents[0].fields ?? {};
      const product = fields.product?.mapValue?.fields ?? {};

      ogData = {
        title      : product.name?.stringValue
                     ?? fields.title?.stringValue
                     ?? "Boutique FriTok",
        description: product.description?.stringValue
                     ?? "Découvrez nos produits en vidéo sur FriTok",
        image      : product.thumbnail?.stringValue
                     ?? product.image?.stringValue
                     ?? "https://fritok.net/og-default.jpg",
      };
    }
  } catch (err) {
    console.error("SSR Firestore error:", err);
  }

  return {
    props: {
      userId,
      ogData: ogData ?? {
        title      : "Boutique FriTok",
        description: "Découvrez des produits en vidéo",
        image      : "https://fritok.net/og-default.jpg",
      },
    },
  };
}

// ─────────────────────────────────────────────────────────────
// Composant Page
// ─────────────────────────────────────────────────────────────
export default function ShopPage({ userId, ogData }) {
  const [videos,  setVideos]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  const pageUrl = userId
    ? `https://fritok.net/shop?userId=${userId}`
    : "https://fritok.net";

  // ── Chargement des vidéos côté client ─────────────────────
  useEffect(() => {
    if (!userId) { setLoading(false); return; }

    (async () => {
      try {
        const app = getFirebaseApp();
        const db  = getFirestore(app);
        // Pas d'orderBy → pas d'index composite requis
        // Tri effectué côté client par createdAt desc
        const q    = query(
          collection(db, "video_playlist"),
          where("userId", "==", userId),
        );
        const snap = await getDocs(q);
        const docs = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => {
            const ta = a.createdAt?.seconds ?? 0;
            const tb = b.createdAt?.seconds ?? 0;
            return tb - ta;
          });
        setVideos(docs);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [userId]);

  return (
    <>
      <Head>
        <title>{ogData?.title ?? "Boutique FriTok"}</title>
        <meta name="description" content={ogData?.description} />
        <meta name="viewport"
              content="width=device-width, initial-scale=1, viewport-fit=cover" />

        {/* ── Open Graph ── */}
        <meta property="og:site_name"   content="FriTok" />
        <meta property="og:type"        content="website" />
        <meta property="og:url"         content={pageUrl} />
        <meta property="og:title"       content={ogData?.title} />
        <meta property="og:description" content={ogData?.description} />
        <meta property="og:image"       content={ogData?.image} />
        <meta property="og:image:width"  content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:locale"      content="fr_FR" />

        {/* ── Twitter Card ── */}
        <meta name="twitter:card"        content="summary_large_image" />
        <meta name="twitter:title"       content={ogData?.title} />
        <meta name="twitter:description" content={ogData?.description} />
        <meta name="twitter:image"       content={ogData?.image} />

        <style>{CSS}</style>
      </Head>

      {loading && <Loader />}

      {!loading && error && (
        <div className="center-msg">
          <p className="err">⚠️ {error}</p>
        </div>
      )}

      {!loading && !error && !userId && (
        <div className="center-msg">
          <p className="err">Lien invalide — userId manquant.</p>
        </div>
      )}

      {!loading && !error && userId && videos.length === 0 && (
        <div className="center-msg">
          <p className="muted">Aucune vidéo disponible pour cette boutique.</p>
        </div>
      )}

      {!loading && videos.length > 0 && (
        <VideoFeed videos={videos} />
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// Feed TikTok
// ─────────────────────────────────────────────────────────────
function VideoFeed({ videos }) {
  return (
    <div id="feed">
      {videos.map((v, i) => (
        <VideoSlide key={v.id} video={v} index={i} />
      ))}
    </div>
  );
}

function VideoSlide({ video: v }) {
  const videoRef  = useRef(null);
  const slideRef  = useRef(null);
  const [paused, setPaused] = useState(true);
  const [liked,  setLiked]  = useState(false);
  const [likes,  setLikes]  = useState(v.likes ?? 0);

  const price = v.product?.price
    ? `${Number(v.product.price).toLocaleString("fr-FR")} XOF`
    : "";

  // Auto-play via IntersectionObserver
  useEffect(() => {
    const el  = slideRef.current;
    const vid = videoRef.current;
    if (!el || !vid) return;

    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        vid.play().catch(() => {});
        setPaused(false);
      } else {
        vid.pause();
        setPaused(true);
      }
    }, { threshold: 0.7 });

    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const togglePlay = (e) => {
    // Ne pas intercepter les clics sur le rail
    if (e.target.closest(".side-rail")) return;
    const vid = videoRef.current;
    if (!vid) return;
    if (vid.paused) { vid.play(); setPaused(false); }
    else            { vid.pause(); setPaused(true);  }
  };

  const handleLike = (e) => {
    e.stopPropagation();
    setLiked(l => !l);
    setLikes(n => liked ? n - 1 : n + 1);
  };

  const handleShare = (e) => {
    e.stopPropagation();
    const url = location.href;
    if (navigator.share) {
      navigator.share({ title: v.product?.name ?? "FriTok", url });
    } else {
      navigator.clipboard.writeText(url);
    }
  };

  return (
    <div className="slide" ref={slideRef} onClick={togglePlay}>
      <video
        ref={videoRef}
        className="bg-video"
        src={v.videoUrl}
        poster={v.product?.thumbnail || v.product?.image || ""}
        loop muted playsInline preload="metadata"
      />

      <div className="gradient-top" />
      <div className="gradient-bot" />

      {/* Logo */}
      <div className="hud-top">
        <div className="logo-chip">
          <span className="dot" />FriTok
        </div>
      </div>

      {/* Infos produit */}
      <div className="hud-bot">
        {v.product?.name && (
          <p className="product-name">{v.product.name}</p>
        )}
        {v.product?.description && (
          <p className="product-desc">{v.product.description}</p>
        )}
        {price && (
          <p className="product-price">{price}</p>
        )}
      </div>

      {/* Rail droit */}
      <div className="side-rail">
        <button className={`rail-btn${liked ? " liked" : ""}`}
                onClick={handleLike}>
          <HeartIcon />
          <span className="rail-count">{likes}</span>
        </button>

        <button className="rail-btn" onClick={handleShare}>
          <ShareIcon />
          <span className="rail-count">Partager</span>
        </button>

        {(v.product?.image || v.product?.thumbnail) && (
          <div className="product-thumb-wrap">
            <img
              className="product-thumb"
              src={v.product.image || v.product.thumbnail}
              alt={v.product.name ?? ""}
            />
          </div>
        )}
      </div>

      {/* Overlay pause */}
      {paused && (
        <div className="play-overlay">
          <div className="play-icon">▶</div>
        </div>
      )}
    </div>
  );
}

// ── Icônes SVG inline ────────────────────────────────────────
const HeartIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06
             a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78
             1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
  </svg>
);

const ShareIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="18" cy="5"  r="3" />
    <circle cx="6"  cy="12" r="3" />
    <circle cx="18" cy="19" r="3" />
    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
    <line x1="15.41" y1="6.51"  x2="8.59"  y2="10.49" />
  </svg>
);

// ── Loader ───────────────────────────────────────────────────
const Loader = () => (
  <div className="center-msg">
    <div className="spinner" />
    <p className="muted" style={{ marginTop: 16, letterSpacing: ".1em", fontSize: ".8rem" }}>
      CHARGEMENT…
    </p>
  </div>
);

// ─────────────────────────────────────────────────────────────
// CSS global (injecté dans <style> via Head)
// ─────────────────────────────────────────────────────────────
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;700;800&family=DM+Sans:wght@300;400;500&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --orange    : #FF6B00;
    --orange-hot: #FF8C00;
    --bg        : #0F0A00;
    --text1     : #FFF0DC;
    --muted     : rgba(170,144,96,.65);
    --border    : rgba(255,107,0,.25);
    --glow      : rgba(255,107,0,.4);
  }

  html, body {
    width: 100%; height: 100%;
    background: var(--bg);
    font-family: 'DM Sans', sans-serif;
    color: var(--text1);
    overflow: hidden;
  }

  /* Feed */
  #feed {
    width: 100vw; height: 100dvh;
    overflow-y: scroll;
    scroll-snap-type: y mandatory;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
  }
  #feed::-webkit-scrollbar { display: none; }

  /* Slide */
  .slide {
    position: relative;
    width: 100vw; height: 100dvh;
    scroll-snap-align: start;
    overflow: hidden;
    background: #080300;
    cursor: pointer;
  }

  /* Vidéo */
  .bg-video {
    position: absolute; inset: 0;
    width: 100%; height: 100%;
    object-fit: cover;
  }

  /* Gradients */
  .gradient-top {
    position: absolute; top: 0; left: 0; right: 0; height: 180px;
    background: linear-gradient(to bottom, rgba(15,5,0,.8), transparent);
    pointer-events: none;
  }
  .gradient-bot {
    position: absolute; bottom: 0; left: 0; right: 0; height: 55%;
    background: linear-gradient(to top,
      rgba(10,3,0,.95) 0%, rgba(10,3,0,.5) 50%, transparent);
    pointer-events: none;
  }

  /* HUD haut */
  .hud-top {
    position: absolute;
    top: env(safe-area-inset-top, 16px);
    left: 0; right: 0;
    display: flex; justify-content: center;
    padding: 12px 16px;
    pointer-events: none;
  }
  .logo-chip {
    display: flex; align-items: center; gap: 7px;
    background: rgba(0,0,0,.45);
    border: 1px solid var(--border);
    border-radius: 20px;
    padding: 6px 14px;
    font-family: 'Syne', sans-serif;
    font-weight: 800; font-size: .85rem; letter-spacing: .08em;
    color: var(--orange);
  }
  .dot {
    width: 7px; height: 7px; border-radius: 50%;
    background: var(--orange);
    box-shadow: 0 0 8px var(--orange);
    animation: pulse 1.2s ease infinite;
  }
  @keyframes pulse {
    0%,100% { opacity: 1; transform: scale(1); }
    50%     { opacity: .4; transform: scale(.85); }
  }

  /* HUD bas */
  .hud-bot {
    position: absolute; bottom: 0; left: 0; right: 90px;
    padding: 0 16px 44px;
  }
  .product-name {
    font-family: 'Syne', sans-serif;
    font-weight: 800; font-size: 1.1rem; line-height: 1.25;
    margin-bottom: 6px;
    text-shadow: 0 2px 12px rgba(0,0,0,.7);
  }
  .product-desc {
    font-size: .8rem; color: rgba(255,240,220,.7);
    line-height: 1.4; margin-bottom: 10px;
    display: -webkit-box;
    -webkit-line-clamp: 2; -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .product-price {
    display: inline-block;
    background: linear-gradient(90deg, var(--orange), var(--orange-hot));
    padding: 5px 14px; border-radius: 20px;
    font-family: 'Syne', sans-serif;
    font-weight: 800; font-size: 1rem;
    box-shadow: 0 4px 18px rgba(255,107,0,.45);
  }

  /* Rail droit */
  .side-rail {
    position: absolute; right: 10px; bottom: 40px;
    display: flex; flex-direction: column;
    align-items: center; gap: 20px;
  }
  .rail-btn {
    background: none; border: none; cursor: pointer;
    display: flex; flex-direction: column;
    align-items: center; gap: 4px;
    color: var(--text1);
  }
  .rail-btn svg {
    width: 28px; height: 28px;
    filter: drop-shadow(0 2px 8px rgba(0,0,0,.6));
    transition: transform .15s;
  }
  .rail-btn:active svg { transform: scale(.82); }
  .rail-btn.liked svg  { fill: #FF6B9D; stroke: #FF6B9D; }
  .rail-count {
    font-size: .63rem; font-family: 'Syne', sans-serif;
    font-weight: 700; color: rgba(255,240,220,.8);
    letter-spacing: .04em;
  }
  .product-thumb-wrap {
    width: 44px; height: 44px; border-radius: 10px;
    border: 2px solid var(--orange); overflow: hidden;
    box-shadow: 0 0 14px rgba(255,107,0,.4);
  }
  .product-thumb { width: 100%; height: 100%; object-fit: cover; }

  /* Overlay pause */
  .play-overlay {
    position: absolute; inset: 0;
    display: flex; align-items: center; justify-content: center;
  }
  .play-icon {
    width: 64px; height: 64px; border-radius: 50%;
    background: rgba(255,107,0,.2);
    border: 2px solid rgba(255,107,0,.5);
    display: flex; align-items: center; justify-content: center;
    font-size: 1.4rem; backdrop-filter: blur(4px);
    animation: fadeIn .15s ease;
  }
  @keyframes fadeIn { from { opacity: 0; transform: scale(.8); } }

  /* Centre état vide / erreur */
  .center-msg {
    position: fixed; inset: 0;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    background: var(--bg);
  }
  .spinner {
    width: 44px; height: 44px;
    border: 3px solid rgba(255,107,0,.2);
    border-top-color: var(--orange);
    border-radius: 50%;
    animation: spin .8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .muted  { color: var(--muted); font-size: .9rem; }
  .err    { color: var(--orange); font-size: 1rem; }

  /* Desktop : centré comme TikTok */
  @media (min-width: 560px) {
    #feed {
      max-width: 400px;
      margin: 0 auto;
      box-shadow: 0 0 80px rgba(255,107,0,.07);
    }
  }
`;