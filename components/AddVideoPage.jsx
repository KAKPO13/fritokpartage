import { useState, useRef, useEffect } from "react";

// ─── Design Tokens ─────────────────────────────────────────
const D = {
  bg:         "#FFF8EE",
  bgWarm:     "#FFF3E0",
  surface:    "#FFEDC0",
  card:       "#FFFFFF",
  cardWarm:   "#FFF9F0",
  border:     "#FFDDB0",
  orange:     "#FF6B00",
  orangeHot:  "#FF8C00",
  orangeDim:  "#FFEDD5",
  orangeMid:  "#FFD4A8",
  zest:       "#FFB700",
  zestLight:  "#FFF3C0",
  text1:      "#2D1500",
  text2:      "#8B5E3C",
  text3:      "#BF9060",
  red:        "#E53E00",
  redLight:   "#FFEDE8",
  green:      "#1A9640",
  greenLight: "#E6F7EC",
};

// ─── Toast ──────────────────────────────────────────────────
function Toast({ msg, isError, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3500);
    return () => clearTimeout(t);
  }, []);
  return (
    <div style={{
      position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
      zIndex: 9999, background: isError ? D.red : D.green,
      color: "#fff", borderRadius: 14, padding: "12px 20px",
      display: "flex", alignItems: "center", gap: 8,
      boxShadow: "0 8px 32px rgba(0,0,0,0.18)", maxWidth: 380, width: "90%",
      fontWeight: 600, fontSize: 14,
    }}>
      <span style={{ fontSize: 18 }}>{isError ? "⚠️" : "✅"}</span>
      <span>{msg}</span>
    </div>
  );
}

// ─── StepBadge ──────────────────────────────────────────────
function StepBadge({ n, label, done }) {
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: "6px 12px", borderRadius: 20,
      background: done ? "rgba(255,255,255,1)" : "rgba(255,255,255,0.2)",
      border: `1px solid ${done ? "#fff" : "rgba(255,255,255,0.4)"}`,
    }}>
      <div style={{
        width: 18, height: 18, borderRadius: "50%",
        background: done ? D.green : "rgba(255,255,255,0.3)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 10, fontWeight: 800, color: "#fff",
      }}>
        {done ? "✓" : n}
      </div>
      <span style={{
        fontSize: 12, fontWeight: 700,
        color: done ? D.orange : "#fff",
      }}>{label}</span>
    </div>
  );
}

// ─── SectionLabel ───────────────────────────────────────────
function SectionLabel({ icon, label, sublabel }) {
  const isDone = sublabel?.includes("✓");
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{
        width: 38, height: 38, borderRadius: 11,
        background: isDone ? D.greenLight : D.orangeDim,
        border: `1px solid ${isDone ? D.green + "50" : D.orange + "50"}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 18,
      }}>{icon}</div>
      <div>
        <div style={{ color: D.text1, fontSize: 15, fontWeight: 800 }}>{label}</div>
        {sublabel && (
          <div style={{ color: isDone ? D.green : D.text2, fontSize: 11, fontWeight: 600 }}>
            {sublabel}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── MediaPickerCard ────────────────────────────────────────
function MediaPickerCard({ icon, label, sublabel, onTap }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onClick={onTap}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: "100%", padding: "36px 0", borderRadius: 20,
        background: hover ? D.cardWarm : D.card,
        border: `1.5px solid ${hover ? D.orange : D.border}`,
        boxShadow: hover ? `0 0 20px ${D.orange}20` : `0 4px 12px ${D.orange}10`,
        cursor: "pointer", textAlign: "center",
        transition: "all 0.2s",
        display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
      }}>
      <div style={{
        width: 60, height: 60, borderRadius: "50%",
        background: D.orangeDim, border: `1.5px solid ${D.orange}66`,
        boxShadow: `0 4px 14px ${D.orange}25`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 28,
      }}>{icon}</div>
      <div>
        <div style={{ color: D.text1, fontSize: 14, fontWeight: 700 }}>{label}</div>
        <div style={{ color: D.text3, fontSize: 12, marginTop: 4 }}>{sublabel}</div>
      </div>
    </div>
  );
}

// ─── CitrusField ────────────────────────────────────────────
function CitrusField({ label, hint, icon, value, onChange, maxLines = 1, type = "text", suffix }) {
  const [focused, setFocused] = useState(false);
  const Tag = maxLines > 1 ? "textarea" : "input";
  return (
    <div>
      <div style={{ color: D.text2, fontSize: 12, fontWeight: 700, letterSpacing: 0.7, marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ position: "relative" }}>
        <span style={{
          position: "absolute", left: 14, top: "50%",
          transform: maxLines > 1 ? "none" : "translateY(-50%)",
          top: maxLines > 1 ? 16 : "50%",
          color: focused ? D.orange : D.text3, fontSize: 18, pointerEvents: "none",
          transition: "color 0.2s",
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
            padding: maxLines > 1 ? "16px 16px 16px 44px" : "16px 60px 16px 44px",
            borderRadius: 14, fontSize: 15, color: D.text1,
            background: focused ? D.orangeDim : D.card,
            border: `${focused ? 2 : 1.5}px solid ${focused ? D.orange + "CC" : D.border}`,
            outline: "none", resize: "none",
            fontFamily: "inherit", transition: "all 0.2s",
          }}
        />
        {suffix && (
          <span style={{
            position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)",
            color: D.orange, fontWeight: 700, fontSize: 13,
          }}>{suffix}</span>
        )}
      </div>
    </div>
  );
}

// ─── ProgressRow ────────────────────────────────────────────
function ProgressRow({ label, icon, value }) {
  const done = value >= 1.0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontSize: 16, color: done ? D.green : D.text3 }}>
        {done ? "✅" : icon}
      </span>
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
          <span style={{ color: D.text2, fontSize: 12, fontWeight: 600 }}>{label}</span>
          <span style={{ color: done ? D.green : D.orange, fontSize: 12, fontWeight: 700 }}>
            {Math.round(value * 100)}%
          </span>
        </div>
        <div style={{ height: 5, borderRadius: 4, background: D.surface, overflow: "hidden" }}>
          <div style={{
            height: "100%", borderRadius: 4,
            background: done ? D.green : D.orange,
            width: `${value * 100}%`, transition: "width 0.3s",
          }} />
        </div>
      </div>
    </div>
  );
}

// ─── SuccessPage ────────────────────────────────────────────
function SuccessPage({ onHome, onPublishAnother }) {
  return (
    <div style={{
      minHeight: "100vh", background: D.bg,
      display: "flex", flexDirection: "column",
    }}>
      {/* Orange banner */}
      <div style={{
        padding: "28px 28px 40px",
        background: "linear-gradient(135deg, #FF6B00, #FF9500, #FFB700)",
        borderRadius: "0 0 36px 36px",
        boxShadow: `0 8px 20px ${D.orange}50`,
        textAlign: "center",
      }}>
        <div style={{
          width: 88, height: 88, borderRadius: "50%",
          background: "rgba(255,255,255,0.25)",
          border: "2px solid rgba(255,255,255,0.5)",
          margin: "0 auto 16px",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 48,
        }}>✓</div>
        <div style={{ color: "#fff", fontSize: 26, fontWeight: 900, letterSpacing: -0.8 }}>
          Vidéo publiée !
        </div>
        <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 14, marginTop: 6 }}>
          Ton contenu est en ligne 🚀
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", alignItems: "center" }} />

      <div style={{ padding: "0 28px 36px" }}>
        {/* Info card */}
        <div style={{
          background: D.card, borderRadius: 20, padding: 18,
          border: `1.5px solid ${D.border}`,
          display: "flex", alignItems: "center", gap: 14, marginBottom: 20,
        }}>
          <div style={{
            width: 42, height: 42, borderRadius: "50%",
            background: D.orangeDim,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 20,
          }}>👁️</div>
          <div>
            <div style={{ color: D.text1, fontSize: 14, fontWeight: 700 }}>Tes statistiques</div>
            <div style={{ color: D.text2, fontSize: 12, marginTop: 2, lineHeight: 1.4 }}>
              Suis tes vues et ventes depuis ton profil.
            </div>
          </div>
        </div>

        {/* Home button */}
        <button onClick={onHome} style={{
          width: "100%", padding: "17px 0", borderRadius: 20,
          background: `linear-gradient(90deg, ${D.orange}, ${D.orangeHot})`,
          color: "#fff", fontSize: 16, fontWeight: 900,
          border: "none", cursor: "pointer",
          boxShadow: `0 8px 24px ${D.orange}55`,
          display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
          marginBottom: 10,
        }}>
          <span>🏠</span> Retour à l'accueil
        </button>

        {/* Republish button */}
        <button onClick={onPublishAnother} style={{
          width: "100%", padding: "16px 0", borderRadius: 20,
          background: D.card, color: D.text2, fontSize: 15, fontWeight: 700,
          border: `1.5px solid ${D.border}`, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        }}>
          <span>➕</span> Publier une autre vidéo
        </button>
      </div>
    </div>
  );
}

// ─── Main AddVideoPage ───────────────────────────────────────
export default function AddVideoPage() {
  const [page, setPage] = useState("form"); // "form" | "success"

  const [videoFile, setVideoFile]     = useState(null);
  const [videoUrl, setVideoUrl]       = useState(null);
  const [imageFile, setImageFile]     = useState(null);
  const [imagePreview, setImagePreview] = useState(null);

  const [title, setTitle]             = useState("");
  const [productName, setProductName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice]             = useState("");

  const [loading, setLoading]         = useState(false);
  const [progressVideo, setProgressVideo] = useState(0);
  const [progressImage, setProgressImage] = useState(0);

  const [toast, setToast]             = useState(null);
  const [isPlaying, setIsPlaying]     = useState(false);

  const videoRef   = useRef(null);
  const videoInput = useRef(null);
  const imageInput = useRef(null);

  const showToast = (msg, isError = false) => setToast({ msg, isError });

  const handleVideoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setVideoFile(file);
    const url = URL.createObjectURL(file);
    setVideoUrl(url);
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

  // Simulate upload progress
  const simulateUpload = (setProgress) => {
    return new Promise((resolve) => {
      let p = 0;
      const iv = setInterval(() => {
        p += Math.random() * 0.12;
        if (p >= 1) { p = 1; clearInterval(iv); setProgress(1); resolve(); }
        else setProgress(p);
      }, 180);
    });
  };

  const validate = () => {
    if (!videoFile)          return "Veuillez choisir une vidéo";
    if (!imageFile)          return "Veuillez choisir une image produit";
    if (!title.trim())       return "Le titre est requis";
    if (!productName.trim()) return "Le nom du produit est requis";
    if (!description.trim()) return "La description est requise";
    if (!price.trim())       return "Le prix est requis";
    if (isNaN(parseFloat(price))) return "Prix invalide";
    return null;
  };

  const handlePublish = async () => {
    const err = validate();
    if (err) { showToast(err, true); return; }
    setLoading(true);
    setProgressVideo(0); setProgressImage(0);
    try {
      await Promise.all([
        simulateUpload(setProgressImage),
        simulateUpload(setProgressVideo),
      ]);
      await new Promise(r => setTimeout(r, 400));
      setPage("success");
    } catch {
      showToast("Erreur lors de la publication", true);
    } finally {
      setLoading(false);
    }
  };

  const totalProgress = (progressImage + progressVideo) / 2;
  const infoDone = title.trim() !== "" && productName.trim() !== "";

  if (page === "success") {
    return (
      <SuccessPage
        onHome={() => setPage("form")}
        onPublishAnother={() => {
          setPage("form");
          setVideoFile(null); setVideoUrl(null);
          setImageFile(null); setImagePreview(null);
          setTitle(""); setProductName(""); setDescription(""); setPrice("");
          setProgressVideo(0); setProgressImage(0);
        }}
      />
    );
  }

  return (
    <div style={{
      minHeight: "100vh", background: D.bg,
      fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
    }}>
      {toast && (
        <Toast msg={toast.msg} isError={toast.isError} onClose={() => setToast(null)} />
      )}

      {/* ── Header gradient ── */}
      <div style={{
        padding: "16px 22px 28px",
        background: "linear-gradient(135deg, #FF6B00 0%, #FF9500 55%, #FFB700 100%)",
        borderRadius: "0 0 32px 32px",
        boxShadow: `0 8px 20px ${D.orange}4D`,
      }}>
        {/* Top bar */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
          <button
            onClick={() => window.history.back?.()}
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
              Ajoute ton contenu & produit
            </div>
          </div>
        </div>
        {/* Step badges */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <StepBadge n="1" label="Vidéo"  done={!!videoFile} />
          <StepBadge n="2" label="Image"  done={!!imageFile} />
          <StepBadge n="3" label="Infos"  done={infoDone} />
        </div>
      </div>

      {/* ── Body ── */}
      <div style={{ padding: "24px 22px" }}>

        {/* Video section */}
        <SectionLabel icon="🎬" label="Vidéo"
          sublabel={videoFile ? "Sélectionnée ✓" : "Requis"} />
        <div style={{ height: 12 }} />

        {videoUrl ? (
          <div style={{ position: "relative", borderRadius: 20, overflow: "hidden" }}>
            <video
              ref={videoRef}
              src={videoUrl}
              style={{ width: "100%", maxHeight: 380, objectFit: "cover", display: "block" }}
              onEnded={() => setIsPlaying(false)}
            />
            {/* Gradient overlay */}
            <div style={{
              position: "absolute", bottom: 0, left: 0, right: 0, height: 80,
              background: "linear-gradient(to bottom, transparent, rgba(0,0,0,0.65))",
            }} />
            {/* Play/Pause */}
            <div
              onClick={togglePlay}
              style={{
                position: "absolute", inset: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer",
              }}>
              {!isPlaying && (
                <div style={{
                  width: 60, height: 60, borderRadius: "50%",
                  background: "rgba(0,0,0,0.45)",
                  border: `2px solid ${D.orange}B3`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 30, color: D.orange,
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
        <input ref={videoInput} type="file" accept="video/*" hidden onChange={handleVideoChange} />

        {videoFile && (
          <div style={{ marginTop: 10 }}>
            <button
              onClick={() => videoInput.current?.click()}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "10px 16px", borderRadius: 12,
                background: D.cardWarm, border: `1.5px solid ${D.border}`,
                color: D.text2, fontSize: 13, fontWeight: 600, cursor: "pointer",
              }}>🔄 Changer la vidéo</button>
          </div>
        )}

        <div style={{ height: 28 }} />

        {/* Image section */}
        <SectionLabel icon="🖼️" label="Image du produit"
          sublabel={imageFile ? "Sélectionnée ✓" : "Requis"} />
        <div style={{ height: 12 }} />

        {imagePreview ? (
          <div style={{ position: "relative", borderRadius: 16, overflow: "hidden" }}>
            <img src={imagePreview} alt="product"
              style={{ width: "100%", height: 160, objectFit: "cover", display: "block" }} />
            <button
              onClick={() => imageInput.current?.click()}
              style={{
                position: "absolute", top: 8, right: 8,
                width: 36, height: 36, borderRadius: "50%",
                background: "rgba(0,0,0,0.55)",
                border: `1.5px solid ${D.orange}99`,
                color: D.orange, fontSize: 16, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>✏️</button>
          </div>
        ) : (
          <MediaPickerCard
            icon="📷" label="Choisir une image" sublabel="JPG, PNG recommandé"
            onTap={() => imageInput.current?.click()}
          />
        )}
        <input ref={imageInput} type="file" accept="image/*" hidden onChange={handleImageChange} />

        <div style={{ height: 28 }} />

        {/* Info section */}
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

        <div style={{ height: 32 }} />

        {/* Upload progress OR Publish button */}
        {loading ? (
          <div style={{
            background: D.card, borderRadius: 20, padding: 20,
            border: `1.5px solid ${D.border}`,
            boxShadow: `0 4px 12px ${D.orange}10`,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <div style={{
                width: 18, height: 18, borderRadius: "50%",
                border: `2px solid ${D.orange}`, borderTopColor: "transparent",
                animation: "spin 0.8s linear infinite",
              }} />
              <span style={{ color: D.text1, fontSize: 14, fontWeight: 700, flex: 1 }}>
                Publication en cours...
              </span>
              <span style={{ color: D.orange, fontSize: 15, fontWeight: 900 }}>
                {Math.round(totalProgress * 100)}%
              </span>
            </div>
            <div style={{ height: 8, borderRadius: 6, background: D.surface, overflow: "hidden", marginBottom: 16 }}>
              <div style={{
                height: "100%", borderRadius: 6, background: D.orange,
                width: `${totalProgress * 100}%`, transition: "width 0.3s",
              }} />
            </div>
            <div style={{ height: 1, background: D.border, marginBottom: 16 }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <ProgressRow label="Image produit"    icon="🖼️" value={progressImage} />
              <ProgressRow label="Vidéo"            icon="🎬" value={progressVideo} />
            </div>
          </div>
        ) : (
          <PublishButton onTap={handlePublish} />
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

// ─── PublishButton ──────────────────────────────────────────
function PublishButton({ onTap }) {
  const [pressed, setPressed] = useState(false);
  return (
    <button
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => { setPressed(false); onTap(); }}
      onMouseLeave={() => setPressed(false)}
      onTouchStart={() => setPressed(true)}
      onTouchEnd={() => { setPressed(false); onTap(); }}
      style={{
        width: "100%", padding: "18px 0", borderRadius: 20,
        background: `linear-gradient(90deg, ${D.orange}, ${D.orangeHot})`,
        color: "#fff", fontSize: 17, fontWeight: 900, letterSpacing: 0.3,
        border: "none", cursor: "pointer",
        boxShadow: `0 8px 24px ${D.orange}58`,
        display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
        transform: pressed ? "scale(0.97)" : "scale(1)",
        transition: "transform 0.1s",
      }}>
      🚀 Publier
    </button>
  );
}