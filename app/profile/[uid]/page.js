'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  collection, query, where, orderBy, limit,
  getDocs, onSnapshot, doc, setDoc, deleteDoc, serverTimestamp,
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '../../../lib/firebaseClient';
import styles from './profile.module.css';

/* ══════════════════════════════════════════════════════════
   NOTE D'ARCHITECTURE — IMPORTANT
   ──────────────────────────────────────────────────────────
   Cette page affiche le profil d'un utilisateur TIERS (pas
   forcément soi-même). Or firestore.rules restreint la lecture
   de /users/{uid} au seul propriétaire (`allow read: if
   isOwner(uid)`), et c'est volontaire : ce document contient
   wallet/solde/points/level/subscription — des champs financiers
   qui ne doivent JAMAIS être exposés à un autre client, et
   Firestore ne permet pas de restreindre la lecture à certains
   champs seulement (c'est tout le document ou rien).

   Plutôt que d'affaiblir cette règle (ce qui exposerait le wallet
   de tout le monde à tout le monde), cette page reconstruit un
   "profil public" à partir de données déjà publiques :

     - rôle "Vendeur" / "Membre"  → déduit de la présence de
       vidéos dans video_playlist (userId == uid). C'est une
       heuristique, pas le vrai champ `role` du compte : un
       Client pourrait théoriquement avoir 0 vidéo et s'afficher
       comme "Membre" même s'il a le rôle Vendeur en base (compte
       fraîchement créé, abonnement expiré, etc.) — sans
       conséquence de sécurité (la création de vidéo reste gardée
       côté rules par hasActiveSubscription()), juste un affichage
       parfois imprécis.
     - pseudo/handle affiché  → dérivé du champ `title` de la
       dernière vidéo publiée (qui sert déjà de pseudo affiché
       dans le feed /demo, ex. "@nom_boutique"), ou de
       authUser.displayName si c'est SON PROPRE profil.
     - avatar → cercle avec initiale (même style que le feed),
       pas de vraie photo pour un profil tiers (aucune source
       publique de photoURL actuellement).

   Si tu veux un vrai profil public fiable (photo, bio, rôle réel)
   pour tout le monde — y compris les comptes sans aucune vidéo —
   la solution propre est une collection dédiée /public_profiles/{uid}
   {displayName, photoURL, role}, écrite par le client sur SES
   PROPRES champs uniquement (donc sans risque : un utilisateur ne
   peut mentir que sur sa propre fiche), avec une règle simple :
     allow read: if isAuth();
     allow write: if isOwner(uid) && request.resource.data.keys().hasOnly([...]);
   Je peux la mettre en place si tu veux fiabiliser l'affichage.
══════════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════════
   ICÔNES
══════════════════════════════════════════════════════════ */
function IconBack() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="12" x2="5" y2="12"/>
      <polyline points="12 19 5 12 12 5"/>
    </svg>
  );
}
function IconHeartSm() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="#fff" stroke="none">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
    </svg>
  );
}

/* ══════════════════════════════════════════════════════════
   HOOK : FOLLOW (identique au pattern de /demo — voir demo.js)
   Modèle bidirectionnel :
     users/{profileUid}/followers/{authUid}
     users/{authUid}/following/{profileUid}
══════════════════════════════════════════════════════════ */
function useFollow(profileUid, authUser) {
  const [following,     setFollowing]     = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [ready,         setReady]         = useState(false);

  const isSelf = !!(authUser?.uid && profileUid && authUser.uid === profileUid);

  useEffect(() => {
    if (!profileUid || !authUser?.uid || isSelf) { setReady(true); return; }
    const followRef = doc(db, 'users', profileUid, 'followers', authUser.uid);
    const unsub = onSnapshot(followRef, snap => {
      setFollowing(snap.exists());
      setReady(true);
    }, () => setReady(true));
    return unsub;
  }, [profileUid, authUser?.uid, isSelf]);

  useEffect(() => {
    if (!profileUid) return;
    const unsub = onSnapshot(
      collection(db, 'users', profileUid, 'followers'),
      snap => setFollowerCount(snap.size),
      () => {}
    );
    return unsub;
  }, [profileUid]);

  const toggle = useCallback(async () => {
    if (!authUser?.uid || !profileUid || isSelf) return;

    const followerRef  = doc(db, 'users', profileUid,   'followers', authUser.uid);
    const followingRef = doc(db, 'users', authUser.uid, 'following', profileUid);

    if (following) {
      setFollowing(false);
      await Promise.all([deleteDoc(followerRef), deleteDoc(followingRef)])
        .catch(() => setFollowing(true));
    } else {
      setFollowing(true);
      await Promise.all([
        setDoc(followerRef,  { userId: authUser.uid, createdAt: serverTimestamp() }),
        setDoc(followingRef, { userId: profileUid,    createdAt: serverTimestamp() }),
      ]).catch(() => setFollowing(false));
    }
  }, [following, profileUid, authUser?.uid, isSelf]);

  return { following, followerCount, toggle, ready, isSelf };
}

/* ══════════════════════════════════════════════════════════
   HOOK : compteur "Abonnements" (combien de personnes uid suit)
══════════════════════════════════════════════════════════ */
function useFollowingCount(uid) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!uid) return;
    const unsub = onSnapshot(
      collection(db, 'users', uid, 'following'),
      snap => setCount(snap.size),
      () => {}
    );
    return unsub;
  }, [uid]);
  return count;
}

/* ══════════════════════════════════════════════════════════
   HOOK : liste "Abonnements" temps réel + résolution du pseudo
   affiché pour chaque personne suivie.
   La résolution (getDocs, one-shot) part de video_playlist,
   seule source publique de pseudo actuellement disponible côté
   client (voir NOTE D'ARCHITECTURE en haut du fichier) — capée à
   100 entrées pour rester légère.
══════════════════════════════════════════════════════════ */
function useFollowingList(uid) {
  const [list,   setList]   = useState([]);
  const [labels, setLabels] = useState({});
  const resolvedRef = useRef(new Set());

  useEffect(() => {
    if (!uid) return;
    const q = query(
      collection(db, 'users', uid, 'following'),
      orderBy('createdAt', 'desc'),
      limit(100)
    );
    const unsub = onSnapshot(q, snap => {
      setList(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, () => {});
    return unsub;
  }, [uid]);

  useEffect(() => {
    let cancelled = false;
    async function resolveNew() {
      const toResolve = list.filter(f => !resolvedRef.current.has(f.id));
      for (const f of toResolve) {
        resolvedRef.current.add(f.id);
        try {
          const snap = await getDocs(query(
            collection(db, 'video_playlist'),
            where('userId', '==', f.id),
            limit(1)
          ));
          const handle = snap.docs[0]?.data()?.title ?? null;
          if (!cancelled) setLabels(prev => ({ ...prev, [f.id]: handle }));
        } catch {
          if (!cancelled) setLabels(prev => ({ ...prev, [f.id]: null }));
        }
      }
    }
    if (list.length) resolveNew();
    return () => { cancelled = true; };
  }, [list]);

  return { list, labels };
}

/* ══════════════════════════════════════════════════════════
   HOOK : vidéos publiées par uid (userId == uid)
   Pas de orderBy côté requête (évite un index composite
   userId+createdAt à créer manuellement) — tri fait côté client.
══════════════════════════════════════════════════════════ */
function useProfileVideos(uid) {
  const [videos,  setVideos]  = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) return;
    const q = query(collection(db, 'video_playlist'), where('userId', '==', uid));
    const unsub = onSnapshot(q, snap => {
      const vids = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      vids.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
      setVideos(vids);
      setLoading(false);
    }, () => setLoading(false));
    return unsub;
  }, [uid]);

  return { videos, loading };
}

/* ══════════════════════════════════════════════════════════
   HOOK : total des likes cumulés sur les vidéos données
   Un listener par vidéo (video_playlist/{id}/likes), même
   pattern que useLike dans /demo — sommé ici.
══════════════════════════════════════════════════════════ */
function useVideoLikeCounts(videoIds) {
  const [counts, setCounts] = useState({});
  const idsKey = videoIds.join(',');

  useEffect(() => {
    if (!videoIds.length) { setCounts({}); return; }
    const unsubs = videoIds.map(id =>
      onSnapshot(
        collection(db, 'video_playlist', id, 'likes'),
        snap => setCounts(prev => ({ ...prev, [id]: snap.size })),
        () => {}
      )
    );
    return () => unsubs.forEach(u => u && u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  return counts;
}

/* ══════════════════════════════════════════════════════════
   SKELETON
══════════════════════════════════════════════════════════ */
function GridSkeleton() {
  return (
    <div className={styles.gridSkeleton}>
      {[1, 2, 3, 4, 5, 6].map(i => <div key={i} className={styles.gridSkeletonCell}/>)}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   PAGE /profile/[uid]
══════════════════════════════════════════════════════════ */
export default function ProfilePage() {
  const params = useParams();
  const router = useRouter();
  const uid = typeof params?.uid === 'string' ? params.uid : Array.isArray(params?.uid) ? params.uid[0] : null;

  const [authUser,  setAuthUser]  = useState(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, user => {
      setAuthUser(user?.emailVerified ? user : null);
      setAuthReady(true);
    });
    return unsub;
  }, []);

  const { following, followerCount, toggle: toggleFollow, ready: followReady, isSelf } =
    useFollow(uid, authUser);
  const followingCount = useFollowingCount(uid);
  const { videos, loading: videosLoading } = useProfileVideos(uid);
  const videoIds = useMemo(() => videos.map(v => v.id), [videos]);
  const likeCounts = useVideoLikeCounts(videoIds);
  const totalLikes = useMemo(
    () => Object.values(likeCounts).reduce((a, b) => a + b, 0),
    [likeCounts]
  );
  const { list: followingList, labels: followingLabels } = useFollowingList(uid);

  const hasVideos = videos.length > 0;

  // Pseudo affiché — voir NOTE D'ARCHITECTURE en tête de fichier.
  const handle = isSelf
    ? (authUser?.displayName || authUser?.email?.split('@')[0] || 'Moi')
    : (videos[0]?.title || `Membre #${(uid || '').slice(0, 6)}`);
  const initial = (handle || '?').replace('@', '')[0]?.toUpperCase() ?? '?';

  const handleFollowClick = () => {
    if (!authReady) return;
    if (!authUser) { router.push('/login'); return; }
    toggleFollow();
  };

  if (!uid) return null;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <button className={styles.backBtn} onClick={() => router.back()} aria-label="Retour">
          <IconBack/>
        </button>
        <span className={styles.headerTitle}>Profil</span>
        <span style={{ width: 36 }}/>
      </div>

      <div className={styles.profileTop}>
        <div className={styles.avatarBig}>
          {isSelf && authUser?.photoURL
            ? <img src={authUser.photoURL} alt="" className={styles.avatarImg}/>
            : initial}
        </div>
        <p className={styles.handleText}>{handle}</p>
        <span className={styles.roleBadge}>{hasVideos ? 'Vendeur' : 'Membre'}</span>

        <div className={styles.statsRow}>
          <div className={styles.statItem}>
            <span className={styles.statValue}>{followingCount}</span>
            <span className={styles.statLabel}>Abonnements</span>
          </div>
          <div className={styles.statDivider}/>
          <div className={styles.statItem}>
            <span className={styles.statValue}>{followerCount}</span>
            <span className={styles.statLabel}>Abonnés</span>
          </div>
          <div className={styles.statDivider}/>
          <div className={styles.statItem}>
            <span className={styles.statValue}>{totalLikes}</span>
            <span className={styles.statLabel}>J'aime</span>
          </div>
        </div>

        {!isSelf && (
          <button
            className={following ? styles.followBtnActive : styles.followBtnMain}
            onClick={handleFollowClick}
            disabled={!followReady}
          >
            {following ? 'Abonné ✓' : 'Suivre'}
          </button>
        )}
        {isSelf && <span className={styles.selfTag}>C'est votre profil</span>}
      </div>

      <div className={styles.content}>
        {hasVideos ? (
          <>
            <p className={styles.sectionLabel}>Vidéos publiées ({videos.length})</p>

            {videosLoading ? (
              <GridSkeleton/>
            ) : (
              <div className={styles.videoGrid}>
                {videos.map(v => (
                  <button
                    key={v.id}
                    className={styles.videoCell}
                    onClick={() => router.push('/demo')}
                    aria-label={v.title || 'Vidéo'}
                  >
                    <img
                      src={v.product?.thumbnail || v.product?.image || ''}
                      alt={v.title || ''}
                      className={styles.videoCellImg}
                      onError={e => { e.currentTarget.style.display = 'none'; }}
                    />
                    <div className={styles.videoCellOverlay}>
                      <IconHeartSm/> <span>{likeCounts[v.id] ?? 0}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <p className={styles.sectionLabel}>Abonnements ({followingList.length})</p>

            {followingList.length === 0 ? (
              <div className={styles.emptyBox}><p>Ne suit encore personne.</p></div>
            ) : (
              <div className={styles.followList}>
                {followingList.map(f => {
                  const label = followingLabels[f.id] || `Membre #${f.id.slice(0, 6)}`;
                  const ini = (label.replace('@', '')[0] || '?').toUpperCase();
                  return (
                    <button
                      key={f.id}
                      className={styles.followRow}
                      onClick={() => router.push(`/profile/${f.id}`)}
                    >
                      <div className={styles.followAvatar}>{ini}</div>
                      <span className={styles.followName}>{label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}