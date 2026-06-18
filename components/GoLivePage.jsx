'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { db, auth } from '../lib/firebaseClient';
import {
  collection, query, where, onSnapshot,
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

// ─────────────────────────────────────────────────────────────
// 🎥 components/GoLivePage.jsx — FriTok Web Live
//
// SOURCE DES PRODUITS : Firestore collection "video_playlist"
// (miroir de videoProvider Riverpod Flutter)
// Filtrés par userId du vendeur connecté (Firebase Auth web)
// ─────────────────────────────────────────────────────────────

// ── Firebase (à installer : npm i firebase) ───────────────────
// Votre firebaseConfig doit être dans lib/firebase.js ou similaire
// Adaptez ce chemin selon votre projet :

// ── Agora ─────────────────────────────────────────────────────
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
// 📦 videoPlaylistToProduct
// Miroir de la logique Flutter dans _startGoLiveFlow :
//   Product(
//     refArticle:  v.id,
//     name:        v.title,
//     price:       v.product.price,
//     description: v.product.name,
//     imageUrl:    v.thumbnail,
//     boutiqueId:  v.product.boutiqueId,
//     productId:   v.product.productId,
//     userIdVend:  v.product.userIdVend,
//   )
// ─────────────────────────────────────────────────────────────
function videoDocToProduct(doc) {
  const d = doc.data ? doc.data() : doc; // supporte doc Firestore ou plain obj
  const id = doc.id ?? d.id ?? '';

  // v.product peut être un sous-objet ou à plat selon votre schéma
  const p = d.product ?? {};

  return {
    refArticle:  id,                                          // v.id
    name:        d.title        ?? d.name        ?? '',       // v.title
    price:       p.price        ?? d.price       ?? 0,        // v.product.price
    description: p.name         ?? d.description ?? '',       // v.product.name
    imageUrl:    d.thumbnail    ?? d.imageUrl    ?? null,     // v.thumbnail
    boutiqueId:  p.boutiqueId   ?? d.boutiqueId  ?? '',       // v.product.boutiqueId
    productId:   p.productId    ?? d.productId   ?? id,       // v.product.productId
    userIdVend:  p.userIdVend   ?? d.userIdVend  ?? null,     // v.product.userIdVend
  };
}

// ─────────────────────────────────────────────────────────────
// 🛍️ GoLiveProductSelector
// Miroir exact de l'AlertDialog Flutter _startGoLiveFlow
// ─────────────────────────────────────────────────────────────
function GoLiveProductSelector({ products, loading, isOpen, onClose, onStart }) {
  const [selected, setSelected] = useState(new Set());

  useEffect(() => { if (!isOpen) setSelected(new Set()); }, [isOpen]);

  if (!isOpen) return null;

  const toggle = (refArticle) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(refArticle) ? next.delete(refArticle) : next.add(refArticle);
      return next;
    });
  };

  const canStart = selected.size > 0;

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.78)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16, fontFamily: 'system-ui, sans-serif',
      }}
    >
      <div style={{
        background: '#1C1008', borderRadius: 20, padding: 24,
        width: '100%', maxWidth: 460,
        maxHeight: '88vh', overflowY: 'auto',
        boxSizing: 'border-box',
      }}>
        {/* Titre */}
        <p style={{ color: '#fff', fontWeight: 800, fontSize: 17, margin: '0 0 4px' }}>
          Sélectionner les produits
        </p>
        <p style={{ color: '#ffffff70', fontSize: 12, margin: '0 0 16px' }}>
          {selected.size} / {products.length} sélectionné{selected.size > 1 ? 's' : ''}
        </p>

        {/* Chargement */}
        {loading && (
          <div style={{ textAlign: 'center', padding: '24px 0', color: '#ffffff70' }}>
            <Spinner /> Chargement de vos vidéos...
          </div>
        )}

        {/* Aucun produit — miroir du toast Flutter */}
        {!loading && products.length === 0 && (
          <div style={{
            textAlign: 'center', padding: '28px 16px',
            background: 'rgba(239,68,68,0.08)',
            borderRadius: 12, border: '1px solid rgba(239,68,68,0.2)',
            marginBottom: 16,
          }}>
            <p style={{ fontSize: 32, margin: '0 0 10px' }}>📭</p>
            <p style={{ color: '#FCA5A5', fontWeight: 700, fontSize: 15, margin: '0 0 6px' }}>
              Aucune vidéo publiée
            </p>
            <p style={{ color: '#ffffff70', fontSize: 13, margin: 0, lineHeight: 1.5 }}>
              Ajoutez un produit depuis l'app mobile<br />
              avant de lancer un live.
            </p>
          </div>
        )}

        {/* Liste — miroir ListView.builder + CheckboxListTile */}
        {!loading && products.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
            {products.map(p => {
              const isChecked = selected.has(p.refArticle);
              return (
                <button
                  key={p.refArticle}
                  onClick={() => toggle(p.refArticle)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    background: isChecked
                      ? 'rgba(249,115,22,0.12)'
                      : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${isChecked
                      ? 'rgba(249,115,22,0.45)'
                      : 'rgba(255,255,255,0.1)'}`,
                    borderRadius: 12, padding: '10px 12px',
                    cursor: 'pointer', textAlign: 'left', width: '100%',
                    transition: 'all .15s',
                  }}
                >
                  {/* secondary: thumbnail — miroir CachedNetworkImage */}
                  <ProductThumb src={p.imageUrl} name={p.name} size={48} />

                  {/* title + subtitle — miroir CheckboxListTile */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{
                      color: '#fff', fontSize: 13, fontWeight: 600, margin: 0,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>{p.name}</p>
                    <p style={{ color: '#ffffff80', fontSize: 11, margin: '2px 0 0' }}>
                      {p.description ? `${p.description} · ` : ''}
                      <span style={{ color: '#F97316', fontWeight: 700 }}>
                        {Number(p.price).toLocaleString('fr-FR')} FCFA
                      </span>
                    </p>
                  </div>

                  {/* Checkbox — miroir activeColor: _D.orange */}
                  <div style={{
                    width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                    border: `2px solid ${isChecked ? '#F97316' : 'rgba(255,255,255,0.3)'}`,
                    background: isChecked ? '#F97316' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all .15s',
                  }}>
                    {isChecked && (
                      <span style={{ color: '#fff', fontSize: 13, lineHeight: 1 }}>✓</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Actions — miroir AlertDialog actions */}
        <div style={{ display: 'flex', gap: 10 }}>
          {/* Annuler */}
          <button onClick={onClose} style={{
            flex: 1, padding: '11px 0', borderRadius: 12,
            background: 'rgba(255,255,255,0.07)',
            border: '1px solid rgba(255,255,255,0.12)',
            color: '#ffffff80', fontWeight: 600, fontSize: 14, cursor: 'pointer',
          }}>Annuler</button>

          {/* Démarrer — grisé si rien sélectionné, miroir Flutter */}
          <button
            onClick={() => canStart && onStart(products.filter(p => selected.has(p.refArticle)))}
            disabled={!canStart}
            style={{
              flex: 2, padding: '11px 0', borderRadius: 12, border: 'none',
              background: canStart
                ? 'linear-gradient(135deg, #F97316, #EA580C)'
                : 'rgba(255,255,255,0.1)',
              color: canStart ? '#fff' : 'rgba(255,255,255,0.3)',
              fontWeight: 800, fontSize: 15,
              cursor: canStart ? 'pointer' : 'not-allowed',
              display: 'flex', alignItems: 'center',
              justifyContent: 'center', gap: 8,
              transition: 'all .15s',
            }}
          >
            🔴 Démarrer
            {canStart && (
              <span style={{
                background: 'rgba(0,0,0,0.2)', borderRadius: 10,
                fontSize: 11, padding: '1px 7px',
              }}>{selected.size}</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 🎥 GoLivePage principal
// ─────────────────────────────────────────────────────────────
export default function GoLivePage() {
  const router = useRouter();

  // ── Auth & produits (depuis Firestore video_playlist) ─────
  const [userId,       setUserId]       = useState(null);
  const [allProducts,  setAllProducts]  = useState([]);
  const [loadingProds, setLoadingProds] = useState(true);
  const [showSelector, setShowSelector] = useState(false);

  // ── Live state ────────────────────────────────────────────
  const [liveProducts,    setLiveProducts]    = useState([]);
  const [productIndex,    setProductIndex]    = useState(0);
  const [showProductCard, setShowProductCard] = useState(true);
  const [sellerLang,      setSellerLang]      = useState('fr');
  const isChinese = sellerLang === 'zh';

  const [phase, setPhase] = useState('pre'); // pre | live | ended

  // ── Agora ─────────────────────────────────────────────────
  const agoraClientRef  = useRef(null);
  const localVideoRef   = useRef(null);
  const localTrackRef   = useRef({ video: null, audio: null });
  const remoteVideoRefs = useRef({});
  const [sdkLoaded,     setSdkLoaded]     = useState(false);
  const [isEngineReady, setIsEngineReady] = useState(false);
  const [channelId,     setChannelId]     = useState(null);

  // ── Co-hosts ──────────────────────────────────────────────
  const [coHosts,          setCoHosts]          = useState({});
  const [showCoHostPanel,  setShowCoHostPanel]  = useState(false);
  const [pendingRequest,   setPendingRequest]   = useState(null);
  const [showRemoveDialog, setShowRemoveDialog] = useState(null);

  // ── UI ────────────────────────────────────────────────────
  const [viewerCount,  setViewerCount]  = useState(1);
  const [likeCount,    setLikeCount]    = useState(0);
  const [giftCount,    setGiftCount]    = useState(0);
  const [liked,        setLiked]        = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [commentText,  setCommentText]  = useState('');
  const [comments,     setComments]     = useState([
    { id: 'sys0', sender: 'FriTok', text: 'Bienvenue dans votre live ! 🎉', lang: 'fr' },
  ]);
  const [liveSeconds,          setLiveSeconds]          = useState(0);
  const [isEnding,             setIsEnding]             = useState(false);
  const [showEndDlg,           setShowEndDlg]           = useState(false);
  const [translationActive,    setTranslationActive]    = useState(false);

  const commentsEndRef = useRef(null);
  const viewerTimerRef = useRef(null);
  const liveTimerRef   = useRef(null);

  // ──────────────────────────────────────────────────────────
  // 1. Observer auth Firebase → récupérer userId
  // ──────────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, user => {
      setUserId(user?.uid ?? null);
    });
    return unsub;
  }, []);

  // ──────────────────────────────────────────────────────────
  // 2. Charger video_playlist depuis Firestore
  //    Miroir de videoProvider.start(userId) Flutter
  //    Collection : video_playlist, where userId == vendeur
  // ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!userId) return;

    setLoadingProds(true);

    // Essai 1 : champ "userId"
    // Si votre collection utilise un autre champ (vendeurId, ownerId…)
    // remplacez 'userId' par le bon nom ci-dessous :
    const OWNER_FIELD = 'userId'; // ← adapter si besoin

    const q = query(
      collection(db, 'video_playlist'),
      where(OWNER_FIELD, '==', userId)
    );

    const unsub = onSnapshot(q,
      snap => {
        const prods = snap.docs.map(doc => videoDocToProduct(doc));
        setAllProducts(prods);
        setLoadingProds(false);
      },
      err => {
        console.error('❌ Firestore video_playlist:', err);
        setLoadingProds(false);
      }
    );

    return unsub;
  }, [userId]);

  // ──────────────────────────────────────────────────────────
  // 3. Charger Agora SDK via CDN
  // ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (window.AgoraRTC) { setSdkLoaded(true); return; }
    const s = document.createElement('script');
    s.src   = 'https://download.agora.io/sdk/release/AgoraRTC_N-4.22.1.js';
    s.async = true;
    s.onload  = () => setSdkLoaded(true);
    s.onerror = () => console.error('❌ Agora SDK failed to load');
    document.head.appendChild(s);
  }, []);

  // ──────────────────────────────────────────────────────────
  // 4. Timer live
  // ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'live') return;
    liveTimerRef.current = setInterval(() => setLiveSeconds(s => s + 1), 1000);
    return () => clearInterval(liveTimerRef.current);
  }, [phase]);

  // ──────────────────────────────────────────────────────────
  // 5. Audience simulée
  // ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'live') return;
    viewerTimerRef.current = setInterval(
      () => setViewerCount(v => v + Math.floor(Math.random() * 3)), 5000
    );
    return () => clearInterval(viewerTimerRef.current);
  }, [phase]);

  // ──────────────────────────────────────────────────────────
  // 6. Auto-scroll commentaires
  // ──────────────────────────────────────────────────────────
  useEffect(() => {
    commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [comments]);

  // ──────────────────────────────────────────────────────────
  // 7. Cleanup
  // ──────────────────────────────────────────────────────────
  useEffect(() => () => {
    _releaseAgora();
    clearInterval(viewerTimerRef.current);
    clearInterval(liveTimerRef.current);
  }, []);

  // ──────────────────────────────────────────────────────────
  // 🔴 START LIVE
  // ──────────────────────────────────────────────────────────
  const startLive = useCallback(async (products) => {
    if (!sdkLoaded || !window.AgoraRTC) {
      alert('SDK Agora pas encore prêt, réessayez dans 2s.'); return;
    }
    try {
      await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    } catch {
      alert('Accès caméra/micro refusé. Autorisez dans les paramètres du navigateur.'); return;
    }

    setLiveProducts(products);
    setShowSelector(false);

    const cId = `live_web_${Date.now()}`;
    setChannelId(cId);

    const token = await fetchAgoraToken(cId, 0, 'PUBLISHER');
    if (!token) { alert("Impossible d'obtenir le token Agora."); return; }

    const AgoraRTC = window.AgoraRTC;
    AgoraRTC.setLogLevel(3);
    const client = AgoraRTC.createClient({ mode: 'live', codec: 'vp8' });
    agoraClientRef.current = client;

    client.on('user-published', async (user, mediaType) => {
      await client.subscribe(user, mediaType);
      if (mediaType === 'video') {
        setTimeout(() => {
          const el = remoteVideoRefs.current[user.uid];
          if (el) user.videoTrack?.play(el);
        }, 400);
      }
      if (mediaType === 'audio') user.audioTrack?.play();
      setCoHosts(prev => {
        const entry = Object.values(prev).find(c => c.agoraUid === user.uid);
        if (!entry) return prev;
        return { ...prev, [user.uid]: { ...entry, status: 'active' } };
      });
    });

    client.on('user-unpublished', (user) => {
      setCoHosts(prev => { const n = { ...prev }; delete n[user.uid]; return n; });
    });

    await client.setClientRole('host');
    await client.join(AGORA_APP_ID, cId, token, 0);

    const [audioTrack, videoTrack] = await AgoraRTC.createMicrophoneAndCameraTracks(
      { encoderConfig: 'music_standard' },
      { encoderConfig: { width: 1280, height: 720, frameRate: 30, bitrateMax: 2000 } }
    );
    localTrackRef.current = { audio: audioTrack, video: videoTrack };
    await client.publish([audioTrack, videoTrack]);
    if (localVideoRef.current) videoTrack.play(localVideoRef.current);

    setIsEngineReady(true);
    setPhase('live');
    if (isChinese) setTranslationActive(true);

    setTimeout(() => addComment('FriTok', `Canal : ${cId}`, 'fr'), 1500);
    // Demo co-host request (remplacer par listener Firestore en prod)
    setTimeout(() => setPendingRequest({ uid: 'viewer-demo', displayName: 'Kadiatou S.' }), 12000);
  }, [sdkLoaded, isChinese]);

  // ──────────────────────────────────────────────────────────
  // ⏹ END LIVE
  // ──────────────────────────────────────────────────────────
  const endLive = useCallback(async () => {
    setIsEnding(true);
    clearInterval(viewerTimerRef.current);
    clearInterval(liveTimerRef.current);
    await _releaseAgora();
    setPhase('ended');
    setIsEnding(false);
    setShowEndDlg(false);
    setCoHosts({});
    setPendingRequest(null);
    setIsEngineReady(false);
  }, []);

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

  // ──────────────────────────────────────────────────────────
  // 👥 CO-HOSTS
  // ──────────────────────────────────────────────────────────
  const acceptCoHost = async (coHost) => {
    if (Object.keys(coHosts).length >= MAX_COHOSTS) {
      alert(`Maximum ${MAX_COHOSTS} co-hosts atteint.`); return;
    }
    const agoraUid = Math.abs(
      [...coHost.uid].reduce((a, c) => Math.imul(31, a) + c.charCodeAt(0) | 0, 0)
    ) % 100000 + 1000;
    const token = await fetchAgoraToken(channelId, agoraUid, 'PUBLISHER');
    setCoHosts(prev => ({
      ...prev,
      [agoraUid]: { uid: coHost.uid, displayName: coHost.displayName, agoraUid, status: 'active', token },
    }));
    setPendingRequest(null);
    addComment('🎙️', `${coHost.displayName} a rejoint la scène`, 'fr');
  };

  const declineCoHost = () => setPendingRequest(null);
  const removeCoHost  = (agoraUid) => {
    setCoHosts(prev => { const n = { ...prev }; delete n[agoraUid]; return n; });
    setShowRemoveDialog(null);
  };

  // ── Helpers ───────────────────────────────────────────────
  const addComment = (sender, text, lang = 'fr') =>
    setComments(prev => [...prev, { id: `${Date.now()}-${Math.random()}`, sender, text, lang }]);

  const sendComment = () => {
    if (!commentText.trim()) return;
    addComment('Moi', commentText.trim(), isChinese ? 'zh' : 'fr');
    setCommentText('');
  };

  const toggleLike = () =>
    setLiked(p => { setLikeCount(c => p ? Math.max(0, c - 1) : c + 1); return !p; });

  const fmt = s =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  const activeCoHosts = Object.values(coHosts).filter(c => c.status === 'active');

  // ──────────────────────────────────────────────────────────
  // 🎨 RENDER
  // ──────────────────────────────────────────────────────────

  // ── PRE-LIVE ──────────────────────────────────────────────
  if (phase === 'pre') return (
    <>
      <PreLiveScreen
        products={allProducts}
        loading={loadingProds}
        userId={userId}
        sellerLang={sellerLang}
        setSellerLang={setSellerLang}
        sdkReady={sdkLoaded}
        onOpenSelector={() => setShowSelector(true)}
      />
      {/* Sélecteur produits — miroir _startGoLiveFlow AlertDialog */}
      <GoLiveProductSelector
        products={allProducts}
        loading={loadingProds}
        isOpen={showSelector}
        onClose={() => setShowSelector(false)}
        onStart={startLive}
      />
    </>
  );

  // ── POST-LIVE ─────────────────────────────────────────────
  if (phase === 'ended') return (
    <EndedScreen
      likeCount={likeCount} giftCount={giftCount}
      viewerCount={viewerCount} duration={fmt(liveSeconds)}
      onBack={() => router.back()}
    />
  );

  // ── LIVE ──────────────────────────────────────────────────
  return (
    <div style={{
      position: 'relative', width: '100%', maxWidth: 430,
      margin: '0 auto', height: '100dvh', background: '#000',
      overflow: 'hidden', fontFamily: 'system-ui, sans-serif',
    }}>
      {/* Vidéo layout */}
      <VideoLayout
        localVideoRef={localVideoRef}
        remoteVideoRefs={remoteVideoRefs}
        activeCoHosts={activeCoHosts}
        onRemove={uid => setShowRemoveDialog(uid)}
        isEngineReady={isEngineReady}
      />

      {/* Gradient overlay */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: '55%',
        background: 'linear-gradient(to top, rgba(0,0,0,.88), transparent)',
        pointerEvents: 'none',
      }} />

      {/* Top bar */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        padding: '13px 12px 0',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
          <Pill bg="#EF4444cc"><PulseDot /> En direct</Pill>
          <span style={{ color: '#ffffff90', fontSize: 13 }}>{fmt(liveSeconds)}</span>
          {isChinese && <Pill bg="#F97316cc">🇨🇳→🇫🇷</Pill>}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <TopBtn onClick={() => setShowComments(v => !v)}>💬</TopBtn>
          <TopBtn onClick={() => navigator.share?.({ title: 'FriTok Live', url: window.location.href })}>🔗</TopBtn>
          <TopBtn onClick={() => setShowEndDlg(true)} danger>✕</TopBtn>
        </div>
      </div>

      {/* Badges */}
      <div style={{
        position: 'absolute', top: 56, left: 12,
        display: 'flex', gap: 6, flexWrap: 'wrap',
      }}>
        <Pill bg="rgba(0,0,0,.65)">👁️ {viewerCount}</Pill>
        {activeCoHosts.length > 0 && (
          <button onClick={() => setShowCoHostPanel(v => !v)}
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
            <Pill bg="rgba(124,58,237,.75)">👥 {activeCoHosts.length} sur scène</Pill>
          </button>
        )}
        {isChinese && (
          <Pill bg={translationActive ? 'rgba(249,115,22,.85)' : 'rgba(80,80,80,.8)'}>
            🌐 Trad. active
          </Pill>
        )}
      </div>

      {/* Boutons droite */}
      <div style={{
        position: 'absolute', right: 10, top: 104,
        display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center',
      }}>
        <div style={{
          width: 46, height: 46, borderRadius: '50%',
          background: 'rgba(255,255,255,.18)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 22, marginBottom: 6,
        }}>🎙️</div>
        <ABtn icon={liked ? '❤️' : '🤍'} label={String(likeCount)} onClick={toggleLike} active={liked} />
        <ABtn icon="🎁" label={String(giftCount)} onClick={() => setGiftCount(c => c + 1)} />
        <ABtn icon={showComments ? '💬' : '💭'} onClick={() => setShowComments(v => !v)} active={showComments} />
        <ABtn icon="👥" onClick={() => setShowCoHostPanel(v => !v)} active={showCoHostPanel} />
        <ABtn icon="🔗" onClick={() => navigator.share?.({ title: 'FriTok Live', url: window.location.href })} />
      </div>

      {/* Carte produit */}
      {showProductCard && liveProducts.length > 0 && (
        <ProductCard
          product={liveProducts[productIndex]}
          index={productIndex}
          total={liveProducts.length}
          onClose={() => setShowProductCard(false)}
          onChange={setProductIndex}
        />
      )}

      {/* Commentaires */}
      {showComments && (
        <div style={{
          position: 'absolute', bottom: 72, left: 12, right: 66,
          background: 'rgba(0,0,0,.82)', borderRadius: 14, padding: 12,
          maxHeight: 260, display: 'flex', flexDirection: 'column',
        }}>
          <div style={{ flex: 1, overflowY: 'auto', marginBottom: 8 }}>
            {comments.map(c => (
              <div key={c.id} style={{ marginBottom: 6 }}>
                <span style={{ color: '#F97316', fontWeight: 700, fontSize: 12 }}>{c.sender}: </span>
                <span style={{ color: '#ffffffcc', fontSize: 13 }}>{c.textFr || c.text}</span>
                {c.lang && c.lang !== 'fr' && (
                  <span style={{ color: '#ffffff50', fontSize: 10 }}> [{c.lang}]</span>
                )}
              </div>
            ))}
            <div ref={commentsEndRef} />
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              value={commentText}
              onChange={e => setCommentText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendComment()}
              placeholder="Commenter..."
              style={{
                flex: 1, padding: '7px 10px', borderRadius: 8,
                background: '#ffffff15', border: '1px solid #ffffff25',
                color: '#fff', fontSize: 13, outline: 'none',
              }}
            />
            <button onClick={sendComment} style={{
              padding: '7px 12px', borderRadius: 8,
              background: '#F97316', border: 'none',
              color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer',
            }}>↑</button>
          </div>
        </div>
      )}

      {/* Panel co-hosts */}
      {showCoHostPanel && (
        <CoHostPanel
          activeCoHosts={activeCoHosts}
          maxCoHosts={MAX_COHOSTS}
          onClose={() => setShowCoHostPanel(false)}
          onRemove={uid => setShowRemoveDialog(uid)}
        />
      )}

      {/* Barre bas */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        padding: '10px 12px 20px', display: 'flex', gap: 8,
      }}>
        <input
          value={commentText}
          onChange={e => setCommentText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && sendComment()}
          placeholder="Ajouter un commentaire..."
          style={{
            flex: 1, padding: '9px 14px', borderRadius: 24,
            background: 'rgba(255,255,255,.12)',
            border: '1px solid rgba(255,255,255,.2)',
            color: '#fff', fontSize: 14, outline: 'none',
          }}
        />
        <button onClick={() => setShowEndDlg(true)} style={{
          padding: '9px 14px', borderRadius: 24,
          background: '#EF4444', border: 'none',
          color: '#fff', fontWeight: 700, fontSize: 13,
          cursor: 'pointer', whiteSpace: 'nowrap',
        }}>⏹ Fin</button>
      </div>

      {/* Modal : terminer */}
      {showEndDlg && (
        <LiveModal>
          <ModalTitle>Terminer le live ?</ModalTitle>
          <ModalSub>Le live sera clôturé pour tous les spectateurs.</ModalSub>
          <ModalRow>
            <BtnSec onClick={() => setShowEndDlg(false)}>Annuler</BtnSec>
            <BtnPri onClick={endLive} disabled={isEnding} color="#EF4444">
              {isEnding ? 'Fermeture...' : 'Terminer'}
            </BtnPri>
          </ModalRow>
        </LiveModal>
      )}

      {/* Modal : demande co-host */}
      {pendingRequest && !showEndDlg && (
        <LiveModal>
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: 64, height: 64, borderRadius: '50%',
              background: 'rgba(124,58,237,0.25)',
              border: '2px solid rgba(124,58,237,0.4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 28, margin: '0 auto 12px',
              color: '#A855F7', fontWeight: 700,
            }}>
              {pendingRequest.displayName[0].toUpperCase()}
            </div>
            <ModalTitle>{pendingRequest.displayName}</ModalTitle>
            <ModalSub>souhaite rejoindre le live en vidéo</ModalSub>
            <ModalRow>
              <BtnSec onClick={declineCoHost}>Refuser</BtnSec>
              <BtnPri
                onClick={() => acceptCoHost(pendingRequest)}
                color="linear-gradient(135deg,#7C3AED,#A855F7)"
              >Accepter</BtnPri>
            </ModalRow>
          </div>
        </LiveModal>
      )}

      {/* Modal : retirer co-host */}
      {showRemoveDialog !== null && (
        <LiveModal>
          <ModalTitle>Retirer {coHosts[showRemoveDialog]?.displayName} ?</ModalTitle>
          <ModalSub>Ce participant sera retiré du live vidéo.</ModalSub>
          <ModalRow>
            <BtnSec onClick={() => setShowRemoveDialog(null)}>Annuler</BtnSec>
            <BtnPri onClick={() => removeCoHost(showRemoveDialog)} color="#EF4444">
              Retirer
            </BtnPri>
          </ModalRow>
        </LiveModal>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 📺 VideoLayout — miroir _buildVideoLayout Flutter
// ─────────────────────────────────────────────────────────────
function VideoLayout({ localVideoRef, remoteVideoRefs, activeCoHosts, onRemove, isEngineReady }) {
  if (!isEngineReady) return (
    <div style={{
      position: 'absolute', inset: 0, background: '#0a0a1e',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 14,
    }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{
        width: 38, height: 38, borderRadius: '50%',
        border: '3px solid #F97316', borderTopColor: 'transparent',
        animation: 'spin .8s linear infinite',
      }} />
      <p style={{ color: '#ffffff80', fontSize: 14 }}>Démarrage du live...</p>
    </div>
  );

  if (activeCoHosts.length === 0) return (
    <div ref={localVideoRef} style={{ position: 'absolute', inset: 0, background: '#111' }} />
  );

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 2, position: 'relative' }}>
        <div ref={localVideoRef} style={{ position: 'absolute', inset: 0, background: '#111' }} />
        <VLabel label="Hôte" color="#F97316" />
      </div>
      <div style={{ flex: 1, display: 'flex' }}>
        {activeCoHosts.map(c => (
          <div key={c.agoraUid} style={{ flex: 1, position: 'relative', background: '#1a1a2e' }}>
            <div
              ref={el => { remoteVideoRefs.current[c.agoraUid] = el; }}
              style={{ position: 'absolute', inset: 0 }}
            />
            <VLabel label={c.displayName} />
            <button onClick={() => onRemove(c.agoraUid)} style={{
              position: 'absolute', top: 5, right: 5,
              width: 22, height: 22, borderRadius: '50%',
              background: 'rgba(239,68,68,.85)', border: 'none',
              color: '#fff', fontSize: 11, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>✕</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Pre-live screen
// ─────────────────────────────────────────────────────────────
function PreLiveScreen({ products, loading, userId, sellerLang, setSellerLang, sdkReady, onOpenSelector }) {
  return (
    <div style={{
      minHeight: '100vh', background: '#0a0a0a',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: 'system-ui, sans-serif', color: '#fff', padding: 24,
    }}>
      <div style={{ maxWidth: 440, width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 52, marginBottom: 8 }}>🎬</div>
          <h1 style={{ fontSize: 30, fontWeight: 900, margin: '0 0 6px', letterSpacing: -1 }}>
            FriTok <span style={{ color: '#F97316' }}>Live</span>
          </h1>
          <p style={{ color: '#ffffff70', fontSize: 15 }}>Vendez en direct. Connectez vos clients.</p>
        </div>

        {/* Sélecteur langue */}
        <p style={{ fontSize: 13, color: '#ffffff60', textAlign: 'center', marginBottom: 10 }}>
          Langue du vendeur
        </p>
        <div style={{ display: 'flex', gap: 10, marginBottom: 28 }}>
          {[
            { code: 'fr', label: '🇫🇷 Français', sub: 'Direct' },
            { code: 'zh', label: '🇨🇳 中文',      sub: 'Trad. auto → FR' },
          ].map(l => (
            <button key={l.code} onClick={() => setSellerLang(l.code)} style={{
              flex: 1, padding: '12px', borderRadius: 14,
              border: `2px solid ${sellerLang === l.code ? '#F97316' : 'rgba(255,255,255,.15)'}`,
              background: sellerLang === l.code ? 'rgba(249,115,22,.1)' : 'transparent',
              color: '#fff', cursor: 'pointer', transition: 'all .2s',
            }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{l.label}</div>
              <div style={{ fontSize: 11, color: '#ffffff70', marginTop: 3 }}>{l.sub}</div>
            </button>
          ))}
        </div>

        {/* État des produits */}
        <div style={{
          background: 'rgba(255,255,255,.06)', borderRadius: 14,
          padding: 16, marginBottom: 24,
          border: '1px solid rgba(255,255,255,.1)',
        }}>
          {/* Titre avec compteur */}
          <div style={{
            display: 'flex', alignItems: 'center',
            justifyContent: 'space-between', marginBottom: 12,
          }}>
            <p style={{
              fontSize: 11, color: '#ffffff50',
              textTransform: 'uppercase', letterSpacing: 1, margin: 0,
            }}>
              Mes vidéos / produits
            </p>
            {!loading && (
              <span style={{
                background: products.length > 0 ? 'rgba(249,115,22,.2)' : 'rgba(239,68,68,.2)',
                color: products.length > 0 ? '#F97316' : '#FCA5A5',
                fontSize: 11, fontWeight: 700,
                padding: '2px 8px', borderRadius: 10,
              }}>
                {products.length} vidéo{products.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {/* Chargement */}
          {loading && !userId && (
            <div style={{ textAlign: 'center', padding: '16px 0', color: '#ffffff60' }}>
              <p style={{ fontSize: 13, margin: 0 }}>
                🔐 Connexion requise — veuillez vous connecter.
              </p>
            </div>
          )}

          {loading && userId && (
            <div style={{
              display: 'flex', alignItems: 'center',
              gap: 10, padding: '12px 0', color: '#ffffff70',
            }}>
              <Spinner />
              <span style={{ fontSize: 13 }}>Chargement de vos vidéos depuis Firestore...</span>
            </div>
          )}

          {/* Aucun produit */}
          {!loading && products.length === 0 && (
            <div style={{
              textAlign: 'center', padding: '16px 0',
              borderRadius: 10,
            }}>
              <p style={{ fontSize: 28, margin: '0 0 8px' }}>📭</p>
              <p style={{ color: '#FCA5A5', fontWeight: 700, fontSize: 14, margin: '0 0 6px' }}>
                Aucune vidéo publiée
              </p>
              <p style={{ color: '#ffffff60', fontSize: 12, margin: 0, lineHeight: 1.6 }}>
                Publiez une vidéo produit depuis l'app mobile<br />
                pour pouvoir démarrer un live.
              </p>
            </div>
          )}

          {/* Liste des produits */}
          {!loading && products.length > 0 && products.slice(0, 5).map(p => (
            <div key={p.refArticle} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '7px 0',
              borderBottom: '1px solid rgba(255,255,255,.06)',
            }}>
              <ProductThumb src={p.imageUrl} name={p.name} size={36} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{
                  fontSize: 13, color: '#fff', margin: 0, fontWeight: 600,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{p.name}</p>
                {p.description && (
                  <p style={{ fontSize: 11, color: '#ffffff60', margin: '1px 0 0' }}>
                    {p.description}
                  </p>
                )}
              </div>
              <span style={{ fontSize: 13, color: '#F97316', fontWeight: 700, whiteSpace: 'nowrap' }}>
                {Number(p.price).toLocaleString('fr-FR')} FCFA
              </span>
            </div>
          ))}
          {!loading && products.length > 5 && (
            <p style={{ color: '#ffffff40', fontSize: 11, marginTop: 8, textAlign: 'center' }}>
              +{products.length - 5} autre{products.length - 5 > 1 ? 's' : ''}
            </p>
          )}
        </div>

        {/* SDK warning */}
        {!sdkReady && (
          <p style={{ color: '#ffffff60', fontSize: 12, textAlign: 'center', marginBottom: 10 }}>
            ⏳ Chargement SDK Agora...
          </p>
        )}

        {/* Bouton principal */}
        <button
          onClick={onOpenSelector}
          disabled={!sdkReady || loading || products.length === 0}
          style={{
            width: '100%', padding: '15px 0', borderRadius: 16,
            background: (!sdkReady || loading || products.length === 0)
              ? '#333'
              : 'linear-gradient(135deg, #EF4444, #DC2626)',
            border: 'none', color: '#fff', fontSize: 17, fontWeight: 800,
            cursor: (!sdkReady || loading || products.length === 0)
              ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center',
            justifyContent: 'center', gap: 10,
            opacity: (!sdkReady || loading || products.length === 0) ? 0.5 : 1,
            transition: 'all .2s',
          }}
        >
          <PulseDot />
          {loading
            ? 'Chargement...'
            : products.length === 0
              ? 'Aucune vidéo disponible'
              : 'Sélectionner les produits'}
        </button>

        {/* Hint sous le bouton si pas de produits */}
        {!loading && products.length === 0 && (
          <p style={{
            color: '#ffffff40', fontSize: 12,
            textAlign: 'center', marginTop: 12,
          }}>
            👆 Publiez d'abord une vidéo depuis l'app mobile FriTok
          </p>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Post-live screen
// ─────────────────────────────────────────────────────────────
function EndedScreen({ likeCount, giftCount, viewerCount, duration, onBack }) {
  return (
    <div style={{
      minHeight: '100vh', background: '#0a0a0a',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: 'system-ui, sans-serif',
      color: '#fff', padding: 24, textAlign: 'center',
    }}>
      <div style={{ fontSize: 56, marginBottom: 16 }}>🎉</div>
      <h2 style={{ fontSize: 26, fontWeight: 900, marginBottom: 8 }}>Live terminé !</h2>
      <p style={{ color: '#ffffff70', marginBottom: 32 }}>Durée : {duration}</p>
      <div style={{ display: 'flex', gap: 28, marginBottom: 36, justifyContent: 'center' }}>
        {[
          { v: viewerCount, l: '👁️ Spectateurs' },
          { v: likeCount,   l: '❤️ Likes' },
          { v: giftCount,   l: '🎁 Cadeaux' },
        ].map(s => (
          <div key={s.l}>
            <p style={{ fontSize: 28, fontWeight: 900, margin: 0 }}>{s.v}</p>
            <p style={{ color: '#ffffff60', fontSize: 12, margin: '4px 0 0' }}>{s.l}</p>
          </div>
        ))}
      </div>
      <button onClick={onBack} style={{
        padding: '13px 32px', borderRadius: 40,
        background: '#F97316', border: 'none',
        color: '#fff', fontWeight: 700, fontSize: 16, cursor: 'pointer',
      }}>← Retour</button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Atoms
// ─────────────────────────────────────────────────────────────
function ProductThumb({ src, name, size = 48 }) {
  const [err, setErr] = useState(false);
  if (src && !err) return (
    <img src={src} alt={name || ''} onError={() => setErr(true)}
      style={{ width: size, height: size, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
  );
  return (
    <div style={{
      width: size, height: size, borderRadius: 8, flexShrink: 0,
      background: 'rgba(249,115,22,.15)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.45,
    }}>🛍️</div>
  );
}

function ProductCard({ product, index, total, onClose, onChange }) {
  return (
    <div style={{
      position: 'absolute', bottom: 76, left: 12, right: 64,
      background: 'rgba(0,0,0,.82)', borderRadius: 16, padding: 12,
      border: '1px solid rgba(255,255,255,.1)',
    }}>
      <button onClick={onClose} style={{
        position: 'absolute', top: 6, right: 6,
        width: 22, height: 22, borderRadius: '50%',
        background: '#EF4444', border: 'none', color: '#fff',
        fontSize: 11, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>✕</button>
      <div style={{ display: 'flex', gap: 10 }}>
        <ProductThumb src={product.imageUrl} size={72} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ color: '#fff', fontWeight: 700, fontSize: 14, margin: '0 0 3px' }}>{product.name}</p>
          <p style={{ color: '#F97316', fontWeight: 700, fontSize: 14, margin: '0 0 5px' }}>
            {Number(product.price).toLocaleString('fr-FR')} FCFA
          </p>
          {product.description && (
            <p style={{ color: '#ffffff80', fontSize: 11, margin: '0 0 7px', lineHeight: 1.4 }}>
              {product.description}
            </p>
          )}
          <button style={{
            width: '100%', padding: '6px 0', borderRadius: 8,
            background: '#F97316', border: 'none', color: '#fff',
            fontWeight: 700, fontSize: 12, cursor: 'pointer',
          }}>🛒 Acheter</button>
        </div>
      </div>
      {total > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 5, marginTop: 8 }}>
          {Array.from({ length: total }, (_, i) => (
            <button key={i} onClick={() => onChange(i)} style={{
              width: i === index ? 14 : 8, height: 8, borderRadius: 8,
              border: 'none', padding: 0, cursor: 'pointer',
              background: i === index ? '#F97316' : 'rgba(255,255,255,.4)',
              transition: 'all .25s',
            }} />
          ))}
        </div>
      )}
    </div>
  );
}

function CoHostPanel({ activeCoHosts, maxCoHosts, onClose, onRemove }) {
  return (
    <div style={{
      position: 'absolute', bottom: 72, left: 12, right: 12,
      background: 'rgba(0,0,0,.92)', borderRadius: 16, padding: 14,
      border: '1px solid rgba(168,85,247,.3)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>👥 Co-hosts sur scène</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#ffffff70', cursor: 'pointer', fontSize: 18 }}>✕</button>
      </div>
      {activeCoHosts.length === 0
        ? <p style={{ color: '#ffffff50', fontSize: 13 }}>Aucun co-host pour l'instant.</p>
        : activeCoHosts.map(c => (
          <div key={c.agoraUid} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,.06)',
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              background: 'rgba(124,58,237,.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#A855F7', fontWeight: 700, fontSize: 14,
            }}>{c.displayName[0].toUpperCase()}</div>
            <span style={{ flex: 1, color: '#fff', fontSize: 13 }}>{c.displayName}</span>
            <span style={{
              background: 'rgba(22,163,74,.25)', color: '#86efac',
              fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
            }}>En direct</span>
            <button onClick={() => onRemove(c.agoraUid)} style={{
              background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', fontSize: 18,
            }}>✕</button>
          </div>
        ))
      }
      <p style={{ color: activeCoHosts.length >= maxCoHosts ? '#F97316' : 'rgba(255,255,255,.3)', fontSize: 11, marginTop: 10 }}>
        {activeCoHosts.length}/{maxCoHosts} co-hosts
      </p>
    </div>
  );
}

function VLabel({ label, color = '#fff' }) {
  return (
    <div style={{
      position: 'absolute', bottom: 7, left: 7,
      background: 'rgba(0,0,0,.55)', borderRadius: 7,
      padding: '2px 7px', fontSize: 11, fontWeight: 700, color,
    }}>{label}</div>
  );
}

function Pill({ bg, children }) {
  return (
    <span style={{
      background: bg, borderRadius: 20, padding: '3px 9px',
      fontSize: 11, color: '#fff', fontWeight: 700,
      display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
    }}>{children}</span>
  );
}

function PulseDot() {
  return (
    <>
      <style>{`@keyframes fpulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.55;transform:scale(1.35)}}`}</style>
      <span style={{
        width: 8, height: 8, borderRadius: '50%', background: '#fff',
        display: 'inline-block', animation: 'fpulse 1.4s ease-in-out infinite', flexShrink: 0,
      }} />
    </>
  );
}

function Spinner() {
  return (
    <>
      <style>{`@keyframes spin2{to{transform:rotate(360deg)}}`}</style>
      <div style={{
        width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
        border: '2px solid rgba(249,115,22,.3)', borderTopColor: '#F97316',
        animation: 'spin2 .7s linear infinite',
      }} />
    </>
  );
}

function TopBtn({ children, onClick, danger }) {
  return (
    <button onClick={onClick} style={{
      width: 34, height: 34, borderRadius: '50%',
      background: danger ? 'rgba(239,68,68,.3)' : 'rgba(0,0,0,.5)',
      border: `1px solid ${danger ? 'rgba(239,68,68,.5)' : 'rgba(255,255,255,.15)'}`,
      color: danger ? '#FCA5A5' : '#fff', fontSize: 16, cursor: 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>{children}</button>
  );
}

function ABtn({ icon, label, onClick, active }) {
  return (
    <button onClick={onClick} style={{
      background: 'none', border: 'none', cursor: 'pointer',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, padding: '5px 0',
    }}>
      <span style={{ fontSize: 24, color: active ? '#A855F7' : '#fff' }}>{icon}</span>
      {label !== undefined && label !== '' && (
        <span style={{ fontSize: 11, color: '#ffffffb0' }}>{label}</span>
      )}
    </button>
  );
}

function LiveModal({ children }) {
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 100,
      background: 'rgba(0,0,0,.72)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: '#1C1008', borderRadius: 20, padding: 24,
        width: 300, maxWidth: '90%', boxSizing: 'border-box',
      }}>{children}</div>
    </div>
  );
}

function ModalTitle({ children }) {
  return <p style={{ color: '#fff', fontWeight: 800, fontSize: 16, textAlign: 'center', margin: '0 0 6px' }}>{children}</p>;
}
function ModalSub({ children }) {
  return <p style={{ color: '#ffffff80', fontSize: 13, textAlign: 'center', margin: '0 0 20px' }}>{children}</p>;
}
function ModalRow({ children }) {
  return <div style={{ display: 'flex', gap: 10 }}>{children}</div>;
}
function BtnSec({ children, onClick }) {
  return (
    <button onClick={onClick} style={{
      flex: 1, padding: '11px 0', borderRadius: 12,
      background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.12)',
      color: '#ffffff90', fontWeight: 600, fontSize: 14, cursor: 'pointer',
    }}>{children}</button>
  );
}
function BtnPri({ children, onClick, disabled, color }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      flex: 1, padding: '11px 0', borderRadius: 12, border: 'none',
      background: color ?? '#F97316', color: '#fff',
      fontWeight: 700, fontSize: 14,
      cursor: disabled ? 'not-allowed' : 'pointer',
    }}>{children}</button>
  );
}
