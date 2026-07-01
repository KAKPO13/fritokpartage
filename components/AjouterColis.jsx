'use client';

import { useState, useRef, useCallback } from 'react';
import {
  doc,
  setDoc,
  getDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db, auth } from '../lib/firebaseClient'; // ⚠️ adapte le chemin si besoin
import { colors } from '../lib/theme'; // miroir des tokens _C (Flutter)

// ─────────────────────────────────────────────
//  CONFIG R2 (identique à la version Flutter)
// ─────────────────────────────────────────────
const R2_WORKER_URL = 'https://divine-haze-26a2.fritok013.workers.dev';
const R2_BUCKET = 'shop-images';

// ─────────────────────────────────────────────
//  LIMITES DE VALIDATION (miroir des règles Firestore)
//  ⚠️ Garder ces valeurs synchronisées avec firestore.rules
//  (isValidFrais / isValidAmount)
// ─────────────────────────────────────────────
const FRAIS_MAX = 500000;
const TOTAL_MAX = 9999999;
const MAX_ARTICLES = 50;

function fmtFcfa(v) {
  const s = Math.round(v).toString();
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const fromEnd = s.length - i;
    if (i > 0 && fromEnd % 3 === 0) out += '\u202F';
    out += s[i];
  }
  return `${out} FCFA`;
}

function newArticle() {
  return { id: crypto.randomUUID(), nom: '', prix: '' };
}

// ─────────────────────────────────────────────
//  Upload photo vers R2 (via le même Worker Cloudflare
//  que l'app Flutter) — auth Firebase, jamais d'uid externe
// ─────────────────────────────────────────────
function uploadPhotoR2(file, uid, idToken, onProgress) {
  return new Promise((resolve, reject) => {
    const ext = file.type === 'image/png' ? 'png' : 'jpg';
    const fileId = crypto.randomUUID();
    const filePath = `${R2_BUCKET}/${uid}/${fileId}.${ext}`;

    const url = `${R2_WORKER_URL}?filePath=${encodeURIComponent(
      filePath
    )}&contentType=${encodeURIComponent(file.type)}`;

    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.setRequestHeader('Authorization', `Bearer ${idToken}`);
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.setRequestHeader('X-User-Id', uid); // ✅ ownership vérifié côté Worker

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
    };

    xhr.onload = () => {
      let data;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        reject(new Error("Réponse invalide du serveur d'upload"));
        return;
      }
      if (xhr.status >= 200 && xhr.status < 300 && data.success) {
        resolve(data.url);
      } else {
        reject(new Error(data.error || `Upload échoué (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error("Erreur réseau pendant l'upload"));
    xhr.send(file);
  });
}

export default function AjouterColis({ onSuccess, onCancel }) {
  // ── Champs ──────────────────────────────────
  const [nomDestinataire, setNomDestinataire] = useState('');
  const [telDestinataire, setTelDestinataire] = useState('');
  const [villeDepart, setVilleDepart] = useState('');
  const [villeDestination, setVilleDestination] = useState('');
  const [adresseLivraison, setAdresseLivraison] = useState('');
  const [fraisLivraison, setFraisLivraison] = useState('');
  const [descriptionColis, setDescriptionColis] = useState('');
  const [modePaiement, setModePaiement] = useState('aLaLivraison');
  const [typeLivraison, setTypeLivraison] = useState('solo');

  // ── Articles ────────────────────────────────
  const [articles, setArticles] = useState([newArticle()]);

  // ── Photo ───────────────────────────────────
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const galleryInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  // ── État UI ─────────────────────────────────
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successId, setSuccessId] = useState(null);

  // ── Calculs dérivés ─────────────────────────
  const totalArticles = articles.reduce(
    (s, a) => s + (parseFloat(a.prix) || 0),
    0
  );
  const frais = Math.min(
    Math.max(parseFloat(fraisLivraison) || 0, 0),
    FRAIS_MAX
  );
  const total = totalArticles + frais;

  // ── Photo handlers ──────────────────────────
  const handlePhotoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
    e.target.value = '';
  };

  const removePhoto = () => {
    setPhotoFile(null);
    setPhotoPreview('');
  };

  // ── Articles handlers ───────────────────────
  const updateArticle = (id, field, value) => {
    setArticles((prev) =>
      prev.map((a) => (a.id === id ? { ...a, [field]: value } : a))
    );
  };
  const addArticle = () => {
    if (articles.length >= MAX_ARTICLES) return;
    setArticles((prev) => [...prev, newArticle()]);
  };
  const removeArticle = (id) => {
    setArticles((prev) =>
      prev.length > 1 ? prev.filter((a) => a.id !== id) : prev
    );
  };

  // ── Validation ──────────────────────────────
  const validate = useCallback(() => {
    const errs = {};
    if (!nomDestinataire.trim()) errs.nomDestinataire = 'Champ requis';
    if (!telDestinataire.trim()) errs.telDestinataire = 'Champ requis';
    else if (telDestinataire.trim().length < 8)
      errs.telDestinataire = 'Numéro invalide';
    if (!villeDepart.trim()) errs.villeDepart = 'Requis';
    if (!villeDestination.trim()) errs.villeDestination = 'Requis';
    if (!adresseLivraison.trim()) errs.adresseLivraison = 'Champ requis';

    const fraisVal = parseFloat(fraisLivraison) || 0;
    if (!fraisLivraison.trim()) errs.fraisLivraison = 'Champ requis';
    else if (fraisVal <= 0) errs.fraisLivraison = 'Montant invalide';
    else if (fraisVal > FRAIS_MAX)
      errs.fraisLivraison = `Maximum ${fmtFcfa(FRAIS_MAX)}`;

    if (articles.some((a) => !a.nom.trim()))
      errs.articles = 'Veuillez nommer tous vos articles.';

    setErrors(errs);
    return Object.keys(errs).length === 0;
  }, [
    nomDestinataire,
    telDestinataire,
    villeDepart,
    villeDestination,
    adresseLivraison,
    fraisLivraison,
    articles,
  ]);

  // ─────────────────────────────────────────────
  // ✅ Soumission — mirroir exact de la logique Flutter :
  // clientId = userIdVend = auth.uid (colis manuel : le vendeur
  // est aussi "client"), total recalculé et validé localement,
  // frais bornés à FRAIS_MAX, écriture directe Firestore validée
  // par les règles de sécurité (isValidFrais / isValidAmount).
  // ─────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');

    if (!validate()) return;

    if (frais > FRAIS_MAX) {
      setFormError(
        `Les frais de livraison ne peuvent pas dépasser ${fmtFcfa(FRAIS_MAX)}.`
      );
      return;
    }
    if (total <= 0) {
      setFormError('Le total de la commande doit être supérieur à 0.');
      return;
    }
    if (total >= TOTAL_MAX) {
      setFormError('Le total dépasse la limite autorisée.');
      return;
    }

    const user = auth.currentUser;
    if (!user) {
      setFormError('Non connecté.');
      return;
    }

    setIsSubmitting(true);
    try {
      // 1. Upload photo si présente
      let photoUrl = '';
      if (photoFile) {
        setIsUploading(true);
        try {
          const idToken = await user.getIdToken(false);
          photoUrl = await uploadPhotoR2(
            photoFile,
            user.uid,
            idToken,
            setUploadProgress
          );
        } catch (err) {
          setFormError(`Erreur upload photo : ${err.message}`);
          return;
        } finally {
          setIsUploading(false);
          setUploadProgress(0);
        }
      }

      // 2. Infos vendeur depuis Firestore
      const vendeurSnap = await getDoc(doc(db, 'users', user.uid));
      const vd = vendeurSnap.exists() ? vendeurSnap.data() : {};
      const loc = vd.location || {};

      // 3. Construction commande
      const commandeId = crypto.randomUUID().replace(/-/g, '').substring(0, 20);

      const articlesMap = articles
        .filter((a) => a.nom.trim())
        .map((a) => ({
          nom_frifri: a.nom.trim(),
          prix_frifri: parseFloat(a.prix) || 0,
          imageUrl: photoUrl,
          boutiqueId: '',
          ref_article: '', // ✅ vide pour colis manuel (pas un produit catalogue)
          userIdVend: user.uid,
        }));

      await setDoc(doc(db, 'commandes', commandeId), {
        commandeId,
        clientId: user.uid, // ✅ règle : clientId == request.auth.uid
        userIdVend: user.uid, // ✅ règle : userIdVend == request.auth.uid

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
        vendeurAdresse: loc.address ?? vd.adresse ?? '',

        photoColis: photoUrl,
        articles: articlesMap,
        refArticles: articlesMap.map(() => ''),
        descriptionColis: descriptionColis.trim(),

        fraisLivraison: frais, // ✅ borné à FRAIS_MAX
        totalXof: total, // ✅ > 0 et < TOTAL_MAX
        totalDevise: total,
        devise: 'XOF',

        modePaiement,
        typeLivraison,

        statut: 'en_attente', // ✅ règle vérifie statut == 'en_attente'
        livreurId: null,
        livreur: null,
        codeVerification: null,

        source: 'manuel',
        batchId: null,
        transactionId: null,
        qrCode: null,

        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),

        extraData: {
          fraisLivraison: frais,
          devise: 'XOF',
          clientLat: 0,
          clientLng: 0,
          telephoneClient: telDestinataire.trim(),
          userIdVend: user.uid,
          photoColis: photoUrl,
        },
      });

      setSuccessId(commandeId);
      onSuccess?.(commandeId);
    } catch (err) {
      setFormError(`Erreur : ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const busy = isSubmitting || isUploading;

  // ─────────────────────────────────────────────
  //  RENDER
  // ─────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-fritok-bg">
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-fritok-border bg-white px-4 py-3">
        <button
          type="button"
          onClick={onCancel}
          className="flex h-9 w-9 items-center justify-center rounded-full text-fritok-text hover:bg-fritok-cardAlt"
          aria-label="Retour"
        >
          ←
        </button>
        <h1 className="text-[17px] font-extrabold text-fritok-text">
          Nouveau colis
        </h1>
        <button
          type="submit"
          form="ajouter-colis-form"
          disabled={busy}
          className="rounded-[10px] bg-fritok-orange px-4 py-2 text-sm font-bold text-white disabled:bg-fritok-orange/40"
        >
          {busy ? '…' : 'Publier'}
        </button>
      </div>

      <form
        id="ajouter-colis-form"
        onSubmit={handleSubmit}
        className="mx-auto max-w-xl px-4 py-5"
      >
        {/* Bannière info */}
        <div className="mb-5 flex gap-3 rounded-2xl border border-fritok-orange/30 bg-fritok-orange/10 p-3.5">
          <span className="text-lg">ℹ️</span>
          <p className="text-[12.5px] leading-relaxed text-fritok-orangeDark">
            Ce colis sera immédiatement visible par tous les livreurs
            disponibles dans votre zone.
          </p>
        </div>

        {formError && (
          <div className="mb-4 flex items-center gap-2 rounded-xl bg-fritok-red px-4 py-3 text-sm font-medium text-white">
            ⚠️ {formError}
          </div>
        )}

        {/* Photo */}
        <SectionTitle icon="📷" title="Photo du colis" />
        <div className="mb-5">
          {photoPreview ? (
            <div className="relative overflow-hidden rounded-2xl">
              <img
                src={photoPreview}
                alt="Colis"
                className="h-48 w-full object-cover"
              />
              {isUploading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/45 px-8">
                  <span className="font-mono text-2xl font-extrabold text-white">
                    {Math.round(uploadProgress * 100)}%
                  </span>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-white/30">
                    <div
                      className="h-full bg-fritok-orange transition-all"
                      style={{ width: `${uploadProgress * 100}%` }}
                    />
                  </div>
                </div>
              )}
              {!isUploading && (
                <button
                  type="button"
                  onClick={removePhoto}
                  className="absolute right-2.5 top-2.5 flex h-9 w-9 items-center justify-center rounded-full border border-fritok-orange/60 bg-black/55 text-fritok-orange"
                >
                  ✕
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border-[1.5px] border-fritok-border bg-white shadow-sm">
              <button
                type="button"
                onClick={() => galleryInputRef.current?.click()}
                className="flex w-full items-center gap-3.5 px-4 py-4 text-left hover:bg-fritok-cardAlt"
              >
                <IconBubble>🖼️</IconBubble>
                <span className="text-sm font-semibold text-fritok-text">
                  Choisir depuis la galerie
                </span>
                <span className="ml-auto text-fritok-textMuted">›</span>
              </button>
              <div className="h-px bg-fritok-divider" />
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                className="flex w-full items-center gap-3.5 px-4 py-4 text-left hover:bg-fritok-cardAlt"
              >
                <IconBubble>📸</IconBubble>
                <span className="text-sm font-semibold text-fritok-text">
                  Prendre une photo
                </span>
                <span className="ml-auto text-fritok-textMuted">›</span>
              </button>
              <div className="flex items-center justify-center gap-1.5 border-t border-fritok-divider bg-fritok-cardAlt py-2">
                <span className="text-xs text-fritok-textMuted">
                  Optionnel — aide le livreur à identifier le colis
                </span>
              </div>
            </div>
          )}
          <input
            ref={galleryInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handlePhotoChange}
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handlePhotoChange}
          />
        </div>

        {/* Destinataire */}
        <SectionTitle icon="👤" title="Destinataire" />
        <div className="mb-5 space-y-2.5">
          <Field
            label="Nom complet du destinataire"
            icon="🪪"
            value={nomDestinataire}
            onChange={setNomDestinataire}
            error={errors.nomDestinataire}
          />
          <Field
            label="Téléphone du destinataire"
            icon="📞"
            type="tel"
            value={telDestinataire}
            onChange={(v) => setTelDestinataire(v.replace(/\D/g, ''))}
            error={errors.telDestinataire}
          />
        </div>

        {/* Itinéraire */}
        <SectionTitle icon="🧭" title="Itinéraire" />
        <div className="mb-2.5 flex items-center gap-2">
          <Field
            label="Ville de départ"
            icon="📍"
            value={villeDepart}
            onChange={setVilleDepart}
            error={errors.villeDepart}
            wrapperClassName="flex-1"
          />
          <span className="pt-2 text-fritok-orange">→</span>
          <Field
            label="Destination"
            icon="📍"
            value={villeDestination}
            onChange={setVilleDestination}
            error={errors.villeDestination}
            wrapperClassName="flex-1"
          />
        </div>
        <div className="mb-5">
          <Field
            label="Adresse précise de livraison"
            icon="📌"
            placeholder="Ex: Quartier, rue, point de repère…"
            value={adresseLivraison}
            onChange={setAdresseLivraison}
            error={errors.adresseLivraison}
          />
        </div>

        {/* Articles */}
        <SectionTitle icon="📦" title="Articles / Contenu" />
        <p className="mb-3 text-xs text-fritok-textMuted">
          Décrivez le contenu du colis pour le livreur.
        </p>
        <div className="mb-2 overflow-hidden rounded-[14px] border-[1.5px] border-fritok-border bg-white">
          {articles.map((a, i) => (
            <div
              key={a.id}
              className={`flex items-center gap-2.5 p-3 ${
                i < articles.length - 1 ? 'border-b border-fritok-divider' : ''
              }`}
            >
              <div className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-fritok-cardAlt font-mono text-[11px] font-bold text-fritok-orange">
                {i + 1}
              </div>
              <input
                type="text"
                placeholder="Nom de l'article"
                value={a.nom}
                onChange={(e) => updateArticle(a.id, 'nom', e.target.value)}
                className="min-w-0 flex-[3] bg-transparent text-sm text-fritok-text placeholder:text-fritok-textMuted/60 focus:outline-none"
              />
              <input
                type="text"
                inputMode="numeric"
                placeholder="0 F"
                value={a.prix}
                onChange={(e) =>
                  updateArticle(
                    a.id,
                    'prix',
                    e.target.value.replace(/\D/g, '')
                  )
                }
                className="w-[90px] shrink-0 bg-transparent text-right font-mono text-sm font-semibold text-fritok-orange placeholder:text-fritok-textMuted/50 focus:outline-none"
              />
              {articles.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeArticle(a.id)}
                  className="shrink-0 text-fritok-red"
                  aria-label="Retirer l'article"
                >
                  ⊖
                </button>
              )}
            </div>
          ))}
          {articles.length < MAX_ARTICLES && (
            <button
              type="button"
              onClick={addArticle}
              className="flex w-full items-center justify-center gap-1.5 border-t border-fritok-divider bg-fritok-cardAlt py-3 text-sm font-semibold text-fritok-orange"
            >
              ＋ Ajouter un article
            </button>
          )}
        </div>
        {errors.articles && (
          <p className="mb-3 text-xs font-medium text-fritok-red">
            {errors.articles}
          </p>
        )}

        <div className="mb-5">
          <Field
            label="Description générale (optionnel)"
            icon="📝"
            placeholder="Ex: Fragile, tenir à l'abri de la chaleur…"
            value={descriptionColis}
            onChange={setDescriptionColis}
            multiline
          />
        </div>

        {/* Tarification */}
        <SectionTitle icon="💳" title="Tarification" />
        <div className="mb-3">
          <Field
            label="Frais de livraison (FCFA)"
            icon="🚚"
            placeholder="Ex: 2000"
            value={fraisLivraison}
            onChange={(v) => setFraisLivraison(v.replace(/\D/g, ''))}
            error={errors.fraisLivraison}
          />
        </div>

        <div className="mb-5 rounded-xl border border-fritok-border bg-fritok-cardAlt p-3.5">
          <SummaryLine label="Valeur articles" value={totalArticles} />
          <div className="my-1.5" />
          <SummaryLine label="Frais de livraison" value={frais} />
          <div className="my-3 h-px bg-fritok-divider" />
          <SummaryLine
            label="Total commande"
            value={total}
            bold
            color={colors.orange}
          />
        </div>

        {/* Options */}
        <SectionTitle icon="⚙️" title="Options" />
        <div className="mb-3">
          <Picker
            label="Mode de paiement"
            icon="💳"
            options={{ aLaLivraison: 'À la livraison', mobile: 'Mobile Money' }}
            selected={modePaiement}
            onChange={setModePaiement}
          />
        </div>
        <div className="mb-8">
          <Picker
            label="Type de livraison"
            icon="🚚"
            options={{ solo: 'Solo (1 livreur)', batch: 'Tournée groupée' }}
            selected={typeLivraison}
            onChange={setTypeLivraison}
          />
        </div>

        <button
          type="submit"
          disabled={busy}
          className="flex h-14 w-full items-center justify-center gap-2.5 rounded-2xl bg-fritok-orange text-[17px] font-extrabold tracking-wide text-white shadow-lg shadow-fritok-orange/30 disabled:bg-fritok-orange/40"
        >
          {busy ? (
            <span>
              {isUploading
                ? `Upload photo ${Math.round(uploadProgress * 100)}%`
                : 'Publication…'}
            </span>
          ) : (
            <>🚚 Publier le colis</>
          )}
        </button>
      </form>

      {/* Modal succès */}
      {successId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-3xl bg-white p-7 text-center">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-fritok-orange to-fritok-orangeDark text-3xl text-white shadow-lg shadow-fritok-orange/35">
              ✓
            </div>
            <h2 className="text-xl font-extrabold text-fritok-text">
              Colis publié !
            </h2>
            <p className="mt-2 text-[13px] leading-relaxed text-fritok-textSub">
              Visible immédiatement par
              <br />
              tous les livreurs disponibles.
            </p>
            <div className="mx-auto mt-3 inline-block rounded-lg border border-fritok-border bg-fritok-cardAlt px-3.5 py-2">
              <span className="font-mono text-sm font-bold text-fritok-orange">
                #{successId.substring(0, 8).toUpperCase()}
              </span>
            </div>
            <button
              type="button"
              onClick={() => onSuccess?.(successId)}
              className="mt-6 h-[50px] w-full rounded-[14px] bg-fritok-orange text-base font-extrabold text-white"
            >
              Parfait !
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
//  Sous-composants
// ─────────────────────────────────────────────
function SectionTitle({ icon, title }) {
  return (
    <div className="mb-3 flex items-center gap-1.5">
      <span className="text-sm">{icon}</span>
      <span className="text-[13px] font-extrabold tracking-wide text-fritok-textSub">
        {title}
      </span>
      <div className="ml-2 h-px flex-1 bg-fritok-divider" />
    </div>
  );
}

function IconBubble({ children }) {
  return (
    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-fritok-orange/10 text-base">
      {children}
    </span>
  );
}

function Field({
  label,
  icon,
  value,
  onChange,
  error,
  type = 'text',
  placeholder,
  multiline = false,
  wrapperClassName = '',
}) {
  const baseClasses =
    'w-full rounded-xl border-[1.5px] bg-fritok-inputFill py-3.5 pl-10 pr-3 text-sm text-fritok-text placeholder:text-fritok-textMuted/60 focus:outline-none focus:border-fritok-orange focus:border-2';
  const borderClass = error ? 'border-fritok-red' : 'border-fritok-border';

  return (
    <div className={wrapperClassName}>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fritok-orange">
          {icon}
        </span>
        {multiline ? (
          <textarea
            rows={2}
            placeholder={placeholder || label}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={`${baseClasses} ${borderClass} resize-none`}
          />
        ) : (
          <input
            type={type}
            placeholder={placeholder || label}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={`${baseClasses} ${borderClass}`}
          />
        )}
      </div>
      {!placeholder && (
        <label className="ml-1 mt-1 block text-[11px] text-fritok-textMuted">
          {label}
        </label>
      )}
      {error && (
        <p className="ml-1 mt-1 text-[11px] font-medium text-fritok-red">
          {error}
        </p>
      )}
    </div>
  );
}

function SummaryLine({ label, value, bold = false, color = colors.text }) {
  return (
    <div className="flex items-center justify-between">
      <span
        className={`text-[13px] text-fritok-textSub ${bold ? 'font-bold' : ''}`}
      >
        {label}
      </span>
      <span
        className="font-mono"
        style={{
          color,
          fontSize: bold ? 15 : 13,
          fontWeight: bold ? 800 : 600,
        }}
      >
        {fmtFcfa(value)}
      </span>
    </div>
  );
}

function Picker({ label, icon, options, selected, onChange }) {
  return (
    <div className="rounded-[14px] border-[1.5px] border-fritok-border bg-white p-3.5">
      <div className="mb-2.5 flex items-center gap-1.5">
        <span className="text-fritok-textMuted">{icon}</span>
        <span className="text-xs font-semibold text-fritok-textSub">{label}</span>
      </div>
      <div className="flex gap-2">
        {Object.entries(options).map(([key, val]) => {
          const isSelected = selected === key;
          return (
            <button
              type="button"
              key={key}
              onClick={() => onChange(key)}
              className={`flex-1 rounded-[10px] border-[1.5px] py-2.5 text-center text-xs font-bold transition-colors ${
                isSelected
                  ? 'border-fritok-orange bg-fritok-orange text-white'
                  : 'border-fritok-border bg-fritok-cardAlt text-fritok-textSub'
              }`}
            >
              {val}
            </button>
          );
        })}
      </div>
    </div>
  );
}