'use client';

import { useState, useRef, useEffect } from 'react';
import {
  collection, query, where, orderBy,
  getDocs, onSnapshot, doc, updateDoc, increment,
} from 'firebase/firestore';
import { db } from '../../lib/firebaseClient';
import styles from './live.module.css';

// ─── Icônes SVG ───────────────────────────────────────────────────────────────
function IconHeart({ filled }) {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24"
      fill={filled ? '#ff3c6e' : 'none'}
      stroke={filled ? '#ff3c6e' : '#fff'}
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

// ─── Bulle de commentaire animée ─────────────────────────────────────────────
function ChatBubble({ msg }) {
  return (
    <div className={styles.chatBubble}>
      <span className={styles.chatUser}>{msg.user}</span>
      <span className={styles.chatText}>{msg.text}</span>
    </div>
  );
}

// ─── Fiche produit (drawer) ───────────────────────────────────────────────────
function ProductSheet({ product, onClose }) {
  if (!product) return null;
  return (
    <div className={styles.sheetBackdrop} onClick={onClose}>
      <div className={styles.sheet} onClick={e => e.stopPropagation()}>
        <div className={styles.sheetHandle}/>
        <img src={product.image} alt={product.name} className={styles.sheetImg}
          onError={e => { e.currentTarget.style.display = 'none'; }}/>
        <div className={styles.sheetInfo}>
          <div className={styles.sheetSeller}>
            <div className={styles.sellerDot}>{(product.sellerName || 'V')[0]}</div>
            <span>{product.sellerName || 'Vendeur'}</span>
          </div>
          <h3 className={styles.sheetName}>{product.name}</h3>
          <p className={styles.sheetDesc}>{product.description}</p>
          <div className={styles.sheetPrice}>
            {Number(product.price).toLocaleString('fr-FR')} <span>FCFA</span>
          </div>
          <button className={styles.sheetBtn}>🛒 Commander maintenant</button>
          <button className={styles.sheetBtnSecondary} onClick={onClose}>Fermer</button>
        </div>
      </div>
    </div>
  );
}

// ─── Carte live dans la liste ─────────────────────────────────────────────────
function LiveCard({ session, onSelect }) {
  const firstProduct = session.products?.[0];
  const initial = (session.sellerName || session.channelId || 'L')[0].toUpperCase();

  // Couleur aléatoire stable basée sur l'id
  const colors = [
    'linear-gradient(135deg,#1e3a5f,#0d1b2a)',
    'linear-gradient(135deg,#3d1a4f,#1a0d2e)',
    'linear-gradient(135deg,#4f2d0d,#2e1a0d)',
    'linear-gradient(135deg,#0d3a2e,#0a1e1a)',
    'linear-gradient(135deg,#3a1a1a,#1a0d0d)',
  ];
  const colorIdx = session.channelId?.charCodeAt(5) % colors.length ?? 0;

  return (
    <div className={styles.liveCard} onClick={() => onSelect(session)}>
      <div className={styles.liveThumb} style={{ background: colors[colorIdx] }}>
        {firstProduct?.image && (
          <img src={firstProduct.image} alt="" className={styles.liveThumbImg}
            onError={e => { e.currentTarget.style.display = 'none'; }}/>
        )}
        {session.isLive && <span className={styles.liveBadge}>🔴 LIVE</span>}
        {!session.isLive && <span className={styles.replayBadge}>REPLAY</span>}
        <span className={styles.viewerBadge}>
          <IconEye /> {session.viewerCount ?? 0}
        </span>
      </div>
      <div className={styles.liveInfo}>
        <div className={styles.liveAvatar}>{initial}</div>
        <div className={styles.liveMeta}>
          <div className={styles.liveSellerName}>
            {session.sellerName || 'Vendeur'}
          </div>
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

// ─── Player live plein écran ──────────────────────────────────────────────────
const DEMO_COMMENTS = [
  { id: 1, user: '@marie_ci', text: 'C\'est magnifique 😍' },
  { id: 2, user: '@kofi', text: 'C\'est disponible en rouge ?' },
  { id: 3, user: '@aminata', text: 'Le prix svp 🙏' },
  { id: 4, user: '@alex_abj', text: 'J\'adore ce produit !' },
  { id: 5, user: '@cissé', text: 'Livraison à Yopougon ?' },
];

function LivePlayer({ session, onClose }) {
  const [liked, setLiked]               = useState(false);
  const [likeCount, setLikeCount]       = useState(session.likeCount ?? 0);
  const [showProduct, setShowProduct]   = useState(false);
  const [activeProduct, setActiveProduct] = useState(session.products?.[0] ?? null);
  const [messages, setMessages]         = useState([]);
  const [inputMsg, setInputMsg]         = useState('');
  const [showProductList, setShowProductList] = useState(false);
  const chatRef = useRef(null);
  const msgId = useRef(6);

  // Simuler des commentaires entrants (en prod → onSnapshot sur subcollection comments)
  useEffect(() => {
    setMessages(DEMO_COMMENTS.slice(0, 2));
    const ids = DEMO_COMMENTS.slice(2).map((msg, i) =>
      setTimeout(() => {
        setMessages(prev => [...prev.slice(-8), msg]);
      }, (i + 1) * 3500)
    );
    return () => ids.forEach(clearTimeout);
  }, []);

  // Auto-scroll chat
  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const handleLike = async () => {
    setLiked(l => !l);
    setLikeCount(c => liked ? c - 1 : c + 1);
    // Écrire dans Firestore (optionnel - necessite les règles write)
    try {
      await updateDoc(doc(db, 'live_sessions', session.id), {
        likeCount: increment(liked ? -1 : 1),
      });
    } catch (_) {}
  };

  const sendMessage = () => {
    if (!inputMsg.trim()) return;
    setMessages(prev => [...prev.slice(-8), {
      id: msgId.current++,
      user: '@vous',
      text: inputMsg.trim(),
    }]);
    setInputMsg('');
  };

  const initial = (session.sellerName || 'V')[0].toUpperCase();

  return (
    <div className={styles.playerPage}>
      {/* Fond vidéo simulé */}
      <div className={styles.playerBg}/>
      <div className={styles.playerGradTop}/>
      <div className={styles.playerGradBottom}/>

      {/* Header */}
      <div className={styles.playerHeader}>
        <div className={styles.playerHost}>
          <div className={styles.playerAvatar}>{initial}</div>
          <div>
            <div className={styles.playerHostName}>{session.sellerName || 'Vendeur'}</div>
            <div className={styles.playerViewers}>
              <IconEye/> {session.viewerCount ?? 0} spectateurs
            </div>
          </div>
          <button className={styles.followBtn}>Suivre</button>
        </div>
        <div className={styles.playerHeaderRight}>
          {session.isLive && <span className={styles.liveIndicator}>🔴 LIVE</span>}
          <button className={styles.closeBtn} onClick={onClose}><IconClose/></button>
        </div>
      </div>

      {/* Actions droite */}
      <div className={styles.playerActions}>
        <button className={styles.playerActionBtn} onClick={handleLike}>
          <IconHeart filled={liked}/>
          <span className={liked ? styles.countLiked : styles.countWhite}>
            {likeCount > 0 ? likeCount : ''}
          </span>
        </button>

        <button className={styles.playerActionBtn} onClick={e => e.stopPropagation()}>
          <IconGift/>
          <span className={styles.countGold}>{session.giftCount > 0 ? session.giftCount : ''}</span>
        </button>

        <button className={styles.playerActionBtn} onClick={() => setShowProductList(v => !v)}>
          <IconCart/>
          <span className={styles.countWhite}>{session.products?.length ?? 0}</span>
        </button>

        <button className={styles.playerActionBtn}>
          <IconShare/>
        </button>
      </div>

      {/* Chat */}
      <div className={styles.chatArea} ref={chatRef}>
        {messages.map(m => <ChatBubble key={m.id} msg={m}/>)}
      </div>

      {/* Saisie message */}
      <div className={styles.chatInput}>
        <input
          className={styles.chatField}
          placeholder="Écrire un commentaire..."
          value={inputMsg}
          onChange={e => setInputMsg(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && sendMessage()}
        />
        <button className={styles.chatSend} onClick={sendMessage}>↑</button>
      </div>

      {/* Produit épinglé */}
      {activeProduct && (
        <button
          className={styles.pinnedProduct}
          onClick={() => setShowProduct(true)}
        >
          <img src={activeProduct.image} alt={activeProduct.name}
            className={styles.pinnedImg}
            onError={e => { e.currentTarget.style.display = 'none'; }}/>
          <div className={styles.pinnedMeta}>
            <span className={styles.pinnedName}>{activeProduct.name}</span>
            <span className={styles.pinnedPrice}>
              {Number(activeProduct.price).toLocaleString('fr-FR')} FCFA
            </span>
          </div>
          <span className={styles.pinnedCta}>Voir</span>
        </button>
      )}

      {/* Liste produits du live */}
      {showProductList && (
        <div className={styles.productListPanel}>
          <div className={styles.productListHeader}>
            <span>Produits du live ({session.products?.length ?? 0})</span>
            <button onClick={() => setShowProductList(false)}><IconClose/></button>
          </div>
          <div className={styles.productListScroll}>
            {(session.products ?? []).map(p => (
              <button key={p.productId} className={styles.productListItem}
                onClick={() => { setActiveProduct(p); setShowProduct(true); setShowProductList(false); }}>
                <img src={p.image} alt={p.name} className={styles.productListImg}
                  onError={e => { e.currentTarget.style.display = 'none'; }}/>
                <div className={styles.productListMeta}>
                  <span className={styles.productListName}>{p.name}</span>
                  <span className={styles.productListDesc}>{p.description}</span>
                  <span className={styles.productListPrice}>
                    {Number(p.price).toLocaleString('fr-FR')} FCFA
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Fiche produit */}
      {showProduct && (
        <ProductSheet product={activeProduct} onClose={() => setShowProduct(false)}/>
      )}
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
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

// ─── Page principale /live ────────────────────────────────────────────────────
export default function LivePage() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [selected, setSelected] = useState(null);
  const [filter, setFilter]     = useState('all'); // 'all' | 'live' | 'replay'

  // Charger live_sessions depuis Firestore en temps réel
  useEffect(() => {
    const q = query(
      collection(db, 'live_sessions'),
      orderBy('startedAt', 'desc')
    );

    const unsub = onSnapshot(q,
      snap => {
        const data = snap.docs.map(d => ({
          id: d.id,
          ...d.data(),
          startedAt: d.data().startedAt?.toDate?.()?.toLocaleDateString('fr-FR') ?? '',
        }));
        setSessions(data);
        setLoading(false);
      },
      err => {
        console.error('Firestore live_sessions:', err);
        setError('Impossible de charger les lives. Vérifiez votre config Firebase.');
        setLoading(false);
      }
    );

    return () => unsub();
  }, []);

  // Si un live est sélectionné → afficher le player
  if (selected) {
    return <LivePlayer session={selected} onClose={() => setSelected(null)}/>;
  }

  const filtered = sessions.filter(s => {
    if (filter === 'live') return s.isLive === true;
    if (filter === 'replay') return s.isLive === false;
    return true;
  });

  const liveCount   = sessions.filter(s => s.isLive).length;
  const replayCount = sessions.filter(s => !s.isLive).length;

  return (
    <div className={styles.page}>
      {/* Nav */}
      <nav className={styles.nav}>
        <a href="/" className={styles.navLogo}>Fri<span>Tok</span></a>
        <span className={styles.navTitle}>Lives</span>
        <a href="/demo" className={styles.navLink}>Vidéos</a>
      </nav>

      <div className={styles.content}>
        {/* Filtres */}
        <div className={styles.filters}>
          <button
            className={`${styles.filterBtn} ${filter === 'all' ? styles.filterActive : ''}`}
            onClick={() => setFilter('all')}>
            Tout ({sessions.length})
          </button>
          <button
            className={`${styles.filterBtn} ${filter === 'live' ? styles.filterActive : ''}`}
            onClick={() => setFilter('live')}>
            🔴 En direct ({liveCount})
          </button>
          <button
            className={`${styles.filterBtn} ${filter === 'replay' ? styles.filterActive : ''}`}
            onClick={() => setFilter('replay')}>
            Replays ({replayCount})
          </button>
        </div>

        {/* Contenu */}
        {loading && <Skeleton/>}

        {error && (
          <div className={styles.errorBox}>
            <p>⚠️ {error}</p>
            <a href="/" className={styles.errorBack}>← Retour à l'accueil</a>
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className={styles.emptyBox}>
            <p>📡 Aucun live disponible pour ce filtre.</p>
          </div>
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
