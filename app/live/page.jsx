'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  collection, query, orderBy, where, limit, startAfter,
  onSnapshot, doc, updateDoc, getDocs, getDoc,
  addDoc, setDoc, deleteDoc, serverTimestamp, getCountFromServer,
} from 'firebase/firestore';
import { onAuthStateChanged, updateProfile } from 'firebase/auth';
import QRCode from 'qrcode';
import { db, auth } from '../../lib/firebaseClient';
import { useAgoraPlayer } from '../../lib/useAgoraPlayer';
import styles from './live.module.css';

/* ══════════════════════════════════════════════════════════
   PAYS / VILLES / TARIFS DE LIVRAISON
   ── ÉTENDU (multi-pays Afrique de l'Ouest) ──
   Même structure que demo.js (voir ce fichier pour le détail des
   notes) — dupliquée ici volontairement, comme le reste des
   composants partagés entre /demo et /live dans ce projet.

   ⚠️ TARIFS non-CI = PLACEHOLDERS, à remplacer par tes vrais barèmes
   avant mise en production sur ces marchés.
   ⚠️ villeDepart reste approximé par la ville "hub" du pays choisi,
   faute de connaître la ville réelle du vendeur ici.
══════════════════════════════════════════════════════════ */
const COUNTRIES = {
  CI: {
    label: "Côte d'Ivoire",
    currency: 'XOF',
    hub: 'Abidjan',
    villes: [
      'Abidjan','Bouaké','Daloa','Korhogo','Yamoussoukro','San-Pédro',
      'Man','Divo','Gagnoa','Abengourou','Soubré','Odienné','Duekoué',
      'Bondoukou','Mankono','Séguéla','Touba','Ferkessédougou','Katiola',
      'Agboville','Adzopé','Tiassalé','Lakota','Issia','Sassandra',
    ],
    tarifs: {
      'Abidjan': { 'Abidjan': 1500, 'Bouaké': 2500, default: 3000 },
      'Bouaké' : { 'Bouaké' : 1500, 'Abidjan': 2500, default: 3500 },
      default  : { default: 3000 },
    },
    fallback: 8000,
  },
  SN: {
    label: 'Sénégal',
    currency: 'XOF',
    hub: 'Dakar',
    villes: [
      'Dakar','Thiès','Rufisque','Mbour','Saint-Louis','Kaolack',
      'Ziguinchor','Touba','Diourbel','Louga','Tambacounda','Kolda',
    ],
    // PLACEHOLDER — à remplacer par de vrais tarifs Sénégal.
    tarifs: {
      'Dakar': { 'Dakar': 1500, 'Thiès': 2500, default: 3000 },
      default: { default: 3500 },
    },
    fallback: 8000,
  },
  GH: {
    label: 'Ghana',
    currency: 'GHS',
    hub: 'Accra',
    villes: [
      'Accra','Kumasi','Tamale','Sekondi-Takoradi','Ashaiman',
      'Sunyani','Cape Coast','Obuasi','Teshie','Tema',
    ],
    // PLACEHOLDER — à remplacer par de vrais tarifs Ghana (GHS).
    tarifs: {
      'Accra':  { 'Accra': 20, 'Kumasi': 35, default: 40 },
      'Kumasi': { 'Kumasi': 20, 'Accra': 35, default: 40 },
      default:  { default: 45 },
    },
    fallback: 100,
  },
  NG: {
    label: 'Nigeria',
    currency: 'NGN',
    hub: 'Lagos',
    villes: [
      'Lagos','Abuja','Kano','Ibadan','Port Harcourt','Benin City',
      'Kaduna','Enugu','Aba','Onitsha',
    ],
    // PLACEHOLDER — à remplacer par de vrais tarifs Nigeria (NGN).
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
    villes: [
      'Cotonou','Porto-Novo','Parakou','Djougou','Bohicon',
      'Kandi','Ouidah','Abomey','Natitingou','Lokossa',
    ],
    // PLACEHOLDER — à remplacer par de vrais tarifs Bénin.
    tarifs: {
      'Cotonou': { 'Cotonou': 1000, 'Porto-Novo': 2000, default: 2500 },
      default:   { default: 3000 },
    },
    fallback: 8000,
  },
  TG: {
    label: 'Togo',
    currency: 'XOF',
    hub: 'Lomé',
    villes: [
      'Lomé','Sokodé','Kara','Kpalimé','Atakpamé',
      'Dapaong','Tsévié','Aného','Bassar','Notsé',
    ],
    // PLACEHOLDER — à remplacer par de vrais tarifs Togo.
    tarifs: {
      'Lomé':  { 'Lomé': 1000, 'Sokodé': 2500, default: 3000 },
      default: { default: 3500 },
    },
    fallback: 8000,
  },
  BF: {
    label: 'Burkina Faso',
    currency: 'XOF',
    hub: 'Ouagadougou',
    villes: [
      'Ouagadougou','Bobo-Dioulasso','Koudougou','Banfora','Ouahigouya',
      'Kaya','Tenkodogo','Fada N\'Gourma','Dédougou','Gaoua',
    ],
    // PLACEHOLDER — à remplacer par de vrais tarifs Burkina Faso.
    tarifs: {
      'Ouagadougou':    { 'Ouagadougou': 1000, 'Bobo-Dioulasso': 2500, default: 3000 },
      'Bobo-Dioulasso': { 'Bobo-Dioulasso': 1000, 'Ouagadougou': 2500, default: 3000 },
      default:          { default: 3500 },
    },
    fallback: 8000,
  },
};

const DEFAULT_COUNTRY = 'CI';
const CURRENCY_SUFFIX = { XOF: 'XOF', GHS: 'GH₵', NGN: '₦' };

function getFrais(countryCode, villeVendeur, villeClient, typeLivr) {
  const country = COUNTRIES[countryCode] ?? COUNTRIES[DEFAULT_COUNTRY];
  const table   = country.tarifs;
  const base = (table[villeVendeur] ?? table.default)[villeClient]
            ?? (table[villeVendeur] ?? table.default).default
            ?? country.fallback;
  return typeLivr === 'groupee' ? Math.round(base * 0.8) : base;
}

const fmt = (n, countryCode = DEFAULT_COUNTRY) => {
  const currency = COUNTRIES[countryCode]?.currency ?? 'XOF';
  return Number(n).toLocaleString('fr-FR') + ' ' + (CURRENCY_SUFFIX[currency] ?? currency);
};

// Taille de page pour la liste des lives/replays (P0 — voir
// analyse-scalabilite-fritok.md, point 4 : plus de requête sans limit()
// sur live_sessions, qui ne faisait auparavant que grossir indéfiniment,
// lives terminés depuis longtemps compris).
const LIVE_PAGE_SIZE = 20;

// Nombre de commentaires live chargés/synchronisés en temps réel (P0 —
// voir point 3 : le chat live n'avait auparavant AUCUNE limite, donc
// chaque nouvel arrivant téléchargeait tout l'historique complet, et
// chaque nouveau message fan-out un read vers chaque spectateur connecté).
const LIVE_CHAT_LIMIT = 100;

// ── Profil vidéo/audio co-host adapté 4G Afrique ────────────────────────────
const COHOST_VIDEO_PROFILE = {
  width: { ideal: 320 }, height: { ideal: 240 },
  frameRate: { ideal: 15, max: 18 },
  bitrateMin: 80, bitrateMax: 350,
};
const COHOST_AUDIO_PROFILE = 'speech_standard'; // ~18kbps, voix uniquement

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
function IconClose() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
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
function IconMic() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
      <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
      <line x1="12" y1="19" x2="12" y2="23"/>
      <line x1="8" y1="23" x2="16" y2="23"/>
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
   HOOK : LIKES persistés Firestore pour un live
   Sous-collection : live_sessions/{id}/likes/{userId}
   ⚠️ P0 — CORRIGÉ (voir analyse-scalabilite-fritok.md, point 2) : le
   compteur écoutait auparavant TOUTE la sous-collection `likes` en
   onSnapshot pour en déduire snap.size — sur un live à forte audience,
   chaque like ajouté fan-out un read vers CHAQUE spectateur connecté
   simultanément. Remplacé par une agrégation ponctuelle
   (getCountFromServer) au montage, + incrément optimiste local sur
   l'action de CET utilisateur uniquement (le statut "j'ai liké" reste
   un onSnapshot, mais sur un seul document — coût négligeable).
══════════════════════════════════════════════════════════ */
function useLiveLike(sessionId, initialCount, authUser) {
  const [liked, setLiked] = useState(false);
  const [count, setCount] = useState(initialCount ?? 0);

  useEffect(() => {
    if (!sessionId || !authUser?.uid) return;
    const likeRef = doc(db, 'live_sessions', sessionId, 'likes', authUser.uid);
    const unsub = onSnapshot(likeRef, snap => setLiked(snap.exists()), () => {});
    return unsub;
  }, [sessionId, authUser?.uid]);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    getCountFromServer(collection(db, 'live_sessions', sessionId, 'likes'))
      .then(snap => { if (!cancelled) setCount(snap.data().count); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [sessionId]);

  const toggle = useCallback(async () => {
    if (!authUser?.uid || !sessionId) return;
    const likeRef = doc(db, 'live_sessions', sessionId, 'likes', authUser.uid);
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
  }, [liked, sessionId, authUser?.uid]);

  return { liked, count, toggle };
}

/* ══════════════════════════════════════════════════════════
   HELPER STYLE CO-HOST
══════════════════════════════════════════════════════════ */
function coHostBtnStyle(color, noClick = false) {
  return {
    background: 'none', border: 'none',
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', gap: 1, padding: '5px 0',
    cursor: noClick ? 'default' : 'pointer',
    filter: 'drop-shadow(0 1px 4px rgba(0,0,0,0.6))',
    position: 'relative',
  };
}

/* ══════════════════════════════════════════════════════════
   BOUTON CO-HOST — demande temps réel
   Cycle : idle → pending → joining → live | declined | removed
══════════════════════════════════════════════════════════ */
function CoHostButton({ session, authUser }) {
  const [status,   setStatus]   = useState('idle');
  const [errorMsg, setErrorMsg] = useState(null);

  const unsubDocRef    = useRef(null);
  const unsubTokenRef  = useRef(null); // écoute du token privé (voir _listenForToken)
  const agoraClientRef = useRef(null);
  const tracksRef      = useRef({ audio: null, video: null });
  const localDivRef    = useRef(null);
  const isMountedRef   = useRef(true);

  const [cameraOn,       setCameraOn]       = useState(true);
  const [micOn,          setMicOn]          = useState(true);
  const [facingMode,     setFacingMode]     = useState('user');
  const [switchingCamera,setSwitchingCamera]= useState(false);

  const AGORA_APP_ID_V = process.env.NEXT_PUBLIC_AGORA_APP_ID;

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      unsubDocRef.current?.();
      unsubTokenRef.current?.();
      _releaseCoHostAgora();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (status === 'declined' || status === 'removed') {
      _releaseCoHostAgora();
      const t = setTimeout(() => {
        deleteDoc(doc(db, 'live_sessions', session.channelId, 'co_hosts', authUser.uid)).catch(() => {});
        if (isMountedRef.current) setStatus('idle');
      }, 3000);
      return () => clearTimeout(t);
    }
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!session.isLive || session.coHostEnabled === false) return null;
  if (!authUser) return null;
  const sellerId = session.sellerId ?? session.userId ?? '';
  if (authUser.uid === sellerId) return null;

  const channelId   = session.channelId;
  const uid         = authUser.uid;
  const displayName = authUser.displayName
    || authUser.email?.split('@')[0]
    || 'Viewer';

  async function _releaseCoHostAgora() {
    try {
      const { audio, video } = tracksRef.current;
      audio?.stop(); audio?.close();
      video?.stop(); video?.close();
      tracksRef.current = { audio: null, video: null };
      if (agoraClientRef.current) {
        await agoraClientRef.current.leave();
        agoraClientRef.current = null;
      }
    } catch (_) {}
  }

  async function _loadSdk() {
    if (window.AgoraRTC) return;
    await new Promise((resolve, reject) => {
      if (document.querySelector('script[src*="AgoraRTC_N"]')) { resolve(); return; }
      const s = document.createElement('script');
      s.src = 'https://download.agora.io/sdk/release/AgoraRTC_N-4.22.1.js';
      s.async = true;
      s.onload = resolve;
      s.onerror = () => reject(new Error('SDK Agora introuvable'));
      document.head.appendChild(s);
    });
  }

  async function _joinAsCoHost(token, agoraUid) {
    if (!isMountedRef.current) return;
    if (!AGORA_APP_ID_V) {
      console.error('❌ NEXT_PUBLIC_AGORA_APP_ID manquant côté client (co-host).');
      if (isMountedRef.current) {
        setStatus('idle');
        setErrorMsg('Config Agora manquante côté client.');
      }
      return;
    }
    setStatus('joining');
    try {
      await _loadSdk();
      const AgoraRTC = window.AgoraRTC;
      AgoraRTC.setLogLevel(3);

      const client = AgoraRTC.createClient({ mode: 'live', codec: 'h264' });
      agoraClientRef.current = client;

      await client.setClientRole('host');
      await client.join(AGORA_APP_ID_V, channelId, token, agoraUid);

      let audioTrack = null, videoTrack = null;
      try {
        [audioTrack, videoTrack] = await AgoraRTC.createMicrophoneAndCameraTracks(
          { encoderConfig: COHOST_AUDIO_PROFILE },
          { encoderConfig: COHOST_VIDEO_PROFILE, optimizationMode: 'motion' }
        );
      } catch {
        try { [audioTrack, videoTrack] = await AgoraRTC.createMicrophoneAndCameraTracks({}, {}); }
        catch (e1) {
          try { audioTrack = await AgoraRTC.createMicrophoneAudioTrack(); }
          catch (e2) { throw new Error('Micro inaccessible : ' + e2.message); }
        }
      }
      tracksRef.current = { audio: audioTrack, video: videoTrack };

      const toPublish = [audioTrack, videoTrack].filter(Boolean);
      if (toPublish.length) await client.publish(toPublish);

      if (!isMountedRef.current) {
        await _releaseCoHostAgora();
        return;
      }

      if (videoTrack) {
        setTimeout(() => {
          if (localDivRef.current && isMountedRef.current) {
            videoTrack.play(localDivRef.current);
          }
        }, 150);
      }

      setCameraOn(true);
      setMicOn(true);
      setFacingMode('user');
      setStatus('live');
    } catch (err) {
      console.error('❌ _joinAsCoHost:', err);
      await _releaseCoHostAgora();
      if (isMountedRef.current) {
        setStatus('idle');
        setErrorMsg('Erreur: ' + err.message);
      }
    }
  }

  const requestCoHost = async () => {
    if (status !== 'idle') return;
    setErrorMsg(null);
    try {
      await setDoc(doc(db, 'live_sessions', channelId, 'co_hosts', uid), {
        displayName,
        avatarUrl:   authUser.photoURL ?? null,
        status:      'pending',
        requestedAt: serverTimestamp(),
      });
      if (!isMountedRef.current) return;
      setStatus('pending');

      unsubDocRef.current = onSnapshot(
        doc(db, 'live_sessions', channelId, 'co_hosts', uid),
        (snap) => {
          if (!snap.exists()) {
            if (isMountedRef.current) setStatus('idle');
            return;
          }
          const d = snap.data();
          // ── CORRIGÉ ──
          // Le token Agora n'est PLUS écrit sur ce document co_hosts (voir
          // GoLive.jsx, en-tête : "token Agora → lu dans
          // /notifications/{uid}/items/cohost_token_{channelId}" — changement
          // volontaire côté serveur pour ne jamais exposer un token Agora sur
          // un document que d'autres viewers peuvent potentiellement lister).
          // d.token/d.agoraUid ne sont donc plus jamais présents ici : la
          // condition précédente (`d.status === 'active' && d.token &&
          // d.agoraUid`) ne devenait jamais vraie, et le co-host restait
          // bloqué sur "Connexion..." malgré l'acceptation côté vendeur.
          // On passe maintenant setStatus('joining') dès l'acceptation, et on
          // va chercher le token dans la notification privée dédiée.
          if (d.status === 'active') {
            unsubDocRef.current?.();
            if (isMountedRef.current) setStatus('joining');
            _listenForToken();
          } else if (d.status === 'declined') {
            unsubDocRef.current?.();
            if (isMountedRef.current) setStatus('declined');
          } else if (d.status === 'removed') {
            unsubDocRef.current?.();
            if (isMountedRef.current) setStatus('removed');
          }
        },
        (err) => console.warn('co_host listener:', err)
      );
    } catch (e) {
      console.error('requestCoHost:', e.code ?? e.message ?? e);
      if (isMountedRef.current) {
        setErrorMsg(
          e.code === 'permission-denied'
            ? 'Refusé par les règles Firestore (voir console).'
            : 'Erreur réseau.'
        );
      }
    }
  };

  // Écoute la notification privée contenant le token Agora, livrée par le
  // serveur (secureCall('accept-cohost', ...) dans GoLive.jsx) une fois le
  // vendeur ayant accepté. Chemin et présence de cette notification décrits
  // dans l'en-tête de GoLive.jsx. En onSnapshot (pas une lecture ponctuelle)
  // car l'écriture du statut 'active' sur co_hosts et celle de cette
  // notification sont deux opérations serveur distinctes qui peuvent ne pas
  // arriver dans le même instant — écouter évite une course perdue si la
  // notification arrive juste après notre premier essai de lecture.
  function _listenForToken() {
    const notifRef = doc(db, 'notifications', uid, 'items', `cohost_token_${channelId}`);
    unsubTokenRef.current = onSnapshot(
      notifRef,
      async (snap) => {
        if (!snap.exists()) return;
        const nd = snap.data();
        if (nd.agoraToken && nd.agoraUid != null) {
          unsubTokenRef.current?.();
          await _joinAsCoHost(nd.agoraToken, nd.agoraUid);
        }
      },
      (err) => {
        console.warn('cohost token listener:', err);
        if (isMountedRef.current) {
          setErrorMsg('Token de connexion introuvable.');
          setStatus('idle');
        }
      }
    );
  }

  const cancelRequest = async () => {
    unsubDocRef.current?.();
    unsubTokenRef.current?.();
    await deleteDoc(doc(db, 'live_sessions', channelId, 'co_hosts', uid)).catch(() => {});
    if (isMountedRef.current) setStatus('idle');
  };

  const leaveStage = async () => {
    unsubTokenRef.current?.();
    try {
      await updateDoc(doc(db, 'live_sessions', channelId, 'co_hosts', uid), {
        status: 'left', leftAt: serverTimestamp(),
      });
      await deleteDoc(doc(db, 'live_sessions', channelId, 'co_hosts', uid)).catch(() => {});
    } finally {
      await _releaseCoHostAgora();
      if (isMountedRef.current) setStatus('idle');
    }
  };

  const toggleCoHostCamera = async () => {
    const videoTrack = tracksRef.current?.video;
    if (!videoTrack) return;
    try {
      const next = !cameraOn;
      await videoTrack.setEnabled(next);
      if (isMountedRef.current) setCameraOn(next);
    } catch (e) {
      console.warn('⚠️ toggleCoHostCamera:', e);
    }
  };

  const toggleCoHostMic = async () => {
    const audioTrack = tracksRef.current?.audio;
    if (!audioTrack) return;
    try {
      const next = !micOn;
      await audioTrack.setEnabled(next);
      if (isMountedRef.current) setMicOn(next);
    } catch (e) {
      console.warn('⚠️ toggleCoHostMic:', e);
    }
  };

  const switchCoHostCamera = async () => {
    const videoTrack = tracksRef.current?.video;
    if (!videoTrack || switchingCamera) return;

    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (!isMobile) {
      setErrorMsg('Changement de caméra disponible uniquement sur mobile.');
      return;
    }

    setSwitchingCamera(true);
    const nextFacingMode = facingMode === 'user' ? 'environment' : 'user';

    try {
      const cameras = await window.AgoraRTC.getCameras();
      if (!cameras || cameras.length < 2) {
        setErrorMsg('Une seule caméra détectée.');
        setSwitchingCamera(false);
        return;
      }

      const targetCamera = cameras.find(cam => {
        const label = cam.label?.toLowerCase() ?? '';
        return nextFacingMode === 'environment'
          ? /back|rear|environment|arrière/.test(label)
          : /front|user|avant|face/.test(label);
      });

      if (targetCamera) {
        await videoTrack.setDevice(targetCamera.deviceId);
      } else {
        const currentLabel = videoTrack.getTrackLabel ? videoTrack.getTrackLabel() : null;
        const otherCamera = cameras.find(cam => cam.label !== currentLabel) ?? cameras[1];
        await videoTrack.setDevice(otherCamera.deviceId);
      }

      if (isMountedRef.current) setFacingMode(nextFacingMode);

      if (localDivRef.current) {
        setTimeout(() => {
          if (isMountedRef.current) videoTrack.play(localDivRef.current);
        }, 100);
      }
    } catch (e) {
      console.error('❌ switchCoHostCamera:', e);
      if (isMountedRef.current) setErrorMsg('Changement de caméra impossible.');
    } finally {
      if (isMountedRef.current) setSwitchingCamera(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>

      {status === 'live' && (
        <div style={{ position: 'relative', width: 56, height: 80, marginBottom: 4, flexShrink: 0 }}>
          <div ref={localDivRef} style={{
            width: 56, height: 80, borderRadius: 8, overflow: 'hidden',
            background: '#111', border: '2px solid #22C55E',
          }} />
          {!cameraOn && (
            <div style={{
              position: 'absolute', inset: 0, borderRadius: 8,
              background: 'rgba(0,0,0,.75)', display: 'flex',
              alignItems: 'center', justifyContent: 'center', fontSize: 18,
            }}>🚫📷</div>
          )}
        </div>
      )}

      {status === 'live' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <button onClick={toggleCoHostCamera} style={coHostBtnStyle(cameraOn ? '#fff' : '#EF4444')}>
            <span style={{ fontSize: 16 }}>{cameraOn ? '📷' : '🚫'}</span>
          </button>
          <button onClick={switchCoHostCamera} style={coHostBtnStyle('#fff')}>
            <span style={{ fontSize: 16 }}>{switchingCamera ? '⏳' : '🔄'}</span>
          </button>
          <button onClick={toggleCoHostMic} style={coHostBtnStyle(micOn ? '#fff' : '#EF4444')}>
            <span style={{ fontSize: 16 }}>{micOn ? '🎤' : '🔇'}</span>
          </button>
        </div>
      )}

      {status === 'idle' && (
        <button onClick={requestCoHost} style={coHostBtnStyle('#7C3AED')}>
          <IconMic />
          <span style={{ fontSize: 10, color: '#fff', marginTop: 2 }}>Sur scène</span>
        </button>
      )}
      {status === 'pending' && (
        <button onClick={cancelRequest} style={coHostBtnStyle('#F97316')}>
          <span style={{ fontSize: 18 }}>⏳</span>
          <span style={{ fontSize: 10, color: '#fff', marginTop: 2 }}>Annuler</span>
        </button>
      )}
      {status === 'joining' && (
        <div style={coHostBtnStyle('#A855F7', true)}>
          <span style={{ fontSize: 14 }}>📡</span>
          <span style={{ fontSize: 9, color: '#fff', marginTop: 2 }}>Connexion...</span>
        </div>
      )}
      {status === 'live' && (
        <button onClick={leaveStage} style={coHostBtnStyle('#22C55E')}>
          <span style={{ fontSize: 18 }}>🎙️</span>
          <span style={{ fontSize: 10, color: '#fff', marginTop: 2 }}>Quitter</span>
        </button>
      )}
      {status === 'declined' && (
        <div style={coHostBtnStyle('#EF4444', true)}>
          <span style={{ fontSize: 15 }}>❌</span>
          <span style={{ fontSize: 9, color: '#fff', marginTop: 2 }}>Refusé</span>
        </div>
      )}
      {status === 'removed' && (
        <div style={coHostBtnStyle('#666', true)}>
          <span style={{ fontSize: 15 }}>🚫</span>
          <span style={{ fontSize: 9, color: '#fff', marginTop: 2 }}>Retiré</span>
        </div>
      )}
      {errorMsg && (
        <span style={{ fontSize: 9, color: '#FCA5A5', textAlign: 'center', maxWidth: 60, lineHeight: 1.2, marginTop: 2 }}>
          {errorMsg}
        </span>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   MODAL AUTH REQUISE
══════════════════════════════════════════════════════════ */
function AuthRequiredModal({ onClose }) {
  return (
    <div className={styles.modalBackdrop} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modalSheet}>
        <div className={styles.modalHandle}/>
        <div className={styles.authModalBody}>
          <div className={styles.authIconWrap}><IconLock/></div>
          <h2 className={styles.authTitle}>Connexion requise</h2>
          <p className={styles.authSub}>Connectez-vous pour passer une commande sur FriTok.</p>
          <a className={styles.authBtnPrimary} href="/login"><IconUser/> Se connecter</a>
          <a className={styles.authBtnOutline} href="/register">Créer un compte gratuit</a>
          <button className={styles.authSkip} onClick={onClose}>Continuer à regarder</button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   MODAL COMMANDE
══════════════════════════════════════════════════════════ */
function OrderModal({ product, sellerId, authUser, onClose }) {
  const [step,        setStep]        = useState('form');
  const [nomDest,     setNomDest]     = useState(
    authUser?.displayName || authUser?.email?.split('@')[0] || ''
  );
  const [telephone,   setTelephone]   = useState(authUser?.phoneNumber ?? '');
  const [adresse,     setAdresse]     = useState('');
  const [pays,        setPays]        = useState(DEFAULT_COUNTRY);
  const [villeClient, setVilleClient] = useState('');
  const [typeLivr,    setTypeLivr]    = useState('solo');
  const [modePaiem,   setModePaiem]   = useState('livraison');
  const [locLoading,  setLocLoading]  = useState(false);
  const [gpsCoords,   setGpsCoords]   = useState(null);
  const [submitting,  setSubmitting]  = useState(false);
  const [errors,      setErrors]      = useState({});
  const [commandeId,  setCommandeId]  = useState(null);
  const [qrImgUrl,    setQrImgUrl]    = useState(null);
  const [serverTotal, setServerTotal] = useState(null);
  const [toast,       setToast]       = useState(null);

  const country  = COUNTRIES[pays] ?? COUNTRIES[DEFAULT_COUNTRY];
  const prix     = Number(product?.price ?? 0);
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
    if (!nomDest.trim())               e.nomDest   = 'Nom obligatoire';
    const digits = telephone.replace(/\D/g, '');
    if (!digits || digits.length < 8) e.telephone = 'Numéro invalide (min 8 chiffres)';
    if (!adresse.trim())              e.adresse   = 'Adresse obligatoire';
    if (!villeClient)                 e.ville     = 'Choisissez une ville';
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
          // ⚠️ villeDepart approximé par la ville "hub" du pays choisi —
          // voir note en tête de fichier. `pays` ajouté pour create-colis.js.
          pays,
          villeDepart: country.hub,
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
    <div className={styles.modalBackdrop} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modalSheet}>
        <div className={styles.modalHandle}/>
        <div className={styles.modalHeader}>
          <div>
            <p className={styles.modalTitle}>{step === 'qr' ? 'Commande confirmée' : 'Commander avec livraison'}</p>
            <p className={styles.modalSub}>{product?.name ?? ''}</p>
          </div>
          <button className={styles.modalClose} onClick={onClose}><IconClose/></button>
        </div>
        {step === 'form' && authUser && (
          <div className={styles.authBadge}><IconUserCheck/><span>Connecté : <strong>{authUser.email}</strong></span></div>
        )}
        {step === 'form' && (
          <div className={styles.modalBody}>
            <div className={styles.recapCard}>
              {(product?.image || product?.thumbnail) && <img className={styles.recapImg} src={product.image || product.thumbnail} alt=""/>}
              <div className={styles.recapInfo}>
                <p className={styles.recapName}>{product?.name}</p>
                <p className={styles.recapPrice}>{fmt(prix, pays)}</p>
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
            <input className={`${styles.formInput}${errors.nomDest ? ' ' + styles.inputErr : ''}`}
              type="text" placeholder="Nom complet"
              value={nomDest} onChange={e => setNomDest(e.target.value)}/>
            {errors.nomDest && <p className={styles.errMsg}>{errors.nomDest}</p>}
            <FieldLabel text="TÉLÉPHONE DE CONTACT"/>
            <input className={`${styles.formInput}${errors.telephone ? ' ' + styles.inputErr : ''}`}
              type="tel" placeholder="07 XX XX XX XX"
              value={telephone} onChange={e => setTelephone(e.target.value)}/>
            {errors.telephone && <p className={styles.errMsg}>{errors.telephone}</p>}
            <FieldLabel text="PAYS DE LIVRAISON"/>
            <select className={styles.formInput}
              value={pays} onChange={e => handlePaysChange(e.target.value)}>
              {Object.entries(COUNTRIES).map(([code, c]) => (
                <option key={code} value={code}>{c.label}</option>
              ))}
            </select>
            <FieldLabel text="VILLE DE LIVRAISON"/>
            <select className={`${styles.formInput}${errors.ville ? ' ' + styles.inputErr : ''}`}
              value={villeClient} onChange={e => setVilleClient(e.target.value)}>
              <option value="">Sélectionnez votre ville…</option>
              {country.villes.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            {errors.ville && <p className={styles.errMsg}>{errors.ville}</p>}
            {villeClient && (
              <div className={styles.fraisCard}>
                <div className={styles.fraisRow}><span>Articles</span><span>{fmt(prix, pays)}</span></div>
                <div className={styles.fraisRow}><span>Livraison{typeLivr === 'groupee' ? ' (-20%)' : ''}</span><span>{fmt(fraisXof, pays)}</span></div>
                <div className={styles.fraisDivider}/>
                <div className={`${styles.fraisRow} ${styles.fraisTotal}`}><span>Total (estimé)</span><span>{fmt(totalXof, pays)}</span></div>
              </div>
            )}
            <FieldLabel text="ADRESSE DE LIVRAISON"/>
            <textarea className={`${styles.formInput} ${styles.formTextarea}${errors.adresse ? ' ' + styles.inputErr : ''}`}
              placeholder="Quartier, rue, point de repère…"
              value={adresse} onChange={e => setAdresse(e.target.value)} rows={2}/>
            {errors.adresse && <p className={styles.errMsg}>{errors.adresse}</p>}
            <button className={`${styles.locBtn}${gpsCoords ? ' ' + styles.locOk : ''}`}
              onClick={localiser} disabled={locLoading}>
              {locLoading ? <Spinner/> : gpsCoords
                ? `${gpsCoords.lat.toFixed(4)}, ${gpsCoords.lng.toFixed(4)}`
                : <><IconPin/> Localiser mon adresse</>}
            </button>
            <button className={styles.confirmBtn} onClick={confirmer} disabled={submitting}>
              {submitting ? <Spinner/> : modePaiem === 'immediat' ? `Payer ${fmt(totalXof, pays)}` : 'Commander — payer à la livraison'}
            </button>
          </div>
        )}
        {step === 'qr' && commandeId && (
          <div className={`${styles.modalBody} ${styles.qrStep}`}>
            <p className={styles.qrHint}>Le livreur scannera ce code pour récupérer votre commande</p>
            <div className={styles.qrWrap}>
              {qrImgUrl && <img className={styles.qrImg} src={qrImgUrl} alt="QR commande"/>}
            </div>
            <div className={styles.cidCard} onClick={() => { navigator.clipboard?.writeText(commandeId); showToast('ID copié !'); }}>
              <span className={styles.cidLabel}>Commande #</span>
              <span className={styles.cidValue}>{commandeId}</span>
              <IconCopy/>
            </div>
            {gpsCoords && <p className={styles.gpsTag}>{gpsCoords.lat.toFixed(5)}, {gpsCoords.lng.toFixed(5)}</p>}
            <div className={styles.fraisCard} style={{ width: '100%' }}>
              <div className={styles.fraisRow}><span>{product?.name}</span><span>{fmt(prix, pays)}</span></div>
              <div className={styles.fraisRow}><span>Livraison {villeClient}</span><span>{fmt(serverTotal?.fraisXof ?? fraisXof, pays)}</span></div>
              <div className={styles.fraisDivider}/>
              <div className={`${styles.fraisRow} ${styles.fraisTotal}`}><span>Total</span><span>{fmt(serverTotal?.totalXof ?? totalXof, pays)}</span></div>
              <div className={styles.fraisRow} style={{ opacity: 0.65, fontSize: '.75rem', marginTop: 6 }}>
                <span>Paiement</span><span>{modePaiem === 'immediat' ? 'En ligne' : 'À la livraison'}</span>
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
   BOTTOM SHEET — SIGNALER LE LIVE
   Écrit dans /live_reports. Règle firestore.rules déployée (voir
   firestore.rules — match /live_reports/{reportId}).
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

function ReportSheet({ session, authUser, onClose }) {
  const [reason,     setReason]     = useState(null);
  const [details,    setDetails]    = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done,       setDone]       = useState(false);
  const [errMsg,     setErrMsg]     = useState(null);

  const submit = async () => {
    if (!reason) { setErrMsg('Choisissez un motif.'); return; }
    if (!authUser || !session.channelId) return;
    setSubmitting(true);
    setErrMsg(null);
    try {
      await addDoc(collection(db, 'live_reports'), {
        channelId:  session.channelId,
        sellerId:   session.sellerId ?? session.userId ?? '',
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
                <p className={styles.modalTitle}>Signaler ce live</p>
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
   HOOK : résolution de la vidéo produit pour la fiche
   ── CORRIGÉ ──
   Le tableau live_sessions.products[] ne contient pas toujours
   videoUrl selon la façon dont GoLive.jsx a construit chaque entrée
   au moment de la mise en avant du produit — c'est pourquoi la
   miniature vidéo pouvait rester invisible (product.videoUrl
   undefined → bloc entier non rendu). videoUrl existe en revanche
   TOUJOURS à la racine du document video_playlist (voir demo.js, où
   il alimente <video src={item.videoUrl}>). Si l'objet product de la
   session ne l'a pas déjà, on va donc le chercher une seule fois
   (getDoc, pas de listener) via product.videoId — présent dans la
   capture partagée — plutôt que de renoncer à l'aperçu.
══════════════════════════════════════════════════════════ */
function useProductVideo(product) {
  const [videoUrl, setVideoUrl] = useState(product?.videoUrl || null);
  const [poster,   setPoster]   = useState(product?.thumbnail || null);
  const [loading,  setLoading]  = useState(!product?.videoUrl && !!(product?.videoId || product?.productId));

  useEffect(() => {
    setVideoUrl(product?.videoUrl || null);
    setPoster(product?.thumbnail || null);

    if (product?.videoUrl) { setLoading(false); return; }
    if (!product?.videoId && !product?.productId) { setLoading(false); return; }

    let cancelled = false;
    setLoading(true);

    // Extrait videoUrl/thumbnail d'un doc video_playlist, quelle que soit
    // la forme exacte (racine ou imbriqué sous `product`) — les deux
    // formes coexistent selon l'ancienneté du document (voir
    // firestore.rules : les nouveaux docs imposent videoUrl à la racine,
    // les plus anciens ne l'avaient que dans product.videoUrl).
    const applyMedia = (data) => {
      if (!data) return false;
      const url = data.videoUrl || data.product?.videoUrl || null;
      if (url) setVideoUrl(prev => prev || url);
      setPoster(prev => prev || data.thumbnail || data.product?.thumbnail || null);
      return !!url;
    };

    (async () => {
      try {
        // 1) Par videoId — accès direct le plus économe si disponible.
        if (product.videoId) {
          const snap = await getDoc(doc(db, 'video_playlist', product.videoId));
          if (!cancelled && snap.exists() && applyMedia(snap.data())) { setLoading(false); return; }
        }
        // 2) Repli par productId — le tableau live_sessions.products[] ne
        // contient pas toujours videoId, mais productId y est toujours
        // présent (déjà utilisé par OrderModal). Requête sur le champ
        // imbriqué product.productId, indexée automatiquement par
        // Firestore (pas d'index composite manuel nécessaire pour une
        // seule égalité, même sur un champ de map).
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
  }, [product?.videoId, product?.productId, product?.videoUrl, product?.thumbnail]);

  return { videoUrl, poster, loading };
}

/* ══════════════════════════════════════════════════════════
   MINIATURE VIDÉO PRODUIT (façon Pinduoduo)
   Lecture muette, en boucle, déclenchée au tap — poster = thumbnail
   du produit pour un affichage instantané avant lecture.
══════════════════════════════════════════════════════════ */
function ProductVideoPreview({ videoUrl, poster, expanded, onToggleExpand }) {
  const videoRef = useRef(null);
  const [muted, setMuted] = useState(true);

  // Lecture automatique dès l'affichage — `muted` + `playsInline` sont
  // requis par les navigateurs pour autoriser l'autoplay sans geste
  // utilisateur. L'appel .play() en useEffect sert de filet de sécurité
  // pour les navigateurs (Safari notamment) qui ignorent parfois
  // l'attribut autoPlay seul sur un <video> injecté dynamiquement.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.play().catch(() => {}); // ignore silencieusement (ex. onglet en arrière-plan)
  }, [videoUrl]);

  // Écrit directement .muted sur l'élément plutôt que de compter
  // uniquement sur la prop JSX `muted` — certains navigateurs
  // n'appliquent pas de façon fiable les changements de cette prop sur
  // un <video> déjà monté et en lecture (particularité connue de
  // l'attribut muted, distinct des autres attributs HTML standards).
  useEffect(() => {
    const v = videoRef.current;
    if (v) v.muted = muted;
  }, [muted]);

  if (!videoUrl) return null;

  const toggleMuted = (e) => {
    e.stopPropagation(); // ne doit pas aussi agrandir/réduire la vidéo
    setMuted(m => !m);
  };

  return (
    <div
      onClick={onToggleExpand}
      role="button"
      aria-label={expanded ? 'Réduire la vidéo' : 'Agrandir la vidéo'}
      style={{
        position: 'relative',
        width: expanded ? '100%' : 110,
        maxWidth: expanded ? 280 : 110,
        aspectRatio: '9 / 14',
        margin: expanded ? '0 auto' : 0,
        flexShrink: 0,
        borderRadius: 12, overflow: 'hidden', background: '#000', cursor: 'pointer',
        transition: 'width .2s ease, max-width .2s ease',
      }}
    >
      <video
        ref={videoRef}
        src={videoUrl}
        poster={poster}
        muted loop playsInline autoPlay
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
      />

      {/* Bouton son — indépendant du clic sur la vidéo (agrandir/réduire) */}
      <button
        onClick={toggleMuted}
        aria-label={muted ? 'Activer le son' : 'Couper le son'}
        style={{
          position: 'absolute', top: 8, right: 8, width: 30, height: 30, borderRadius: '50%',
          background: 'rgba(0,0,0,0.6)', border: 'none', cursor: 'pointer', zIndex: 2,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        {muted ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
            <line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>
          </svg>
        )}
      </button>

      {!expanded && (
        <span style={{
          position: 'absolute', bottom: 6, left: 6, fontSize: 9, fontWeight: 700, color: '#fff',
          background: 'rgba(0,0,0,0.55)', padding: '2px 6px', borderRadius: 6,
        }}>
          Vidéo produit
        </span>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   FICHE PRODUIT COMPLÈTE (façon Pinduoduo)
   Ouverte au clic sur la carte du carrousel produit (voir
   productCarousel dans LivePlayer). Photo, miniature vidéo du
   produit, nom, prix, description — puis bouton Commander séparé,
   qui déclenche le flux de commande (OrderModal) indépendamment.
   Les champs viennent directement de l'objet product déjà présent
   dans live_sessions.products[] (image/thumbnail/name/price/
   description/videoUrl/title — même structure que le champ `product`
   de video_playlist, voir capture partagée), donc aucune requête
   Firestore supplémentaire n'est nécessaire pour l'ouvrir.
══════════════════════════════════════════════════════════ */
function ProductSheet({ product, onClose, onOrder }) {
  const { videoUrl, poster, loading: videoLoading } = useProductVideo(product);
  const [videoExpanded, setVideoExpanded] = useState(false);

  if (!product) return null;

  const prix   = Number(product.price ?? 0);
  const prixAff = prix.toLocaleString('fr-FR') + ' F CFA';
  const seller  = product.title || '';

  return (
    <div className={styles.modalBackdrop} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modalSheet}>
        <div className={styles.modalHandle}/>
        <div className={styles.modalHeader}>
          <div>
            <p className={styles.modalTitle}>Fiche produit</p>
            {seller && <p className={styles.modalSub}>{seller}</p>}
          </div>
          <button className={styles.modalClose} onClick={onClose}><IconClose/></button>
        </div>

        <div style={{ padding: '4px 20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Photo principale */}
          <div style={{
            width: '100%', aspectRatio: '1 / 1', borderRadius: 14,
            overflow: 'hidden', background: '#111',
          }}>
            <img
              src={product.image || product.thumbnail}
              alt={product.name}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              onError={e => { e.currentTarget.style.display = 'none'; }}
            />
          </div>

          {/* Miniature vidéo produit */}
          {(videoUrl || videoLoading) && (
            <div style={{
              display: 'flex', gap: 12, alignItems: 'flex-start',
              flexDirection: videoExpanded ? 'column' : 'row',
            }}>
              {videoUrl ? (
                <ProductVideoPreview
                  videoUrl={videoUrl}
                  poster={poster}
                  expanded={videoExpanded}
                  onToggleExpand={() => setVideoExpanded(e => !e)}
                />
              ) : (
                <div style={{
                  width: 110, aspectRatio: '9 / 14', flexShrink: 0, borderRadius: 12,
                  background: '#111', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Spinner/>
                </div>
              )}
              {!videoExpanded && (
                <p style={{
                  flex: 1, fontSize: 12.5, color: 'rgba(255,255,255,0.5)',
                  lineHeight: 1.6, margin: '4px 0 0',
                }}>
                  Voyez le produit en situation. Touchez la vidéo pour l'agrandir, l'icône 🔊 pour le son.
                </p>
              )}
            </div>
          )}

          {/* Nom + prix */}
          <div>
            <p style={{
              fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.1rem',
              color: '#fff', margin: '0 0 6px', lineHeight: 1.4,
            }}>
              {product.name}
            </p>
            <p style={{
              fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.3rem',
              color: 'var(--gold)', margin: 0,
            }}>
              {prixAff}
            </p>
          </div>

          {/* Description */}
          {product.description && (
            <div>
              <p style={{
                fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.45)', margin: '0 0 6px',
              }}>
                Description
              </p>
              <p style={{
                fontSize: 14, color: 'rgba(255,255,255,0.85)', lineHeight: 1.65,
                margin: 0, whiteSpace: 'pre-wrap',
              }}>
                {product.description}
              </p>
            </div>
          )}

          {/* Commander — action séparée du simple clic sur la carte */}
          <button className={styles.confirmBtn} onClick={() => onOrder(product)}>
            Commander — {prixAff}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   PLAYER LIVE PLEIN ÉCRAN
══════════════════════════════════════════════════════════ */
function LivePlayer({ session, authUser, authReady, onClose }) {
  const { videoContainerRef, remoteUsers, status, error: agoraError } =
    useAgoraPlayer(session.channelId, session.isLive);

  // Likes persistés (sous-collection), compteur en agrégation ponctuelle (P0)
  const { liked, count: likeCount, toggle: toggleLike } =
    useLiveLike(session.id, session.likeCount ?? 0, authUser);

  const [activeProduct, setActiveProduct] = useState(session.products?.[0] ?? null);
  const [detailProduct, setDetailProduct] = useState(null);
  const [messages,      setMessages]      = useState([]);
  const [inputMsg,      setInputMsg]      = useState('');
  const [orderProduct,  setOrderProduct]  = useState(null);
  const [authPrompt,    setAuthPrompt]    = useState(false);
  const [showReportSheet, setShowReportSheet] = useState(false);
  const chatRef  = useRef(null);

  // ── Commentaires Firestore partagés avec le vendeur ──────────────────────
  // ⚠️ P0 — CORRIGÉ (voir analyse-scalabilite-fritok.md, point 3) : cette
  // requête n'avait AUCUNE limite — chaque nouvel arrivant sur un live
  // long téléchargeait tout l'historique des commentaires, et chaque
  // nouveau message fan-out un read vers CHAQUE spectateur connecté
  // simultanément. Ajout de orderBy('timestamp','desc') +
  // limit(LIVE_CHAT_LIMIT) : ne synchronise plus que les derniers messages.
  useEffect(() => {
    if (!session.channelId) return;
    const unsub = onSnapshot(
      query(
        collection(db, 'live_comments'),
        where('channelId', '==', session.channelId),
        orderBy('timestamp', 'desc'),
        limit(LIVE_CHAT_LIMIT)
      ),
      snap => {
        const docs = snap.docs.map(d => {
          const data = d.data();
          return {
            id:   d.id,
            user: data.sender ?? '?',
            text: data.text   ?? '',
            lang: data.lang   ?? 'fr',
            ts:   data.timestamp?.toMillis?.() ?? 0,
          };
        });
        docs.sort((a, b) => a.ts - b.ts);
        setMessages(docs);
      },
      err => console.warn('⚠️ live_comments listener:', err)
    );
    return unsub;
  }, [session.channelId]);

  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const handleOrder = (product) => {
    if (!authReady) return;
    if (!authUser) { setAuthPrompt(true); } else { setOrderProduct(product); }
  };

  const handleLike = () => {
    if (!authReady) return;
    if (!authUser) { setAuthPrompt(true); return; }
    toggleLike();
  };

  const handleReport = () => {
    if (!authReady) return;
    if (!authUser) { setAuthPrompt(true); return; }
    setShowReportSheet(true);
  };

  const sendMessage = async () => {
    const text = inputMsg.trim().slice(0, 300);
    if (!text || !session.channelId) return;
    if (!authReady) return;
    if (!authUser) { setAuthPrompt(true); return; }

    let senderName;
    try {
      let idTokenResult = await authUser.getIdTokenResult();
      senderName = idTokenResult.claims.name;
      if (!senderName) {
        const fallbackName = authUser.displayName
          || authUser.email?.split('@')[0]
          || `Spectateur_${authUser.uid.slice(0, 6)}`;
        await updateProfile(authUser, { displayName: fallbackName });
        idTokenResult = await authUser.getIdTokenResult(true);
        senderName = idTokenResult.claims.name;
      }
    } catch (e) {
      console.warn('⚠️ getIdTokenResult/updateProfile:', e);
    }
    if (!senderName) {
      alert("Impossible d'envoyer le commentaire : profil incomplet. Réessayez dans quelques secondes.");
      return;
    }

    setInputMsg('');
    try {
      const ref = doc(collection(db, 'live_comments'));
      await setDoc(ref, {
        commentId: ref.id,
        userId:    authUser.uid,
        sender:    senderName,
        text,
        timestamp: serverTimestamp(),
        channelId: session.channelId,
        lang: 'fr',
      });
    } catch (e) {
      console.warn('⚠️ sendMessage (spectateur):', e.code ?? e.message ?? e);
    }
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

  const sellerId = session.sellerId ?? session.userId ?? '';

  return (
    <div className={styles.playerPage}>

      <div ref={videoContainerRef} className={styles.agoraVideo}/>

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
            : <span className={styles.replayLabel}>TERMINÉ</span>}
          <button className={styles.closeBtn} onClick={handleReport} aria-label="Signaler ce live" title="Signaler ce live">
            <IconFlag/>
          </button>
          <button className={styles.closeBtn} onClick={onClose}><IconClose/></button>
        </div>
      </div>

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

        <CoHostButton session={session} authUser={authUser} />
      </div>

      <div className={styles.chatArea} ref={chatRef}>
        {messages.map(m => <ChatBubble key={m.id} msg={m}/>)}
      </div>
      <div className={styles.chatInput}>
        <input className={styles.chatField}
          placeholder="Écrire un commentaire…"
          value={inputMsg}
          onChange={e => setInputMsg(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && sendMessage()}/>
        <button className={styles.chatSend} onClick={sendMessage}>↑</button>
      </div>

      {products.length > 0 && (
        <div className={styles.productCarousel}>
          <div className={styles.carouselLabel}>Produits ({products.length})</div>
          <div className={styles.carouselTrack}>
            {products.map((p, i) => {
              const isActive = activeProduct?.productId === p.productId;
              return (
                <div
                  key={p.productId ?? i}
                  className={isActive ? styles.carouselItemActive : styles.carouselItem}
                  style={{ cursor: 'pointer' }}
                  onClick={() => { setActiveProduct(p); setDetailProduct(p); }}
                >
                  <div className={styles.carouselImgWrap}>
                    <img src={p.image} alt={p.name} className={styles.carouselImg}
                      onError={e2 => { e2.currentTarget.style.display = 'none'; }}/>
                    {isActive && <div className={styles.carouselActiveDot}/>}
                  </div>
                  <span className={styles.carouselName}>{p.name}</span>
                  <span className={styles.carouselPrice}>{Number(p.price).toLocaleString('fr-FR')} F</span>
                  <button
                    className={styles.carouselOrderBtn}
                    onClick={e => { e.stopPropagation(); handleOrder(p); }}
                  >
                    Commander
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {detailProduct && (
        <ProductSheet
          product={detailProduct}
          onClose={() => setDetailProduct(null)}
          onOrder={p => { setDetailProduct(null); handleOrder(p); }}
        />
      )}

      {authPrompt && <AuthRequiredModal onClose={() => setAuthPrompt(false)}/>}
      {showReportSheet && (
        <ReportSheet
          session={session}
          authUser={authUser}
          onClose={() => setShowReportSheet(false)}
        />
      )}
      {orderProduct && (
        <OrderModal
          product={orderProduct}
          sellerId={sellerId}
          authUser={authUser}
          onClose={() => setOrderProduct(null)}
        />
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   LIVE CARD
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
          : <span className={styles.replayBadge}>REPLAY</span>}
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
        <div className={styles.liveLikes}><IconHeart filled={false}/><span>{session.likeCount ?? 0}</span></div>
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
   ⚠️ P0 — CORRIGÉ (voir analyse-scalabilite-fritok.md, point 4) :
   live_sessions n'a plus de requête onSnapshot illimitée sur TOUTE la
   collection. La requête temps réel est désormais bornée à
   LIVE_PAGE_SIZE ; un bouton "Charger plus" pagine le reste via une
   lecture ponctuelle (getDocs + startAfter), volontairement pas en
   onSnapshot pour ne pas ouvrir un listener permanent par page.
   lastDocRef retient le dernier QueryDocumentSnapshot chargé.
══════════════════════════════════════════════════════════ */
export default function LivePage() {
  const [sessions,    setSessions]    = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(null);
  const [selected,    setSelected]    = useState(null);
  const [filter,      setFilter]      = useState('all');
  const [authUser,    setAuthUser]    = useState(null);
  const [authReady,   setAuthReady]   = useState(false);
  const [hasMore,     setHasMore]     = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const lastDocRef = useRef(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, user => {
      setAuthUser(user?.emailVerified ? user : null);
      setAuthReady(true);
    });
    return unsub;
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'live_sessions'), orderBy('startedAt', 'desc'), limit(LIVE_PAGE_SIZE));
    const unsub = onSnapshot(q,
      snap => {
        setSessions(snap.docs.map(d => ({
          id: d.id,
          ...d.data(),
          startedAt: d.data().startedAt?.toDate?.()?.toLocaleDateString('fr-FR') ?? '',
        })));
        lastDocRef.current = snap.docs[snap.docs.length - 1] ?? null;
        setHasMore(snap.docs.length === LIVE_PAGE_SIZE);
        setLoading(false);
      },
      err => { console.error(err); setError('Impossible de charger les lives.'); setLoading(false); }
    );
    return () => unsub();
  }, []);

  const loadMoreSessions = async () => {
    if (!hasMore || loadingMore || !lastDocRef.current) return;
    setLoadingMore(true);
    try {
      const q = query(
        collection(db, 'live_sessions'),
        orderBy('startedAt', 'desc'),
        startAfter(lastDocRef.current),
        limit(LIVE_PAGE_SIZE)
      );
      const snap = await getDocs(q);
      const more = snap.docs.map(d => ({
        id: d.id,
        ...d.data(),
        startedAt: d.data().startedAt?.toDate?.()?.toLocaleDateString('fr-FR') ?? '',
      }));
      setSessions(prev => [...prev, ...more]);
      lastDocRef.current = snap.docs[snap.docs.length - 1] ?? lastDocRef.current;
      setHasMore(snap.docs.length === LIVE_PAGE_SIZE);
    } catch (e) {
      console.warn('⚠️ loadMoreSessions:', e);
    } finally {
      setLoadingMore(false);
    }
  };

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
            <p>{error}</p><a href="/" className={styles.errorBack}>Retour</a>
          </div>
        )}
        {!loading && !error && filtered.length === 0 && (
          <div className={styles.emptyBox}><p>Aucun live pour ce filtre.</p></div>
        )}
        {!loading && !error && filtered.length > 0 && (
          <>
            <div className={styles.grid}>
              {filtered.map(s => <LiveCard key={s.id} session={s} onSelect={setSelected}/>)}
            </div>
            {hasMore && filter === 'all' && (
              <button
                onClick={loadMoreSessions}
                disabled={loadingMore}
                style={{
                  display: 'block', margin: '20px auto', padding: '12px 32px',
                  borderRadius: 12, border: '1.5px solid rgba(255,255,255,0.15)',
                  background: 'rgba(255,255,255,0.06)', color: '#fff',
                  fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.85rem',
                  cursor: loadingMore ? 'not-allowed' : 'pointer', opacity: loadingMore ? 0.6 : 1,
                }}
              >
                {loadingMore ? 'Chargement…' : 'Charger plus'}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}