'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import styles from './demo.module.css';

// ─── Données issues de la collection Firestore "video_playlist" ───────────────
const PLAYLIST = [
  {
    videoId: '038d2735-69d4-4ba9-8765-cea25132c82a',
    videoUrl: 'https://pub-ddbc1ebe88d64eaf9fa704987db262ac.r2.dev/shop-videos/55OKez34r5gsAndkgMweTyC9u002/8ae444c3-b2ef-4a9e-934e-e2b47a1742d1.mp4',
    title: '@emmie',
    userId: '55OKez34r5gsAndkgMweTyC9u002',
    comments: 0,
    likes: 0,
    views: 0,
    createdAt: '19 avril 2026',
    keywords: ['emmie', 'bikini', 'tricot', 'bon', 'pour', 'la', 'plage', 'picine', 'soire'],
    product: {
      name: 'Bikini tricoté',
      description: 'bon pour la plage, picine, soirée 🥰🥰🥰🥰🥰🥰🥰',
      price: 13000,
      image: 'https://pub-ddbc1ebe88d64eaf9fa704987db262ac.r2.dev/shop-images/55OKez34r5gsAndkgMweTyC9u002/f1aa2ea0-1674-4f55-b547-cb231a62bfe3.jpg',
      thumbnail: 'https://pub-ddbc1ebe88d64eaf9fa704987db262ac.r2.dev/shop-images/55OKez34r5gsAndkgMweTyC9u002/056ba0e1-3163-4c87-a3f7-b3b0ca26e2c9.jpg',
      productId: '331a3890-d215-4181-b1a5-a812bfe84206',
      refArticle: '55OKez34r5gsAndkgMweTyC9u002',
    },
  },
  // ── Dupliquer l'entrée pour tester le scroll (simulation playlist longue) ──
  {
    videoId: '038d2735-0002',
    videoUrl: 'https://pub-ddbc1ebe88d64eaf9fa704987db262ac.r2.dev/shop-videos/55OKez34r5gsAndkgMweTyC9u002/8ae444c3-b2ef-4a9e-934e-e2b47a1742d1.mp4',
    title: '@emmie',
    userId: '55OKez34r5gsAndkgMweTyC9u002',
    comments: 0,
    likes: 4,
    views: 127,
    createdAt: '19 avril 2026',
    keywords: ['bikini', 'plage', 'été'],
    product: {
      name: 'Bikini tricoté – Rose',
      description: 'Version rose, parfaite pour l\'été 🌸',
      price: 15000,
      image: 'https://pub-ddbc1ebe88d64eaf9fa704987db262ac.r2.dev/shop-images/55OKez34r5gsAndkgMweTyC9u002/056ba0e1-3163-4c87-a3f7-b3b0ca26e2c9.jpg',
      thumbnail: 'https://pub-ddbc1ebe88d64eaf9fa704987db262ac.r2.dev/shop-images/55OKez34r5gsAndkgMweTyC9u002/f1aa2ea0-1674-4f55-b547-cb231a62bfe3.jpg',
      productId: '331a3890-d215-4181-b1a5-a812bfe84207',
      refArticle: '55OKez34r5gsAndkgMweTyC9u002',
    },
  },
];

// ─── Icônes SVG inline ────────────────────────────────────────────────────────
function IconHeart({ filled }) {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill={filled ? '#ff3c6e' : 'none'} stroke={filled ? '#ff3c6e' : '#fff'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

function IconComment() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function IconShare() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  );
}

function IconCart() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
    </svg>
  );
}

function IconVolume({ muted }) {
  return muted ? (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" />
    </svg>
  ) : (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
    </svg>
  );
}

function IconPause() {
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="rgba(255,255,255,0.9)">
      <rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" />
    </svg>
  );
}

function IconPlay() {
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="rgba(255,255,255,0.9)">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  );
}

// ─── Composant carte produit (slide-up) ───────────────────────────────────────
function ProductSheet({ product, onClose }) {
  return (
    <div className={styles.sheetBackdrop} onClick={onClose}>
      <div className={styles.sheet} onClick={e => e.stopPropagation()}>
        <div className={styles.sheetHandle} />
        <div className={styles.sheetContent}>
          <img src={product.image} alt={product.name} className={styles.sheetImg} />
          <div className={styles.sheetInfo}>
            <h3 className={styles.sheetName}>{product.name}</h3>
            <p className={styles.sheetDesc}>{product.description}</p>
            <div className={styles.sheetPrice}>
              {product.price.toLocaleString('fr-FR')} <span>FCFA</span>
            </div>
            <button className={styles.sheetBtn}>🛒 Ajouter au panier</button>
            <button className={styles.sheetBtnSecondary}>Voir la boutique</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Un seul item de la playlist (plein écran) ───────────────────────────────
function VideoItem({ item, isActive }) {
  const videoRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(item.likes);
  const [showPause, setShowPause] = useState(false);
  const [showProduct, setShowProduct] = useState(false);
  const pauseTimeout = useRef(null);

  // Auto-play/pause when slide comes into view
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (isActive) {
      video.play().then(() => setPlaying(true)).catch(() => {});
    } else {
      video.pause();
      video.currentTime = 0;
      setPlaying(false);
    }
  }, [isActive]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play();
      setPlaying(true);
      setShowPause(false);
    } else {
      video.pause();
      setPlaying(false);
      setShowPause(true);
      clearTimeout(pauseTimeout.current);
      pauseTimeout.current = setTimeout(() => setShowPause(false), 1200);
    }
  };

  const toggleLike = (e) => {
    e.stopPropagation();
    setLiked(l => !l);
    setLikeCount(c => liked ? c - 1 : c + 1);
  };

  const keywords = item.keywords.slice(0, 5).map(k => `#${k}`).join(' ');

  return (
    <div className={styles.videoItem}>
      {/* Video */}
      <video
        ref={videoRef}
        src={item.videoUrl}
        className={styles.video}
        loop
        playsInline
        muted={muted}
        onClick={togglePlay}
        poster={item.product.thumbnail}
      />

      {/* Gradient overlays */}
      <div className={styles.gradientTop} />
      <div className={styles.gradientBottom} />

      {/* Pause icon flash */}
      {showPause && (
        <div className={styles.pauseFlash}>
          {playing ? <IconPause /> : <IconPlay />}
        </div>
      )}

      {/* Top bar */}
      <div className={styles.topBar}>
        <span className={styles.topTitle}>FriTok</span>
        <button
          className={styles.muteBtn}
          onClick={e => { e.stopPropagation(); setMuted(m => !m); }}
        >
          <IconVolume muted={muted} />
        </button>
      </div>

      {/* Right action buttons */}
      <div className={styles.actions}>
        {/* Avatar */}
        <div className={styles.avatarWrap}>
          <div className={styles.avatar}>
            {item.title.replace('@', '')[0].toUpperCase()}
          </div>
          <div className={styles.followDot}>+</div>
        </div>

        {/* Like */}
        <button className={styles.actionBtn} onClick={toggleLike}>
          <IconHeart filled={liked} />
          <span className={liked ? styles.likedCount : styles.actionCount}>
            {likeCount > 0 ? likeCount : ''}
          </span>
        </button>

        {/* Comment */}
        <button className={styles.actionBtn} onClick={e => e.stopPropagation()}>
          <IconComment />
          <span className={styles.actionCount}>{item.comments || ''}</span>
        </button>

        {/* Cart / Product */}
        <button
          className={`${styles.actionBtn} ${styles.cartBtn}`}
          onClick={e => { e.stopPropagation(); setShowProduct(true); }}
        >
          <IconCart />
          <span className={styles.actionCount}>Shop</span>
        </button>

        {/* Share */}
        <button className={styles.actionBtn} onClick={e => e.stopPropagation()}>
          <IconShare />
          <span className={styles.actionCount}>{item.views > 0 ? item.views : ''}</span>
        </button>
      </div>

      {/* Bottom info */}
      <div className={styles.bottomInfo}>
        <div className={styles.username}>{item.title}</div>
        <p className={styles.caption}>{keywords}</p>

        {/* Product mini-card */}
        <button
          className={styles.productCard}
          onClick={e => { e.stopPropagation(); setShowProduct(true); }}
        >
          <img src={item.product.thumbnail} alt={item.product.name} className={styles.productThumb} />
          <div className={styles.productMeta}>
            <span className={styles.productName}>{item.product.name}</span>
            <span className={styles.productPrice}>
              {item.product.price.toLocaleString('fr-FR')} FCFA
            </span>
          </div>
          <span className={styles.productCta}>Acheter</span>
        </button>
      </div>

      {/* Product sheet */}
      {showProduct && (
        <ProductSheet product={item.product} onClose={() => setShowProduct(false)} />
      )}
    </div>
  );
}

// ─── Page principale Demo ─────────────────────────────────────────────────────
export default function DemoPage() {
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef(null);
  const isScrolling = useRef(false);

  // Intersection Observer → snap to active slide
  useEffect(() => {
    const items = containerRef.current?.querySelectorAll('[data-index]');
    if (!items) return;

    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting && entry.intersectionRatio > 0.6) {
            setActiveIndex(Number(entry.target.dataset.index));
          }
        });
      },
      { threshold: 0.6 }
    );

    items.forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handler = e => {
      if (e.key === 'ArrowDown') setActiveIndex(i => Math.min(i + 1, PLAYLIST.length - 1));
      if (e.key === 'ArrowUp') setActiveIndex(i => Math.max(i - 1, 0));
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Scroll to active index
  useEffect(() => {
    const items = containerRef.current?.querySelectorAll('[data-index]');
    if (items && items[activeIndex]) {
      items[activeIndex].scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [activeIndex]);

  return (
    <div className={styles.page}>
      {/* Top nav */}
      <nav className={styles.nav}>
        <a href="/" className={styles.navLogo}>Fri<span>Tok</span></a>
        <div className={styles.navTabs}>
          <button className={styles.navTab}>Abonnements</button>
          <button className={`${styles.navTab} ${styles.navTabActive}`}>Pour toi</button>
          <button className={styles.navTab}>Live</button>
        </div>
        <a href="/register" className={styles.navCta}>Vendre</a>
      </nav>

      {/* Scroll container */}
      <div ref={containerRef} className={styles.feed}>
        {PLAYLIST.map((item, i) => (
          <div key={item.videoId} data-index={i} className={styles.slide}>
            <VideoItem item={item} isActive={i === activeIndex} />
          </div>
        ))}
      </div>

      {/* Progress dots */}
      <div className={styles.dots}>
        {PLAYLIST.map((_, i) => (
          <button
            key={i}
            className={`${styles.dot} ${i === activeIndex ? styles.dotActive : ''}`}
            onClick={() => setActiveIndex(i)}
          />
        ))}
      </div>
    </div>
  );
}
