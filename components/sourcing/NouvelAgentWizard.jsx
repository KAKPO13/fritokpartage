// components/sourcing/NouvelAgentWizard.jsx
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../../lib/firebaseClient';

/*
  Page "Devenir agent sourcing FriTok" — assistant en 9 niveaux + récapitulatif,
  qui alimente PROGRESSIVEMENT agent_applications/{uid} (autosave à chaque
  "Suivant"), jusqu'à soumission finale via
  netlify/functions/submit-agent-application.js.

  Ce formulaire n'écrit JAMAIS directement dans agent_local_fritok : c'est un
  dossier à valider par un admin, qui complète ensuite les champs commerciaux
  (commissionPercent, feePerItem, feePerOrder, minOrder, maxOrder,
  shippingToClient, processingDays, shippingDays) — ces montants ne doivent
  pas être auto-déclarés par le candidat.

  Téléphone/email : on ne redemande PAS de vérification OTP ici — on reprend
  simplement authUser.phoneNumber / authUser.emailVerified du compte FriTok
  existant (le candidat est déjà un compte "vendeur" avant de devenir agent).

  UPLOAD DE FICHIERS : même mécanisme que DevenirFournisseurB2BPage
  (uploadDocR2) — POST direct vers le worker Cloudflare R2, token Firebase en
  bearer, PAS de header custom (bloqué en pré-vol CORS côté worker). Bucket
  DÉDIÉ `agent-documents`, distinct de `b2b-documents` (pièces d'entreprise)
  et `shop-images` (photos produit publiques) : ce sont des pièces d'identité
  et documents KYC, à verrouiller en lecture admin-only côté worker/bucket.
*/

// ─── Upload direct R2 — même pattern que uploadDocR2 (DevenirFournisseurB2BPage) ───
const WORKER_URL = "https://divine-haze-26a2.fritok013.workers.dev";
const BUCKET_AGENT_DOCS = "agent-documents";

function uuidv4() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function extFromFile(file) {
  const byMime = { "application/pdf": ".pdf", "image/png": ".png", "image/jpeg": ".jpg" };
  if (byMime[file.type]) return byMime[file.type];
  const idx = file.name.lastIndexOf(".");
  return idx >= 0 ? file.name.slice(idx) : "";
}

function uploadAgentDocR2(file, userId, docKey, onProgress) {
  const uuid = uuidv4();
  const ext = extFromFile(file);
  const filePath = `${BUCKET_AGENT_DOCS}/${userId}/${docKey}-${uuid}${ext}`;

  return new Promise(async (resolve, reject) => {
    let token;
    try {
      token = await auth.currentUser.getIdToken();
    } catch (e) {
      reject(new Error("Session expirée, reconnectez-vous"));
      return;
    }

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${WORKER_URL}?filePath=${encodeURIComponent(filePath)}&contentType=${encodeURIComponent(file.type || "application/octet-stream")}`);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    // Pas de header custom (X-User-Id etc.) : bloqué en pré-vol CORS côté
    // worker, comme pour AjouterColisPage/DevenirFournisseurB2BPage —
    // ownership dérivé du token Firebase côté worker.
    xhr.timeout = 5 * 60 * 1000;

    xhr.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total); };
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

const PAYS_SOURCING = ['Chine', "Côte d'Ivoire", 'Ghana', 'Nigeria', 'Togo', 'Bénin', 'Burkina Faso', 'Sénégal', 'Émirats arabes unis', 'Turquie'];
const LANGUES_DISPO = ['Français', 'Anglais', 'Mandarin', 'Arabe', 'Wolof', 'Ewe', 'Haoussa'];
const SOURCES_DISPO = ['AliExpress', 'Alibaba', 'Jumia', '1688', 'Marché local', 'Fournisseur direct usine'];
const DOMAINES_DISPO = ['Mode', 'Électronique', 'Automobile', 'Beauté', 'Maison & déco', 'Jouets', 'Alimentaire'];
const EXPEDITION_DISPO = ['Courrier', 'Cargo', 'Fret aérien', 'Fret maritime'];
const PAYMENT_METHODS_DISPO = ['Wallet FriTok', 'Mobile Money', 'WeChat Pay', 'Alipay', 'Virement bancaire', 'PayPal'];

const STEPS = [
  { id: 1, label: 'Identité' },
  { id: 2, label: 'Adresse' },
  { id: 3, label: 'Professionnel' },
  { id: 4, label: 'Bancaire' },
  { id: 5, label: 'Confiance' },
  { id: 6, label: 'Casier judiciaire' },
  { id: 7, label: 'Contrat' },
  { id: 8, label: 'Formation' },
  { id: 9, label: 'Garantie' },
  { id: 10, label: 'Récapitulatif' },
];

const formVide = {
  identite: {
    typePiece: 'cni', pieceIdentiteUrl: '', selfieUrl: '',
    nomComplet: '', dateNaissance: '', nationalite: '',
    adresseResidence: '', photoProfilUrl: '',
  },
  adresse: { typeJustificatif: 'facture_electricite', justificatifUrl: '', demandeVisiteGps: false },
  professionnel: {
    statut: 'independant',
    registreCommerceUrl: '', ifuNif: '', attestationFiscaleUrl: '', logoUrl: '', adresseSiege: '',
    cvUrl: '', experience: '',
    langues: [], paysSourcing: [], villesConnues: '', domainesExpertise: [],
    fournisseursPartenaires: '', sourcesHandled: [], delaiMoyenReponse: '',
    capaciteExpedition: [], paymentMethods: [],
  },
  bancaire: { nomTitulaire: '', mobileMoney: '', compteBancaire: '', iban: '', nomBanque: '' },
  confiance: {
    mode: 'references',
    references: [{ nom: '', telephone: '', relation: '' }, { nom: '', telephone: '', relation: '' }],
    lettreRecommandationUrl: '',
  },
  casierJudiciaire: { url: '', fourni: false },
  contrat: {
    cguAcceptees: false, confidentialiteAcceptee: false, anticorruptionAcceptee: false,
    interdictionArgentDirectAcceptee: false, reglesQualiteAcceptees: false, sanctionsAcceptees: false,
    signatureNom: '',
  },
  formation: { quizReponses: {}, quizScore: null, quizValide: false },
  garantie: { montantChoisi: 25000, statutPaiement: 'non_paye' },
  statut: 'brouillon',
};

/* ─────────────────────────── UI helpers ─────────────────────────── */

const label = { color: '#ffffffb0', fontSize: 12, fontWeight: 700, letterSpacing: '.03em', margin: '14px 0 6px' };
const input = {
  width: '100%', padding: '11px 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,.14)',
  background: 'rgba(255,255,255,.05)', color: '#fff', fontSize: 14, boxSizing: 'border-box',
};
const btnPrimary = {
  padding: '13px 22px', borderRadius: 12, border: 'none', background: '#ff4d00',
  color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer',
};
const btnGhost = {
  padding: '13px 22px', borderRadius: 12, border: '1px solid rgba(255,255,255,.2)', background: 'transparent',
  color: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer',
};

function ChipToggle({ options, selected, onToggle }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
      {options.map(opt => {
        const actif = selected.includes(opt);
        return (
          <button key={opt} type="button" onClick={() => onToggle(opt)} style={{
            padding: '7px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
            border: `1px solid ${actif ? '#ff4d00' : 'rgba(255,255,255,.18)'}`,
            background: actif ? 'rgba(255,77,0,.15)' : 'transparent',
            color: actif ? '#ff8a50' : '#ffffffb0',
          }}>
            {opt}
          </button>
        );
      })}
    </div>
  );
}

// Sélecteur de document — même esprit visuel que DocumentPicker de
// DevenirFournisseurB2BPage (placeholder → upload en cours avec barre de
// progression → terminé), adapté au thème sombre de cette page.
function FileUploadField({ label: lbl, docKey, authUser, value, onChange, obligatoire, accept = 'image/*,.pdf' }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [erreur, setErreur] = useState(null);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { setErreur('Fichier trop lourd (max 10 Mo)'); return; }
    setUploading(true); setProgress(0); setErreur(null);
    try {
      const url = await uploadAgentDocR2(file, authUser.uid, docKey, setProgress);
      onChange(url);
    } catch (err) {
      setErreur("Échec de l'envoi : " + err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <p style={label}>{lbl}{obligatoire && ' *'}</p>
      <input ref={inputRef} type="file" accept={accept} style={{ display: 'none' }} onChange={handleFile} disabled={uploading} />

      {value ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <a href={value} target="_blank" rel="noreferrer" style={{ color: '#34C759', fontSize: 13 }}>✓ Fichier envoyé — voir</a>
          <button type="button" onClick={() => onChange('')} style={{ background: 'none', border: 'none', color: '#EF4444', fontSize: 12, cursor: 'pointer' }}>
            Retirer
          </button>
        </div>
      ) : uploading ? (
        <div style={{ padding: 10, borderRadius: 10, background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.1)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12 }}>
            <span style={{ color: '#ffffff90' }}>Envoi en cours…</span>
            <span style={{ color: '#ff8a50', fontWeight: 700 }}>{Math.round(progress * 100)}%</span>
          </div>
          <div style={{ height: 5, borderRadius: 3, background: 'rgba(255,255,255,.1)', overflow: 'hidden' }}>
            <div style={{ height: '100%', background: '#ff4d00', width: `${progress * 100}%`, transition: 'width .2s' }} />
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => inputRef.current?.click()} style={{ ...btnGhost, display: 'inline-block' }}>
          📎 Choisir un fichier
        </button>
      )}
      {erreur && <p style={{ color: '#FCA5A5', fontSize: 12, marginTop: 4 }}>{erreur}</p>}
    </div>
  );
}

// Capture "selfie live" — instantané webcam en direct (empêche d'uploader une
// photo depuis la galerie), envoyé au worker R2 exactement comme un fichier
// choisi. Ce n'est PAS une vraie détection de liveness anti-usurpation
// (clignement, mouvement 3D) : pour ça il faudrait un SDK dédié (ex: AWS
// Rekognition Liveness, FaceTec). À prévoir en V2 si la fraude à la pièce
// d'identité devient un problème observé.
function SelfieCaptureField({ authUser, value, onChange }) {
  const videoRef = useRef(null);
  const [streaming, setStreaming] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [erreur, setErreur] = useState(null);

  const demarrer = async () => {
    setErreur(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setStreaming(true);
    } catch (e) {
      setErreur('Accès caméra refusé : ' + e.message);
    }
  };

  const capturer = () => {
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    video.srcObject?.getTracks().forEach(t => t.stop());
    setStreaming(false);
    setUploading(true);
    setProgress(0);
    canvas.toBlob(async (blob) => {
      try {
        // Le worker attend un File/Blob avec .type — un Blob JPEG suffit,
        // uploadAgentDocR2 ne s'appuie que sur file.type et file.size.
        const url = await uploadAgentDocR2(blob, authUser.uid, 'selfie', setProgress);
        onChange(url);
      } catch (e) {
        setErreur("Échec de l'envoi : " + e.message);
      } finally {
        setUploading(false);
      }
    }, 'image/jpeg', 0.9);
  };

  return (
    <div>
      <p style={label}>Selfie en direct (liveness) *</p>
      {value ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src={value} alt="Selfie" style={{ width: 56, height: 56, borderRadius: 10, objectFit: 'cover' }} />
          <button type="button" onClick={() => onChange('')} style={{ background: 'none', border: 'none', color: '#EF4444', fontSize: 12, cursor: 'pointer' }}>
            Reprendre
          </button>
        </div>
      ) : streaming ? (
        <div>
          <video ref={videoRef} muted playsInline style={{ width: '100%', maxWidth: 280, borderRadius: 12, transform: 'scaleX(-1)' }} />
          <div style={{ marginTop: 8 }}>
            <button type="button" onClick={capturer} style={btnPrimary}>📸 Capturer</button>
          </div>
        </div>
      ) : uploading ? (
        <div style={{ padding: 10, borderRadius: 10, background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.1)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12 }}>
            <span style={{ color: '#ffffff90' }}>Envoi en cours…</span>
            <span style={{ color: '#ff8a50', fontWeight: 700 }}>{Math.round(progress * 100)}%</span>
          </div>
          <div style={{ height: 5, borderRadius: 3, background: 'rgba(255,255,255,.1)', overflow: 'hidden' }}>
            <div style={{ height: '100%', background: '#ff4d00', width: `${progress * 100}%`, transition: 'width .2s' }} />
          </div>
        </div>
      ) : (
        <button type="button" onClick={demarrer} style={btnGhost}>🎥 Activer la caméra</button>
      )}
      {erreur && <p style={{ color: '#FCA5A5', fontSize: 12, marginTop: 4 }}>{erreur}</p>}
    </div>
  );
}

/* ─────────────────────────── Étapes ─────────────────────────── */

function EtapeIdentite({ v, set, authUser }) {
  const i = v.identite;
  const upd = (patch) => set('identite', { ...i, ...patch });
  return (
    <>
      <p style={label}>Type de pièce</p>
      <select style={input} value={i.typePiece} onChange={e => upd({ typePiece: e.target.value })}>
        <option value="cni">Carte nationale d'identité</option>
        <option value="passeport">Passeport</option>
        <option value="sejour">Carte de séjour</option>
      </select>

      <div style={{ marginTop: 14 }}>
        <FileUploadField label="Photo de la pièce d'identité" obligatoire docKey="piece_identite" authUser={authUser} value={i.pieceIdentiteUrl} onChange={url => upd({ pieceIdentiteUrl: url })} />
      </div>
      <div style={{ marginTop: 14 }}>
        <SelfieCaptureField authUser={authUser} value={i.selfieUrl} onChange={url => upd({ selfieUrl: url })} />
      </div>

      <p style={label}>Nom complet *</p>
      <input style={input} value={i.nomComplet} onChange={e => upd({ nomComplet: e.target.value })} placeholder="Prénom NOM" />

      <p style={label}>Date de naissance *</p>
      <input type="date" style={input} value={i.dateNaissance} onChange={e => upd({ dateNaissance: e.target.value })} />

      <p style={label}>Nationalité *</p>
      <input style={input} value={i.nationalite} onChange={e => upd({ nationalite: e.target.value })} placeholder="Ex: Togolaise" />

      <p style={label}>Téléphone (compte FriTok)</p>
      <input style={{ ...input, opacity: .7 }} value={authUser.phoneNumber || 'Non renseigné sur votre compte'} disabled />
      {!authUser.phoneNumber && <p style={{ color: '#F59E0B', fontSize: 12, marginTop: 4 }}>Ajoutez un numéro vérifié dans les paramètres de votre compte avant de continuer.</p>}

      <p style={label}>Email (compte FriTok)</p>
      <input style={{ ...input, opacity: .7 }} value={authUser.email || ''} disabled />
      {!authUser.emailVerified && <p style={{ color: '#F59E0B', fontSize: 12, marginTop: 4 }}>Votre email n'est pas encore vérifié — vérifiez-le dans les paramètres du compte.</p>}

      <p style={label}>Adresse de résidence complète *</p>
      <textarea style={{ ...input, resize: 'vertical' }} rows={2} value={i.adresseResidence} onChange={e => upd({ adresseResidence: e.target.value })} />

      <div style={{ marginTop: 14 }}>
        <FileUploadField label="Photo de profil" obligatoire docKey="photo_profil" authUser={authUser} value={i.photoProfilUrl} onChange={url => upd({ photoProfilUrl: url })} />
      </div>
    </>
  );
}

function EtapeAdresse({ v, set, authUser }) {
  const a = v.adresse;
  const upd = (patch) => set('adresse', { ...a, ...patch });
  return (
    <>
      <p style={label}>Document justificatif (moins de 3 mois)</p>
      <select style={input} value={a.typeJustificatif} onChange={e => upd({ typeJustificatif: e.target.value })}>
        <option value="facture_electricite">Facture d'électricité</option>
        <option value="facture_eau">Facture d'eau</option>
        <option value="facture_internet">Facture Internet</option>
        <option value="attestation_residence">Attestation de résidence</option>
        <option value="releve_bancaire">Relevé bancaire (avec adresse)</option>
      </select>
      <div style={{ marginTop: 14 }}>
        <FileUploadField label="Justificatif de domicile" docKey="justificatif_domicile" authUser={authUser} value={a.justificatifUrl} onChange={url => upd({ justificatifUrl: url })} />
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16, fontSize: 13, color: '#ffffffc0', cursor: 'pointer' }}>
        <input type="checkbox" checked={a.demandeVisiteGps} onChange={e => upd({ demandeVisiteGps: e.target.checked })} />
        Je préfère une vérification par visite GPS d'un superviseur FriTok
      </label>

      {!a.justificatifUrl && !a.demandeVisiteGps && (
        <p style={{ color: '#F59E0B', fontSize: 12, marginTop: 8 }}>Fournissez un justificatif OU cochez la visite GPS pour continuer.</p>
      )}
    </>
  );
}

function EtapeProfessionnel({ v, set, authUser }) {
  const p = v.professionnel;
  const upd = (patch) => set('professionnel', { ...p, ...patch });
  const toggleDans = (champ, val) => {
    const arr = p[champ];
    upd({ [champ]: arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val] });
  };

  return (
    <>
      <p style={label}>Statut</p>
      <div style={{ display: 'flex', gap: 8 }}>
        {['independant', 'entreprise'].map(s => (
          <button key={s} type="button" onClick={() => upd({ statut: s })} style={{
            flex: 1, padding: '11px 0', borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: 'pointer',
            border: `1px solid ${p.statut === s ? '#ff4d00' : 'rgba(255,255,255,.15)'}`,
            background: p.statut === s ? 'rgba(255,77,0,.15)' : 'transparent', color: '#fff',
          }}>
            {s === 'independant' ? 'Indépendant' : 'Entreprise'}
          </button>
        ))}
      </div>

      {p.statut === 'entreprise' ? (
        <>
          <div style={{ marginTop: 14 }}>
            <FileUploadField label="Registre de commerce" obligatoire docKey="registre_commerce" authUser={authUser} value={p.registreCommerceUrl} onChange={url => upd({ registreCommerceUrl: url })} />
          </div>
          <p style={label}>IFU / NIF *</p>
          <input style={input} value={p.ifuNif} onChange={e => upd({ ifuNif: e.target.value })} />
          <div style={{ marginTop: 14 }}>
            <FileUploadField label="Attestation fiscale (facultatif)" docKey="attestation_fiscale" authUser={authUser} value={p.attestationFiscaleUrl} onChange={url => upd({ attestationFiscaleUrl: url })} />
          </div>
          <div style={{ marginTop: 14 }}>
            <FileUploadField label="Logo de l'entreprise" docKey="logo" authUser={authUser} value={p.logoUrl} onChange={url => upd({ logoUrl: url })} />
          </div>
          <p style={label}>Adresse du siège *</p>
          <input style={input} value={p.adresseSiege} onChange={e => upd({ adresseSiege: e.target.value })} />
        </>
      ) : (
        <>
          <div style={{ marginTop: 14 }}>
            <FileUploadField label="CV" docKey="cv" authUser={authUser} value={p.cvUrl} onChange={url => upd({ cvUrl: url })} />
          </div>
          <p style={label}>Expérience dans les achats/commerce</p>
          <textarea style={{ ...input, resize: 'vertical' }} rows={2} value={p.experience} onChange={e => upd({ experience: e.target.value })} />
        </>
      )}

      <p style={label}>Langues parlées</p>
      <ChipToggle options={LANGUES_DISPO} selected={p.langues} onToggle={v => toggleDans('langues', v)} />

      <p style={label}>Pays où vous pouvez faire du sourcing</p>
      <ChipToggle options={PAYS_SOURCING} selected={p.paysSourcing} onToggle={v => toggleDans('paysSourcing', v)} />

      <p style={label}>Villes que vous connaissez bien</p>
      <input style={input} value={p.villesConnues} onChange={e => upd({ villesConnues: e.target.value })} placeholder="Ex: Guangzhou, Yiwu, Shenzhen" />

      <p style={label}>Domaines d'expertise</p>
      <ChipToggle options={DOMAINES_DISPO} selected={p.domainesExpertise} onToggle={v => toggleDans('domainesExpertise', v)} />

      <p style={label}>Plateformes / sources utilisées</p>
      <ChipToggle options={SOURCES_DISPO} selected={p.sourcesHandled} onToggle={v => toggleDans('sourcesHandled', v)} />

      <p style={label}>Fournisseurs partenaires (facultatif)</p>
      <input style={input} value={p.fournisseursPartenaires} onChange={e => upd({ fournisseursPartenaires: e.target.value })} placeholder="Noms, séparés par des virgules" />

      <p style={label}>Délai moyen de réponse</p>
      <input style={input} value={p.delaiMoyenReponse} onChange={e => upd({ delaiMoyenReponse: e.target.value })} placeholder="Ex: sous 2h en journée" />

      <p style={label}>Capacité d'expédition</p>
      <ChipToggle options={EXPEDITION_DISPO} selected={p.capaciteExpedition} onToggle={v => toggleDans('capaciteExpedition', v)} />

      <p style={label}>Moyens de paiement utilisables</p>
      <ChipToggle options={PAYMENT_METHODS_DISPO} selected={p.paymentMethods} onToggle={v => toggleDans('paymentMethods', v)} />
    </>
  );
}

function EtapeBancaire({ v, set }) {
  const b = v.bancaire;
  const upd = (patch) => set('bancaire', { ...b, ...patch });
  return (
    <>
      <p style={label}>Nom du titulaire *</p>
      <input style={input} value={b.nomTitulaire} onChange={e => upd({ nomTitulaire: e.target.value })} />
      <p style={label}>Mobile Money</p>
      <input style={input} value={b.mobileMoney} onChange={e => upd({ mobileMoney: e.target.value })} placeholder="Numéro Mobile Money" />
      <p style={label}>Compte bancaire (facultatif)</p>
      <input style={input} value={b.compteBancaire} onChange={e => upd({ compteBancaire: e.target.value })} />
      <p style={label}>IBAN ou numéro de compte</p>
      <input style={input} value={b.iban} onChange={e => upd({ iban: e.target.value })} />
      <p style={label}>Nom de la banque</p>
      <input style={input} value={b.nomBanque} onChange={e => upd({ nomBanque: e.target.value })} />
      {!b.mobileMoney && !b.iban && (
        <p style={{ color: '#F59E0B', fontSize: 12, marginTop: 8 }}>Renseignez au moins un moyen de recevoir vos commissions (Mobile Money ou IBAN).</p>
      )}
    </>
  );
}

function EtapeConfiance({ v, set, authUser }) {
  const c = v.confiance;
  const upd = (patch) => set('confiance', { ...c, ...patch });
  const updRef = (idx, patch) => {
    const refs = [...c.references];
    refs[idx] = { ...refs[idx], ...patch };
    upd({ references: refs });
  };
  return (
    <>
      <div style={{ display: 'flex', gap: 8 }}>
        {['references', 'lettre'].map(m => (
          <button key={m} type="button" onClick={() => upd({ mode: m })} style={{
            flex: 1, padding: '11px 0', borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: 'pointer',
            border: `1px solid ${c.mode === m ? '#ff4d00' : 'rgba(255,255,255,.15)'}`,
            background: c.mode === m ? 'rgba(255,77,0,.15)' : 'transparent', color: '#fff',
          }}>
            {m === 'references' ? '2 références' : 'Lettre de recommandation'}
          </button>
        ))}
      </div>

      {c.mode === 'references' ? (
        [0, 1].map(idx => (
          <div key={idx} style={{ marginTop: 14, padding: 12, background: 'rgba(255,255,255,.03)', borderRadius: 10 }}>
            <p style={{ ...label, marginTop: 0 }}>Référence {idx + 1}</p>
            <input style={input} placeholder="Nom complet" value={c.references[idx].nom} onChange={e => updRef(idx, { nom: e.target.value })} />
            <input style={{ ...input, marginTop: 8 }} placeholder="Téléphone" value={c.references[idx].telephone} onChange={e => updRef(idx, { telephone: e.target.value })} />
            <input style={{ ...input, marginTop: 8 }} placeholder="Relation (ex: ancien employeur)" value={c.references[idx].relation} onChange={e => updRef(idx, { relation: e.target.value })} />
          </div>
        ))
      ) : (
        <div style={{ marginTop: 14 }}>
          <FileUploadField label="Lettre de recommandation" docKey="lettre_recommandation" authUser={authUser} value={c.lettreRecommandationUrl} onChange={url => upd({ lettreRecommandationUrl: url })} />
        </div>
      )}
    </>
  );
}

function EtapeCasier({ v, set, authUser }) {
  const cj = v.casierJudiciaire;
  const upd = (patch) => set('casierJudiciaire', { ...cj, ...patch });
  return (
    <>
      <p style={{ color: '#ffffffb0', fontSize: 13, marginBottom: 12 }}>
        Facultatif au départ, mais requis pour le statut Agent Premium ou pour le sourcing international.
        Renforce fortement la confiance des clients.
      </p>
      <FileUploadField label="Extrait de casier judiciaire (moins de 3 mois)" docKey="casier_judiciaire" authUser={authUser} value={cj.url} onChange={url => upd({ url, fourni: !!url })} />
    </>
  );
}

const CLAUSES_CONTRAT = [
  ['cguAcceptees', 'J\'accepte les conditions générales FriTok'],
  ['confidentialiteAcceptee', 'J\'accepte la clause de confidentialité'],
  ['anticorruptionAcceptee', 'J\'accepte la clause anticorruption'],
  ['interdictionArgentDirectAcceptee', 'Je m\'engage à ne jamais recevoir directement l\'argent des clients'],
  ['reglesQualiteAcceptees', 'J\'accepte de respecter les règles de qualité FriTok'],
  ['sanctionsAcceptees', 'Je comprends les sanctions applicables en cas de fraude'],
];

function EtapeContrat({ v, set }) {
  const c = v.contrat;
  const upd = (patch) => set('contrat', { ...c, ...patch });
  const toutCoche = CLAUSES_CONTRAT.every(([cle]) => c[cle]);
  return (
    <>
      {CLAUSES_CONTRAT.map(([cle, texte]) => (
        <label key={cle} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, margin: '10px 0', fontSize: 13, color: '#ffffffc0', cursor: 'pointer' }}>
          <input type="checkbox" checked={c[cle]} onChange={e => upd({ [cle]: e.target.checked })} style={{ marginTop: 2 }} />
          {texte}
        </label>
      ))}

      <p style={label}>Signature électronique — tapez votre nom complet *</p>
      <input style={input} value={c.signatureNom} onChange={e => upd({ signatureNom: e.target.value })} placeholder="Nom complet" disabled={!toutCoche} />
      {!toutCoche && <p style={{ color: '#F59E0B', fontSize: 12, marginTop: 4 }}>Cochez toutes les clauses ci-dessus pour signer.</p>}
    </>
  );
}

const QUIZ = [
  { q: 'Un agent peut-il recevoir de l\'argent directement d\'un client ?', options: ['Oui, toujours', 'Non, jamais', 'Seulement en espèces'], bonne: 1 },
  { q: 'Que faire si un produit demandé est introuvable ?', options: ['Le remplacer sans prévenir', 'Le marquer "introuvable" dans l\'app', 'Ignorer la demande'], bonne: 1 },
  { q: 'Le paiement du client passe par…', options: ['Le wallet escrow FriTok', 'Le compte WhatsApp de l\'agent', 'Un virement direct'], bonne: 0 },
  { q: 'Que se passe-t-il en cas de fraude avérée ?', options: ['Rien', 'Sanctions prévues au contrat, pouvant inclure la caution', 'Un simple rappel'], bonne: 1 },
  { q: 'Un agent doit répondre aux clients…', options: ['Quand il a le temps, sans délai précis', 'Dans un délai raisonnable et communiqué', 'Jamais directement'], bonne: 1 },
];

function EtapeFormation({ v, set }) {
  const f = v.formation;
  const [reponses, setReponses] = useState(f.quizReponses || {});

  const valider = () => {
    const score = QUIZ.reduce((s, item, i) => s + (reponses[i] === item.bonne ? 1 : 0), 0);
    const pct = Math.round((score / QUIZ.length) * 100);
    set('formation', { quizReponses: reponses, quizScore: pct, quizValide: pct >= 80 });
  };

  return (
    <>
      <p style={{ color: '#ffffffb0', fontSize: 13, marginBottom: 14 }}>
        📹 Regardez d'abord la formation vidéo FriTok (lien envoyé par email), puis répondez au questionnaire.
        Score minimum requis : 80%.
      </p>
      {QUIZ.map((item, i) => (
        <div key={i} style={{ marginBottom: 14 }}>
          <p style={{ ...label, marginTop: 0 }}>{i + 1}. {item.q}</p>
          {item.options.map((opt, oi) => (
            <label key={oi} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#ffffffc0', padding: '4px 0', cursor: 'pointer' }}>
              <input type="radio" name={`q${i}`} checked={reponses[i] === oi} onChange={() => setReponses(r => ({ ...r, [i]: oi }))} />
              {opt}
            </label>
          ))}
        </div>
      ))}
      <button type="button" onClick={valider} style={btnGhost}>Valider le questionnaire</button>
      {f.quizScore !== null && (
        <p style={{ marginTop: 10, fontSize: 13, fontWeight: 700, color: f.quizValide ? '#34C759' : '#EF4444' }}>
          Score : {f.quizScore}% {f.quizValide ? '— Validé ✓' : '— insuffisant, réessayez'}
        </p>
      )}
    </>
  );
}

const MONTANTS_GARANTIE = [25000, 50000, 100000];

function EtapeGarantie({ v, set }) {
  const g = v.garantie;
  const upd = (patch) => set('garantie', { ...g, ...patch });
  return (
    <>
      <p style={{ color: '#ffffffb0', fontSize: 13, marginBottom: 14 }}>
        Caution remboursable, couvrant les dommages ou fraudes avérées selon les conditions du contrat.
        Le paiement de la caution se fait après validation de votre dossier par l'équipe FriTok
        (vous n'avez rien à payer maintenant).
      </p>
      <div style={{ display: 'flex', gap: 8 }}>
        {MONTANTS_GARANTIE.map(m => (
          <button key={m} type="button" onClick={() => upd({ montantChoisi: m })} style={{
            flex: 1, padding: '13px 0', borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: 'pointer',
            border: `1px solid ${g.montantChoisi === m ? '#ff4d00' : 'rgba(255,255,255,.15)'}`,
            background: g.montantChoisi === m ? 'rgba(255,77,0,.15)' : 'transparent', color: '#fff',
          }}>
            {m.toLocaleString('fr-FR')} XOF
          </button>
        ))}
      </div>
    </>
  );
}

function EtapeRecap({ v }) {
  const bloc = (titre, ok) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
      <span style={{ color: '#ffffffc0', fontSize: 13 }}>{titre}</span>
      <span style={{ color: ok ? '#34C759' : '#F59E0B', fontSize: 13, fontWeight: 700 }}>{ok ? '✓ Complet' : '⚠ À compléter'}</span>
    </div>
  );
  return (
    <>
      {bloc('Identité', !!(v.identite.pieceIdentiteUrl && v.identite.selfieUrl && v.identite.nomComplet))}
      {bloc('Adresse', !!(v.adresse.justificatifUrl || v.adresse.demandeVisiteGps))}
      {bloc('Professionnel', v.professionnel.statut === 'entreprise' ? !!v.professionnel.registreCommerceUrl : true)}
      {bloc('Bancaire', !!(v.bancaire.mobileMoney || v.bancaire.iban))}
      {bloc('Confiance', v.confiance.mode === 'lettre' ? !!v.confiance.lettreRecommandationUrl : v.confiance.references.every(r => r.nom && r.telephone))}
      {bloc('Casier judiciaire', v.casierJudiciaire.fourni || true /* facultatif */)}
      {bloc('Contrat signé', !!v.contrat.signatureNom)}
      {bloc('Formation', !!v.formation.quizValide)}
      <p style={{ color: '#ffffff80', fontSize: 12, marginTop: 14 }}>
        Caution choisie : {v.garantie.montantChoisi.toLocaleString('fr-FR')} XOF (à régler après validation du dossier).
      </p>
    </>
  );
}

/* ─────────────────────────── Composant principal ─────────────────────────── */

export default function NouvelAgentWizard({ authUser }) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(formVide);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [erreur, setErreur] = useState(null);
  const [soumis, setSoumis] = useState(false);

  useEffect(() => {
    if (!authUser?.uid) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'agent_applications', authUser.uid));
        if (snap.exists()) {
          setForm(f => ({ ...f, ...snap.data() }));
          if (snap.data().statut && snap.data().statut !== 'brouillon') setSoumis(true);
        }
      } catch (e) {
        console.error('Chargement dossier agent:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [authUser?.uid]);

  const set = useCallback((section, valeur) => {
    setForm(f => ({ ...f, [section]: valeur }));
  }, []);

  const autosave = async (nextForm) => {
    if (!authUser?.uid) return;
    setSaving(true);
    try {
      await setDoc(doc(db, 'agent_applications', authUser.uid), {
        ...nextForm,
        uid: authUser.uid,
        updatedAt: serverTimestamp(),
      }, { merge: true });
    } catch (e) {
      console.error('Autosave dossier agent:', e);
    } finally {
      setSaving(false);
    }
  };

  const suivant = async () => {
    await autosave(form);
    setStep(s => Math.min(s + 1, STEPS.length));
  };
  const precedent = () => setStep(s => Math.max(s - 1, 1));

  const soumettre = async () => {
    setErreur(null);
    setSaving(true);
    try {
      const idToken = await authUser.getIdToken();
      const res = await fetch('/.netlify/functions/submit-agent-application', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({}), // le serveur relit agent_applications/{uid} déjà sauvegardé
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Échec de la soumission');
      setSoumis(true);
    } catch (e) {
      setErreur(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (!authUser) return <p style={{ color: '#ffffff70', padding: 16 }}>Connectez-vous pour postuler.</p>;
  if (loading) return <p style={{ color: '#ffffff70', padding: 16 }}>Chargement…</p>;

  if (soumis) {
    return (
      <div style={{ padding: 24, textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 10 }}>✅</div>
        <p style={{ color: '#fff', fontWeight: 800, fontSize: 16 }}>Dossier soumis</p>
        <p style={{ color: '#ffffff80', fontSize: 13 }}>
          L'équipe FriTok va examiner votre candidature. Vous serez notifié dans l'app dès qu'une décision sera prise.
        </p>
      </div>
    );
  }

  const etapeCourante = STEPS.find(s => s.id === step);

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: 16 }}>
      <h2 style={{ color: '#fff', fontSize: 18, fontWeight: 800, margin: '0 0 4px' }}>Devenir agent sourcing FriTok</h2>
      <p style={{ color: '#ffffff60', fontSize: 12, marginBottom: 16 }}>
        Étape {step} / {STEPS.length} — {etapeCourante.label} {saving && '· enregistrement…'}
      </p>

      <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
        {STEPS.map(s => (
          <div key={s.id} style={{ flex: 1, height: 4, borderRadius: 2, background: s.id <= step ? '#ff4d00' : 'rgba(255,255,255,.1)' }} />
        ))}
      </div>

      <div style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 16, padding: 18 }}>
        {step === 1 && <EtapeIdentite v={form} set={set} authUser={authUser} />}
        {step === 2 && <EtapeAdresse v={form} set={set} authUser={authUser} />}
        {step === 3 && <EtapeProfessionnel v={form} set={set} authUser={authUser} />}
        {step === 4 && <EtapeBancaire v={form} set={set} />}
        {step === 5 && <EtapeConfiance v={form} set={set} authUser={authUser} />}
        {step === 6 && <EtapeCasier v={form} set={set} authUser={authUser} />}
        {step === 7 && <EtapeContrat v={form} set={set} />}
        {step === 8 && <EtapeFormation v={form} set={set} />}
        {step === 9 && <EtapeGarantie v={form} set={set} />}
        {step === 10 && <EtapeRecap v={form} />}
      </div>

      {erreur && <p style={{ color: '#FCA5A5', fontSize: 13, marginTop: 10 }}>{erreur}</p>}

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 18 }}>
        <button type="button" onClick={precedent} disabled={step === 1} style={{ ...btnGhost, opacity: step === 1 ? .4 : 1 }}>
          ← Précédent
        </button>
        {step < STEPS.length ? (
          <button type="button" onClick={suivant} style={btnPrimary}>Suivant →</button>
        ) : (
          <button type="button" onClick={soumettre} disabled={saving} style={{ ...btnPrimary, opacity: saving ? .6 : 1 }}>
            {saving ? 'Envoi…' : 'Soumettre ma candidature'}
          </button>
        )}
      </div>
    </div>
  );
}