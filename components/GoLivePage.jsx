'use client';
/**
 * GoLive.jsx — version sécurisée (corrigée)
 *
 * Différences vs version originale :
 *  - startLive()       → POST /api/start-live       (valide produits + génère token côté serveur)
 *  - endLive()         → POST /api/end-live          (révoque co-hosts + nettoie viewers)
 *  - acceptCoHost()    → POST /api/accept-cohost     (token transmis via notification privée)
 *  - toggleLike/gift   → POST /api/update-engagement (incréments atomiques, pas de chiffres client)
 *  - token Agora       → lu dans /notifications/{uid}/items/cohost_token_{channelId}
 *  - userId ajouté dans live_comments (requis par les nouvelles règles Firestore)
 *
 * Correctif (juillet 2026) :
 *  - Le champ propriétaire d'un doc `video_playlist` est niché dans `product.userId`,
 *    pas à la racine du document. La query de sélection des produits et le mapper
 *    `videoDocToProduct` ont été corrigés en conséquence (voir `product.userId`).
 *
 * Ajout (juillet 2026) :
 *  - Boutons caméra ON/OFF, micro ON/OFF et bascule caméra avant/arrière pendant le live.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { db, auth } from '../lib/firebaseClient';
import {
  collection, doc, query, where,
  onSnapshot, setDoc, deleteDoc, serverTimestamp,
} from 'firebase/firestore';
import { onAuthStateChanged, getIdToken, updateProfile } from 'firebase/auth';
import SubscriptionGuard from '../components/SubscriptionGuard';

// ── Config ───────────────────────────────────────────────────────────────────
const AGORA_APP_ID   = process.env.NEXT_PUBLIC_AGORA_APP_ID; // depuis .env.local, pas hardcodé
const MAX_COHOSTS    = 3;
const API_BASE       = process.env.NEXT_PUBLIC_API_BASE ?? ''; // ex: https://fritok1.netlify.app

// ── Profils vidéo/audio adaptés 4G Afrique ──────────────────────────────────
// Choisis pour prioriser la CONTINUITÉ du flux (pas de gel d'image) plutôt
// que la résolution maximale : sur une 4G africaine typique (souvent
// 1-3 Mbps instables, latence/jigue variables, terminaux d'entrée de
// gamme), un flux qui gèle ou décroche casse la confiance acheteur bien
// plus qu'une image légèrement moins nette. bitrateMin est volontairement
// bas (pas 0) pour laisser Agora dégrader progressivement sans jamais
// couper le flux plutôt que de figer en dessous d'un plancher trop haut.
const VIDEO_PROFILE_NORMAL = {
  mobile: {
    width: { ideal: 480 }, height: { ideal: 360 },
    frameRate: { ideal: 20, max: 24 },
    bitrateMin: 150, bitrateMax: 600,
  },
  desktop: {
    width: { ideal: 960 }, height: { ideal: 540 },
    frameRate: { ideal: 24, max: 30 },
    bitrateMin: 300, bitrateMax: 1200,
  },
};
// Mode économie : activable manuellement par le vendeur (bouton), ou
// automatiquement si le réseau est détecté mauvais plusieurs mesures
// Agora de suite (voir listener 'network-quality' dans startLive).
const VIDEO_PROFILE_ECONOMY = {
  width: { ideal: 320 }, height: { ideal: 240 },
  frameRate: { ideal: 12, max: 15 },
  bitrateMin: 80, bitrateMax: 280,
};
// Paramètres du flux "low" Agora (dual-stream) — celui que les
// spectateurs en réseau très faible reçoivent automatiquement à la
// place du flux principal (nécessite un fallback équivalent côté lecteur,
// voir note dans useAgoraPlayer.js).
const LOW_STREAM_PARAMS = { width: 160, height: 120, framerate: 15, bitrate: 100 };
// Live shopping = voix uniquement, pas de musique : 'speech_standard'
// (~18 kbps) au lieu de 'music_standard' (~64 kbps par défaut) — environ
// 3,5x moins de bande passante audio pour une clarté vocale équivalente.
const AUDIO_PROFILE = 'speech_standard';

// ── Appel API sécurisé ───────────────────────────────────────────────────────
async function secureCall(path, body) {
  const user = auth.currentUser;
  if (!user) throw new Error('Non authentifié');
  const idToken = await getIdToken(user, /* forceRefresh */ false);
  const res = await fetch(`${API_BASE}/.netlify/functions/${path}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body:    JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data;
}

// ── Mapper doc video_playlist → Product ─────────────────────────────────────
// ✅ userId racine = source de vérité désormais. On garde un repli sur
// product.userId uniquement pour les docs pas encore migrés (voir script backfill).
function videoDocToProduct(docSnap) {
  const d  = docSnap.data ? docSnap.data() : docSnap;
  const id = docSnap.id ?? d.id ?? '';
  const p  = d.product ?? {};
  return {
    refArticle:  id,
    name:        d.title      ?? d.name        ?? '',
    price:       p.price      ?? d.price        ?? 0,
    description: p.name       ?? d.description  ?? '',
    imageUrl:    d.thumbnail  ?? d.imageUrl     ?? null,
    boutiqueId:  p.boutiqueId ?? d.boutiqueId   ?? '',
    productId:   p.productId  ?? d.productId    ?? id,
    userIdVend:  d.userId     ?? p.userId       ?? null, // racine en priorité, repli legacy
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// GoLiveContent
// ─────────────────────────────────────────────────────────────────────────────
function GoLiveContent() {
  const router = useRouter();

  const [userId, setUserId]   = useState(null);
  const [allProducts,  setAllProducts]  = useState([]);
  const [loadingProds, setLoadingProds] = useState(true);
  const [showSelector, setShowSelector] = useState(false);
  const [liveProducts, setLiveProducts] = useState([]);
  const [productIndex, setProductIndex] = useState(0);
  const [showProductCard, setShowProductCard] = useState(true);
  const [sellerLang,   setSellerLang]   = useState('fr');
  const isChinese = sellerLang === 'zh';

  const [phase, setPhase] = useState('pre'); // pre | live | ended

  const agoraClientRef  = useRef(null);
  const localVideoRef   = useRef(null);
  const localTrackRef   = useRef({ video: null, audio: null });
  const remoteVideoRefs = useRef({});
  const remoteUsersRef  = useRef({});

  const [sdkLoaded,      setSdkLoaded]      = useState(false);
  const [isEngineReady,  setIsEngineReady]  = useState(false);
  const [channelId,      setChannelId]      = useState(null);
  const [agoraToken,     setAgoraToken]     = useState(null); // token hôte reçu de start-live

  const [coHosts,         setCoHosts]         = useState({});
  const [showCoHostPanel, setShowCoHostPanel] = useState(false);
  const pendingQueueRef   = useRef([]);
  const [pendingRequest,  setPendingRequest]  = useState(null);
  const dialogOpenRef     = useRef(false);
  const [showRemoveDialog, setShowRemoveDialog] = useState(null);

  const [viewerCount,   setViewerCount]   = useState(1);
  const [likeCount,     setLikeCount]     = useState(0);
  const [giftCount,     setGiftCount]     = useState(0);
  const [liked,         setLiked]         = useState(false);
  const [showComments,  setShowComments]  = useState(false);
  const [commentText,   setCommentText]   = useState('');
  const [comments,      setComments]      = useState([
    { id: 'sys0', sender: 'FriTok', text: 'Bienvenue dans votre live ! 🎉', lang: 'fr' },
  ]);
  const [liveSeconds,      setLiveSeconds]      = useState(0);
  const [isEnding,         setIsEnding]         = useState(false);
  const [showEndDlg,       setShowEndDlg]       = useState(false);
  const [translationActive, setTranslationActive] = useState(false);
  const commentsEndRef = useRef(null);
  const liveTimerRef   = useRef(null);

  // ── Caméra / micro ────────────────────────────────────────────────────────
  const [cameraOn,        setCameraOn]        = useState(true);
  const [micOn,            setMicOn]           = useState(true);
  const [facingMode,       setFacingMode]      = useState('user'); // 'user' = avant, 'environment' = arrière
  const [switchingCamera,  setSwitchingCamera] = useState(false);

  // ── Qualité réseau / mode économie de données (adapté 4G) ──────────────────
  const [networkQuality, setNetworkQuality] = useState(0); // 0=inconnu,1=excellent...6=très mauvais (échelle Agora)
  const [economyMode,    setEconomyMode]    = useState(false);
  const economyLockedRef  = useRef(false); // true si le vendeur a choisi manuellement (on n'auto-annule plus)
  const poorNetworkCountRef = useRef(0);
  const goodNetworkCountRef = useRef(0);
  const isMobileRef = useRef(false);

  // ── Auth ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, user => setUserId(user?.uid ?? null));
    return unsub;
  }, []);

  // ── Produits Firestore ────────────────────────────────────────────────────
  useEffect(() => {
    if (!userId) return;
    setLoadingProds(true);
    // ✅ userId racine = source de vérité (conforme à la règle Firestore de create
    // `request.resource.data.userId == request.auth.uid`). Les documents existants
    // qui n'ont ce champ que dans product.userId doivent être migrés (voir script
    // de backfill fourni séparément).
    const q = query(collection(db, 'video_playlist'), where('userId', '==', userId));
    const unsub = onSnapshot(q,
      snap => { setAllProducts(snap.docs.map(videoDocToProduct)); setLoadingProds(false); },
      err  => { console.error('❌ video_playlist:', err); setLoadingProds(false); }
    );
    return unsub;
  }, [userId]);

  // ── SDK Agora ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (window.AgoraRTC) { setSdkLoaded(true); return; }
    const s = document.createElement('script');
    s.src     = 'https://download.agora.io/sdk/release/AgoraRTC_N-4.22.1.js';
    s.async   = true;
    s.onload  = () => setSdkLoaded(true);
    s.onerror = () => console.error('❌ Agora SDK failed');
    document.head.appendChild(s);
  }, []);

  // ── Timer live ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'live') return;
    liveTimerRef.current = setInterval(() => setLiveSeconds(s => s + 1), 1000);
    return () => clearInterval(liveTimerRef.current);
  }, [phase]);

  // ── Listeners Firestore (viewers + comments + co-hosts pending) ───────────
  useEffect(() => {
    if (phase !== 'live' || !channelId) return;
    const uid = auth.currentUser?.uid;

    // Enregistrer la présence du vendeur comme viewer/host
    if (uid) {
      setDoc(doc(db, 'live_sessions', channelId, 'viewers', uid), {
        joinedAt:    serverTimestamp(),
        role:        'host',
        displayName: auth.currentUser?.displayName ?? '',
        avatarUrl:   auth.currentUser?.photoURL    ?? null,
      }).catch(() => {});
    }

    const unsubViewers = onSnapshot(
      collection(db, 'live_sessions', channelId, 'viewers'),
      snap => setViewerCount(snap.docs.length),
      err  => console.warn('viewers:', err)
    );

    const unsubComments = onSnapshot(
      query(collection(db, 'live_comments'), where('channelId', '==', channelId)),
      snap => setComments(snap.docs.map(d => ({
        id:     d.id,
        sender: d.data().sender ?? '?',
        text:   d.data().text   ?? '',
        lang:   d.data().lang   ?? 'fr',
      }))),
      err => console.warn('comments:', err)
    );

    // Écouter les demandes de co-host (status=pending)
    let firstSnap = true;
    const unsubCoHost = onSnapshot(
      query(
        collection(db, 'live_sessions', channelId, 'co_hosts'),
        where('status', '==', 'pending')
      ),
      snap => {
        if (firstSnap) { firstSnap = false; return; }
        snap.docChanges().forEach(change => {
          if (change.type === 'added') {
            const d = change.doc.data();
            const coHost = { uid: change.doc.id, displayName: d.displayName ?? 'Viewer', avatarUrl: d.avatarUrl ?? null };
            const alreadyQueued  = pendingQueueRef.current.some(c => c.uid === coHost.uid);
            const alreadyActive  = Object.values(coHosts).some(c => c.uid === coHost.uid);
            const alreadyShowing = pendingRequest?.uid === coHost.uid;
            if (!alreadyQueued && !alreadyActive && !alreadyShowing) {
              pendingQueueRef.current.push(coHost);
              _processNextRequest();
            }
          }
          if (change.type === 'removed') {
            const removedUid = change.doc.id;
            pendingQueueRef.current = pendingQueueRef.current.filter(c => c.uid !== removedUid);
            if (pendingRequest?.uid === removedUid) {
              setPendingRequest(null);
              dialogOpenRef.current = false;
              _processNextRequest();
            }
          }
        });
      },
      err => console.warn('co_hosts listener:', err)
    );

    return () => {
      unsubViewers(); unsubComments(); unsubCoHost();
      if (uid) {
        deleteDoc(doc(db, 'live_sessions', channelId, 'viewers', uid)).catch(() => {});
      }
    };
  }, [phase, channelId]);

  function _processNextRequest() {
    if (dialogOpenRef.current) return;
    pendingQueueRef.current = pendingQueueRef.current.filter(
      c => !Object.values(coHosts).some(a => a.uid === c.uid)
    );
    if (pendingQueueRef.current.length === 0) return;
    dialogOpenRef.current = true;
    setPendingRequest(pendingQueueRef.current.shift());
  }

  // ── Lecture vidéo locale ──────────────────────────────────────────────────
  useEffect(() => {
    if (!isEngineReady || !localTrackRef.current?.video) return;
    const t = setTimeout(() => {
      if (localVideoRef.current && localTrackRef.current?.video) {
        localTrackRef.current.video.play(localVideoRef.current);
      }
    }, 100);
    return () => clearTimeout(t);
  }, [isEngineReady]);

  // ── Rejouer vidéos distantes quand coHosts change ─────────────────────────
  useEffect(() => {
    if (!isEngineReady) return;
    const t = setTimeout(() => {
      Object.entries(remoteUsersRef.current).forEach(([agoraUidStr, remoteUser]) => {
        const el = remoteVideoRefs.current[Number(agoraUidStr)];
        if (el && remoteUser.videoTrack) {
          try { remoteUser.videoTrack.play(el); } catch (_) {}
        }
      });
    }, 200);
    return () => clearTimeout(t);
  }, [coHosts, isEngineReady]);

  // ── Reconnexion si onglet caché ───────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'live' || !agoraToken) return;
    const handle = async () => {
      if (document.visibilityState !== 'visible') return;
      const client = agoraClientRef.current;
      if (!client) return;
      if (client.connectionState === 'DISCONNECTED' || client.connectionState === 'DISCONNECTING') {
        try {
          await client.join(AGORA_APP_ID, channelId, agoraToken, 0);
          const { audio, video } = localTrackRef.current;
          if (audio && video) await client.publish([audio, video]);
          if (localVideoRef.current && video) video.play(localVideoRef.current);
        } catch (e) { console.warn('⚠️ Reconnect:', e); }
      }
    };
    document.addEventListener('visibilitychange', handle);
    return () => document.removeEventListener('visibilitychange', handle);
  }, [phase, channelId, agoraToken]);

  // ── Auto-scroll commentaires ──────────────────────────────────────────────
  useEffect(() => {
    commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [comments]);

  // ── Cleanup ───────────────────────────────────────────────────────────────
  useEffect(() => () => { _releaseAgora(); clearInterval(liveTimerRef.current); }, []);

  // ── START LIVE ────────────────────────────────────────────────────────────
  const startLive = useCallback(async (selectedProducts) => {
    if (!sdkLoaded || !window.AgoraRTC) { alert('SDK Agora pas encore prêt.'); return; }
    try {
      await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    } catch {
      alert('Accès caméra/micro refusé.'); return;
    }

    setShowSelector(false);
    setPhase('live');

    try {
      // ✅ Appel sécurisé : valide les produits + génère token côté serveur
      const result = await secureCall('start-live', {
        productIds:     selectedProducts.map(p => p.refArticle),
        sellerLanguage: sellerLang,
      });

      const { channelId: cId, agoraToken: token, products: certifiedProducts } = result;

      setChannelId(cId);
      setAgoraToken(token);
      // On utilise les produits avec les PRIX DU CATALOGUE (certifiés serveur)
      setLiveProducts(certifiedProducts.map(p => ({
        ...p,
        imageUrl: p.image,
      })));

      const AgoraRTC = window.AgoraRTC;
      AgoraRTC.setLogLevel(3);
      // H.264 plutôt que VP8 : décodage matériel supporté par la quasi-
      // totalité des Android d'entrée de gamme courants en Afrique, ce qui
      // réduit la charge CPU/batterie côté spectateur et limite les
      // saccades sur les terminaux les plus modestes. VP8 reste plus
      // universel côté navigateurs desktop anciens si jamais ce choix pose
      // un souci de compatibilité constaté en prod.
      const client = AgoraRTC.createClient({ mode: 'live', codec: 'h264' });
      agoraClientRef.current = client;

      // Suivi qualité réseau : bascule automatique en mode économie après
      // 3 mesures consécutives mauvaises (évite de réagir à un pic isolé),
      // et retour automatique en mode normal après 3 mesures bonnes — sauf
      // si le vendeur a lui-même forcé le mode via le bouton (economyLockedRef).
      client.on('network-quality', (stats) => {
        const q = stats?.uplinkNetworkQuality ?? 0;
        setNetworkQuality(q);
        if (q >= 4) {
          poorNetworkCountRef.current += 1;
          goodNetworkCountRef.current = 0;
          if (!economyLockedRef.current && poorNetworkCountRef.current >= 3) {
            _applyVideoProfile(true, 'auto');
          }
        } else if (q > 0 && q <= 2) {
          goodNetworkCountRef.current += 1;
          poorNetworkCountRef.current = 0;
          if (!economyLockedRef.current && goodNetworkCountRef.current >= 3) {
            _applyVideoProfile(false, 'auto');
          }
        }
      });

      client.on('exception', (evt) => {
        console.warn('⚠️ Agora exception:', evt.code, evt.msg, evt.uid);
      });

      client.on('user-published', async (remoteUser, mediaType) => {
        await client.subscribe(remoteUser, mediaType);
        if (mediaType === 'video') {
          remoteUsersRef.current[remoteUser.uid] = remoteUser;
          const el = remoteVideoRefs.current[remoteUser.uid];
          if (el && remoteUser.videoTrack) {
            try { remoteUser.videoTrack.play(el); } catch (_) {}
          }
        }
        if (mediaType === 'audio') remoteUser.audioTrack?.play();
        setCoHosts(prev => {
          const entry = Object.values(prev).find(c => c.agoraUid === remoteUser.uid);
          if (!entry) return prev;
          return { ...prev, [remoteUser.uid]: { ...entry, status: 'active' } };
        });
      });

      client.on('user-unpublished', (remoteUser, mediaType) => {
        if (mediaType === 'video') delete remoteUsersRef.current[remoteUser.uid];
        const stillPublishing = client.remoteUsers.some(
          u => u.uid === remoteUser.uid && (u.hasVideo || u.hasAudio)
        );
        if (!stillPublishing) {
          setCoHosts(prev => { const n = { ...prev }; delete n[remoteUser.uid]; return n; });
        }
      });

      client.on('user-left', (remoteUser) => {
        delete remoteUsersRef.current[remoteUser.uid];
        setCoHosts(prev => { const n = { ...prev }; delete n[remoteUser.uid]; return n; });
      });

      await client.setClientRole('host');
      await client.join(AGORA_APP_ID, cId, token, 0);

      // Dual-stream : Agora publie en parallèle un flux "low" léger
      // (LOW_STREAM_PARAMS) que les spectateurs en réseau très faible
      // reçoivent automatiquement à la place du flux principal — évite
      // qu'un seul spectateur en mauvaise 4G ne dégrade l'expérience de
      // tous les autres. Nécessite un fallback équivalent côté lecteur
      // (setStreamFallbackOption / setRemoteVideoStreamType), à vérifier
      // dans useAgoraPlayer.js si ce fichier n'a pas encore ce réglage.
      try {
        client.setLowStreamParameter(LOW_STREAM_PARAMS);
        await client.enableDualStream();
      } catch (e) {
        console.warn('⚠️ enableDualStream indisponible sur ce navigateur:', e);
      }

      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      isMobileRef.current = isMobile;
      let audioTrack = null, videoTrack = null;
      try {
        [audioTrack, videoTrack] = await AgoraRTC.createMicrophoneAndCameraTracks(
          { encoderConfig: AUDIO_PROFILE },
          {
            encoderConfig: isMobile ? VIDEO_PROFILE_NORMAL.mobile : VIDEO_PROFILE_NORMAL.desktop,
            // 'motion' privilégie la fluidité (pas de gel) au détriment
            // d'un peu de netteté sur les mouvements rapides — plus adapté
            // qu'un mode 'detail' quand la bande passante est le facteur
            // limitant, ce qui est le cas visé ici (4G africaine).
            optimizationMode: 'motion',
          }
        );
      } catch (e1) {
        try { [audioTrack, videoTrack] = await AgoraRTC.createMicrophoneAndCameraTracks({}, {}); }
        catch (e2) {
          try { audioTrack = await AgoraRTC.createMicrophoneAudioTrack(); }
          catch (e3) { throw new Error(`Caméra/micro inaccessibles.\n(${e3.message})`); }
        }
      }

      localTrackRef.current = { audio: audioTrack, video: videoTrack };
      const toPublish = [audioTrack, videoTrack].filter(Boolean);
      if (toPublish.length) await client.publish(toPublish);

      setCameraOn(true);
      setMicOn(true);
      setFacingMode('user');
      setEconomyMode(false);
      economyLockedRef.current = false;
      poorNetworkCountRef.current = 0;
      goodNetworkCountRef.current = 0;
      setIsEngineReady(true);
      if (isChinese) setTranslationActive(true);

    } catch (err) {
      console.error('❌ Démarrage live:', err);
      await _releaseAgora();
      setPhase('pre');
      setIsEngineReady(false);
      setLiveProducts([]);
      setChannelId(null);
      setAgoraToken(null);
      alert(`Erreur : ${err.message ?? err}`);
    }

    setTimeout(() => addComment('FriTok', 'Live démarré 🎉', 'fr'), 1500);
  }, [sdkLoaded, isChinese, sellerLang]);

  // ── END LIVE ──────────────────────────────────────────────────────────────
  const endLive = useCallback(async () => {
    setIsEnding(true);
    clearInterval(liveTimerRef.current);
    await _releaseAgora();

    if (channelId) {
      try {
        // ✅ Révoque co-hosts + nettoie viewers côté serveur
        await secureCall('end-live', { channelId });
      } catch (e) { console.warn('⚠️ end-live API:', e); }
    }

    remoteUsersRef.current = {};
    setPhase('ended');
    setIsEnding(false);
    setShowEndDlg(false);
    setCoHosts({});
    setPendingRequest(null);
    dialogOpenRef.current = false;
    pendingQueueRef.current = [];
    setIsEngineReady(false);
    setAgoraToken(null);
    setNetworkQuality(0);
    setEconomyMode(false);
    economyLockedRef.current = false;
    poorNetworkCountRef.current = 0;
    goodNetworkCountRef.current = 0;
  }, [channelId]);

  async function _releaseAgora() {
    try {
      const { audio, video } = localTrackRef.current;
      audio?.stop(); audio?.close();
      video?.stop(); video?.close();
      localTrackRef.current = { audio: null, video: null };
      if (agoraClientRef.current) {
        await agoraClientRef.current.leave();
        agoraClientRef.current = null;
      }
    } catch (e) { console.warn('Cleanup Agora:', e); }
  }

  // ── ADAPTATION RÉSEAU (4G Afrique) ─────────────────────────────────────────
  // Bascule la track vidéo locale entre le profil normal (mobile/desktop)
  // et le profil économie, à chaud, sans recréer la track ni republier —
  // setEncoderConfiguration() suffit et ne coupe pas le flux pour les
  // spectateurs déjà connectés.
  async function _applyVideoProfile(useEconomy, origin = 'manual') {
    const videoTrack = localTrackRef.current?.video;
    if (!videoTrack) return;
    try {
      const profile = useEconomy
        ? VIDEO_PROFILE_ECONOMY
        : (isMobileRef.current ? VIDEO_PROFILE_NORMAL.mobile : VIDEO_PROFILE_NORMAL.desktop);
      await videoTrack.setEncoderConfiguration(profile);
      setEconomyMode(useEconomy);
      if (origin === 'manual') economyLockedRef.current = useEconomy;
      poorNetworkCountRef.current = 0;
      goodNetworkCountRef.current = 0;
      addComment(
        'FriTok',
        useEconomy
          ? (origin === 'auto' ? '📶 Réseau faible détecté — qualité vidéo réduite automatiquement' : '🐢 Mode économie de données activé')
          : (origin === 'auto' ? '📶 Réseau rétabli — qualité vidéo restaurée' : '⚡ Mode économie de données désactivé'),
        'fr'
      );
    } catch (e) {
      console.warn('⚠️ _applyVideoProfile:', e);
    }
  }

  // Bouton manuel — verrouille le choix pour que l'auto-ajustement ne le
  // reprenne pas tant que le vendeur ne clique pas à nouveau.
  const toggleEconomyMode = useCallback(() => {
    _applyVideoProfile(!economyMode, 'manual');
  }, [economyMode]);

  // ── ENGAGEMENT ────────────────────────────────────────────────────────────
  // ✅ Plus de chiffres envoyés depuis le client — incréments atomiques serveur
  const toggleLike = useCallback(async () => {
    const nextLiked = !liked;
    setLiked(nextLiked);
    setLikeCount(c => Math.max(0, c + (nextLiked ? 1 : -1)));
    if (channelId) {
      try { await secureCall('update-engagement', { channelId, action: nextLiked ? 'like' : 'unlike' }); }
      catch (e) { console.warn('⚠️ engagement:', e); }
    }
  }, [liked, channelId]);

  const sendGift = useCallback(async () => {
    setGiftCount(c => c + 1);
    if (channelId) {
      try { await secureCall('update-engagement', { channelId, action: 'gift' }); }
      catch (e) { console.warn('⚠️ engagement gift:', e); }
    }
  }, [channelId]);

  // ── CAMÉRA / MICRO ────────────────────────────────────────────────────────
  const toggleCamera = useCallback(async () => {
    const videoTrack = localTrackRef.current?.video;
    if (!videoTrack) return;
    try {
      const next = !cameraOn;
      await videoTrack.setEnabled(next);
      setCameraOn(next);
    } catch (e) {
      console.warn('⚠️ toggleCamera:', e);
    }
  }, [cameraOn]);

  const toggleMic = useCallback(async () => {
    const audioTrack = localTrackRef.current?.audio;
    if (!audioTrack) return;
    try {
      const next = !micOn;
      await audioTrack.setEnabled(next);
      setMicOn(next);
    } catch (e) {
      console.warn('⚠️ toggleMic:', e);
    }
  }, [micOn]);

  // ── SWITCH CAMERA (avant/arrière) ─────────────────────────────────────────
  const switchCamera = useCallback(async () => {
    const videoTrack = localTrackRef.current?.video;
    if (!videoTrack || switchingCamera) return;

    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (!isMobile) {
      alert('Le changement de caméra est disponible uniquement sur mobile.');
      return;
    }

    setSwitchingCamera(true);
    const nextFacingMode = facingMode === 'user' ? 'environment' : 'user';

    try {
      // Récupère la liste des caméras disponibles
      const cameras = await window.AgoraRTC.getCameras();
      if (!cameras || cameras.length < 2) {
        alert('Une seule caméra détectée sur cet appareil.');
        setSwitchingCamera(false);
        return;
      }

      // Cherche le device correspondant au facingMode voulu (via le label)
      const targetCamera = cameras.find(cam => {
        const label = cam.label?.toLowerCase() ?? '';
        return nextFacingMode === 'environment'
          ? /back|rear|environment|arrière/.test(label)
          : /front|user|avant|face/.test(label);
      });

      if (targetCamera) {
        await videoTrack.setDevice(targetCamera.deviceId);
      } else {
        // Repli : bascule simplement vers la caméra suivante dans la liste
        // (utile quand le navigateur ne fournit pas de labels exploitables,
        // par ex. Safari iOS tant que la permission n'a pas été confirmée)
        const currentLabel = videoTrack.getTrackLabel ? videoTrack.getTrackLabel() : null;
        const otherCamera = cameras.find(cam => cam.label !== currentLabel) ?? cameras[1];
        await videoTrack.setDevice(otherCamera.deviceId);
      }

      setFacingMode(nextFacingMode);

      // Relance la lecture locale sur le nouveau flux
      if (localVideoRef.current) {
        setTimeout(() => videoTrack.play(localVideoRef.current), 100);
      }
    } catch (e) {
      console.error('❌ switchCamera:', e);
      alert(`Impossible de changer de caméra : ${e.message ?? e}`);
    } finally {
      setSwitchingCamera(false);
    }
  }, [facingMode, switchingCamera]);

  // ── ACCEPT CO-HOST ────────────────────────────────────────────────────────
  const acceptCoHost = async (coHost) => {
    if (Object.keys(coHosts).length >= MAX_COHOSTS) {
      alert(`Maximum ${MAX_COHOSTS} co-hosts atteint.`); return;
    }
    try {
      // ✅ Token généré côté serveur et transmis via notification privée
      const result = await secureCall('accept-cohost', { channelId, coHostUid: coHost.uid });
      const { agoraUid } = result;

      setCoHosts(prev => ({
        ...prev,
        [agoraUid]: { uid: coHost.uid, displayName: coHost.displayName, agoraUid, status: 'waiting' },
      }));
      addComment('🎙️', `${coHost.displayName} a rejoint la scène`, 'fr');
    } catch (e) {
      console.error('❌ acceptCoHost:', e);
      alert(`Impossible d'accepter ce co-host : ${e.message}`);
    }
    setPendingRequest(null);
    dialogOpenRef.current = false;
    _processNextRequest();
  };

  const declineCoHost = async () => {
    // Le viewer verra son statut passer à 'declined' via son listener Firestore
    // On laisse la Cloud Function gérer ça, ou on peut écrire directement ici
    // car le viewer a le droit de mettre son propre doc en status='left'
    if (channelId && pendingRequest) {
      try {
        const { doc: firestoreDoc, updateDoc } = await import('firebase/firestore');
        const coHostRef = firestoreDoc(db, 'live_sessions', channelId, 'co_hosts', pendingRequest.uid);
        // On ne peut pas écrire 'declined' depuis le client (règle = only 'left')
        // → l'hôte peut simplement ignorer ; le viewer verra timeout côté app
        // Pour une UX propre, appeler une fonction dédiée decline-cohost
      } catch (_) {}
    }
    setPendingRequest(null);
    dialogOpenRef.current = false;
    _processNextRequest();
  };

  const removeCoHost = async (agoraUid) => {
    const coHost = coHosts[agoraUid];
    if (channelId && coHost) {
      try {
        await secureCall('accept-cohost', { channelId, coHostUid: coHost.uid, action: 'remove' });
      } catch (_) {}
    }
    delete remoteUsersRef.current[agoraUid];
    setCoHosts(prev => { const n = { ...prev }; delete n[agoraUid]; return n; });
    setShowRemoveDialog(null);
  };

  // ── COMMENTAIRES ──────────────────────────────────────────────────────────
  const addComment = (sender, text, lang = 'fr') =>
    setComments(prev => [...prev, { id: `${Date.now()}-${Math.random()}`, sender, text, lang }]);

  const sendComment = async () => {
    if (!commentText.trim()) return;
    const text = commentText.trim().slice(0, 300); // limite client (serveur valide aussi)
    const user  = auth.currentUser;
    if (!channelId || !user) return;

    // ⚠️ Les règles Firestore exigent une égalité STRICTE :
    //   request.resource.data.sender == request.auth.token.name
    // Bloquer silencieusement ici rendait le bouton "Envoyer" apparemment
    // inerte (aucun retour visible). On répare maintenant automatiquement :
    // si le claim manque, on définit un displayName par défaut puis on
    // force le rafraîchissement du token pour récupérer le nouveau claim.
    let senderName;
    try {
      let idTokenResult = await user.getIdTokenResult();
      senderName = idTokenResult.claims.name;
      if (!senderName) {
        const fallbackName = user.displayName
          || user.email?.split('@')[0]
          || `Vendeur_${user.uid.slice(0, 6)}`;
        await updateProfile(user, { displayName: fallbackName });
        idTokenResult = await user.getIdTokenResult(true); // forceRefresh
        senderName = idTokenResult.claims.name;
      }
    } catch (e) {
      console.warn('⚠️ getIdTokenResult/updateProfile:', e);
    }
    if (!senderName) {
      alert("Impossible d'envoyer le commentaire : profil incomplet. Réessayez dans quelques secondes.");
      return;
    }

    addComment(senderName, text, isChinese ? 'zh' : 'fr');
    setCommentText('');
    try {
      const ref = doc(collection(db, 'live_comments'));
      // ✅ userId + sender alignés sur les nouvelles règles Firestore
      await setDoc(ref, {
        commentId:  ref.id,
        userId:     user.uid,       // requis par les règles
        sender:     senderName,     // == request.auth.token.name (obligatoire)
        text,
        timestamp:  serverTimestamp(), // ✅ vrai timestamp serveur (l'objet littéral précédent cassait le tri côté spectateur)
        channelId,
        lang: isChinese ? 'zh' : 'fr',
      });
    } catch (e) {
      console.warn('⚠️ sendComment:', e.code ?? e.message ?? e);
      alert("Le commentaire n'a pas pu être envoyé (" + (e.code ?? 'erreur réseau') + ").");
    }
  };

  const fmtTime = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  const activeCoHosts = Object.values(coHosts).filter(c => c.status === 'active' || c.status === 'waiting');

  // ── RENDER ────────────────────────────────────────────────────────────────
  if (phase === 'pre') return (
    <>
      <PreLiveScreen
        products={allProducts} loading={loadingProds} userId={userId}
        sellerLang={sellerLang} setSellerLang={setSellerLang}
        sdkReady={sdkLoaded} onOpenSelector={() => setShowSelector(true)}
      />
      <GoLiveProductSelector
        products={allProducts} loading={loadingProds}
        isOpen={showSelector} onClose={() => setShowSelector(false)}
        onStart={startLive}
      />
    </>
  );

  if (phase === 'ended') return (
    <EndedScreen likeCount={likeCount} giftCount={giftCount}
      viewerCount={viewerCount} duration={fmtTime(liveSeconds)} onBack={() => router.back()} />
  );

  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: 430, margin: '0 auto', height: '100vh', minHeight: '-webkit-fill-available', background: '#000', overflow: 'hidden', fontFamily: 'system-ui,sans-serif' }}>
      <VideoLayout localVideoRef={localVideoRef} isEngineReady={isEngineReady} cameraOn={cameraOn} />
      <CoHostThumbs remoteVideoRefs={remoteVideoRefs} activeCoHosts={activeCoHosts} onRemove={uid => setShowRemoveDialog(uid)} />

      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '55%', background: 'linear-gradient(to top,rgba(0,0,0,.88),transparent)', pointerEvents: 'none' }} />

      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '13px 12px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
          <Pill bg="#EF4444cc"><PulseDot /> En direct</Pill>
          <span style={{ color: '#ffffff90', fontSize: 13 }}>{fmtTime(liveSeconds)}</span>
          {isChinese && <Pill bg="#F97316cc">🇨🇳→🇫🇷</Pill>}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <TopBtn onClick={() => setShowComments(v => !v)}>💬</TopBtn>
          <TopBtn onClick={() => navigator.share?.({ title: 'FriTok Live', url: window.location.href })}>🔗</TopBtn>
          <TopBtn onClick={() => setShowEndDlg(true)} danger>✕</TopBtn>
        </div>
      </div>

      <div style={{ position: 'absolute', top: 56, left: 12, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <Pill bg="rgba(0,0,0,.65)">👁️ {viewerCount}</Pill>
        {networkQuality > 0 && (
          <Pill bg={networkQuality <= 2 ? 'rgba(34,197,94,.75)' : networkQuality <= 3 ? 'rgba(249,115,22,.75)' : 'rgba(239,68,68,.75)'}>
            {networkQuality <= 2 ? '🟢' : networkQuality <= 3 ? '🟠' : '🔴'} Réseau
          </Pill>
        )}
        <button onClick={toggleEconomyMode} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
          <Pill bg={economyMode ? 'rgba(249,115,22,.85)' : 'rgba(0,0,0,.5)'}>
            {economyMode ? '🐢 Économie' : '⚡ Qualité normale'}
          </Pill>
        </button>
        {activeCoHosts.length > 0 && (
          <button onClick={() => setShowCoHostPanel(v => !v)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
            <Pill bg="rgba(124,58,237,.75)">👥 {activeCoHosts.length} sur scène</Pill>
          </button>
        )}
        {isChinese && <Pill bg={translationActive ? 'rgba(249,115,22,.85)' : 'rgba(80,80,80,.8)'}>🌐 Trad. active</Pill>}
      </div>

      <div style={{ position: 'absolute', right: 10, top: 104, display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center' }}>
        <div style={{ width: 46, height: 46, borderRadius: '50%', background: 'rgba(255,255,255,.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, marginBottom: 6 }}>🎙️</div>
        <ABtn icon={liked ? '❤️' : '🤍'} label={String(likeCount)} onClick={toggleLike} active={liked} />
        <ABtn icon="🎁" label={String(giftCount)} onClick={sendGift} />
        <ABtn icon={cameraOn ? '📷' : '🚫'} onClick={toggleCamera} active={!cameraOn} />
        <ABtn icon={switchingCamera ? '⏳' : '🔄'} onClick={switchCamera} />
        <ABtn icon={micOn ? '🎤' : '🔇'} onClick={toggleMic} active={!micOn} />
        <ABtn icon={showComments ? '💬' : '💭'} onClick={() => setShowComments(v => !v)} active={showComments} />
        <ABtn icon="👥" onClick={() => setShowCoHostPanel(v => !v)} active={showCoHostPanel} />
        <ABtn icon="🔗" onClick={() => navigator.share?.({ title: 'FriTok Live', url: window.location.href })} />
      </div>

      {showProductCard && liveProducts.length > 0 && (
        <ProductCard product={liveProducts[productIndex]} index={productIndex}
          total={liveProducts.length} onClose={() => setShowProductCard(false)} onChange={setProductIndex} />
      )}

      {showComments && (
        <div style={{ position: 'absolute', bottom: 72, left: 12, right: 66, background: 'rgba(0,0,0,.82)', borderRadius: 14, padding: 12, maxHeight: 260, display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, overflowY: 'auto', marginBottom: 8 }}>
            {comments.map(c => (
              <div key={c.id} style={{ marginBottom: 6 }}>
                <span style={{ color: '#F97316', fontWeight: 700, fontSize: 12 }}>{c.sender}: </span>
                <span style={{ color: '#ffffffcc', fontSize: 13 }}>{c.text}</span>
              </div>
            ))}
            <div ref={commentsEndRef} />
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input value={commentText} onChange={e => setCommentText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendComment()} placeholder="Commenter..."
              style={{ flex: 1, padding: '7px 10px', borderRadius: 8, background: '#ffffff15', border: '1px solid #ffffff25', color: '#fff', fontSize: 13, outline: 'none' }} />
            <button onClick={sendComment} style={{ padding: '7px 12px', borderRadius: 8, background: '#F97316', border: 'none', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>↑</button>
          </div>
        </div>
      )}

      {showCoHostPanel && (
        <CoHostPanel activeCoHosts={activeCoHosts} maxCoHosts={MAX_COHOSTS}
          onClose={() => setShowCoHostPanel(false)} onRemove={uid => setShowRemoveDialog(uid)} />
      )}

      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '10px 12px 20px', display: 'flex', gap: 8 }}>
        <input value={commentText} onChange={e => setCommentText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && sendComment()} placeholder="Ajouter un commentaire..."
          style={{ flex: 1, padding: '9px 14px', borderRadius: 24, background: 'rgba(255,255,255,.12)', border: '1px solid rgba(255,255,255,.2)', color: '#fff', fontSize: 14, outline: 'none' }} />
        <button onClick={() => setShowEndDlg(true)} style={{ padding: '9px 14px', borderRadius: 24, background: '#EF4444', border: 'none', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}>⏹ Fin</button>
      </div>

      {showEndDlg && (
        <LiveModal>
          <ModalTitle>Terminer le live ?</ModalTitle>
          <ModalSub>Le live sera clôturé pour tous les spectateurs.</ModalSub>
          <ModalRow><BtnSec onClick={() => setShowEndDlg(false)}>Annuler</BtnSec><BtnPri onClick={endLive} disabled={isEnding} color="#EF4444">{isEnding ? 'Fermeture...' : 'Terminer'}</BtnPri></ModalRow>
        </LiveModal>
      )}

      {pendingRequest && !showEndDlg && (
        <LiveModal>
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(124,58,237,.25)', border: '2px solid rgba(124,58,237,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, margin: '0 auto 12px', color: '#A855F7', fontWeight: 700 }}>
              {pendingRequest.displayName[0]?.toUpperCase() ?? '?'}
            </div>
            <ModalTitle>{pendingRequest.displayName}</ModalTitle>
            <ModalSub>souhaite rejoindre le live en vidéo</ModalSub>
            <ModalRow>
              <BtnSec onClick={declineCoHost}>Refuser</BtnSec>
              <BtnPri onClick={() => acceptCoHost(pendingRequest)} color="linear-gradient(135deg,#7C3AED,#A855F7)">Accepter</BtnPri>
            </ModalRow>
          </div>
        </LiveModal>
      )}

      {showRemoveDialog !== null && (
        <LiveModal>
          <ModalTitle>Retirer {coHosts[showRemoveDialog]?.displayName} ?</ModalTitle>
          <ModalSub>Ce participant sera retiré du live vidéo.</ModalSub>
          <ModalRow>
            <BtnSec onClick={() => setShowRemoveDialog(null)}>Annuler</BtnSec>
            <BtnPri onClick={() => removeCoHost(showRemoveDialog)} color="#EF4444">Retirer</BtnPri>
          </ModalRow>
        </LiveModal>
      )}
    </div>
  );
}

// ── Export ────────────────────────────────────────────────────────────────────
export default function GoLivePage() {
  return (
    <SubscriptionGuard>
      <GoLiveContent />
    </SubscriptionGuard>
  );
}

// ── Sous-composants (identiques à l'original, sauf VideoLayout) ──────────────
function GoLiveProductSelector({ products, loading, isOpen, onClose, onStart }) {
  const [selected, setSelected] = useState(new Set());
  useEffect(() => { if (!isOpen) setSelected(new Set()); }, [isOpen]);
  if (!isOpen) return null;
  const toggle = (ref) => setSelected(prev => { const next = new Set(prev); next.has(ref) ? next.delete(ref) : next.add(ref); return next; });
  const canStart = selected.size > 0;
  return (
    <div onClick={e => e.target === e.currentTarget && onClose()} style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,.78)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, fontFamily: 'system-ui,sans-serif' }}>
      <div style={{ background: '#1C1008', borderRadius: 20, padding: 24, width: '100%', maxWidth: 460, maxHeight: '88vh', overflowY: 'auto', boxSizing: 'border-box' }}>
        <p style={{ color: '#fff', fontWeight: 800, fontSize: 17, margin: '0 0 4px' }}>Sélectionner les produits</p>
        <p style={{ color: '#ffffff70', fontSize: 12, margin: '0 0 16px' }}>{selected.size} / {products.length} sélectionné{selected.size > 1 ? 's' : ''}</p>
        {loading && <div style={{ textAlign: 'center', padding: '24px 0', color: '#ffffff70', display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center' }}><Spinner /> Chargement...</div>}
        {!loading && products.length === 0 && <div style={{ textAlign: 'center', padding: '28px 16px', background: 'rgba(239,68,68,.08)', borderRadius: 12, border: '1px solid rgba(239,68,68,.2)', marginBottom: 16 }}><p style={{ fontSize: 32, margin: '0 0 10px' }}>📭</p><p style={{ color: '#FCA5A5', fontWeight: 700, fontSize: 15, margin: '0 0 6px' }}>Aucune vidéo publiée</p><p style={{ color: '#ffffff70', fontSize: 13, margin: 0, lineHeight: 1.5 }}>Ajoutez un produit depuis l'app mobile avant de lancer un live.</p></div>}
        {!loading && products.length > 0 && <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>{products.map(p => { const checked = selected.has(p.refArticle); return (<button key={p.refArticle} onClick={() => toggle(p.refArticle)} style={{ display: 'flex', alignItems: 'center', gap: 10, background: checked ? 'rgba(249,115,22,.12)' : 'rgba(255,255,255,.04)', border: `1px solid ${checked ? 'rgba(249,115,22,.45)' : 'rgba(255,255,255,.1)'}`, borderRadius: 12, padding: '10px 12px', cursor: 'pointer', textAlign: 'left', width: '100%', transition: 'all .15s' }}><ProductThumb src={p.imageUrl} name={p.name} size={48} /><div style={{ flex: 1, minWidth: 0 }}><p style={{ color: '#fff', fontSize: 13, fontWeight: 600, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</p><p style={{ color: '#ffffff80', fontSize: 11, margin: '2px 0 0' }}>{p.description ? `${p.description} · ` : ''}<span style={{ color: '#F97316', fontWeight: 700 }}>{Number(p.price).toLocaleString('fr-FR')} FCFA</span></p></div><div style={{ width: 22, height: 22, borderRadius: 6, flexShrink: 0, border: `2px solid ${checked ? '#F97316' : 'rgba(255,255,255,.3)'}`, background: checked ? '#F97316' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all .15s' }}>{checked && <span style={{ color: '#fff', fontSize: 13, lineHeight: 1 }}>✓</span>}</div></button>); })}</div>}
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '11px 0', borderRadius: 12, background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.12)', color: '#ffffff80', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>Annuler</button>
          <button onClick={() => canStart && onStart(products.filter(p => selected.has(p.refArticle)))} disabled={!canStart} style={{ flex: 2, padding: '11px 0', borderRadius: 12, border: 'none', background: canStart ? 'linear-gradient(135deg,#F97316,#EA580C)' : 'rgba(255,255,255,.1)', color: canStart ? '#fff' : 'rgba(255,255,255,.3)', fontWeight: 800, fontSize: 15, cursor: canStart ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>🔴 Démarrer{canStart && <span style={{ background: 'rgba(0,0,0,.2)', borderRadius: 10, fontSize: 11, padding: '1px 7px' }}>{selected.size}</span>}</button>
        </div>
      </div>
    </div>
  );
}

function VideoLayout({ localVideoRef, isEngineReady, cameraOn }) {
  if (!isEngineReady) return (<div style={{ position: 'absolute', inset: 0, background: '#0a0a1e', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14 }}><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style><div style={{ width: 38, height: 38, borderRadius: '50%', border: '3px solid #F97316', borderTopColor: 'transparent', animation: 'spin .8s linear infinite' }} /><p style={{ color: '#ffffff80', fontSize: 14 }}>Démarrage du live...</p></div>);
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#111' }}>
      <div ref={localVideoRef} style={{ position: 'absolute', inset: 0 }} />
      {!cameraOn && (
        <div style={{ position: 'absolute', inset: 0, background: '#0a0a1e', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          <span style={{ fontSize: 40 }}>🚫📷</span>
          <p style={{ color: '#ffffff80', fontSize: 13 }}>Caméra coupée</p>
        </div>
      )}
    </div>
  );
}
function CoHostThumbs({ remoteVideoRefs, activeCoHosts, onRemove }) {
  if (activeCoHosts.length === 0) return null;
  return (<div style={{ position: 'absolute', right: 64, top: 104, zIndex: 30, display: 'flex', flexDirection: 'column', gap: 8 }}>{activeCoHosts.map(c => (<div key={c.agoraUid} style={{ width: 88, height: 124, borderRadius: 12, overflow: 'hidden', position: 'relative', background: '#1a1a2e', border: '2px solid rgba(168,85,247,.6)', boxShadow: '0 2px 10px rgba(0,0,0,.5)' }}><div ref={el => { if (el) remoteVideoRefs.current[c.agoraUid] = el; else delete remoteVideoRefs.current[c.agoraUid]; }} style={{ position: 'absolute', inset: 0 }} />{c.status === 'waiting' && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Spinner /></div>}<div style={{ position: 'absolute', bottom: 3, left: 3, right: 3, background: 'rgba(0,0,0,.6)', borderRadius: 5, padding: '1px 4px', fontSize: 9, fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.displayName}</div><button onClick={() => onRemove(c.agoraUid)} style={{ position: 'absolute', top: 3, right: 3, width: 18, height: 18, borderRadius: '50%', background: 'rgba(239,68,68,.9)', border: 'none', color: '#fff', fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button></div>))}</div>);
}
function PreLiveScreen({ products, loading, userId, sellerLang, setSellerLang, sdkReady, onOpenSelector }) {
  return (<div style={{ minHeight: '100vh', background: '#0a0a0a', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui,sans-serif', color: '#fff', padding: '24px 24px env(safe-area-inset-bottom,24px)', boxSizing: 'border-box' }}><div style={{ maxWidth: 440, width: '100%' }}><div style={{ textAlign: 'center', marginBottom: 32 }}><div style={{ fontSize: 52, marginBottom: 8 }}>🎬</div><h1 style={{ fontSize: 30, fontWeight: 900, margin: '0 0 6px', letterSpacing: -1 }}>FriTok <span style={{ color: '#F97316' }}>Live</span></h1><p style={{ color: '#ffffff70', fontSize: 15 }}>Vendez en direct. Connectez vos clients.</p></div><p style={{ fontSize: 13, color: '#ffffff60', textAlign: 'center', marginBottom: 10 }}>Langue du vendeur</p><div style={{ display: 'flex', gap: 10, marginBottom: 28 }}>{[{ code: 'fr', label: '🇫🇷 Français', sub: 'Direct' }, { code: 'zh', label: '🇨🇳 中文', sub: 'Trad. auto → FR' }].map(l => (<button key={l.code} onClick={() => setSellerLang(l.code)} style={{ flex: 1, padding: 12, borderRadius: 14, border: `2px solid ${sellerLang === l.code ? '#F97316' : 'rgba(255,255,255,.15)'}`, background: sellerLang === l.code ? 'rgba(249,115,22,.1)' : 'transparent', color: '#fff', cursor: 'pointer', transition: 'all .2s' }}><div style={{ fontWeight: 700, fontSize: 15 }}>{l.label}</div><div style={{ fontSize: 11, color: '#ffffff70', marginTop: 3 }}>{l.sub}</div></button>))}</div><button onClick={onOpenSelector} disabled={!sdkReady || loading || products.length === 0} style={{ width: '100%', padding: '15px 0', borderRadius: 16, background: (!sdkReady || loading || products.length === 0) ? '#333' : 'linear-gradient(135deg,#EF4444,#DC2626)', border: 'none', color: '#fff', fontSize: 17, fontWeight: 800, cursor: (!sdkReady || loading || products.length === 0) ? 'not-allowed' : 'pointer', opacity: (!sdkReady || loading || products.length === 0) ? 0.5 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}><PulseDot />{loading ? 'Chargement...' : products.length === 0 ? 'Aucune vidéo disponible' : 'Sélectionner les produits'}</button></div></div>);
}
function EndedScreen({ likeCount, giftCount, viewerCount, duration, onBack }) {
  return (<div style={{ minHeight: '100vh', background: '#0a0a0a', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui,sans-serif', color: '#fff', padding: 24, textAlign: 'center' }}><div style={{ fontSize: 56, marginBottom: 16 }}>🎉</div><h2 style={{ fontSize: 26, fontWeight: 900, marginBottom: 8 }}>Live terminé !</h2><p style={{ color: '#ffffff70', marginBottom: 32 }}>Durée : {duration}</p><div style={{ display: 'flex', gap: 28, marginBottom: 36, justifyContent: 'center' }}>{[{ v: viewerCount, l: '👁️ Spectateurs' }, { v: likeCount, l: '❤️ Likes' }, { v: giftCount, l: '🎁 Cadeaux' }].map(s => (<div key={s.l}><p style={{ fontSize: 28, fontWeight: 900, margin: 0 }}>{s.v}</p><p style={{ color: '#ffffff60', fontSize: 12, margin: '4px 0 0' }}>{s.l}</p></div>))}</div><button onClick={onBack} style={{ padding: '13px 32px', borderRadius: 40, background: '#F97316', border: 'none', color: '#fff', fontWeight: 700, fontSize: 16, cursor: 'pointer' }}>← Retour</button></div>);
}
function ProductThumb({ src, name, size = 48 }) {
  const [err, setErr] = useState(false);
  if (src && !err) return <img src={src} alt={name || ''} onError={() => setErr(true)} style={{ width: size, height: size, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />;
  return <div style={{ width: size, height: size, borderRadius: 8, flexShrink: 0, background: 'rgba(249,115,22,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.45 }}>🛍️</div>;
}
function ProductCard({ product, index, total, onClose, onChange }) {
  return (<div style={{ position: 'absolute', bottom: 76, left: 12, right: 64, background: 'rgba(0,0,0,.82)', borderRadius: 16, padding: 12, border: '1px solid rgba(255,255,255,.1)' }}><button onClick={onClose} style={{ position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: '50%', background: '#EF4444', border: 'none', color: '#fff', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button><div style={{ display: 'flex', gap: 10 }}><ProductThumb src={product.imageUrl} size={72} /><div style={{ flex: 1, minWidth: 0 }}><p style={{ color: '#fff', fontWeight: 700, fontSize: 14, margin: '0 0 3px' }}>{product.name}</p><p style={{ color: '#F97316', fontWeight: 700, fontSize: 14, margin: '0 0 5px' }}>{Number(product.price).toLocaleString('fr-FR')} FCFA</p>{product.description && <p style={{ color: '#ffffff80', fontSize: 11, margin: '0 0 7px', lineHeight: 1.4 }}>{product.description}</p>}<button style={{ width: '100%', padding: '6px 0', borderRadius: 8, background: '#F97316', border: 'none', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>🛒 Acheter</button></div></div>{total > 1 && <div style={{ display: 'flex', justifyContent: 'center', gap: 5, marginTop: 8 }}>{Array.from({ length: total }, (_, i) => (<button key={i} onClick={() => onChange(i)} style={{ width: i === index ? 14 : 8, height: 8, borderRadius: 8, border: 'none', padding: 0, cursor: 'pointer', background: i === index ? '#F97316' : 'rgba(255,255,255,.4)', transition: 'all .25s' }} />))}</div>}</div>);
}
function CoHostPanel({ activeCoHosts, maxCoHosts, onClose, onRemove }) {
  return (<div style={{ position: 'absolute', bottom: 72, left: 12, right: 12, background: 'rgba(0,0,0,.92)', borderRadius: 16, padding: 14, border: '1px solid rgba(168,85,247,.3)' }}><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}><span style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>👥 Co-hosts sur scène</span><button onClick={onClose} style={{ background: 'none', border: 'none', color: '#ffffff70', cursor: 'pointer', fontSize: 18 }}>✕</button></div>{activeCoHosts.length === 0 ? <p style={{ color: '#ffffff50', fontSize: 13 }}>Aucun co-host pour l'instant.</p> : activeCoHosts.map(c => (<div key={c.agoraUid} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,.06)' }}><div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(124,58,237,.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#A855F7', fontWeight: 700, fontSize: 14 }}>{c.displayName[0].toUpperCase()}</div><span style={{ flex: 1, color: '#fff', fontSize: 13 }}>{c.displayName}</span><span style={{ background: c.status === 'waiting' ? 'rgba(249,115,22,.25)' : 'rgba(22,163,74,.25)', color: c.status === 'waiting' ? '#fed7aa' : '#86efac', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10 }}>{c.status === 'waiting' ? 'Connexion...' : 'En direct'}</span><button onClick={() => onRemove(c.agoraUid)} style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', fontSize: 18 }}>✕</button></div>))}<p style={{ color: activeCoHosts.length >= maxCoHosts ? '#F97316' : 'rgba(255,255,255,.3)', fontSize: 11, marginTop: 10 }}>{activeCoHosts.length}/{maxCoHosts} co-hosts</p></div>);
}
function Pill({ bg, children }) { return <span style={{ background: bg, borderRadius: 20, padding: '3px 9px', fontSize: 11, color: '#fff', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>{children}</span>; }
function PulseDot() { return (<><style>{`@keyframes fpulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.55;transform:scale(1.35)}}`}</style><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#fff', display: 'inline-block', animation: 'fpulse 1.4s ease-in-out infinite', flexShrink: 0 }} /></>); }
function Spinner() { return (<><style>{`@keyframes spin2{to{transform:rotate(360deg)}}`}</style><div style={{ width: 16, height: 16, borderRadius: '50%', flexShrink: 0, border: '2px solid rgba(249,115,22,.3)', borderTopColor: '#F97316', animation: 'spin2 .7s linear infinite' }} /></>); }
function TopBtn({ children, onClick, danger }) { return <button onClick={onClick} style={{ width: 34, height: 34, borderRadius: '50%', background: danger ? 'rgba(239,68,68,.3)' : 'rgba(0,0,0,.5)', border: `1px solid ${danger ? 'rgba(239,68,68,.5)' : 'rgba(255,255,255,.15)'}`, color: danger ? '#FCA5A5' : '#fff', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{children}</button>; }
function ABtn({ icon, label, onClick, active }) { return (<button onClick={onClick} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, padding: '5px 0' }}><span style={{ fontSize: 24, color: active ? '#A855F7' : '#fff' }}>{icon}</span>{label !== undefined && label !== '' && <span style={{ fontSize: 11, color: '#ffffffb0' }}>{label}</span>}</button>); }
function LiveModal({ children }) { return (<div style={{ position: 'absolute', inset: 0, zIndex: 100, background: 'rgba(0,0,0,.72)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ background: '#1C1008', borderRadius: 20, padding: 24, width: 300, maxWidth: '90%', boxSizing: 'border-box' }}>{children}</div></div>); }
function ModalTitle({ children }) { return <p style={{ color: '#fff', fontWeight: 800, fontSize: 16, textAlign: 'center', margin: '0 0 6px' }}>{children}</p>; }
function ModalSub({ children })   { return <p style={{ color: '#ffffff80', fontSize: 13, textAlign: 'center', margin: '0 0 20px' }}>{children}</p>; }
function ModalRow({ children })   { return <div style={{ display: 'flex', gap: 10 }}>{children}</div>; }
function BtnSec({ children, onClick }) { return <button onClick={onClick} style={{ flex: 1, padding: '11px 0', borderRadius: 12, background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.12)', color: '#ffffff90', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>{children}</button>; }
function BtnPri({ children, onClick, disabled, color }) { return <button onClick={onClick} disabled={disabled} style={{ flex: 1, padding: '11px 0', borderRadius: 12, border: 'none', background: color ?? '#F97316', color: '#fff', fontWeight: 700, fontSize: 14, cursor: disabled ? 'not-allowed' : 'pointer' }}>{children}</button>; }