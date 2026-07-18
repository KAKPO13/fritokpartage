'use client';
import { useState, useRef, useEffect } from "react";
import { db, auth } from "@/lib/firebaseClient";
import { onAuthStateChanged } from "firebase/auth";
import { collection, doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import SubscriptionGuard from "@/components/SubscriptionGuard";

// ─── Buckets R2 ────────────────────────────────────────────
const BUCKET_VIDEOS = "shop-videos";
const BUCKET_IMAGES = "shop-images";

// ─── UUID v4 ───────────────────────────────────────────────
function uuidv4() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ─── Keywords ──────────────────────────────────────────────
const MAX_KEYWORDS = 10;

const STOPWORDS = new Set([
  "le", "la", "les", "de", "des", "du", "un", "une", "et", "en", "pour",
  "avec", "dans", "sur", "au", "aux", "ce", "ces", "cette", "son", "sa",
  "ses", "est", "sont", "que", "qui", "plus", "tout", "toute", "tous",
  "toutes", "l", "d",
]);

function generateKeywords(title, name, description) {
  const words = `${title} ${name} ${description}`
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));

  return [...new Set(words)].slice(0, MAX_KEYWORDS);
}

// ─── Upload direct vers le worker Cloudflare ───────────────
const WORKER_URL = "https://divine-haze-26a2.fritok013.workers.dev";

async function uploadToR2(file, bucket, userId, contentType, onProgress) {
  const uuid     = uuidv4();
  const ext      = bucket.includes("video") ? ".mp4" : ".jpg";
  const filePath = `${bucket}/${userId}/${uuid}${ext}`;
  const token    = await auth.currentUser.getIdToken();

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${WORKER_URL}?filePath=${encodeURIComponent(filePath)}&contentType=${encodeURIComponent(contentType)}`);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.timeout = 15 * 60 * 1000; // 15 min

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };

    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (data.success) resolve(data.url);
        else reject(new Error(data.error ?? "Upload échoué"));
      } catch {
        reject(new Error(`Worker a répondu ${xhr.status}`));
      }
    };
    xhr.onerror   = () => reject(new Error("Erreur réseau worker"));
    xhr.ontimeout = () => reject(new Error("Délai dépassé"));
    xhr.send(file);
  });
}

// ─── Firestore ─────────────────────────────────────────────
//
// AJOUT — b2bAvailable : n'est écrit QUE si true. Laissé absent du document
// quand la case n'est pas cochée (ou que le vendeur n'est pas fournisseur
// vérifié), plutôt que d'envoyer explicitement `false` — la règle
// video_playlist.create l'accepte dans les deux cas
// (`!('b2bAvailable' in ...) || request.resource.data.b2bAvailable == isB2BVerifiedSupplier(uid)`),
// mais omettre le champ évite tout risque si jamais ce contrôle évoluait
// pour devenir strict sur la présence du champ.
async function saveToFirestore({ userId, title, productName, description, price, videoUrl, imageUrl, thumbUrl, b2bAvailable }) {
  const videoId   = uuidv4();
  const productId = uuidv4();
  const data = {
    videoId, userId,
    title:     title.trim(),
    videoUrl,
    thumbnail: thumbUrl,
    keywords:  generateKeywords(title, productName, description),
    createdAt: serverTimestamp(),
    views: 0, likes: 0, comments: 0,
    product: {
      productId,
      name:        productName.trim(),
      refArticle:  userId,
      description: description.trim(),
      price:       parseFloat(price),
      image:       imageUrl,
    },
  };
  if (b2bAvailable) data.b2bAvailable = true;

  await setDoc(doc(collection(db, "video_playlist"), videoId), data);
  return videoId;
}

// ─────────────────────────────────────────────────────────────
// 🧩 Composants UI — couleurs inline (évite le bug de minification)
// ─────────────────────────────────────────────────────────────

function Toast({ msg, isError, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 3500); return () => clearTimeout(t); }, [onClose]);
  return (
    <div style={{
      position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
      zIndex: 9999, background: isError ? "#E53E00" : "#1A9640",
      color: "#fff", borderRadius: 14, padding: "12px 20px",
      display: "flex", alignItems: "center", gap: 8,
      boxShadow: "0 8px 32px rgba(0,0,0,0.18)", maxWidth: 400, width: "92%",
      fontWeight: 600, fontSize: 14,
    }}>
      <span style={{ fontSize: 18 }}>{isError ? "⚠️" : "✅"}</span>
      <span>{msg}</span>
    </div>
  );
}

function StepBadge({ n, label, done }) {
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: "6px 12px", borderRadius: 20,
      background: done ? "#fff" : "rgba(255,255,255,0.2)",
      border: `1px solid ${done ? "#fff" : "rgba(255,255,255,0.4)"}`,
    }}>
      <div style={{
        width: 18, height: 18, borderRadius: "50%",
        background: done ? "#1A9640" : "rgba(255,255,255,0.3)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 10, fontWeight: 800, color: "#fff",
      }}>{done ? "✓" : n}</div>
      <span style={{ fontSize: 12, fontWeight: 700, color: done ? "#FF6B00" : "#fff" }}>
        {label}
      </span>
    </div>
  );
}

function SectionLabel({ icon, label, sublabel }) {
  const isDone = sublabel?.includes("✓");
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{
        width: 38, height: 38, borderRadius: 11,
        background: isDone ? "#E6F7EC" : "#FFEDD5",
        border: `1px solid ${isDone ? "#1A964050" : "#FF6B0050"}`,
        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
      }}>{icon}</div>
      <div>
        <div style={{ color: "#2D1500", fontSize: 15, fontWeight: 800 }}>{label}</div>
        {sublabel && (
          <div style={{ color: isDone ? "#1A9640" : "#8B5E3C", fontSize: 11, fontWeight: 600 }}>
            {sublabel}
          </div>
        )}
      </div>
    </div>
  );
}

function MediaPickerCard({ icon, label, sublabel, onTap }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onClick={onTap}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: "100%", padding: "36px 0", borderRadius: 20,
        background: hover ? "#FFF9F0" : "#FFFFFF",
        border: `1.5px solid ${hover ? "#FF6B00" : "#FFDDB0"}`,
        boxShadow: hover ? "0 0 20px #FF6B0020" : "0 4px 12px #FF6B0010",
        cursor: "pointer", textAlign: "center", transition: "all 0.2s",
        display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
      }}>
      <div style={{
        width: 60, height: 60, borderRadius: "50%",
        background: "#FFEDD5", border: "1.5px solid #FF6B0066",
        boxShadow: "0 4px 14px #FF6B0025",
        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28,
      }}>{icon}</div>
      <div>
        <div style={{ color: "#2D1500", fontSize: 14, fontWeight: 700 }}>{label}</div>
        <div style={{ color: "#BF9060", fontSize: 12, marginTop: 4 }}>{sublabel}</div>
      </div>
    </div>
  );
}

function CitrusField({ label, hint, icon, value, onChange, maxLines = 1, type = "text", suffix }) {
  const [focused, setFocused] = useState(false);
  const Tag = maxLines > 1 ? "textarea" : "input";
  return (
    <div>
      <div style={{ color: "#8B5E3C", fontSize: 12, fontWeight: 700, letterSpacing: 0.7, marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ position: "relative" }}>
        <span style={{
          position: "absolute", left: 14,
          top: maxLines > 1 ? 16 : "50%",
          transform: maxLines > 1 ? "none" : "translateY(-50%)",
          color: focused ? "#FF6B00" : "#BF9060",
          fontSize: 18, pointerEvents: "none", transition: "color 0.2s",
        }}>{icon}</span>
        <Tag
          value={value}
          onChange={e => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={hint}
          type={type}
          rows={maxLines > 1 ? maxLines : undefined}
          style={{
            width: "100%", boxSizing: "border-box",
            padding: maxLines > 1 ? "16px 16px 16px 44px" : "16px 56px 16px 44px",
            borderRadius: 14, fontSize: 15, color: "#2D1500",
            background: focused ? "#FFEDD5" : "#FFFFFF",
            border: `${focused ? 2 : 1.5}px solid ${focused ? "#FF6B00CC" : "#FFDDB0"}`,
            outline: "none", resize: "none", fontFamily: "inherit", transition: "all 0.2s",
          }}
        />
        {suffix && (
          <span style={{
            position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)",
            color: "#FF6B00", fontWeight: 700, fontSize: 13,
          }}>{suffix}</span>
        )}
      </div>
    </div>
  );
}

// AJOUT — case à cocher "Proposer en B2B", visible uniquement pour un
// fournisseur vérifié (voir b2bSupplierVerified dans AddVideoContent).
// Style volontairement distinct (violet plutôt qu'orange) pour signaler
// visuellement qu'il s'agit d'une option professionnelle, pas grand public.
function B2BToggleCard({ checked, onChange }) {
  return (
    <div
      onClick={() => onChange(!checked)}
      style={{
        display: "flex", alignItems: "center", gap: 12, padding: 16,
        borderRadius: 16, cursor: "pointer",
        background: checked ? "#F0EEFE" : "#FFFFFF",
        border: `1.5px solid ${checked ? "#533AB7" : "#FFDDB0"}`,
        transition: "all 0.15s",
      }}
    >
      <div style={{
        width: 24, height: 24, borderRadius: 8, flexShrink: 0,
        background: checked ? "#533AB7" : "#FFF",
        border: `1.5px solid ${checked ? "#533AB7" : "#BF9060"}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        color: "#fff", fontSize: 14, fontWeight: 800,
      }}>{checked ? "✓" : ""}</div>
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#2D1500" }}>
          🏭 Proposer ce produit en B2B
        </div>
        <div style={{ fontSize: 11.5, color: "#8B5E3C", marginTop: 2, lineHeight: 1.4 }}>
          Visible par les grossistes, supermarchés et hôtels, avec vos tarifs dégressifs vérifiés.
        </div>
      </div>
    </div>
  );
}

function ProgressRow({ label, icon, value }) {
  const done = value >= 1.0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontSize: 16, color: done ? "#1A9640" : "#BF9060" }}>
        {done ? "✅" : icon}
      </span>
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
          <span style={{ color: "#8B5E3C", fontSize: 12, fontWeight: 600 }}>{label}</span>
          <span style={{ color: done ? "#1A9640" : "#FF6B00", fontSize: 12, fontWeight: 700 }}>
            {Math.round(value * 100)}%
          </span>
        </div>
        <div style={{ height: 5, borderRadius: 4, background: "#FFEDC0", overflow: "hidden" }}>
          <div style={{
            height: "100%", borderRadius: 4,
            background: done ? "#1A9640" : "#FF6B00",
            width: `${value * 100}%`, transition: "width 0.3s",
          }} />
        </div>
      </div>
    </div>
  );
}

function PublishButton({ onTap, disabled }) {
  const [pressed, setPressed] = useState(false);
  return (
    <button
      disabled={disabled}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => { setPressed(false); onTap(); }}
      onMouseLeave={() => setPressed(false)}
      onTouchStart={() => setPressed(true)}
      onTouchEnd={(e) => { e.preventDefault(); setPressed(false); onTap(); }}
      style={{
        width: "100%", padding: "18px 0", borderRadius: 20,
        background: disabled ? "#ccc" : "linear-gradient(90deg, #FF6B00, #FF8C00)",
        color: "#fff", fontSize: 17, fontWeight: 900, letterSpacing: 0.3,
        border: "none", cursor: disabled ? "not-allowed" : "pointer",
        boxShadow: disabled ? "none" : "0 8px 24px #FF6B0058",
        display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
        transform: pressed && !disabled ? "scale(0.97)" : "scale(1)",
        transition: "transform 0.1s, background 0.2s",
      }}>
      🚀 Publier
    </button>
  );
}

function SuccessPage({ onHome, onPublishAnother, wasB2B }) {
  return (
    <div style={{ minHeight: "100vh", background: "#FFF8EE", display: "flex", flexDirection: "column" }}>
      <div style={{
        padding: "28px 28px 40px",
        background: "linear-gradient(135deg, #FF6B00, #FF9500, #FFB700)",
        borderRadius: "0 0 36px 36px",
        boxShadow: "0 8px 20px #FF6B0050", textAlign: "center",
      }}>
        <div style={{
          width: 88, height: 88, borderRadius: "50%",
          background: "rgba(255,255,255,0.25)",
          border: "2px solid rgba(255,255,255,0.5)",
          margin: "0 auto 16px",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 48,
        }}>✓</div>
        <div style={{ color: "#fff", fontSize: 26, fontWeight: 900, letterSpacing: -0.8 }}>
          Vidéo publiée !
        </div>
        <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 14, marginTop: 6 }}>
          {wasB2B ? "En ligne pour le grand public et les pros 🏭" : "Ton contenu est en ligne 🚀"}
        </div>
      </div>

      <div style={{ flex: 1 }} />

      <div style={{ padding: "0 28px 36px" }}>
        <div style={{
          background: "#fff", borderRadius: 20, padding: 18,
          border: "1.5px solid #FFDDB0",
          display: "flex", alignItems: "center", gap: 14, marginBottom: 20,
        }}>
          <div style={{
            width: 42, height: 42, borderRadius: "50%", background: "#FFEDD5",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20,
          }}>👁️</div>
          <div>
            <div style={{ color: "#2D1500", fontSize: 14, fontWeight: 700 }}>Tes statistiques</div>
            <div style={{ color: "#8B5E3C", fontSize: 12, marginTop: 2, lineHeight: 1.4 }}>
              Suis tes vues et ventes depuis ton profil.
            </div>
          </div>
        </div>

        <button onClick={onHome} style={{
          width: "100%", padding: "17px 0", borderRadius: 20,
          background: "linear-gradient(90deg, #FF6B00, #FF8C00)",
          color: "#fff", fontSize: 16, fontWeight: 900, border: "none", cursor: "pointer",
          boxShadow: "0 8px 24px #FF6B0055",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
          marginBottom: 10,
        }}>🏠 Retour à l&apos;accueil</button>

        <button onClick={onPublishAnother} style={{
          width: "100%", padding: "16px 0", borderRadius: 20,
          background: "#fff", color: "#8B5E3C", fontSize: 15, fontWeight: 700,
          border: "1.5px solid #FFDDB0", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        }}>➕ Publier une autre vidéo</button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 🚀 Page principale AddVideoPage
// ─────────────────────────────────────────────────────────────
function AddVideoContent() {
  const [page,      setPage]      = useState("form");
  const [user,      setUser]      = useState(null);
  const [authReady, setAuthReady] = useState(false);

  // AJOUT — statut fournisseur B2B du vendeur connecté, lu une fois à
  // l'authentification (users/{uid}.b2bSupplier.status). Ne conditionne
  // que l'AFFICHAGE de la case à cocher : la vraie garantie reste la
  // règle Firestore isB2BVerifiedSupplier() côté serveur, qui revérifie
  // tout au moment de l'écriture — même si ce state était trafiqué côté
  // client, la publication échouerait simplement.
  const [b2bSupplierVerified, setB2bSupplierVerified] = useState(false);
  const [wantB2B, setWantB2B] = useState(false);

  const [videoFile,     setVideoFile]     = useState(null);
  const [videoLocalUrl, setVideoLocalUrl] = useState(null);
  const [imageFile,     setImageFile]     = useState(null);
  const [imagePreview,  setImagePreview]  = useState(null);

  const [title,       setTitle]       = useState("");
  const [productName, setProductName] = useState("");
  const [description, setDescription] = useState("");
  const [price,       setPrice]       = useState("");

  const [loading,       setLoading]       = useState(false);
  const [uploadStep,    setUploadStep]    = useState("");
  const [progressVideo, setProgressVideo] = useState(0);
  const [progressImage, setProgressImage] = useState(0);

  const [toast,     setToast]     = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [publishedAsB2B, setPublishedAsB2B] = useState(false);

  const videoRef   = useRef(null);
  const videoInput = useRef(null);
  const imageInput = useRef(null);

  // ── Auth Firebase ─────────────────────────────────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (u && !u.isAnonymous) {
        setUser(u);
        setAuthReady(true);
        // AJOUT — lecture du statut fournisseur B2B (isOwner(uid), déjà
        // autorisé par les règles existantes sur /users/{uid}).
        try {
          const snap = await getDoc(doc(db, "users", u.uid));
          setB2bSupplierVerified(snap.exists() && snap.data().b2bSupplier?.status === "verified");
        } catch {
          setB2bSupplierVerified(false);
        }
      } else {
        window.location.href = "/connexion?next=/publish";
      }
    });
    return unsub;
  }, []);

  const showToast = (msg, isError = false) => setToast({ msg, isError });
  const closeToast = () => setToast(null);

  const handleVideoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setVideoFile(file);
    setVideoLocalUrl(URL.createObjectURL(file));
    setIsPlaying(false);
  };

  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) { videoRef.current.pause(); setIsPlaying(false); }
    else           { videoRef.current.play();  setIsPlaying(true);  }
  };

  const validate = () => {
    if (!videoFile)             return "Veuillez choisir une vidéo";
    if (!imageFile)             return "Veuillez choisir une image produit";
    if (!title.trim())          return "Le titre est requis";
    if (!productName.trim())    return "Le nom du produit est requis";
    if (!description.trim())    return "La description est requise";
    if (!price.trim())          return "Le prix est requis";
    if (isNaN(parseFloat(price))) return "Prix invalide";
    return null;
  };

  const handlePublish = async () => {
    const err = validate();
    if (err) { showToast(err, true); return; }
    if (!user) { showToast("Non connecté", true); return; }

    setLoading(true);
    setProgressVideo(0);
    setProgressImage(0);

    // AJOUT — double garde côté client : n'envoie b2bAvailable que si la
    // case est cochée ET que le statut vérifié tenait toujours au moment
    // de publier. La règle Firestore revalide de toute façon ce champ
    // contre le vrai statut serveur — ceci évite juste un aller-retour
    // inutile en cas d'incohérence locale.
    const b2bAvailable = wantB2B && b2bSupplierVerified;

    try {
      setUploadStep("Envoi de l'image et de la vidéo...");
      const [imageUrl, videoUrl] = await Promise.all([
        uploadToR2(imageFile, BUCKET_IMAGES, user.uid, "image/jpeg",
          (p) => setProgressImage(p)),
        uploadToR2(videoFile, BUCKET_VIDEOS, user.uid, "video/mp4",
          (p) => setProgressVideo(p)),
      ]);

      setUploadStep("Sauvegarde dans la base de données...");
      await saveToFirestore({
        userId: user.uid, title, productName, description, price,
        videoUrl, imageUrl, thumbUrl: imageUrl, b2bAvailable,
      });

      setPublishedAsB2B(b2bAvailable);
      setPage("success");
    } catch (e) {
      console.error("Publish error:", e);
      showToast("Erreur : " + (e.message ?? "inconnue"), true);
    } finally {
      setLoading(false);
      setUploadStep("");
    }
  };

  const resetForm = () => {
    setVideoFile(null); setVideoLocalUrl(null);
    setImageFile(null); setImagePreview(null);
    setTitle(""); setProductName(""); setDescription(""); setPrice("");
    setProgressVideo(0); setProgressImage(0);
    setWantB2B(false);
  };

  const totalProgress = (progressImage + progressVideo) / 2;
  const infoDone      = title.trim() !== "" && productName.trim() !== "";

  if (page === "success") {
    return (
      <SuccessPage
        wasB2B={publishedAsB2B}
        onHome={() => { resetForm(); setPage("form"); }}
        onPublishAnother={() => { resetForm(); setPage("form"); }}
      />
    );
  }

  if (!authReady) {
    return (
      <div style={{
        minHeight: "100vh", background: "#FFF8EE",
        display: "flex", alignItems: "center", justifyContent: "center",
        flexDirection: "column", gap: 16,
      }}>
        <div style={{
          width: 40, height: 40, borderRadius: "50%",
          border: "3px solid #FF6B00", borderTopColor: "transparent",
          animation: "spin 0.8s linear infinite",
        }} />
        <span style={{ color: "#8B5E3C", fontSize: 14 }}>Connexion...</span>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: "100vh", background: "#FFF8EE",
      fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
    }}>
      {toast && <Toast msg={toast.msg} isError={toast.isError} onClose={closeToast} />}

      {/* ── Header gradient ── */}
      <div style={{
        padding: "16px 22px 28px",
        background: "linear-gradient(135deg, #FF6B00 0%, #FF9500 55%, #FFB700 100%)",
        borderRadius: "0 0 32px 32px",
        boxShadow: "0 8px 20px #FF6B004D",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
          <button
            onClick={() => window.history.back()}
            style={{
              width: 38, height: 38, borderRadius: 12,
              background: "rgba(255,255,255,0.25)",
              border: "1px solid rgba(255,255,255,0.4)",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#fff", fontSize: 18, cursor: "pointer",
            }}>←</button>
          <div>
            <div style={{ color: "#fff", fontSize: 20, fontWeight: 900, letterSpacing: -0.5 }}>
              Publier une vidéo
            </div>
            <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 12 }}>
              Ajoute ton contenu &amp; produit
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <StepBadge n="1" label="Vidéo" done={!!videoFile} />
          <StepBadge n="2" label="Image" done={!!imageFile} />
          <StepBadge n="3" label="Infos" done={infoDone} />
        </div>
      </div>

      {/* ── Body ── */}
      <div style={{ padding: "24px 22px" }}>

        {/* Vidéo */}
        <SectionLabel icon="🎬" label="Vidéo"
          sublabel={videoFile ? "Sélectionnée ✓" : "Requis"} />
        <div style={{ height: 12 }} />

        {videoLocalUrl ? (
          <div style={{ position: "relative", borderRadius: 20, overflow: "hidden" }}>
            <video
              ref={videoRef}
              src={videoLocalUrl}
              style={{ width: "100%", maxHeight: 380, objectFit: "cover", display: "block" }}
              onEnded={() => setIsPlaying(false)}
            />
            <div style={{
              position: "absolute", bottom: 0, left: 0, right: 0, height: 80,
              background: "linear-gradient(to bottom, transparent, rgba(0,0,0,0.65))",
            }} />
            <div onClick={togglePlay} style={{
              position: "absolute", inset: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer",
            }}>
              {!isPlaying && (
                <div style={{
                  width: 60, height: 60, borderRadius: "50%",
                  background: "rgba(0,0,0,0.45)",
                  border: "2px solid #FF6B00B3",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 30, color: "#FF6B00",
                }}>▶</div>
              )}
            </div>
          </div>
        ) : (
          <MediaPickerCard
            icon="🎞️" label="Choisir une vidéo" sublabel="MP4, MOV recommandé"
            onTap={() => videoInput.current?.click()}
          />
        )}
        <input ref={videoInput} type="file" accept="video/*" style={{ display: "none" }}
          onChange={handleVideoChange} />

        {videoFile && (
          <div style={{ marginTop: 10 }}>
            <button onClick={() => videoInput.current?.click()} style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "10px 16px", borderRadius: 12,
              background: "#FFF9F0", border: "1.5px solid #FFDDB0",
              color: "#8B5E3C", fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}>🔄 Changer la vidéo</button>
          </div>
        )}

        <div style={{ height: 28 }} />

        {/* Image */}
        <SectionLabel icon="🖼️" label="Image du produit"
          sublabel={imageFile ? "Sélectionnée ✓" : "Requis"} />
        <div style={{ height: 12 }} />

        {imagePreview ? (
          <div style={{ position: "relative", borderRadius: 16, overflow: "hidden" }}>
            <img src={imagePreview} alt="product"
              style={{ width: "100%", height: 160, objectFit: "cover", display: "block" }} />
            <button onClick={() => imageInput.current?.click()} style={{
              position: "absolute", top: 8, right: 8,
              width: 36, height: 36, borderRadius: "50%",
              background: "rgba(0,0,0,0.55)",
              border: "1.5px solid #FF6B0099",
              color: "#FF6B00", fontSize: 16, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>✏️</button>
          </div>
        ) : (
          <MediaPickerCard
            icon="📷" label="Choisir une image" sublabel="JPG, PNG recommandé"
            onTap={() => imageInput.current?.click()}
          />
        )}
        <input ref={imageInput} type="file" accept="image/*" style={{ display: "none" }}
          onChange={handleImageChange} />

        <div style={{ height: 28 }} />

        {/* Infos produit */}
        <SectionLabel icon="🏪" label="Informations produit" />
        <div style={{ height: 16 }} />

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <CitrusField label="Titre de la vidéo" hint="Ex : Nouvelle collection printemps"
            icon="📝" value={title} onChange={setTitle} />
          <CitrusField label="Nom du produit" hint="Ex : Robe fleurie"
            icon="📦" value={productName} onChange={setProductName} />
          <CitrusField label="Description" hint="Décris ton produit..."
            icon="📋" value={description} onChange={setDescription} maxLines={4} />
          <CitrusField label="Prix" hint="0.00"
            icon="🏷️" value={price} onChange={setPrice} type="number" suffix="XOF" />
        </div>

        {/* AJOUT — option B2B, uniquement visible pour un fournisseur vérifié */}
        {b2bSupplierVerified && (
          <>
            <div style={{ height: 20 }} />
            <B2BToggleCard checked={wantB2B} onChange={setWantB2B} />
          </>
        )}

        <div style={{ height: 32 }} />

        {/* Upload progress ou bouton */}
        {loading ? (
          <div style={{
            background: "#fff", borderRadius: 20, padding: 20,
            border: "1.5px solid #FFDDB0",
            boxShadow: "0 4px 12px #FF6B0010",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <div style={{
                width: 18, height: 18, borderRadius: "50%", flexShrink: 0,
                border: "2px solid #FF6B00", borderTopColor: "transparent",
                animation: "spin 0.8s linear infinite",
              }} />
              <span style={{ color: "#2D1500", fontSize: 14, fontWeight: 700, flex: 1 }}>
                Publication en cours...
              </span>
              <span style={{ color: "#FF6B00", fontSize: 15, fontWeight: 900 }}>
                {Math.round(totalProgress * 100)}%
              </span>
            </div>

            {uploadStep && (
              <div style={{ color: "#BF9060", fontSize: 11, marginBottom: 10, paddingLeft: 28 }}>
                {uploadStep}
              </div>
            )}

            <div style={{ height: 8, borderRadius: 6, background: "#FFEDC0", overflow: "hidden", marginBottom: 16 }}>
              <div style={{
                height: "100%", borderRadius: 6, background: "#FF6B00",
                width: `${totalProgress * 100}%`, transition: "width 0.3s",
              }} />
            </div>

            <div style={{ height: 1, background: "#FFDDB0", marginBottom: 16 }} />

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <ProgressRow label="Image produit" icon="🖼️" value={progressImage} />
              <ProgressRow label="Vidéo"         icon="🎬" value={progressVideo} />
            </div>
          </div>
        ) : (
          <PublishButton onTap={handlePublish} disabled={!authReady} />
        )}

        <div style={{ height: 28 }} />
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        * { box-sizing: border-box; }
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 🔒 Export default — protégé par SubscriptionGuard
// ─────────────────────────────────────────────────────────────
export default function AddVideoPage() {
  return (
    <SubscriptionGuard>
      <AddVideoContent />
    </SubscriptionGuard>
  );
}