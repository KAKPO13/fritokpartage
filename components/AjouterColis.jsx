'use client';
import { useState, useRef, useEffect } from "react";
import { db, auth } from "@/lib/firebaseClient";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";

// ─── Design tokens — identiques à AddVideoPage pour cohérence visuelle ──────
const D = {
  orange:    "#FF6B00",
  orangeHot: "#FF8C00",
  zest:      "#FFB700",
  text1:     "#2D1500",
  text2:     "#8B5E3C",
  card:      "#FFFFFF",
  border:    "#FFDDB0",
  orangeDim: "#FFEDD5",
  bg:        "#FFF8EE",
  green:     "#1A9640",
  red:       "#E53E00",
};

// ─── Limites de validation (miroir des règles Firestore) ────────────────────
// ⚠️ Garder synchronisé avec firestore.rules (isValidFrais / isValidAmount)
const FRAIS_MAX    = 500000;
const TOTAL_MAX    = 9999999;
const MAX_ARTICLES = 50;

// ─── UUID v4 ──────────────────────────────────────────────────────────────
function uuidv4() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function fmtFcfa(v) {
  const s = Math.round(v).toString();
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const fromEnd = s.length - i;
    if (i > 0 && fromEnd % 3 === 0) out += "\u202F";
    out += s[i];
  }
  return `${out} FCFA`;
}

function newArticle() {
  return { id: uuidv4(), nom: "", prix: "" };
}

// ─── Upload direct vers le worker Cloudflare R2 ────────────────────────────
// Même logique que Flutter (_uploadPhotoR2) et que AddVideoPage (uploadToR2)
const WORKER_URL = "https://divine-haze-26a2.fritok013.workers.dev";
const BUCKET_IMAGES = "shop-images";

async function uploadPhotoR2(file, userId, onProgress) {
  const uuid = uuidv4();
  const ext = file.type === "image/png" ? ".png" : ".jpg";
  const filePath = `${BUCKET_IMAGES}/${userId}/${uuid}${ext}`;
  const token = await auth.currentUser.getIdToken();

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${WORKER_URL}?filePath=${encodeURIComponent(filePath)}&contentType=${encodeURIComponent(file.type)}`);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("Content-Type", file.type);
    // ⚠️ Pas de header X-User-Id : le Worker Cloudflare n'autorise pas ce
    // header en pré-vol CORS (Access-Control-Allow-Headers), ce qui bloque
    // la requête avant même son envoi. L'ownership est dérivé du token
    // Firebase côté Worker, comme pour AddVideoPage.
    xhr.timeout = 5 * 60 * 1000;

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
    xhr.onerror = () => reject(new Error("Erreur réseau worker"));
    xhr.ontimeout = () => reject(new Error("Délai dépassé"));
    xhr.send(file);
  });
}

// ─────────────────────────────────────────────────────────────
// 🧩 Composants UI — styles inline (évite le bug de minification/purge)
// ─────────────────────────────────────────────────────────────

function Toast({ msg, isError, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 3500); return () => clearTimeout(t); }, [onClose]);
  return (
    <div style={{
      position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
      zIndex: 9999, background: isError ? D.red : D.green,
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
        background: done ? D.green : "rgba(255,255,255,0.3)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 10, fontWeight: 800, color: "#fff",
      }}>{done ? "✓" : n}</div>
      <span style={{ fontSize: 12, fontWeight: 700, color: done ? D.orange : "#fff" }}>
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
        background: isDone ? "#E6F7EC" : D.orangeDim,
        border: `1px solid ${isDone ? D.green + "50" : D.orange + "50"}`,
        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
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

function MediaPickerCard({ icon, label, sublabel, onTap }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onClick={onTap}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: "100%", padding: "36px 0", borderRadius: 20,
        background: hover ? "#FFF9F0" : D.card,
        border: `1.5px solid ${hover ? D.orange : D.border}`,
        boxShadow: hover ? `0 0 20px ${D.orange}20` : `0 4px 12px ${D.orange}10`,
        cursor: "pointer", textAlign: "center", transition: "all 0.2s",
        display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
      }}>
      <div style={{
        width: 60, height: 60, borderRadius: "50%",
        background: D.orangeDim, border: `1.5px solid ${D.orange}66`,
        boxShadow: `0 4px 14px ${D.orange}25`,
        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28,
      }}>{icon}</div>
      <div>
        <div style={{ color: D.text1, fontSize: 14, fontWeight: 700 }}>{label}</div>
        <div style={{ color: "#BF9060", fontSize: 12, marginTop: 4 }}>{sublabel}</div>
      </div>
    </div>
  );
}

function CitrusField({ label, hint, icon, value, onChange, maxLines = 1, type = "text", suffix, error }) {
  const [focused, setFocused] = useState(false);
  const Tag = maxLines > 1 ? "textarea" : "input";
  const borderColor = error ? D.red : focused ? D.orange + "CC" : D.border;
  return (
    <div>
      <div style={{ color: D.text2, fontSize: 12, fontWeight: 700, letterSpacing: 0.7, marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ position: "relative" }}>
        <span style={{
          position: "absolute", left: 14,
          top: maxLines > 1 ? 16 : "50%",
          transform: maxLines > 1 ? "none" : "translateY(-50%)",
          color: focused ? D.orange : "#BF9060",
          fontSize: 18, pointerEvents: "none", transition: "color 0.2s",
        }}>{icon}</span>
        <Tag
          value={value}
          onChange={e => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={hint}
          type={type}
          inputMode={type === "number" ? "numeric" : undefined}
          rows={maxLines > 1 ? maxLines : undefined}
          style={{
            width: "100%", boxSizing: "border-box",
            padding: maxLines > 1 ? "16px 16px 16px 44px" : "16px 56px 16px 44px",
            borderRadius: 14, fontSize: 15, color: D.text1,
            background: focused ? D.orangeDim : D.card,
            border: `${focused || error ? 2 : 1.5}px solid ${borderColor}`,
            outline: "none", resize: "none", fontFamily: "inherit", transition: "all 0.2s",
          }}
        />
        {suffix && (
          <span style={{
            position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)",
            color: D.orange, fontWeight: 700, fontSize: 13,
          }}>{suffix}</span>
        )}
      </div>
      {error && (
        <div style={{ color: D.red, fontSize: 11, fontWeight: 600, marginTop: 5, marginLeft: 2 }}>
          {error}
        </div>
      )}
    </div>
  );
}

function ProgressRow({ label, icon, value }) {
  const done = value >= 1.0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontSize: 16, color: done ? D.green : "#BF9060" }}>
        {done ? "✅" : icon}
      </span>
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
          <span style={{ color: D.text2, fontSize: 12, fontWeight: 600 }}>{label}</span>
          <span style={{ color: done ? D.green : D.orange, fontSize: 12, fontWeight: 700 }}>
            {Math.round(value * 100)}%
          </span>
        </div>
        <div style={{ height: 5, borderRadius: 4, background: "#FFEDC0", overflow: "hidden" }}>
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

function PublishButton({ onTap, disabled, label = "🚚 Publier le colis" }) {
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
        background: disabled ? "#ccc" : `linear-gradient(90deg, ${D.orange}, ${D.orangeHot})`,
        color: "#fff", fontSize: 17, fontWeight: 900, letterSpacing: 0.3,
        border: "none", cursor: disabled ? "not-allowed" : "pointer",
        boxShadow: disabled ? "none" : `0 8px 24px ${D.orange}58`,
        display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
        transform: pressed && !disabled ? "scale(0.97)" : "scale(1)",
        transition: "transform 0.1s, background 0.2s",
      }}>
      {label}
    </button>
  );
}

function Toggle({ label, icon, options, selected, onChange }) {
  return (
    <div style={{
      background: D.card, borderRadius: 16, padding: 14,
      border: `1.5px solid ${D.border}`,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
        <span style={{ color: "#BF9060" }}>{icon}</span>
        <span style={{ color: D.text2, fontSize: 12, fontWeight: 700 }}>{label}</span>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        {Object.entries(options).map(([key, val]) => {
          const isSelected = selected === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onChange(key)}
              style={{
                flex: 1, padding: "10px 0", borderRadius: 12,
                border: `1.5px solid ${isSelected ? D.orange : D.border}`,
                background: isSelected ? D.orange : D.orangeDim,
                color: isSelected ? "#fff" : D.text2,
                fontSize: 12, fontWeight: 700, cursor: "pointer",
                transition: "all 0.15s",
              }}>
              {val}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SuccessPage({ commandeId, onHome, onPublishAnother }) {
  return (
    <div style={{ minHeight: "100vh", background: D.bg, display: "flex", flexDirection: "column" }}>
      <div style={{
        padding: "28px 28px 40px",
        background: `linear-gradient(135deg, ${D.orange}, #FF9500, ${D.zest})`,
        borderRadius: "0 0 36px 36px",
        boxShadow: `0 8px 20px ${D.orange}50`, textAlign: "center",
      }}>
        <div style={{
          width: 88, height: 88, borderRadius: "50%",
          background: "rgba(255,255,255,0.25)",
          border: "2px solid rgba(255,255,255,0.5)",
          margin: "0 auto 16px",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 48,
        }}>✓</div>
        <div style={{ color: "#fff", fontSize: 26, fontWeight: 900, letterSpacing: -0.8 }}>
          Colis publié !
        </div>
        <div style={{ color: "rgba(255,255,255,0.85)", fontSize: 14, marginTop: 6 }}>
          Visible par tous les livreurs disponibles 🚚
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{
          padding: "8px 16px", borderRadius: 10,
          background: D.orangeDim, border: `1px solid ${D.border}`,
        }}>
          <span style={{ fontFamily: "monospace", fontWeight: 700, color: D.orange, fontSize: 14 }}>
            #{commandeId?.substring(0, 8).toUpperCase()}
          </span>
        </div>
      </div>

      <div style={{ padding: "0 28px 36px" }}>
        <button onClick={onHome} style={{
          width: "100%", padding: "17px 0", borderRadius: 20,
          background: `linear-gradient(90deg, ${D.orange}, ${D.orangeHot})`,
          color: "#fff", fontSize: 16, fontWeight: 900, border: "none", cursor: "pointer",
          boxShadow: `0 8px 24px ${D.orange}55`,
          display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
          marginBottom: 10,
        }}>🏠 Retour à l&apos;accueil</button>

        <button onClick={onPublishAnother} style={{
          width: "100%", padding: "16px 0", borderRadius: 20,
          background: "#fff", color: D.text2, fontSize: 15, fontWeight: 700,
          border: `1.5px solid ${D.border}`, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        }}>➕ Publier un autre colis</button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 🚀 Page principale AjouterColisPage
// ─────────────────────────────────────────────────────────────
function AjouterColisContent() {
  const [page,      setPage]      = useState("form");
  const [user,      setUser]      = useState(null);
  const [authReady, setAuthReady] = useState(false);

  const [nomDestinataire,  setNomDestinataire]  = useState("");
  const [telDestinataire,  setTelDestinataire]  = useState("");
  const [villeDepart,      setVilleDepart]      = useState("");
  const [villeDestination, setVilleDestination] = useState("");
  const [adresseLivraison, setAdresseLivraison] = useState("");
  const [fraisLivraison,   setFraisLivraison]   = useState("");
  const [descriptionColis, setDescriptionColis] = useState("");
  const [modePaiement,     setModePaiement]     = useState("aLaLivraison");
  const [typeLivraison,    setTypeLivraison]    = useState("solo");
  const [articles,         setArticles]         = useState([newArticle()]);

  const [photoFile,    setPhotoFile]    = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);

  const [loading,  setLoading]  = useState(false);
  const [progress, setProgress] = useState(0);
  const [errors,   setErrors]   = useState({});
  const [toast,    setToast]    = useState(null);
  const [lastCommandeId, setLastCommandeId] = useState(null);

  const photoInput = useRef(null);

  // ── Auth ────────────────────────────────────────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthReady(true);
      if (!u) window.location.href = "/connexion?next=/colis/nouveau";
    });
    return unsub;
  }, []);

  const showToast = (msg, isError = false) => setToast({ msg, isError });
  const closeToast = () => setToast(null);

  const handlePhotoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const updateArticle = (id, field, value) => {
    setArticles((prev) => prev.map((a) => (a.id === id ? { ...a, [field]: value } : a)));
  };
  const addArticle = () => {
    if (articles.length >= MAX_ARTICLES) return;
    setArticles((prev) => [...prev, newArticle()]);
  };
  const removeArticle = (id) => {
    setArticles((prev) => (prev.length > 1 ? prev.filter((a) => a.id !== id) : prev));
  };

  const totalArticles = articles.reduce((s, a) => s + (parseFloat(a.prix) || 0), 0);
  const frais = Math.min(Math.max(parseFloat(fraisLivraison) || 0, 0), FRAIS_MAX);
  const total = totalArticles + frais;

  const validate = () => {
    const errs = {};
    if (!nomDestinataire.trim()) errs.nomDestinataire = "Champ requis";
    if (!telDestinataire.trim()) errs.telDestinataire = "Champ requis";
    else if (telDestinataire.trim().length < 8) errs.telDestinataire = "Numéro invalide";
    if (!villeDepart.trim()) errs.villeDepart = "Requis";
    if (!villeDestination.trim()) errs.villeDestination = "Requis";
    if (!adresseLivraison.trim()) errs.adresseLivraison = "Champ requis";

    const fraisVal = parseFloat(fraisLivraison) || 0;
    if (!fraisLivraison.trim()) errs.fraisLivraison = "Champ requis";
    else if (fraisVal <= 0) errs.fraisLivraison = "Montant invalide";
    else if (fraisVal > FRAIS_MAX) errs.fraisLivraison = `Maximum ${fmtFcfa(FRAIS_MAX)}`;

    if (articles.some((a) => !a.nom.trim())) errs.articles = "Veuillez nommer tous vos articles.";

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // ✅ Soumission — mirroir exact de la logique Flutter :
  // clientId = userIdVend = auth.uid, total recalculé et validé
  // localement, frais bornés à FRAIS_MAX, écriture Firestore
  // validée par les règles (isValidFrais / isValidAmount).
  const handlePublish = async () => {
    if (!validate()) { showToast("Merci de corriger les champs en erreur.", true); return; }
    if (total <= 0) { showToast("Le total doit être supérieur à 0.", true); return; }
    if (total >= TOTAL_MAX) { showToast("Le total dépasse la limite autorisée.", true); return; }
    if (!user) { showToast("Non connecté", true); return; }

    setLoading(true);
    setProgress(0);

    try {
      let photoUrl = "";
      if (photoFile) {
        photoUrl = await uploadPhotoR2(photoFile, user.uid, setProgress);
      } else {
        setProgress(1);
      }

      const vendeurSnap = await getDoc(doc(db, "users", user.uid));
      const vd = vendeurSnap.exists() ? vendeurSnap.data() : {};
      const loc = vd.location || {};

      const commandeId = uuidv4().replace(/-/g, "").substring(0, 20);

      const articlesMap = articles
        .filter((a) => a.nom.trim())
        .map((a) => ({
          nom_frifri: a.nom.trim(),
          prix_frifri: parseFloat(a.prix) || 0,
          imageUrl: photoUrl,
          boutiqueId: "",
          ref_article: "",
          userIdVend: user.uid,
        }));

      await setDoc(doc(db, "commandes", commandeId), {
        commandeId,
        clientId: user.uid,
        userIdVend: user.uid,

        telephoneClient: telDestinataire.trim(),
        nomDestinataire: nomDestinataire.trim(),

        villeDepart: villeDepart.trim(),
        villeDestination: villeDestination.trim(),
        adresseLivraison: adresseLivraison.trim(),
        clientLat: 0,
        clientLng: 0,
        latLivraison: null,
        lngLivraison: null,

        vendeurLat: loc.lat ?? 0,
        vendeurLng: loc.lng ?? 0,
        vendeurAdresse: loc.address ?? vd.adresse ?? "",

        photoColis: photoUrl,
        articles: articlesMap,
        refArticles: articlesMap.map(() => ""),
        descriptionColis: descriptionColis.trim(),

        fraisLivraison: frais,
        totalXof: total,
        totalDevise: total,
        devise: "XOF",

        modePaiement,
        typeLivraison,

        statut: "en_attente",
        livreurId: null,
        livreur: null,
        codeVerification: null,

        source: "manuel",
        batchId: null,
        transactionId: null,
        qrCode: null,

        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),

        extraData: {
          fraisLivraison: frais,
          devise: "XOF",
          clientLat: 0,
          clientLng: 0,
          telephoneClient: telDestinataire.trim(),
          userIdVend: user.uid,
          photoColis: photoUrl,
        },
      });

      setLastCommandeId(commandeId);
      setPage("success");
    } catch (e) {
      console.error("Colis publish error:", e);
      showToast("Erreur : " + (e.message ?? "inconnue"), true);
    } finally {
      setLoading(false);
      setProgress(0);
    }
  };

  const resetForm = () => {
    setNomDestinataire(""); setTelDestinataire("");
    setVilleDepart(""); setVilleDestination(""); setAdresseLivraison("");
    setFraisLivraison(""); setDescriptionColis("");
    setModePaiement("aLaLivraison"); setTypeLivraison("solo");
    setArticles([newArticle()]);
    setPhotoFile(null); setPhotoPreview(null);
    setErrors({});
  };

  const destinataireDone = nomDestinataire.trim() !== "" && telDestinataire.trim().length >= 8;
  const articlesDone     = articles.some((a) => a.nom.trim() !== "");
  const tarifDone        = (parseFloat(fraisLivraison) || 0) > 0;

  if (page === "success") {
    return (
      <SuccessPage
        commandeId={lastCommandeId}
        onHome={() => { resetForm(); setPage("form"); window.location.href = "/"; }}
        onPublishAnother={() => { resetForm(); setPage("form"); }}
      />
    );
  }

  if (!authReady) {
    return (
      <div style={{
        minHeight: "100vh", background: D.bg,
        display: "flex", alignItems: "center", justifyContent: "center",
        flexDirection: "column", gap: 16,
      }}>
        <div style={{
          width: 40, height: 40, borderRadius: "50%",
          border: `3px solid ${D.orange}`, borderTopColor: "transparent",
          animation: "spin 0.8s linear infinite",
        }} />
        <span style={{ color: D.text2, fontSize: 14 }}>Connexion...</span>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: "100vh", background: D.bg,
      fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
    }}>
      {toast && <Toast msg={toast.msg} isError={toast.isError} onClose={closeToast} />}

      {/* ── Header gradient ── */}
      <div style={{
        padding: "16px 22px 28px",
        background: `linear-gradient(135deg, ${D.orange} 0%, #FF9500 55%, ${D.zest} 100%)`,
        borderRadius: "0 0 32px 32px",
        boxShadow: `0 8px 20px ${D.orange}4D`,
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
              Nouveau colis
            </div>
            <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 12 }}>
              Envoie ton colis en toute simplicité
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <StepBadge n="1" label="Destinataire" done={destinataireDone} />
          <StepBadge n="2" label="Articles" done={articlesDone} />
          <StepBadge n="3" label="Tarif" done={tarifDone} />
        </div>
      </div>

      {/* ── Body ── */}
      <div style={{ padding: "24px 22px" }}>

        {/* Bannière info */}
        <div style={{
          display: "flex", gap: 10, alignItems: "flex-start",
          background: D.orangeDim, border: `1px solid ${D.orange}30`,
          borderRadius: 16, padding: 14, marginBottom: 24,
        }}>
          <span style={{ fontSize: 16 }}>ℹ️</span>
          <span style={{ color: D.orangeHot, fontSize: 12.5, lineHeight: 1.5 }}>
            Ce colis sera immédiatement visible par tous les livreurs disponibles dans votre zone.
          </span>
        </div>

        {/* Photo */}
        <SectionLabel icon="📷" label="Photo du colis" sublabel={photoFile ? "Ajoutée ✓" : "Optionnel"} />
        <div style={{ height: 12 }} />

        {photoPreview ? (
          <div style={{ position: "relative", borderRadius: 16, overflow: "hidden" }}>
            <img src={photoPreview} alt="Colis" style={{ width: "100%", height: 200, objectFit: "cover", display: "block" }} />
            <button onClick={() => photoInput.current?.click()} style={{
              position: "absolute", top: 8, right: 44,
              width: 36, height: 36, borderRadius: "50%",
              background: "rgba(0,0,0,0.55)", border: `1.5px solid ${D.orange}99`,
              color: D.orange, fontSize: 16, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>✏️</button>
            <button onClick={() => { setPhotoFile(null); setPhotoPreview(null); }} style={{
              position: "absolute", top: 8, right: 8,
              width: 36, height: 36, borderRadius: "50%",
              background: "rgba(0,0,0,0.55)", border: "1.5px solid rgba(255,255,255,0.4)",
              color: "#fff", fontSize: 14, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>✕</button>
          </div>
        ) : (
          <MediaPickerCard
            icon="🖼️" label="Ajouter une photo" sublabel="Aide le livreur à identifier le colis"
            onTap={() => photoInput.current?.click()}
          />
        )}
        <input ref={photoInput} type="file" accept="image/*" style={{ display: "none" }} onChange={handlePhotoChange} />

        <div style={{ height: 28 }} />

        {/* Destinataire */}
        <SectionLabel icon="👤" label="Destinataire" />
        <div style={{ height: 16 }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <CitrusField label="Nom complet du destinataire" hint="Ex : Aïcha Koné" icon="🪪"
            value={nomDestinataire} onChange={setNomDestinataire} error={errors.nomDestinataire} />
          <CitrusField label="Téléphone du destinataire" hint="Ex : 0700000000" icon="📞" type="tel"
            value={telDestinataire} onChange={(v) => setTelDestinataire(v.replace(/\D/g, ""))} error={errors.telDestinataire} />
        </div>

        <div style={{ height: 28 }} />

        {/* Itinéraire */}
        <SectionLabel icon="🧭" label="Itinéraire" />
        <div style={{ height: 16 }} />
        <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <CitrusField label="Ville de départ" hint="Ex : Abidjan" icon="📍"
              value={villeDepart} onChange={setVilleDepart} error={errors.villeDepart} />
          </div>
          <div style={{ flex: 1 }}>
            <CitrusField label="Destination" hint="Ex : Bouaké" icon="📍"
              value={villeDestination} onChange={setVilleDestination} error={errors.villeDestination} />
          </div>
        </div>
        <CitrusField label="Adresse précise de livraison" hint="Quartier, rue, point de repère…" icon="📌"
          value={adresseLivraison} onChange={setAdresseLivraison} error={errors.adresseLivraison} />

        <div style={{ height: 28 }} />

        {/* Articles */}
        <SectionLabel icon="📦" label="Articles / Contenu" sublabel="Décrivez le contenu pour le livreur" />
        <div style={{ height: 14 }} />

        <div style={{
          background: D.card, borderRadius: 16, border: `1.5px solid ${D.border}`, overflow: "hidden",
        }}>
          {articles.map((a, i) => (
            <div key={a.id} style={{
              display: "flex", alignItems: "center", gap: 10, padding: 14,
              borderBottom: i < articles.length - 1 ? `1px solid ${D.orangeDim}` : "none",
            }}>
              <div style={{
                width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
                background: D.orangeDim, display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 700, color: D.orange, fontFamily: "monospace",
              }}>{i + 1}</div>
              <input
                type="text" placeholder="Nom de l'article"
                value={a.nom} onChange={(e) => updateArticle(a.id, "nom", e.target.value)}
                style={{ flex: 3, minWidth: 0, border: "none", outline: "none", background: "transparent", fontSize: 14, color: D.text1 }}
              />
              <input
                type="text" inputMode="numeric" placeholder="0 F"
                value={a.prix} onChange={(e) => updateArticle(a.id, "prix", e.target.value.replace(/\D/g, ""))}
                style={{ width: 90, flexShrink: 0, border: "none", outline: "none", background: "transparent",
                  textAlign: "right", fontFamily: "monospace", fontSize: 14, fontWeight: 700, color: D.orange }}
              />
              {articles.length > 1 && (
                <button onClick={() => removeArticle(a.id)} style={{
                  border: "none", background: "none", color: D.red, fontSize: 16, cursor: "pointer", flexShrink: 0,
                }}>⊖</button>
              )}
            </div>
          ))}
          {articles.length < MAX_ARTICLES && (
            <button onClick={addArticle} style={{
              width: "100%", padding: "12px 0", border: "none", cursor: "pointer",
              background: D.orangeDim, borderTop: `1px solid ${D.border}`,
              color: D.orange, fontSize: 13, fontWeight: 700,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            }}>＋ Ajouter un article</button>
          )}
        </div>
        {errors.articles && (
          <div style={{ color: D.red, fontSize: 11, fontWeight: 600, marginTop: 8 }}>{errors.articles}</div>
        )}

        <div style={{ height: 16 }} />
        <CitrusField label="Description générale (optionnel)" hint="Ex : Fragile, tenir à l'abri de la chaleur…" icon="📝"
          value={descriptionColis} onChange={setDescriptionColis} maxLines={3} />

        <div style={{ height: 28 }} />

        {/* Tarification */}
        <SectionLabel icon="💳" label="Tarification" />
        <div style={{ height: 16 }} />
        <CitrusField label="Frais de livraison (FCFA)" hint="Ex : 2000" icon="🚚" type="number" suffix="FCFA"
          value={fraisLivraison} onChange={(v) => setFraisLivraison(v.replace(/\D/g, ""))} error={errors.fraisLivraison} />

        <div style={{ height: 14 }} />
        <div style={{
          background: D.card, borderRadius: 16, padding: 18, border: `1.5px solid ${D.border}`,
        }}>
          <SummaryLine label="Valeur articles" value={totalArticles} />
          <div style={{ height: 8 }} />
          <SummaryLine label="Frais de livraison" value={frais} />
          <div style={{ height: 1, background: D.orangeDim, margin: "12px 0" }} />
          <SummaryLine label="Total commande" value={total} bold />
        </div>

        <div style={{ height: 28 }} />

        {/* Options */}
        <SectionLabel icon="⚙️" label="Options" />
        <div style={{ height: 16 }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Toggle label="Mode de paiement" icon="💳"
            options={{ aLaLivraison: "À la livraison", mobile: "Mobile Money" }}
            selected={modePaiement} onChange={setModePaiement} />
          <Toggle label="Type de livraison" icon="🚚"
            options={{ solo: "Solo (1 livreur)", batch: "Tournée groupée" }}
            selected={typeLivraison} onChange={setTypeLivraison} />
        </div>

        <div style={{ height: 32 }} />

        {/* Upload progress ou bouton */}
        {loading ? (
          <div style={{
            background: D.card, borderRadius: 20, padding: 20,
            border: `1.5px solid ${D.border}`, boxShadow: `0 4px 12px ${D.orange}10`,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <div style={{
                width: 18, height: 18, borderRadius: "50%", flexShrink: 0,
                border: `2px solid ${D.orange}`, borderTopColor: "transparent",
                animation: "spin 0.8s linear infinite",
              }} />
              <span style={{ color: D.text1, fontSize: 14, fontWeight: 700, flex: 1 }}>
                Publication en cours...
              </span>
              <span style={{ color: D.orange, fontSize: 15, fontWeight: 900 }}>
                {Math.round(progress * 100)}%
              </span>
            </div>
            <div style={{ height: 8, borderRadius: 6, background: "#FFEDC0", overflow: "hidden", marginBottom: 16 }}>
              <div style={{ height: "100%", borderRadius: 6, background: D.orange, width: `${progress * 100}%`, transition: "width 0.3s" }} />
            </div>
            {photoFile && (
              <>
                <div style={{ height: 1, background: D.border, marginBottom: 16 }} />
                <ProgressRow label="Photo colis" icon="🖼️" value={progress} />
              </>
            )}
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

function SummaryLine({ label, value, bold = false }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ color: D.text2, fontSize: 13, fontWeight: bold ? 700 : 400 }}>{label}</span>
      <span style={{
        fontFamily: "monospace", color: bold ? D.orange : D.text1,
        fontSize: bold ? 15 : 13, fontWeight: bold ? 800 : 600,
      }}>{fmtFcfa(value)}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Export default
// ─────────────────────────────────────────────────────────────
export default function AjouterColisPage() {
  return <AjouterColisContent />;
}