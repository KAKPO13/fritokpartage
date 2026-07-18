'use client';

// app/vendeur/devenir-fournisseur-b2b/page.js
//
// Dépose la demande sur /users/{uid}.b2bSupplier — n'écrit QUE ce que
// isValidB2BSupplierClientWrite() autorise dans firestore-rules-b2b-final.js
// (status: 'pending', accountType, filiere, moq déclaré, documents). Les
// paliers tarifaires réels, le MOQ définitif et les conditions de paiement
// sont fixés ensuite par un admin via verify-b2b-supplier.js.
//
// Upload des documents (registre de commerce, NIF) : même mécanisme que
// AjouterColisPage (uploadPhotoR2) — POST direct vers le worker Cloudflare
// R2, token Firebase en bearer, pas de header custom (bloqué en pré-vol
// CORS côté worker).
//
// ⚠️ Bucket dédié `b2b-documents`, DISTINCT de `shop-images` : ce sont des
// pièces d'entreprise (registre de commerce, NIF), pas des photos produit
// destinées à être publiques. Le worker retourne ici aussi une URL publique
// (data.url) — acceptable à court terme (chemin UUID imprévisible) mais à
// terme, ce bucket devrait être verrouillé en lecture (accès admin
// uniquement), pas juste "difficile à deviner".

import { useState, useRef, useEffect } from 'react';
import { doc, updateDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '@/lib/firebaseClient';

// ─── Design tokens — identiques à AjouterColisPage pour cohérence visuelle ──
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

const ACCOUNT_TYPES = [
  { value: 'usine_pia',      label: 'Usine PIA' },
  { value: 'pme_referencee', label: 'PME référencée' },
  { value: 'cooperative',    label: 'Coopérative' },
];
const FILIERES = [
  { value: 'agroalimentaire', label: 'Agroalimentaire' },
  { value: 'cosmetique',      label: 'Cosmétique' },
  { value: 'textile',         label: 'Textile & linge de maison' },
];

function uuidv4() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ─── Upload direct R2 — même pattern que uploadPhotoR2 (AjouterColisPage) ───
const WORKER_URL = "https://divine-haze-26a2.fritok013.workers.dev";
const BUCKET_B2B_DOCS = "b2b-documents";

function extFromFile(file) {
  const byMime = { "application/pdf": ".pdf", "image/png": ".png", "image/jpeg": ".jpg" };
  if (byMime[file.type]) return byMime[file.type];
  const idx = file.name.lastIndexOf(".");
  return idx >= 0 ? file.name.slice(idx) : "";
}

async function uploadDocR2(file, userId, docKey, onProgress) {
  const uuid = uuidv4();
  const ext = extFromFile(file);
  const filePath = `${BUCKET_B2B_DOCS}/${userId}/${docKey}-${uuid}${ext}`;
  const token = await auth.currentUser.getIdToken();

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${WORKER_URL}?filePath=${encodeURIComponent(filePath)}&contentType=${encodeURIComponent(file.type || "application/octet-stream")}`);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    // Pas de header X-User-Id : bloqué en pré-vol CORS côté worker, comme
    // pour AjouterColisPage — ownership dérivé du token Firebase.
    xhr.timeout = 5 * 60 * 1000;

    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
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

// ─── UI minimale, dans le même esprit que AjouterColisPage ──────────────────

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
          <div style={{ color: isDone ? D.green : D.text2, fontSize: 11, fontWeight: 600 }}>{sublabel}</div>
        )}
      </div>
    </div>
  );
}

function CitrusField({ label, hint, icon, value, onChange, type = "text", error }) {
  const [focused, setFocused] = useState(false);
  const borderColor = error ? D.red : focused ? D.orange + "CC" : D.border;
  return (
    <div>
      <div style={{ color: D.text2, fontSize: 12, fontWeight: 700, letterSpacing: 0.7, marginBottom: 6 }}>{label}</div>
      <div style={{ position: "relative" }}>
        <span style={{
          position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)",
          color: focused ? D.orange : "#BF9060", fontSize: 18, pointerEvents: "none",
        }}>{icon}</span>
        <input
          value={value}
          onChange={e => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={hint}
          type={type}
          inputMode={type === "number" ? "numeric" : undefined}
          style={{
            width: "100%", boxSizing: "border-box", padding: "16px 16px 16px 44px",
            borderRadius: 14, fontSize: 15, color: D.text1,
            background: focused ? D.orangeDim : D.card,
            border: `${focused || error ? 2 : 1.5}px solid ${borderColor}`,
            outline: "none", fontFamily: "inherit", transition: "all 0.2s",
          }}
        />
      </div>
      {error && <div style={{ color: D.red, fontSize: 11, fontWeight: 600, marginTop: 5, marginLeft: 2 }}>{error}</div>}
    </div>
  );
}

function CitrusSelect({ label, icon, value, onChange, options, error }) {
  return (
    <div>
      <div style={{ color: D.text2, fontSize: 12, fontWeight: 700, letterSpacing: 0.7, marginBottom: 6 }}>{label}</div>
      <div style={{ position: "relative" }}>
        <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "#BF9060", fontSize: 18 }}>{icon}</span>
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          style={{
            width: "100%", boxSizing: "border-box", padding: "16px 16px 16px 44px",
            borderRadius: 14, fontSize: 15, color: D.text1, background: D.card,
            border: `1.5px solid ${error ? D.red : D.border}`, outline: "none",
            appearance: "none", fontFamily: "inherit",
          }}
        >
          <option value="">Sélectionner…</option>
          {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
      {error && <div style={{ color: D.red, fontSize: 11, fontWeight: 600, marginTop: 5, marginLeft: 2 }}>{error}</div>}
    </div>
  );
}

// Sélecteur de document : mêmes états visuels que la photo colis
// (placeholder → sélectionné → upload en cours), mais fichier PDF/image.
function DocumentPicker({ label, file, uploadedUrl, progress, uploading, onPick, onClear, error }) {
  const inputRef = useRef(null);
  return (
    <div>
      <div style={{ color: D.text2, fontSize: 12, fontWeight: 700, letterSpacing: 0.7, marginBottom: 6 }}>{label}</div>
      <input ref={inputRef} type="file" accept="application/pdf,image/*" style={{ display: "none" }}
        onChange={e => { const f = e.target.files?.[0]; if (f) onPick(f); }} />

      {uploadedUrl ? (
        <div style={{
          display: "flex", alignItems: "center", gap: 10, padding: 14, borderRadius: 14,
          background: "#E6F7EC", border: `1.5px solid ${D.green}50`,
        }}>
          <span style={{ fontSize: 18 }}>✅</span>
          <span style={{ flex: 1, fontSize: 13, color: D.text1, fontWeight: 600 }}>{file?.name || 'Document envoyé'}</span>
          <button onClick={onClear} style={{ border: "none", background: "none", color: D.red, fontSize: 14, cursor: "pointer" }}>✕</button>
        </div>
      ) : uploading ? (
        <div style={{ padding: 14, borderRadius: 14, background: D.card, border: `1.5px solid ${D.border}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 12 }}>
            <span style={{ color: D.text2, fontWeight: 600 }}>Envoi en cours…</span>
            <span style={{ color: D.orange, fontWeight: 700 }}>{Math.round(progress * 100)}%</span>
          </div>
          <div style={{ height: 6, borderRadius: 4, background: "#FFEDC0", overflow: "hidden" }}>
            <div style={{ height: "100%", background: D.orange, width: `${progress * 100}%`, transition: "width 0.2s" }} />
          </div>
        </div>
      ) : (
        <div
          onClick={() => inputRef.current?.click()}
          style={{
            padding: "18px 14px", borderRadius: 14, textAlign: "center", cursor: "pointer",
            background: D.orangeDim, border: `1.5px dashed ${error ? D.red : D.orange + '80'}`,
          }}
        >
          <div style={{ fontSize: 22, marginBottom: 4 }}>📄</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: D.text1 }}>Ajouter le document</div>
          <div style={{ fontSize: 11, color: "#BF9060", marginTop: 2 }}>PDF ou image</div>
        </div>
      )}
      {error && <div style={{ color: D.red, fontSize: 11, fontWeight: 600, marginTop: 5, marginLeft: 2 }}>{error}</div>}
    </div>
  );
}

export default function DevenirFournisseurB2BPage() {
  const [authUser, setAuthUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [existingStatus, setExistingStatus] = useState(null);

  const [accountType, setAccountType] = useState('');
  const [filiere, setFiliere] = useState('');
  const [moq, setMoq] = useState('');

  // Documents : fichier local + progression d'upload + URL R2 obtenue
  const [rcFile, setRcFile] = useState(null);
  const [rcUrl, setRcUrl]   = useState(null);
  const [rcProgress, setRcProgress] = useState(0);
  const [rcUploading, setRcUploading] = useState(false);

  const [nifFile, setNifFile] = useState(null);
  const [nifUrl, setNifUrl]   = useState(null);
  const [nifProgress, setNifProgress] = useState(0);
  const [nifUploading, setNifUploading] = useState(false);

  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async user => {
      setAuthUser(user ?? null);
      setAuthReady(true);
      if (user) {
        const snap = await getDoc(doc(db, 'users', user.uid));
        setExistingStatus(snap.exists() ? (snap.data().b2bSupplier?.status ?? null) : null);
      }
    });
    return unsub;
  }, []);

  const showToast = (msg, isError = false) => setToast({ msg, isError });

  // Upload immédiat à la sélection du fichier (comme le "✏️" de la photo
  // colis, mais ici on n'a qu'un état : en cours -> terminé).
  const handlePickDoc = async (file, kind) => {
    const setFile = kind === 'rc' ? setRcFile : setNifFile;
    const setUploading = kind === 'rc' ? setRcUploading : setNifUploading;
    const setProgress = kind === 'rc' ? setRcProgress : setNifProgress;
    const setUrl = kind === 'rc' ? setRcUrl : setNifUrl;

    setFile(file);
    setUrl(null);
    setUploading(true);
    setProgress(0);
    try {
      const url = await uploadDocR2(file, authUser.uid, kind, setProgress);
      setUrl(url);
    } catch (e) {
      showToast(`Échec de l'envoi (${kind === 'rc' ? 'registre de commerce' : 'NIF'}) : ${e.message}`, true);
      setFile(null);
    } finally {
      setUploading(false);
    }
  };

  const validate = () => {
    const e = {};
    if (!accountType)             e.accountType = 'Choisissez un type de structure';
    if (!filiere)                 e.filiere = 'Choisissez une filière';
    if (!moq || Number(moq) <= 0) e.moq = 'MOQ (quantité minimale) requis';
    if (!rcUrl)                   e.rc = 'Registre de commerce requis';
    if (!nifUrl)                  e.nif = 'NIF requis';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!authUser || !validate()) return;
    setSubmitting(true);
    try {
      // Doit correspondre EXACTEMENT aux clés autorisées par
      // isValidB2BSupplierClientWrite() : status/accountType/filiere/moq/
      // documents/requestedAt — rien d'autre, sinon la règle refuse l'écriture.
      await updateDoc(doc(db, 'users', authUser.uid), {
        b2bSupplier: {
          status: 'pending',
          accountType,
          filiere,
          moq: Number(moq),
          documents: { registreCommerce: rcUrl, nif: nifUrl },
          requestedAt: serverTimestamp(),
        },
      });
      setDone(true);
    } catch (e) {
      showToast(e.message || "Échec de l'envoi de la demande", true);
    } finally {
      setSubmitting(false);
    }
  };

  if (!authReady) {
    return <div style={{ minHeight: "100vh", background: D.bg, display: "flex", alignItems: "center", justifyContent: "center", color: D.text2 }}>Chargement…</div>;
  }
  if (!authUser) {
    return <div style={{ minHeight: "100vh", background: D.bg, padding: 24, color: D.text2 }}>Connectez-vous avec votre compte vendeur pour déposer une demande.</div>;
  }

  if (existingStatus === 'pending' || done) {
    return (
      <div style={{ minHeight: "100vh", background: D.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ textAlign: "center", maxWidth: 340 }}>
          <div style={{ fontSize: 44, marginBottom: 12 }}>⏳</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: D.text1, marginBottom: 6 }}>Demande en cours d&apos;examen</div>
          <div style={{ fontSize: 13, color: D.text2, lineHeight: 1.5 }}>
            Notre équipe examine votre registre de commerce et votre NIF. Vous serez notifié dès la validation.
          </div>
        </div>
      </div>
    );
  }

  if (existingStatus === 'verified') {
    return (
      <div style={{ minHeight: "100vh", background: D.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ textAlign: "center", maxWidth: 340 }}>
          <div style={{ fontSize: 44, marginBottom: 12 }}>✅</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: D.text1 }}>Vous êtes déjà fournisseur B2B vérifié</div>
          <div style={{ fontSize: 13, color: D.text2, marginTop: 8, lineHeight: 1.5 }}>
            Vos prochaines vidéos publiées avec l&apos;option B2B activée afficheront le bouton « Panier pro ».
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: D.bg, fontFamily: "'Inter','Segoe UI',system-ui,sans-serif" }}>
      {toast && <Toast msg={toast.msg} isError={toast.isError} onClose={() => setToast(null)} />}

      <div style={{
        padding: "24px 22px 28px",
        background: `linear-gradient(135deg, ${D.orange} 0%, #FF9500 55%, ${D.zest} 100%)`,
        borderRadius: "0 0 32px 32px", boxShadow: `0 8px 20px ${D.orange}4D`,
      }}>
        <div style={{ color: "#fff", fontSize: 20, fontWeight: 900, letterSpacing: -0.5 }}>Devenir fournisseur B2B</div>
        <div style={{ color: "rgba(255,255,255,0.8)", fontSize: 12.5, marginTop: 6, lineHeight: 1.5 }}>
          Ouvrez vos produits aux grossistes, supermarchés et hôtels — vente en gros avec tarifs dégressifs.
        </div>
      </div>

      <div style={{ padding: "24px 22px", display: "flex", flexDirection: "column", gap: 24 }}>

        {existingStatus === 'rejected' && (
          <div style={{ background: "#FDECEA", border: `1px solid ${D.red}40`, borderRadius: 14, padding: 14, fontSize: 13, color: D.red }}>
            Votre précédente demande a été refusée. Vous pouvez la redéposer avec des documents à jour.
          </div>
        )}

        <div>
          <SectionLabel icon="🏭" label="Votre structure" />
          <div style={{ height: 14 }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <CitrusSelect label="Type de structure" icon="🏢" value={accountType} onChange={setAccountType} options={ACCOUNT_TYPES} error={errors.accountType} />
            <CitrusSelect label="Filière" icon="🗂️" value={filiere} onChange={setFiliere} options={FILIERES} error={errors.filiere} />
            <CitrusField label="MOQ envisagé (quantité minimale de commande)" hint="Ex : 50" icon="📦" type="number"
              value={moq} onChange={v => setMoq(v.replace(/\D/g, ''))} error={errors.moq} />
          </div>
        </div>

        <div>
          <SectionLabel icon="📑" label="Documents" sublabel="Registre de commerce et NIF, pour vérification" />
          <div style={{ height: 14 }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <DocumentPicker
              label="Registre de commerce"
              file={rcFile} uploadedUrl={rcUrl} progress={rcProgress} uploading={rcUploading}
              onPick={f => handlePickDoc(f, 'rc')}
              onClear={() => { setRcFile(null); setRcUrl(null); }}
              error={errors.rc}
            />
            <DocumentPicker
              label="NIF (numéro d'identification fiscale)"
              file={nifFile} uploadedUrl={nifUrl} progress={nifProgress} uploading={nifUploading}
              onPick={f => handlePickDoc(f, 'nif')}
              onClear={() => { setNifFile(null); setNifUrl(null); }}
              error={errors.nif}
            />
          </div>
        </div>

        <button
          onClick={handleSubmit}
          disabled={submitting || rcUploading || nifUploading}
          style={{
            width: "100%", padding: "18px 0", borderRadius: 20,
            background: (submitting || rcUploading || nifUploading) ? "#ccc" : `linear-gradient(90deg, ${D.orange}, ${D.orangeHot})`,
            color: "#fff", fontSize: 16, fontWeight: 900, border: "none",
            cursor: (submitting || rcUploading || nifUploading) ? "not-allowed" : "pointer",
            boxShadow: (submitting || rcUploading || nifUploading) ? "none" : `0 8px 24px ${D.orange}55`,
          }}
        >
          {submitting ? "Envoi…" : "📤 Déposer ma demande"}
        </button>
      </div>

      <style>{`* { box-sizing: border-box; }`}</style>
    </div>
  );
}