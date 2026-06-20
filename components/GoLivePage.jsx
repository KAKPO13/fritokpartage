'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { db, auth } from '../lib/firebaseClient';
import {
  collection, doc, query, where,
  onSnapshot, setDoc, updateDoc,
  serverTimestamp, increment, deleteDoc,
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
// ── AJOUT 1 : import du guard ──────────────────────────────
import SubscriptionGuard from '../components/SubscriptionGuard';

// ─────────────────────────────────────────────────────────────
// ⚙️ Config Agora
// ─────────────────────────────────────────────────────────────
const AGORA_APP_ID   = '5bbfd51877e2435f87afef0f89cebda3';
const TOKEN_ENDPOINT = 'https://fritok1.netlify.app/.netlify/functions/agora-token';
const MAX_COHOSTS    = 3;

async function fetchAgoraToken(channelName, uid, role = 'PUBLISHER') {
  try {
    const res = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channelName, uid, role }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.token ?? null;
  } catch (e) {
    console.error('❌ Token Agora:', e);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// 📦 Mapper doc video_playlist → Product
// ─────────────────────────────────────────────────────────────
function videoDocToProduct(docSnap) {
  const d  = docSnap.data ? docSnap.data() : docSnap;
  const id = docSnap.id ?? d.id ?? '';
  const p  = d.product ?? {};
  return {
    refArticle:  id,
    name:        d.title       ?? d.name        ?? '',
    price:       p.price       ?? d.price        ?? 0,
    description: p.name        ?? d.description  ?? '',
    imageUrl:    d.thumbnail   ?? d.imageUrl     ?? null,
    boutiqueId:  p.boutiqueId  ?? d.boutiqueId   ?? '',
    productId:   p.productId   ?? d.productId    ?? id,
    userIdVend:  p.userIdVend  ?? d.userIdVend   ?? null,
  };
}

// ─────────────────────────────────────────────────────────────
// 🛍️ Sélecteur de produits
// ─────────────────────────────────────────────────────────────
function GoLiveProductSelector({ products, loading, isOpen, onClose, onStart }) {
  const [selected, setSelected] = useState(new Set());
  useEffect(() => { if (!isOpen) setSelected(new Set()); }, [isOpen]);
  if (!isOpen) return null;

  const toggle = (ref) => setSelected(prev => {
    const next = new Set(prev);
    next.has(ref) ? next.delete(ref) : next.add(ref);
    return next;
  });
  const canStart = selected.size > 0;

  return (
    <div onClick={e => e.target === e.currentTarget && onClose()} style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,.78)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16, fontFamily: 'system-ui,sans-serif',
    }}>
      <div style={{
        background: '#1C1008', borderRadius: 20, padding: 24,
        width: '100%', maxWidth: 460, maxHeight: '88vh',
        overflowY: 'auto', boxSizing: 'border-box',
      }}>
        <p style={{ color: '#fff', fontWeight: 800, fontSize: 17, margin: '0 0 4px' }}>
          Sélectionner les produits
        </p>
        <p style={{ color: '#ffffff70', fontSize: 12, margin: '0 0 16px' }}>
          {selected.size} / {products.length} sélectionné{selected.size > 1 ? 's' : ''}
        </p>

        {loading && (
          <div style={{ textAlign: 'center', padding: '24px 0', color: '#ffffff70', display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center' }}>
            <Spinner /> Chargement...
          </div>
        )}

        {!loading && products.length === 0 && (
          <div style={{ textAlign: 'center', padding: '28px 16px', background: 'rgba(239,68,68,.08)', borderRadius: 12, border: '1px solid rgba(239,68,68,.2)', marginBottom: 16 }}>
            <p style={{ fontSize: 32, margin: '0 0 10px' }}>📭</p>
            <p style={{ color: '#FCA5A5', fontWeight: 700, fontSize: 15, margin: '0 0 6px' }}>Aucune vidéo publiée</p>
            <p style={{ color: '#ffffff70', fontSize: 13, margin: 0, lineHeight: 1.5 }}>
              Ajoutez un produit depuis l'app mobile avant de lancer un live.
            </p>
          </div>
        )}

        {!loading && products.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
            {products.map(p => {
              const checked = selected.has(p.refArticle);
              return (
                <button key={p.refArticle} onClick={() => toggle(p.refArticle)} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  background: checked ? 'rgba(249,115,22,.12)' : 'rgba(255,255,255,.04)',
                  border: `1px solid ${checked ? 'rgba(249,115,22,.45)' : 'rgba(255,255,255,.1)'}`,
                  borderRadius: 12, padding: '10px 12px',
                  cursor: 'pointer', textAlign: 'left', width: '100%', transition: 'all .15s',
                }}>
                  <ProductThumb src={p.imageUrl} name={p.name} size={48} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ color: '#fff', fontSize: 13, fontWeight: 600, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</p>
                    <p style={{ color: '#ffffff80', fontSize: 11, margin: '2px 0 0' }}>
                      {p.description ? `${p.description} · ` : ''}
                      <span style={{ color: '#F97316', fontWeight: 700 }}>{Number(p.price).toLocaleString('fr-FR')} FCFA</span>
                    </p>
                  </div>
                  <div style={{
                    width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                    border: `2px solid ${checked ? '#F97316' : 'rgba(255,255,255,.3)'}`,
                    background: checked ? '#F97316' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all .15s',
                  }}>
                    {checked && <span style={{ color: '#fff', fontSize: 13, lineHeight: 1 }}>✓</span>}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{
            flex: 1, padding: '11px 0', borderRadius: 12,
            background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.12)',
            color: '#ffffff80', fontWeight: 600, fontSize: 14, cursor: 'pointer',
          }}>Annuler</button>
          <button onClick={() => canStart && onStart(products.filter(p => selected.has(p.refArticle)))}
            disabled={!canStart} style={{
              flex: 2, padding: '11px 0', borderRadius: 12, border: 'none',
              background: canStart ? 'linear-gradient(135deg,#F97316,#EA580C)' : 'rgba(255,255,255,.1)',
              color: canStart ? '#fff' : 'rgba(255,255,255,.3)',
              fontWeight: 800, fontSize: 15, cursor: canStart ? 'pointer' : 'not-allowed',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>
            🔴 Démarrer
            {canStart && <span style={{ background: 'rgba(0,0,0,.2)', borderRadius: 10, fontSize: 11, padding: '1px 7px' }}>{selected.size}</span>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 🎥 GoLiveContent — logique interne (ex-GoLivePage)
// ─────────────────────────────────────────────────────────────
// ── AJOUT 2 : renommé de GoLivePage → GoLiveContent ─────────
function GoLiveContent() {
  const router = useRouter();

  // ── Auth ──────────────────────────────────────────────────
  const [userId, setUserId] = useState(null);

  // ── Produits ──────────────────────────────────────────────
  const [allProducts,     setAllProducts]     = useState([]);
  const [loadingProds,    setLoadingProds]    = useState(true);
  const [showSelector,    setShowSelector]    = useState(false);
  const [liveProducts,    setLiveProducts]    = useState([]);
  const [productIndex,    setProductIndex]    = useState(0);
  const [showProductCard, setShowProductCard] = useState(true);

  // ── Langue ────────────────────────────────────────────────
  const [sellerLang, setSellerLang] = useState('fr');
  const isChinese = sellerLang === 'zh';

  // ── Phase ─────────────────────────────────────────────────
  const [phase, setPhase] = useState('pre'); // pre | live | ended

  // ── Agora ─────────────────────────────────────────────────
  const agoraClientRef  = useRef(null);
  const localVideoRef   = useRef(null);
  const localTrackRef   = useRef({ video: null, audio: null });
  const remoteVideoRefs = useRef({});
  const remoteUsersRef  = useRef({});

  const [sdkLoaded,     setSdkLoaded]     = useState(false);
  const [isEngineReady, setIsEngineReady] = useState(false);
  const [channelId,     setChannelId]     = useState(null);

  // ── Co-hosts ──────────────────────────────────────────────
  const [coHosts,          setCoHosts]          = useState({});
  const [showCoHostPanel,  setShowCoHostPanel]  = useState(false);
  const pendingQueueRef    = useRef([]);
  const [pendingRequest,   setPendingRequest]   = useState(null);
  const dialogOpenRef      = useRef(false);
  const [showRemoveDialog, setShowRemoveDialog] = useState(null);

  // ── UI ────────────────────────────────────────────────────
  const [viewerCount,       setViewerCount]       = useState(1);
  const [likeCount,         setLikeCount]         = useState(0);
  const [giftCount,         setGiftCount]         = useState(0);
  const [liked,             setLiked]             = useState(false);
  const [showComments,      setShowComments]      = useState(false);
  const [commentText,       setCommentText]       = useState('');
  const [comments,          setComments]          = useState([
    { id: 'sys0', sender: 'FriTok', text: 'Bienvenue dans votre live ! 🎉', lang: 'fr' },
  ]);
  const [liveSeconds,       setLiveSeconds]       = useState(0);
  const [isEnding,          setIsEnding]          = useState(false);
  const [showEndDlg,        setShowEndDlg]        = useState(false);
  const [translationActive, setTranslationActive] = useState(false);

  const commentsEndRef = useRef(null);
  const liveTimerRef   = useRef(null);

  // ── 1. Auth ───────────────────────────────────────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, user => setUserId(user?.uid ?? null));
    return unsub;
  }, []);

  // ── 2. Produits Firestore ─────────────────────────────────
  useEffect(() => {
    if (!userId) return;
    setLoadingProds(true);
    const q = query(collection(db, 'video_playlist'), where('userId', '==', userId));
    const unsub = onSnapshot(q,
      snap => { setAllProducts(snap.docs.map(videoDocToProduct)); setLoadingProds(false); },
      err  => { console.error('❌ video_playlist:', err); setLoadingProds(false); }
    );
    return unsub;
  }, [userId]);

  // ── 3. SDK Agora ──────────────────────────────────────────
  useEffect(() => {
    if (window.AgoraRTC) { setSdkLoaded(true); return; }
    const s = document.createElement('script');
    s.src = 'https://download.agora.io/sdk/release/AgoraRTC_N-4.22.1.js';
    s.async = true;
    s.onload  = () => setSdkLoaded(true);
    s.onerror = () => console.error('❌ Agora SDK failed');
    document.head.appendChild(s);
  }, []);

  // ── 4. Timer live ─────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'live') return;
    liveTimerRef.current = setInterval(() => setLiveSeconds(s => s + 1), 1000);
    return () => clearInterval(liveTimerRef.current);
  }, [phase]);

  // ── 5. Listeners Firestore (viewers + comments + co-hosts) ─
  useEffect(() => {
    if (phase !== 'live' || !channelId) return;
    const uid = auth.currentUser?.uid;

    if (uid) {
      setDoc(doc(db, 'live_sessions', channelId, 'viewers', uid), { joinedAt: serverTimestamp(), role: 'host' }).catch(() => {});
      updateDoc(doc(db, 'live_sessions', channelId), { viewerCount: increment(1) }).catch(() => {});
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
        text:   d.data().textFr ?? d.data().text ?? '',
        lang:   d.data().lang   ?? 'fr',
      }))),
      err => console.warn('comments:', err)
    );

    let firstSnap = true;
    const unsubCoHost = onSnapshot(
      query(collection(db, 'live_sessions', channelId, 'co_hosts'), where('status', '==', 'pending')),
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
        updateDoc(doc(db, 'live_sessions', channelId), { viewerCount: increment(-1) }).catch(() => {});
      }
    };
  }, [phase, channelId]);

  // ── File d'attente co-hosts ───────────────────────────────
  function _processNextRequest() {
    if (dialogOpenRef.current) return;
    pendingQueueRef.current = pendingQueueRef.current.filter(
      c => !Object.values(coHosts).some(a => a.uid === c.uid)
    );
    if (pendingQueueRef.current.length === 0) return;
    dialogOpenRef.current = true;
    const next = pendingQueueRef.current.shift();
    setPendingRequest(next);
  }

  // ── 6. Jouer vidéo locale après montage DOM ───────────────
  useEffect(() => {
    if (!isEngineReady) return;
    if (!localTrackRef.current?.video) return;
    const t = setTimeout(() => {
      if (localVideoRef.current && localTrackRef.current?.video) {
        localTrackRef.current.video.play(localVideoRef.current);
      }
    }, 100);
    return () => clearTimeout(t);
  }, [isEngineReady]);

  // ── FIX: Rejouer les vidéos distantes quand coHosts change ─
  useEffect(() => {
    if (!isEngineReady) return;
    const t = setTimeout(() => {
      Object.entries(remoteUsersRef.current).forEach(([agoraUidStr, remoteUser]) => {
        const agoraUid = Number(agoraUidStr);
        const el = remoteVideoRefs.current[agoraUid];
        if (el && remoteUser.videoTrack) {
          try {
            remoteUser.videoTrack.play(el);
            console.log('▶️ Rejoué vidéo co-host', agoraUid);
          } catch (e) {
            console.warn('⚠️ Replay co-host video:', e);
          }
        }
      });
    }, 200);
    return () => clearTimeout(t);
  }, [coHosts, isEngineReady]);

  // ── 7. Reconnexion si onglet caché ────────────────────────
  useEffect(() => {
    if (phase !== 'live') return;
    const handle = async () => {
      if (document.visibilityState !== 'visible') return;
      const client = agoraClientRef.current;
      if (!client) return;
      if (client.connectionState === 'DISCONNECTED' || client.connectionState === 'DISCONNECTING') {
        try {
          const token = await fetchAgoraToken(channelId, 0, 'PUBLISHER');
          if (token) await client.join(AGORA_APP_ID, channelId, token, 0);
          const { audio, video } = localTrackRef.current;
          if (audio && video) await client.publish([audio, video]);
          if (localVideoRef.current && video) video.play(localVideoRef.current);
        } catch (e) { console.warn('⚠️ Reconnect:', e); }
      }
    };
    document.addEventListener('visibilitychange', handle);
    return () => document.removeEventListener('visibilitychange', handle);
  }, [phase, channelId]);

  // ── 8. Auto-scroll commentaires ───────────────────────────
  useEffect(() => {
    commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [comments]);

  // ── 9. Cleanup ────────────────────────────────────────────
  useEffect(() => () => { _releaseAgora(); clearInterval(liveTimerRef.current); }, []);

  // ─────────────────────────────────────────────────────────
  // 🔴 START LIVE
  // ─────────────────────────────────────────────────────────
  const startLive = useCallback(async (products) => {
    if (!sdkLoaded || !window.AgoraRTC) { alert('SDK Agora pas encore prêt.'); return; }
    try {
      await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    } catch {
      alert('Accès caméra/micro refusé.'); return;
    }

    setLiveProducts(products);
    setShowSelector(false);
    setPhase('live');

    const cId = `live_web_${Date.now()}`;
    setChannelId(cId);

    try {
      const token = await fetchAgoraToken(cId, 0, 'PUBLISHER');
      if (!token) throw new Error('Token Agora introuvable');

      const AgoraRTC = window.AgoraRTC;
      AgoraRTC.setLogLevel(3);
      const client = AgoraRTC.createClient({ mode: 'live', codec: 'vp8' });
      agoraClientRef.current = client;

      client.on('user-published', async (remoteUser, mediaType) => {
        await client.subscribe(remoteUser, mediaType);

        if (mediaType === 'video') {
          remoteUsersRef.current[remoteUser.uid] = remoteUser;
          const el = remoteVideoRefs.current[remoteUser.uid];
          if (el && remoteUser.videoTrack) {
            try { remoteUser.videoTrack.play(el); } catch (_) {}
          }
        }

        if (mediaType === 'audio') {
          remoteUser.audioTrack?.play();
        }

        setCoHosts(prev => {
          const entry = Object.values(prev).find(c => c.agoraUid === remoteUser.uid);
          if (!entry) return prev;
          return { ...prev, [remoteUser.uid]: { ...entry, status: 'active' } };
        });
      });

      client.on('user-unpublished', (remoteUser, mediaType) => {
        if (mediaType === 'video') {
          delete remoteUsersRef.current[remoteUser.uid];
        }
        if (mediaType === 'video' || mediaType === 'audio') {
          const stillPublishing = client.remoteUsers.some(
            u => u.uid === remoteUser.uid && (u.hasVideo || u.hasAudio)
          );
          if (!stillPublishing) {
            setCoHosts(prev => {
              const n = { ...prev };
              delete n[remoteUser.uid];
              return n;
            });
          }
        }
      });

      client.on('user-left', (remoteUser) => {
        delete remoteUsersRef.current[remoteUser.uid];
        setCoHosts(prev => { const n = { ...prev }; delete n[remoteUser.uid]; return n; });
      });

      await client.setClientRole('host');
      await client.join(AGORA_APP_ID, cId, token, 0);

      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      let audioTrack = null, videoTrack = null;
      try {
        [audioTrack, videoTrack] = await AgoraRTC.createMicrophoneAndCameraTracks(
          { encoderConfig: 'music_standard' },
          isMobile
            ? { encoderConfig: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { max: 24 }, bitrateMax: 800 } }
            : { encoderConfig: { width: 1280, height: 720, frameRate: 30, bitrateMax: 2000 } }
        );
      } catch (e1) {
        console.warn('⚠️ Tentative 1:', e1.message);
        try {
          [audioTrack, videoTrack] = await AgoraRTC.createMicrophoneAndCameraTracks({}, {});
        } catch (e2) {
          console.warn('⚠️ Tentative 2:', e2.message);
          try {
            audioTrack = await AgoraRTC.createMicrophoneAudioTrack();
          } catch (e3) {
            throw new Error(`Caméra/micro inaccessibles.\n(${e3.message})`);
          }
        }
      }

      localTrackRef.current = { audio: audioTrack, video: videoTrack };
      const toPublish = [audioTrack, videoTrack].filter(Boolean);
      if (toPublish.length) await client.publish(toPublish);

      setIsEngineReady(true);
      if (isChinese) setTranslationActive(true);

      try {
        const user = auth.currentUser;
        await setDoc(doc(db, 'live_sessions', cId), {
          channelId:          cId,
          sellerId:           user?.uid ?? '',
          sellerName:         user?.displayName ?? '',
          sellerAvatar:       user?.photoURL ?? null,
          sellerLanguage:     isChinese ? 'zh' : 'fr',
          translationEnabled: isChinese,
          coHostEnabled:      true,
          maxCoHosts:         MAX_COHOSTS,
          products:           products.map(p => ({
            refArticle:  p.refArticle,
            name:        p.name,
            price:       p.price,
            image:       p.imageUrl ?? '',
            description: p.description ?? '',
            productId:   p.productId,
            boutiqueId:  p.boutiqueId,
          })),
          isLive:          true,
          startedAt:       serverTimestamp(),
          viewerCount:     1,
          likeCount:       0,
          giftCount:       0,
          engagementScore: 0,
        });
        console.log('✅ live_sessions créé:', cId);
      } catch (fsErr) { console.warn('⚠️ Firestore:', fsErr); }

    } catch (err) {
      console.error('❌ Démarrage live:', err);
      await _releaseAgora();
      setPhase('pre');
      setIsEngineReady(false);
      setLiveProducts([]);
      alert(`Erreur : ${err.message ?? err}`);
    }

    setTimeout(() => addComment('FriTok', 'Live démarré 🎉', 'fr'), 1500);
  }, [sdkLoaded, isChinese]);

  // ─────────────────────────────────────────────────────────
  // ⏹ END LIVE
  // ─────────────────────────────────────────────────────────
  const endLive = useCallback(async () => {
    setIsEnding(true);
    clearInterval(liveTimerRef.current);
    await _releaseAgora();
    if (channelId) {
      try {
        await updateDoc(doc(db, 'live_sessions', channelId), { isLive: false, endedAt: serverTimestamp() });
        const uid = auth.currentUser?.uid;
        if (uid) await deleteDoc(doc(db, 'live_sessions', channelId, 'viewers', uid));
      } catch (e) { console.warn('⚠️ endLive Firestore:', e); }
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

  // ─────────────────────────────────────────────────────────
  // 📊 Engagement Firestore
  // ─────────────────────────────────────────────────────────
  const _updateEngagement = useCallback(async (likes, gifts) => {
    if (!channelId) return;
    try {
      await updateDoc(doc(db, 'live_sessions', channelId), {
        likeCount: likes, giftCount: gifts,
        engagementScore: likes + gifts + viewerCount,
      });
    } catch (_) {}
  }, [channelId, viewerCount]);

  // ─────────────────────────────────────────────────────────
  // 👥 CO-HOSTS — Accepter / Refuser / Retirer
  // ─────────────────────────────────────────────────────────
  const acceptCoHost = async (coHost) => {
    if (Object.keys(coHosts).length >= MAX_COHOSTS) {
      alert(`Maximum ${MAX_COHOSTS} co-hosts atteint.`); return;
    }

    const agoraUid = Math.abs(
      [...coHost.uid].reduce((a, c) => Math.imul(31, a) + c.charCodeAt(0) | 0, 0)
    ) % 100000 + 1000;

    const token = await fetchAgoraToken(channelId, agoraUid, 'PUBLISHER');

    if (channelId) {
      try {
        await setDoc(doc(db, 'live_sessions', channelId, 'co_hosts', coHost.uid), {
          status:      'active',
          agoraUid,
          token,
          displayName: coHost.displayName,
          avatarUrl:   coHost.avatarUrl ?? null,
          acceptedAt:  serverTimestamp(),
        });
      } catch (e) { console.warn('⚠️ acceptCoHost Firestore:', e); }
    }

    setCoHosts(prev => ({
      ...prev,
      [agoraUid]: {
        uid: coHost.uid,
        displayName: coHost.displayName,
        agoraUid,
        status: 'waiting',
        token,
      },
    }));
    setPendingRequest(null);
    dialogOpenRef.current = false;
    addComment('🎙️', `${coHost.displayName} a rejoint la scène`, 'fr');
    _processNextRequest();
  };

  const declineCoHost = async () => {
    if (channelId && pendingRequest) {
      try {
        await updateDoc(doc(db, 'live_sessions', channelId, 'co_hosts', pendingRequest.uid), { status: 'declined' });
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
        await updateDoc(doc(db, 'live_sessions', channelId, 'co_hosts', coHost.uid), {
          status: 'removed', removedAt: serverTimestamp(),
        });
      } catch (_) {}
    }
    delete remoteUsersRef.current[agoraUid];
    setCoHosts(prev => { const n = { ...prev }; delete n[agoraUid]; return n; });
    setShowRemoveDialog(null);
  };

  // ─────────────────────────────────────────────────────────
  // 💬 Commentaires & actions
  // ─────────────────────────────────────────────────────────
  const addComment = (sender, text, lang = 'fr') =>
    setComments(prev => [...prev, { id: `${Date.now()}-${Math.random()}`, sender, text, lang }]);

  const sendComment = async () => {
    if (!commentText.trim()) return;
    const text = commentText.trim();
    addComment('Moi', text, isChinese ? 'zh' : 'fr');
    setCommentText('');
    if (channelId) {
      try {
        const ref = doc(collection(db, 'live_comments'));
        await setDoc(ref, {
          commentId: ref.id, sender: auth.currentUser?.displayName ?? 'Vendeur',
          text, timestamp: serverTimestamp(), channelId, lang: isChinese ? 'zh' : 'fr',
        });
      } catch (_) {}
    }
  };

  const toggleLike = () => {
    setLiked(prev => {
      const next = !prev;
      setLikeCount(c => { const n = next ? c + 1 : Math.max(0, c - 1); _updateEngagement(n, giftCount); return n; });
      return next;
    });
  };

  const sendGift = () => {
    setGiftCount(c => { const n = c + 1; _updateEngagement(likeCount, n); return n; });
  };

  const fmtTime = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  const activeCoHosts = Object.values(coHosts).filter(c => c.status === 'active' || c.status === 'waiting');

  // ─────────────────────────────────────────────────────────
  // 🎨 RENDER
  // ─────────────────────────────────────────────────────────

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
    <div style={{
      position: 'relative', width: '100%', maxWidth: 430, margin: '0 auto',
      height: '100vh', minHeight: '-webkit-fill-available',
      background: '#000', overflow: 'hidden', fontFamily: 'system-ui,sans-serif',
    }}>
      <VideoLayout localVideoRef={localVideoRef} isEngineReady={isEngineReady} />

      <CoHostThumbs
        remoteVideoRefs={remoteVideoRefs}
        activeCoHosts={activeCoHosts}
        onRemove={uid => setShowRemoveDialog(uid)}
      />

      {/* Gradient */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '55%', background: 'linear-gradient(to top,rgba(0,0,0,.88),transparent)', pointerEvents: 'none' }} />

      {/* Top bar */}
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

      {/* Badges */}
      <div style={{ position: 'absolute', top: 56, left: 12, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <Pill bg="rgba(0,0,0,.65)">👁️ {viewerCount}</Pill>
        {activeCoHosts.length > 0 && (
          <button onClick={() => setShowCoHostPanel(v => !v)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
            <Pill bg="rgba(124,58,237,.75)">👥 {activeCoHosts.length} sur scène</Pill>
          </button>
        )}
        {isChinese && <Pill bg={translationActive ? 'rgba(249,115,22,.85)' : 'rgba(80,80,80,.8)'}>🌐 Trad. active</Pill>}
      </div>

      {/* Boutons droite */}
      <div style={{ position: 'absolute', right: 10, top: 104, display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center' }}>
        <div style={{ width: 46, height: 46, borderRadius: '50%', background: 'rgba(255,255,255,.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, marginBottom: 6 }}>🎙️</div>
        <ABtn icon={liked ? '❤️' : '🤍'} label={String(likeCount)} onClick={toggleLike} active={liked} />
        <ABtn icon="🎁" label={String(giftCount)} onClick={sendGift} />
        <ABtn icon={showComments ? '💬' : '💭'} onClick={() => setShowComments(v => !v)} active={showComments} />
        <ABtn icon="👥" onClick={() => setShowCoHostPanel(v => !v)} active={showCoHostPanel} />
        <ABtn icon="🔗" onClick={() => navigator.share?.({ title: 'FriTok Live', url: window.location.href })} />
      </div>

      {/* Carte produit */}
      {showProductCard && liveProducts.length > 0 && (
        <ProductCard product={liveProducts[productIndex]} index={productIndex}
          total={liveProducts.length} onClose={() => setShowProductCard(false)} onChange={setProductIndex} />
      )}

      {/* Commentaires */}
      {showComments && (
        <div style={{ position: 'absolute', bottom: 72, left: 12, right: 66, background: 'rgba(0,0,0,.82)', borderRadius: 14, padding: 12, maxHeight: 260, display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, overflowY: 'auto', marginBottom: 8 }}>
            {comments.map(c => (
              <div key={c.id} style={{ marginBottom: 6 }}>
                <span style={{ color: '#F97316', fontWeight: 700, fontSize: 12 }}>{c.sender}: </span>
                <span style={{ color: '#ffffffcc', fontSize: 13 }}>{c.textFr || c.text}</span>
                {c.lang && c.lang !== 'fr' && <span style={{ color: '#ffffff50', fontSize: 10 }}> [{c.lang}]</span>}
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

      {/* Panel co-hosts */}
      {showCoHostPanel && (
        <CoHostPanel activeCoHosts={activeCoHosts} maxCoHosts={MAX_COHOSTS}
          onClose={() => setShowCoHostPanel(false)} onRemove={uid => setShowRemoveDialog(uid)} />
      )}

      {/* Barre bas */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '10px 12px 20px', display: 'flex', gap: 8 }}>
        <input value={commentText} onChange={e => setCommentText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && sendComment()} placeholder="Ajouter un commentaire..."
          style={{ flex: 1, padding: '9px 14px', borderRadius: 24, background: 'rgba(255,255,255,.12)', border: '1px solid rgba(255,255,255,.2)', color: '#fff', fontSize: 14, outline: 'none' }} />
        <button onClick={() => setShowEndDlg(true)} style={{ padding: '9px 14px', borderRadius: 24, background: '#EF4444', border: 'none', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}>⏹ Fin</button>
      </div>

      {/* Modal terminer */}
      {showEndDlg && (
        <LiveModal>
          <ModalTitle>Terminer le live ?</ModalTitle>
          <ModalSub>Le live sera clôturé pour tous les spectateurs.</ModalSub>
          <ModalRow><BtnSec onClick={() => setShowEndDlg(false)}>Annuler</BtnSec><BtnPri onClick={endLive} disabled={isEnding} color="#EF4444">{isEnding ? 'Fermeture...' : 'Terminer'}</BtnPri></ModalRow>
        </LiveModal>
      )}

      {/* Modal demande co-host */}
      {pendingRequest && !showEndDlg && (
        <LiveModal>
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: 64, height: 64, borderRadius: '50%',
              background: 'rgba(124,58,237,.25)', border: '2px solid rgba(124,58,237,.4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 28, margin: '0 auto 12px', color: '#A855F7', fontWeight: 700,
            }}>
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

      {/* Modal retirer co-host */}
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

// ─────────────────────────────────────────────────────────────
// 🔒 Export default — GoLivePage protégé par SubscriptionGuard
// ─────────────────────────────────────────────────────────────
// ── AJOUT 2 (suite) : nouvel export default ──────────────────
export default function GoLivePage() {
  return (
    <SubscriptionGuard>
      <GoLiveContent />
    </SubscriptionGuard>
  );
}

// ─────────────────────────────────────────────────────────────
// 📺 Sous-composants (inchangés)
// ─────────────────────────────────────────────────────────────

function VideoLayout({ localVideoRef, isEngineReady }) {
  if (!isEngineReady) return (
    <div style={{ position: 'absolute', inset: 0, background: '#0a0a1e', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ width: 38, height: 38, borderRadius: '50%', border: '3px solid #F97316', borderTopColor: 'transparent', animation: 'spin .8s linear infinite' }} />
      <p style={{ color: '#ffffff80', fontSize: 14 }}>Démarrage du live...</p>
    </div>
  );
  return <div ref={localVideoRef} style={{ position: 'absolute', inset: 0, background: '#111' }} />;
}

function CoHostThumbs({ remoteVideoRefs, activeCoHosts, onRemove }) {
  if (activeCoHosts.length === 0) return null;
  return (
    <div style={{ position: 'absolute', right: 64, top: 104, zIndex: 30, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {activeCoHosts.map(c => (
        <div key={c.agoraUid} style={{
          width: 88, height: 124, borderRadius: 12, overflow: 'hidden',
          position: 'relative', background: '#1a1a2e',
          border: '2px solid rgba(168,85,247,.6)',
          boxShadow: '0 2px 10px rgba(0,0,0,.5)',
        }}>
          <div
            ref={el => {
              if (el) { remoteVideoRefs.current[c.agoraUid] = el; }
              else    { delete remoteVideoRefs.current[c.agoraUid]; }
            }}
            style={{ position: 'absolute', inset: 0 }}
          />
          {c.status === 'waiting' && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 6 }}>
              <Spinner />
            </div>
          )}
          <div style={{
            position: 'absolute', bottom: 3, left: 3, right: 3,
            background: 'rgba(0,0,0,.6)', borderRadius: 5, padding: '1px 4px',
            fontSize: 9, fontWeight: 700, color: '#fff',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {c.displayName}
          </div>
          <button onClick={() => onRemove(c.agoraUid)} style={{
            position: 'absolute', top: 3, right: 3, width: 18, height: 18,
            borderRadius: '50%', background: 'rgba(239,68,68,.9)',
            border: 'none', color: '#fff', fontSize: 10, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>✕</button>
        </div>
      ))}
    </div>
  );
}

function PreLiveScreen({ products, loading, userId, sellerLang, setSellerLang, sdkReady, onOpenSelector }) {
  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui,sans-serif', color: '#fff', padding: '24px 24px env(safe-area-inset-bottom,24px)', boxSizing: 'border-box' }}>
      <div style={{ maxWidth: 440, width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 52, marginBottom: 8 }}>🎬</div>
          <h1 style={{ fontSize: 30, fontWeight: 900, margin: '0 0 6px', letterSpacing: -1 }}>FriTok <span style={{ color: '#F97316' }}>Live</span></h1>
          <p style={{ color: '#ffffff70', fontSize: 15 }}>Vendez en direct. Connectez vos clients.</p>
        </div>
        <p style={{ fontSize: 13, color: '#ffffff60', textAlign: 'center', marginBottom: 10 }}>Langue du vendeur</p>
        <div style={{ display: 'flex', gap: 10, marginBottom: 28 }}>
          {[{ code: 'fr', label: '🇫🇷 Français', sub: 'Direct' }, { code: 'zh', label: '🇨🇳 中文', sub: 'Trad. auto → FR' }].map(l => (
            <button key={l.code} onClick={() => setSellerLang(l.code)} style={{ flex: 1, padding: 12, borderRadius: 14, border: `2px solid ${sellerLang === l.code ? '#F97316' : 'rgba(255,255,255,.15)'}`, background: sellerLang === l.code ? 'rgba(249,115,22,.1)' : 'transparent', color: '#fff', cursor: 'pointer', transition: 'all .2s' }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{l.label}</div>
              <div style={{ fontSize: 11, color: '#ffffff70', marginTop: 3 }}>{l.sub}</div>
            </button>
          ))}
        </div>
        <div style={{ background: 'rgba(255,255,255,.06)', borderRadius: 14, padding: 16, marginBottom: 24, border: '1px solid rgba(255,255,255,.1)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <p style={{ fontSize: 11, color: '#ffffff50', textTransform: 'uppercase', letterSpacing: 1, margin: 0 }}>Mes vidéos / produits</p>
            {!loading && <span style={{ background: products.length > 0 ? 'rgba(249,115,22,.2)' : 'rgba(239,68,68,.2)', color: products.length > 0 ? '#F97316' : '#FCA5A5', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10 }}>{products.length} vidéo{products.length !== 1 ? 's' : ''}</span>}
          </div>
          {loading && !userId && <p style={{ fontSize: 13, margin: 0, color: '#ffffff60', textAlign: 'center' }}>🔐 Connexion requise.</p>}
          {loading && userId && <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 0', color: '#ffffff70' }}><Spinner /><span style={{ fontSize: 13 }}>Chargement...</span></div>}
          {!loading && products.length === 0 && (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <p style={{ fontSize: 28, margin: '0 0 8px' }}>📭</p>
              <p style={{ color: '#FCA5A5', fontWeight: 700, fontSize: 14, margin: '0 0 6px' }}>Aucune vidéo publiée</p>
              <p style={{ color: '#ffffff60', fontSize: 12, margin: 0, lineHeight: 1.6 }}>Publiez une vidéo depuis l'app mobile.</p>
            </div>
          )}
          {!loading && products.length > 0 && products.slice(0, 5).map(p => (
            <div key={p.refArticle} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
              <ProductThumb src={p.imageUrl} name={p.name} size={36} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, color: '#fff', margin: 0, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</p>
                {p.description && <p style={{ fontSize: 11, color: '#ffffff60', margin: '1px 0 0' }}>{p.description}</p>}
              </div>
              <span style={{ fontSize: 13, color: '#F97316', fontWeight: 700, whiteSpace: 'nowrap' }}>{Number(p.price).toLocaleString('fr-FR')} FCFA</span>
            </div>
          ))}
          {!loading && products.length > 5 && <p style={{ color: '#ffffff40', fontSize: 11, marginTop: 8, textAlign: 'center' }}>+{products.length - 5} autre{products.length - 5 > 1 ? 's' : ''}</p>}
        </div>
        {!sdkReady && <p style={{ color: '#ffffff60', fontSize: 12, textAlign: 'center', marginBottom: 10 }}>⏳ Chargement SDK Agora...</p>}
        <button onClick={onOpenSelector} disabled={!sdkReady || loading || products.length === 0} style={{ width: '100%', padding: '15px 0', borderRadius: 16, background: (!sdkReady || loading || products.length === 0) ? '#333' : 'linear-gradient(135deg,#EF4444,#DC2626)', border: 'none', color: '#fff', fontSize: 17, fontWeight: 800, cursor: (!sdkReady || loading || products.length === 0) ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, opacity: (!sdkReady || loading || products.length === 0) ? 0.5 : 1 }}>
          <PulseDot />
          {loading ? 'Chargement...' : products.length === 0 ? 'Aucune vidéo disponible' : 'Sélectionner les produits'}
        </button>
        {!loading && products.length === 0 && <p style={{ color: '#ffffff40', fontSize: 12, textAlign: 'center', marginTop: 12 }}>👆 Publiez d'abord une vidéo depuis l'app mobile FriTok</p>}
      </div>
    </div>
  );
}

function EndedScreen({ likeCount, giftCount, viewerCount, duration, onBack }) {
  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui,sans-serif', color: '#fff', padding: 24, textAlign: 'center' }}>
      <div style={{ fontSize: 56, marginBottom: 16 }}>🎉</div>
      <h2 style={{ fontSize: 26, fontWeight: 900, marginBottom: 8 }}>Live terminé !</h2>
      <p style={{ color: '#ffffff70', marginBottom: 32 }}>Durée : {duration}</p>
      <div style={{ display: 'flex', gap: 28, marginBottom: 36, justifyContent: 'center' }}>
        {[{ v: viewerCount, l: '👁️ Spectateurs' }, { v: likeCount, l: '❤️ Likes' }, { v: giftCount, l: '🎁 Cadeaux' }].map(s => (
          <div key={s.l}><p style={{ fontSize: 28, fontWeight: 900, margin: 0 }}>{s.v}</p><p style={{ color: '#ffffff60', fontSize: 12, margin: '4px 0 0' }}>{s.l}</p></div>
        ))}
      </div>
      <button onClick={onBack} style={{ padding: '13px 32px', borderRadius: 40, background: '#F97316', border: 'none', color: '#fff', fontWeight: 700, fontSize: 16, cursor: 'pointer' }}>← Retour</button>
    </div>
  );
}

function ProductThumb({ src, name, size = 48 }) {
  const [err, setErr] = useState(false);
  if (src && !err) return <img src={src} alt={name || ''} onError={() => setErr(true)} style={{ width: size, height: size, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />;
  return <div style={{ width: size, height: size, borderRadius: 8, flexShrink: 0, background: 'rgba(249,115,22,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.45 }}>🛍️</div>;
}

function ProductCard({ product, index, total, onClose, onChange }) {
  return (
    <div style={{ position: 'absolute', bottom: 76, left: 12, right: 64, background: 'rgba(0,0,0,.82)', borderRadius: 16, padding: 12, border: '1px solid rgba(255,255,255,.1)' }}>
      <button onClick={onClose} style={{ position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: '50%', background: '#EF4444', border: 'none', color: '#fff', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
      <div style={{ display: 'flex', gap: 10 }}>
        <ProductThumb src={product.imageUrl} size={72} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ color: '#fff', fontWeight: 700, fontSize: 14, margin: '0 0 3px' }}>{product.name}</p>
          <p style={{ color: '#F97316', fontWeight: 700, fontSize: 14, margin: '0 0 5px' }}>{Number(product.price).toLocaleString('fr-FR')} FCFA</p>
          {product.description && <p style={{ color: '#ffffff80', fontSize: 11, margin: '0 0 7px', lineHeight: 1.4 }}>{product.description}</p>}
          <button style={{ width: '100%', padding: '6px 0', borderRadius: 8, background: '#F97316', border: 'none', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>🛒 Acheter</button>
        </div>
      </div>
      {total > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 5, marginTop: 8 }}>
          {Array.from({ length: total }, (_, i) => (
            <button key={i} onClick={() => onChange(i)} style={{ width: i === index ? 14 : 8, height: 8, borderRadius: 8, border: 'none', padding: 0, cursor: 'pointer', background: i === index ? '#F97316' : 'rgba(255,255,255,.4)', transition: 'all .25s' }} />
          ))}
        </div>
      )}
    </div>
  );
}

function CoHostPanel({ activeCoHosts, maxCoHosts, onClose, onRemove }) {
  return (
    <div style={{ position: 'absolute', bottom: 72, left: 12, right: 12, background: 'rgba(0,0,0,.92)', borderRadius: 16, padding: 14, border: '1px solid rgba(168,85,247,.3)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>👥 Co-hosts sur scène</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#ffffff70', cursor: 'pointer', fontSize: 18 }}>✕</button>
      </div>
      {activeCoHosts.length === 0
        ? <p style={{ color: '#ffffff50', fontSize: 13 }}>Aucun co-host pour l'instant.</p>
        : activeCoHosts.map(c => (
          <div key={c.agoraUid} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(124,58,237,.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#A855F7', fontWeight: 700, fontSize: 14 }}>{c.displayName[0].toUpperCase()}</div>
            <span style={{ flex: 1, color: '#fff', fontSize: 13 }}>{c.displayName}</span>
            <span style={{
              background: c.status === 'waiting' ? 'rgba(249,115,22,.25)' : 'rgba(22,163,74,.25)',
              color: c.status === 'waiting' ? '#fed7aa' : '#86efac',
              fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
            }}>
              {c.status === 'waiting' ? 'Connexion...' : 'En direct'}
            </span>
            <button onClick={() => onRemove(c.agoraUid)} style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', fontSize: 18 }}>✕</button>
          </div>
        ))
      }
      <p style={{ color: activeCoHosts.length >= maxCoHosts ? '#F97316' : 'rgba(255,255,255,.3)', fontSize: 11, marginTop: 10 }}>{activeCoHosts.length}/{maxCoHosts} co-hosts</p>
    </div>
  );
}

function Pill({ bg, children }) {
  return <span style={{ background: bg, borderRadius: 20, padding: '3px 9px', fontSize: 11, color: '#fff', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>{children}</span>;
}
function PulseDot() {
  return (<><style>{`@keyframes fpulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.55;transform:scale(1.35)}}`}</style><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#fff', display: 'inline-block', animation: 'fpulse 1.4s ease-in-out infinite', flexShrink: 0 }} /></>);
}
function Spinner() {
  return (<><style>{`@keyframes spin2{to{transform:rotate(360deg)}}`}</style><div style={{ width: 16, height: 16, borderRadius: '50%', flexShrink: 0, border: '2px solid rgba(249,115,22,.3)', borderTopColor: '#F97316', animation: 'spin2 .7s linear infinite' }} /></>);
}
function TopBtn({ children, onClick, danger }) {
  return <button onClick={onClick} style={{ width: 34, height: 34, borderRadius: '50%', background: danger ? 'rgba(239,68,68,.3)' : 'rgba(0,0,0,.5)', border: `1px solid ${danger ? 'rgba(239,68,68,.5)' : 'rgba(255,255,255,.15)'}`, color: danger ? '#FCA5A5' : '#fff', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{children}</button>;
}
function ABtn({ icon, label, onClick, active }) {
  return (
    <button onClick={onClick} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, padding: '5px 0' }}>
      <span style={{ fontSize: 24, color: active ? '#A855F7' : '#fff' }}>{icon}</span>
      {label !== undefined && label !== '' && <span style={{ fontSize: 11, color: '#ffffffb0' }}>{label}</span>}
    </button>
  );
}
function LiveModal({ children }) {
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 100, background: 'rgba(0,0,0,.72)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#1C1008', borderRadius: 20, padding: 24, width: 300, maxWidth: '90%', boxSizing: 'border-box' }}>{children}</div>
    </div>
  );
}
function ModalTitle({ children }) { return <p style={{ color: '#fff', fontWeight: 800, fontSize: 16, textAlign: 'center', margin: '0 0 6px' }}>{children}</p>; }
function ModalSub({ children })   { return <p style={{ color: '#ffffff80', fontSize: 13, textAlign: 'center', margin: '0 0 20px' }}>{children}</p>; }
function ModalRow({ children })   { return <div style={{ display: 'flex', gap: 10 }}>{children}</div>; }
function BtnSec({ children, onClick }) {
  return <button onClick={onClick} style={{ flex: 1, padding: '11px 0', borderRadius: 12, background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.12)', color: '#ffffff90', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>{children}</button>;
}
function BtnPri({ children, onClick, disabled, color }) {
  return <button onClick={onClick} disabled={disabled} style={{ flex: 1, padding: '11px 0', borderRadius: 12, border: 'none', background: color ?? '#F97316', color: '#fff', fontWeight: 700, fontSize: 14, cursor: disabled ? 'not-allowed' : 'pointer' }}>{children}</button>;
}
