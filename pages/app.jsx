'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth,
  onAuthStateChanged,
  signOut,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  collection,
  addDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  increment,
} from 'firebase/firestore';
import dynamic from 'next/dynamic';

// ─────────────────────────────────────────────────────────────────────────────
//  Firebase config
// ─────────────────────────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey           : process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain       : process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId        : process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket    : process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId            : process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

function getFirebaseApp() {
  if (getApps().length === 0) return initializeApp(firebaseConfig);
  return getApps()[0];
}

// ─────────────────────────────────────────────────────────────────────────────
//  Design tokens
// ─────────────────────────────────────────────────────────────────────────────
const D = {
  bg        : '#FFF8EE',
  surface   : '#FFFFFF',
  border    : '#FFDDB0',
  orange    : '#FF6B00',
  orangeDim : '#FFEDD5',
  zest      : '#FFB700',
  text1     : '#2D1500',
  text2     : '#8B5E3C',
  text3     : '#BF9060',
  green     : '#1A9640',
  greenLight: '#E6F7EC',
  amber     : '#B45309',
  amberLight: '#FEF3C7',
  red       : '#E53E00',
};

// ─────────────────────────────────────────────────────────────────────────────
//  Schéma réel Firestore — powerBanks
//  { batteryLevel: int64, currentPartnerId: string, currentUserId: string,
//    location: GeoPoint, qrCode: string, state: string, updatedAt: Timestamp }
//
//  state values: "disponible" | "en_location" | "hors_service"
//  Document ID  = qrCode (ex: "PB-ABJ-000193")
//
//  Tarifs fixes (pas encore dans Firestore) — à adapter si tu les ajoutes
// ─────────────────────────────────────────────────────────────────────────────
const FRAIS_XOF   = 100;
const CAUTION_XOF = 200;

// ─────────────────────────────────────────────────────────────────────────────
//  Leaflet — SSR disabled
// ─────────────────────────────────────────────────────────────────────────────
const MapView = dynamic(() => import('../components/app/MapView'), { ssr: false });

// ─────────────────────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────────────────────
const fmt = (n) => new Intl.NumberFormat('fr-FR').format(Math.round(n ?? 0));

const fmtDate = (ts) => {
  if (!ts) return '–';
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};

const elapsed = (ts) => {
  if (!ts) return '';
  const d   = ts?.toDate ? ts.toDate() : new Date(ts);
  const sec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (sec < 60)   return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}min`;
  return `${Math.floor(sec / 3600)}h${String(Math.floor((sec % 3600) / 60)).padStart(2, '0')}`;
};

// Couleur batterie
const batteryColor = (level) => {
  if (level == null) return D.text3;
  if (level >= 60)   return D.green;
  if (level >= 30)   return D.amber;
  return D.red;
};

const batteryIcon = (level) => {
  if (level == null) return '🔋';
  if (level >= 60)   return '🔋';
  if (level >= 30)   return '🪫';
  return '🔴';
};

// ─────────────────────────────────────────────────────────────────────────────
//  Main export
// ─────────────────────────────────────────────────────────────────────────────
export default function FritokApp() {
  const router = useRouter();
  const app    = getFirebaseApp();
  const auth   = getAuth(app);
  const db     = getFirestore(app);

  const [user,          setUser]          = useState(null);
  const [loading,       setLoading]       = useState(true);
  const [tab,           setTab]           = useState('home');
  // Profil Firestore — structure register.js :
  // { userId, email, username, phone, role, wallet, currency, photoUrl, kyc_status… }
  const [profile,       setProfile]       = useState(null);
  const [wallet,        setWallet]        = useState({});
  const [currency,      setCurrency]      = useState('XOF');
  const [activeRentals, setActiveRentals] = useState([]);
  const [history,       setHistory]       = useState([]);

  // ── Auth listener : redirige vers /login si non connecté ou email non vérifié
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u || !u.emailVerified) {
        // Pas connecté → /login avec redirect retour vers /app
        router.replace('/login?redirect=' + encodeURIComponent('/app'));
        return;
      }
      setUser(u);
      setLoading(false);
    });
    return unsub;
  }, []);

  // ── Firestore listeners (wallet, profil, rentals) ──────────────────────────
  useEffect(() => {
    if (!user) { setProfile(null); setWallet({}); setActiveRentals([]); setHistory([]); return; }

    // Profil complet — écoute en temps réel pour le wallet
    const unsubUser = onSnapshot(doc(db, 'users', user.uid), (snap) => {
      const data = snap.data();
      if (!data) return;
      setProfile(data);
      if (data.wallet)   setWallet(data.wallet);
      // Utilise la devise préférée sauvée dans le profil (champ "currency" du register.js)
      if (data.currency) setCurrency(data.currency); // devise préférée du profil
    });

    // Rentals actifs
    const activeQ = query(
      collection(db, 'rentals'),
      where('userId', '==', user.uid),
      where('status', '==', 'en_cours'),
      orderBy('startTime', 'desc'),
    );
    const unsubActive = onSnapshot(activeQ, (snap) =>
      setActiveRentals(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    );

    // Historique (30 dernières)
    const histQ = query(
      collection(db, 'rentals'),
      where('userId', '==', user.uid),
      orderBy('startTime', 'desc'),
      limit(30),
    );
    const unsubHist = onSnapshot(histQ, (snap) =>
      setHistory(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    );

    return () => { unsubUser(); unsubActive(); unsubHist(); };
  }, [user]);

  // Pendant le check auth → Splash (le router.replace s'occupe de la redirection)
  if (loading || !user) return <Splash />;

  const balance    = wallet[currency] ?? 0;
  const currencies = Object.keys(wallet); // toutes les devises du wallet

  const handleSignOut = async () => {
    await signOut(auth);
    router.replace('/login?redirect=' + encodeURIComponent('/app'));
  };

  return (
    <div style={{ background: D.bg, minHeight: '100dvh', display: 'flex', flexDirection: 'column', maxWidth: 480, margin: '0 auto', position: 'relative' }}>
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 80 }}>
        {tab === 'home' && (
          <HomeTab
            balance={balance} currency={currency} currencies={currencies}
            onCurrencyChange={setCurrency}
            activeRentals={activeRentals} history={history}
            profile={profile}
            onNav={setTab}
          />
        )}
        {tab === 'map'     && <MapTab     db={db} />}
        {tab === 'rent'    && <RentTab    db={db} user={user} wallet={wallet} onSuccess={() => setTab('home')} />}
        {tab === 'return'  && <ReturnTab  db={db} user={user} activeRentals={activeRentals} onSuccess={() => setTab('home')} />}
        {tab === 'history' && <HistoryTab history={history} />}
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
function HomeTab({ balance, currency, currencies, onCurrencyChange, activeRentals, history, profile, onNav }) {
  return (
    <div style={{ padding: '24px 0 0' }}>
      {/* Greeting */}
      <div style={{ padding: '0 24px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 12, color: D.orange, fontWeight: 700, letterSpacing: 1 }}>Bonjour ✦</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: D.text1, lineHeight: 1.15, marginTop: 4 }}>
              {profile?.username ? `${profile.username.split(' ')[0]},` : 'Ton énergie,'}<br />
              {profile?.username ? 'ton énergie.' : 'partout.'}
            </div>
          </div>
          <button onClick={() => onNav('profile')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0 }}>
            {profile?.photoUrl
              ? <img src={profile.photoUrl} alt="profil" style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', border: `2px solid ${D.border}` }} />
              : <div style={{ width: 44, height: 44, borderRadius: '50%', background: D.orangeDim, border: `2px solid ${D.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>👤</div>
            }
          </button>
        </div>
      </div>

      <WalletCard balance={balance} currency={currency} currencies={currencies}
        activeCount={activeRentals.length} onCurrencyChange={onCurrencyChange} />

      {/* Active rental banner */}
      {activeRentals.length > 0 && (
        <div onClick={() => onNav('return')}
          style={{ margin: '14px 24px 0', padding: 14, background: D.amberLight, borderRadius: 12, border: `0.5px solid ${D.amber}44`, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18 }}>🔋</span>
          <div style={{ flex: 1, fontSize: 13, color: D.amber, fontWeight: 500 }}>
            {activeRentals[0].qrCode} · {elapsed(activeRentals[0].startTime)}
          </div>
          <span style={{ fontSize: 12, color: D.amber }}>→</span>
        </div>
      )}

      {/* Quick actions */}
      <div style={{ padding: '20px 24px 0' }}>
        <QuickBtn icon="📷" label="Louer un power bank" sub="Scanner ou entrer le QR code" primary onClick={() => onNav('rent')} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
          <QuickBtn icon="🗺️" label="Carte" sub="Power banks proches" onClick={() => onNav('map')} />
          <QuickBtn icon="↩️" label="Rendre" sub="Power bank actif" onClick={() => onNav('return')} />
        </div>
      </div>

      {/* History */}
      <div style={{ marginTop: 28, padding: '0 24px 8px', fontSize: 11, letterSpacing: 1.5, color: D.text3, fontWeight: 600 }}>ACTIVITÉ RÉCENTE</div>
      {history.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: D.text2, fontSize: 13 }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>🧾</div>
          Aucune location pour l'instant
        </div>
      ) : (
        history.slice(0, 5).map(r => <HistoryRow key={r.id} rental={r} />)
      )}
      <div style={{ height: 32 }} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  WalletCard
// ─────────────────────────────────────────────────────────────────────────────
function WalletCard({ balance, currency, currencies, activeCount, onCurrencyChange }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div style={{ margin: '0 24px', padding: 20, borderRadius: 24, background: `linear-gradient(135deg, ${D.orange}, ${D.zest})`, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -48, right: -32, width: 130, height: 130, borderRadius: '50%', background: 'rgba(255,255,255,0.10)' }} />
        <div style={{ position: 'absolute', bottom: -24, left: -24, width: 90, height: 90, borderRadius: '50%', background: 'rgba(255,255,255,0.07)' }} />
        <div style={{ position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: 600, letterSpacing: 1.8 }}>WALLET FRITOK</div>
            {currencies.length > 0 && (
              <button onClick={() => setOpen(true)} style={{ background: 'rgba(255,255,255,0.20)', border: '0.5px solid rgba(255,255,255,0.30)', borderRadius: 20, padding: '4px 10px', cursor: 'pointer', color: '#fff', fontSize: 11, fontWeight: 700 }}>
                {currency} ▾
              </button>
            )}
          </div>
          <div style={{ marginTop: 10, display: 'flex', alignItems: 'flex-end', gap: 8 }}>
            <div style={{ fontSize: 40, fontWeight: 800, color: '#fff', letterSpacing: -1 }}>{fmt(balance)}</div>
            <div style={{ paddingBottom: 7, fontSize: 14, color: 'rgba(255,255,255,0.7)', fontWeight: 500 }}>{currency}</div>
          </div>
          <div style={{ height: 0.5, background: 'rgba(255,255,255,0.30)', margin: '14px 0' }} />
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
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', background: 'none', border: 'none', padding: '12px 0', cursor: 'pointer', fontSize: 15, color: c === currency ? D.orange : D.text1, fontWeight: c === currency ? 700 : 400, borderBottom: `0.5px solid ${D.border}` }}>
              {c}
              {c === currency && <span style={{ color: D.orange }}>✓</span>}
            </button>
          ))}
        </BottomSheet>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  MapTab — affiche les power banks depuis Firestore (champ location GeoPoint)
// ─────────────────────────────────────────────────────────────────────────────
function MapTab({ db }) {
  const [powerBanks, setPowerBanks] = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [filter,     setFilter]     = useState('tous'); // 'tous' | 'disponible' | 'en_location'

  useEffect(() => {
    // Listener temps réel sur toute la collection powerBanks
    const q = query(collection(db, 'powerBanks'));
    const unsub = onSnapshot(q, (snap) => {
      setPowerBanks(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, () => setLoading(false));
    return unsub;
  }, []);

  const filtered = filter === 'tous'
    ? powerBanks
    : powerBanks.filter(pb => pb.state === filter);

  const dispoCount = powerBanks.filter(pb => pb.state === 'disponible').length;

  // Convertit les GeoPoints Firestore en { lat, lng } pour Leaflet
  const markers = filtered
    .filter(pb => pb.location)
    .map(pb => ({
      id           : pb.id,
      lat          : pb.location.latitude,
      lng          : pb.location.longitude,
      qrCode       : pb.qrCode || pb.id,
      state        : pb.state,
      batteryLevel : pb.batteryLevel,
      partnerId    : pb.currentPartnerId,
    }));

  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ padding: '24px 24px 0', background: D.bg }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: D.text1 }}>📍 Power banks</div>
        <div style={{ fontSize: 13, color: D.text2, marginTop: 2, marginBottom: 14 }}>
          {loading ? 'Chargement…' : `${dispoCount} disponible${dispoCount > 1 ? 's' : ''} sur ${powerBanks.length}`}
        </div>
        {/* Filter pills */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, overflowX: 'auto', paddingBottom: 4 }}>
          {[
            { key: 'tous',        label: 'Tous' },
            { key: 'disponible',  label: '✅ Disponibles' },
            { key: 'en_location', label: '🔋 En location' },
          ].map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)} style={{
              padding: '5px 14px', borderRadius: 99, border: `1px solid ${filter === f.key ? D.orange : D.border}`,
              background: filter === f.key ? D.orangeDim : D.surface, color: filter === f.key ? D.orange : D.text2,
              fontWeight: filter === f.key ? 700 : 400, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap',
            }}>{f.label}</button>
          ))}
        </div>
      </div>
      <div style={{ flex: 1, position: 'relative' }}>
        <MapView powerBanks={markers} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  RentTab — cherche par qrCode (document ID dans powerBanks)
//  Champs réels : state, batteryLevel, currentPartnerId, currentUserId, location
// ─────────────────────────────────────────────────────────────────────────────
function RentTab({ db, user, wallet, onSuccess }) {
  const [step,      setStep]      = useState('scan');
  const [qrCode,    setQrCode]    = useState('');
  const [pbData,    setPbData]    = useState(null);
  const [payMethod, setPayMethod] = useState('wallet');
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const [rental,    setRental]    = useState(null);

  // Recherche le power bank par champ qrCode (query where)
  // Le document ID peut différer du qrCode visible sur le sticker
  const lookup = async () => {
    const id = qrCode.trim().toUpperCase();
    if (!id) { setError('Saisis le code QR du power bank.'); return; }
    setLoading(true); setError('');
    try {
      // Cherche d'abord par le champ qrCode (ex: "PB-ABJ-000193")
      const q    = query(collection(db, 'powerBanks'), where('qrCode', '==', id));
      const snap = await getDocs(q);

      // Fallback : cherche aussi par document ID au cas où ils coïncident
      let docSnap = null;
      if (!snap.empty) {
        docSnap = snap.docs[0];
      } else {
        const byId = await getDoc(doc(db, 'powerBanks', id));
        if (byId.exists()) docSnap = byId;
      }

      if (!docSnap) {
        setError(`Power bank "${id}" introuvable. Vérifie le code sur l'étiquette.`);
        setLoading(false); return;
      }

      const data  = docSnap.data();
      const docId = docSnap.id;

      if (data.state !== 'disponible') {
        const labels = { en_location: 'en cours de location', hors_service: 'hors service' };
        setError(`Ce power bank est ${labels[data.state] || data.state}.`);
        setLoading(false); return;
      }
      setPbData({ ...data, docId });
      setStep('confirm');
    } catch (e) {
      console.error('lookup error:', e);
      setError('Erreur réseau : ' + e.message);
    }
    setLoading(false);
  };

  const confirmRent = async () => {
    setLoading(true); setError('');
    const balance = wallet['XOF'] ?? 0;
    const total   = FRAIS_XOF + CAUTION_XOF;

    if (payMethod === 'wallet' && balance < total) {
      setError(`Solde insuffisant. Requis : ${fmt(total)} FCFA · Solde : ${fmt(balance)} FCFA`);
      setLoading(false); return;
    }
    try {
      const rentalRef = await addDoc(collection(db, 'rentals'), {
        userId        : user.uid,
        qrCode        : pbData.docId,
        partnerId     : pbData.currentPartnerId || null,
        status        : 'en_cours',
        paymentMethod : payMethod,
        fraisXof      : FRAIS_XOF,
        cautionXof    : CAUTION_XOF,
        devise        : 'XOF',
        startTime     : serverTimestamp(),
      });

      // Déduire du wallet
      if (payMethod === 'wallet') {
        await updateDoc(doc(db, 'users', user.uid), {
          'wallet.XOF': increment(-total),
        });
      }

      // Mettre à jour le power bank : state → "en_location", currentUserId
      await updateDoc(doc(db, 'powerBanks', pbData.docId), {
        state        : 'en_location',
        currentUserId: user.uid,
        updatedAt    : serverTimestamp(),
      });

      setRental({
        id: rentalRef.id, qrCode: pbData.docId,
        fraisXof: FRAIS_XOF, cautionXof: CAUTION_XOF,
        paymentMethod: payMethod, batteryLevel: pbData.batteryLevel,
      });
      setStep('done');
    } catch (e) { setError('Erreur lors de la création de la location : ' + e.message); }
    setLoading(false);
  };

  if (step === 'done') return <PaySuccess rental={rental} onHome={onSuccess} />;

  return (
    <div style={{ padding: 24 }}>
      <div style={{ fontSize: 20, fontWeight: 800, color: D.text1, marginBottom: 20 }}>📷 Louer un power bank</div>

      {step === 'scan' && (
        <QrScanStep
          qrCode={qrCode}
          setQrCode={setQrCode}
          onLookup={lookup}
          loading={loading}
          error={error}
          setError={setError}
        />
      )}

      {step === 'confirm' && pbData && (
        <>
          {/* Fiche power bank */}
          <div style={{ background: D.surface, borderRadius: 16, padding: 20, border: `1px solid ${D.border}`, marginBottom: 20 }}>
            <div style={{ fontSize: 11, color: D.text3, letterSpacing: 1, marginBottom: 12 }}>POWER BANK TROUVÉ ✓</div>

            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 800, color: D.text1 }}>{pbData.docId}</div>
                {pbData.currentPartnerId && (
                  <div style={{ fontSize: 11, color: D.text3, marginTop: 2 }}>Partenaire : {pbData.currentPartnerId.slice(0, 8)}…</div>
                )}
              </div>
              {/* Batterie */}
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 22 }}>{batteryIcon(pbData.batteryLevel)}</div>
                <div style={{ fontSize: 13, fontWeight: 800, color: batteryColor(pbData.batteryLevel) }}>
                  {pbData.batteryLevel != null ? `${pbData.batteryLevel}%` : '–'}
                </div>
              </div>
            </div>

            {/* Barre batterie */}
            {pbData.batteryLevel != null && (
              <div style={{ height: 6, background: '#F0E6DA', borderRadius: 99, marginBottom: 16, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pbData.batteryLevel}%`, background: batteryColor(pbData.batteryLevel), borderRadius: 99, transition: 'width 0.4s' }} />
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <AmountChip label="Frais de location" amount={FRAIS_XOF} />
              <AmountChip label="Caution (remb.)" amount={CAUTION_XOF} amber />
            </div>
          </div>

          {/* Méthode de paiement */}
          <div style={{ fontSize: 13, color: D.text2, fontWeight: 600, marginBottom: 10 }}>Méthode de paiement</div>
          {['wallet', 'flutterwave'].map(m => (
            <button key={m} onClick={() => setPayMethod(m)} style={{
              width: '100%', padding: '12px 16px', marginBottom: 10,
              background: payMethod === m ? D.orangeDim : D.surface,
              border: `1.5px solid ${payMethod === m ? D.orange : D.border}`,
              borderRadius: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
              fontSize: 14, fontWeight: payMethod === m ? 700 : 400, color: D.text1,
            }}>
              <span style={{ fontSize: 20 }}>{m === 'wallet' ? '👛' : '💳'}</span>
              <div style={{ textAlign: 'left' }}>
                <div>{m === 'wallet' ? 'Wallet Fritok' : 'Flutterwave'}</div>
                {m === 'wallet' && (
                  <div style={{ fontSize: 11, color: D.text3 }}>Solde : {fmt(wallet['XOF'] ?? 0)} FCFA</div>
                )}
              </div>
              {payMethod === m && <span style={{ marginLeft: 'auto', color: D.orange }}>✓</span>}
            </button>
          ))}

          {error && <div style={{ fontSize: 12, color: D.red, marginBottom: 10 }}>{error}</div>}
          <button onClick={confirmRent} disabled={loading} style={primaryBtn(loading)}>
            {loading ? 'Traitement…' : `Payer ${fmt(FRAIS_XOF + CAUTION_XOF)} FCFA`}
          </button>
          <button onClick={() => { setStep('scan'); setError(''); setPbData(null); }} style={ghostBtn}>Annuler</button>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  ReturnTab — restitution, libère le power bank (state → "disponible")
// ─────────────────────────────────────────────────────────────────────────────
function ReturnTab({ db, user, activeRentals, onSuccess }) {
  const [selected, setSelected] = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [done,     setDone]     = useState(false);
  const [refund,   setRefund]   = useState(0);

  const doReturn = async () => {
    if (!selected) return;
    setLoading(true); setError('');
    try {
      const r = activeRentals.find(r => r.id === selected);

      // Clôturer la location
      await updateDoc(doc(db, 'rentals', selected), {
        status  : 'restitue',
        endTime : serverTimestamp(),
      });

      // Rembourser la caution
      const caution = r.cautionXof ?? CAUTION_XOF;
      await updateDoc(doc(db, 'users', user.uid), {
        'wallet.XOF': increment(caution),
      });

      // Libérer le power bank — state → "disponible", currentUserId → ""
      if (r.qrCode) {
        await updateDoc(doc(db, 'powerBanks', r.qrCode), {
          state        : 'disponible',
          currentUserId: '',
          updatedAt    : serverTimestamp(),
        });
      }

      setRefund(caution);
      setDone(true);
    } catch (e) { setError('Erreur lors de la restitution : ' + e.message); }
    setLoading(false);
  };

  if (activeRentals.length === 0) return (
    <div style={{ padding: 24, textAlign: 'center', paddingTop: 80 }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>🔋</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: D.text1, marginBottom: 8 }}>Aucune location active</div>
      <div style={{ fontSize: 13, color: D.text2 }}>Scanne un QR code pour louer un power bank.</div>
    </div>
  );

  if (done) return (
    <div style={{ padding: 24, textAlign: 'center', paddingTop: 60 }}>
      <div style={{ width: 80, height: 80, borderRadius: '50%', background: D.greenLight, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36, margin: '0 auto 20px' }}>✓</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: D.text1, marginBottom: 8 }}>Power bank rendu !</div>
      <div style={{ fontSize: 14, color: D.text2, marginBottom: 24 }}>
        Ta caution de <strong>{fmt(refund)} FCFA</strong> a été remboursée sur ton wallet.
      </div>
      <button onClick={onSuccess} style={primaryBtn(false)}>Retour à l'accueil</button>
    </div>
  );

  return (
    <div style={{ padding: 24 }}>
      <div style={{ fontSize: 20, fontWeight: 800, color: D.text1, marginBottom: 20 }}>↩️ Rendre un power bank</div>
      <div style={{ fontSize: 13, color: D.text2, fontWeight: 600, marginBottom: 10 }}>Locations actives</div>

      {activeRentals.map(r => (
        <button key={r.id} onClick={() => setSelected(r.id)} style={{
          width: '100%', padding: 16, marginBottom: 10, textAlign: 'left',
          background: selected === r.id ? D.orangeDim : D.surface,
          border: `1.5px solid ${selected === r.id ? D.orange : D.border}`,
          borderRadius: 14, cursor: 'pointer',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: D.text1 }}>{r.qrCode}</div>
            {selected === r.id && <span style={{ color: D.orange }}>✓ Sélectionné</span>}
          </div>
          <div style={{ fontSize: 12, color: D.text2, marginTop: 4 }}>
            Démarré {fmtDate(r.startTime)} · Durée : {elapsed(r.startTime)}
          </div>
          <div style={{ fontSize: 12, color: D.amber, marginTop: 2, fontWeight: 600 }}>
            Caution à récupérer : {fmt(r.cautionXof ?? CAUTION_XOF)} FCFA
          </div>
        </button>
      ))}

      {selected && (
        <>
          <div style={{ margin: '16px 0', padding: 14, background: D.greenLight, borderRadius: 12, fontSize: 13, color: D.green }}>
            💚 Ta caution de {fmt(activeRentals.find(r => r.id === selected)?.cautionXof ?? CAUTION_XOF)} FCFA sera remboursée immédiatement.
          </div>
          {error && <div style={{ fontSize: 12, color: D.red, marginBottom: 10 }}>{error}</div>}
          <button onClick={doReturn} disabled={loading} style={primaryBtn(loading)}>
            {loading ? 'Traitement…' : 'Confirmer la restitution'}
          </button>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  HistoryTab
// ─────────────────────────────────────────────────────────────────────────────
function HistoryTab({ history }) {
  return (
    <div style={{ padding: '24px 0 0' }}>
      <div style={{ padding: '0 24px 16px', fontSize: 20, fontWeight: 800, color: D.text1 }}>Historique</div>
      {history.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 24px', color: D.text2, fontSize: 13 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🧾</div>
          Aucune location pour l'instant
        </div>
      ) : history.map(r => <HistoryRow key={r.id} rental={r} />)}
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

      {rental?.qrCode && (
        <div style={{ fontSize: 14, color: D.orange, fontWeight: 700, letterSpacing: 0.8, marginBottom: 6 }}>{rental.qrCode}</div>
      )}
      {rental?.batteryLevel != null && (
        <div style={{ fontSize: 13, color: batteryColor(rental.batteryLevel), fontWeight: 600, marginBottom: 10 }}>
          {batteryIcon(rental.batteryLevel)} Batterie : {rental.batteryLevel}%
        </div>
      )}
      <div style={{ display: 'inline-block', padding: '4px 12px', borderRadius: 20, background: isFlw ? '#F5A62320' : D.orangeDim, border: `0.5px solid ${isFlw ? '#D4891F50' : D.orange + '50'}`, fontSize: 11, fontWeight: 600, color: isFlw ? '#D4891F' : D.orange, marginBottom: 28 }}>
        {isFlw ? 'Payé via Flutterwave' : 'Payé via Wallet Fritok'}
      </div>

      <div style={{ background: D.surface, borderRadius: 16, padding: 20, border: `1px solid ${D.border}`, textAlign: 'left', marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: D.text3, letterSpacing: 1.5, marginBottom: 14 }}>RÉCAPITULATIF</div>
        <RecapRow label="Location payée"    value={`${fmt(rental?.fraisXof ?? FRAIS_XOF)} FCFA`} />
        <RecapRow label="Caution en attente" value={`${fmt(rental?.cautionXof ?? CAUTION_XOF)} FCFA`} valueColor={D.amber} />
      </div>

      <div style={{ background: D.amberLight, borderRadius: 12, padding: 14, border: `0.5px solid ${D.amber}50`, display: 'flex', gap: 10, alignItems: 'flex-start', textAlign: 'left', marginBottom: 24 }}>
        <span>⏱️</span>
        <div style={{ fontSize: 12, color: D.amber }}>Rappel dans 24h — Restitue avant 48h pour récupérer ta caution</div>
      </div>
      <button onClick={onHome} style={primaryBtn(false)}>Retour à l'accueil</button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Shared small components
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
//  QrScanStep — scanner caméra réel (html5-qrcode) + fallback saisie manuelle
// ─────────────────────────────────────────────────────────────────────────────
function QrScanStep({ qrCode, setQrCode, onLookup, loading, error, setError }) {
  const [cameraMode, setCameraMode] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const scannerRef = useRef(null);
  const scannerInstanceRef = useRef(null);

  // Démarre le scanner caméra
  const startCamera = async () => {
    setCameraError('');
    try {
      const { Html5Qrcode } = await import('html5-qrcode');
      const scanner = new Html5Qrcode('qr-reader');
      scannerInstanceRef.current = scanner;

      await scanner.start(
        { facingMode: 'environment' }, // caméra arrière
        { fps: 10, qrbox: { width: 220, height: 220 } },
        (decoded) => {
          // QR code détecté
          const code = decoded.trim().toUpperCase();
          setQrCode(code);
          stopCamera();
          setCameraMode(false);
          // Auto-lancer la recherche
          setTimeout(() => onLookup(), 100);
        },
        () => {}, // scan en cours, pas d'erreur à afficher
      );
      setCameraMode(true);
    } catch (e) {
      console.error('Camera error:', e);
      setCameraError(
        e.name === 'NotAllowedError'
          ? 'Permission caméra refusée. Autorise la caméra dans les paramètres du navigateur.'
          : 'Caméra indisponible sur ce navigateur. Utilise la saisie manuelle.',
      );
    }
  };

  const stopCamera = () => {
    if (scannerInstanceRef.current) {
      scannerInstanceRef.current.stop().catch(() => {});
      scannerInstanceRef.current = null;
    }
    setCameraMode(false);
  };

  // Cleanup quand le composant est démonté
  useEffect(() => {
    return () => { stopCamera(); };
  }, []);

  return (
    <>
      {/* Zone scanner / viewfinder */}
      <div style={{ borderRadius: 16, overflow: 'hidden', marginBottom: 16, position: 'relative', background: D.text1 }}>
        {/* Conteneur html5-qrcode — toujours dans le DOM pour que la lib le trouve */}
        <div
          id="qr-reader"
          style={{
            width: '100%',
            display: cameraMode ? 'block' : 'none',
            minHeight: 280,
          }}
        />

        {/* Placeholder quand la caméra est éteinte */}
        {!cameraMode && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 200, padding: 24, position: 'relative' }}>
            {/* Coins du viewfinder */}
            {['top-left','top-right','bottom-left','bottom-right'].map(pos => {
              const isTop  = pos.includes('top');
              const isLeft = pos.includes('left');
              return (
                <div key={pos} style={{
                  position: 'absolute',
                  [isTop ? 'top' : 'bottom']  : 20,
                  [isLeft ? 'left' : 'right'] : 20,
                  width: 32, height: 32,
                  borderTop   : isTop   ? `3px solid ${D.orange}` : 'none',
                  borderBottom: !isTop  ? `3px solid ${D.orange}` : 'none',
                  borderLeft  : isLeft  ? `3px solid ${D.orange}` : 'none',
                  borderRight : !isLeft ? `3px solid ${D.orange}` : 'none',
                }} />
              );
            })}
            <div style={{ fontSize: 42, marginBottom: 10 }}>📷</div>
            <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 14, textAlign: 'center', fontWeight: 600 }}>
              Scanner le QR code
            </div>
            <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, marginTop: 4, textAlign: 'center' }}>
              sur le sticker du power bank
            </div>
            <button
              onClick={startCamera}
              style={{ marginTop: 16, padding: '10px 24px', background: D.orange, color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
            >
              📸 Activer la caméra
            </button>
          </div>
        )}

        {/* Bouton stop caméra */}
        {cameraMode && (
          <button
            onClick={stopCamera}
            style={{ position: 'absolute', top: 10, right: 10, zIndex: 10, background: 'rgba(0,0,0,0.55)', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}
          >
            ✕ Stop
          </button>
        )}
      </div>

      {/* Erreur caméra */}
      {cameraError && (
        <div style={{ fontSize: 12, color: D.amber, background: D.amberLight, padding: '10px 14px', borderRadius: 10, marginBottom: 12, lineHeight: 1.5 }}>
          ⚠️ {cameraError}
        </div>
      )}

      {/* Séparateur */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '12px 0 14px' }}>
        <div style={{ flex: 1, height: 1, background: D.border }} />
        <div style={{ fontSize: 11, color: D.text3, fontWeight: 600 }}>OU SAISIR MANUELLEMENT</div>
        <div style={{ flex: 1, height: 1, background: D.border }} />
      </div>

      {/* Saisie manuelle */}
      <input
        placeholder="Ex: PB-ABJ-000193"
        value={qrCode}
        onChange={e => { setQrCode(e.target.value.toUpperCase()); setError(''); }}
        onKeyDown={e => e.key === 'Enter' && onLookup()}
        style={{ ...inputStyle, textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.8, marginBottom: 12 }}
      />
      {error && (
        <div style={{ fontSize: 12, color: D.red, marginBottom: 10, padding: '8px 12px', background: '#FEE2E2', borderRadius: 8 }}>{error}</div>
      )}
      <button onClick={onLookup} disabled={loading} style={primaryBtn(loading)}>
        {loading ? (
          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <span style={{ width: 18, height: 18, border: '2.5px solid rgba(255,255,255,0.3)', borderTop: '2.5px solid #fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block' }} />
            Recherche…
          </span>
        ) : '🔍 Rechercher'}
      </button>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  );
}

function QuickBtn({ icon, label, sub, primary, onClick }) {
  return (
    <button onClick={onClick} style={{
      width: '100%', padding: 14, background: primary ? D.orangeDim : D.surface,
      border: `0.8px solid ${primary ? D.orange + '60' : D.border}`,
      borderRadius: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
      boxShadow: primary ? `0 4px 12px ${D.orange}18` : 'none',
    }}>
      <span style={{ fontSize: primary ? 26 : 20 }}>{icon}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: primary ? 15 : 13, fontWeight: 700, color: D.text1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
        <div style={{ fontSize: 11, color: D.text2 }}>{sub}</div>
      </div>
      {primary && (
        <div style={{ width: 28, height: 28, borderRadius: '50%', background: D.orange, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 14, flexShrink: 0 }}>→</div>
      )}
    </button>
  );
}

function HistoryRow({ rental }) {
  const isReturn = rental.status === 'restitue';
  const isFlw    = rental.paymentMethod === 'flutterwave';
  const amount   = isReturn
    ? `+${fmt(rental.cautionXof ?? CAUTION_XOF)} FCFA`
    : `-${fmt(rental.fraisXof  ?? FRAIS_XOF)} FCFA`;

  return (
    <div style={{ padding: '14px 24px', borderBottom: `0.5px solid ${D.border}`, display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{ width: 38, height: 38, borderRadius: 10, background: isReturn ? D.greenLight : D.orangeDim, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>
        {isReturn ? '↩️' : '🔋'}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: D.text1 }}>{isReturn ? 'Restitution' : 'Location'}</div>
          <div style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: isFlw ? '#F5A62320' : D.orangeDim, color: isFlw ? '#D4891F' : D.orange }}>
            {isFlw ? 'FLW' : 'Wallet'}
          </div>
        </div>
        <div style={{ fontSize: 11, color: D.text2, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {rental.qrCode} · {fmtDate(rental.startTime)}
        </div>
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, color: isReturn ? D.green : D.text2, flexShrink: 0 }}>{amount}</div>
    </div>
  );
}

function AmountChip({ label, amount, amber }) {
  return (
    <div style={{ background: amber ? D.amberLight : D.orangeDim, borderRadius: 10, padding: '10px 12px' }}>
      <div style={{ fontSize: 10, color: amber ? D.amber : D.text3, fontWeight: 600, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: amber ? D.amber : D.orange }}>
        {fmt(amount)} <span style={{ fontSize: 11, fontWeight: 500 }}>FCFA</span>
      </div>
    </div>
  );
}

function RecapRow({ label, value, valueColor }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
      <div style={{ fontSize: 13, color: D.text2 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: valueColor ?? D.text1 }}>{value}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  ProfileTab — infos compte + déconnexion
//  Utilise la structure Firestore de register.js :
//  { username, email, phone, role, wallet, currency, photoUrl, kyc_status }
// ─────────────────────────────────────────────────────────────────────────────
function ProfileTab({ profile, user, onSignOut, onNav }) {
  const kycLabel = {
    pending  : { text: 'En attente de vérification', color: D.amber,  bg: D.amberLight },
    verified : { text: 'Compte vérifié ✓',            color: D.green,  bg: D.greenLight },
    rejected : { text: 'Vérification refusée',        color: D.red,    bg: '#FEE2E2'   },
  };
  const kyc = kycLabel[profile?.kyc_status] ?? kycLabel.pending;

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        {profile?.photoUrl
          ? <img src={profile.photoUrl} alt="avatar" style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', border: `2px solid ${D.border}` }} />
          : <div style={{ width: 64, height: 64, borderRadius: '50%', background: D.orangeDim, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, flexShrink: 0 }}>👤</div>
        }
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: D.text1 }}>{profile?.username || '–'}</div>
          <div style={{ fontSize: 13, color: D.text2, marginTop: 2 }}>{user?.email}</div>
          {profile?.phone && <div style={{ fontSize: 12, color: D.text3, marginTop: 2 }}>{profile.phone}</div>}
        </div>
      </div>

      <div style={{ padding: '10px 14px', borderRadius: 10, background: kyc.bg, marginBottom: 20, fontSize: 13, fontWeight: 600, color: kyc.color }}>
        🪪 {kyc.text}
      </div>

      <div style={{ background: D.surface, borderRadius: 16, border: `1px solid ${D.border}`, overflow: 'hidden', marginBottom: 16 }}>
        <InfoRow label="Rôle"       value={profile?.role     || 'Client'} />
        <InfoRow label="Plateforme" value={profile?.platform || 'web'}    />
        <InfoRow label="Devise"     value={profile?.currency || 'XOF'}   last />
      </div>

      <div style={{ fontSize: 11, color: D.text3, letterSpacing: 1.5, fontWeight: 600, marginBottom: 10 }}>SOLDES WALLET</div>
      <div style={{ background: D.surface, borderRadius: 16, border: `1px solid ${D.border}`, overflow: 'hidden', marginBottom: 20 }}>
        {Object.entries(profile?.wallet ?? {}).map(([cur, amt], i, arr) => (
          <InfoRow key={cur} label={cur} value={`${fmt(amt)} ${cur}`} last={i === arr.length - 1} />
        ))}
      </div>

      <button onClick={() => onNav('history')} style={{ ...ghostBtn, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 0, marginBottom: 10 }}>
        📋 Voir mon historique complet
      </button>
      <button onClick={onSignOut} style={{ width: '100%', padding: '14px 0', background: '#FEE2E2', color: D.red, border: `1px solid ${D.red}30`, borderRadius: 14, cursor: 'pointer', fontSize: 15, fontWeight: 700 }}>
        Se déconnecter
      </button>
      <div style={{ height: 20 }} />
    </div>
  );
}

function InfoRow({ label, value, last }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '13px 16px', borderBottom: last ? 'none' : `0.5px solid ${D.border}` }}>
      <div style={{ fontSize: 13, color: D.text2 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: D.text1 }}>{value}</div>
    </div>
  );
}

function BottomSheet({ onClose, title, children }) {
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100 }} />
      <div style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 480, background: D.surface, borderRadius: '28px 28px 0 0', zIndex: 101, padding: '16px 20px 40px', maxHeight: '70dvh', overflowY: 'auto' }}>
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
    { key: 'rent',    icon: '⚡', label: 'Louer', primary: true },
    { key: 'return',  icon: '↩️', label: 'Rendre', badge: hasActive },
    { key: 'history', icon: '📋', label: 'Historique' },
    { key: 'profile', icon: profile?.photoUrl ? null : '👤', label: 'Profil', isAvatar: true },
  ];
  return (
    <div style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 480, background: D.surface, borderTop: `0.5px solid ${D.border}`, display: 'flex', alignItems: 'center', paddingBottom: 'env(safe-area-inset-bottom)', zIndex: 50 }}>
      {items.map(item => (
        <button key={item.key} onClick={() => onNav(item.key)} style={{
          flex: 1, padding: '10px 0 8px',
          background: item.primary ? (tab === item.key ? D.orange : D.orangeDim) : 'none',
          border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
          borderRadius: item.primary ? 12 : 0, margin: item.primary ? '4px 6px' : 0, position: 'relative',
        }}>
          {item.badge && <div style={{ position: 'absolute', top: 8, right: '25%', width: 8, height: 8, borderRadius: '50%', background: D.amber, border: `2px solid ${D.surface}` }} />}
          {item.isAvatar && profile?.photoUrl
            ? <img src={profile.photoUrl} alt="profil" style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover', border: tab === 'profile' ? `2px solid ${D.orange}` : `2px solid ${D.border}` }} />
            : <span style={{ fontSize: 20 }}>{item.icon}</span>
          }
          <span style={{ fontSize: 10, fontWeight: tab === item.key ? 700 : 400, color: item.primary ? (tab === item.key ? '#fff' : D.orange) : (tab === item.key ? D.orange : D.text3) }}>
            {item.label}
          </span>
        </button>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Style helpers
// ─────────────────────────────────────────────────────────────────────────────
const inputStyle = {
  width: '100%', padding: '12px 14px', fontSize: 15,
  border: `1px solid ${D.border}`, borderRadius: 12,
  background: D.surface, color: D.text1,
  outline: 'none', boxSizing: 'border-box', display: 'block',
};

const primaryBtn = (disabled) => ({
  width: '100%', padding: '14px 0', marginTop: 16,
  background: disabled ? D.text3 : D.orange, color: '#fff',
  border: 'none', borderRadius: 14, cursor: disabled ? 'not-allowed' : 'pointer',
  fontSize: 15, fontWeight: 700,
});

const ghostBtn = {
  width: '100%', padding: '14px 0', marginTop: 10,
  background: 'none', color: D.text2,
  border: `1px solid ${D.border}`, borderRadius: 14, cursor: 'pointer',
  fontSize: 14,
};
