'use client';

import { useState, useRef, useEffect } from 'react';
import {
  collection, query, orderBy,
  onSnapshot, doc, updateDoc, increment,
  addDoc, serverTimestamp,
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '../../lib/firebaseClient';
import { useAgoraPlayer } from '../../lib/useAgoraPlayer';
import styles from './live.module.css';

/* ══════════════════════════════════════════════════════════
   CONSTANTES LIVRAISON (copiées depuis shop.js)
══════════════════════════════════════════════════════════ */
const VILLES_CI = [
  'Abidjan','Bouaké','Daloa','Korhogo','Yamoussoukro','San-Pédro',
  'Man','Divo','Gagnoa','Abengourou','Soubré','Odienné','Duekoué',
  'Bondoukou','Mankono','Séguéla','Touba','Ferkessédougou','Katiola',
  'Agboville','Adzopé','Tiassalé','Lakota','Issia','Sassandra',
];

const TARIFS = {
  'Abidjan': { 'Abidjan': 1500, 'Bouaké': 2500, default: 3000 },
  'Bouaké':  { 'Bouaké':  1500, 'Abidjan': 2500, default: 3500 },
  default:   { default: 3000 },
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
    <svg width="26" height="26" viewBox="0 0 24 24"
      fill={filled ? '#ff3c6e' : 'none'} stroke={filled ? '#ff3c6e' : '#fff'}
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
    </svg>
  );
}
function IconGift() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 12 20 22 4 22 4 12"/>
      <rect x="2" y="7" width="20" height="5"/>
      <line x1="12" y1="22" x2="12" y2="7"/>
      <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/>
      <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>
    </svg>
  );
}
function IconShare() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
    </svg>
  );
}
function IconCart() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
function IconEye() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  );
}
function IconPin() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/>
      <circle cx="12" cy="10" r="3"/>
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
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#FF6B00" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      <path d="M9 12l2 2 4-4"/>
    </svg>
  );
}
function IconUser() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
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

/* ══════════════════════════════════════════════════════════
   PETITS COMPOSANTS
══════════════════════════════════════════════════════════ */
function FieldLabel({ text }) {
  return <p className={styles.fieldLabel}>{text}</p>;
}

function ToggleOpt({ label, sub, selected, onTap }) {
  return (
    <button
      className={selected ? styles.toggleSel : styles.toggleOpt}
      onClick={onTap}
    >
      <span className={styles.toggleLabel}>{label}</span>
      <span className={styles.toggleSub}>{sub}</span>
    </button>
  );
}

function Spinner() {
  return <span className={styles.spinnerSm}/>;
}

function Toast({ msg }) {
  if (!msg) return null;
  return <div className={styles.toast}>{msg}</div>;
}

function ChatBubble({ msg }) {
  return (
    <div className={styles.chatBubble}>
      <span className={styles.chatUser}>{msg.user}</span>
      <span className={styles.chatText}>{msg.text}</span>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   MODAL : CONNEXION REQUISE (depuis shop.js AuthRequiredModal)
══════════════════════════════════════════════════════════ */
function AuthRequiredModal({ onClose, onContinue }) {
  return (
    <div className={styles.modalBackdrop} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modalSheet}>
        <div className={styles.modalHandle}/>
        <div className={styles.authModalBody}>
          <div className={styles.authIconWrap}><IconLock/></div>
          <h2 className={styles.authTitle}>Connexion requise</h2>
          <p className={styles.authSub}>
            Connectez-vous pour passer une commande sur FriTok.
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
   MODAL : COMMANDE + LIVRAISON (depuis shop.js OrderModal)
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

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

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
        articles,
        refArticles,
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
        totalXof,
        totalDevise      : totalXof,
        devise           : 'XOF',
        modePaiement     : modePaiem === 'immediat' ? 'enLigne' : 'aLaLivraison',
        transactionId    : null,
        livreurId        : null,
        livreur          : null,
        batchId          : null,
        statut           : 'en_attente',
        codeVerification,
        source           : 'live_shop',
        extraData: {
          clientLat        : gpsCoords?.lat ?? null,
          clientLng        : gpsCoords?.lng ?? null,
          devise           : 'XOF',
          fraisLivraison   : fraisXof,
          refArticles,
          telephoneClient  : telephone.trim(),
          userIdVend       : sellerId,
          villeDepart      : 'Abidjan',
          villeDestination : villeClient,
        },
        createdAt        : serverTimestamp(),
        updatedAt        : null,
        collecteValideeAt: null,
      };

      const docRef = await addDoc(collection(db, 'commandes'), payload);
      const cId    = docRef.id;

      const qrPayload = JSON.stringify({
        commandeId : cId,
        userIdVend : sellerId,
        client     : telephone.trim(),
        adresse    : adresse.trim(),
        ...(gpsCoords ? { lat: gpsCoords.lat.toFixed(6), lng: gpsCoords.lng.toFixed(6) } : {}),
        total      : fmt(totalXof),
        ts         : Date.now(),
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

        {/* Badge utilisateur connecté */}
        {step === 'form' && authUser && (
          <div className={styles.authBadge}>
            <IconUserCheck/>
            <span>Connecté : <strong>{authUser.email}</strong></span>
          </div>
        )}

        {step === 'form' && (
          <div className={styles.modalBody}>

            {/* Récap produit */}
            <div className={styles.recapCard}>
              {(product?.image || product?.thumbnail) && (
                <img className={styles.recapImg} src={product.image || product.thumbnail} alt=""/>
              )}
              <div className={styles.recapInfo}>
                <p className={styles.recapName}>{product?.name}</p>
                <p className={styles.recapPrice}>{fmt(prix)}</p>
              </div>
            </div>

            {/* Type livraison */}
            <FieldLabel text="TYPE DE LIVRAISON"/>
            <div className={styles.toggleRow}>
              <ToggleOpt label="Solo"    sub="Livreur dédié"    selected={typeLivr === 'solo'}    onTap={() => setTypeLivr('solo')}/>
              <ToggleOpt label="Groupée" sub="Tournée partagée" selected={typeLivr === 'groupee'} onTap={() => setTypeLivr('groupee')}/>
            </div>

            {/* Mode paiement */}
            <FieldLabel text="MODE DE PAIEMENT"/>
            <div className={styles.toggleRow}>
              <ToggleOpt label="À la livraison" sub="Cash"               selected={modePaiem === 'livraison'} onTap={() => setModePaiem('livraison')}/>
              <ToggleOpt label="En ligne"        sub="Paiement sécurisé" selected={modePaiem === 'immediat'}  onTap={() => setModePaiem('immediat')}/>
            </div>

            {/* Téléphone */}
            <FieldLabel text="TÉLÉPHONE DE CONTACT"/>
            <input
              className={`${styles.formInput}${errors.telephone ? ' ' + styles.inputErr : ''}`}
              type="tel" placeholder="07 XX XX XX XX"
              value={telephone} onChange={e => setTelephone(e.target.value)}
            />
            {errors.telephone && <p className={styles.errMsg}>{errors.telephone}</p>}

            {/* Ville */}
            <FieldLabel text="VILLE DE LIVRAISON"/>
            <select
              className={`${styles.formInput}${errors.ville ? ' ' + styles.inputErr : ''}`}
              value={villeClient} onChange={e => setVilleClient(e.target.value)}
            >
              <option value="">Sélectionnez votre ville…</option>
              {VILLES_CI.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            {errors.ville && <p className={styles.errMsg}>{errors.ville}</p>}

            {/* Récap frais */}
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

            {/* Adresse */}
            <FieldLabel text="ADRESSE DE LIVRAISON"/>
            <textarea
              className={`${styles.formInput} ${styles.formTextarea}${errors.adresse ? ' ' + styles.inputErr : ''}`}
              placeholder="Quartier, rue, point de repère…"
              value={adresse} onChange={e => setAdresse(e.target.value)} rows={2}
            />
            {errors.adresse && <p className={styles.errMsg}>{errors.adresse}</p>}

            {/* GPS */}
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

            {/* Confirmer */}
            <button className={styles.confirmBtn} onClick={confirmer} disabled={submitting}>
              {submitting
                ? <Spinner/>
                : modePaiem === 'immediat'
                  ? `Payer ${fmt(totalXof)}`
                  : 'Commander — payer à la livraison'
              }
            </button>
          </div>
        )}

        {/* ── QR CODE ── */}
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

        <Toast msg={toast}/>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   PLAYER LIVE PLEIN ÉCRAN
══════════════════════════════════════════════════════════ */
const DEMO_CHAT = [
  { id: 1, user: '@marie_ci', text: "C'est magnifique !" },
  { id: 2, user: '@kofi',     text: 'Disponible en rouge ?' },
  { id: 3, user: '@aminata',  text: 'Le prix svp' },
  { id: 4, user: '@alex_abj', text: "J'adore ce produit !" },
  { id: 5, user: '@cisse',    text: 'Livraison a Yopougon ?' },
];

function LivePlayer({ session, authUser, authReady, onClose }) {
  const { videoContainerRef, remoteUsers, status, error: agoraError } =
    useAgoraPlayer(session.channelId, session.isLive);

  const [liked,        setLiked]        = useState(false);
  const [likeCount,    setLikeCount]    = useState(session.likeCount ?? 0);
  const [activeProduct,setActiveProduct]= useState(session.products?.[0] ?? null);
  const [messages,     setMessages]     = useState([]);
  const [inputMsg,     setInputMsg]     = useState('');
  const [orderProduct, setOrderProduct] = useState(null);  // → ouvre OrderModal
  const [authPrompt,   setAuthPrompt]   = useState(false); // → ouvre AuthRequiredModal
  const chatRef  = useRef(null);
  const msgIdRef = useRef(10);

  // Simulated chat
  useEffect(() => {
    setMessages(DEMO_CHAT.slice(0, 2));
    const timers = DEMO_CHAT.slice(2).map((m, i) =>
      setTimeout(() => setMessages(p => [...p.slice(-9), m]), (i + 1) * 3800)
    );
    return () => timers.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  // Clic Commander — même logique que shop.js handleOrder
  const handleOrder = (product) => {
    if (!authReady) return;
    if (!authUser) {
      setAuthPrompt(true);
    } else {
      setOrderProduct(product);
    }
  };

  const handleLike = async () => {
    setLiked(v => !v);
    setLikeCount(c => liked ? c - 1 : c + 1);
    try {
      await updateDoc(doc(db, 'live_sessions', session.id), {
        likeCount: increment(liked ? -1 : 1),
      });
    } catch (_) {}
  };

  const sendMessage = () => {
    const text = inputMsg.trim();
    if (!text) return;
    setMessages(p => [...p.slice(-9), { id: msgIdRef.current++, user: '@vous', text }]);
    setInputMsg('');
  };

  const initial  = (session.sellerName || 'V')[0].toUpperCase();
  const products = session.products ?? [];
  const hasVideo = status === 'live' && remoteUsers.length > 0;

  const offlineLabel = {
    'fetching-token': 'Authentification...',
    'connecting':     'Connexion au live...',
    'live':           'En attente du vendeur...',
    'error':          'Erreur : ' + (agoraError ?? 'inconnue'),
    'offline':        'Ce live est terminé',
    'idle':           '...',
  }[status] ?? '...';

  return (
    <div className={styles.playerPage}>

      {/* Agora video */}
      <div ref={videoContainerRef} className={styles.agoraVideo}/>

      {/* Fallback */}
      {!hasVideo && (
        <div className={styles.playerBg}>
          <div className={styles.offlineCover}>
            {products[0]?.image && <img src={products[0].image} alt="" className={styles.offlineImg}/>}
            <div className={styles.offlineOverlay}/>
            <div className={styles.offlineLabel}>{offlineLabel}</div>
          </div>
        </div>
      )}

      <div className={styles.playerGradTop}/>
      <div className={styles.playerGradBottom}/>

      {/* Header */}
      <div className={styles.playerHeader}>
        <div className={styles.playerHost}>
          <div className={styles.playerAvatar}>{initial}</div>
          <div>
            <div className={styles.playerHostName}>{session.sellerName || 'Vendeur'}</div>
            <div className={styles.playerViewers}><IconEye/> {session.viewerCount ?? 0} spectateurs</div>
          </div>
          <button className={styles.followBtn}>Suivre</button>
        </div>
        <div className={styles.playerHeaderRight}>
          {session.isLive
            ? <span className={styles.liveIndicator}>LIVE</span>
            : <span className={styles.replayLabel}>TERMINÉ</span>
          }
          <button className={styles.closeBtn} onClick={onClose}><IconClose/></button>
        </div>
      </div>

      {/* Actions droite */}
      <div className={styles.playerActions}>
        <button className={styles.playerActionBtn} onClick={handleLike}>
          <IconHeart filled={liked}/>
          <span className={liked ? styles.countLiked : styles.countWhite}>{likeCount > 0 ? likeCount : ''}</span>
        </button>
        <button className={styles.playerActionBtn}>
          <IconGift/>
          <span className={styles.countGold}>{session.giftCount > 0 ? session.giftCount : ''}</span>
        </button>
        <button className={styles.playerActionBtn}>
          <IconShare/>
        </button>
      </div>

      {/* Chat */}
      <div className={styles.chatArea} ref={chatRef}>
        {messages.map(m => <ChatBubble key={m.id} msg={m}/>)}
      </div>
      <div className={styles.chatInput}>
        <input
          className={styles.chatField}
          placeholder="Écrire un commentaire…"
          value={inputMsg}
          onChange={e => setInputMsg(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && sendMessage()}
        />
        <button className={styles.chatSend} onClick={sendMessage}>↑</button>
      </div>

      {/* Carousel produits avec bouton Commander sur chaque tuile */}
      {products.length > 0 && (
        <div className={styles.productCarousel}>
          <div className={styles.carouselLabel}>Produits ({products.length})</div>
          <div className={styles.carouselTrack}>
            {products.map((p, i) => {
              const isActive = activeProduct?.productId === p.productId;
              return (
                <div key={p.productId ?? i} className={isActive ? styles.carouselItemActive : styles.carouselItem}>
                  <div className={styles.carouselImgWrap} onClick={() => setActiveProduct(p)}>
                    <img src={p.image} alt={p.name} className={styles.carouselImg}
                      onError={e2 => { e2.currentTarget.style.display = 'none'; }}/>
                    {isActive && <div className={styles.carouselActiveDot}/>}
                  </div>
                  <span className={styles.carouselName}>{p.name}</span>
                  <span className={styles.carouselPrice}>{Number(p.price).toLocaleString('fr-FR')} F</span>
                  <button
                    className={styles.carouselOrderBtn}
                    onClick={() => handleOrder(p)}
                  >
                    Commander
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Modal connexion requise */}
      {authPrompt && (
        <AuthRequiredModal
          onClose={() => setAuthPrompt(false)}
          onContinue={() => setAuthPrompt(false)}
        />
      )}

      {/* Modal commande + livraison */}
      {orderProduct && (
        <OrderModal
          product={orderProduct}
          sellerId={session.userId ?? session.sellerId ?? ''}
          authUser={authUser}
          onClose={() => setOrderProduct(null)}
        />
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   LIVE CARD (liste)
══════════════════════════════════════════════════════════ */
const GRADIENTS = [
  'linear-gradient(135deg,#1e3a5f,#0d1b2a)',
  'linear-gradient(135deg,#3d1a4f,#1a0d2e)',
  'linear-gradient(135deg,#4f2d0d,#2e1a0d)',
  'linear-gradient(135deg,#0d3a2e,#0a1e1a)',
  'linear-gradient(135deg,#3a1a1a,#1a0d0d)',
];

function LiveCard({ session, onSelect }) {
  const firstProduct = session.products?.[0];
  const initial  = (session.sellerName || 'L')[0].toUpperCase();
  const gradient = GRADIENTS[(session.channelId?.charCodeAt(5) ?? 0) % GRADIENTS.length];
  return (
    <div className={styles.liveCard} onClick={() => onSelect(session)}>
      <div className={styles.liveThumb} style={{ background: gradient }}>
        {firstProduct?.image && (
          <img src={firstProduct.image} alt="" className={styles.liveThumbImg}
            onError={e => { e.currentTarget.style.display = 'none'; }}/>
        )}
        {session.isLive
          ? <span className={styles.liveBadge}>LIVE</span>
          : <span className={styles.replayBadge}>REPLAY</span>
        }
        <span className={styles.viewerBadge}><IconEye/> {session.viewerCount ?? 0}</span>
      </div>
      <div className={styles.liveInfo}>
        <div className={styles.liveAvatar}>{initial}</div>
        <div className={styles.liveMeta}>
          <div className={styles.liveSellerName}>{session.sellerName || 'Vendeur'}</div>
          <div className={styles.liveProductCount}>
            {session.products?.length ?? 0} produit{session.products?.length !== 1 ? 's' : ''}
          </div>
        </div>
        <div className={styles.liveLikes}>
          <IconHeart filled={false}/>
          <span>{session.likeCount ?? 0}</span>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   SKELETON
══════════════════════════════════════════════════════════ */
function Skeleton() {
  return (
    <div className={styles.skeletonGrid}>
      {[1,2,3,4].map(i => (
        <div key={i} className={styles.skeletonCard}>
          <div className={styles.skeletonThumb}/>
          <div className={styles.skeletonInfo}>
            <div className={styles.skeletonLine} style={{ width: '40%' }}/>
            <div className={styles.skeletonLine} style={{ width: '65%' }}/>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   PAGE /live
══════════════════════════════════════════════════════════ */
export default function LivePage() {
  const [sessions,  setSessions]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);
  const [selected,  setSelected]  = useState(null);
  const [filter,    setFilter]    = useState('all');

  // Auth state — même pattern que shop.js
  const [authUser,  setAuthUser]  = useState(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, user => {
      setAuthUser(user?.emailVerified ? user : null);
      setAuthReady(true);
    });
    return unsub;
  }, []);

  // Firestore live_sessions
  useEffect(() => {
    const q = query(collection(db, 'live_sessions'), orderBy('startedAt', 'desc'));
    const unsub = onSnapshot(q,
      snap => {
        setSessions(snap.docs.map(d => ({
          id: d.id,
          ...d.data(),
          startedAt: d.data().startedAt?.toDate?.()?.toLocaleDateString('fr-FR') ?? '',
        })));
        setLoading(false);
      },
      err => { console.error(err); setError('Impossible de charger les lives.'); setLoading(false); }
    );
    return () => unsub();
  }, []);

  if (selected) {
    return (
      <LivePlayer
        session={selected}
        authUser={authUser}
        authReady={authReady}
        onClose={() => setSelected(null)}
      />
    );
  }

  const liveCount   = sessions.filter(s => s.isLive).length;
  const replayCount = sessions.filter(s => !s.isLive).length;
  const filtered    = sessions.filter(s => {
    if (filter === 'live')   return s.isLive === true;
    if (filter === 'replay') return s.isLive === false;
    return true;
  });

  return (
    <div className={styles.page}>
      <nav className={styles.nav}>
        <a href="/" className={styles.navLogo}>Fri<span>Tok</span></a>
        <span className={styles.navTitle}>Lives</span>
        <a href="/demo" className={styles.navLink}>Vidéos</a>
      </nav>
      <div className={styles.content}>
        <div className={styles.filters}>
          {[
            { key: 'all',    label: 'Tout (' + sessions.length + ')' },
            { key: 'live',   label: 'En direct (' + liveCount + ')' },
            { key: 'replay', label: 'Replays (' + replayCount + ')' },
          ].map(f => (
            <button key={f.key}
              className={filter === f.key ? styles.filterActive : styles.filterBtn}
              onClick={() => setFilter(f.key)}>
              {f.label}
            </button>
          ))}
        </div>
        {loading && <Skeleton/>}
        {error && (
          <div className={styles.errorBox}>
            <p>{error}</p>
            <a href="/" className={styles.errorBack}>Retour</a>
          </div>
        )}
        {!loading && !error && filtered.length === 0 && (
          <div className={styles.emptyBox}><p>Aucun live pour ce filtre.</p></div>
        )}
        {!loading && !error && filtered.length > 0 && (
          <div className={styles.grid}>
            {filtered.map(s => (
              <LiveCard key={s.id} session={s} onSelect={setSelected}/>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
