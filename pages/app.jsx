'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, onAuthStateChanged, signOut } from 'firebase/auth';
import {
  getFirestore, doc, getDoc, getDocs, updateDoc, setDoc,
  collection, addDoc, query, where, orderBy, limit,
  onSnapshot, serverTimestamp, increment,
} from 'firebase/firestore';
import dynamic from 'next/dynamic';
import { createFlutterwaveRentalPayment } from '../app/hooks/useWallet';
import useRentalAlerts  from '../hooks/useRentalAlerts';
import RentalAlertBanner from '../components/app/RentalAlertBanner';

// ─── Firebase ────────────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey           : process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain       : process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId        : process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket    : process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId            : process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};
function getFirebaseApp() {
  return getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
}

// ─── Design tokens ───────────────────────────────────────────────────────────
const D = {
  bg        : '#FFF8EE', surface   : '#FFFFFF', border    : '#FFDDB0',
  orange    : '#FF6B00', orangeDim : '#FFEDD5', zest      : '#FFB700',
  text1     : '#2D1500', text2     : '#8B5E3C', text3     : '#BF9060',
  green     : '#1A9640', greenLight: '#E6F7EC',
  amber     : '#B45309', amberLight: '#FEF3C7',
  red       : '#E53E00',
};

// ─── Tarifs fixes ────────────────────────────────────────────────────────────
const FRAIS_XOF   = 300;
const CAUTION_XOF = 200;

// ── Compte Escrow Fritok ──────────────────────────────────────────────────────
const ESCROW_UID = 'escrow_fritok';

// ─── Leaflet (SSR disabled) ──────────────────────────────────────────────────
const MapView = dynamic(() => import('../components/app/MapView'), { ssr: false });

// ─── Helpers ─────────────────────────────────────────────────────────────────
const toNum = (v) => (v == null ? 0 : Number(v));

const fmt = (n) => new Intl.NumberFormat('fr-FR').format(Math.round(toNum(n)));

const fmtDate = (ts) => {
  if (!ts) return '–';
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};

const fmtDateLong = (ts) => {
  if (!ts) return '–';
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
};

const elapsed = (ts) => {
  if (!ts) return '';
  const d   = ts?.toDate ? ts.toDate() : new Date(ts);
  const sec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (sec < 60)   return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}min`;
  return `${Math.floor(sec / 3600)}h${String(Math.floor((sec % 3600) / 60)).padStart(2, '0')}`;
};

const batteryColor = (lvl) => lvl == null ? D.text3 : lvl >= 60 ? D.green : lvl >= 30 ? D.amber : D.red;
const batteryIcon  = (lvl) => lvl == null ? '🔋' : lvl >= 60 ? '🔋' : lvl >= 30 ? '🪫' : '🔴';

// ─────────────────────────────────────────────────────────────────────────────
//  writeTranstet
// ─────────────────────────────────────────────────────────────────────────────
async function writeTranstet(db, {
  type, currency, montantEnvoye, frais = 0,
  expediteurId, expediteurEmail, expediteurPhoto = '',
  destinataireId, destinataireNom, destinataireTel = '',
  status = 'completed',
}) {
  const now    = Date.now();
  const date   = new Date(now).toISOString().slice(0, 10);
  const docRef = doc(collection(db, 'TransfetMoney'));
  await setDoc(docRef, {
    transactionId         : docRef.id,
    type, currency, date,
    timestamp             : now,
    montantEnvoye         : Number(montantEnvoye),
    frais                 : Number(frais),
    montantRecu           : Number(montantEnvoye) - Number(frais),
    expediteurId, expediteurEmail,
    profilePictureUrl     : expediteurPhoto || '',
    destinataireId, destinataireNom,
    destinataireTelephone : destinataireTel,
    status,
  });
  return docRef.id;
}

// ─────────────────────────────────────────────────────────────────────────────
//  ROOT
// ─────────────────────────────────────────────────────────────────────────────
export default function FritokApp() {
  const router = useRouter();
  const auth   = getAuth(getFirebaseApp());
  const db     = getFirestore(getFirebaseApp());

  const [user,          setUser]          = useState(null);
  const [loading,       setLoading]       = useState(true);
  const [tab,           setTab]           = useState('home');
  const [profile,       setProfile]       = useState(null);
  const [wallet,        setWallet]        = useState({});
  const [currency,      setCurrency]      = useState('XOF');
  const [activeRentals, setActiveRentals] = useState([]);
  const [history,       setHistory]       = useState([]);
  const [txHistory,     setTxHistory]     = useState([]);

  // ── MODIFICATION 2 : hook alertes location ────────────────────────────────
  const { alerts, dismissAlert } = useRentalAlerts(activeRentals);

  // ── Auth ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u || !u.emailVerified) {
        router.replace('/login?redirect=' + encodeURIComponent('/app'));
        return;
      }
      setUser(u);
      setLoading(false);
    });
    return unsub;
  }, []);

  // ── MODIFICATION 4 : Service Worker + FCM token ───────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined' || !user) return;

    // Enregistre le Service Worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw-fritok.js')
        .catch(e => console.warn('SW registration failed:', e));
    }

    // Demande permission + récupère FCM token
    const initFcm = async () => {
      if (!('Notification' in window)) return;
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return;

      try {
        const { getMessaging, getToken } = await import('firebase/messaging');
        const app     = getFirebaseApp();
        const msgInst = getMessaging(app);
        const token   = await getToken(msgInst, {
          vapidKey                 : process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
          serviceWorkerRegistration: await navigator.serviceWorker.ready,
        });
        if (!token) return;

        // Sauvegarde le token → utilisé par check-rental-alerts
        const { getFirestore: gfs, doc: d2, updateDoc: upd } = await import('firebase/firestore');
        const db2 = gfs(app);
        await upd(d2(db2, 'users', user.uid), { fcmToken: token });
      } catch (e) {
        console.warn('FCM token error:', e.message);
      }
    };

    initFcm();
  }, [user]);

  // ── Listeners Firestore ───────────────────────────────────────────────────
  useEffect(() => {
    if (!user) {
      setProfile(null); setWallet({}); setActiveRentals([]); setHistory([]);
      return;
    }

    const unsubUser = onSnapshot(doc(db, 'users', user.uid), (snap) => {
      const data = snap.data();
      if (!data) return;
      setProfile(data);
      if (data.wallet && typeof data.wallet === 'object') setWallet(data.wallet);
      if (data.currency) setCurrency(data.currency);
    });

    const unsubActive = onSnapshot(
      query(collection(db, 'rentals'),
        where('userId', '==', user.uid),
        where('status', '==', 'en_cours'),
        orderBy('startTime', 'desc')),
      (snap) => setActiveRentals(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
    );

    const unsubHist = onSnapshot(
      query(collection(db, 'rentals'),
        where('userId', '==', user.uid),
        orderBy('startTime', 'desc'),
        limit(30)),
      (snap) => setHistory(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
    );

    const unsubTx = onSnapshot(
      query(
        collection(db, 'TransfetMoney'),
        where('expediteurId', '==', user.uid),
        orderBy('timestamp', 'desc'),
        limit(50)
      ),
      (snapExp) => {
        const sent = snapExp.docs.map(d => ({ id: d.id, ...d.data(), _dir: 'out' }));
        getDocs(query(
          collection(db, 'TransfetMoney'),
          where('destinataireId', '==', user.uid),
          where('expediteurId',   '!=', ESCROW_UID),
          orderBy('expediteurId'),
          orderBy('timestamp', 'desc'),
          limit(20)
        )).then(snapDest => {
          const received = snapDest.docs.map(d => ({ id: d.id, ...d.data(), _dir: 'in' }));
          const all    = [...sent, ...received];
          const seen   = new Set();
          const deduped = all.filter(tx => {
            if (seen.has(tx.id)) return false;
            seen.add(tx.id); return true;
          });
          deduped.sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
          setTxHistory(deduped);
        }).catch(console.error);
      }
    );

    return () => { unsubUser(); unsubActive(); unsubHist(); unsubTx(); };
  }, [user]);

  if (loading || !user) return <Splash />;

  const normWallet = Object.fromEntries(Object.entries(wallet).map(([k, v]) => [k, toNum(v)]));
  const balance    = normWallet[currency] ?? 0;
  const currencies = Object.keys(normWallet);

  const handleSignOut = async () => {
    await signOut(auth);
    router.replace('/login?redirect=' + encodeURIComponent('/app'));
  };

  return (
    <div style={{ background: D.bg, minHeight: '100dvh', display: 'flex', flexDirection: 'column', maxWidth: 480, margin: '0 auto' }}>
      {/* ── MODIFICATION 3 : div avec bannière alertes ── */}
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 80 }}>

        <RentalAlertBanner
          alerts    = {alerts}
          onDismiss = {dismissAlert}
          onNav     = {setTab}
        />

        {tab === 'home'    && <HomeTab    balance={balance} currency={currency} currencies={currencies} normWallet={normWallet} onCurrencyChange={setCurrency} activeRentals={activeRentals} history={history} profile={profile} onNav={setTab} />}
        {tab === 'map'     && <MapTab     db={db} />}
        {tab === 'rent'    && <RentTab    db={db} user={user} wallet={wallet} profile={profile} onSuccess={() => setTab('home')} />}
        {tab === 'return'  && <ReturnTab  db={db} user={user} activeRentals={activeRentals} profile={profile} onSuccess={() => setTab('home')} />}
        {tab === 'history' && <HistoryTab txHistory={txHistory} />}
        {tab === 'profile' && <ProfileTab profile={profile} user={user} onSignOut={handleSignOut} onNav={setTab} />}
      </div>
      <BottomNav tab={tab} onNav={setTab} hasActive={activeRentals.length > 0} profile={profile} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Splash
// ─────────────────────────────────────────────────────────────────────────────
function Splash() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', background: D.bg }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>⚡</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: D.text1 }}>Fritok</div>
        <div style={{ width: 32, height: 3, background: D.orange, borderRadius: 99, margin: '16px auto 0' }} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  HomeTab
// ─────────────────────────────────────────────────────────────────────────────
function HomeTab({ balance, currency, currencies, normWallet, onCurrencyChange, activeRentals, history, profile, onNav }) {
  return (
    <div style={{ padding: '24px 0 0' }}>
      <div style={{ padding: '0 24px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 12, color: D.orange, fontWeight: 700, letterSpacing: 1 }}>Bonjour ✦</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: D.text1, lineHeight: 1.15, marginTop: 4 }}>
              {profile?.username ? `${profile.username.split(' ')[0]},` : 'Ton énergie,'}<br />
              {profile?.username ? 'ton énergie ⚡' : 'partout.'}
            </div>
          </div>
          <button onClick={() => onNav('profile')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0 }}>
            {profile?.photoUrl
              ? <img src={profile.photoUrl} alt="profil" style={{ width: 46, height: 46, borderRadius: '50%', objectFit: 'cover', border: `2.5px solid ${D.border}` }} />
              : <div style={{ width: 46, height: 46, borderRadius: '50%', background: D.orangeDim, border: `2.5px solid ${D.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 700, color: D.orange }}>
                  {profile?.username?.charAt(0)?.toUpperCase() || '?'}
                </div>
            }
          </button>
        </div>
      </div>

      <WalletCard balance={balance} currency={currency} currencies={currencies} normWallet={normWallet}
        activeCount={activeRentals.length} onCurrencyChange={onCurrencyChange} />

      {activeRentals.length > 0 && (
        <div onClick={() => onNav('return')} style={{ margin: '14px 24px 0', padding: 14, background: D.amberLight, borderRadius: 12, border: `1px solid ${D.amber}33`, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18 }}>🔋</span>
          <div style={{ flex: 1, fontSize: 13, color: D.amber, fontWeight: 600 }}>
            {activeRentals[0].qrCode} · {elapsed(activeRentals[0].startTime)}
          </div>
          <span style={{ fontSize: 12, color: D.amber }}>→</span>
        </div>
      )}

      <div style={{ padding: '20px 24px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <QuickBtn icon="📷" label="Louer un power bank" sub="Scanner ou entrer le QR code" primary onClick={() => onNav('rent')} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <QuickBtn icon="🗺️" label="Carte" sub="Power banks proches" onClick={() => onNav('map')} />
          <QuickBtn icon="↩️" label="Rendre" sub="Power bank actif" onClick={() => onNav('return')} />
        </div>
      </div>

      <div style={{ marginTop: 28, padding: '0 24px 8px', fontSize: 11, letterSpacing: 1.5, color: D.text3, fontWeight: 700 }}>ACTIVITÉ RÉCENTE</div>
      {history.length === 0
        ? <div style={{ textAlign: 'center', padding: '40px 0', color: D.text2, fontSize: 13 }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>🧾</div>
            Aucune location pour l'instant
          </div>
        : history.slice(0, 5).map(r => <HistoryRow key={r.id} rental={r} />)
      }
      <div style={{ height: 32 }} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  WalletCard
// ─────────────────────────────────────────────────────────────────────────────
function WalletCard({ balance, currency, currencies, normWallet, activeCount, onCurrencyChange }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div style={{ margin: '0 24px', padding: 20, borderRadius: 24, background: `linear-gradient(135deg, ${D.orange}, ${D.zest})`, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -48, right: -32, width: 130, height: 130, borderRadius: '50%', background: 'rgba(255,255,255,0.10)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: -24, left: -24, width: 90, height: 90, borderRadius: '50%', background: 'rgba(255,255,255,0.07)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: 700, letterSpacing: 1.8 }}>WALLET FRITOK</div>
            {currencies.length > 1 && (
              <button onClick={() => setOpen(true)} style={{ background: 'rgba(255,255,255,0.20)', border: '0.5px solid rgba(255,255,255,0.35)', borderRadius: 20, padding: '4px 12px', cursor: 'pointer', color: '#fff', fontSize: 11, fontWeight: 700 }}>
                {currency} ▾
              </button>
            )}
          </div>
          <div style={{ marginTop: 10, display: 'flex', alignItems: 'flex-end', gap: 8 }}>
            <div style={{ fontSize: 42, fontWeight: 800, color: '#fff', letterSpacing: -1, lineHeight: 1 }}>{fmt(balance)}</div>
            <div style={{ paddingBottom: 6, fontSize: 15, color: 'rgba(255,255,255,0.75)', fontWeight: 600 }}>{currency}</div>
          </div>
          {currencies.filter(c => c !== currency && normWallet[c] > 0).length > 0 && (
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              {currencies.filter(c => c !== currency && normWallet[c] > 0).map(c => (
                <div key={c} onClick={() => onCurrencyChange(c)} style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', cursor: 'pointer', background: 'rgba(255,255,255,0.12)', borderRadius: 99, padding: '2px 8px' }}>
                  {fmt(normWallet[c])} {c}
                </div>
              ))}
            </div>
          )}
          <div style={{ height: 0.5, background: 'rgba(255,255,255,0.25)', margin: '14px 0' }} />
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'rgba(255,255,255,0.18)', border: '0.5px solid rgba(255,255,255,0.30)', borderRadius: 99, padding: '5px 12px' }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: activeCount > 0 ? D.greenLight : 'rgba(255,255,255,0.6)' }} />
            <div style={{ fontSize: 12, color: '#fff', fontWeight: 500 }}>
              {activeCount > 0 ? `${activeCount} location${activeCount > 1 ? 's' : ''} active${activeCount > 1 ? 's' : ''}` : 'Aucune location active'}
            </div>
          </div>
        </div>
      </div>
      {open && (
        <BottomSheet onClose={() => setOpen(false)} title="Choisir une devise">
          {currencies.map(c => (
            <button key={c} onClick={() => { onCurrencyChange(c); setOpen(false); }}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', background: 'none', border: 'none', padding: '14px 0', cursor: 'pointer', fontSize: 15, color: c === currency ? D.orange : D.text1, fontWeight: c === currency ? 700 : 400, borderBottom: `0.5px solid ${D.border}` }}>
              <span>{c}</span>
              <span style={{ fontSize: 14, color: D.text2 }}>{fmt(normWallet[c])} {c} {c === currency ? '✓' : ''}</span>
            </button>
          ))}
        </BottomSheet>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  MapTab
// ─────────────────────────────────────────────────────────────────────────────
function MapTab({ db }) {
  const [powerBanks, setPowerBanks] = useState([]);
  const [partners,   setPartners]   = useState({});
  const [loading,    setLoading]    = useState(true);
  const [filter,     setFilter]     = useState('tous');

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'powerBanks')),
      (snap) => {
        setPowerBanks(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      () => setLoading(false),
    );
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'partners')),
      (snap) => {
        const map = {};
        snap.docs.forEach(d => {
          const data  = d.data();
          const entry = {
            name   : data.name   || 'Partenaire Fritok',
            emoji  : data.emoji  || '🏪',
            type   : data.type   || '',
            stock  : data.stockAvailable ?? null,
            active : data.active ?? true,
            address: data.address || data.adresse || '',
            photos : Array.isArray(data.partnerPhotos)
              ? data.partnerPhotos.filter(Boolean).slice(0, 3)
              : [],
          };
          map[d.id] = entry;
          if (data.uid)    map[data.uid]    = entry;
          if (data.qrCode) map[data.qrCode] = entry;
        });
        setPartners(map);
      },
    );
    return unsub;
  }, []);

  const dispoCount = powerBanks.filter(pb => pb.state === 'disponible').length;

  const markers = powerBanks
    .filter(pb => filter === 'tous' || pb.state === filter)
    .filter(pb => pb.location?.latitude != null)
    .map(pb => {
      const ptn = partners[pb.currentPartnerId] ?? null;
      return {
        id              : pb.id,
        lat             : pb.location.latitude,
        lng             : pb.location.longitude,
        qrCode          : pb.qrCode || pb.id,
        state           : pb.state,
        batteryLevel    : pb.batteryLevel,
        currentPartnerId: pb.currentPartnerId ?? null,
        partnerEmoji    : ptn?.emoji ?? null,
      };
    });

  const fetchPartner = async (partnerId) => {
    if (!partnerId) return null;
    if (partners[partnerId]) return partners[partnerId];
    const snap = await getDoc(doc(db, 'partners', partnerId));
    if (snap.exists()) {
      const d = snap.data();
      return {
        name   : d.name   || 'Partenaire Fritok',
        emoji  : d.emoji  || '🏪',
        type   : d.type   || '',
        stock  : d.stockAvailable ?? null,
        active : d.active ?? true,
        address: d.address || d.adresse || '',
        photos : Array.isArray(d.partnerPhotos) ? d.partnerPhotos.filter(Boolean).slice(0, 3) : [],
      };
    }
    const q = await getDocs(
      query(collection(db, 'partners'), where('uid', '==', partnerId))
    );
    if (!q.empty) {
      const d = q.docs[0].data();
      return {
        name   : d.name   || 'Partenaire Fritok',
        emoji  : d.emoji  || '🏪',
        type   : d.type   || '',
        stock  : d.stockAvailable ?? null,
        active : d.active ?? true,
        address: d.address || d.adresse || '',
        photos : Array.isArray(d.partnerPhotos) ? d.partnerPhotos.filter(Boolean).slice(0, 3) : [],
      };
    }
    return null;
  };

  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '24px 24px 0', background: D.bg, flexShrink: 0 }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: D.text1 }}>📍 Power banks</div>
        <div style={{ fontSize: 13, color: D.text2, marginTop: 2, marginBottom: 12 }}>
          {loading
            ? 'Chargement…'
            : `${dispoCount} disponible${dispoCount !== 1 ? 's' : ''} · ${powerBanks.length} au total`}
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, overflowX: 'auto', paddingBottom: 4 }}>
          {[
            { key: 'tous',         label: 'Tous' },
            { key: 'disponible',   label: '✅ Disponibles' },
            { key: 'en_location',  label: '🔋 En location' },
            { key: 'hors_service', label: '🚫 Hors service' },
          ].map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)} style={{
              padding: '5px 14px', borderRadius: 99,
              border: `1px solid ${filter === f.key ? D.orange : D.border}`,
              background: filter === f.key ? D.orangeDim : D.surface,
              color: filter === f.key ? D.orange : D.text2,
              fontWeight: filter === f.key ? 700 : 400,
              fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap',
            }}>
              {f.label}
            </button>
          ))}
        </div>
      </div>
      <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        <MapView powerBanks={markers} onFetchPartner={fetchPartner} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  RentTab
// ─────────────────────────────────────────────────────────────────────────────
const RATES_FALLBACK = { XOF: 1, GHS: 0.013, NGN: 4.75 };

function convertFromXof(amountXof, toCurrency, rates) {
  if (toCurrency === 'XOF') return amountXof;
  const rate = rates[toCurrency] ?? RATES_FALLBACK[toCurrency] ?? 1;
  return Math.round(amountXof * rate * 100) / 100;
}

const CUR_META = {
  XOF: { symbol: 'FCFA', decimals: 0 },
  GHS: { symbol: 'GH₵',  decimals: 2 },
  NGN: { symbol: '₦',    decimals: 2 },
};

function fmtCur(amount, currency) {
  const m   = CUR_META[currency] ?? { symbol: currency, decimals: 2 };
  const n   = Number(amount);
  const str = m.decimals === 0
    ? new Intl.NumberFormat('fr-FR').format(Math.round(n))
    : n.toFixed(m.decimals).replace('.', ',');
  return `${str} ${m.symbol}`;
}

function RentTab({ db, user, wallet, profile, onSuccess }) {
  const [step,         setStep]        = useState('scan');
  const [qrCode,       setQrCode]      = useState('');
  const [pbData,       setPbData]      = useState(null);
  const [payMethod,    setPayMethod]   = useState('wallet');
  const [devise,       setDevise]      = useState(() => profile?.currency ?? 'XOF');
  const [rates,        setRates]       = useState(RATES_FALLBACK);
  const [ratesLoading, setRatesLoading]= useState(false);
  const [loading,      setLoading]     = useState(false);
  const [error,        setError]       = useState('');
  const [rental,       setRental]      = useState(null);

  const normWalletLocal  = Object.fromEntries(Object.entries(wallet).map(([k, v]) => [k, toNum(v)]));
  const availableDevises = Object.keys(normWalletLocal).filter(k => CUR_META[k]);

  useEffect(() => {
    setRatesLoading(true);
    fetch('https://api.exchangerate-api.com/v4/latest/XOF')
      .then(r => r.json())
      .then(data => {
        if (data?.rates) setRates({ XOF: 1, GHS: data.rates['GHS'] ?? RATES_FALLBACK.GHS, NGN: data.rates['NGN'] ?? RATES_FALLBACK.NGN });
      })
      .catch(() => {})
      .finally(() => setRatesLoading(false));
  }, []);

  const fraisDevise      = convertFromXof(FRAIS_XOF,              devise, rates);
  const cautionDevise    = convertFromXof(CAUTION_XOF,            devise, rates);
  const totalDevise      = convertFromXof(FRAIS_XOF + CAUTION_XOF, devise, rates);
  const soldeDevise      = normWalletLocal[devise] ?? 0;
  const soldeInsuffisant = soldeDevise < totalDevise;

  const lookup = async () => {
    const id = qrCode.trim().toUpperCase();
    if (!id) { setError('Saisis le code QR du power bank.'); return; }
    setLoading(true); setError('');
    try {
      const q    = query(collection(db, 'powerBanks'), where('qrCode', '==', id));
      const snap = await getDocs(q);
      let docSnap = snap.empty ? null : snap.docs[0];
      if (!docSnap) {
        const byId = await getDoc(doc(db, 'powerBanks', id));
        if (byId.exists()) docSnap = byId;
      }
      if (!docSnap) { setError(`Power bank "${id}" introuvable. Vérifie le code sur l'étiquette.`); setLoading(false); return; }
      const data  = docSnap.data();
      if (data.state !== 'disponible') {
        const labels = { en_location: 'en cours de location', hors_service: 'hors service' };
        setError(`Ce power bank est ${labels[data.state] ?? data.state}.`); setLoading(false); return;
      }
      setPbData({ ...data, docId: docSnap.id });
      setStep('confirm');
    } catch (e) { setError('Erreur réseau : ' + e.message); }
    setLoading(false);
  };

  const confirmRent = async () => {
    setLoading(true); setError('');
    try {
      if (payMethod === 'wallet') {
        if (soldeInsuffisant) { setError(`Solde ${devise} insuffisant. Requis : ${fmtCur(totalDevise, devise)} · Solde : ${fmtCur(soldeDevise, devise)}`); setLoading(false); return; }

        const rentalRef = await addDoc(collection(db, 'rentals'), {
          userId: user.uid, qrCode: pbData.qrCode || pbData.docId,
          partnerId: pbData.currentPartnerId || null, status: 'en_cours',
          paymentMethod: 'wallet', fraisXof: FRAIS_XOF, cautionXof: CAUTION_XOF,
          fraisDevise, cautionDevise, devise, startTime: serverTimestamp(),
        });

        await updateDoc(doc(db, 'users', user.uid), { [`wallet.${devise}`]: increment(-totalDevise) });

        const escrowRef  = doc(db, 'users', ESCROW_UID);
        const escrowSnap = await getDoc(escrowRef);
        const escrowData = escrowSnap.exists() ? escrowSnap.data() : {};
        const oldTotal   = (escrowData.totalCaution && typeof escrowData.totalCaution === 'object') ? escrowData.totalCaution : {};
        const oldFrais   = (escrowData.totalFrais   && typeof escrowData.totalFrais   === 'object') ? escrowData.totalFrais   : {};
        const newTotal   = { XOF: toNum(oldTotal.XOF), GHS: toNum(oldTotal.GHS), NGN: toNum(oldTotal.NGN), [devise]: toNum(oldTotal[devise]) + cautionDevise };
        const newFrais   = { XOF: toNum(oldFrais.XOF), GHS: toNum(oldFrais.GHS), NGN: toNum(oldFrais.NGN), [devise]: toNum(oldFrais[devise]) + fraisDevise };
        await setDoc(escrowRef, { totalCaution: newTotal, totalFrais: newFrais, updatedAt: serverTimestamp() }, { merge: true });

        await updateDoc(doc(db, 'powerBanks', pbData.docId), { state: 'en_location', currentUserId: user.uid, updatedAt: serverTimestamp() });

        await writeTranstet(db, { type: 'rental', currency: devise, montantEnvoye: fraisDevise, frais: 0, expediteurId: user.uid, expediteurEmail: user.email || '', expediteurPhoto: profile?.photoUrl || '', destinataireId: pbData.currentPartnerId || 'fritok-system', destinataireNom: pbData.currentPartnerId ? 'Partenaire Fritok' : 'Fritok', status: 'completed' });
        await writeTranstet(db, { type: 'caution', currency: devise, montantEnvoye: cautionDevise, frais: 0, expediteurId: user.uid, expediteurEmail: user.email || '', expediteurPhoto: profile?.photoUrl || '', destinataireId: ESCROW_UID, destinataireNom: 'FriTok Escrow', destinataireTel: '+2250716585294', status: 'completed' });
        await writeTranstet(db, { type: 'restitution', currency: devise, montantEnvoye: cautionDevise, frais: 0, expediteurId: ESCROW_UID, expediteurEmail: 'escrow@fritok.app', destinataireId: user.uid, destinataireNom: profile?.username || user.email || '', destinataireTel: profile?.phone || '', status: 'pending' });

        setRental({ id: rentalRef.id, qrCode: pbData.qrCode || pbData.docId, fraisXof: FRAIS_XOF, cautionXof: CAUTION_XOF, fraisDevise, cautionDevise, devise, paymentMethod: 'wallet', batteryLevel: pbData.batteryLevel });
        setStep('done');
      } else {
        const result = await createFlutterwaveRentalPayment({ powerBankId: pbData.qrCode || pbData.docId, powerBankDocId: pbData.docId, partnerStartId: pbData.currentPartnerId || '', amountXof: FRAIS_XOF, cautionXof: CAUTION_XOF, devise, amountDevise: fraisDevise, cautionDevise });
        window.location.href = result.payment_url;
        return;
      }
    } catch (e) { setError(e.message || 'Erreur lors du paiement.'); }
    setLoading(false);
  };

  if (step === 'done') return <PaySuccess rental={rental} onHome={onSuccess} />;

  return (
    <div style={{ padding: 24 }}>
      <div style={{ fontSize: 20, fontWeight: 800, color: D.text1, marginBottom: 20 }}>📷 Louer un power bank</div>
      {step === 'scan' && (
        <QrScanStep qrCode={qrCode} setQrCode={setQrCode} onLookup={lookup} loading={loading} error={error} setError={setError} />
      )}
      {step === 'confirm' && pbData && (
        <>
          <div style={{ background: D.surface, borderRadius: 16, padding: 20, border: `1px solid ${D.border}`, marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: D.green, letterSpacing: 1, marginBottom: 12, fontWeight: 700 }}>✓ POWER BANK TROUVÉ</div>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 800, color: D.text1 }}>{pbData.qrCode || pbData.docId}</div>
                {pbData.currentPartnerId && <div style={{ fontSize: 11, color: D.text3, marginTop: 4 }}>Partenaire : {pbData.currentPartnerId.slice(0, 10)}…</div>}
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 22 }}>{batteryIcon(pbData.batteryLevel)}</div>
                <div style={{ fontSize: 13, fontWeight: 800, color: batteryColor(pbData.batteryLevel) }}>{pbData.batteryLevel != null ? `${pbData.batteryLevel}%` : '–'}</div>
              </div>
            </div>
            {pbData.batteryLevel != null && (
              <div style={{ height: 6, background: '#F0E6DA', borderRadius: 99, marginBottom: 16, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pbData.batteryLevel}%`, background: batteryColor(pbData.batteryLevel), borderRadius: 99, transition: 'width 0.4s' }} />
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <AmountChip label="Frais" amount={FRAIS_XOF} />
              <AmountChip label="Caution (remb.)" amount={CAUTION_XOF} amber />
            </div>
          </div>

          {availableDevises.length > 1 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: D.text2, fontWeight: 700, marginBottom: 10 }}>Devise de paiement</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {availableDevises.map(d => {
                  const solde     = normWalletLocal[d] ?? 0;
                  const totalD    = convertFromXof(FRAIS_XOF + CAUTION_XOF, d, rates);
                  const suffisant = solde >= totalD;
                  const selected  = devise === d;
                  return (
                    <button key={d} onClick={() => setDevise(d)} style={{ flex: 1, padding: '12px 8px', borderRadius: 12, cursor: 'pointer', textAlign: 'center', border: `2px solid ${selected ? D.orange : suffisant ? D.border : D.red + '44'}`, background: selected ? D.orangeDim : D.surface }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: selected ? D.orange : D.text1 }}>{d}</div>
                      <div style={{ fontSize: 11, color: suffisant ? D.green : D.red, fontWeight: 600, marginTop: 2 }}>{fmtCur(solde, d)}</div>
                      <div style={{ fontSize: 10, color: D.text3, marginTop: 1 }}>{suffisant ? '✓ suffisant' : '✗ insuffisant'}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div style={{ background: D.surface, borderRadius: 14, border: `1px solid ${D.border}`, padding: '14px 16px', marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: D.text3, fontWeight: 700, letterSpacing: 1.2, marginBottom: 12 }}>
              TOTAL À PAYER {devise !== 'XOF' && <span style={{ color: D.orange }}>· Converti en {devise}</span>}
              {ratesLoading && <span style={{ color: D.text3, fontWeight: 400, marginLeft: 6 }}>⟳ taux…</span>}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 13, color: D.text2 }}>Frais de location</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: D.text1 }}>{fmtCur(fraisDevise, devise)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 13, color: D.text2 }}>Caution (remboursable)</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: D.amber }}>{fmtCur(cautionDevise, devise)}</span>
            </div>
            <div style={{ height: 1, background: D.border, marginBottom: 10 }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: D.text1 }}>Total</span>
              <span style={{ fontSize: 20, fontWeight: 800, color: D.orange }}>{fmtCur(totalDevise, devise)}</span>
            </div>
            {devise !== 'XOF' && <div style={{ fontSize: 11, color: D.text3, marginTop: 6, textAlign: 'right' }}>= {fmt(FRAIS_XOF + CAUTION_XOF)} FCFA · taux 1 XOF = {(rates[devise] ?? 1).toFixed(4)} {devise}</div>}
            <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 8, background: soldeInsuffisant ? '#FEE2E2' : D.greenLight }}>
              <div style={{ fontSize: 12, color: soldeInsuffisant ? D.red : D.green, fontWeight: 600 }}>
                {soldeInsuffisant ? `⚠️ Solde ${devise} insuffisant — manque ${fmtCur(totalDevise - soldeDevise, devise)}` : `✓ Solde après paiement : ${fmtCur(soldeDevise - totalDevise, devise)}`}
              </div>
            </div>
          </div>

          <div style={{ fontSize: 13, color: D.text2, fontWeight: 700, marginBottom: 10 }}>Méthode de paiement</div>
          {['wallet', 'flutterwave'].map(m => (
            <button key={m} onClick={() => setPayMethod(m)} style={{ width: '100%', padding: '13px 16px', marginBottom: 10, background: payMethod === m ? D.orangeDim : D.surface, border: `1.5px solid ${payMethod === m ? D.orange : D.border}`, borderRadius: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, fontSize: 14, fontWeight: payMethod === m ? 700 : 400, color: D.text1 }}>
              <span style={{ fontSize: 22 }}>{m === 'wallet' ? '👛' : '💳'}</span>
              <div style={{ textAlign: 'left' }}>
                <div>{m === 'wallet' ? `Wallet Fritok (${devise})` : 'Flutterwave'}</div>
                {m === 'wallet' && <div style={{ fontSize: 11, color: soldeInsuffisant ? D.red : D.text3, marginTop: 1, fontWeight: soldeInsuffisant ? 700 : 400 }}>Solde : {fmtCur(soldeDevise, devise)}{soldeInsuffisant ? ' — insuffisant' : ''}</div>}
                {m === 'flutterwave' && <div style={{ fontSize: 11, color: D.text3, marginTop: 1 }}>Carte, Mobile Money…</div>}
              </div>
              {payMethod === m && <span style={{ marginLeft: 'auto', color: D.orange, fontSize: 16 }}>✓</span>}
            </button>
          ))}

          {error && <div style={{ fontSize: 12, color: D.red, marginBottom: 12, padding: '10px 14px', background: '#FEE2E2', borderRadius: 10 }}>{error}</div>}
          <button onClick={confirmRent} disabled={loading || (payMethod === 'wallet' && soldeInsuffisant)} style={primaryBtn(loading || (payMethod === 'wallet' && soldeInsuffisant))}>
            {loading ? <Spinner /> : `Payer ${fmtCur(totalDevise, devise)}`}
          </button>
          <button onClick={() => { setStep('scan'); setError(''); setPbData(null); }} style={ghostBtn}>Annuler</button>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  ReturnTab
// ─────────────────────────────────────────────────────────────────────────────
function ReturnTab({ db, user, activeRentals, profile, onSuccess }) {
  const [selected,     setSelected]     = useState(null);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState('');
  const [done,         setDone]         = useState(false);
  const [refund,       setRefund]       = useState(0);
  const [refundDevise, setRefundDevise] = useState('XOF');

  const doReturn = async () => {
    if (!selected) return;
    const r          = activeRentals.find(x => x.id === selected);
    const caution    = r.cautionXof    ?? CAUTION_XOF;
    const cautionDev = r.cautionDevise ?? caution;
    const devise     = r.devise        ?? 'XOF';
    setLoading(true); setError('');
    try {
      await updateDoc(doc(db, 'rentals', r.id), { status: 'restitue', endTime: serverTimestamp() });
      await updateDoc(doc(db, 'users', user.uid), { [`wallet.${devise}`]: increment(cautionDev) });

      const escrowRef2  = doc(db, 'users', ESCROW_UID);
      const escrowSnap2 = await getDoc(escrowRef2);
      const escrowData2 = escrowSnap2.exists() ? escrowSnap2.data() : {};
      const oldTotal2   = (escrowData2.totalCaution && typeof escrowData2.totalCaution === 'object') ? escrowData2.totalCaution : {};
      const newTotal2   = { XOF: toNum(oldTotal2.XOF), GHS: toNum(oldTotal2.GHS), NGN: toNum(oldTotal2.NGN), [devise]: Math.max(0, toNum(oldTotal2[devise]) - cautionDev) };
      await setDoc(escrowRef2, { totalCaution: newTotal2, updatedAt: serverTimestamp() }, { merge: true });

      if (r.qrCode) {
        const qSnap = await getDocs(query(collection(db, 'powerBanks'), where('qrCode', '==', r.qrCode)));
        const pbRef = qSnap.empty ? doc(db, 'powerBanks', r.qrCode) : qSnap.docs[0].ref;
        await updateDoc(pbRef, { state: 'disponible', currentUserId: '', updatedAt: serverTimestamp() });
      }

      const pendingSnap = await getDocs(query(collection(db, 'TransfetMoney'), where('type', '==', 'restitution'), where('destinataireId', '==', user.uid), where('status', '==', 'pending'), orderBy('timestamp', 'desc'), limit(1)));
      if (!pendingSnap.empty) {
        await updateDoc(pendingSnap.docs[0].ref, { status: 'completed' });
      } else {
        await writeTranstet(db, { type: 'restitution', currency: devise, montantEnvoye: cautionDev, frais: 0, expediteurId: ESCROW_UID, expediteurEmail: 'escrow@fritok.app', destinataireId: user.uid, destinataireNom: profile?.username || user.email || '', destinataireTel: profile?.phone || '', status: 'completed' });
      }

      setRefund(cautionDev); setRefundDevise(devise); setDone(true);
    } catch (e) { setError(e.message || 'Erreur lors de la restitution.'); }
    setLoading(false);
  };

  if (activeRentals.length === 0) return (
    <div style={{ padding: 24, textAlign: 'center', paddingTop: 80 }}>
      <div style={{ fontSize: 52, marginBottom: 16 }}>🔋</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: D.text1, marginBottom: 8 }}>Aucune location active</div>
      <div style={{ fontSize: 13, color: D.text2 }}>Loue un power bank depuis l'onglet ⚡</div>
    </div>
  );

  if (done) return (
    <div style={{ padding: 24, textAlign: 'center', paddingTop: 60 }}>
      <div style={{ width: 90, height: 90, borderRadius: '50%', background: D.greenLight, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40, margin: '0 auto 20px' }}>✓</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: D.text1, marginBottom: 8 }}>Power bank rendu !</div>
      <div style={{ fontSize: 14, color: D.text2, marginBottom: 24 }}>Ta caution de <strong style={{ color: D.green }}>{fmtCur(refund, refundDevise)}</strong> a été remboursée sur ton wallet.</div>
      <button onClick={onSuccess} style={primaryBtn(false)}>Retour à l'accueil</button>
    </div>
  );

  return (
    <div style={{ padding: 24 }}>
      <div style={{ fontSize: 20, fontWeight: 800, color: D.text1, marginBottom: 20 }}>↩️ Rendre un power bank</div>
      <div style={{ fontSize: 13, color: D.text2, fontWeight: 700, marginBottom: 10 }}>Sélectionne la location à terminer</div>
      {activeRentals.map(r => (
        <button key={r.id} onClick={() => setSelected(r.id)} style={{ width: '100%', padding: 16, marginBottom: 10, textAlign: 'left', background: selected === r.id ? D.orangeDim : D.surface, border: `1.5px solid ${selected === r.id ? D.orange : D.border}`, borderRadius: 14, cursor: 'pointer' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: D.text1 }}>{r.qrCode}</div>
            {selected === r.id && <span style={{ color: D.orange, fontWeight: 700 }}>✓</span>}
          </div>
          <div style={{ fontSize: 12, color: D.text2, marginTop: 4 }}>Démarré {fmtDate(r.startTime)} · {elapsed(r.startTime)}</div>
          <div style={{ fontSize: 12, color: D.amber, marginTop: 2, fontWeight: 600 }}>Caution : {fmt(r.cautionXof ?? CAUTION_XOF)} FCFA</div>
        </button>
      ))}
      {selected && (
        <>
          <div style={{ margin: '12px 0', padding: 14, background: D.greenLight, borderRadius: 12, fontSize: 13, color: D.green, fontWeight: 500 }}>
            💚 Ta caution de <strong>{fmt(activeRentals.find(r => r.id === selected)?.cautionXof ?? CAUTION_XOF)} FCFA</strong> sera remboursée immédiatement.
          </div>
          {error && <div style={{ fontSize: 12, color: D.red, marginBottom: 10, padding: '10px 14px', background: '#FEE2E2', borderRadius: 10 }}>{error}</div>}
          <button onClick={doReturn} disabled={loading} style={primaryBtn(loading)}>
            {loading ? <Spinner /> : 'Confirmer la restitution'}
          </button>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  HistoryTab
// ─────────────────────────────────────────────────────────────────────────────
const TX_META = {
  rental     : { icon: '🔋', label: 'Location' },
  caution    : { icon: '🔒', label: 'Caution bloquée' },
  restitution: { icon: '↩️', label: 'Caution remboursée' },
  topup      : { icon: '💳', label: 'Recharge wallet' },
  transfer   : { icon: '↗️', label: 'Transfert' },
};

function HistoryTab({ txHistory }) {
  const [filter, setFilter] = useState('tous');
  const filters = [
    { key: 'tous',        label: 'Tout' },
    { key: 'rental',      label: '🔋 Locations' },
    { key: 'restitution', label: '↩️ Remboursements' },
    { key: 'topup',       label: '💳 Recharges' },
  ];
  const filtered = filter === 'tous' ? txHistory : txHistory.filter(tx => tx.type === filter);

  return (
    <div style={{ padding: '24px 0 0' }}>
      <div style={{ padding: '0 24px 12px', fontSize: 20, fontWeight: 800, color: D.text1 }}>Historique</div>
      <div style={{ display: 'flex', gap: 8, padding: '0 24px 16px', overflowX: 'auto' }}>
        {filters.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)} style={{ padding: '5px 14px', borderRadius: 99, whiteSpace: 'nowrap', cursor: 'pointer', border: `1px solid ${filter === f.key ? D.orange : D.border}`, background: filter === f.key ? D.orangeDim : D.surface, color: filter === f.key ? D.orange : D.text2, fontWeight: filter === f.key ? 700 : 400, fontSize: 12 }}>{f.label}</button>
        ))}
      </div>
      {filtered.length === 0
        ? <div style={{ textAlign: 'center', padding: '60px 24px', color: D.text2, fontSize: 13 }}><div style={{ fontSize: 40, marginBottom: 12 }}>🧾</div>Aucune transaction</div>
        : filtered.map(tx => <TxRow key={tx.id} tx={tx} />)
      }
    </div>
  );
}

function TxRow({ tx }) {
  const meta   = TX_META[tx.type] ?? TX_META.transfer;
  const isIn   = tx._dir === 'in' || tx.type === 'restitution' || tx.type === 'topup';
  const isPend = tx.status === 'pending';
  const amount = isIn ? `+${fmtCur(tx.montantRecu ?? tx.montantEnvoye, tx.currency)}` : `-${fmtCur(tx.montantEnvoye, tx.currency)}`;
  const color  = isPend ? D.text3 : (isIn ? D.green : D.text2);
  const fmtTs  = (ts) => {
    if (!ts) return '–';
    const d = new Date(typeof ts === 'number' ? ts : ts?.toDate?.() ?? ts);
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  };
  return (
    <div style={{ padding: '14px 24px', borderBottom: `0.5px solid ${D.border}`, display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{ width: 42, height: 42, borderRadius: 12, flexShrink: 0, background: isPend ? '#F5F5F5' : (isIn ? D.greenLight : D.orangeDim), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>{meta.icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: D.text1 }}>{meta.label}</div>
          {isPend && <div style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: D.amberLight, color: D.amber }}>EN ATTENTE</div>}
        </div>
        <div style={{ fontSize: 11, color: D.text2, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.destinataireNom || tx.expediteurId} · {fmtTs(tx.timestamp)}</div>
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, color, flexShrink: 0 }}>
        {amount}
        {isPend && <div style={{ fontSize: 10, color: D.text3, textAlign: 'right', fontWeight: 400 }}>pending</div>}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  PaySuccess
// ─────────────────────────────────────────────────────────────────────────────
function PaySuccess({ rental, onHome }) {
  const isFlw = rental?.paymentMethod === 'flutterwave';
  return (
    <div style={{ padding: 24, textAlign: 'center', paddingTop: 60 }}>
      <div style={{ width: 100, height: 100, borderRadius: '50%', background: D.greenLight, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 48, margin: '0 auto 24px' }}>✓</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: D.text1, marginBottom: 8 }}>Paiement réussi !</div>
      <div style={{ fontSize: 14, color: D.text2, marginBottom: 6 }}>Le commerçant va te remettre le power bank</div>
      {rental?.qrCode && <div style={{ fontSize: 15, color: D.orange, fontWeight: 800, letterSpacing: 0.8, marginBottom: 6 }}>{rental.qrCode}</div>}
      {rental?.batteryLevel != null && <div style={{ fontSize: 13, color: batteryColor(rental.batteryLevel), fontWeight: 600, marginBottom: 10 }}>{batteryIcon(rental.batteryLevel)} {rental.batteryLevel}%</div>}
      <div style={{ display: 'inline-block', padding: '4px 14px', borderRadius: 20, background: isFlw ? '#F5A62315' : D.orangeDim, fontSize: 11, fontWeight: 700, color: isFlw ? '#D4891F' : D.orange, marginBottom: 28 }}>
        {isFlw ? 'Payé via Flutterwave' : 'Payé via Wallet Fritok'}
      </div>
      <div style={{ background: D.surface, borderRadius: 16, padding: 20, border: `1px solid ${D.border}`, textAlign: 'left', marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: D.text3, letterSpacing: 1.5, marginBottom: 14, fontWeight: 700 }}>RÉCAPITULATIF</div>
        <RecapRow label="Location payée"     value={`${fmt(rental?.fraisXof   ?? FRAIS_XOF)} FCFA`} />
        <RecapRow label="Caution en attente" value={`${fmt(rental?.cautionXof ?? CAUTION_XOF)} FCFA`} valueColor={D.amber} />
      </div>
      <div style={{ background: D.amberLight, borderRadius: 12, padding: 14, display: 'flex', gap: 10, alignItems: 'flex-start', textAlign: 'left', marginBottom: 24 }}>
        <span>⏱️</span>
        <div style={{ fontSize: 12, color: D.amber }}>Rappel dans 45 min — Restitue avant 1h pour récupérer ta caution.</div>
      </div>
      <button onClick={onHome} style={primaryBtn(false)}>Retour à l'accueil</button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  ProfileTab
// ─────────────────────────────────────────────────────────────────────────────
function ProfileTab({ profile, user, onSignOut, onNav }) {
  const kycLabel = {
    pending : { text: 'Vérification en attente', color: D.amber, bg: D.amberLight, icon: '⏳' },
    verified: { text: 'Compte vérifié',          color: D.green, bg: D.greenLight,  icon: '✅' },
    rejected: { text: 'Vérification refusée',    color: D.red,   bg: '#FEE2E2',     icon: '❌' },
  };
  const kyc       = kycLabel[profile?.kyc_status] ?? kycLabel.pending;
  const levelColors = { bronze: '#CD7F32', silver: '#9E9E9E', gold: D.zest };
  const lvlColor    = levelColors[profile?.level] ?? levelColors.bronze;
  const isVendeur   = profile?.role === 'Vendeur';
  const walletEntries = Object.entries(profile?.wallet ?? {})
    .map(([k, v]) => [k, toNum(v)])
    .sort(([a], [b]) => a === profile?.currency ? -1 : b === profile?.currency ? 1 : 0);

  return (
    <div style={{ padding: '24px 24px 48px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          {profile?.photoUrl
            ? <img src={profile.photoUrl} alt="avatar" style={{ width: 72, height: 72, borderRadius: '50%', objectFit: 'cover', border: `3px solid ${D.border}` }} />
            : <div style={{ width: 72, height: 72, borderRadius: '50%', background: D.orangeDim, border: `3px solid ${D.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, fontWeight: 800, color: D.orange }}>{profile?.username?.charAt(0)?.toUpperCase() || '?'}</div>
          }
          {profile?.level && <div style={{ position: 'absolute', bottom: -4, right: -4, background: lvlColor, color: '#fff', fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 99, border: '2px solid #fff', textTransform: 'uppercase' }}>{profile.level}</div>}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: D.text1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profile?.username || profile?.nomBoutique || '–'}</div>
          <div style={{ fontSize: 13, color: D.text2, marginTop: 2 }}>{profile?.email || user?.email}</div>
          {profile?.phone && <div style={{ fontSize: 12, color: D.text3, marginTop: 2 }}>{profile.phone}</div>}
        </div>
      </div>

      {profile?.points != null && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
          <div style={{ background: D.surface, border: `1px solid ${D.border}`, borderRadius: 12, padding: '12px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: lvlColor }}>{profile.points}</div>
            <div style={{ fontSize: 11, color: D.text3, marginTop: 2 }}>Points</div>
          </div>
          <div style={{ background: D.surface, border: `1px solid ${D.border}`, borderRadius: 12, padding: '12px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: lvlColor, textTransform: 'capitalize' }}>{profile.level ?? 'bronze'}</div>
            <div style={{ fontSize: 11, color: D.text3, marginTop: 2 }}>Niveau</div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderRadius: 12, background: kyc.bg, marginBottom: 16 }}>
        <span style={{ fontSize: 20 }}>{kyc.icon}</span>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: kyc.color }}>{kyc.text}</div>
          <div style={{ fontSize: 11, color: kyc.color, opacity: 0.75 }}>kyc_status : {profile?.kyc_status ?? 'pending'}</div>
        </div>
      </div>

      <div style={{ fontSize: 11, color: D.text3, letterSpacing: 1.5, fontWeight: 700, marginBottom: 10 }}>WALLET</div>
      <div style={{ background: D.surface, borderRadius: 16, border: `1px solid ${D.border}`, overflow: 'hidden', marginBottom: 16 }}>
        {walletEntries.length === 0
          ? <div style={{ padding: '14px 16px', fontSize: 13, color: D.text3 }}>Wallet vide</div>
          : walletEntries.map(([cur, amt], i) => (
            <div key={cur} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: i < walletEntries.length - 1 ? `0.5px solid ${D.border}` : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: cur === profile?.currency ? D.orange : D.text2, background: cur === profile?.currency ? D.orangeDim : '#F5F5F5', padding: '3px 9px', borderRadius: 6 }}>{cur}</div>
                {cur === profile?.currency && <div style={{ fontSize: 10, color: D.orange }}>devise préférée</div>}
              </div>
              <div style={{ fontSize: 16, fontWeight: 800, color: amt > 0 ? D.text1 : D.text3 }}>{fmt(amt)} <span style={{ fontSize: 11, fontWeight: 500 }}>{cur}</span></div>
            </div>
          ))
        }
      </div>

      <div style={{ fontSize: 11, color: D.text3, letterSpacing: 1.5, fontWeight: 700, marginBottom: 10 }}>COMPTE</div>
      <div style={{ background: D.surface, borderRadius: 16, border: `1px solid ${D.border}`, overflow: 'hidden', marginBottom: 16 }}>
        <InfoRow label="Rôle"          value={profile?.role ?? '–'} />
        <InfoRow label="Devise"        value={profile?.currency ?? 'XOF'} />
        {profile?.adresse  && <InfoRow label="Adresse"      value={profile.adresse} />}
        {profile?.location?.address && <InfoRow label="Localisation" value={profile.location.address} />}
        <InfoRow label="Membre depuis" value={fmtDateLong(profile?.createdAt)} last={!isVendeur} />
        {isVendeur && profile?.nomBoutique && <InfoRow label="Boutique"    value={profile.nomBoutique} />}
        {isVendeur && profile?.id_boutique && <InfoRow label="ID Boutique" value={profile.id_boutique} last />}
      </div>

      <button onClick={() => { if (typeof window !== 'undefined') window.location.href = '/wallet/topup'; }} style={{ width: '100%', padding: '14px 0', background: D.orange, color: '#fff', border: 'none', borderRadius: 14, cursor: 'pointer', fontSize: 15, fontWeight: 700, marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        💳 Recharger mon wallet
      </button>
      <button onClick={() => onNav('history')} style={{ width: '100%', padding: '13px 0', background: D.surface, color: D.text1, border: `1px solid ${D.border}`, borderRadius: 14, cursor: 'pointer', fontSize: 14, fontWeight: 600, marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        📋 Historique des locations
      </button>
      <button onClick={onSignOut} style={{ width: '100%', padding: '14px 0', background: '#FEE2E2', color: D.red, border: 'none', borderRadius: 14, cursor: 'pointer', fontSize: 15, fontWeight: 700 }}>
        Se déconnecter
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  QrScanStep
// ─────────────────────────────────────────────────────────────────────────────
function QrScanStep({ qrCode, setQrCode, onLookup, loading, error, setError }) {
  const [cameraOn, setCameraOn] = useState(false);
  const [camError, setCamError] = useState('');
  const scannerRef = useRef(null);

  const startCamera = async () => {
    setCamError('');
    try {
      const { Html5Qrcode } = await import('html5-qrcode');
      const scanner = new Html5Qrcode('fritok-qr-reader');
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        (decoded) => { const code = decoded.trim().toUpperCase(); setQrCode(code); stopCamera(); setTimeout(onLookup, 150); },
        () => {},
      );
      setCameraOn(true);
    } catch (e) {
      setCamError(e.name === 'NotAllowedError' ? 'Permission caméra refusée. Autorise-la dans les paramètres du navigateur.' : 'Caméra indisponible. Utilise la saisie manuelle ci-dessous.');
    }
  };

  const stopCamera = () => {
    if (scannerRef.current) { scannerRef.current.stop().catch(() => {}); scannerRef.current = null; }
    setCameraOn(false);
  };

  useEffect(() => () => stopCamera(), []);

  return (
    <>
      <div style={{ borderRadius: 16, overflow: 'hidden', marginBottom: 16, background: '#111', position: 'relative' }}>
        <div id="fritok-qr-reader" style={{ width: '100%', display: cameraOn ? 'block' : 'none', minHeight: 280 }} />
        {!cameraOn && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 220, padding: 24, position: 'relative' }}>
            {[['top','left'],['top','right'],['bottom','left'],['bottom','right']].map(([v, h]) => (
              <div key={v+h} style={{ position: 'absolute', [v]: 18, [h]: 18, width: 30, height: 30, borderTop: v === 'top' ? `3px solid ${D.orange}` : 'none', borderBottom: v === 'bottom' ? `3px solid ${D.orange}` : 'none', borderLeft: h === 'left' ? `3px solid ${D.orange}` : 'none', borderRight: h === 'right' ? `3px solid ${D.orange}` : 'none' }} />
            ))}
            <div style={{ fontSize: 44, marginBottom: 10 }}>📷</div>
            <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14, fontWeight: 600, textAlign: 'center' }}>Scanner le QR code</div>
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, marginTop: 4 }}>sur le sticker du power bank</div>
            <button onClick={startCamera} style={{ marginTop: 18, padding: '10px 28px', background: D.orange, color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>📸 Activer la caméra</button>
          </div>
        )}
        {cameraOn && <button onClick={stopCamera} style={{ position: 'absolute', top: 10, right: 10, zIndex: 20, background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 14px', fontSize: 13, cursor: 'pointer', fontWeight: 700 }}>✕ Stop</button>}
      </div>
      {camError && <div style={{ fontSize: 12, color: D.amber, background: D.amberLight, padding: '10px 14px', borderRadius: 10, marginBottom: 12 }}>⚠️ {camError}</div>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '12px 0 14px' }}>
        <div style={{ flex: 1, height: 1, background: D.border }} />
        <div style={{ fontSize: 11, color: D.text3, fontWeight: 700, whiteSpace: 'nowrap' }}>OU SAISIR MANUELLEMENT</div>
        <div style={{ flex: 1, height: 1, background: D.border }} />
      </div>
      <input placeholder="Ex : PB-ABJ-000193" value={qrCode} onChange={e => { setQrCode(e.target.value.toUpperCase()); setError(''); }} onKeyDown={e => e.key === 'Enter' && onLookup()} style={{ ...inputStyle, textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.8, marginBottom: 12 }} />
      {error && <div style={{ fontSize: 12, color: D.red, marginBottom: 10, padding: '10px 14px', background: '#FEE2E2', borderRadius: 10 }}>{error}</div>}
      <button onClick={onLookup} disabled={loading} style={primaryBtn(loading)}>{loading ? <Spinner /> : '🔍 Rechercher'}</button>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Petits composants partagés
// ─────────────────────────────────────────────────────────────────────────────
function QuickBtn({ icon, label, sub, primary, onClick }) {
  return (
    <button onClick={onClick} style={{ width: '100%', padding: 14, background: primary ? D.orangeDim : D.surface, border: `1px solid ${primary ? D.orange + '55' : D.border}`, borderRadius: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', boxShadow: primary ? `0 4px 14px ${D.orange}18` : 'none' }}>
      <span style={{ fontSize: primary ? 26 : 22 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: primary ? 15 : 13, fontWeight: 700, color: D.text1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</div>
        <div style={{ fontSize: 11, color: D.text2, marginTop: 1 }}>{sub}</div>
      </div>
      {primary && <div style={{ width: 30, height: 30, borderRadius: '50%', background: D.orange, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 14, flexShrink: 0 }}>→</div>}
    </button>
  );
}

function HistoryRow({ rental }) {
  const isReturn = rental.status === 'restitue';
  const isFlw    = rental.paymentMethod === 'flutterwave';
  const amount   = isReturn ? `+${fmt(rental.cautionXof ?? CAUTION_XOF)} FCFA` : `-${fmt(rental.fraisXof ?? FRAIS_XOF)} FCFA`;
  return (
    <div style={{ padding: '14px 24px', borderBottom: `0.5px solid ${D.border}`, display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{ width: 40, height: 40, borderRadius: 10, background: isReturn ? D.greenLight : D.orangeDim, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>{isReturn ? '↩️' : '🔋'}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: D.text1 }}>{isReturn ? 'Restitution' : 'Location'}</div>
          <div style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: isFlw ? '#F5A62320' : D.orangeDim, color: isFlw ? '#D4891F' : D.orange }}>{isFlw ? 'FLW' : 'Wallet'}</div>
        </div>
        <div style={{ fontSize: 11, color: D.text2, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rental.qrCode} · {fmtDate(rental.startTime)}</div>
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, color: isReturn ? D.green : D.text2, flexShrink: 0 }}>{amount}</div>
    </div>
  );
}

function AmountChip({ label, amount, amber }) {
  return (
    <div style={{ background: amber ? D.amberLight : D.orangeDim, borderRadius: 10, padding: '10px 12px' }}>
      <div style={{ fontSize: 10, color: amber ? D.amber : D.text3, fontWeight: 700, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: amber ? D.amber : D.orange }}>{fmt(amount)} <span style={{ fontSize: 11, fontWeight: 500 }}>FCFA</span></div>
    </div>
  );
}

function RecapRow({ label, value, valueColor }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
      <div style={{ fontSize: 13, color: D.text2 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: valueColor ?? D.text1 }}>{value}</div>
    </div>
  );
}

function InfoRow({ label, value, last }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '13px 16px', borderBottom: last ? 'none' : `0.5px solid ${D.border}` }}>
      <div style={{ fontSize: 13, color: D.text2 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: D.text1, maxWidth: '60%', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>
    </div>
  );
}

function BottomSheet({ onClose, title, children }) {
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100 }} />
      <div style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 480, background: D.surface, borderRadius: '28px 28px 0 0', zIndex: 101, padding: '16px 24px 44px', maxHeight: '72dvh', overflowY: 'auto' }}>
        <div style={{ width: 40, height: 4, borderRadius: 99, background: D.text3, margin: '0 auto 20px' }} />
        <div style={{ fontSize: 16, fontWeight: 700, color: D.text1, marginBottom: 16 }}>{title}</div>
        {children}
      </div>
    </>
  );
}

function BottomNav({ tab, onNav, hasActive, profile }) {
  const items = [
    { key: 'home',    icon: '🏠', label: 'Accueil' },
    { key: 'map',     icon: '🗺️', label: 'Carte' },
    { key: 'rent',    icon: '⚡', label: 'Louer',   primary: true },
    { key: 'return',  icon: '↩️', label: 'Rendre',  badge: hasActive },
    { key: 'history', icon: '📋', label: 'Historique' },
    { key: 'profile', icon: '👤', label: 'Profil',   isAvatar: true },
  ];
  return (
    <div style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 480, background: D.surface, borderTop: `1px solid ${D.border}`, display: 'flex', alignItems: 'center', paddingBottom: 'env(safe-area-inset-bottom)', zIndex: 50 }}>
      {items.map(item => (
        <button key={item.key} onClick={() => onNav(item.key)} style={{ flex: 1, padding: '10px 0 8px', background: item.primary ? (tab === item.key ? D.orange : D.orangeDim) : 'none', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, borderRadius: item.primary ? 14 : 0, margin: item.primary ? '4px 4px' : 0, position: 'relative' }}>
          {item.badge && <div style={{ position: 'absolute', top: 7, right: '22%', width: 8, height: 8, borderRadius: '50%', background: D.amber, border: `2px solid ${D.surface}` }} />}
          {item.isAvatar && profile?.photoUrl
            ? <img src={profile.photoUrl} alt="profil" style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover', border: `2px solid ${tab === 'profile' ? D.orange : D.border}` }} />
            : <span style={{ fontSize: 20, lineHeight: 1 }}>{item.icon}</span>
          }
          <span style={{ fontSize: 10, fontWeight: tab === item.key ? 700 : 400, color: item.primary ? (tab === item.key ? '#fff' : D.orange) : (tab === item.key ? D.orange : D.text3), lineHeight: 1 }}>{item.label}</span>
        </button>
      ))}
    </div>
  );
}

function Spinner() {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span style={{ width: 18, height: 18, border: '2.5px solid rgba(255,255,255,0.3)', borderTop: '2.5px solid #fff', borderRadius: '50%', display: 'inline-block', animation: 'fspin 0.7s linear infinite' }} />
      Chargement…
      <style>{`@keyframes fspin{to{transform:rotate(360deg)}}`}</style>
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Styles constants
// ─────────────────────────────────────────────────────────────────────────────
const inputStyle = {
  width: '100%', padding: '13px 14px', fontSize: 15,
  border: `1.5px solid ${D.border}`, borderRadius: 12,
  background: D.surface, color: D.text1,
  outline: 'none', boxSizing: 'border-box', display: 'block',
  fontFamily: 'inherit',
};

const primaryBtn = (disabled) => ({
  width: '100%', padding: '14px 0', marginTop: 16,
  background: disabled ? D.text3 : D.orange, color: '#fff',
  border: 'none', borderRadius: 14, cursor: disabled ? 'not-allowed' : 'pointer',
  fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontFamily: 'inherit',
});

const ghostBtn = {
  width: '100%', padding: '13px 0', marginTop: 10,
  background: 'none', color: D.text2,
  border: `1px solid ${D.border}`, borderRadius: 14, cursor: 'pointer',
  fontSize: 14, fontFamily: 'inherit',
};