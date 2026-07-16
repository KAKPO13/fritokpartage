'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  collection, query, where, onSnapshot,
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '@/lib/firebaseClient';
import UltraLivePage from './UltraLivePage';
import AiLiveAssistantBridge from '@/lib/ai-live-assistant/presentation/AiLiveAssistantBridge';
import styles from './multiLiveFeed.module.css';

// ⚠️ Voir firestore.rules, `/live_avatar_sessions/{sessionId}` :
// `allow read: if isAuth()`. La requête temps réel ci-dessous a donc
// besoin d'un utilisateur Firebase authentifié (même anonyme) pour ne
// pas se solder par un permission-denied silencieux (traité par onError,
// qui viderait la liste sans autre explication). Si l'app veut un mode
// "spectateur non connecté", il faut un flux de connexion anonyme en
// amont — hors du périmètre de ce composant.

// Fenêtre de préchargement : combien d'items avant/après l'index courant
// restent montés (avec leur <video>) pour un scroll fluide — équivalent
// direct de `_kPreloadRadius` côté Dart.
const PRELOAD_RADIUS = 2;

/* ─────────────────────────────────────────────
   Persistance "déjà vu" — localStorage à la place de SharedPreferences.
   Même plafond (200 ids) et même politique FIFO que _WatchedAvatarStore.
───────────────────────────────────────────── */
const WATCHED_KEY = 'watched_avatar_live_ids';
const WATCHED_MAX = 200;

const WatchedAvatarStore = {
  load() {
    if (typeof window === 'undefined') return new Set();
    try {
      const raw = window.localStorage.getItem(WATCHED_KEY);
      return new Set(raw ? JSON.parse(raw) : []);
    } catch {
      return new Set();
    }
  },
  markWatched(sessionId, currentSet) {
    if (typeof window === 'undefined') return currentSet;
    const next = new Set(currentSet);
    next.add(sessionId);
    let arr = Array.from(next);
    if (arr.length > WATCHED_MAX) arr = arr.slice(arr.length - WATCHED_MAX);
    try {
      window.localStorage.setItem(WATCHED_KEY, JSON.stringify(arr));
    } catch {
      /* quota dépassé ou storage indisponible — on continue sans persister */
    }
    return new Set(arr);
  },
  clear() {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(WATCHED_KEY);
  },
};

function sortSessions(docs, watchedIds) {
  const unseen = docs.filter((d) => !watchedIds.has(d.id));
  const seen = docs.filter((d) => watchedIds.has(d.id));
  return [...unseen, ...seen];
}

/**
 * MultiLiveFeedPage — port de `MultiLiveFeedPage` (Flutter).
 *
 * Le `PageView` vertical à pagination est remplacé par un conteneur
 * `overflow-y: auto` + `scroll-snap-type: y mandatory` (équivalent web
 * natif), et un `IntersectionObserver` par item fait office de
 * `onPageChanged` pour détecter l'index courant.
 *
 * @param {{ viewerId: string, isActive?: boolean }} props
 */
export default function MultiLiveFeedPage({ viewerId, isActive = true }) {
  // undefined = en cours de résolution, null = pas connecté, objet = connecté
  const [authUser, setAuthUser] = useState(undefined);
  const [rawSessions, setRawSessions] = useState([]);
  const [watchedIds, setWatchedIds] = useState(null); // null = pas encore chargé
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [preloadedIndices, setPreloadedIndices] = useState(new Set());

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => setAuthUser(user));
    return unsub;
  }, []);

  const scrollRef = useRef(null);
  const itemRefs = useRef([]);
  const joinedSessionIdRef = useRef(null);

  const sortedSessions = useMemo(
    () => (watchedIds ? sortSessions(rawSessions, watchedIds) : []),
    [rawSessions, watchedIds]
  );

  // ── Charge les ids "déjà vu" une seule fois ───────────────────
  useEffect(() => {
    setWatchedIds(WatchedAvatarStore.load());
  }, []);

  // ── Écoute live_avatar_sessions where isLive == true ──────────
  useEffect(() => {
    if (watchedIds === null) return; // attend le chargement du store local
    if (!authUser) return; // attend un utilisateur authentifié (isAuth())

    const q = query(collection(db, 'live_avatar_sessions'), where('isLive', '==', true));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setRawSessions(snap.docs.map((d) => ({ id: d.id, data: d.data() })));
        setLoading(false);
      },
      () => {
        setRawSessions([]);
        setLoading(false);
      }
    );
    return unsub;
  }, [watchedIds, authUser]);

  // Clamp currentIndex si la liste se réduit sous nos pieds
  useEffect(() => {
    if (sortedSessions.length === 0) return;
    if (currentIndex >= sortedSessions.length) {
      setCurrentIndex(sortedSessions.length - 1);
    }
  }, [sortedSessions.length, currentIndex]);

  const schedulePreload = useCallback((index) => {
    setPreloadedIndices((prev) => {
      const start = Math.max(0, index - PRELOAD_RADIUS);
      const end = Math.min(sortedSessions.length - 1, index + PRELOAD_RADIUS);
      let changed = false;
      const next = new Set(prev);
      for (let i = start; i <= end; i++) {
        if (!next.has(i)) { next.add(i); changed = true; }
      }
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortedSessions.length]);

  const markWatched = useCallback((index) => {
    const sess = sortedSessions[index];
    if (!sess) return;
    setWatchedIds((prev) => {
      if (prev.has(sess.id)) return prev;
      return WatchedAvatarStore.markWatched(sess.id, prev);
    });
  }, [sortedSessions]);

  // ── IntersectionObserver : équivalent de onPageChanged ────────
  useEffect(() => {
    const container = scrollRef.current;
    if (!container || sortedSessions.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
            const index = Number(entry.target.dataset.index);
            setCurrentIndex((prevIndex) => {
              if (index === prevIndex) return prevIndex;
              if (navigator.vibrate) navigator.vibrate(8);
              markWatched(prevIndex);
              schedulePreload(index);
              return index;
            });
          }
        });
      },
      { root: container, threshold: [0.6] }
    );

    itemRefs.current.forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortedSessions.length, markWatched, schedulePreload]);

  useEffect(() => {
    schedulePreload(currentIndex);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortedSessions.length]);

  // ── Rejoint/quitte la session active selon isActive (onglet visible) ─
  useEffect(() => {
    if (!isActive) {
      joinedSessionIdRef.current = null;
      return;
    }
    const sess = sortedSessions[currentIndex];
    if (sess) joinedSessionIdRef.current = sess.id;
  }, [isActive, currentIndex, sortedSessions]);

  if (authUser === undefined || loading || watchedIds === null) {
    return <LoadingView />;
  }

  if (authUser === null) {
    return <AuthRequiredView />;
  }

  if (sortedSessions.length === 0) {
    return <EmptyView />;
  }

  const unseenCount = sortedSessions.filter((s) => !watchedIds.has(s.id)).length;

  return (
    <div className={styles.page}>
      <div className={styles.scrollContainer} ref={scrollRef}>
        {sortedSessions.map((sess, index) => {
          const isCurrent = index === currentIndex;
          const isSeen = watchedIds.has(sess.id);
          const inWindow = preloadedIndices.has(index) || Math.abs(index - currentIndex) <= 1;

          return (
            <div
              key={sess.id}
              data-index={index}
              ref={(el) => { itemRefs.current[index] = el; }}
              className={styles.slide}
            >
              {inWindow ? (
                <>
                  <UltraLivePage
                    sessionId={sess.id}
                    viewerId={viewerId}
                    isActive={isActive && isCurrent}
                  />
                  {/* FriTok AI Live Assistant (Modules 1-5) — composant
                      invisible (retourne null), monté en FRÈRE de
                      UltraLivePage, jamais en parent/enfant modifié.
                      Observe les commentaires en lecture seule et
                      déclenche la réponse IA ; celle-ci s'affiche ensuite
                      dans le fil de chat existant via le onSnapshot déjà
                      en place dans UltraLivePage.js — aucune autre
                      modification requise ici. */}
                  <AiLiveAssistantBridge
                    sessionId={sess.id}
                    enabled={isActive && isCurrent}
                  />
                  {isSeen && <WatchedBadge />}
                </>
              ) : (
                <div className={styles.slidePlaceholder} />
              )}
            </div>
          );
        })}
      </div>

      <div className={styles.hudBar}>
        <div className={styles.liveBadge}>
          <span className={styles.liveDot} />
          LIVE
        </div>
        {unseenCount > 0 && (
          <span className={styles.unseenChip}>
            {unseenCount} nouveau{unseenCount > 1 ? 'x' : ''}
          </span>
        )}
        <div className={styles.spacer} />
        <DotsIndicator current={currentIndex} total={sortedSessions.length} />
      </div>

      {sortedSessions.length > 1 && currentIndex === 0 && <ScrollHint />}
    </div>
  );
}

/* ─────────────────────────────────────────────
   Sous-composants
───────────────────────────────────────────── */
function WatchedBadge() {
  return (
    <div className={styles.watchedBadge}>
      <span>👁 Déjà vu</span>
    </div>
  );
}

function DotsIndicator({ current, total }) {
  if (total <= 1) return null;
  const MAX_VISIBLE = 5;
  const displayTotal = Math.min(total, MAX_VISIBLE);
  const activeDot = Math.min(current, MAX_VISIBLE - 1);

  return (
    <div className={styles.dots}>
      {Array.from({ length: displayTotal }).map((_, i) => (
        <span key={i} className={i === activeDot ? styles.dotActive : styles.dot} />
      ))}
    </div>
  );
}

function ScrollHint() {
  return (
    <div className={styles.scrollHint}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="6 9 12 15 18 9" />
      </svg>
      <span>Swipe pour voir d'autres lives</span>
    </div>
  );
}

function LoadingView() {
  return (
    <div className={styles.loadingScreen}>
      <div className={styles.loadingIconWrap}>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#ff453a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 12h4M18 12h4M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8" />
        </svg>
      </div>
      <p>Recherche des lives…</p>
    </div>
  );
}

function AuthRequiredView() {
  return (
    <div className={styles.emptyScreen}>
      <div className={styles.emptyIconWrap}>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <path d="M9 12l2 2 4-4" />
        </svg>
      </div>
      <p className={styles.emptyTitle}>Connexion requise</p>
      <p className={styles.emptySub}>Connectez-vous pour regarder les lives.</p>
      <a
        href="/login"
        style={{
          marginTop: 16, padding: '12px 28px', borderRadius: 12,
          background: '#f5f5f7', color: '#08080a', fontWeight: 700,
          fontSize: 14, textDecoration: 'none',
        }}
      >
        Se connecter
      </a>
    </div>
  );
}

function EmptyView() {
  return (
    <div className={styles.emptyScreen}>
      <div className={styles.emptyIconWrap}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M23 7l-7 5 7 5V7z" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
          <line x1="1" y1="1" x2="23" y2="23" />
        </svg>
      </div>
      <p className={styles.emptyTitle}>Aucun live en cours</p>
      <p className={styles.emptySub}>Reviens plus tard ou rafraîchis</p>
    </div>
  );
}