'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  collection, getDocs, orderBy, query,
  addDoc, serverTimestamp, doc,
  setDoc, deleteDoc, onSnapshot,
  getCountFromServer,
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '../../lib/firebaseClient';
import styles from './demo.module.css';

/* ══════════════════════════════════════════════════════════
   CONSTANTES LIVRAISON
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
function CommentsModal({ videoId, authUser, onClose, onAuthRequired }) {
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
    const trimmed = text.trim();
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
══════════════════════════════════════════════════════════ */
function OrderModal({ product, sellerId, authUser, onClose }) {
  const [step,        setStep]        = useState('form');
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
  const [qrData,      setQrData]      = useState(null);
  const [toast,       setToast]       = useState(null);

  const prix     = Number(product?.price ?? 0);
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
    const digits = telephone.replace(/\D/g, '');
    if (!digits || digits.length < 8) e.telephone = 'Numéro invalide (min 8 chiffres)';
    if (!adresse.trim())               e.adresse   = 'Adresse obligatoire';
    if (!villeClient)                  e.ville     = 'Choisissez une ville';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const confirmer = async () => {
    if (!validate()) return;
    setSubmitting(true);
    try {
      const codeVerification = String(Math.floor(100000 + Math.random() * 900000));
      const articles = [{
        boutiqueId  : sellerId,
        imageUrl    : product?.image ?? product?.thumbnail ?? '',
        nom_frifri  : product?.name ?? '',
        prix_frifri : prix,
        ref_article : product?.productId ?? product?.refArticle ?? '',
        userIdVend  : sellerId,
      }];
      const refArticles = [product?.productId ?? product?.refArticle ?? ''];
      const payload = {
        clientId         : authUser?.uid ?? null,
        userIdVend       : sellerId,
        articles, refArticles,
        adresse          : adresse.trim(),
        villeDepart      : 'Abidjan',
        villeDestination : villeClient,
        typeLivraison    : typeLivr,
        telephoneClient  : telephone.trim(),
        clientLat        : gpsCoords?.lat ?? null,
        clientLng        : gpsCoords?.lng ?? null,
        latLivraison     : null,
        lngLivraison     : null,
        fraisLivraison   : fraisXof,
        totalXof, totalDevise: totalXof,
        devise           : 'XOF',
        modePaiement     : modePaiem === 'immediat' ? 'enLigne' : 'aLaLivraison',
        transactionId    : null,
        livreurId        : null, livreur: null, batchId: null,
        statut           : 'en_attente',
        codeVerification,
        source           : 'video_shop',
        extraData: {
          clientLat: gpsCoords?.lat ?? null, clientLng: gpsCoords?.lng ?? null,
          devise: 'XOF', fraisLivraison: fraisXof, refArticles,
          telephoneClient: telephone.trim(), userIdVend: sellerId,
          villeDepart: 'Abidjan', villeDestination: villeClient,
        },
        createdAt        : serverTimestamp(),
        updatedAt        : null,
        collecteValideeAt: null,
      };
      const docRef = await addDoc(collection(db, 'commandes'), payload);
      const cId    = docRef.id;
      const qrPayload = JSON.stringify({
        commandeId: cId, userIdVend: sellerId,
        client: telephone.trim(), adresse: adresse.trim(),
        ...(gpsCoords ? { lat: gpsCoords.lat.toFixed(6), lng: gpsCoords.lng.toFixed(6) } : {}),
        total: fmt(totalXof), ts: Date.now(),
      });
      setCommandeId(cId);
      setQrData(qrPayload);
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
                  <span>Total</span><span>{fmt(totalXof)}</span>
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
              <img
                className={styles.qrImg}
                src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(qrData)}`}
                alt="QR commande"
              />
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
              <div className={styles.fraisRow}><span>Livraison {villeClient}</span><span>{fmt(fraisXof)}</span></div>
              <div className={styles.fraisDivider}/>
              <div className={`${styles.fraisRow} ${styles.fraisTotal}`}><span>Total</span><span>{fmt(totalXof)}</span></div>
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

  // Écoute le count en temps réel (optionnel mais propre)
  useEffect(() => {
    if (!videoId) return;
    const unsub = onSnapshot(
      collection(db, 'video_playlist', videoId, 'likes'),
      snap => setCount(snap.size),
      () => {} // ignore erreur silencieusement
    );
    return unsub;
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
   HOOK : COMMENT COUNT temps réel
══════════════════════════════════════════════════════════ */
function useCommentCount(videoId, initialCount) {
  const [count, setCount] = useState(initialCount ?? 0);
  useEffect(() => {
    if (!videoId) return;
    const unsub = onSnapshot(
      collection(db, 'video_playlist', videoId, 'comments'),
      snap => setCount(snap.size),
      () => {}
    );
    return unsub;
  }, [videoId]);
  return count;
}

/* ══════════════════════════════════════════════════════════
   VIDEO SLIDE
══════════════════════════════════════════════════════════ */
function VideoSlide({ item, isActive, authUser, authReady }) {
  const videoRef  = useRef(null);
  const tapTimer  = useRef(null);
  const [playing,      setPlaying]      = useState(false);
  const [muted,        setMuted]        = useState(true);
  const [tapIcon,      setTapIcon]      = useState(null);
  const [orderProduct, setOrderProduct] = useState(null);
  const [authPrompt,   setAuthPrompt]   = useState(false);
  const [showComments, setShowComments] = useState(false);

  // Likes Firestore
  const { liked, count: likeCount, toggle: toggleLike, ready: likeReady } =
    useLike(item.id, item.likes ?? 0, authUser);

  // Comment count temps réel
  const commentCount = useCommentCount(item.id, item.comments ?? 0);

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
        <button className={styles.muteBtn}
          onClick={e => { e.stopPropagation(); setMuted(m => !m); }}>
          {muted
            ? <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
            : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
          }
        </button>
      </div>

      {/* Actions droite */}
      <div className={styles.actions}>
        <div className={styles.avatarWrap}>
          <div className={styles.avatar}>{initials}</div>
          <div className={styles.followDot}>+</div>
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
        />
      )}

      {/* Modal commande */}
      {orderProduct && (
        <OrderModal
          product={orderProduct}
          sellerId={item.userId ?? item.refArticle ?? ''}
          authUser={authUser}
          onClose={() => setOrderProduct(null)}
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
export default function DemoPage() {
  const [playlist,  setPlaylist]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const feedRef = useRef(null);

  const [authUser,  setAuthUser]  = useState(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, user => {
      setAuthUser(user?.emailVerified ? user : null);
      setAuthReady(true);
    });
    return unsub;
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const q    = query(collection(db, 'video_playlist'), orderBy('createdAt', 'desc'));
        const snap = await getDocs(q);
        const videos = snap.docs.map(d => ({
          id: d.id,
          ...d.data(),
          createdAt: d.data().createdAt?.toDate?.()?.toLocaleDateString('fr-FR') ?? '',
        }));
        setPlaylist(videos);
      } catch (err) {
        console.error('Firestore:', err);
        setError('Impossible de charger les vidéos.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  useEffect(() => {
    if (!feedRef.current || playlist.length === 0) return;
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
  }, [playlist]);

  useEffect(() => {
    const onKey = e => {
      if (e.key === 'ArrowDown') setActiveIdx(i => Math.min(i + 1, playlist.length - 1));
      if (e.key === 'ArrowUp')   setActiveIdx(i => Math.max(i - 1, 0));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [playlist.length]);

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

  if (playlist.length === 0) return (
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
        {playlist.map((item, i) => (
          <div key={item.id} data-slide={i} className={styles.slideWrapper}>
            <VideoSlide
              item={item}
              isActive={i === activeIdx}
              authUser={authUser}
              authReady={authReady}
            />
          </div>
        ))}
      </div>

      <div className={styles.dots}>
        {playlist.map((_, i) => (
          <button key={i}
            className={`${styles.dot} ${i === activeIdx ? styles.dotActive : ''}`}
            onClick={() => setActiveIdx(i)}
            aria-label={'Vidéo ' + (i + 1)}
          />
        ))}
      </div>

      <div className={styles.counter}>{activeIdx + 1} / {playlist.length}</div>
    </div>
  );
}