// pages/shop.js  — v4
// Ajout : vérification Firebase Auth avant d'ouvrir le modal commande.
//         Si non connecté → modal "Connexion requise" avec boutons
//         Se connecter / Créer un compte (redirect conservé).
// ─────────────────────────────────────────────────────────────
import Head from "next/head";
import { useEffect, useRef, useState } from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore, collection, query, where, getDocs,
  addDoc, serverTimestamp,
} from "firebase/firestore";
import { getAuth, onAuthStateChanged } from "firebase/auth";

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
// SSR — meta Open Graph pour WhatsApp / Facebook
// ─────────────────────────────────────────────────────────────
export async function getServerSideProps({ query: q }) {
  const userId = q.userId || q.sellerId || null;
  if (!userId) return { props: { userId: null, ogData: null } };

  let ogData = null;
  try {
    const pid = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    const res  = await fetch(
      `https://firestore.googleapis.com/v1/projects/${pid}/databases/(default)/documents/shop_videos?pageSize=1`
    );
    const data = await res.json();
    if (data.documents?.length) {
      const f = data.documents[0].fields ?? {};
      const p = f.product?.mapValue?.fields ?? {};
      ogData = {
        title      : p.name?.stringValue       ?? f.title?.stringValue ?? "Boutique FriTok",
        description: p.description?.stringValue ?? "Découvrez nos produits en vidéo",
        image      : p.thumbnail?.stringValue   ?? p.image?.stringValue ?? "https://fritok.net/og-default.jpg",
      };
    }
  } catch (e) { console.error("SSR:", e); }

  return {
    props: {
      userId,
      ogData: ogData ?? {
        title: "Boutique FriTok",
        description: "Découvrez des produits en vidéo",
        image: "https://fritok.net/og-default.jpg",
      },
    },
  };
}

// ─────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────
export default function ShopPage({ userId, ogData }) {
  const [videos,  setVideos]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [muted,   setMuted]   = useState(true);

  // ── État auth ─────────────────────────────────────────────
  // null = en cours de vérification, false = non connecté, object = connecté
  const [authUser, setAuthUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);

  const pageUrl = userId
    ? `https://fritok.net/shop?userId=${userId}`
    : "https://fritok.net";

  // ── Observer Firebase Auth ────────────────────────────────
  useEffect(() => {
    const auth  = getAuth(getFirebaseApp());
    const unsub = onAuthStateChanged(auth, (user) => {
      setAuthUser(user && user.emailVerified ? user : null);
      setAuthReady(true);
    });
    return unsub;
  }, []);

  // ── Chargement des vidéos ─────────────────────────────────
  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    (async () => {
      try {
        const db   = getFirestore(getFirebaseApp());
        const q    = query(collection(db, "video_playlist"), where("userId", "==", userId));
        const snap = await getDocs(q);
        const docs = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
        setVideos(docs);
      } catch (e) { setError(e.message); }
      finally     { setLoading(false); }
    })();
  }, [userId]);

  return (
    <>
      <Head>
        <title>{ogData?.title ?? "Boutique FriTok"}</title>
        <meta name="description"         content={ogData?.description} />
        <meta name="viewport"            content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta property="og:site_name"    content="FriTok" />
        <meta property="og:type"         content="website" />
        <meta property="og:url"          content={pageUrl} />
        <meta property="og:title"        content={ogData?.title} />
        <meta property="og:description"  content={ogData?.description} />
        <meta property="og:image"        content={ogData?.image} />
        <meta property="og:image:width"  content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:locale"       content="fr_FR" />
        <meta name="twitter:card"        content="summary_large_image" />
        <meta name="twitter:image"       content={ogData?.image} />
        <style>{CSS}</style>
      </Head>

      {loading && <Loader />}
      {!loading && error   && <CenterMsg text={`⚠️ ${error}`} isErr />}
      {!loading && !userId && <CenterMsg text="Lien invalide — userId manquant." isErr />}
      {!loading && !error && userId && videos.length === 0 && (
        <CenterMsg text="Aucune vidéo pour cette boutique." />
      )}
      {!loading && videos.length > 0 && (
        <VideoFeed
          videos={videos}
          muted={muted}
          setMuted={setMuted}
          userId={userId}
          authUser={authUser}
          authReady={authReady}
          pageUrl={pageUrl}
        />
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// Feed
// ─────────────────────────────────────────────────────────────
function VideoFeed({ videos, muted, setMuted, userId, authUser, authReady, pageUrl }) {
  const [orderVideo,  setOrderVideo]  = useState(null); // vidéo → modal commande
  const [authPrompt,  setAuthPrompt]  = useState(null); // vidéo → modal auth requis

  // ── Clic sur "Commander" ──────────────────────────────────
  // Si auth non prête on attend, si non connecté → modal auth
  const handleOrder = (video) => {
    if (!authReady) return; // attendre la résolution auth
    if (!authUser) {
      setAuthPrompt(video);  // non connecté → demander connexion
    } else {
      setOrderVideo(video);  // connecté → ouvrir commande
    }
  };

  return (
    <>
      <div id="feed">
        {videos.map((v) => (
          <VideoSlide key={v.id} video={v} muted={muted} onOrder={() => handleOrder(v)} />
        ))}
      </div>

      {/* Bouton mute global */}
      <button className="mute-btn" onClick={() => setMuted(m => !m)}
        title={muted ? "Activer le son" : "Couper le son"}>
        {muted ? <MuteIcon /> : <UnmuteIcon />}
      </button>

      {/* Modal connexion requise */}
      {authPrompt && (
        <AuthRequiredModal
          pageUrl={pageUrl}
          onClose={() => setAuthPrompt(null)}
          onContinue={() => {
            // Après connexion, l'observer mettra authUser à jour
            // et l'utilisateur pourra re-cliquer sur Commander
            setAuthPrompt(null);
          }}
        />
      )}

      {/* Modal commande livraison */}
      {orderVideo && (
        <OrderModal
          video={orderVideo}
          userId={userId}
          authUser={authUser}
          onClose={() => setOrderVideo(null)}
        />
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// Modal : connexion requise avant de commander
// ─────────────────────────────────────────────────────────────
function AuthRequiredModal({ pageUrl, onClose }) {
  const encodedRedirect = encodeURIComponent(pageUrl);

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-sheet auth-modal">
        <div className="modal-handle" />

        <div className="auth-modal-body">
          {/* Icône */}
          <div className="auth-icon-wrap">
            <LockShieldIcon />
          </div>

          <h2 className="auth-title">Connexion requise</h2>
          <p className="auth-sub">
            Créez un compte ou connectez-vous pour passer une commande sur FriTok.
          </p>

          {/* Bouton connexion */}
          <a className="auth-btn-primary" href={`/login?redirect=${encodedRedirect}`}>
            <UserIcon /> Se connecter
          </a>

          {/* Bouton inscription */}
          <a className="auth-btn-outline" href={`/register?redirect=${encodedRedirect}`}>
            Créer un compte gratuit
          </a>

          <button className="auth-skip" onClick={onClose}>
            Continuer à regarder
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Slide vidéo
// ─────────────────────────────────────────────────────────────
function VideoSlide({ video: v, muted, onOrder }) {
  const videoRef = useRef(null);
  const slideRef = useRef(null);
  const [paused, setPaused] = useState(true);
  const [liked,  setLiked]  = useState(false);
  const [likes,  setLikes]  = useState(v.likes ?? 0);

  const price = v.product?.price
    ? `${Number(v.product.price).toLocaleString("fr-FR")} XOF`
    : "";

  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted;
  }, [muted]);

  useEffect(() => {
    const el = slideRef.current, vid = videoRef.current;
    if (!el || !vid) return;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { vid.play().catch(() => {}); setPaused(false); }
      else                  { vid.pause();                 setPaused(true);  }
    }, { threshold: 0.7 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const togglePlay = (e) => {
    if (e.target.closest(".side-rail") || e.target.closest(".order-btn")) return;
    const vid = videoRef.current;
    if (!vid) return;
    vid.paused ? (vid.play(), setPaused(false)) : (vid.pause(), setPaused(true));
  };

  const handleLike = (e) => {
    e.stopPropagation();
    setLiked(l => !l);
    setLikes(n => liked ? n - 1 : n + 1);
  };

  const handleShare = (e) => {
    e.stopPropagation();
    if (navigator.share) navigator.share({ title: v.product?.name ?? "FriTok", url: location.href });
    else navigator.clipboard?.writeText(location.href);
  };

  return (
    <div className="slide" ref={slideRef} onClick={togglePlay}>
      <video ref={videoRef} className="bg-video" src={v.videoUrl}
        poster={v.product?.thumbnail || v.product?.image || ""}
        loop muted playsInline preload="metadata" />
      <div className="gradient-top" />
      <div className="gradient-bot" />

      <div className="hud-top">
        <div className="logo-chip"><span className="dot" />FriTok</div>
      </div>

      <div className="hud-bot">
        {v.product?.name        && <p className="product-name">{v.product.name}</p>}
        {v.product?.description && <p className="product-desc">{v.product.description}</p>}
        <div className="hud-bot-row">
          {price && <p className="product-price">{price}</p>}
          <button className="order-btn" onClick={(e) => { e.stopPropagation(); onOrder(); }}>
            <CartIcon /> Commander
          </button>
        </div>
      </div>

      <div className="side-rail">
        <button className={`rail-btn${liked ? " liked" : ""}`} onClick={handleLike}>
          <HeartIcon /><span className="rail-count">{likes}</span>
        </button>
        <button className="rail-btn" onClick={handleShare}>
          <ShareIcon /><span className="rail-count">Partager</span>
        </button>
        {(v.product?.image || v.product?.thumbnail) && (
          <div className="product-thumb-wrap">
            <img className="product-thumb" src={v.product.image || v.product.thumbnail} alt="" />
          </div>
        )}
      </div>

      {paused && (
        <div className="play-overlay"><div className="play-icon">▶</div></div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Modal commande + livraison
// ─────────────────────────────────────────────────────────────
const VILLES_CI = [
  "Abidjan","Bouaké","Daloa","Korhogo","Yamoussoukro","San-Pédro",
  "Man","Divo","Gagnoa","Abengourou","Soubré","Odienné","Duekoué",
  "Bondoukou","Mankono","Séguéla","Touba","Ferkessédougou","Katiola",
  "Agboville","Adzopé","Tiassalé","Lakota","Issia","Sassandra",
];

const TARIFS = {
  "Abidjan": { "Abidjan": 1500, "Bouaké": 6500, default: 7000 },
  "Bouaké" : { "Bouaké":  1500, "Abidjan": 6500, default: 7500 },
  default  : { default: 8000 },
};

function getFrais(villeVendeur, villeClient, typeLivr) {
  const base = (TARIFS[villeVendeur] ?? TARIFS.default)[villeClient]
            ?? (TARIFS[villeVendeur] ?? TARIFS.default).default
            ?? 8000;
  return typeLivr === "groupee" ? Math.round(base * 0.8) : base;
}

function OrderModal({ video: v, userId, authUser, onClose }) {
  const db = getFirestore(getFirebaseApp());

  const [step,        setStep]        = useState("form");
  const [telephone,   setTelephone]   = useState(
    // Pré-remplir avec le téléphone du profil si dispo
    authUser?.phoneNumber ?? ""
  );
  const [adresse,     setAdresse]     = useState("");
  const [villeClient, setVilleClient] = useState("");
  const [typeLivr,    setTypeLivr]    = useState("solo");
  const [modePaiem,   setModePaiem]   = useState("livraison");
  const [locLoading,  setLocLoading]  = useState(false);
  const [gpsCoords,   setGpsCoords]   = useState(null);
  const [submitting,  setSubmitting]  = useState(false);
  const [errors,      setErrors]      = useState({});
  const [commandeId,  setCommandeId]  = useState(null);
  const [qrData,      setQrData]      = useState(null);
  const [toast,       setToast]       = useState(null);

  const prix     = Number(v.product?.price ?? 0);
  const fraisXof = villeClient ? getFrais("Abidjan", villeClient, typeLivr) : 0;
  const totalXof = prix + fraisXof;
  const fmt      = (n) => n.toLocaleString("fr-FR") + " XOF";

  const localiser = () => {
    setLocLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        showToast("📍 Position capturée !");
        setLocLoading(false);
      },
      (err) => { showToast("GPS refusé : " + err.message); setLocLoading(false); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const validate = () => {
    const e = {};
    if (!telephone.replace(/\D/g,"").trim() || telephone.replace(/\D/g,"").length < 8)
      e.telephone = "Numéro invalide (min 8 chiffres)";
    if (!adresse.trim())  e.adresse = "Adresse obligatoire";
    if (!villeClient)     e.ville   = "Choisissez une ville";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const confirmer = async () => {
    if (!validate()) return;
    setSubmitting(true);
    try {
      const payload = {
        // ── Données client connecté ──────────────────────
        clientUid     : authUser?.uid          ?? null,
        clientEmail   : authUser?.email        ?? null,
        // ── Produit ──────────────────────────────────────
        userId,
        productId     : v.product?.productId   ?? v.id,
        productName   : v.product?.name         ?? "",
        productImage  : v.product?.image        ?? v.product?.thumbnail ?? "",
        videoId       : v.videoId               ?? v.id,
        // ── Prix ─────────────────────────────────────────
        prixArticle   : prix,
        fraisLivraison: fraisXof,
        totalXof,
        // ── Livraison ────────────────────────────────────
        telephone     : telephone.trim(),
        adresse       : adresse.trim(),
        villeClient,
        villeVendeur  : "Abidjan",
        typeLivraison : typeLivr,
        modePaiement  : modePaiem,
        clientLat     : gpsCoords?.lat ?? null,
        clientLng     : gpsCoords?.lng ?? null,
        statut        : "en_attente",
        source        : "web_shop",
        createdAt     : serverTimestamp(),
      };

      const docRef = await addDoc(collection(db, "commandes"), payload);
      const cId    = docRef.id;
      const qr     = JSON.stringify({
        commandeId: cId, client: telephone.trim(),
        adresse: adresse.trim(), ville: villeClient,
        total: fmt(totalXof),
        ...(gpsCoords ? { lat: gpsCoords.lat.toFixed(6), lng: gpsCoords.lng.toFixed(6) } : {}),
        ts: Date.now(),
      });
      setCommandeId(cId); setQrData(qr); setStep("qr");
    } catch (e) { showToast("Erreur : " + e.message); }
    finally     { setSubmitting(false); }
  };

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3500); };

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-sheet">
        <div className="modal-handle" />

        <div className="modal-header">
          <div>
            <p className="modal-title">
              {step === "qr" ? "✅ Commande confirmée" : "🛍️ Commander avec livraison"}
            </p>
            <p className="modal-sub">
              {step === "qr" ? "Votre QR code de récupération" : (v.product?.name ?? "")}
            </p>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {/* ── Badge utilisateur connecté ── */}
        {step === "form" && authUser && (
          <div className="auth-badge">
            <UserCheckIcon />
            <span>Connecté en tant que <strong>{authUser.email}</strong></span>
          </div>
        )}

        {/* ── FORMULAIRE ── */}
        {step === "form" && (
          <div className="modal-body">
            <div className="recap-card">
              {(v.product?.image || v.product?.thumbnail) && (
                <img className="recap-img" src={v.product.image || v.product.thumbnail} alt="" />
              )}
              <div className="recap-info">
                <p className="recap-name">{v.product?.name}</p>
                <p className="recap-price">{fmt(prix)}</p>
              </div>
            </div>

            <FieldLabel text="TYPE DE LIVRAISON" />
            <div className="toggle-row">
              <ToggleOpt label="Solo"    sub="Livreur dédié"    selected={typeLivr === "solo"}    onTap={() => setTypeLivr("solo")} />
              <ToggleOpt label="Groupée" sub="Tournée partagée" selected={typeLivr === "groupee"} onTap={() => setTypeLivr("groupee")} />
            </div>

            <FieldLabel text="MODE DE PAIEMENT" />
            <div className="toggle-row">
              <ToggleOpt label="À la livraison" sub="Cash"               selected={modePaiem === "livraison"} onTap={() => setModePaiem("livraison")} />
              <ToggleOpt label="En ligne"        sub="Paiement sécurisé" selected={modePaiem === "immediat"}  onTap={() => setModePaiem("immediat")} />
            </div>

            <FieldLabel text="TÉLÉPHONE DE CONTACT" />
            <input className={`form-input${errors.telephone ? " input-err" : ""}`}
              type="tel" placeholder="07 XX XX XX XX"
              value={telephone} onChange={e => setTelephone(e.target.value)} />
            {errors.telephone && <p className="err-msg">{errors.telephone}</p>}

            <FieldLabel text="VILLE DE LIVRAISON" />
            <select className={`form-input${errors.ville ? " input-err" : ""}`}
              value={villeClient} onChange={e => setVilleClient(e.target.value)}>
              <option value="">Sélectionnez votre ville…</option>
              {VILLES_CI.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            {errors.ville && <p className="err-msg">{errors.ville}</p>}

            {villeClient && (
              <div className="frais-card">
                <div className="frais-row"><span>Articles</span><span>{fmt(prix)}</span></div>
                <div className="frais-row">
                  <span>Livraison {typeLivr === "groupee" ? "(-20%) 🟢" : ""}</span>
                  <span>{fmt(fraisXof)}</span>
                </div>
                <div className="frais-divider" />
                <div className="frais-row frais-total"><span>Total</span><span>{fmt(totalXof)}</span></div>
              </div>
            )}

            <FieldLabel text="ADRESSE DE LIVRAISON" />
            <textarea className={`form-input form-textarea${errors.adresse ? " input-err" : ""}`}
              placeholder="Quartier, rue, point de repère…"
              value={adresse} onChange={e => setAdresse(e.target.value)} rows={2} />
            {errors.adresse && <p className="err-msg">{errors.adresse}</p>}

            <button className={`loc-btn${gpsCoords ? " loc-ok" : ""}`}
              onClick={localiser} disabled={locLoading}>
              {locLoading
                ? <span className="spinner-sm" />
                : gpsCoords
                  ? `✅ ${gpsCoords.lat.toFixed(4)}, ${gpsCoords.lng.toFixed(4)}`
                  : <><PinIcon /> Localiser mon adresse de livraison</>
              }
            </button>

            <button className="confirm-btn" onClick={confirmer} disabled={submitting}>
              {submitting
                ? <span className="spinner-sm" />
                : modePaiem === "immediat" ? `Payer ${fmt(totalXof)}` : "Commander — payer à la livraison"
              }
            </button>
          </div>
        )}

        {/* ── QR CODE ── */}
        {step === "qr" && commandeId && (
          <div className="modal-body qr-step">
            <p className="qr-hint">Le livreur scannera ce code pour récupérer votre commande</p>
            <div className="qr-wrap">
              <img className="qr-img"
                src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(qrData)}`}
                alt="QR commande" />
            </div>
            <div className="cid-card" onClick={() => {
              navigator.clipboard?.writeText(commandeId);
              showToast("ID copié !");
            }}>
              <span className="cid-label">Commande #</span>
              <span className="cid-value">{commandeId}</span>
              <CopyIcon />
            </div>
            {gpsCoords && (
              <p className="gps-tag">📍 {gpsCoords.lat.toFixed(5)}, {gpsCoords.lng.toFixed(5)}</p>
            )}
            <div className="frais-card" style={{width:"100%"}}>
              <div className="frais-row"><span>{v.product?.name}</span><span>{fmt(prix)}</span></div>
              <div className="frais-row"><span>Livraison → {villeClient}</span><span>{fmt(fraisXof)}</span></div>
              <div className="frais-divider" />
              <div className="frais-row frais-total"><span>Total</span><span>{fmt(totalXof)}</span></div>
              <div className="frais-row" style={{marginTop:6,opacity:.65,fontSize:".75rem"}}>
                <span>Paiement</span>
                <span>{modePaiem === "immediat" ? "En ligne ✅" : "À la livraison"}</span>
              </div>
            </div>
            <button className="confirm-btn" onClick={onClose}>Fermer</button>
          </div>
        )}

        {toast && <div className="toast">{toast}</div>}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Petits composants
// ─────────────────────────────────────────────────────────────
const FieldLabel  = ({ text }) => <p className="field-label">{text}</p>;
const CenterMsg   = ({ text, isErr }) => (
  <div className="center-msg"><p className={isErr ? "err" : "muted"}>{text}</p></div>
);
const Loader = () => (
  <div className="center-msg">
    <div className="spinner-big" />
    <p className="muted" style={{marginTop:16,fontSize:".8rem",letterSpacing:".1em"}}>CHARGEMENT…</p>
  </div>
);
const ToggleOpt = ({ label, sub, selected, onTap }) => (
  <button className={`toggle-opt${selected ? " toggle-sel" : ""}`} onClick={onTap}>
    <span className="toggle-label">{label}</span>
    <span className="toggle-sub">{sub}</span>
  </button>
);

// ── Icônes SVG ───────────────────────────────────────────────
const HeartIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
  </svg>
);
const ShareIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
  </svg>
);
const CartIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{width:15,height:15}}>
    <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/>
    <line x1="3" y1="6" x2="21" y2="6"/>
    <path d="M16 10a4 4 0 01-8 0"/>
  </svg>
);
const PinIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width:15,height:15,marginRight:6}}>
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/>
    <circle cx="12" cy="10" r="3"/>
  </svg>
);
const CopyIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width:14,height:14,opacity:.6}}>
    <rect x="9" y="9" width="13" height="13" rx="2"/>
    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
  </svg>
);
const MuteIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
    <line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>
  </svg>
);
const UnmuteIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
    <path d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07"/>
  </svg>
);
const LockShieldIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{width:40,height:40,color:"#FF6B1A"}}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    <path d="M9 12l2 2 4-4"/>
  </svg>
);
const UserIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width:18,height:18}}>
    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
    <circle cx="12" cy="7" r="4"/>
  </svg>
);
const UserCheckIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width:16,height:16,color:"#34C759",flexShrink:0}}>
    <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
    <circle cx="8.5" cy="7" r="4"/>
    <polyline points="17 11 19 13 23 9"/>
  </svg>
);

// ─────────────────────────────────────────────────────────────
// CSS global
// ─────────────────────────────────────────────────────────────
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;700;800&family=DM+Sans:wght@300;400;500;600&display=swap');
  *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
  :root {
    --orange    : #FF6B00;
    --orange-hot: #FF8C00;
    --bg        : #0F0A00;
    --surface   : #1A0D00;
    --text1     : #FFF0DC;
    --muted     : rgba(170,144,96,.65);
    --border    : rgba(255,107,0,.25);
    --glow      : rgba(255,107,0,.4);
  }
  html,body { width:100%; height:100%; background:var(--bg);
    font-family:'DM Sans',sans-serif; color:var(--text1); overflow:hidden; }

  /* Feed */
  #feed { width:100vw; height:100dvh; overflow-y:scroll;
    scroll-snap-type:y mandatory; -webkit-overflow-scrolling:touch; scrollbar-width:none; }
  #feed::-webkit-scrollbar { display:none; }

  /* Slide */
  .slide { position:relative; width:100vw; height:100dvh;
    scroll-snap-align:start; overflow:hidden; background:#080300; cursor:pointer; }
  .bg-video { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; }
  .gradient-top { position:absolute; top:0; left:0; right:0; height:180px;
    background:linear-gradient(to bottom,rgba(15,5,0,.8),transparent); pointer-events:none; }
  .gradient-bot { position:absolute; bottom:0; left:0; right:0; height:60%;
    background:linear-gradient(to top,rgba(10,3,0,.97) 0%,rgba(10,3,0,.5) 50%,transparent);
    pointer-events:none; }

  /* HUD top */
  .hud-top { position:absolute; top:env(safe-area-inset-top,16px); left:0; right:0;
    display:flex; justify-content:center; padding:12px 16px; pointer-events:none; }
  .logo-chip { display:flex; align-items:center; gap:7px;
    background:rgba(0,0,0,.45); border:1px solid var(--border); border-radius:20px;
    padding:6px 14px; font-family:'Syne',sans-serif; font-weight:800;
    font-size:.85rem; letter-spacing:.08em; color:var(--orange); }
  .dot { width:7px; height:7px; border-radius:50%; background:var(--orange);
    box-shadow:0 0 8px var(--orange); animation:pulse 1.2s ease infinite; }
  @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.4;transform:scale(.85)} }

  /* HUD bot */
  .hud-bot { position:absolute; bottom:0; left:0; right:90px; padding:0 16px 44px; }
  .product-name { font-family:'Syne',sans-serif; font-weight:800; font-size:1.1rem;
    line-height:1.25; margin-bottom:6px; text-shadow:0 2px 12px rgba(0,0,0,.7); }
  .product-desc { font-size:.8rem; color:rgba(255,240,220,.7); line-height:1.4;
    margin-bottom:10px; display:-webkit-box; -webkit-line-clamp:2;
    -webkit-box-orient:vertical; overflow:hidden; }
  .hud-bot-row { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
  .product-price { display:inline-block;
    background:linear-gradient(90deg,var(--orange),var(--orange-hot));
    padding:5px 14px; border-radius:20px; font-family:'Syne',sans-serif;
    font-weight:800; font-size:1rem; box-shadow:0 4px 18px rgba(255,107,0,.45); }

  /* Bouton Commander */
  .order-btn { display:flex; align-items:center; gap:7px;
    background:rgba(255,107,0,.15); border:1.5px solid rgba(255,107,0,.6);
    border-radius:20px; padding:7px 16px; color:var(--text1);
    font-family:'Syne',sans-serif; font-weight:700; font-size:.82rem;
    cursor:pointer; backdrop-filter:blur(8px); transition:all .15s; }
  .order-btn:hover  { background:rgba(255,107,0,.3); }
  .order-btn:active { transform:scale(.95); }

  /* Mute */
  .mute-btn { position:fixed; top:env(safe-area-inset-top,14px); right:14px; z-index:90;
    width:40px; height:40px; border-radius:50%;
    background:rgba(0,0,0,.55); border:1.5px solid rgba(255,107,0,.35);
    color:var(--text1); cursor:pointer; display:flex; align-items:center;
    justify-content:center; backdrop-filter:blur(6px); transition:all .2s; }
  .mute-btn:hover { background:rgba(255,107,0,.25); }
  .mute-btn svg { width:18px; height:18px; }

  /* Rail droit */
  .side-rail { position:absolute; right:10px; bottom:40px;
    display:flex; flex-direction:column; align-items:center; gap:20px; }
  .rail-btn { background:none; border:none; cursor:pointer;
    display:flex; flex-direction:column; align-items:center; gap:4px; color:var(--text1); }
  .rail-btn svg { width:28px; height:28px; filter:drop-shadow(0 2px 8px rgba(0,0,0,.6));
    transition:transform .15s; }
  .rail-btn:active svg { transform:scale(.82); }
  .rail-btn.liked svg  { fill:#FF6B9D; stroke:#FF6B9D; }
  .rail-count { font-size:.63rem; font-family:'Syne',sans-serif;
    font-weight:700; color:rgba(255,240,220,.8); letter-spacing:.04em; }
  .product-thumb-wrap { width:44px; height:44px; border-radius:10px;
    border:2px solid var(--orange); overflow:hidden; box-shadow:0 0 14px rgba(255,107,0,.4); }
  .product-thumb { width:100%; height:100%; object-fit:cover; }

  /* Overlay pause */
  .play-overlay { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; }
  .play-icon { width:64px; height:64px; border-radius:50%;
    background:rgba(255,107,0,.2); border:2px solid rgba(255,107,0,.5);
    display:flex; align-items:center; justify-content:center;
    font-size:1.4rem; backdrop-filter:blur(4px); animation:fadeIn .15s ease; }
  @keyframes fadeIn { from{opacity:0;transform:scale(.8)} }

  /* États vides */
  .center-msg { position:fixed; inset:0; display:flex; flex-direction:column;
    align-items:center; justify-content:center; background:var(--bg); }
  .spinner-big { width:44px; height:44px; border:3px solid rgba(255,107,0,.2);
    border-top-color:var(--orange); border-radius:50%; animation:spin .8s linear infinite; }
  @keyframes spin { to{transform:rotate(360deg)} }
  .muted { color:var(--muted); font-size:.9rem; }
  .err   { color:var(--orange); font-size:1rem; }

  /* ── Modal commun ── */
  .modal-backdrop { position:fixed; inset:0; z-index:200;
    background:rgba(0,0,0,.72); display:flex; align-items:flex-end;
    backdrop-filter:blur(5px); animation:fadeIn .2s ease; }
  .modal-sheet { width:100%; max-height:93dvh; background:var(--surface);
    border-radius:24px 24px 0 0; border:1px solid var(--border); border-bottom:none;
    overflow-y:auto; display:flex; flex-direction:column;
    animation:slideUp .32s cubic-bezier(.32,1,.32,1); }
  @keyframes slideUp { from{transform:translateY(100%)} }
  .modal-handle { width:36px; height:4px; border-radius:2px;
    background:rgba(255,107,0,.25); margin:12px auto 0; flex-shrink:0; }
  .modal-header { display:flex; align-items:center; justify-content:space-between;
    padding:16px 20px 12px; flex-shrink:0; border-bottom:1px solid rgba(255,107,0,.1); }
  .modal-title { font-family:'Syne',sans-serif; font-weight:800; font-size:1.05rem; color:var(--text1); }
  .modal-sub   { font-size:.78rem; color:var(--muted); margin-top:3px; }
  .modal-close { background:rgba(255,255,255,.08); border:none; border-radius:50%;
    width:32px; height:32px; color:var(--text1); cursor:pointer;
    display:flex; align-items:center; justify-content:center; flex-shrink:0; }
  .modal-body { padding:16px 20px 36px; display:flex; flex-direction:column; gap:10px; }

  /* Badge utilisateur connecté */
  .auth-badge { display:flex; align-items:center; gap:8px;
    padding:8px 20px; background:rgba(52,199,89,.07);
    border-bottom:1px solid rgba(52,199,89,.15); flex-shrink:0; }
  .auth-badge span { font-size:.78rem; color:rgba(255,240,220,.7); }
  .auth-badge strong { color:#34C759; }

  /* ── Modal auth requise ── */
  .auth-modal { max-height:auto; border-radius:24px 24px 0 0; }
  .auth-modal-body { padding:24px 28px 40px; display:flex; flex-direction:column;
    align-items:center; gap:16px; text-align:center; }
  .auth-icon-wrap { width:72px; height:72px; border-radius:50%;
    background:rgba(255,107,0,.1); border:1.5px solid rgba(255,107,0,.3);
    display:flex; align-items:center; justify-content:center;
    box-shadow:0 0 24px rgba(255,107,0,.2); }
  .auth-title { font-family:'Syne',sans-serif; font-weight:800;
    font-size:1.2rem; color:var(--text1); }
  .auth-sub { font-size:.85rem; color:var(--muted); line-height:1.5; max-width:300px; }
  .auth-btn-primary { display:flex; align-items:center; justify-content:center; gap:8px;
    width:100%; padding:15px; border-radius:14px;
    background:linear-gradient(90deg,var(--orange),var(--orange-hot));
    color:#fff; font-family:'Syne',sans-serif; font-weight:700; font-size:.95rem;
    text-decoration:none; box-shadow:0 6px 24px rgba(255,107,0,.4); transition:transform .15s; }
  .auth-btn-primary:hover  { transform:translateY(-1px); }
  .auth-btn-outline { display:flex; align-items:center; justify-content:center;
    width:100%; padding:14px; border-radius:14px;
    background:transparent; border:1.5px solid rgba(255,107,0,.5);
    color:var(--orange); font-family:'Syne',sans-serif; font-weight:600;
    font-size:.9rem; text-decoration:none; transition:all .15s; }
  .auth-btn-outline:hover { background:rgba(255,107,0,.1); }
  .auth-skip { background:none; border:none; color:var(--muted);
    font-size:.8rem; cursor:pointer; text-decoration:underline; margin-top:4px; }

  /* Récap */
  .recap-card { display:flex; gap:12px; align-items:center;
    background:rgba(255,107,0,.07); border:1px solid var(--border);
    border-radius:14px; padding:12px; }
  .recap-img  { width:56px; height:56px; border-radius:10px; object-fit:cover; flex-shrink:0; }
  .recap-info { display:flex; flex-direction:column; gap:4px; }
  .recap-name { font-weight:700; font-size:.9rem; color:var(--text1); }
  .recap-price{ font-family:'Syne',sans-serif; font-weight:800; font-size:.95rem; color:var(--orange); }

  /* Toggles */
  .toggle-row { display:flex; gap:10px; }
  .toggle-opt { flex:1; padding:12px; border-radius:12px; cursor:pointer;
    background:rgba(255,255,255,.04); border:1.5px solid rgba(255,107,0,.2);
    display:flex; flex-direction:column; align-items:flex-start; gap:3px;
    transition:all .15s; text-align:left; }
  .toggle-sel { background:rgba(255,107,0,.1); border-color:var(--orange); }
  .toggle-label { font-family:'Syne',sans-serif; font-weight:700; font-size:.82rem; color:var(--text1); }
  .toggle-sub   { font-size:.72rem; color:var(--muted); }

  .field-label { font-size:.7rem; font-weight:700; letter-spacing:.09em;
    color:var(--muted); text-transform:uppercase; margin-top:4px; }

  .form-input { width:100%; background:rgba(255,255,255,.05);
    border:1.5px solid rgba(255,107,0,.2); border-radius:12px;
    padding:12px 14px; color:var(--text1); font-size:.9rem;
    font-family:'DM Sans',sans-serif; outline:none; transition:border .15s; }
  .form-input:focus { border-color:var(--orange); }
  .form-input option { background:#1A0D00; color:var(--text1); }
  .form-textarea { resize:none; }
  .input-err { border-color:#FF4520 !important; }
  .err-msg   { color:#FF4520; font-size:.75rem; margin-top:-4px; }

  .frais-card { background:rgba(255,107,0,.06); border:1px solid var(--border);
    border-radius:12px; padding:14px; display:flex; flex-direction:column; gap:8px; }
  .frais-row  { display:flex; justify-content:space-between; font-size:.83rem; color:var(--muted); }
  .frais-total{ color:var(--orange); font-weight:800; font-family:'Syne',sans-serif; font-size:.95rem; }
  .frais-divider { height:1px; background:var(--border); }

  .loc-btn { width:100%; padding:11px 16px; border-radius:12px; cursor:pointer;
    background:rgba(255,107,0,.07); border:1.5px solid rgba(255,107,0,.4);
    color:var(--orange); font-size:.83rem; font-weight:600;
    display:flex; align-items:center; justify-content:center; gap:6px; transition:all .15s; }
  .loc-ok  { background:rgba(52,199,89,.08); border-color:rgba(52,199,89,.5); color:#34C759; }
  .loc-btn:disabled { opacity:.6; cursor:not-allowed; }

  .confirm-btn { width:100%; padding:15px; border-radius:14px; cursor:pointer;
    background:linear-gradient(90deg,var(--orange),var(--orange-hot));
    border:none; color:#fff; font-family:'Syne',sans-serif;
    font-weight:700; font-size:.95rem; box-shadow:0 6px 24px rgba(255,107,0,.4);
    transition:transform .15s; display:flex; align-items:center; justify-content:center; gap:8px; }
  .confirm-btn:hover   { transform:translateY(-1px); }
  .confirm-btn:active  { transform:scale(.98); }
  .confirm-btn:disabled{ opacity:.6; cursor:not-allowed; transform:none; }

  .spinner-sm { width:18px; height:18px; border:2.5px solid rgba(255,255,255,.3);
    border-top-color:#fff; border-radius:50%; animation:spin .7s linear infinite; display:inline-block; }

  .qr-step { align-items:center; text-align:center; gap:14px; }
  .qr-hint { font-size:.82rem; color:var(--muted); max-width:280px; }
  .qr-wrap { background:#fff; border-radius:16px; padding:12px;
    box-shadow:0 8px 32px rgba(255,107,0,.2); }
  .qr-img  { width:220px; height:220px; display:block; }
  .cid-card{ display:flex; align-items:center; gap:8px;
    background:rgba(255,107,0,.07); border:1px solid var(--border);
    border-radius:10px; padding:10px 14px; cursor:pointer; width:100%; }
  .cid-label{ font-size:.7rem; color:var(--muted); flex-shrink:0; }
  .cid-value{ flex:1; font-size:.78rem; font-weight:700; color:var(--orange);
    font-family:monospace; word-break:break-all; text-align:left; }
  .gps-tag  { font-size:.75rem; color:#34C759; }

  .toast { position:fixed; bottom:110px; left:50%; transform:translateX(-50%);
    background:rgba(26,13,0,.96); border:1px solid var(--border);
    border-radius:20px; padding:10px 20px; font-size:.82rem;
    color:var(--text1); z-index:300; white-space:nowrap;
    box-shadow:0 4px 24px rgba(0,0,0,.4); animation:fadeIn .2s ease; }

  @media (min-width: 560px) {
    #feed { max-width:400px; margin:0 auto; box-shadow:0 0 80px rgba(255,107,0,.07); }
    .modal-sheet { max-width:460px; margin:0 auto; border-radius:24px; margin-bottom:24px;
      border:1px solid var(--border); }
    .mute-btn { right:calc(50% - 215px); }
    .modal-backdrop { align-items:center; }
  }
`;