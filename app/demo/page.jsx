'use client';

import { useState, useRef, useEffect } from 'react';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { db } from '../../lib/firebaseClient';
import styles from './demo.module.css';

function IconHeart({ filled }) {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24"
      fill={filled ? '#ff3c6e' : 'none'}
      stroke={filled ? '#ff3c6e' : '#fff'}
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  );
}

function IconCart() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
    </svg>
  );
}

function ProductSheet({ product, onClose }) {
  if (!product) return null;
  return (
    <div className={styles.sheetBackdrop} onClick={onClose}>
      <div className={styles.sheet} onClick={e => e.stopPropagation()}>
        <div className={styles.sheetHandle} />
        <img src={product.image} alt={product.name} className={styles.sheetImg}
          onError={e => { e.currentTarget.src = product.thumbnail || ''; }} />
        <div className={styles.sheetInfo}>
          <h3 className={styles.sheetName}>{product.name}</h3>
          <p className={styles.sheetDesc}>{product.description}</p>
          <div className={styles.sheetPrice}>
            {Number(product.price).toLocaleString('fr-FR')} <span>FCFA</span>
          </div>
          <button className={styles.sheetBtn}>🛒 Ajouter au panier</button>
          <button className={styles.sheetBtnSecondary} onClick={onClose}>Fermer</button>
        </div>
      </div>
    </div>
  );
}

function VideoSlide({ item, isActive }) {
  const videoRef = useRef(null);
  const [playing, setPlaying]     = useState(false);
  const [muted, setMuted]         = useState(true);
  const [liked, setLiked]         = useState(false);
  const [likeCount, setLikeCount] = useState(item.likes ?? 0);
  const [showSheet, setShowSheet] = useState(false);
  const [tapIcon, setTapIcon]     = useState(null);
  const tapTimer = useRef(null);

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
    if (vid.paused) {
      vid.play(); setPlaying(true); setTapIcon('play');
    } else {
      vid.pause(); setPlaying(false); setTapIcon('pause');
    }
    clearTimeout(tapTimer.current);
    tapTimer.current = setTimeout(() => setTapIcon(null), 800);
  };

  const toggleLike = e => {
    e.stopPropagation();
    setLiked(v => !v);
    setLikeCount(c => liked ? c - 1 : c + 1);
  };

  const initials = (item.title || '@?').replace('@', '')[0]?.toUpperCase() ?? '?';
  const tags = (item.keywords ?? []).slice(0, 5).map(k => '#' + k).join(' ');

  return (
    <div className={styles.slide}>
      <video ref={videoRef} src={item.videoUrl} className={styles.video}
        loop playsInline muted={muted} onClick={handleTap}
        poster={item.product?.thumbnail} preload="metadata" />

      <div className={styles.gradTop} />
      <div className={styles.gradBottom} />

      {tapIcon && (
        <div className={styles.tapFlash}>
          {tapIcon === 'pause'
            ? <svg width="52" height="52" viewBox="0 0 24 24" fill="rgba(255,255,255,0.9)"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
            : <svg width="52" height="52" viewBox="0 0 24 24" fill="rgba(255,255,255,0.9)"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          }
        </div>
      )}

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

      <div className={styles.actions}>
        <div className={styles.avatarWrap}>
          <div className={styles.avatar}>{initials}</div>
          <div className={styles.followDot}>+</div>
        </div>
        <button className={styles.actionBtn} onClick={toggleLike}>
          <IconHeart filled={liked} />
          <span className={liked ? styles.countLiked : styles.count}>{likeCount > 0 ? likeCount : ''}</span>
        </button>
        <button className={styles.actionBtn} onClick={e => e.stopPropagation()}>
          <IconComment />
          <span className={styles.count}>{item.comments > 0 ? item.comments : ''}</span>
        </button>
        <button className={`${styles.actionBtn} ${styles.cartBtn}`}
          onClick={e => { e.stopPropagation(); setShowSheet(true); }}>
          <IconCart />
          <span className={styles.countGold}>Shop</span>
        </button>
        <button className={styles.actionBtn} onClick={e => e.stopPropagation()}>
          <IconShare />
          <span className={styles.count}>{item.views > 0 ? item.views : ''}</span>
        </button>
      </div>

      <div className={styles.bottomInfo}>
        <p className={styles.username}>{item.title}</p>
        <p className={styles.tags}>{tags}</p>
        {item.product && (
          <button className={styles.productCard}
            onClick={e => { e.stopPropagation(); setShowSheet(true); }}>
            <img src={item.product.thumbnail || item.product.image}
              alt={item.product.name} className={styles.productThumb}
              onError={e => { e.currentTarget.style.display = 'none'; }} />
            <div className={styles.productMeta}>
              <span className={styles.productName}>{item.product.name}</span>
              <span className={styles.productPrice}>
                {Number(item.product.price).toLocaleString('fr-FR')} FCFA
              </span>
            </div>
            <span className={styles.productCta}>Acheter</span>
          </button>
        )}
      </div>

      {showSheet && <ProductSheet product={item.product} onClose={() => setShowSheet(false)} />}
    </div>
  );
}

function Skeleton() {
  return (
    <div className={styles.skeleton}>
      <div className={styles.skeletonPulse} />
      <div className={styles.skeletonText}>
        <div className={styles.skeletonLine} style={{ width: '35%' }} />
        <div className={styles.skeletonLine} style={{ width: '60%' }} />
        <div className={styles.skeletonLine} style={{ width: '85%', height: '52px', borderRadius: '12px' }} />
      </div>
    </div>
  );
}

export default function DemoPage() {
  const [playlist, setPlaylist]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const feedRef = useRef(null);

  // Charger toute la collection video_playlist
  useEffect(() => {
    async function load() {
      try {
        const q = query(
          collection(db, 'video_playlist'),
          orderBy('createdAt', 'desc')
        );
        const snap = await getDocs(q);
        const videos = snap.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
            createdAt: data.createdAt?.toDate?.()?.toLocaleDateString('fr-FR') ?? '',
          };
        });
        setPlaylist(videos);
      } catch (err) {
        console.error('Firestore:', err);
        setError('Impossible de charger les vidéos. Vérifiez votre configuration Firebase.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Observer pour détecter la slide visible
  useEffect(() => {
    if (!feedRef.current || playlist.length === 0) return;
    const slides = feedRef.current.querySelectorAll('[data-slide]');
    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.55) {
            setActiveIdx(Number(entry.target.dataset.slide));
          }
        });
      },
      { threshold: 0.55 }
    );
    slides.forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, [playlist]);

  // Navigation clavier
  useEffect(() => {
    const onKey = e => {
      if (e.key === 'ArrowDown') setActiveIdx(i => Math.min(i + 1, playlist.length - 1));
      if (e.key === 'ArrowUp')   setActiveIdx(i => Math.max(i - 1, 0));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [playlist.length]);

  // Scroll vers slide active (clavier)
  useEffect(() => {
    const slides = feedRef.current?.querySelectorAll('[data-slide]');
    slides?.[activeIdx]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [activeIdx]);

  if (loading) return <div className={styles.page}><Skeleton /></div>;

  if (error) return (
    <div className={styles.page}>
      <div className={styles.errorBox}>
        <p>⚠️ {error}</p>
        <a href="/" className={styles.errorBack}>← Retour à l'accueil</a>
      </div>
    </div>
  );

  if (playlist.length === 0) return (
    <div className={styles.page}>
      <div className={styles.errorBox}>
        <p>📭 Aucune vidéo dans la collection.</p>
        <a href="/" className={styles.errorBack}>← Retour</a>
      </div>
    </div>
  );

  return (
    <div className={styles.page}>
      <div ref={feedRef} className={styles.feed}>
        {playlist.map((item, i) => (
          <div key={item.id} data-slide={i} className={styles.slideWrapper}>
            <VideoSlide item={item} isActive={i === activeIdx} />
          </div>
        ))}
      </div>

      {/* Dots latéraux */}
      <div className={styles.dots}>
        {playlist.map((_, i) => (
          <button key={i}
            className={`${styles.dot} ${i === activeIdx ? styles.dotActive : ''}`}
            onClick={() => setActiveIdx(i)}
            aria-label={'Vidéo ' + (i + 1)} />
        ))}
      </div>

      {/* Compteur */}
      <div className={styles.counter}>{activeIdx + 1} / {playlist.length}</div>
    </div>
  );
}
