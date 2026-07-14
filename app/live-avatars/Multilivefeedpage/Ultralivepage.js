'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  doc, collection, query, orderBy, limit, onSnapshot,
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '../lib/firebaseClient';
import { productFromMap } from './product';
import AvatarVideoPlayer from './AvatarVideoPlayer';
import styles from './ultraLive.module.css';
import {
  joinAvatarSession, leaveAvatarSession,
  pauseAvatarSession, resumeAvatarSession,
  likeAvatarSession, commentAvatarSession, reactAvatarSession,
} from '../lib/avatarSessionApi';
import { addToPanier } from '../lib/panierApi';

// ⚠️ IMPORTANT — voir firestore.rules, section `/live_avatar_sessions/{sessionId}` :
// le document de session ET TOUTES ses sous-collections (viewers, likes,
// comments, reactions, clicks) sont `allow create, update, delete: if false`
// pour le client. Toute écriture passe désormais par la Netlify Function
// `avatar-viewer-track` (Admin SDK, qui n'est pas soumis aux security
// rules) — voir `lib/avatarSessionApi.js`. Le client ne fait plus que de
// la LECTURE temps réel ici (onSnapshot), et cette lecture elle-même
// exige `isAuth()` : ce composant a donc besoin d'un utilisateur Firebase
// authentifié (anonyme ou non) pour fonctionner, y compris juste pour
// regarder le live.

// Nombre de commentaires synchronisés en temps réel — même logique que
// LIVE_CHAT_LIMIT dans live.js : jamais d'onSnapshot non borné sur une
// sous-collection qui peut grossir indéfiniment pendant un live.
const COMMENT_LIMIT = 20;

/* ─────────────────────────────────────────────
   Icônes (mêmes conventions que live.js : SVG inline, pas de lib d'icônes)
───────────────────────────────────────────── */
function IconEye() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
function IconHeart({ filled }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill={filled ? '#FF6B9D' : 'none'} stroke={filled ? '#FF6B9D' : 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}
function IconShare() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  );
}
function IconGift() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 12 20 22 4 22 4 12" /><rect x="2" y="7" width="20" height="5" />
      <line x1="12" y1="22" x2="12" y2="7" /><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" />
      <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
    </svg>
  );
}
function IconClose() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
function IconSend() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" />
    </svg>
  );
}
function IconChevron({ dir = 'left' }) {
  const points = dir === 'left' ? '15 18 9 12 15 6' : '9 18 15 12 9 6';
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points={points} />
    </svg>
  );
}
function IconImageOff() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="2" y1="2" x2="22" y2="22" /><path d="M10.41 10.41a2 2 0 1 1-2.83-2.83" />
      <path d="M13.5 13.5 21 21" /><path d="M2 8V6a2 2 0 0 1 2-2h12" />
      <path d="M22 16v2a2 2 0 0 1-2 2H6" />
    </svg>
  );
}

const fmtCount = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`);

/* ─────────────────────────────────────────────
   Toast (même pattern que live.js)
───────────────────────────────────────────── */
function useToast() {
  const [msg, setMsg] = useState(null);
  const timerRef = useRef(null);
  const show = useCallback((text, ms = 3000) => {
    setMsg(text);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setMsg(null), ms);
  }, []);
  useEffect(() => () => clearTimeout(timerRef.current), []);
  return [msg, show];
}

/* ─────────────────────────────────────────────
   UltraLivePage
───────────────────────────────────────────── */
// `viewerId` est conservé pour compatibilité d'API avec l'appelant, mais
// n'est plus utilisé pour les écritures : avatar-viewer-track dérive
// désormais le uid réel du token Firebase envoyé en Authorization, pas
// d'une valeur fournie par le client.
export default function UltraLivePage({ sessionId, viewerId, isActive }) {
  const sessionRef = doc(db, 'live_avatar_sessions', sessionId);

  // undefined = en cours de résolution, null = pas connecté, objet = connecté
  const [authUser, setAuthUser] = useState(undefined);
  const [sessionData, setSessionData] = useState(null);
  const [comments, setComments] = useState([]);
  const [commentInput, setCommentInput] = useState('');
  const [hearts, setHearts] = useState([]);
  const [likeLocked, setLikeLocked] = useState(false);
  const [activeProductIndex, setActiveProductIndex] = useState(0);
  const [zoomIndex, setZoomIndex] = useState(null); // index dans products, ou null
  const [currency, setCurrency] = useState('XOF');
  const [toastMsg, showToast] = useToast();

  const exchangeRates = { XOF: 1 }; // même point d'extension que le _exchangeRates Dart
  const convertPrice = (price) => Number(price) * (exchangeRates[currency] ?? 1);

  // ── Auth : `read: isAuth()` s'applique à toute la collection ──
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => setAuthUser(user));
    return unsub;
  }, []);

  // ── Écoute du document de session (nécessite authUser) ────────
  useEffect(() => {
    if (!authUser) return;
    const unsub = onSnapshot(sessionRef, (snap) => {
      setSessionData(snap.exists() ? snap.data() : null);
    }, (err) => console.warn('⚠️ session listener:', err));
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, authUser]);

  // ── Rejoint / quitte la session via la Netlify Function
  //    avatar-viewer-track — plus aucune écriture Firestore directe ici
  //    (voir note plus haut).
  useEffect(() => {
    if (!authUser) return;
    let joined = false;

    joinAvatarSession(sessionId)
      .then(() => { joined = true; })
      .catch((e) => console.warn('⚠️ joinAvatarSession:', e.message));

    return () => {
      if (joined) leaveAvatarSession(sessionId).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, authUser]);

  // ── Pause/reprise : pilotée par `isActive`, comme le
  //    _onPause/_onResume Flutter au changement d'onglet.
  useEffect(() => {
    if (!authUser) return;
    const call = isActive ? resumeAvatarSession : pauseAvatarSession;
    call(sessionId).catch((e) => console.warn('⚠️ pause/resume:', e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, authUser]);

  // ── Commentaires : derniers COMMENT_LIMIT, temps réel (lecture
  //    seule — l'écriture passe par commentAvatarSession ci-dessous) ─
  useEffect(() => {
    if (!authUser) return;
    const q = query(
      collection(sessionRef, 'comments'),
      orderBy('time', 'desc'),
      limit(COMMENT_LIMIT)
    );
    const unsub = onSnapshot(q, (snap) => {
      setComments(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }, (err) => console.warn('⚠️ comments listener:', err));
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, authUser]);

  const currentProducts = (sessionData?.products ?? []).map(productFromMap);
  const activeProductId = currentProducts[activeProductIndex]?.productId ?? null;

  // ── Like : anti-spam 500ms + cœur flottant, comme _sendLike.
  //    L'incrément du compteur `likes` est fait côté serveur par
  //    avatar-viewer-track (le doc de session est verrouillé en écriture
  //    pour le client) — on ne fait plus qu'appeler l'action et espérer
  //    la mise à jour temps réel via le listener de session ci-dessus.
  const sendLike = () => {
    if (likeLocked || !authUser) return;
    setLikeLocked(true);
    if (navigator.vibrate) navigator.vibrate(10);
    likeAvatarSession(sessionId).catch((e) => console.warn('⚠️ likeAvatarSession:', e.message));
    spawnHeart();
    setTimeout(() => setLikeLocked(false), 500);
  };

  const spawnHeart = () => {
    const id = `${Date.now()}-${Math.random()}`;
    const right = 24 + Math.random() * 36;
    setHearts((h) => [...h, { id, right }]);
    setTimeout(() => {
      setHearts((h) => h.filter((x) => x.id !== id));
    }, 1800);
  };

  const sendComment = () => {
    const text = commentInput.trim();
    if (!text || !authUser) return;
    setCommentInput('');
    commentAvatarSession(sessionId, text).catch((e) => {
      console.warn('⚠️ commentAvatarSession:', e.message);
      showToast("Échec de l'envoi du commentaire");
    });
  };

  // NOTE : le schéma de avatar-viewer-track documenté dans firestore.rules
  // ne liste pas d'action dédiée "gift" (seulement join/leave/pause/
  // resume/heartbeat/like/comment/reaction/click) — les cadeaux sont donc
  // envoyés ici comme une "reaction" taguée par son emoji. Si les cadeaux
  // doivent être comptés/affichés séparément des réactions côté vendeur,
  // il faut ajouter une action `gift` (et éventuellement une sous-
  // collection dédiée) côté Netlify Function plutôt que de les confondre.
  const sendGift = (gift) => {
    if (!authUser) return;
    reactAvatarSession(sessionId, gift).catch((e) => console.warn('⚠️ sendGift:', e.message));
  };

  // ── Partage — même URL Next.js /liveAvatar + mêmes UTM que le Dart ─
  const shareLive = (sellerId, productId) => {
    const params = new URLSearchParams({
      sessionId,
      sellerId: sellerId ?? '',
      ref: 'share',
      utm_source: 'social',
      utm_medium: 'social',
      utm_campaign: 'avatar_live',
    });
    if (productId) params.set('productId', productId);

    const url = `https://fritok.net/liveAvatar?${params.toString()}`;
    const shareText = productId
      ? `🛍️ Découvrez ce produit en live !\n👉 ${url}`
      : `🎬 Live Shopping en direct !\n🛍️ Produits exclusifs en temps réel\n👉 Rejoins-moi : ${url}`;

    if (navigator.share) {
      navigator.share({ title: '🎬 Live Shopping en direct sur FriTok !', text: shareText, url }).catch(() => {});
    } else {
      navigator.clipboard?.writeText(shareText).then(
        () => showToast('Lien copié dans le presse-papiers'),
        () => showToast('Impossible de partager', 3000)
      );
    }
  };

  // Ajout au panier via la Netlify Function `add-to-panier` (Admin SDK) —
  // voir netlify/functions/add-to-panier.js et lib/panierApi.js. `panier`
  // n'a pas de règle Firestore d'écriture cliente, donc plus d'`addDoc`
  // direct ici.
  const buyProduct = async (product) => {
    if (!auth.currentUser) {
      showToast('Connexion requise pour acheter');
      return;
    }
    try {
      await addToPanier(product);
      showToast(`${product.name} ajouté au panier 🛍️`);
    } catch (e) {
      showToast(e.message || "Erreur lors de l'ajout au panier");
    }
  };

  if (authUser === undefined) {
    return (
      <div className={styles.loaderScreen}>
        <span className={styles.videoSpinner} />
      </div>
    );
  }

  if (authUser === null) {
    return (
      <div className={styles.endedScreen}>
        <div className={styles.endedIconWrap}><IconEye /></div>
        <p className={styles.endedTitle}>Connexion requise</p>
        <p className={styles.endedSub}>Connectez-vous pour regarder ce live.</p>
        <a href="/login" className={styles.zoomBuyBtn} style={{ position: 'static', marginTop: 16, display: 'inline-block', textDecoration: 'none', textAlign: 'center' }}>
          Se connecter
        </a>
      </div>
    );
  }

  if (sessionData === null) {
    return (
      <div className={styles.loaderScreen}>
        <span className={styles.videoSpinner} />
      </div>
    );
  }

  if (sessionData.isLive !== true) {
    return (
      <div className={styles.endedScreen}>
        <div className={styles.endedIconWrap}><IconClose /></div>
        <p className={styles.endedTitle}>Live terminé</p>
        <p className={styles.endedSub}>Ce live n'est plus disponible</p>
      </div>
    );
  }

  const videoUrl = sessionData.avatarVideoUrl ?? '';
  const viewers = sessionData.viewerCount ?? 0;
  const likes = sessionData.likes ?? 0;
  const sellerId = sessionData.sellerId ?? '';

  return (
    <div className={styles.page} onClick={() => document.activeElement?.blur?.()}>
      {/* ── Vidéo plein écran ─────────────────── */}
      <div className={styles.videoLayer}>
        <AvatarVideoPlayer videoUrl={videoUrl} isActive={isActive} />
      </div>

      <div className={styles.gradTop} />
      <div className={styles.gradBottom} />

      {/* ── Header HUD ────────────────────────── */}
      <div className={styles.header}>
        <LiveBadge />
        <div className={styles.spacer} />
        <StatChip icon={<IconEye />} value={viewers} />
        <StatChip icon={<IconHeart filled />} value={likes} />
        <GlassBtn icon={<IconShare />} onClick={() => shareLive(sellerId, activeProductId)} />
      </div>

      {/* ── Chat ──────────────────────────────── */}
      <div className={styles.chatArea}>
        {[...comments].reverse().map((c) => (
          <ChatBubble key={c.id} user={c.viewerId ?? 'user'} text={c.text ?? ''} />
        ))}
      </div>

      {/* ── Action rail ───────────────────────── */}
      <div className={styles.actionRail}>
        <RailItem icon={<IconHeart filled />} label="J'aime" color="#FF6B9D" onClick={sendLike} />
        <RailItem icon={<IconShare />} label="Partager" color="#FFF0DC" onClick={() => shareLive(sellerId, activeProductId)} />
        <RailItem icon={<IconGift />} label="Cadeau" color="#FFB700" onClick={() => sendGift('🎁')} />
      </div>

      {/* ── Cœurs flottants ───────────────────── */}
      {hearts.map((h) => (
        <FloatingHeart key={h.id} right={h.right} />
      ))}

      {/* ── Bande produits ────────────────────── */}
      {currentProducts.length > 0 && (
        <ProductStrip
          products={currentProducts}
          activeIndex={activeProductIndex}
          currency={currency}
          convertPrice={convertPrice}
          onSelect={setActiveProductIndex}
          onBuy={buyProduct}
          onShare={(p) => shareLive(sellerId, p.productId)}
          onZoom={(i) => setZoomIndex(i)}
        />
      )}

      {/* ── Saisie commentaire ────────────────── */}
      <div className={styles.commentInputWrap} onClick={(e) => e.stopPropagation()}>
        <input
          className={styles.commentField}
          placeholder="Écrire un commentaire…"
          value={commentInput}
          onChange={(e) => setCommentInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendComment()}
        />
        <button className={styles.commentSend} onClick={sendComment}>
          <IconSend />
        </button>
      </div>

      {/* ── Zoom produit ──────────────────────── */}
      {zoomIndex !== null && (
        <ProductZoomViewer
          products={currentProducts}
          startIndex={zoomIndex}
          currency={currency}
          convertPrice={convertPrice}
          onClose={() => setZoomIndex(null)}
          onBuy={buyProduct}
          onShare={(p) => shareLive(sellerId, p.productId)}
        />
      )}

      {toastMsg && <div className={styles.toast}>{toastMsg}</div>}
    </div>
  );
}

/* ─────────────────────────────────────────────
   Sous-composants
───────────────────────────────────────────── */
function LiveBadge() {
  return (
    <div className={styles.liveBadge}>
      <span className={styles.liveDot} />
      LIVE
    </div>
  );
}

function StatChip({ icon, value }) {
  return (
    <div className={styles.statChip}>
      {icon}
      <span>{fmtCount(value)}</span>
    </div>
  );
}

function GlassBtn({ icon, onClick }) {
  return (
    <button className={styles.glassBtn} onClick={onClick}>
      {icon}
    </button>
  );
}

function ChatBubble({ user, text }) {
  const initial = user ? user[0].toUpperCase() : '?';
  const shortUser = (user ?? '').slice(0, 8);
  return (
    <div className={styles.chatBubble}>
      <span className={styles.chatAvatar}>{initial}</span>
      <span>
        <span className={styles.chatUser}>{shortUser}</span>{' '}
        <span className={styles.chatText}>{text}</span>
      </span>
    </div>
  );
}

function RailItem({ icon, label, color, onClick }) {
  return (
    <button className={styles.railItem} onClick={onClick}>
      <span className={styles.railIconWrap} style={{ borderColor: `${color}4d`, color }}>
        {icon}
      </span>
      <span className={styles.railLabel}>{label}</span>
    </button>
  );
}

function FloatingHeart({ right }) {
  return (
    <div className={styles.floatingHeart} style={{ right }}>
      <IconHeart filled />
    </div>
  );
}

/* ─────────────────────────────────────────────
   Bande produits horizontale
───────────────────────────────────────────── */
function ProductStrip({ products, activeIndex, currency, convertPrice, onSelect, onBuy, onShare, onZoom }) {
  return (
    <div className={styles.productStrip} onClick={(e) => e.stopPropagation()}>
      {products.map((p, i) => (
        <MiniProductCard
          key={p.productId || i}
          product={p}
          isActive={i === activeIndex}
          currency={currency}
          convertPrice={convertPrice}
          onSelect={() => onSelect(i)}
          onBuy={() => onBuy(p)}
          onShare={() => onShare(p)}
          onZoom={() => onZoom(i)}
        />
      ))}
    </div>
  );
}

function MiniProductCard({ product, isActive, currency, convertPrice, onSelect, onBuy, onShare, onZoom }) {
  return (
    <div
      className={isActive ? styles.miniCardActive : styles.miniCard}
      onClick={onSelect}
    >
      <div className={styles.miniThumb} onClick={(e) => { e.stopPropagation(); onZoom(); }}>
        {product.imageUrl ? (
          <img src={product.imageUrl} alt={product.name} />
        ) : (
          <IconImageOff />
        )}
      </div>
      <div className={styles.miniInfo}>
        <p className={styles.miniName}>{product.name}</p>
        <p className={isActive ? styles.miniPriceActive : styles.miniPrice}>
          {convertPrice(product.price).toFixed(0)} {currency}
        </p>
        <div className={styles.miniActions}>
          <button
            className={isActive ? styles.miniBuyActive : styles.miniBuy}
            onClick={(e) => { e.stopPropagation(); onBuy(); }}
          >
            Acheter
          </button>
          <button className={styles.miniShare} onClick={(e) => { e.stopPropagation(); onShare(); }}>
            <IconShare />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Zoom produit plein écran
───────────────────────────────────────────── */
function ProductZoomViewer({ products, startIndex, currency, convertPrice, onClose, onBuy, onShare }) {
  const [index, setIndex] = useState(startIndex);
  const product = products[index];

  const goPrev = () => setIndex((i) => (i - 1 + products.length) % products.length);
  const goNext = () => setIndex((i) => (i + 1) % products.length);

  return (
    <div className={styles.zoomOverlay} onClick={(e) => e.stopPropagation()}>
      <div className={styles.zoomImageWrap}>
        {product.imageUrl ? (
          <img src={product.imageUrl} alt={product.name} className={styles.zoomImage} />
        ) : (
          <IconImageOff />
        )}
        {products.length > 1 && (
          <>
            <button className={`${styles.zoomNav} ${styles.zoomNavLeft}`} onClick={goPrev}>
              <IconChevron dir="left" />
            </button>
            <button className={`${styles.zoomNav} ${styles.zoomNavRight}`} onClick={goNext}>
              <IconChevron dir="right" />
            </button>
          </>
        )}
      </div>

      <div className={styles.zoomTopBar}>
        <span className={styles.zoomName}>{product.name}</span>
        <button className={styles.zoomIconBtn} onClick={() => onShare(product)}>
          <IconShare />
        </button>
        <button className={styles.zoomIconBtn} onClick={onClose}>
          <IconClose />
        </button>
      </div>

      {products.length > 1 && (
        <div className={styles.zoomDots}>
          {products.slice(0, 8).map((_, i) => (
            <span key={i} className={i === index ? styles.zoomDotActive : styles.zoomDot} />
          ))}
        </div>
      )}

      <button className={styles.zoomBuyBtn} onClick={() => onBuy(product)}>
        Acheter · {convertPrice(product.price).toFixed(0)} {currency}
      </button>
    </div>
  );
}