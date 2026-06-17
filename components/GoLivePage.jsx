'use client';
import { useState, useEffect, useRef, useCallback } from 'react';

// ─────────────────────────────────────────────
// 🔴 GoLivePage — FriTok Web Live Streaming
// Mirror of the Flutter GoLivePage for Netlify
// ─────────────────────────────────────────────

// ── Mock data helpers ─────────────────────────
const MOCK_PRODUCTS = [
  { id: '1', name: 'Robe Wax Ankara', price: '14 500', imageUrl: '', description: 'Tissu 100 % coton, taille unique ajustable, motif exclusif.' },
  { id: '2', name: 'Sac en Raphia Tressé', price: '8 200', imageUrl: '', description: 'Fait main, idéal plage ou marché. Coloris naturel.' },
  { id: '3', name: 'Huile de Karité Pur', price: '3 900', imageUrl: '', description: 'Hydratation intense, 100 % naturel, sans parfum ajouté.' },
];

const MOCK_COMMENTS = [
  { id: 'c1', sender: 'Aminata K.', text: 'Magnifique ! Je prends la robe 🔥', lang: 'fr', time: Date.now() - 12000 },
  { id: 'c2', sender: 'David O.', text: 'C\'est livré à Dakar ?', lang: 'fr', time: Date.now() - 8000 },
  { id: 'c3', sender: '张伟', text: '好漂亮！多少钱？', lang: 'zh', textFr: 'Très beau ! Combien ça coûte ?', time: Date.now() - 4000 },
];

const MOCK_COHOSTS = [
  { uid: 'ch1', displayName: 'Sophie M.', avatarUrl: '', status: 'active', agoraUid: 1001 },
];

// ── Icône avatars (initiale) ──────────────────
function Avatar({ name, size = 32, color = '#7C3AED' }) {
  const initial = (name || '?')[0].toUpperCase();
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: color + '33', border: `1.5px solid ${color}55`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.38, fontWeight: 600, color,
      flexShrink: 0,
    }}>{initial}</div>
  );
}

// ── Bouton action barre droite ─────────────────
function ActionBtn({ icon, label, onClick, active, danger }) {
  const color = danger ? '#EF4444' : active ? '#A855F7' : '#fff';
  return (
    <button onClick={onClick} style={{
      background: 'none', border: 'none', cursor: 'pointer',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      gap: 2, padding: '6px 0',
    }}>
      <span style={{ fontSize: 24, color }}>{icon}</span>
      {label && <span style={{ fontSize: 11, color: '#ffffffb0', lineHeight: 1 }}>{label}</span>}
    </button>
  );
}

// ── Badge pill ────────────────────────────────
function Pill({ color, children }) {
  return (
    <span style={{
      background: color, borderRadius: 20, padding: '4px 10px',
      fontSize: 12, color: '#fff', fontWeight: 600,
      display: 'inline-flex', alignItems: 'center', gap: 5,
      whiteSpace: 'nowrap',
    }}>{children}</span>
  );
}

// ── Popup dialog ──────────────────────────────
function Modal({ title, children, onClose }) {
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 100,
      background: 'rgba(0,0,0,0.72)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: '#1C1008', borderRadius: 20, padding: 28,
        width: 320, maxWidth: '90%', boxSizing: 'border-box',
      }}>
        {title && <p style={{ color: '#fff', fontWeight: 700, fontSize: 16, marginBottom: 4, textAlign: 'center' }}>{title}</p>}
        {children}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// 🎥 GoLivePage principal
// ─────────────────────────────────────────────
export default function GoLivePage() {
  // ── State ─────────────────────────────────────
  const [isLive, setIsLive] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isEnding, setIsEnding] = useState(false);
  const [sellerLanguage, setSellerLanguage] = useState('fr'); // 'fr' | 'zh'


  const [viewerCount, setViewerCount] = useState(0);
  const [likeCount, setLikeCount] = useState(0);
  const [giftCount, setGiftCount] = useState(0);
  const [liked, setLiked] = useState(false);

  const [comments, setComments] = useState(MOCK_COMMENTS);
  const [commentText, setCommentText] = useState('');
  const [showComments, setShowComments] = useState(false);

  const [products] = useState(MOCK_PRODUCTS);
  const [productIndex, setProductIndex] = useState(0);
  const [showProductCard, setShowProductCard] = useState(true);

  const [coHosts, setCoHosts] = useState([]);
  const [showCoHostPanel, setShowCoHostPanel] = useState(false);
  const [pendingRequest, setPendingRequest] = useState(null);
  const [showRemoveDialog, setShowRemoveDialog] = useState(null);

  const [translationActive, setTranslationActive] = useState(false);
  const [isRecording, setIsRecording] = useState(false);

  const [showEndDialog, setShowEndDialog] = useState(false);
  const [channelId, setChannelId] = useState(null);
  const [liveSeconds, setLiveSeconds] = useState(0);

  const videoRef = useRef(null);
  const timerRef = useRef(null);
  const viewerTimerRef = useRef(null);
  const commentsEndRef = useRef(null);

  const MAX_COHOSTS = 3;
  const isChinese = sellerLanguage === 'zh';

  // ── Start live ────────────────────────────────
  const startLive = useCallback(async () => {
    setIsStarting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      const ts = Date.now();
      setChannelId(`live_web_${ts}`);
      setIsLive(true);
      setViewerCount(1);
      if (isChinese) { setTranslationActive(true); }

      // Simulate growing audience
      viewerTimerRef.current = setInterval(() => {
        setViewerCount(v => v + Math.floor(Math.random() * 3));
      }, 4000);

      // Simulate incoming comments
      const commentTexts = [
        { sender: 'Moussa D.', text: 'Super live ! 👏', lang: 'fr' },
        { sender: 'Fatou B.', text: 'Les prix sont bons !', lang: 'fr' },
        { sender: 'Ali K.', text: 'Livraison partout au Sénégal ?', lang: 'fr' },
      ];
      let ci = 0;
      const commentTimer = setInterval(() => {
        if (ci < commentTexts.length) {
          setComments(prev => [...prev, { ...commentTexts[ci], id: `auto-${ci}`, time: Date.now() }]);
          ci++;
        } else clearInterval(commentTimer);
      }, 5000);

      // Simulate co-host request after 8s
      setTimeout(() => {
        setPendingRequest({ uid: 'viewer-99', displayName: 'Kadiatou S.', avatarUrl: '' });
      }, 8000);

    } catch (err) {
      alert('Accès caméra/micro refusé. Veuillez autoriser dans les paramètres du navigateur.');
    } finally {
      setIsStarting(false);
    }
  }, [isChinese]);

  // ── Live timer ────────────────────────────────
  useEffect(() => {
    if (isLive) {
      timerRef.current = setInterval(() => setLiveSeconds(s => s + 1), 1000);
    }
    return () => clearInterval(timerRef.current);
  }, [isLive]);

  const formatTime = (s) => {
    const m = Math.floor(s / 60).toString().padStart(2, '0');
    const sec = (s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
  };

  // ── End live ──────────────────────────────────
  const endLive = useCallback(async () => {
    setIsEnding(true);
    clearInterval(viewerTimerRef.current);
    clearInterval(timerRef.current);
    if (videoRef.current?.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(t => t.stop());
      videoRef.current.srcObject = null;
    }
    await new Promise(r => setTimeout(r, 1200));
    setIsLive(false);
    setIsEnding(false);
    setShowEndDialog(false);
    setCoHosts([]);
    setPendingRequest(null);
    setTranslationActive(false);
    setLiveSeconds(0);
    setViewerCount(0);
  }, []);

  // ── Actions ───────────────────────────────────
  const sendComment = () => {
    if (!commentText.trim()) return;
    setComments(prev => [...prev, {
      id: `u-${Date.now()}`, sender: 'Moi', text: commentText.trim(), lang: isChinese ? 'zh' : 'fr', time: Date.now(),
    }]);
    setCommentText('');
  };

  const toggleLike = () => {
    setLiked(prev => {
      setLikeCount(c => prev ? Math.max(0, c - 1) : c + 1);
      return !prev;
    });
  };

  const sendGift = () => setGiftCount(c => c + 1);

  const acceptCoHost = (coHost) => {
    if (coHosts.length >= MAX_COHOSTS) {
      alert(`Maximum ${MAX_COHOSTS} co-hosts atteint.`);
      return;
    }
    setCoHosts(prev => [...prev, { ...coHost, status: 'active', agoraUid: Math.floor(Math.random() * 9000) + 1000 }]);
    setPendingRequest(null);
  };

  const declineCoHost = () => setPendingRequest(null);

  const removeCoHost = (coHost) => {
    setCoHosts(prev => prev.filter(c => c.uid !== coHost.uid));
    setShowRemoveDialog(null);
  };

  // ── Auto-scroll comments ──────────────────────
  useEffect(() => {
    commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [comments]);

  // ─────────────────────────────────────────────
  // 🎨 PRE-LIVE SCREEN
  // ─────────────────────────────────────────────
  if (!isLive) {
    return (
      <div style={{
        minHeight: '100vh', background: '#0a0a0a',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', fontFamily: 'system-ui, sans-serif', color: '#fff',
        padding: 24,
      }}>
        <div style={{ textAlign: 'center', maxWidth: 480, width: '100%' }}>
          {/* Logo */}
          <div style={{ fontSize: 48, marginBottom: 8 }}>🎬</div>
          <h1 style={{ fontSize: 32, fontWeight: 800, margin: '0 0 6px', letterSpacing: -1 }}>
            FriTok <span style={{ color: '#F97316' }}>Live</span>
          </h1>
          <p style={{ color: '#ffffff80', fontSize: 15, marginBottom: 36 }}>
            Vendez en direct. Connectez vos clients.
          </p>

          {/* Language selector */}
          <div style={{ marginBottom: 28 }}>
            <p style={{ fontSize: 13, color: '#ffffff70', marginBottom: 10 }}>Langue du vendeur</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              {[{ code: 'fr', label: '🇫🇷 Français', sub: 'Direct' }, { code: 'zh', label: '🇨🇳 中文', sub: 'Trad. auto → FR' }].map(l => (
                <button key={l.code} onClick={() => setSellerLanguage(l.code)} style={{
                  flex: 1, padding: '12px 16px', borderRadius: 14,
                  border: `2px solid ${sellerLanguage === l.code ? '#F97316' : '#ffffff20'}`,
                  background: sellerLanguage === l.code ? '#F9731610' : 'transparent',
                  color: '#fff', cursor: 'pointer', transition: 'all .2s',
                }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{l.label}</div>
                  <div style={{ fontSize: 11, color: '#ffffff70', marginTop: 2 }}>{l.sub}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Product preview */}
          <div style={{
            background: '#ffffff0a', borderRadius: 16, padding: 16, marginBottom: 28,
            border: '1px solid #ffffff15', textAlign: 'left',
          }}>
            <p style={{ fontSize: 12, color: '#ffffff60', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>
              Produits en live ({products.length})
            </p>
            {products.map(p => (
              <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #ffffff0a' }}>
                <span style={{ fontSize: 14 }}>{p.name}</span>
                <span style={{ color: '#F97316', fontWeight: 600, fontSize: 13 }}>{p.price} FCFA</span>
              </div>
            ))}
          </div>

          {/* Tips */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 32, flexWrap: 'wrap', justifyContent: 'center' }}>
            {['📶 Connexion stable', '💡 Bonne lumière', '🎙️ Micro clair'].map(tip => (
              <span key={tip} style={{ background: '#ffffff10', borderRadius: 20, padding: '4px 12px', fontSize: 12, color: '#ffffff80' }}>{tip}</span>
            ))}
          </div>

          {/* Start button */}
          <button onClick={startLive} disabled={isStarting} style={{
            width: '100%', padding: '16px 0', borderRadius: 16,
            background: isStarting ? '#666' : 'linear-gradient(135deg, #EF4444, #DC2626)',
            border: 'none', color: '#fff', fontSize: 18, fontWeight: 800,
            cursor: isStarting ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          }}>
            {isStarting ? (
              <><span style={{ fontSize: 16 }}>⏳</span> Démarrage...</>
            ) : (
              <><span style={{ fontSize: 20 }}>🔴</span> Démarrer le live</>
            )}
          </button>

          <p style={{ fontSize: 12, color: '#ffffff40', marginTop: 16 }}>
            En démarrant, vous acceptez les conditions de diffusion FriTok.
          </p>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────
  // 🎥 LIVE SCREEN
  // ─────────────────────────────────────────────
  const activeCoHosts = coHosts.filter(c => c.status === 'active');

  return (
    <div style={{
      position: 'relative', width: '100%', maxWidth: 430,
      margin: '0 auto', height: '100dvh', background: '#000',
      overflow: 'hidden', fontFamily: 'system-ui, sans-serif',
    }}>

      {/* ── Caméra principale ── */}
      <div style={{ position: 'absolute', inset: 0 }}>
        {activeCoHosts.length === 0 ? (
          <video ref={videoRef} autoPlay muted playsInline style={{
            width: '100%', height: '100%', objectFit: 'cover',
          }} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{ flex: 2, position: 'relative' }}>
              <video ref={videoRef} autoPlay muted playsInline style={{
                width: '100%', height: '100%', objectFit: 'cover',
              }} />
              <VideoLabel label="Hôte" color="#F97316" />
            </div>
            <div style={{ flex: 1, display: 'flex' }}>
              {activeCoHosts.map(coHost => (
                <div key={coHost.uid} style={{ flex: 1, position: 'relative', background: '#1a1a2e' }}>
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Avatar name={coHost.displayName} size={60} color="#A855F7" />
                  </div>
                  <VideoLabel label={coHost.displayName} />
                  <button onClick={() => setShowRemoveDialog(coHost)} style={{
                    position: 'absolute', top: 6, right: 6,
                    width: 22, height: 22, borderRadius: '50%',
                    background: '#EF4444cc', border: 'none', color: '#fff',
                    cursor: 'pointer', fontSize: 12, display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                  }}>✕</button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Gradient overlay bottom ── */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: '55%',
        background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 100%)',
        pointerEvents: 'none',
      }} />

      {/* ─────── TOP BAR ─────── */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        padding: '14px 14px 0',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        {/* Left: brand + status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Pill color="#EF4444cc">🔴 En direct</Pill>
          <span style={{ color: '#ffffff90', fontSize: 13 }}>{formatTime(liveSeconds)}</span>
          {isChinese && (
            <Pill color="#F97316cc">🇨🇳→🇫🇷</Pill>
          )}
        </div>
        {/* Right: actions */}
        <div style={{ display: 'flex', gap: 4 }}>
          <TopBtn onClick={() => setShowComments(v => !v)} title="Commentaires">💬</TopBtn>
          <TopBtn onClick={() => {
            if (navigator.share) navigator.share({ title: 'FriTok Live', url: window.location.href });
          }} title="Partager">🔗</TopBtn>
          <TopBtn onClick={() => setShowEndDialog(true)} title="Terminer" danger>✕</TopBtn>
        </div>
      </div>

      {/* ─────── BADGES ROW ─────── */}
      <div style={{
        position: 'absolute', top: 58, left: 14,
        display: 'flex', gap: 8, flexWrap: 'wrap',
      }}>
        <Pill color="#00000090">👁️ {viewerCount}</Pill>
        {activeCoHosts.length > 0 && (
          <button onClick={() => setShowCoHostPanel(v => !v)} style={{
            background: 'none', border: 'none', padding: 0, cursor: 'pointer',
          }}>
            <Pill color="#7C3AEDcc">👥 {activeCoHosts.length} sur scène</Pill>
          </button>
        )}
        {isChinese && (
          <Pill color={translationActive ? '#F97316cc' : '#666'}>
            {isRecording ? '⏺ Trad...' : '🌐 Trad. active'}
          </Pill>
        )}
      </div>

      {/* ─────── ACTION BUTTONS (right) ─────── */}
      <div style={{
        position: 'absolute', right: 12, top: 108,
        display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center',
      }}>
        <div style={{
          width: 48, height: 48, borderRadius: '50%', background: '#ffffff20',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 24, marginBottom: 8,
        }}>🎙️</div>
        <ActionBtn icon={liked ? '❤️' : '🤍'} label={String(likeCount)} onClick={toggleLike} active={liked} />
        <ActionBtn icon="🎁" label={String(giftCount)} onClick={sendGift} />
        <ActionBtn icon={showComments ? '💬' : '💭'} label="" onClick={() => setShowComments(v => !v)} active={showComments} />
        <ActionBtn icon="👥" label="" onClick={() => setShowCoHostPanel(v => !v)} active={showCoHostPanel} />
        <ActionBtn icon="🔗" label="" onClick={() => {
          if (navigator.share) navigator.share({ title: 'FriTok Live', url: window.location.href });
        }} />
      </div>

      {/* ─────── PRODUCT CARD ─────── */}
      {showProductCard && products.length > 0 && (
        <div style={{
          position: 'absolute', bottom: 120, left: 12, right: 70,
          background: 'rgba(0,0,0,0.8)', borderRadius: 16,
          padding: 12, backdropFilter: 'blur(4px)',
          border: '1px solid rgba(255,255,255,0.1)',
        }}>
          <button onClick={() => setShowProductCard(false)} style={{
            position: 'absolute', top: 6, right: 6,
            width: 22, height: 22, borderRadius: '50%',
            background: '#EF4444', border: 'none', color: '#fff',
            cursor: 'pointer', fontSize: 12, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
          }}>✕</button>
          <div style={{ display: 'flex', gap: 10, minHeight: 100 }}>
            <div style={{
              width: 80, height: 80, borderRadius: 10,
              background: '#F97316', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 32,
            }}>🛍️</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: '0 0 2px', color: '#fff', fontWeight: 700, fontSize: 14, lineHeight: 1.3 }}>
                {products[productIndex].name}
              </p>
              <p style={{ margin: '0 0 4px', color: '#F97316', fontWeight: 700, fontSize: 15 }}>
                {products[productIndex].price} FCFA
              </p>
              <p style={{ margin: '0 0 8px', color: '#ffffff90', fontSize: 11, lineHeight: 1.4,
                overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                {products[productIndex].description}
              </p>
              <button style={{
                width: '100%', padding: '6px 0', borderRadius: 8,
                background: '#F97316', border: 'none', color: '#fff',
                fontWeight: 700, fontSize: 13, cursor: 'pointer',
              }}>🛒 Acheter</button>
            </div>
          </div>
          {/* Dots */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 5, marginTop: 8 }}>
            {products.map((_, i) => (
              <button key={i} onClick={() => setProductIndex(i)} style={{
                width: i === productIndex ? 14 : 8,
                height: 8, borderRadius: 8, border: 'none',
                background: i === productIndex ? '#F97316' : '#ffffff50',
                cursor: 'pointer', padding: 0, transition: 'all .25s',
              }} />
            ))}
          </div>
        </div>
      )}

      {/* ─────── COMMENTS PANEL ─────── */}
      {showComments && (
        <div style={{
          position: 'absolute', bottom: 120, left: 12, right: 70,
          background: 'rgba(0,0,0,0.82)', borderRadius: 14,
          padding: 12, maxHeight: 260, display: 'flex', flexDirection: 'column',
        }}>
          <div style={{ flex: 1, overflowY: 'auto', marginBottom: 8 }}>
            {comments.map(c => (
              <div key={c.id} style={{ marginBottom: 6 }}>
                <span style={{ color: '#F97316', fontWeight: 700, fontSize: 12 }}>{c.sender}: </span>
                <span style={{ color: '#ffffffcc', fontSize: 13 }}>{c.textFr || c.text}</span>
                {c.lang !== 'fr' && <span style={{ color: '#ffffff50', fontSize: 10 }}> [{c.lang}]</span>}
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
              padding: '7px 12px', borderRadius: 8, background: '#F97316',
              border: 'none', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer',
            }}>↑</button>
          </div>
        </div>
      )}

      {/* ─────── CO-HOST PANEL ─────── */}
      {showCoHostPanel && (
        <div style={{
          position: 'absolute', bottom: 120, left: 12, right: 12,
          background: 'rgba(0,0,0,0.9)', borderRadius: 16, padding: 14,
          border: '1px solid rgba(168,85,247,0.3)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>👥 Co-hosts sur scène</span>
            <button onClick={() => setShowCoHostPanel(false)} style={{
              background: 'none', border: 'none', color: '#ffffff70', cursor: 'pointer', fontSize: 18,
            }}>✕</button>
          </div>
          {activeCoHosts.length === 0 ? (
            <p style={{ color: '#ffffff50', fontSize: 13 }}>Aucun co-host pour l'instant.</p>
          ) : activeCoHosts.map(coHost => (
            <div key={coHost.uid} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
            }}>
              <Avatar name={coHost.displayName} size={32} color="#A855F7" />
              <span style={{ flex: 1, color: '#fff', fontSize: 13 }}>{coHost.displayName}</span>
              <span style={{
                background: '#16a34a30', color: '#86efac',
                fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
              }}>En direct</span>
              <button onClick={() => setShowRemoveDialog(coHost)} style={{
                background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', fontSize: 18,
              }}>✕</button>
            </div>
          ))}
          <p style={{ color: activeCoHosts.length >= MAX_COHOSTS ? '#F97316' : '#ffffff40', fontSize: 11, marginTop: 10 }}>
            {activeCoHosts.length}/{MAX_COHOSTS} co-hosts utilisés
          </p>
        </div>
      )}

      {/* ─────── BOTTOM BAR ─────── */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        padding: '12px 14px 20px',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <div style={{ flex: 1, display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            value={commentText}
            onChange={e => setCommentText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendComment()}
            placeholder="Ajouter un commentaire..."
            style={{
              flex: 1, padding: '9px 14px', borderRadius: 24,
              background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)',
              color: '#fff', fontSize: 14, outline: 'none',
            }}
          />
        </div>
        <button onClick={() => setShowEndDialog(true)} style={{
          padding: '9px 16px', borderRadius: 24,
          background: '#EF4444', border: 'none', color: '#fff',
          fontWeight: 700, fontSize: 13, cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}>
          {isEnding ? '⏳' : '⏹ Terminer'}
        </button>
      </div>

      {/* ─────── MODALS ─────── */}

      {/* Fin du live */}
      {showEndDialog && (
        <Modal title="Terminer le live ?">
          <p style={{ color: '#ffffff90', fontSize: 13, textAlign: 'center', marginBottom: 20 }}>
            Le live sera clôturé pour tous les spectateurs.
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => setShowEndDialog(false)} style={{
              flex: 1, padding: 12, borderRadius: 12,
              background: '#ffffff15', border: 'none', color: '#fff', cursor: 'pointer',
            }}>Annuler</button>
            <button onClick={endLive} disabled={isEnding} style={{
              flex: 1, padding: 12, borderRadius: 12,
              background: '#EF4444', border: 'none', color: '#fff',
              fontWeight: 700, cursor: isEnding ? 'not-allowed' : 'pointer',
            }}>
              {isEnding ? 'Fermeture...' : 'Terminer'}
            </button>
          </div>
        </Modal>
      )}

      {/* Demande co-host */}
      {pendingRequest && !showEndDialog && (
        <Modal>
          <div style={{ textAlign: 'center' }}>
            <Avatar name={pendingRequest.displayName} size={64} color="#A855F7" />
            <div style={{ marginTop: 12, marginBottom: 4 }}>
              <p style={{ color: '#fff', fontWeight: 800, fontSize: 17, margin: 0 }}>{pendingRequest.displayName}</p>
              <p style={{ color: '#ffffff90', fontSize: 13, margin: '4px 0 20px' }}>souhaite rejoindre le live en vidéo</p>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={declineCoHost} style={{
                flex: 1, padding: 12, borderRadius: 12,
                background: '#ffffff15', border: 'none', color: '#ffffff90',
                fontWeight: 600, cursor: 'pointer',
              }}>Refuser</button>
              <button onClick={() => acceptCoHost(pendingRequest)} style={{
                flex: 1, padding: 12, borderRadius: 12,
                background: 'linear-gradient(135deg, #7C3AED, #A855F7)',
                border: 'none', color: '#fff', fontWeight: 700, cursor: 'pointer',
              }}>Accepter</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Retirer co-host */}
      {showRemoveDialog && (
        <Modal title={`Retirer ${showRemoveDialog.displayName} ?`}>
          <p style={{ color: '#ffffff90', fontSize: 13, textAlign: 'center', marginBottom: 20 }}>
            Ce participant sera retiré du live vidéo.
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => setShowRemoveDialog(null)} style={{
              flex: 1, padding: 12, borderRadius: 12,
              background: '#ffffff15', border: 'none', color: '#fff', cursor: 'pointer',
            }}>Annuler</button>
            <button onClick={() => removeCoHost(showRemoveDialog)} style={{
              flex: 1, padding: 12, borderRadius: 12,
              background: '#EF4444', border: 'none', color: '#fff',
              fontWeight: 700, cursor: 'pointer',
            }}>Retirer</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Helpers visuels ───────────────────────────
function VideoLabel({ label, color = '#fff' }) {
  return (
    <div style={{
      position: 'absolute', bottom: 8, left: 8,
      background: 'rgba(0,0,0,0.55)', borderRadius: 8,
      padding: '3px 8px', fontSize: 11, fontWeight: 700, color,
    }}>{label}</div>
  );
}

function TopBtn({ children, onClick, title, danger }) {
  return (
    <button onClick={onClick} title={title} style={{
      width: 36, height: 36, borderRadius: '50%',
      background: danger ? '#EF444440' : 'rgba(0,0,0,0.45)',
      border: `1px solid ${danger ? '#EF444460' : 'rgba(255,255,255,0.15)'}`,
      color: danger ? '#FCA5A5' : '#fff', fontSize: 17,
      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>{children}</button>
  );
}
