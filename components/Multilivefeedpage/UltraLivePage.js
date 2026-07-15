'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  doc, collection, query, orderBy, limit, onSnapshot,
  getDoc, getDocs, where,
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import QRCode from 'qrcode';
import { db, auth } from '@/lib/firebaseClient';
import { productFromMap } from './product';
import AvatarVideoPlayer from './AvatarVideoPlayer';
import styles from './ultraLive.module.css';
import {
  joinAvatarSession, leaveAvatarSession,
  pauseAvatarSession, resumeAvatarSession,
  likeAvatarSession, commentAvatarSession, reactAvatarSession,
} from '../../lib/avatarSessionApi';

const COMMENT_LIMIT = 20;

const COUNTRIES = {
  CI: {
    label: "Côte d'Ivoire",
    currency: 'XOF',
    hub: 'Abidjan',
    villes: [
      'Abidjan', 'Bouaké', 'Daloa', 'Korhogo', 'Yamoussoukro', 'San-Pédro',
      'Man', 'Divo', 'Gagnoa', 'Abengourou', 'Soubré', 'Odienné', 'Duekoué',
      'Bondoukou', 'Mankono', 'Séguéla', 'Touba', 'Ferkessédougou', 'Katiola',
      'Agboville', 'Adzopé', 'Tiassalé', 'Lakota', 'Issia', 'Sassandra',
    ],
    tarifs: {
      'Abidjan': { 'Abidjan': 1500, 'Bouaké': 2500, default: 3000 },
      'Bouaké': { 'Bouaké': 1500, 'Abidjan': 2500, default: 3500 },
      default: { default: 3000 },
    },
    fallback: 8000,
  },
  SN: {
    label: 'Sénégal',
    currency: 'XOF',
    hub: 'Dakar',
    villes: ['Dakar', 'Thiès', 'Rufisque', 'Mbour', 'Saint-Louis', 'Kaolack', 'Ziguinchor', 'Touba', 'Diourbel', 'Louga', 'Tambacounda', 'Kolda'],
    tarifs: { 'Dakar': { 'Dakar': 1500, 'Thiès': 2500, default: 3000 }, default: { default: 3500 } },
    fallback: 8000,
  },
  GH: {
    label: 'Ghana',
    currency: 'GHS',
    hub: 'Accra',
    villes: ['Accra', 'Kumasi', 'Tamale', 'Sekondi-Takoradi', 'Ashaiman', 'Sunyani', 'Cape Coast', 'Obuasi', 'Teshie', 'Tema'],
    tarifs: {
      'Accra': { 'Accra': 20, 'Kumasi': 35, default: 40 },
      'Kumasi': { 'Kumasi': 20, 'Accra': 35, default: 40 },
      default: { default: 45 },
    },
    fallback: 100,
  },
  NG: {
    label: 'Nigeria',
    currency: 'NGN',
    hub: 'Lagos',
    villes: ['Lagos', 'Abuja', 'Kano', 'Ibadan', 'Port Harcourt', 'Benin City', 'Kaduna', 'Enugu', 'Aba', 'Onitsha'],
    tarifs: {
      'Lagos': { 'Lagos': 1000, 'Abuja': 2500, default: 3000 },
      'Abuja': { 'Abuja': 1000, 'Lagos': 2500, default: 3000 },
      default: { default: 3500 },
    },
    fallback: 6000,
  },
  BJ: {
    label: 'Bénin',
    currency: 'XOF',
    hub: 'Cotonou',
    villes: ['Cotonou', 'Porto-Novo', 'Parakou', 'Djougou', 'Bohicon', 'Kandi', 'Ouidah', 'Abomey', 'Natitingou', 'Lokossa'],
    tarifs: { 'Cotonou': { 'Cotonou': 1000, 'Porto-Novo': 2000, default: 2500 }, default: { default: 3000 } },
    fallback: 8000,
  },
  TG: {
    label: 'Togo',
    currency: 'XOF',
    hub: 'Lomé',
    villes: ['Lomé', 'Sokodé', 'Kara', 'Kpalimé', 'Atakpamé', 'Dapaong', 'Tsévié', 'Aného', 'Bassar', 'Notsé'],
    tarifs: { 'Lomé': { 'Lomé': 1000, 'Sokodé': 2500, default: 3000 }, default: { default: 3500 } },
    fallback: 8000,
  },
  BF: {
    label: 'Burkina Faso',
    currency: 'XOF',
    hub: 'Ouagadougou',
    villes: ['Ouagadougou', 'Bobo-Dioulasso', 'Koudougou', 'Banfora', 'Ouahigouya', 'Kaya', 'Tenkodogo', "Fada N'Gourma", 'Dédougou', 'Gaoua'],
    tarifs: {
      'Ouagadougou': { 'Ouagadougou': 1000, 'Bobo-Dioulasso': 2500, default: 3000 },
      'Bobo-Dioulasso': { 'Bobo-Dioulasso': 1000, 'Ouagadougou': 2500, default: 3000 },
      default: { default: 3500 },
    },
    fallback: 8000,
  },
};

const DEFAULT_COUNTRY = 'CI';
const CURRENCY_SUFFIX = { XOF: 'XOF', GHS: 'GH₵', NGN: '₦' };

function getFrais(countryCode, villeVendeur, villeClient, typeLivr) {
  const country = COUNTRIES[countryCode] ?? COUNTRIES[DEFAULT_COUNTRY];
  const table = country.tarifs;
  const base = (table[villeVendeur] ?? table.default)[villeClient]
    ?? (table[villeVendeur] ?? table.default).default
    ?? country.fallback;
  return typeLivr === 'groupee' ? Math.round(base * 0.8) : base;
}

const fmtColis = (n, countryCode = DEFAULT_COUNTRY) => {
  const currency = COUNTRIES[countryCode]?.currency ?? 'XOF';
  return Number(n).toLocaleString('fr-FR') + ' ' + (CURRENCY_SUFFIX[currency] ?? currency);
};

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
function IconVolumeOff() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" />
    </svg>
  );
}
function IconVolumeOn() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
    </svg>
  );
}
function IconPin() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}
function IconCopy() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
    </svg>
  );
}
function IconUserCheck() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#34C759" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <circle cx="8.5" cy="7" r="4" />
      <polyline points="17 11 19 13 23 9" />
    </svg>
  );
}

const fmtCount = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`);
function Spinner() { return <span className={styles.spinnerSm} />; }

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

function useProductVideo(product) {
  const [videoUrl, setVideoUrl] = useState(product?.videoUrl || null);
  const [poster, setPoster] = useState(product?.imageUrl || null);
  const [loading, setLoading] = useState(!product?.videoUrl && !!(product?.videoId || product?.productId));

  useEffect(() => {
    setVideoUrl(product?.videoUrl || null);
    setPoster(product?.imageUrl || null);

    if (product?.videoUrl) { setLoading(false); return; }
    if (!product?.videoId && !product?.productId) { setLoading(false); return; }

    let cancelled = false;
    setLoading(true);

    const applyMedia = (data) => {
      if (!data) return false;
      const url = data.videoUrl || data.product?.videoUrl || null;
      if (url) setVideoUrl((prev) => prev || url);
      setPoster((prev) => prev || data.thumbnail || data.product?.thumbnail || null);
      return !!url;
    };

    (async () => {
      try {
        if (product.videoId) {
          const snap = await getDoc(doc(db, 'video_playlist', product.videoId));
          if (!cancelled && snap.exists() && applyMedia(snap.data())) { setLoading(false); return; }
        }
        if (!cancelled && product.productId) {
          const q = query(
            collection(db, 'video_playlist'),
            where('product.productId', '==', product.productId),
            limit(1)
          );
          const qs = await getDocs(q);
          if (!cancelled && !qs.empty) applyMedia(qs.docs[0].data());
        }
      } catch (e) {
        console.warn('⚠️ useProductVideo:', e.code ?? e.message ?? e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [product?.videoId, product?.productId, product?.videoUrl, product?.imageUrl]);

  return { videoUrl, poster, loading };
}

export default function UltraLivePage({ sessionId, viewerId, isActive }) {
  const sessionRef = doc(db, 'live_avatar_sessions', sessionId);

  const [authUser, setAuthUser] = useState(undefined);
  const [sessionData, setSessionData] = useState(null);
  const [comments, setComments] = useState([]);
  const [commentInput, setCommentInput] = useState('');
  const [hearts, setHearts] = useState([]);
  const [likeLocked, setLikeLocked] = useState(false);
  const [activeProductIndex, setActiveProductIndex] = useState(0);
  const [zoomIndex, setZoomIndex] = useState(null);
  const [orderProduct, setOrderProduct] = useState(null);
  const [currency, setCurrency] = useState('XOF');
  const [toastMsg, showToast] = useToast();

  const exchangeRates = { XOF: 1 };
  const convertPrice = (price) => Number(price) * (exchangeRates[currency] ?? 1);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => setAuthUser(user));
    return unsub;
  }, []);

  useEffect(() => {
    if (!authUser) return;
    const unsub = onSnapshot(sessionRef, (snap) => {
      setSessionData(snap.exists() ? snap.data() : null);
    }, (err) => console.warn('⚠️ session listener:', err));
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, authUser]);

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

  useEffect(() => {
    if (!authUser) return;
    const call = isActive ? resumeAvatarSession : pauseAvatarSession;
    call(sessionId).catch((e) => console.warn('⚠️ pause/resume:', e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, authUser]);

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

  const sendGift = (gift) => {
    if (!authUser) return;
    reactAvatarSession(sessionId, gift).catch((e) => console.warn('⚠️ sendGift:', e.message));
  };

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

  const openOrder = (product) => {
    if (!authUser) {
      showToast('Connexion requise pour commander');
      return;
    }
    setOrderProduct(product);
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
      <div className={styles.videoLayer}>
        <AvatarVideoPlayer videoUrl={videoUrl} isActive={isActive} />
      </div>

      <div className={styles.gradTop} />
      <div className={styles.gradBottom} />

      <div className={styles.header}>
        <LiveBadge />
        <div className={styles.spacer} />
        <StatChip icon={<IconEye />} value={viewers} />
        <StatChip icon={<IconHeart filled />} value={likes} />
        <GlassBtn icon={<IconShare />} onClick={() => shareLive(sellerId, activeProductId)} />
      </div>

      <div className={styles.chatArea}>
        {[...comments].reverse().map((c) => (
          <ChatBubble key={c.id} user={c.viewerId ?? 'user'} text={c.text ?? ''} />
        ))}
      </div>

      <div className={styles.actionRail}>
        <RailItem icon={<IconHeart filled />} label="J'aime" color="#FF6B9D" onClick={sendLike} />
        <RailItem icon={<IconShare />} label="Partager" color="#FFF0DC" onClick={() => shareLive(sellerId, activeProductId)} />
        <RailItem icon={<IconGift />} label="Cadeau" color="#FFB700" onClick={() => sendGift('🎁')} />
      </div>

      {hearts.map((h) => (
        <FloatingHeart key={h.id} right={h.right} />
      ))}

      {currentProducts.length > 0 && (
        <ProductStrip
          products={currentProducts}
          activeIndex={activeProductIndex}
          currency={currency}
          convertPrice={convertPrice}
          onSelect={setActiveProductIndex}
          onBuy={openOrder}
          onShare={(p) => shareLive(sellerId, p.productId)}
          onZoom={(i) => setZoomIndex(i)}
        />
      )}

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

      {zoomIndex !== null && (
        <ProductZoomViewer
          products={currentProducts}
          startIndex={zoomIndex}
          currency={currency}
          convertPrice={convertPrice}
          onClose={() => setZoomIndex(null)}
          onBuy={openOrder}
          onShare={(p) => shareLive(sellerId, p.productId)}
        />
      )}

      {orderProduct && (
        <ColisOrderModal
          product={orderProduct}
          sellerId={sellerId}
          authUser={authUser}
          onClose={() => setOrderProduct(null)}
        />
      )}

      {toastMsg && <div className={styles.toast}>{toastMsg}</div>}
    </div>
  );
}

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

function ProductMedia({ product, size = 'mini', muted, onToggleMuted }) {
  const { videoUrl, poster, loading } = useProductVideo(product);
  const videoRef = useRef(null);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.play().catch(() => {});
  }, [videoUrl]);

  useEffect(() => {
    const v = videoRef.current;
    if (v) v.muted = muted;
  }, [muted]);

  if (videoUrl) {
    return (
      <>
        <video
          ref={videoRef}
          src={videoUrl}
          poster={poster || product.imageUrl}
          muted loop playsInline autoPlay
          className={size === 'zoom' ? styles.zoomVideo : styles.miniVideo}
        />
        {size === 'zoom' && (
          <button
            onClick={(e) => { e.stopPropagation(); onToggleMuted?.(); }}
            className={styles.mediaMuteBtn}
            aria-label={muted ? 'Activer le son' : 'Couper le son'}
          >
            {muted ? <IconVolumeOff /> : <IconVolumeOn />}
          </button>
        )}
      </>
    );
  }

  if (loading) {
    return (
      <div className={size === 'zoom' ? styles.zoomMediaLoading : styles.miniMediaLoading}>
        <Spinner />
      </div>
    );
  }

  return product.imageUrl
    ? <img src={product.imageUrl} alt={product.name} />
    : <IconImageOff />;
}

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
        <ProductMedia product={product} size="mini" muted />
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

function ProductZoomViewer({ products, startIndex, currency, convertPrice, onClose, onBuy, onShare }) {
  const [index, setIndex] = useState(startIndex);
  const [muted, setMuted] = useState(true);
  const product = products[index];

  const goPrev = () => setIndex((i) => (i - 1 + products.length) % products.length);
  const goNext = () => setIndex((i) => (i + 1) % products.length);

  return (
    <div className={styles.zoomOverlay} onClick={(e) => e.stopPropagation()}>
      <div className={styles.zoomImageWrap}>
        <ProductMedia
          product={product}
          size="zoom"
          muted={muted}
          onToggleMuted={() => setMuted((m) => !m)}
        />
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

function ColisOrderModal({ product, sellerId, authUser, onClose }) {
  const [step, setStep] = useState('form');
  const [nomDest, setNomDest] = useState(
    authUser?.displayName || authUser?.email?.split('@')[0] || ''
  );
  const [telephone, setTelephone] = useState(authUser?.phoneNumber ?? '');
  const [adresse, setAdresse] = useState('');
  const [pays, setPays] = useState(DEFAULT_COUNTRY);
  const [villeClient, setVilleClient] = useState('');
  const [typeLivr, setTypeLivr] = useState('solo');
  const [modePaiem, setModePaiem] = useState('livraison');
  const [locLoading, setLocLoading] = useState(false);
  const [gpsCoords, setGpsCoords] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
  const [commandeId, setCommandeId] = useState(null);
  const [qrImgUrl, setQrImgUrl] = useState(null);
  const [serverTotal, setServerTotal] = useState(null);
  const [toast, setToast] = useState(null);

  const country = COUNTRIES[pays] ?? COUNTRIES[DEFAULT_COUNTRY];
  const prix = Number(product?.price ?? 0);
  const fraisXof = villeClient ? getFrais(pays, country.hub, villeClient, typeLivr) : 0;
  const totalXof = prix + fraisXof;

  const handlePaysChange = (nextPays) => {
    setPays(nextPays);
    setVilleClient('');
  };

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3500); };

  const localiser = () => {
    setLocLoading(true);
    navigator.geolocation.getCurrentPosition(
      pos => { setGpsCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }); showToast('Position capturée !'); setLocLoading(false); },
      err => { showToast('GPS refusé : ' + err.message); setLocLoading(false); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const validate = () => {
    const e = {};
    if (!nomDest.trim()) e.nomDest = 'Nom obligatoire';
    const digits = telephone.replace(/\D/g, '');
    if (!digits || digits.length < 8) e.telephone = 'Numéro invalide (min 8 chiffres)';
    if (!adresse.trim()) e.adresse = 'Adresse obligatoire';
    if (!villeClient) e.ville = 'Choisissez une ville';
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
          sellerId,
          nomDestinataire: nomDest.trim(),
          telDestinataire: telephone.trim(),
          pays,
          villeDepart: country.hub,
          villeDestination: villeClient,
          adresseLivraison: adresse.trim(),
          descriptionColis: product?.name ?? '',
          fraisLivraison: fraisXof,
          modePaiement: modePaiem === 'immediat' ? 'enLigne' : 'aLaLivraison',
          typeLivraison: typeLivr,
          photoUrl: product?.imageUrl ?? '',
          articles: [{
            nom: product?.name ?? '',
            prix,
            refArticle: product?.productId ?? '',
          }],
          gpsCoords,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Échec de la commande');

      const dataUrl = await QRCode.toDataURL(data.qrPayload, {
        width: 220,
        margin: 1,
        color: { dark: '#000000', light: '#ffffff' },
      });

      setCommandeId(data.commandeId);
      setServerTotal({ fraisXof: data.fraisXof, totalXof: data.totalXof });
      setQrImgUrl(dataUrl);
      setStep('qr');
    } catch (e) { showToast('Erreur : ' + e.message); }
    finally { setSubmitting(false); }
  };

  if (!product) return null;

  return (
    <div
      className={styles.modalBackdrop}
      onClick={(e) => {
        e.stopPropagation();
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={styles.modalSheet} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHandle} />
        <div className={styles.modalHeader}>
          <div>
            <p className={styles.modalTitle}>{step === 'qr' ? 'Commande confirmée' : 'Commander avec livraison'}</p>
            <p className={styles.modalSub}>{product?.name ?? ''}</p>
          </div>
          <button className={styles.modalClose} onClick={onClose}><IconClose /></button>
        </div>
        {step === 'form' && authUser && (
          <div className={styles.authBadge}><IconUserCheck /><span>Connecté : <strong>{authUser.email}</strong></span></div>
        )}
        {step === 'form' && (
          <div className={styles.modalBody}>
            <div className={styles.recapCard}>
              {product?.imageUrl && <img className={styles.recapImg} src={product.imageUrl} alt="" />}
              <div className={styles.recapInfo}>
                <p className={styles.recapName}>{product?.name}</p>
                <p className={styles.recapPrice}>{fmtColis(prix, pays)}</p>
              </div>
            </div>
            <p className={styles.fieldLabel}>TYPE DE LIVRAISON</p>
            <div className={styles.toggleRow}>
              <button className={typeLivr === 'solo' ? styles.toggleSel : styles.toggleOpt} onClick={() => setTypeLivr('solo')}>
                <span className={styles.toggleLabel}>Solo</span>
                <span className={styles.toggleSub}>Livreur dédié</span>
              </button>
              <button className={typeLivr === 'groupee' ? styles.toggleSel : styles.toggleOpt} onClick={() => setTypeLivr('groupee')}>
                <span className={styles.toggleLabel}>Groupée</span>
                <span className={styles.toggleSub}>Tournée partagée</span>
              </button>
            </div>
            <p className={styles.fieldLabel}>MODE DE PAIEMENT</p>
            <div className={styles.toggleRow}>
              <button className={modePaiem === 'livraison' ? styles.toggleSel : styles.toggleOpt} onClick={() => setModePaiem('livraison')}>
                <span className={styles.toggleLabel}>À la livraison</span>
                <span className={styles.toggleSub}>Cash</span>
              </button>
              <button className={modePaiem === 'immediat' ? styles.toggleSel : styles.toggleOpt} onClick={() => setModePaiem('immediat')}>
                <span className={styles.toggleLabel}>En ligne</span>
                <span className={styles.toggleSub}>Paiement sécurisé</span>
              </button>
            </div>
            <p className={styles.fieldLabel}>NOM DU DESTINATAIRE</p>
            <input className={`${styles.formInput}${errors.nomDest ? ' ' + styles.inputErr : ''}`}
              type="text" placeholder="Nom complet"
              value={nomDest} onChange={e => setNomDest(e.target.value)} />
            {errors.nomDest && <p className={styles.errMsg}>{errors.nomDest}</p>}
            <p className={styles.fieldLabel}>TÉLÉPHONE DE CONTACT</p>
            <input className={`${styles.formInput}${errors.telephone ? ' ' + styles.inputErr : ''}`}
              type="tel" placeholder="07 XX XX XX XX"
              value={telephone} onChange={e => setTelephone(e.target.value)} />
            {errors.telephone && <p className={styles.errMsg}>{errors.telephone}</p>}
            <p className={styles.fieldLabel}>PAYS DE LIVRAISON</p>
            <select className={styles.formInput}
              value={pays} onChange={e => handlePaysChange(e.target.value)}>
              {Object.entries(COUNTRIES).map(([code, c]) => (
                <option key={code} value={code}>{c.label}</option>
              ))}
            </select>
            <p className={styles.fieldLabel}>VILLE DE LIVRAISON</p>
            <select className={`${styles.formInput}${errors.ville ? ' ' + styles.inputErr : ''}`}
              value={villeClient} onChange={e => setVilleClient(e.target.value)}>
              <option value="">Sélectionnez votre ville…</option>
              {country.villes.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            {errors.ville && <p className={styles.errMsg}>{errors.ville}</p>}
            {villeClient && (
              <div className={styles.fraisCard}>
                <div className={styles.fraisRow}><span>Article</span><span>{fmtColis(prix, pays)}</span></div>
                <div className={styles.fraisRow}><span>Livraison{typeLivr === 'groupee' ? ' (-20%)' : ''}</span><span>{fmtColis(fraisXof, pays)}</span></div>
                <div className={styles.fraisDivider} />
                <div className={`${styles.fraisRow} ${styles.fraisTotal}`}><span>Total (estimé)</span><span>{fmtColis(totalXof, pays)}</span></div>
              </div>
            )}
            <p className={styles.fieldLabel}>ADRESSE DE LIVRAISON</p>
            <textarea className={`${styles.formInput} ${styles.formTextarea}${errors.adresse ? ' ' + styles.inputErr : ''}`}
              placeholder="Quartier, rue, point de repère…"
              value={adresse} onChange={e => setAdresse(e.target.value)} rows={2} />
            {errors.adresse && <p className={styles.errMsg}>{errors.adresse}</p>}
            <button className={`${styles.locBtn}${gpsCoords ? ' ' + styles.locOk : ''}`}
              onClick={localiser} disabled={locLoading}>
              {locLoading ? <Spinner /> : gpsCoords
                ? `${gpsCoords.lat.toFixed(4)}, ${gpsCoords.lng.toFixed(4)}`
                : <><IconPin /> Localiser mon adresse</>}
            </button>
            <button className={styles.confirmBtn} onClick={confirmer} disabled={submitting}>
              {submitting ? <Spinner /> : modePaiem === 'immediat' ? `Payer ${fmtColis(totalXof, pays)}` : 'Commander — payer à la livraison'}
            </button>
          </div>
        )}
        {step === 'qr' && commandeId && (
          <div className={`${styles.modalBody} ${styles.qrStep}`}>
            <p className={styles.qrHint}>Le livreur scannera ce code pour récupérer votre commande</p>
            <div className={styles.qrWrap}>
              {qrImgUrl && <img className={styles.qrImg} src={qrImgUrl} alt="QR commande" />}
            </div>
            <div className={styles.cidCard} onClick={() => { navigator.clipboard?.writeText(commandeId); showToast('ID copié !'); }}>
              <span className={styles.cidLabel}>Commande #</span>
              <span className={styles.cidValue}>{commandeId}</span>
              <IconCopy />
            </div>
            {gpsCoords && <p className={styles.gpsTag}>{gpsCoords.lat.toFixed(5)}, {gpsCoords.lng.toFixed(5)}</p>}
            <div className={styles.fraisCard} style={{ width: '100%' }}>
              <div className={styles.fraisRow}><span>{product?.name}</span><span>{fmtColis(prix, pays)}</span></div>
              <div className={styles.fraisRow}><span>Livraison {villeClient}</span><span>{fmtColis(serverTotal?.fraisXof ?? fraisXof, pays)}</span></div>
              <div className={styles.fraisDivider} />
              <div className={`${styles.fraisRow} ${styles.fraisTotal}`}><span>Total</span><span>{fmtColis(serverTotal?.totalXof ?? totalXof, pays)}</span></div>
              <div className={styles.fraisRow} style={{ opacity: 0.65, fontSize: '.75rem', marginTop: 6 }}>
                <span>Paiement</span><span>{modePaiem === 'immediat' ? 'En ligne' : 'À la livraison'}</span>
              </div>
            </div>
            <button className={styles.confirmBtn} onClick={onClose}>Fermer</button>
          </div>
        )}
        {toast && <div className={styles.toast}>{toast}</div>}
      </div>
    </div>
  );
}