'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  collection, query, orderBy,
  onSnapshot, doc, updateDoc,
  addDoc, setDoc, deleteDoc, serverTimestamp,
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import QRCode from 'qrcode';
import { db, auth } from '../../lib/firebaseClient';
import { useAgoraPlayer } from '../../lib/useAgoraPlayer';
import styles from './live.module.css';

/* ══════════════════════════════════════════════════════════
   CONSTANTES LIVRAISON
   (affichage instantané uniquement — le montant définitif est
   TOUJOURS recalculé et validé côté serveur dans
   netlify/functions/create-colis.js avant écriture)
══════════════════════════════════════════════════════════ */
const VILLES_CI = [
  'Abidjan','Bouaké','Daloa','Korhogo','Yamoussoukro','San-Pédro',
  'Man','Divo','Gagnoa','Abengourou','Soubré','Odienné','Duekoué',
  'Bondoukou','Mankono','Séguéla','Touba','Ferkessédougou','Katiola',
  'Agboville','Adzopé','Tiassalé','Lakota','Issia','Sassandra',
];
const TARIFS = {
  'Abidjan': { 'Abidjan': 1500, 'Bouaké': 2500, default: 3000 },
  'Bouaké':  { 'Bouaké':  1500, 'Abidjan': 2500, default: 3500 },
  default:   { default: 3000 },
};
function getFrais(villeVendeur, villeClient, typeLivr) {
  const base = (TARIFS[villeVendeur] ?? TARIFS.default)[villeClient]
            ?? (TARIFS[villeVendeur] ?? TARIFS.default).default ?? 8000;
  return typeLivr === 'groupee' ? Math.round(base * 0.8) : base;
}
const fmt = (n) => Number(n).toLocaleString('fr-FR') + ' XOF';

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
   (remplace l'ancien updateDoc(..., { likeCount: increment(...) })
   qui était systématiquement rejeté : firestore.rules interdit
   toute écriture cliente sur le document live_sessions parent —
   à raison, sinon n'importe qui pourrait gonfler artificiellement
   le compteur. Même pattern que useLike() dans /demo.)
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
    const unsub = onSnapshot(
      collection(db, 'live_sessions', sessionId, 'likes'),
      snap => setCount(snap.size),
      () => {}
    );
    return unsub;
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
   Déclaré avant CoHostButton pour éviter tout ReferenceError
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
  // 'idle' | 'pending' | 'joining' | 'live' | 'declined' | 'removed'
  const [errorMsg, setErrorMsg] = useState(null);

  const unsubDocRef    = useRef(null);
  const agoraClientRef = useRef(null);
  const tracksRef      = useRef({ audio: null, video: null });
  const localDivRef    = useRef(null);
  const isMountedRef   = useRef(true);

  const AGORA_APP_ID_V = '5bbfd51877e2435f87afef0f89cebda3';

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      unsubDocRef.current?.();
      _releaseCoHostAgora();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-reset après refus/retrait : on supprime aussi le document
  // Firestore (autorisé par les rules pour les statuts terminaux
  // pending/declined/removed/left — voir firestore.rules) afin qu'un
  // nouveau clic sur "Sur scène" puisse recréer un doc frais au lieu de
  // heurter un doc existant dans un état terminal.
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

  // Guards
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
    setStatus('joining');
    try {
      await _loadSdk();
      const AgoraRTC = window.AgoraRTC;
      AgoraRTC.setLogLevel(3);

      const client = AgoraRTC.createClient({ mode: 'live', codec: 'vp8' });
      agoraClientRef.current = client;

      await client.setClientRole('host');
      await client.join(AGORA_APP_ID_V, channelId, token, agoraUid);

      let audioTrack = null, videoTrack = null;
      try {
        [audioTrack, videoTrack] = await AgoraRTC.createMicrophoneAndCameraTracks({}, {});
      } catch {
        try { audioTrack = await AgoraRTC.createMicrophoneAudioTrack(); }
        catch (e2) { throw new Error('Micro inaccessible : ' + e2.message); }
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

      setStatus('live');
      console.log('✅ Co-host sur scène, canal:', channelId);
    } catch (err) {
      console.error('❌ _joinAsCoHost:', err);
      await _releaseCoHostAgora();
      if (isMountedRef.current) {
        setStatus('idle');
        setErrorMsg('Erreur: ' + err.message);
      }
    }
  }

  // ── 1. Demande pending ───────────────────────────────────
  // FIX : le document envoyé ne contient plus que les 4 champs autorisés
  // par firestore.rules (status, displayName, avatarUrl, requestedAt).
  // `uid`, `agoraUid` et `token` étaient rejetés par la règle (hasOnly) —
  // chaque demande échouait avant cette correction. `agoraUid`/`token`
  // sont ajoutés plus tard par le serveur (Admin SDK, hors règles)
  // quand le vendeur accepte.
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
        async (snap) => {
          if (!snap.exists()) {
            if (isMountedRef.current) setStatus('idle');
            return;
          }
          const d = snap.data();
          if (d.status === 'active' && d.token && d.agoraUid) {
            unsubDocRef.current?.();
            await _joinAsCoHost(d.token, d.agoraUid);
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
      console.error('requestCoHost:', e);
      if (isMountedRef.current) setErrorMsg('Erreur réseau.');
    }
  };

  // ── 2. Annuler avant acceptation ─────────────────────────
  // firestore.rules autorise le delete pour le statut 'pending' — la
  // demande est proprement retirée, pas juste masquée côté client.
  const cancelRequest = async () => {
    unsubDocRef.current?.();
    await deleteDoc(doc(db, 'live_sessions', channelId, 'co_hosts', uid)).catch(() => {});
    if (isMountedRef.current) setStatus('idle');
  };

  // ── 3. Quitter la scène (pendant live) ───────────────────
  // Écrit status:'left' (seule transition autorisée par les rules pour
  // une update initiée par le co-host lui-même), puis supprime le doc
  // (delete autorisé pour 'left') pour qu'une future demande reparte
  // d'un état propre.
  const leaveStage = async () => {
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

  // ── Rendu ─────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>

      {status === 'live' && (
        <div ref={localDivRef} style={{
          width: 56, height: 80, borderRadius: 8, overflow: 'hidden',
          background: '#111', border: '2px solid #22C55E',
          marginBottom: 4, flexShrink: 0,
        }} />
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
   ── CORRIGÉ ──
   Alignée sur la version déjà corrigée de /demo/page.js : la commande
   passe désormais par netlify/functions/create-colis (seule fonction
   réelle en prod), avec le format de payload qu'elle attend
   (nomDestinataire / telDestinataire / villeDestination /
   adresseLivraison / articles[] / photoUrl), et un sellerId distinct
   du client pour que le vendeur (pas l'acheteur) soit crédité comme
   userIdVend. Le QR est généré localement (lib `qrcode`) — il ne
   transite plus par api.qrserver.com avec les données du client dans
   l'URL.
══════════════════════════════════════════════════════════ */
function OrderModal({ product, sellerId, authUser, onClose }) {
  const [step,        setStep]        = useState('form');
  const [nomDest,     setNomDest]     = useState(
    authUser?.displayName || authUser?.email?.split('@')[0] || ''
  );
  const [telephone,   setTelephone]   = useState(authUser?.phoneNumber ?? '');
  const [adresse,     setAdresse]     = useState('');
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

  const prix     = Number(product?.price ?? 0);
  const fraisXof = villeClient ? getFrais('Abidjan', villeClient, typeLivr) : 0;
  const totalXof = prix + fraisXof;

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
          // sellerId != l'appelant → commande marketplace : la fonction
          // crédite userIdVend = sellerId, pas l'acheteur.
          sellerId,
          nomDestinataire: nomDest.trim(),
          telDestinataire: telephone.trim(),
          villeDepart: 'Abidjan',
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
                <p className={styles.recapPrice}>{fmt(prix)}</p>
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
            <FieldLabel text="VILLE DE LIVRAISON"/>
            <select className={`${styles.formInput}${errors.ville ? ' ' + styles.inputErr : ''}`}
              value={villeClient} onChange={e => setVilleClient(e.target.value)}>
              <option value="">Sélectionnez votre ville…</option>
              {VILLES_CI.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            {errors.ville && <p className={styles.errMsg}>{errors.ville}</p>}
            {villeClient && (
              <div className={styles.fraisCard}>
                <div className={styles.fraisRow}><span>Articles</span><span>{fmt(prix)}</span></div>
                <div className={styles.fraisRow}><span>Livraison{typeLivr === 'groupee' ? ' (-20%)' : ''}</span><span>{fmt(fraisXof)}</span></div>
                <div className={styles.fraisDivider}/>
                <div className={`${styles.fraisRow} ${styles.fraisTotal}`}><span>Total (estimé)</span><span>{fmt(totalXof)}</span></div>
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
              {submitting ? <Spinner/> : modePaiem === 'immediat' ? `Payer ${fmt(totalXof)}` : 'Commander — payer à la livraison'}
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
              <div className={styles.fraisRow}><span>{product?.name}</span><span>{fmt(prix)}</span></div>
              <div className={styles.fraisRow}><span>Livraison {villeClient}</span><span>{fmt(serverTotal?.fraisXof ?? fraisXof)}</span></div>
              <div className={styles.fraisDivider}/>
              <div className={`${styles.fraisRow} ${styles.fraisTotal}`}><span>Total</span><span>{fmt(serverTotal?.totalXof ?? totalXof)}</span></div>
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
   PLAYER LIVE PLEIN ÉCRAN
══════════════════════════════════════════════════════════ */
const DEMO_CHAT = [
  { id: 1, user: '@marie_ci', text: "C'est magnifique !" },
  { id: 2, user: '@kofi',     text: 'Disponible en rouge ?' },
  { id: 3, user: '@aminata',  text: 'Le prix svp' },
  { id: 4, user: '@alex_abj', text: "J'adore ce produit !" },
  { id: 5, user: '@cisse',    text: 'Livraison a Yopougon ?' },
];

function LivePlayer({ session, authUser, authReady, onClose }) {
  const { videoContainerRef, remoteUsers, status, error: agoraError } =
    useAgoraPlayer(session.channelId, session.isLive);

  // Likes persistés (sous-collection), plus updateDoc/increment direct
  const { liked, count: likeCount, toggle: toggleLike } =
    useLiveLike(session.id, session.likeCount ?? 0, authUser);

  const [activeProduct, setActiveProduct] = useState(session.products?.[0] ?? null);
  const [messages,      setMessages]      = useState([]);
  const [inputMsg,      setInputMsg]      = useState('');
  const [orderProduct,  setOrderProduct]  = useState(null);
  const [authPrompt,    setAuthPrompt]    = useState(false);
  const chatRef  = useRef(null);
  const msgIdRef = useRef(10);

  useEffect(() => {
    setMessages(DEMO_CHAT.slice(0, 2));
    const timers = DEMO_CHAT.slice(2).map((m, i) =>
      setTimeout(() => setMessages(p => [...p.slice(-9), m]), (i + 1) * 3800)
    );
    return () => timers.forEach(clearTimeout);
  }, []);

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

  const sendMessage = () => {
    const text = inputMsg.trim();
    if (!text) return;
    setMessages(p => [...p.slice(-9), { id: msgIdRef.current++, user: '@vous', text }]);
    setInputMsg('');
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
                <div key={p.productId ?? i} className={isActive ? styles.carouselItemActive : styles.carouselItem}>
                  <div className={styles.carouselImgWrap} onClick={() => setActiveProduct(p)}>
                    <img src={p.image} alt={p.name} className={styles.carouselImg}
                      onError={e2 => { e2.currentTarget.style.display = 'none'; }}/>
                    {isActive && <div className={styles.carouselActiveDot}/>}
                  </div>
                  <span className={styles.carouselName}>{p.name}</span>
                  <span className={styles.carouselPrice}>{Number(p.price).toLocaleString('fr-FR')} F</span>
                  <button className={styles.carouselOrderBtn} onClick={() => handleOrder(p)}>Commander</button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {authPrompt && <AuthRequiredModal onClose={() => setAuthPrompt(false)}/>}
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
══════════════════════════════════════════════════════════ */
export default function LivePage() {
  const [sessions,  setSessions]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);
  const [selected,  setSelected]  = useState(null);
  const [filter,    setFilter]    = useState('all');
  const [authUser,  setAuthUser]  = useState(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, user => {
      setAuthUser(user?.emailVerified ? user : null);
      setAuthReady(true);
    });
    return unsub;
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'live_sessions'), orderBy('startedAt', 'desc'));
    const unsub = onSnapshot(q,
      snap => {
        setSessions(snap.docs.map(d => ({
          id: d.id,
          ...d.data(),
          startedAt: d.data().startedAt?.toDate?.()?.toLocaleDateString('fr-FR') ?? '',
        })));
        setLoading(false);
      },
      err => { console.error(err); setError('Impossible de charger les lives.'); setLoading(false); }
    );
    return () => unsub();
  }, []);

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
          <div className={styles.grid}>
            {filtered.map(s => <LiveCard key={s.id} session={s} onSelect={setSelected}/>)}
          </div>
        )}
      </div>
    </div>
  );
}