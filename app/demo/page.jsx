'use client';

import { useState, useRef, useEffect, useCallback, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  collection, getDocs, orderBy, query, limit, startAfter,
  addDoc, serverTimestamp, doc, getDoc,
  setDoc, deleteDoc, onSnapshot, getCountFromServer,
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import QRCode from 'qrcode';
import { db, auth } from '../../lib/firebaseClient';
import styles from './demo.module.css';

/* ══════════════════════════════════════════════════════════
   CONSTANTES LIVRAISON
   (gardées ici pour l'affichage instantané du récapitulatif —
   le montant définitif est TOUJOURS recalculé et validé côté
   serveur dans netlify/functions/create-colis.js avant écriture)
══════════════════════════════════════════════════════════ */
const VILLES_CI = [
  'Abidjan','Bouaké','Daloa','Korhogo','Yamoussoukro','San-Pédro',
  'Man','Divo','Gagnoa','Abengourou','Soubré','Odienné','Duekoué',
  'Bondoukou','Mankono','Séguéla','Touba','Ferkessédougou','Katiola',
  'Agboville','Adzopé','Tiassalé','Lakota','Issia','Sassandra',
];

const TARIFS = {
  'Abidjan': { 'Abidjan': 1500, 'Bouaké': 2500, default: 3000 },
  'Bouaké' : { 'Bouaké' : 1500, 'Abidjan': 2500, default: 3500 },
  default  : { default: 3000 },
};

function getFrais(villeVendeur, villeClient, typeLivr) {
  const base = (TARIFS[villeVendeur] ?? TARIFS.default)[villeClient]
            ?? (TARIFS[villeVendeur] ?? TARIFS.default).default
            ?? 8000;
  return typeLivr === 'groupee' ? Math.round(base * 0.8) : base;
}

const fmt = (n) => Number(n).toLocaleString('fr-FR') + ' XOF';

/* ══════════════════════════════════════════════════════════
   HISTORIQUE "VIDÉOS VUES" (invité, pas connecté)
   Connecté → Firestore users/{uid}/vues/{videoId}
   Invité   → localStorage (capé à SEEN_LS_MAX entrées)
══════════════════════════════════════════════════════════ */
const SEEN_LS_KEY = 'fritok_vues_invite';
const SEEN_LS_MAX = 300;

// Nombre de slides montées de chaque côté de la slide active (P0 —
// virtualisation du feed, voir DemoPage). RENDER_WINDOW=2 → au plus 5
// <VideoSlide> réellement montées à tout moment, donc au plus ~25
// listeners Firestore ouverts pour le feed entier, quelle que soit la
// taille du catalogue de vidéos.
const RENDER_WINDOW = 2;

// Taille de page pour le chargement paginé de video_playlist (P0 — voir
// point 4 de l'analyse : plus de getDocs() sans limit() sur toute la
// collection).
const PAGE_SIZE = 20;

/* ══════════════════════════════════════════════════════════
   ICÔNES
══════════════════════════════════════════════════════════ */
function IconHeart({ filled }) {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24"
      fill={filled ? '#ff3c6e' : 'none'} stroke={filled ? '#ff3c6e' : '#fff'}
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
    </svg>
  );
}
function IconComment() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  );
}
function IconShare() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
    </svg>
  );
}
function IconCart() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
    </svg>
  );
}
function IconClose() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  );
}
function IconPin() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/>
    </svg>
  );
}
function IconCopy() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2"/>
      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
    </svg>
  );
}
function IconLock() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#ff4d00" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      <path d="M9 12l2 2 4-4"/>
    </svg>
  );
}
function IconUser() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>
    </svg>
  );
}
function IconUserCheck() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#34C759" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
      <circle cx="8.5" cy="7" r="4"/>
      <polyline points="17 11 19 13 23 9"/>
    </svg>
  );
}
function IconSend() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13"/>
      <polygon points="22 2 15 22 11 13 2 9 22 2"/>
    </svg>
  );
}
function IconFlag() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/>
      <line x1="4" y1="22" x2="4" y2="15"/>
    </svg>
  );
}

/* ══════════════════════════════════════════════════════════
   PETITS COMPOSANTS
══════════════════════════════════════════════════════════ */
function FieldLabel({ text }) {
  return <p className={styles.fieldLabel}>{text}</p>;
}
function ToggleOpt({ label, sub, selected, onTap }) {
  return (
    <button className={selected ? styles.toggleSel : styles.toggleOpt} onClick={onTap}>
      <span className={styles.toggleLabel}>{label}</span>
      <span className={styles.toggleSub}>{sub}</span>
    </button>
  );
}
function Spinner() { return <span className={styles.spinnerSm}/>; }
function ToastMsg({ msg }) {
  if (!msg) return null;
  return <div className={styles.toastMsg}>{msg}</div>;
}

/* ══════════════════════════════════════════════════════════
   MODAL : CONNEXION REQUISE
══════════════════════════════════════════════════════════ */
function AuthRequiredModal({ onClose }) {
  return (
    <div className={styles.modalBackdrop} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modalSheet}>
        <div className={styles.modalHandle}/>
        <div className={styles.authModalBody}>
          <div className={styles.authIconWrap}><IconLock/></div>
          <h2 className={styles.authTitle}>Connexion requise</h2>
          <p className={styles.authSub}>
            Connectez-vous pour interagir sur FriTok.
          </p>
          <a className={styles.authBtnPrimary} href="/login">
            <IconUser/> Se connecter
          </a>
          <a className={styles.authBtnOutline} href="/register">
            Créer un compte gratuit
          </a>
          <button className={styles.authSkip} onClick={onClose}>
            Continuer à regarder
          </button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   MODAL : COMMENTAIRES
══════════════════════════════════════════════════════════ */
function CommentsModal({ videoId, authUser, onClose, onAuthRequired, onSent }) {
  const [comments,  setComments]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [text,      setText]      = useState('');
  const [sending,   setSending]   = useState(false);
  const [toast,     setToast]     = useState(null);
  const inputRef = useRef(null);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  // Écoute temps-réel des commentaires
  useEffect(() => {
    if (!videoId) return;
    const q = query(
      collection(db, 'video_playlist', videoId, 'comments'),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(q, snap => {
      setComments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, () => setLoading(false));
    return unsub;
  }, [videoId]);

  const handleSend = async () => {
    if (!authUser) { onClose(); onAuthRequired(); return; }
    const trimmed = text.trim().slice(0, 500); // borne alignée sur firestore.rules
    if (!trimmed) return;
    setSending(true);
    try {
      await addDoc(collection(db, 'video_playlist', videoId, 'comments'), {
        text     : trimmed,
        userId   : authUser.uid,
        userName : authUser.displayName || authUser.email?.split('@')[0] || 'Anonyme',
        userPhoto: authUser.photoURL || '',
        createdAt: serverTimestamp(),
      });
      setText('');
      inputRef.current?.focus();
      onSent?.();
    } catch (e) {
      showToast('Erreur : ' + e.message);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const formatTs = (ts) => {
    if (!ts) return '';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    const diff = Date.now() - d.getTime();
    if (diff < 60000)   return 'À l\'instant';
    if (diff < 3600000) return Math.floor(diff / 60000) + ' min';
    if (diff < 86400000)return Math.floor(diff / 3600000) + 'h';
    return d.toLocaleDateString('fr-FR');
  };

  return (
    <div className={styles.modalBackdrop} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modalSheet}>
        <div className={styles.modalHandle}/>

        <div className={styles.modalHeader}>
          <div>
            <p className={styles.modalTitle}>Commentaires</p>
            {!loading && <p className={styles.modalSub}>{comments.length} commentaire{comments.length !== 1 ? 's' : ''}</p>}
          </div>
          <button className={styles.modalClose} onClick={onClose}><IconClose/></button>
        </div>

        {/* Liste commentaires */}
        <div className={styles.commentList}>
          {loading && (
            <div className={styles.commentLoading}>
              <Spinner/>
            </div>
          )}
          {!loading && comments.length === 0 && (
            <div className={styles.commentEmpty}>
              <p>Aucun commentaire pour l'instant.</p>
              <p>Soyez le premier à commenter !</p>
            </div>
          )}
          {!loading && comments.map(c => (
            <div key={c.id} className={styles.commentItem}>
              <div className={styles.commentAvatar}>
                {c.userPhoto
                  ? <img src={c.userPhoto} alt="" className={styles.commentAvatarImg}/>
                  : <div className={styles.commentAvatarFallback}>
                      {(c.userName || '?')[0].toUpperCase()}
                    </div>
                }
              </div>
              <div className={styles.commentContent}>
                <div className={styles.commentMeta}>
                  <span className={styles.commentName}>{c.userName || 'Anonyme'}</span>
                  <span className={styles.commentTime}>{formatTs(c.createdAt)}</span>
                </div>
                <p className={styles.commentText}>{c.text}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Saisie commentaire */}
        <div className={styles.commentInputBar}>
          {authUser
            ? (
              <div className={styles.commentInputWrap}>
                <div className={styles.commentAvatarSm}>
                  {authUser.photoURL
                    ? <img src={authUser.photoURL} alt="" className={styles.commentAvatarImg}/>
                    : <div className={styles.commentAvatarFallback} style={{ width: 36, height: 36, fontSize: '.85rem' }}>
                        {(authUser.displayName || authUser.email || '?')[0].toUpperCase()}
                      </div>
                  }
                </div>
                <textarea
                  ref={inputRef}
                  className={styles.commentInput}
                  placeholder="Ajouter un commentaire…"
                  value={text}
                  onChange={e => setText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={1}
                  maxLength={500}
                />
                <button
                  className={styles.commentSendBtn}
                  onClick={handleSend}
                  disabled={sending || !text.trim()}
                >
                  {sending ? <Spinner/> : <IconSend/>}
                </button>
              </div>
            ) : (
              <button className={styles.commentLoginPrompt} onClick={() => { onClose(); onAuthRequired(); }}>
                <IconUser/> Connectez-vous pour commenter
              </button>
            )
          }
        </div>

        <ToastMsg msg={toast}/>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   MODAL : COMMANDE + LIVRAISON
   ── CORRIGÉ ──
   La commande n'est plus écrite directement dans Firestore
   (firestore.rules interdit `allow create` sur /commandes — le
   client n'a jamais eu la permission d'y écrire). Elle passe
   maintenant par la Netlify Function `create-colis`, qui :
     - revalide tout côté serveur
     - recalcule fraisLivraison / totalXof (ne fait jamais confiance
       au calcul client, qui reste ici uniquement pour l'affichage
       instantané du récapitulatif avant confirmation)
     - sépare téléphone / adresse précise / GPS dans une
       sous-collection privée non lisible par tout le vivier de
       livreurs (voir firestore.rules)
   Le QR code est généré localement (lib `qrcode`) — il ne transite
   plus par un service tiers (api.qrserver.com) avec les données du
   client dans l'URL.
══════════════════════════════════════════════════════════ */
function OrderModal({ product, sellerId, authUser, onClose }) {
  const [step,        setStep]        = useState('form');
  const [nomDest,      setNomDest]     = useState(
    authUser?.displayName || authUser?.email?.split('@')[0] || ''
  );
  const [telephone,   setTelephone]   = useState(authUser?.phoneNumber ?? '');
  const [adresse,     setAdresse]     = useState('');
  const [villeClient, setVilleClient] = useState('');
  const [typeLivr,    setTypeLivr]    = useState('solo');
  const [modePaiem,   setModePaiem]   = useState('livraison');
  const [locLoading,  setLocLoading]  = useState(false);
  const [gpsCoords,   setGpsCoords]   = useState(null);
  const [submitting,  setSubmitting]  = useState(false);
  const [errors,      setErrors]      = useState({});
  const [commandeId,  setCommandeId]  = useState(null);
  const [qrImgUrl,    setQrImgUrl]    = useState(null);
  const [serverTotal, setServerTotal] = useState(null); // { fraisXof, totalXof } validés serveur
  const [toast,       setToast]       = useState(null);

  const prix     = Number(product?.price ?? 0);
  // Estimation affichée avant confirmation — le montant qui compte réellement
  // est celui renvoyé par create-colis après recalcul serveur.
  const fraisXof = villeClient ? getFrais('Abidjan', villeClient, typeLivr) : 0;
  const totalXof = prix + fraisXof;

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3500); };

  const localiser = () => {
    setLocLoading(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        setGpsCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        showToast('Position capturée !');
        setLocLoading(false);
      },
      err => { showToast('GPS refusé : ' + err.message); setLocLoading(false); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const validate = () => {
    const e = {};
    if (!nomDest.trim())                e.nomDest   = 'Nom obligatoire';
    const digits = telephone.replace(/\D/g, '');
    if (!digits || digits.length < 8) e.telephone = 'Numéro invalide (min 8 chiffres)';
    if (!adresse.trim())               e.adresse   = 'Adresse obligatoire';
    if (!villeClient)                  e.ville     = 'Choisissez une ville';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const confirmer = async () => {
    if (!validate()) return;
    if (!authUser) { showToast('Vous devez être connecté.'); return; }
    setSubmitting(true);
    try {
      const idToken = await authUser.getIdToken();

      const res = await fetch('/.netlify/functions/create-colis', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          // sellerId != l'appelant → la fonction traite ceci comme une
          // commande marketplace (userIdVend = sellerId, pas l'acheteur)
          sellerId,
          nomDestinataire: nomDest.trim(),
          telDestinataire: telephone.trim(),
          villeDepart: 'Abidjan',
          villeDestination: villeClient,
          adresseLivraison: adresse.trim(),
          descriptionColis: product?.name ?? '',
          fraisLivraison: fraisXof,
          modePaiement: modePaiem === 'immediat' ? 'enLigne' : 'aLaLivraison',
          typeLivraison: typeLivr,
          photoUrl: product?.image ?? product?.thumbnail ?? '',
          articles: [{
            nom: product?.name ?? '',
            prix,
            refArticle: product?.productId ?? product?.refArticle ?? '',
          }],
          gpsCoords,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Échec de la commande');

      // QR généré localement — ne contient plus téléphone/adresse/GPS,
      // uniquement l'identifiant de commande et le vendeur (pour le scan livreur).
      const dataUrl = await QRCode.toDataURL(data.qrPayload, {
        width: 220,
        margin: 1,
        color: { dark: '#000000', light: '#ffffff' },
      });

      setCommandeId(data.commandeId);
      setServerTotal({ fraisXof: data.fraisXof, totalXof: data.totalXof });
      setQrImgUrl(dataUrl);
      setStep('qr');
    } catch (e) {
      showToast('Erreur : ' + e.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!product) return null;

  return (
    <div className={styles.modalBackdrop} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modalSheet}>
        <div className={styles.modalHandle}/>
        <div className={styles.modalHeader}>
          <div>
            <p className={styles.modalTitle}>
              {step === 'qr' ? 'Commande confirmée' : 'Commander avec livraison'}
            </p>
            <p className={styles.modalSub}>{product?.name ?? ''}</p>
          </div>
          <button className={styles.modalClose} onClick={onClose}><IconClose/></button>
        </div>

        {step === 'form' && authUser && (
          <div className={styles.authBadge}>
            <IconUserCheck/>
            <span>Connecté : <strong>{authUser.email}</strong></span>
          </div>
        )}

        {step === 'form' && (
          <div className={styles.modalBody}>
            <div className={styles.recapCard}>
              {(product?.image || product?.thumbnail) && (
                <img className={styles.recapImg} src={product.image || product.thumbnail} alt=""/>
              )}
              <div className={styles.recapInfo}>
                <p className={styles.recapName}>{product?.name}</p>
                <p className={styles.recapPrice}>{fmt(prix)}</p>
              </div>
            </div>

            <FieldLabel text="TYPE DE LIVRAISON"/>
            <div className={styles.toggleRow}>
              <ToggleOpt label="Solo"    sub="Livreur dédié"    selected={typeLivr === 'solo'}    onTap={() => setTypeLivr('solo')}/>
              <ToggleOpt label="Groupée" sub="Tournée partagée" selected={typeLivr === 'groupee'} onTap={() => setTypeLivr('groupee')}/>
            </div>

            <FieldLabel text="MODE DE PAIEMENT"/>
            <div className={styles.toggleRow}>
              <ToggleOpt label="À la livraison" sub="Cash"               selected={modePaiem === 'livraison'} onTap={() => setModePaiem('livraison')}/>
              <ToggleOpt label="En ligne"        sub="Paiement sécurisé" selected={modePaiem === 'immediat'}  onTap={() => setModePaiem('immediat')}/>
            </div>

            <FieldLabel text="NOM DU DESTINATAIRE"/>
            <input
              className={`${styles.formInput}${errors.nomDest ? ' ' + styles.inputErr : ''}`}
              type="text" placeholder="Nom complet"
              value={nomDest} onChange={e => setNomDest(e.target.value)}
            />
            {errors.nomDest && <p className={styles.errMsg}>{errors.nomDest}</p>}

            <FieldLabel text="TÉLÉPHONE DE CONTACT"/>
            <input
              className={`${styles.formInput}${errors.telephone ? ' ' + styles.inputErr : ''}`}
              type="tel" placeholder="07 XX XX XX XX"
              value={telephone} onChange={e => setTelephone(e.target.value)}
            />
            {errors.telephone && <p className={styles.errMsg}>{errors.telephone}</p>}

            <FieldLabel text="VILLE DE LIVRAISON"/>
            <select
              className={`${styles.formInput}${errors.ville ? ' ' + styles.inputErr : ''}`}
              value={villeClient} onChange={e => setVilleClient(e.target.value)}
            >
              <option value="">Sélectionnez votre ville…</option>
              {VILLES_CI.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            {errors.ville && <p className={styles.errMsg}>{errors.ville}</p>}

            {villeClient && (
              <div className={styles.fraisCard}>
                <div className={styles.fraisRow}><span>Articles</span><span>{fmt(prix)}</span></div>
                <div className={styles.fraisRow}>
                  <span>Livraison{typeLivr === 'groupee' ? ' (-20%)' : ''}</span>
                  <span>{fmt(fraisXof)}</span>
                </div>
                <div className={styles.fraisDivider}/>
                <div className={`${styles.fraisRow} ${styles.fraisTotal}`}>
                  <span>Total (estimé)</span><span>{fmt(totalXof)}</span>
                </div>
              </div>
            )}

            <FieldLabel text="ADRESSE DE LIVRAISON"/>
            <textarea
              className={`${styles.formInput} ${styles.formTextarea}${errors.adresse ? ' ' + styles.inputErr : ''}`}
              placeholder="Quartier, rue, point de repère…"
              value={adresse} onChange={e => setAdresse(e.target.value)} rows={2}
            />
            {errors.adresse && <p className={styles.errMsg}>{errors.adresse}</p>}

            <button
              className={`${styles.locBtn}${gpsCoords ? ' ' + styles.locOk : ''}`}
              onClick={localiser} disabled={locLoading}
            >
              {locLoading
                ? <Spinner/>
                : gpsCoords
                  ? `${gpsCoords.lat.toFixed(4)}, ${gpsCoords.lng.toFixed(4)}`
                  : <><IconPin/> Localiser mon adresse</>
              }
            </button>

            <button className={styles.confirmBtn} onClick={confirmer} disabled={submitting}>
              {submitting
                ? <Spinner/>
                : modePaiem === 'immediat' ? `Payer ${fmt(totalXof)}` : 'Commander — payer à la livraison'
              }
            </button>
          </div>
        )}

        {step === 'qr' && commandeId && (
          <div className={`${styles.modalBody} ${styles.qrStep}`}>
            <p className={styles.qrHint}>Le livreur scannera ce code pour récupérer votre commande</p>
            <div className={styles.qrWrap}>
              {qrImgUrl && <img className={styles.qrImg} src={qrImgUrl} alt="QR commande"/>}
            </div>
            <div className={styles.cidCard} onClick={() => {
              navigator.clipboard?.writeText(commandeId);
              showToast('ID copié !');
            }}>
              <span className={styles.cidLabel}>Commande #</span>
              <span className={styles.cidValue}>{commandeId}</span>
              <IconCopy/>
            </div>
            {gpsCoords && (
              <p className={styles.gpsTag}>{gpsCoords.lat.toFixed(5)}, {gpsCoords.lng.toFixed(5)}</p>
            )}
            <div className={styles.fraisCard} style={{ width: '100%' }}>
              <div className={styles.fraisRow}><span>{product?.name}</span><span>{fmt(prix)}</span></div>
              <div className={styles.fraisRow}><span>Livraison {villeClient}</span><span>{fmt(serverTotal?.fraisXof ?? fraisXof)}</span></div>
              <div className={styles.fraisDivider}/>
              <div className={`${styles.fraisRow} ${styles.fraisTotal}`}><span>Total</span><span>{fmt(serverTotal?.totalXof ?? totalXof)}</span></div>
              <div className={styles.fraisRow} style={{ opacity: 0.65, fontSize: '.75rem', marginTop: 6 }}>
                <span>Paiement</span>
                <span>{modePaiem === 'immediat' ? 'En ligne' : 'À la livraison'}</span>
              </div>
            </div>
            <button className={styles.confirmBtn} onClick={onClose}>Fermer</button>
          </div>
        )}

        <ToastMsg msg={toast}/>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   BOTTOM SHEET — SIGNALER LA VIDÉO
   ── AJOUT (inspiré de ReportSheet dans live.module.js) ──
   Écrit dans /video_reports (nouvelle collection, distincte de
   /live_reports — même modèle mais videoId au lieu de channelId).
   Nécessite d'ajouter aux firestore.rules :

     match /video_reports/{reportId} {
       allow read: if false; // modération uniquement (Admin SDK / console)
       allow create: if isAuth()
         && request.resource.data.reporterId == request.auth.uid
         && request.resource.data.keys().hasOnly([
              'videoId','sellerId','reporterId','reason','details','createdAt','status'
            ])
         && request.resource.data.status == 'pending'
         && request.resource.data.reason is string
         && request.resource.data.details is string
         && request.resource.data.details.size() <= 500;
       allow update, delete: if false;
     }

   Sans cette règle, l'écriture ci-dessous échouera (permission-denied).
══════════════════════════════════════════════════════════ */
const REPORT_REASONS = [
  { key: 'sexuel',     label: 'Contenu sexuel ou nudité' },
  { key: 'arnaque',    label: 'Arnaque ou fraude' },
  { key: 'contrefait', label: 'Produit contrefait ou illégal' },
  { key: 'haine',      label: 'Propos haineux ou harcèlement' },
  { key: 'violence',   label: 'Violence ou contenu choquant' },
  { key: 'spam',       label: 'Spam ou publicité trompeuse' },
  { key: 'autre',      label: 'Autre raison' },
];

function ReportSheet({ videoId, sellerId, authUser, onClose }) {
  const [reason,     setReason]     = useState(null);
  const [details,    setDetails]    = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done,       setDone]       = useState(false);
  const [errMsg,     setErrMsg]     = useState(null);

  const submit = async () => {
    if (!reason) { setErrMsg('Choisissez un motif.'); return; }
    if (!authUser || !videoId) return;
    setSubmitting(true);
    setErrMsg(null);
    try {
      await addDoc(collection(db, 'video_reports'), {
        videoId,
        sellerId:   sellerId ?? '',
        reporterId: authUser.uid,
        reason,
        details:    details.trim().slice(0, 500),
        createdAt:  serverTimestamp(),
        status:     'pending',
      });
      setDone(true);
      setTimeout(onClose, 2200);
    } catch (e) {
      console.warn('⚠️ report submit:', e.code ?? e.message ?? e);
      setErrMsg("Échec de l'envoi. Réessayez.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.modalBackdrop} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modalSheet}>
        <div className={styles.modalHandle}/>
        {done ? (
          <div style={{ textAlign: 'center', padding: '28px 16px' }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>✅</div>
            <p style={{ color: '#fff', fontWeight: 800, fontSize: 16, margin: '0 0 6px' }}>Signalement envoyé</p>
            <p style={{ color: '#ffffff80', fontSize: 13, margin: 0 }}>Merci, notre équipe va l'examiner rapidement.</p>
          </div>
        ) : (
          <>
            <div className={styles.modalHeader}>
              <div>
                <p className={styles.modalTitle}>Signaler cette vidéo</p>
                <p className={styles.modalSub}>Aidez-nous à garder FriTok sûr</p>
              </div>
              <button className={styles.modalClose} onClick={onClose}><IconClose/></button>
            </div>
            <div style={{ padding: '4px 20px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {REPORT_REASONS.map(r => (
                <button key={r.key} onClick={() => setReason(r.key)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '12px 14px', borderRadius: 12, cursor: 'pointer', textAlign: 'left',
                    background: reason === r.key ? 'rgba(239,68,68,.12)' : 'rgba(255,255,255,.04)',
                    border: `1px solid ${reason === r.key ? 'rgba(239,68,68,.5)' : 'rgba(255,255,255,.1)'}`,
                    color: '#fff', fontSize: 14,
                  }}>
                  <span>{r.label}</span>
                  <span style={{
                    width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                    border: `2px solid ${reason === r.key ? '#EF4444' : 'rgba(255,255,255,.3)'}`,
                    background: reason === r.key ? '#EF4444' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {reason === r.key && <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#fff' }}/>}
                  </span>
                </button>
              ))}
              <textarea
                placeholder="Détails supplémentaires (optionnel)"
                value={details} onChange={e => setDetails(e.target.value)}
                rows={3} maxLength={500}
                style={{
                  marginTop: 4, padding: '10px 12px', borderRadius: 10, resize: 'vertical',
                  background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.12)',
                  color: '#fff', fontSize: 13, fontFamily: 'inherit',
                }}
              />
              {errMsg && <p style={{ color: '#FCA5A5', fontSize: 12, margin: '2px 0 0' }}>{errMsg}</p>}
              <button onClick={submit} disabled={!reason || submitting}
                style={{
                  marginTop: 6, padding: '13px 0', borderRadius: 12, border: 'none',
                  background: (!reason || submitting) ? 'rgba(239,68,68,.35)' : '#EF4444',
                  color: '#fff', fontWeight: 700, fontSize: 15,
                  cursor: (!reason || submitting) ? 'not-allowed' : 'pointer',
                }}>
                {submitting ? 'Envoi...' : 'Envoyer le signalement'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   HOOK : LIKES persistés Firestore
   Sous-collection : video_playlist/{videoId}/likes/{userId}
══════════════════════════════════════════════════════════ */
function useLike(videoId, initialCount, authUser) {
  const [liked,  setLiked]  = useState(false);
  const [count,  setCount]  = useState(initialCount ?? 0);
  const [ready,  setReady]  = useState(false);

  // Vérifie si l'utilisateur a déjà liké (une seule fois à l'init)
  useEffect(() => {
    if (!videoId || !authUser?.uid) { setReady(true); return; }
    const likeRef = doc(db, 'video_playlist', videoId, 'likes', authUser.uid);
    // onSnapshot pour rester sync si multiple onglets
    const unsub = onSnapshot(likeRef, snap => {
      setLiked(snap.exists());
      setReady(true);
    });
    return unsub;
  }, [videoId, authUser?.uid]);

  // ⚠️ P0 — CORRIGÉ (voir analyse-scalabilite-fritok.md, point 2) : ce compteur
  // écoutait auparavant TOUTE la sous-collection `likes` en onSnapshot pour en
  // déduire snap.size. Facturation Firestore : un read par document du
  // snapshot initial + un read par like ajouté/retiré, PAR CLIENT qui écoute.
  // Sur une vidéo virale (ex. 200k likes × 50k spectateurs simultanés), ça
  // représente des milliards de reads pour afficher un simple chiffre.
  // Remplacé par une requête d'agrégation ponctuelle (getCountFromServer) :
  // facturée ~1 read par tranche de 1000 documents scannés, pas 1 par
  // document. Le compteur n'est donc plus mis à jour en temps réel quand un
  // AUTRE utilisateur like — seule l'action de CET utilisateur (toggle
  // optimiste ci-dessous) met à jour l'affichage immédiatement, ce qui est
  // un compromis largement acceptable pour un compteur d'affichage.
  useEffect(() => {
    if (!videoId) return;
    let cancelled = false;
    getCountFromServer(collection(db, 'video_playlist', videoId, 'likes'))
      .then(snap => { if (!cancelled) setCount(snap.data().count); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [videoId]);

  const toggle = useCallback(async (e) => {
    e?.stopPropagation();
    if (!authUser?.uid || !videoId) return;
    const likeRef = doc(db, 'video_playlist', videoId, 'likes', authUser.uid);
    if (liked) {
      setLiked(false);
      setCount(c => Math.max(0, c - 1));
      await deleteDoc(likeRef).catch(() => { setLiked(true); setCount(c => c + 1); });
    } else {
      setLiked(true);
      setCount(c => c + 1);
      await setDoc(likeRef, { userId: authUser.uid, createdAt: serverTimestamp() })
            .catch(() => { setLiked(false); setCount(c => Math.max(0, c - 1)); });
    }
  }, [liked, videoId, authUser?.uid]);

  return { liked, count, toggle, ready };
}

/* ══════════════════════════════════════════════════════════
   HOOK : COMMENT COUNT
   ⚠️ P0 — CORRIGÉ : même correctif que useLike (voir plus haut).
   getCountFromServer au montage au lieu d'un onSnapshot permanent sur
   toute la sous-collection comments. `bump()` permet un incrément
   optimiste local juste après l'envoi d'un commentaire par CET
   utilisateur (voir CommentsModal.onSent), sans re-solliciter Firestore.
══════════════════════════════════════════════════════════ */
function useCommentCount(videoId, initialCount) {
  const [count, setCount] = useState(initialCount ?? 0);

  useEffect(() => {
    if (!videoId) return;
    let cancelled = false;
    getCountFromServer(collection(db, 'video_playlist', videoId, 'comments'))
      .then(snap => { if (!cancelled) setCount(snap.data().count); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [videoId]);

  const bump = useCallback(() => setCount(c => c + 1), []);

  return [count, bump];
}

/* ══════════════════════════════════════════════════════════
   HOOK : FOLLOW persisté Firestore (façon TikTok)
   Modèle bidirectionnel :
     users/{sellerId}/followers/{followerId}  → { userId: followerId, createdAt }
     users/{followerId}/following/{sellerId}  → { userId: sellerId,   createdAt }
   Deux écritures distinctes, mais chaque document reste sous le uid de
   son propriétaire → compatible avec une règle firestore.rules du type
   allow write: if request.auth.uid == {le uid du sous-chemin}.
   `followerCount` compte en direct via onSnapshot sur la sous-collection
   followers du vendeur (même pattern que useCommentCount / useLike).
══════════════════════════════════════════════════════════ */
function useFollow(sellerId, authUser) {
  const [following,     setFollowing]     = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [ready,         setReady]         = useState(false);

  const isSelf = !!(authUser?.uid && sellerId && authUser.uid === sellerId);

  // Statut "je suis déjà abonné ?" — un seul doc à surveiller
  useEffect(() => {
    if (!sellerId || !authUser?.uid || isSelf) { setReady(true); return; }
    const followRef = doc(db, 'users', sellerId, 'followers', authUser.uid);
    const unsub = onSnapshot(followRef, snap => {
      setFollowing(snap.exists());
      setReady(true);
    }, () => setReady(true));
    return unsub;
  }, [sellerId, authUser?.uid, isSelf]);

  // ⚠️ P0 — CORRIGÉ : même correctif que useLike/useCommentCount. Agrégation
  // ponctuelle au lieu d'un onSnapshot permanent sur toute la sous-collection
  // followers (voir analyse-scalabilite-fritok.md, point 2).
  useEffect(() => {
    if (!sellerId) return;
    let cancelled = false;
    getCountFromServer(collection(db, 'users', sellerId, 'followers'))
      .then(snap => { if (!cancelled) setFollowerCount(snap.data().count); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [sellerId]);

  const toggle = useCallback(async (e) => {
    e?.stopPropagation();
    if (!authUser?.uid || !sellerId || isSelf) return;

    const followerRef  = doc(db, 'users', sellerId,     'followers', authUser.uid);
    const followingRef = doc(db, 'users', authUser.uid, 'following', sellerId);

    if (following) {
      setFollowing(false);
      setFollowerCount(c => Math.max(0, c - 1));
      await Promise.all([deleteDoc(followerRef), deleteDoc(followingRef)])
        .catch(() => { setFollowing(true); setFollowerCount(c => c + 1); });
    } else {
      setFollowing(true);
      setFollowerCount(c => c + 1);
      await Promise.all([
        setDoc(followerRef,  { userId: authUser.uid, createdAt: serverTimestamp() }),
        setDoc(followingRef, { userId: sellerId,      createdAt: serverTimestamp() }),
      ]).catch(() => { setFollowing(false); setFollowerCount(c => Math.max(0, c - 1)); });
    }
  }, [following, sellerId, authUser?.uid, isSelf]);

  return { following, followerCount, toggle, ready, isSelf };
}

/* ══════════════════════════════════════════════════════════
   HOOK : HISTORIQUE DES VIDÉOS VUES (logique "à la TikTok")
   - Charge une seule fois l'historique existant au montage.
   - seenIdsRef est une ref (pas un state) : on ne veut PAS que le
     feed se réordonne pendant que l'utilisateur scrolle et que de
     nouvelles vidéos se marquent "vues" en direct — seenReady ne
     bascule à true qu'une fois, ce qui déclenche un seul tri initial.
   - markSeen() met à jour la ref immédiatement (pour éviter les
     écritures en double) + persiste (Firestore ou localStorage).
══════════════════════════════════════════════════════════ */
function useSeenVideos(authUser, authReady) {
  const seenIdsRef  = useRef(new Set());
  const writtenRef  = useRef(new Set()); // anti-doublon d'écriture dans la session
  const [seenReady, setSeenReady] = useState(false);

  useEffect(() => {
    if (!authReady) return;
    let cancelled = false;

    async function load() {
      try {
        if (authUser?.uid) {
          const q = query(
            collection(db, 'users', authUser.uid, 'vues'),
            orderBy('vuLe', 'desc'),
            limit(500)
          );
          const snap = await getDocs(q);
          if (!cancelled) seenIdsRef.current = new Set(snap.docs.map(d => d.id));
        } else {
          const raw = JSON.parse(localStorage.getItem(SEEN_LS_KEY) || '[]');
          if (!cancelled) seenIdsRef.current = new Set(raw);
        }
      } catch (e) {
        console.error('Historique vues:', e);
      } finally {
        if (!cancelled) setSeenReady(true);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [authUser?.uid, authReady]);

  const markSeen = useCallback((videoId) => {
    if (!videoId || writtenRef.current.has(videoId)) return;
    writtenRef.current.add(videoId);
    seenIdsRef.current.add(videoId);

    if (authUser?.uid) {
      // Doc appartenant à l'utilisateur → autorisé par firestore.rules
      // (allow write: if request.auth.uid == uid sur users/{uid}/vues/{id})
      setDoc(doc(db, 'users', authUser.uid, 'vues', videoId), {
        vu: true,
        vuLe: serverTimestamp(),
      }, { merge: true }).catch(() => {});
    } else {
      try {
        const raw = JSON.parse(localStorage.getItem(SEEN_LS_KEY) || '[]');
        const next = [videoId, ...raw.filter(id => id !== videoId)].slice(0, SEEN_LS_MAX);
        localStorage.setItem(SEEN_LS_KEY, JSON.stringify(next));
      } catch { /* quota dépassé / navigation privée : on ignore */ }
    }
  }, [authUser?.uid]);

  return { seenIdsRef, seenReady, markSeen };
}

/* ══════════════════════════════════════════════════════════
   VIDEO SLIDE
   ── CORRIGÉ ──
   Le mute/unmute n'est plus un état local par slide (chaque
   nouvelle slide remontait avec `useState(true)`, ce qui coupait
   le son à chaque scroll). `muted` et `setMuted` sont désormais
   reçus en props depuis DemoPage : un seul état partagé par
   toute la liste, mis à jour une fois pour toutes.
   Ajout : bouton "suivre" sous l'avatar, branché sur useFollow.
══════════════════════════════════════════════════════════ */
function VideoSlide({ item, isActive, authUser, authReady, muted, setMuted, markSeen }) {
  const videoRef  = useRef(null);
  const tapTimer  = useRef(null);
  const router    = useRouter();
  const [playing,      setPlaying]      = useState(false);
  const [tapIcon,      setTapIcon]      = useState(null);
  const [orderProduct, setOrderProduct] = useState(null);
  const [authPrompt,   setAuthPrompt]   = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [showReport,   setShowReport]   = useState(false);

  const sellerId = item.userId ?? item.refArticle ?? '';

  // Likes Firestore
  const { liked, count: likeCount, toggle: toggleLike, ready: likeReady } =
    useLike(item.id, item.likes ?? 0, authUser);

  // Comment count : lecture ponctuelle (P0) + incrément optimiste local
  const [commentCount, bumpCommentCount] = useCommentCount(item.id, item.comments ?? 0);

  // Follow Firestore (item.userId = id du vendeur/créateur de la vidéo)
  const { following, toggle: toggleFollow, isSelf } = useFollow(sellerId, authUser);

  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;
    if (isActive) {
      vid.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    } else {
      vid.pause();
      vid.currentTime = 0;
      setPlaying(false);
    }
  }, [isActive]);

  const handleTap = () => {
    const vid = videoRef.current;
    if (!vid) return;
    if (vid.paused) { vid.play(); setPlaying(true); setTapIcon('play'); }
    else            { vid.pause(); setPlaying(false); setTapIcon('pause'); }
    clearTimeout(tapTimer.current);
    tapTimer.current = setTimeout(() => setTapIcon(null), 800);
  };

  // Marque la vidéo comme "vue" après ~3s de lecture réelle (ou 70% de sa
  // durée si elle est très courte) — comme TikTok, pas juste au chargement.
  const handleTimeUpdate = () => {
    const vid = videoRef.current;
    if (!vid) return;
    const seuil = Number.isFinite(vid.duration) && vid.duration > 0
      ? Math.min(3, vid.duration * 0.7)
      : 3;
    if (vid.currentTime >= seuil) markSeen(item.id);
  };

  const handleLike = (e) => {
    e.stopPropagation();
    if (!authReady) return;
    if (!authUser) { setAuthPrompt(true); return; }
    toggleLike(e);
  };

  const handleComment = (e) => {
    e.stopPropagation();
    setShowComments(true);
  };

  const handleOrder = e => {
    e.stopPropagation();
    if (!authReady) return;
    if (!authUser) { setAuthPrompt(true); }
    else           { setOrderProduct(item.product); }
  };

  const handleFollow = (e) => {
    e.stopPropagation();
    if (!authReady || isSelf) return;
    if (!authUser) { setAuthPrompt(true); return; }
    toggleFollow(e);
  };

  const handleReport = (e) => {
    e.stopPropagation();
    if (!authReady) return;
    if (!authUser) { setAuthPrompt(true); return; }
    setShowReport(true);
  };

  const handleOpenProfile = (e) => {
    e.stopPropagation();
    if (!sellerId) return;
    router.push(`/profile/${sellerId}`);
  };

  const initials = (item.title || '@?').replace('@', '')[0]?.toUpperCase() ?? '?';
  const tags = (item.keywords ?? []).slice(0, 5).map(k => '#' + k).join(' ');

  return (
    <div className={styles.slide}>
      <video
        ref={videoRef}
        src={item.videoUrl}
        className={styles.video}
        loop playsInline muted={muted}
        onClick={handleTap}
        onTimeUpdate={handleTimeUpdate}
        poster={item.product?.thumbnail}
        preload="metadata"
      />

      <div className={styles.gradTop}/>
      <div className={styles.gradBottom}/>

      {tapIcon && (
        <div className={styles.tapFlash}>
          {tapIcon === 'pause'
            ? <svg width="52" height="52" viewBox="0 0 24 24" fill="rgba(255,255,255,0.9)"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
            : <svg width="52" height="52" viewBox="0 0 24 24" fill="rgba(255,255,255,0.9)"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          }
        </div>
      )}

      {/* Top bar */}
      <div className={styles.topBar}>
        <a href="/" className={styles.topLogo}>Fri<span>Tok</span></a>
        <div className={styles.topTabs}>
          <span>Abonnements</span>
          <span className={styles.topTabActive}>Pour toi</span>
          <span>Live</span>
        </div>
        <div className={styles.topBarRight}>
          <button className={styles.muteBtn}
            onClick={e => { e.stopPropagation(); setMuted(m => !m); }}>
            {muted
              ? <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
              : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
            }
          </button>
          <button className={styles.muteBtn} onClick={handleReport} aria-label="Signaler cette vidéo" title="Signaler cette vidéo">
            <IconFlag/>
          </button>
        </div>
      </div>

      {/* Actions droite */}
      <div className={styles.actions}>
        <div className={styles.avatarWrap}>
          <div
            className={styles.avatar}
            onClick={handleOpenProfile}
            role="button"
            aria-label="Voir le profil"
          >
            {initials}
          </div>
          {!isSelf && (
            <div
              className={following ? styles.followDotActive : styles.followDot}
              onClick={handleFollow}
              role="button"
              aria-label={following ? 'Ne plus suivre' : 'Suivre'}
            >
              {following ? '✓' : '+'}
            </div>
          )}
        </div>

        {/* LIKE */}
        <button className={styles.actionBtn} onClick={handleLike}>
          <IconHeart filled={liked}/>
          <span className={liked ? styles.countLiked : styles.count}>
            {likeCount > 0 ? likeCount : ''}
          </span>
        </button>

        {/* COMMENTAIRES */}
        <button className={styles.actionBtn} onClick={handleComment}>
          <IconComment/>
          <span className={styles.count}>{commentCount > 0 ? commentCount : ''}</span>
        </button>

        {/* COMMANDER */}
        <button className={`${styles.actionBtn} ${styles.cartBtn}`} onClick={handleOrder}>
          <IconCart/>
          <span className={styles.countGold}>Shop</span>
        </button>

        {/* PARTAGER */}
        <button className={styles.actionBtn} onClick={e => e.stopPropagation()}>
          <IconShare/>
          <span className={styles.count}>{item.views > 0 ? item.views : ''}</span>
        </button>
      </div>

      {/* Bas : auteur + tags + mini-card produit */}
      <div className={styles.bottomInfo}>
        <p className={styles.username}>{item.title}</p>
        <p className={styles.tags}>{tags}</p>
        {item.product && (
          <button className={styles.productCard} onClick={handleOrder}>
            <img
              src={item.product.thumbnail || item.product.image}
              alt={item.product.name}
              className={styles.productThumb}
              onError={e => { e.currentTarget.style.display = 'none'; }}
            />
            <div className={styles.productMeta}>
              <span className={styles.productName}>{item.product.name}</span>
              <span className={styles.productPrice}>
                {Number(item.product.price).toLocaleString('fr-FR')} XOF
              </span>
            </div>
            <span className={styles.productCta}>Commander</span>
          </button>
        )}
      </div>

      {/* Modal connexion requise */}
      {authPrompt && <AuthRequiredModal onClose={() => setAuthPrompt(false)}/>}

      {/* Modal commentaires */}
      {showComments && (
        <CommentsModal
          videoId={item.id}
          authUser={authUser}
          onClose={() => setShowComments(false)}
          onAuthRequired={() => setAuthPrompt(true)}
          onSent={bumpCommentCount}
        />
      )}

      {/* Modal commande */}
      {orderProduct && (
        <OrderModal
          product={orderProduct}
          sellerId={sellerId}
          authUser={authUser}
          onClose={() => setOrderProduct(null)}
        />
      )}

      {/* Modal signalement */}
      {showReport && (
        <ReportSheet
          videoId={item.id}
          sellerId={sellerId}
          authUser={authUser}
          onClose={() => setShowReport(false)}
        />
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   SKELETON
══════════════════════════════════════════════════════════ */
function Skeleton() {
  return (
    <div className={styles.skeleton}>
      <div className={styles.skeletonPulse}/>
      <div className={styles.skeletonText}>
        <div className={styles.skeletonLine} style={{ width: '35%' }}/>
        <div className={styles.skeletonLine} style={{ width: '60%' }}/>
        <div className={styles.skeletonLine} style={{ width: '85%', height: '52px', borderRadius: '12px' }}/>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   PAGE /demo
══════════════════════════════════════════════════════════ */
function DemoPageInner() {
  const [playlist,  setPlaylist]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const feedRef = useRef(null);

  // Deep link ?video={id} — voir handleOpenProfile côté VideoSlide et
  // useProductVideo côté live.js, qui construisent ce lien depuis la
  // fiche produit d'un live. NOTE : useSearchParams() en composant client
  // demande normalement un <Suspense> englobant pour ne pas désactiver le
  // rendu statique de la page côté Next.js — sans incidence fonctionnelle
  // ici (page déjà 100% client, données chargées à l'exécution), juste un
  // avertissement de build possible selon la config Next.js du projet.
  const searchParams  = useSearchParams();
  const targetVideoId = searchParams.get('video');
  const deepLinkDoneRef  = useRef(false);
  const deepLinkFetchRef = useRef(false);

  // ⚠️ P0 — pagination (voir analyse-scalabilite-fritok.md, point 4) :
  // video_playlist n'est plus chargée en une fois sans limite. cursorSnap
  // retient le dernier document Firestore chargé pour startAfter().
  const [cursorSnap,  setCursorSnap]  = useState(null);
  const [hasMore,     setHasMore]     = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const [authUser,  setAuthUser]  = useState(null);
  const [authReady, setAuthReady] = useState(false);

  // État son GLOBAL, partagé par toutes les slides. Une fois activé
  // (clic sur l'icône), il reste activé pour la vidéo suivante au scroll.
  const [muted, setMuted] = useState(true);


  useEffect(() => {
    const unsub = onAuthStateChanged(auth, user => {
      setAuthUser(user?.emailVerified ? user : null);
      setAuthReady(true);
    });
    return unsub;
  }, []);

  // Historique des vidéos déjà vues (Firestore si connecté, localStorage sinon)
  const { seenIdsRef, seenReady, markSeen } = useSeenVideos(authUser, authReady);

  // Liste réordonnée : vidéos non-vues d'abord, vidéos déjà vues repoussées
  // en fin de liste (jamais filtrées — juste dépriorisées, comme TikTok).
  // Dépend seulement du chargement initial (playlist, seenReady) : seenIdsRef
  // étant une ref, les marquages "vu" en direct pendant le scroll ne
  // déclenchent volontairement PAS de nouveau tri (pas de saut dans le feed).
  const orderedPlaylist = useMemo(() => {
    if (!seenReady || playlist.length === 0) return playlist;
    const unseen = [];
    const seen   = [];
    for (const item of playlist) {
      (seenIdsRef.current.has(item.id) ? seen : unseen).push(item);
    }
    return [...unseen, ...seen];
  }, [playlist, seenReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // Résolution du deep link ?video={id} (ex. depuis la fiche produit d'un
  // live — voir useProductVideo dans live.js). Deux cas :
  //   1) la vidéo ciblée est déjà dans la page chargée → on scrolle
  //      directement dessus (setActiveIdx, l'effet de scroll existant
  //      s'occupe du reste) ;
  //   2) elle n'y est pas (cas courant, une seule page de PAGE_SIZE est
  //      chargée au départ) → on va la chercher ponctuellement par ID
  //      (un seul getDoc, pas de requête sur toute la collection) et on
  //      l'insère en tête de playlist pour qu'elle entre dans la fenêtre
  //      de rendu virtualisée dès que activeIdx pointe dessus.
  useEffect(() => {
    if (!targetVideoId || deepLinkDoneRef.current || orderedPlaylist.length === 0) return;

    const idx = orderedPlaylist.findIndex(v => v.id === targetVideoId);
    if (idx !== -1) {
      deepLinkDoneRef.current = true;
      setActiveIdx(idx);
      return;
    }

    if (deepLinkFetchRef.current) return; // déjà tenté, vidéo introuvable
    deepLinkFetchRef.current = true;

    (async () => {
      try {
        const snap = await getDoc(doc(db, 'video_playlist', targetVideoId));
        if (!snap.exists()) return;
        const video = {
          id: snap.id,
          ...snap.data(),
          createdAt: snap.data().createdAt?.toDate?.()?.toLocaleDateString('fr-FR') ?? '',
        };
        setPlaylist(prev => prev.some(v => v.id === video.id) ? prev : [video, ...prev]);
        // deepLinkDoneRef reste false ici : le prochain passage de cet
        // effet (déclenché par le changement de orderedPlaylist une fois
        // le nouvel élément inséré) trouvera l'index et complètera le
        // scroll.
      } catch (e) {
        console.warn('⚠️ Deep link vidéo introuvable:', e.code ?? e.message ?? e);
      }
    })();
  }, [targetVideoId, orderedPlaylist]);

  useEffect(() => {
    async function load() {
      try {
        // ⚠️ P0 — CORRIGÉ : plus de getDocs() sans limite sur toute la
        // collection video_playlist (voir point 4 de l'analyse). Première
        // page bornée à PAGE_SIZE ; le reste se charge via loadMore()
        // quand l'utilisateur approche de la fin de la liste chargée.
        const q    = query(collection(db, 'video_playlist'), orderBy('createdAt', 'desc'), limit(PAGE_SIZE));
        const snap = await getDocs(q);
        const videos = snap.docs.map(d => ({
          id: d.id,
          ...d.data(),
          createdAt: d.data().createdAt?.toDate?.()?.toLocaleDateString('fr-FR') ?? '',
        }));
        setPlaylist(videos);
        setCursorSnap(snap.docs[snap.docs.length - 1] ?? null);
        setHasMore(snap.docs.length === PAGE_SIZE);
      } catch (err) {
        console.error('Firestore:', err);
        setError('Impossible de charger les vidéos.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Page suivante de video_playlist — même requête que le chargement
  // initial, avec startAfter(cursorSnap). Appelée quand l'utilisateur
  // approche de la fin des vidéos déjà chargées (voir useEffect plus bas).
  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore || !cursorSnap) return;
    setLoadingMore(true);
    try {
      const q = query(
        collection(db, 'video_playlist'),
        orderBy('createdAt', 'desc'),
        startAfter(cursorSnap),
        limit(PAGE_SIZE)
      );
      const snap = await getDocs(q);
      const videos = snap.docs.map(d => ({
        id: d.id,
        ...d.data(),
        createdAt: d.data().createdAt?.toDate?.()?.toLocaleDateString('fr-FR') ?? '',
      }));
      setPlaylist(prev => [...prev, ...videos]);
      setCursorSnap(snap.docs[snap.docs.length - 1] ?? cursorSnap);
      setHasMore(snap.docs.length === PAGE_SIZE);
    } catch (err) {
      console.error('Firestore (page suivante):', err);
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore, cursorSnap]);

  // Déclenche le chargement de la page suivante quand il ne reste plus que
  // quelques vidéos non chargées devant l'utilisateur.
  useEffect(() => {
    if (orderedPlaylist.length === 0) return;
    if (orderedPlaylist.length - activeIdx <= 5) loadMore();
  }, [activeIdx, orderedPlaylist.length, loadMore]);

  useEffect(() => {
    if (!feedRef.current || orderedPlaylist.length === 0) return;
    const slides = feedRef.current.querySelectorAll('[data-slide]');
    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(e => {
          if (e.isIntersecting && e.intersectionRatio >= 0.55)
            setActiveIdx(Number(e.target.dataset.slide));
        });
      },
      { threshold: 0.55 }
    );
    slides.forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, [orderedPlaylist]);

  useEffect(() => {
    const onKey = e => {
      if (e.key === 'ArrowDown') setActiveIdx(i => Math.min(i + 1, orderedPlaylist.length - 1));
      if (e.key === 'ArrowUp')   setActiveIdx(i => Math.max(i - 1, 0));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [orderedPlaylist.length]);

  useEffect(() => {
    const slides = feedRef.current?.querySelectorAll('[data-slide]');
    slides?.[activeIdx]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [activeIdx]);

  if (loading) return <div className={styles.page}><Skeleton/></div>;

  if (error) return (
    <div className={styles.page}>
      <div className={styles.errorBox}>
        <p>{error}</p>
        <a href="/" className={styles.errorBack}>← Retour</a>
      </div>
    </div>
  );

  if (orderedPlaylist.length === 0) return (
    <div className={styles.page}>
      <div className={styles.errorBox}>
        <p>Aucune vidéo disponible.</p>
        <a href="/" className={styles.errorBack}>← Retour</a>
      </div>
    </div>
  );

  return (
    <div className={styles.page}>
      <div ref={feedRef} className={styles.feed}>
        {orderedPlaylist.map((item, i) => {
          // ⚠️ P0 — CORRIGÉ (voir analyse-scalabilite-fritok.md, point 1) :
          // avant, CHAQUE vidéo de la playlist montait un <VideoSlide>, donc
          // 3 à 5 listeners Firestore par vidéo — même pour les vidéos
          // jamais scrollées. Avec ne serait-ce que quelques centaines de
          // vidéos, un seul utilisateur ouvrait déjà 1000+ listeners.
          // Ici, seule une fenêtre de RENDER_WINDOW slides autour de la
          // vidéo active monte réellement <VideoSlide> (et donc ses hooks/
          // listeners) ; les autres restent un simple div vide de la même
          // taille, ce qui préserve le scroll-snap et le calcul de
          // activeIdx (IntersectionObserver sur data-slide) à l'identique.
          const shouldRender = Math.abs(i - activeIdx) <= RENDER_WINDOW;
          return (
            <div key={item.id} data-slide={i} className={styles.slideWrapper}>
              {shouldRender ? (
                <VideoSlide
                  item={item}
                  isActive={i === activeIdx}
                  authUser={authUser}
                  authReady={authReady}
                  muted={muted}
                  setMuted={setMuted}
                  markSeen={markSeen}
                />
              ) : (
                <div className={styles.slidePlaceholder}/>
              )}
            </div>
          );
        })}
      </div>

      <div className={styles.dots}>
        {orderedPlaylist.map((_, i) => (
          <button key={i}
            className={`${styles.dot} ${i === activeIdx ? styles.dotActive : ''}`}
            onClick={() => setActiveIdx(i)}
            aria-label={'Vidéo ' + (i + 1)}
          />
        ))}
      </div>

      <div className={styles.counter}>{activeIdx + 1} / {orderedPlaylist.length}</div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   EXPORT — Suspense obligatoire autour de useSearchParams()
   ── CORRIGÉ ──
   useSearchParams() (utilisé pour le deep link ?video={id}, voir
   DemoPageInner) doit être englobé par un <Suspense> en Next.js App
   Router, sinon le build de prérendu échoue avec :
     "useSearchParams() should be wrapped in a suspense boundary"
   Ce n'est pas juste un avertissement — sans ce wrapper, `next build`
   sort en erreur et bloque tout le déploiement. Le fallback reste
   minimal (fond noir identique à la page, pas de flash blanc) le
   temps que le contenu client s'hydrate.
══════════════════════════════════════════════════════════ */
export default function DemoPage() {
  return (
    <Suspense fallback={<div className={styles.page}/>}>
      <DemoPageInner/>
    </Suspense>
  );
}