'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  addDoc,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  onSnapshot,
  serverTimestamp,
  increment,
} from 'firebase/firestore';
import dynamic from 'next/dynamic';

// ─────────────────────────────────────────────────────────────────────────────
//  Firebase config — replace with your actual config
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
//  Design tokens — Citrus Orange (aligned with Flutter _D)
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
//  Leaflet map — loaded client-side only (SSR disabled)
// ─────────────────────────────────────────────────────────────────────────────
const MapView = dynamic(() => import('../components/app/MapView'), { ssr: false });

// ─────────────────────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────────────────────
const fmt = (n) =>
  new Intl.NumberFormat('fr-FR').format(Math.round(n));

const fmtDate = (ts) => {
  if (!ts) return '–';
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('fr-FR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
};

const elapsed = (ts) => {
  if (!ts) return '';
  const d   = ts?.toDate ? ts.toDate() : new Date(ts);
  const sec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (sec < 60)  return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}min`;
  return `${Math.floor(sec / 3600)}h${String(Math.floor((sec % 3600) / 60)).padStart(2, '0')}`;
};

// ─────────────────────────────────────────────────────────────────────────────
//  Main export
// ─────────────────────────────────────────────────────────────────────────────
export default function FritokApp() {
  const app = getFirebaseApp();
  const auth = getAuth(app);
  const db   = getFirestore(app);

  // ── Auth state ──────────────────────────────────────────────────
  const [user,    setUser]    = useState(null);
  const [loading, setLoading] = useState(true);

  // ── Navigation ──────────────────────────────────────────────────
  // tabs: 'home' | 'map' | 'rent' | 'return' | 'history'
  const [tab, setTab] = useState('home');

  // ── Wallet ──────────────────────────────────────────────────────
  const [wallet,   setWallet]   = useState({});
  const [currency, setCurrency] = useState('XOF');

  // ── Rentals ─────────────────────────────────────────────────────
  const [activeRentals, setActiveRentals] = useState([]);
  const [history,       setHistory]       = useState([]);

  // ── Auth listeners ───────────────────────────────────────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsub;
  }, []);

  // ── Wallet + rentals listener ────────────────────────────────────
  useEffect(() => {
    if (!user) { setWallet({}); setActiveRentals([]); setHistory([]); return; }

    const userRef = doc(db, 'users', user.uid);
    const unsubUser = onSnapshot(userRef, (snap) => {
      const data = snap.data();
      if (data?.wallet) setWallet(data.wallet);
    });

    const activeQ = query(
      collection(db, 'rentals'),
      where('userId', '==', user.uid),
      where('status', '==', 'en_cours'),
      orderBy('startTime', 'desc'),
    );
    const unsubActive = onSnapshot(activeQ, (snap) =>
      setActiveRentals(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    );

    const histQ = query(
      collection(db, 'rentals'),
      where('userId', '==', user.uid),
      orderBy('startTime', 'desc'),
      limit(20),
    );
    const unsubHist = onSnapshot(histQ, (snap) =>
      setHistory(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    );

    return () => { unsubUser(); unsubActive(); unsubHist(); };
  }, [user]);

  if (loading) return <Splash />;
  if (!user)   return (
    <AuthScreen auth={auth} db={db} onAuth={() => {}} />
  );

  const balance  = wallet[currency] ?? 0;
  const currencies = Object.keys(wallet);

  return (
    <div style={{ background: D.bg, minHeight: '100dvh', display: 'flex', flexDirection: 'column', maxWidth: 480, margin: '0 auto', position: 'relative' }}>

      {/* ── Main content ─────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 80 }}>
        {tab === 'home' && (
          <HomeTab
            balance={balance} currency={currency} currencies={currencies}
            onCurrencyChange={setCurrency}
            activeRentals={activeRentals}
            history={history}
            onNav={setTab}
          />
        )}
        {tab === 'map' && <MapTab db={db} user={user} />}
        {tab === 'rent' && (
          <RentTab db={db} user={user} wallet={wallet}
            currency={currency} onSuccess={() => setTab('home')} />
        )}
        {tab === 'return' && (
          <ReturnTab db={db} user={user} activeRentals={activeRentals}
            onSuccess={() => setTab('home')} />
        )}
        {tab === 'history' && <HistoryTab history={history} />}
      </div>

      {/* ── Bottom nav ───────────────────────────────────────── */}
      <BottomNav tab={tab} onNav={setTab} hasActive={activeRentals.length > 0}
        onSignOut={() => signOut(auth)} />
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
//  AuthScreen
// ─────────────────────────────────────────────────────────────────────────────
function AuthScreen({ auth, db }) {
  const [mode,     setMode]     = useState('login'); // 'login' | 'register'
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [busy,     setBusy]     = useState(false);

  const submit = async () => {
    setError(''); setBusy(true);
    try {
      if (mode === 'login') {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        await setDoc(doc(db, 'users', cred.user.uid), {
          email : cred.user.email,
          wallet: { XOF: 0 },
          createdAt: serverTimestamp(),
        });
      }
    } catch (e) {
      const msgs = {
        'auth/invalid-email'         : 'Email invalide.',
        'auth/user-not-found'        : 'Compte introuvable.',
        'auth/wrong-password'        : 'Mot de passe incorrect.',
        'auth/email-already-in-use'  : 'Email déjà utilisé.',
        'auth/weak-password'         : 'Mot de passe trop court (6+ caractères).',
      };
      setError(msgs[e.code] || 'Erreur, réessaie.');
    }
    setBusy(false);
  };

  return (
    <div style={{ minHeight: '100dvh', background: D.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      {/* Header */}
      <div style={{ marginBottom: 40, textAlign: 'center' }}>
        <div style={{ fontSize: 52, marginBottom: 8 }}>⚡</div>
        <div style={{ fontSize: 28, fontWeight: 800, color: D.text1 }}>Fritok</div>
        <div style={{ fontSize: 13, color: D.text2, marginTop: 4 }}>Ton énergie, partout.</div>
      </div>

      {/* Card */}
      <div style={{ background: D.surface, borderRadius: 24, padding: 28, width: '100%', maxWidth: 380, border: `1px solid ${D.border}` }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: D.text1, marginBottom: 20 }}>
          {mode === 'login' ? 'Connexion' : 'Créer un compte'}
        </div>

        <input
          type="email" placeholder="Email"
          value={email} onChange={e => setEmail(e.target.value)}
          style={inputStyle}
        />
        <input
          type="password" placeholder="Mot de passe"
          value={password} onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submit()}
          style={{ ...inputStyle, marginTop: 12 }}
        />

        {error && (
          <div style={{ marginTop: 10, fontSize: 12, color: D.red }}>{error}</div>
        )}

        <button onClick={submit} disabled={busy} style={primaryBtn(busy)}>
          {busy ? '…' : (mode === 'login' ? 'Se connecter' : "S'inscrire")}
        </button>

        <button
          onClick={() => { setMode(m => m === 'login' ? 'register' : 'login'); setError(''); }}
          style={{ width: '100%', marginTop: 12, background: 'none', border: 'none', cursor: 'pointer', color: D.orange, fontSize: 13, fontWeight: 600 }}
        >
          {mode === 'login' ? 'Pas de compte ? S\'inscrire' : 'Déjà un compte ? Se connecter'}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  HomeTab
// ─────────────────────────────────────────────────────────────────────────────
function HomeTab({ balance, currency, currencies, onCurrencyChange, activeRentals, history, onNav }) {
  const [showPicker, setShowPicker] = useState(false);

  return (
    <div style={{ padding: '24px 0 0' }}>
      {/* Greeting */}
      <div style={{ padding: '0 24px 20px' }}>
        <div style={{ fontSize: 12, color: D.orange, fontWeight: 700, letterSpacing: 1 }}>Bonjour ✦</div>
        <div style={{ fontSize: 28, fontWeight: 800, color: D.text1, lineHeight: 1.15, marginTop: 4 }}>
          Ton énergie,<br />partout.
        </div>
      </div>

      {/* Wallet card */}
      <WalletCard
        balance={balance} currency={currency} currencies={currencies}
        activeCount={activeRentals.length}
        onCurrencyChange={onCurrencyChange}
      />

      {/* Active rental banner */}
      {activeRentals.length > 0 && (
        <div
          onClick={() => onNav('return')}
          style={{ margin: '14px 24px 0', padding: 14, background: D.amberLight, borderRadius: 12, border: `0.5px solid ${D.amber}44`, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}
        >
          <span style={{ fontSize: 18 }}>🔋</span>
          <div style={{ flex: 1, fontSize: 13, color: D.amber, fontWeight: 500 }}>
            {activeRentals[0].powerBankId} en cours · {elapsed(activeRentals[0].startTime)}
          </div>
          <span style={{ fontSize: 12, color: D.amber }}>→</span>
        </div>
      )}

      {/* Quick actions */}
      <div style={{ padding: '20px 24px 0' }}>
        <QuickBtn
          icon="📷" label="Louer un power bank" sub="Scanner un QR code"
          primary onClick={() => onNav('rent')}
        />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
          <QuickBtn icon="🗺️" label="Carte" sub="Points proches" onClick={() => onNav('map')} />
          <QuickBtn icon="↩️" label="Rendre" sub="Power bank actif" onClick={() => onNav('return')} />
        </div>
      </div>

      {/* History section */}
      <div style={{ marginTop: 28, padding: '0 24px 8px', fontSize: 11, letterSpacing: 1.5, color: D.text3, fontWeight: 600 }}>
        ACTIVITÉ RÉCENTE
      </div>

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
        {/* Deco circles */}
        <div style={{ position: 'absolute', top: -48, right: -32, width: 130, height: 130, borderRadius: '50%', background: 'rgba(255,255,255,0.10)' }} />
        <div style={{ position: 'absolute', bottom: -24, left: -24, width: 90, height: 90, borderRadius: '50%', background: 'rgba(255,255,255,0.07)' }} />

        <div style={{ position: 'relative' }}>
          {/* Label + currency picker */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: 600, letterSpacing: 1.8 }}>WALLET FRITOK</div>
            {currencies.length > 0 && (
              <button onClick={() => setOpen(true)} style={{ background: 'rgba(255,255,255,0.20)', border: '0.5px solid rgba(255,255,255,0.30)', borderRadius: 20, padding: '4px 10px', cursor: 'pointer', color: '#fff', fontSize: 11, fontWeight: 700 }}>
                {currency} ▾
              </button>
            )}
          </div>

          {/* Balance */}
          <div style={{ marginTop: 10, display: 'flex', alignItems: 'flex-end', gap: 8 }}>
            <div style={{ fontSize: 40, fontWeight: 800, color: '#fff', letterSpacing: -1 }}>{fmt(balance)}</div>
            <div style={{ paddingBottom: 7, fontSize: 14, color: 'rgba(255,255,255,0.7)', fontWeight: 500 }}>{currency}</div>
          </div>

          <div style={{ height: 0.5, background: 'rgba(255,255,255,0.30)', margin: '14px 0' }} />

          {/* Active badge */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'rgba(255,255,255,0.18)', border: '0.5px solid rgba(255,255,255,0.30)', borderRadius: 99, padding: '5px 12px' }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: activeCount > 0 ? D.greenLight : 'rgba(255,255,255,0.6)' }} />
            <div style={{ fontSize: 12, color: '#fff', fontWeight: 500 }}>
              {activeCount > 0 ? `${activeCount} location${activeCount > 1 ? 's' : ''} active${activeCount > 1 ? 's' : ''}` : 'Aucune location active'}
            </div>
          </div>
        </div>
      </div>

      {/* Currency picker sheet */}
      {open && (
        <BottomSheet onClose={() => setOpen(false)} title="Choisir une devise">
          {currencies.map(c => (
            <button
              key={c}
              onClick={() => { onCurrencyChange(c); setOpen(false); }}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', background: 'none', border: 'none', padding: '12px 0', cursor: 'pointer', fontSize: 15, color: c === currency ? D.orange : D.text1, fontWeight: c === currency ? 700 : 400, borderBottom: `0.5px solid ${D.border}` }}
            >
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
//  MapTab — Localisation des stations
// ─────────────────────────────────────────────────────────────────────────────
function MapTab({ db, user }) {
  const [stations, setStations] = useState([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(collection(db, 'stations'));
        setStations(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch {}
      setLoading(false);
    })();
  }, []);

  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '24px 24px 12px', background: D.bg }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: D.text1 }}>📍 Carte des stations</div>
        <div style={{ fontSize: 13, color: D.text2, marginTop: 2 }}>
          {loading ? 'Chargement…' : `${stations.length} station${stations.length > 1 ? 's' : ''} disponible${stations.length > 1 ? 's' : ''}`}
        </div>
      </div>

      <div style={{ flex: 1, position: 'relative' }}>
        <MapView stations={stations} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  RentTab — Louer un power bank
// ─────────────────────────────────────────────────────────────────────────────
function RentTab({ db, user, wallet, currency, onSuccess }) {
  const [step,       setStep]       = useState('scan'); // 'scan' | 'confirm' | 'pay' | 'done'
  const [pbId,       setPbId]       = useState('');
  const [stationId,  setStationId]  = useState('');
  const [pbData,     setPbData]     = useState(null);
  const [payMethod,  setPayMethod]  = useState('wallet');
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState('');
  const [rental,     setRental]     = useState(null);

  // Simulate QR scan → manual input on web
  const lookup = async () => {
    if (!pbId.trim()) { setError('Saisis l\'ID du power bank.'); return; }
    setLoading(true); setError('');
    try {
      const snap = await getDoc(doc(db, 'powerBanks', pbId.trim().toUpperCase()));
      if (!snap.exists()) { setError('Power bank introuvable.'); setLoading(false); return; }
      const data = snap.data();
      if (data.status !== 'disponible') { setError('Ce power bank n\'est pas disponible.'); setLoading(false); return; }
      setPbData(data);
      setStationId(data.stationId || '');
      setStep('confirm');
    } catch { setError('Erreur réseau, réessaie.'); }
    setLoading(false);
  };

  const confirmRent = async () => {
    setLoading(true); setError('');
    const fraisXof   = pbData?.fraisXof   ?? 100;
    const cautionXof = pbData?.cautionXof ?? 200;
    const balance    = wallet['XOF'] ?? 0;

    if (payMethod === 'wallet' && balance < fraisXof + cautionXof) {
      setError(`Solde insuffisant. Requis : ${fmt(fraisXof + cautionXof)} FCFA`);
      setLoading(false); return;
    }

    try {
      // Create rental doc
      const rentalRef = await addDoc(collection(db, 'rentals'), {
        userId       : user.uid,
        powerBankId  : pbId.trim().toUpperCase(),
        stationId,
        status       : 'en_cours',
        paymentMethod: payMethod,
        fraisXof,
        cautionXof,
        devise       : 'XOF',
        startTime    : serverTimestamp(),
      });

      // Deduct from wallet if wallet pay
      if (payMethod === 'wallet') {
        await updateDoc(doc(db, 'users', user.uid), {
          'wallet.XOF': increment(-(fraisXof + cautionXof)),
        });
      }

      // Mark power bank as rented
      await updateDoc(doc(db, 'powerBanks', pbId.trim().toUpperCase()), {
        status: 'en_location', currentUserId: user.uid,
      });

      setRental({ id: rentalRef.id, fraisXof, cautionXof, powerBankId: pbId.trim().toUpperCase(), paymentMethod: payMethod });
      setStep('done');
    } catch (e) { setError('Erreur lors de la création de la location.'); }
    setLoading(false);
  };

  if (step === 'done') return <PaySuccess rental={rental} onHome={onSuccess} />;

  return (
    <div style={{ padding: 24 }}>
      <div style={{ fontSize: 20, fontWeight: 800, color: D.text1, marginBottom: 20 }}>
        📷 Louer un power bank
      </div>

      {step === 'scan' && (
        <>
          {/* QR scanner placeholder */}
          <div style={{ background: D.text1, borderRadius: 16, aspectRatio: '1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', marginBottom: 20, position: 'relative', overflow: 'hidden' }}>
            {/* Scan frame corners */}
            {['top-left','top-right','bottom-left','bottom-right'].map(pos => {
              const isTop    = pos.includes('top');
              const isLeft   = pos.includes('left');
              return (
                <div key={pos} style={{
                  position: 'absolute',
                  [isTop ? 'top' : 'bottom']  : 24,
                  [isLeft ? 'left' : 'right'] : 24,
                  width: 36, height: 36,
                  borderTop   : isTop    ? `3px solid ${D.orange}` : 'none',
                  borderBottom: !isTop   ? `3px solid ${D.orange}` : 'none',
                  borderLeft  : isLeft   ? `3px solid ${D.orange}` : 'none',
                  borderRight : !isLeft  ? `3px solid ${D.orange}` : 'none',
                }} />
              );
            })}
            <div style={{ fontSize: 48, marginBottom: 12 }}>📱</div>
            <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>
              Scannez le QR code<br />sur le power bank
            </div>
            <div style={{ marginTop: 16, color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>
              (Caméra non disponible sur ce navigateur)
            </div>
          </div>

          {/* Manual ID input */}
          <div style={{ fontSize: 13, color: D.text2, marginBottom: 8, fontWeight: 600 }}>
            ou entrez l'ID manuellement
          </div>
          <input
            placeholder="Ex: PB-0042"
            value={pbId}
            onChange={e => { setPbId(e.target.value.toUpperCase()); setError(''); }}
            onKeyDown={e => e.key === 'Enter' && lookup()}
            style={{ ...inputStyle, marginBottom: 12, textTransform: 'uppercase', fontWeight: 700, letterSpacing: 1 }}
          />
          {error && <div style={{ fontSize: 12, color: D.red, marginBottom: 10 }}>{error}</div>}
          <button onClick={lookup} disabled={loading} style={primaryBtn(loading)}>
            {loading ? '…' : 'Rechercher'}
          </button>
        </>
      )}

      {step === 'confirm' && pbData && (
        <>
          {/* PB info card */}
          <div style={{ background: D.surface, borderRadius: 16, padding: 20, border: `1px solid ${D.border}`, marginBottom: 20 }}>
            <div style={{ fontSize: 12, color: D.text3, letterSpacing: 1, marginBottom: 12 }}>POWER BANK TROUVÉ</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: D.text1, marginBottom: 4 }}>{pbId.trim().toUpperCase()}</div>
            <div style={{ fontSize: 13, color: D.text2, marginBottom: 16 }}>Station : {stationId || 'Inconnue'}</div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <AmountChip label="Frais de location" amount={pbData.fraisXof ?? 100} />
              <AmountChip label="Caution (remboursable)" amount={pbData.cautionXof ?? 200} amber />
            </div>
          </div>

          {/* Payment method */}
          <div style={{ fontSize: 13, color: D.text2, fontWeight: 600, marginBottom: 10 }}>Méthode de paiement</div>
          {['wallet', 'flutterwave'].map(m => (
            <button
              key={m}
              onClick={() => setPayMethod(m)}
              style={{
                width: '100%', padding: '12px 16px', marginBottom: 10,
                background : payMethod === m ? D.orangeDim : D.surface,
                border     : `1.5px solid ${payMethod === m ? D.orange : D.border}`,
                borderRadius: 12, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 10,
                fontSize: 14, fontWeight: payMethod === m ? 700 : 400, color: D.text1,
              }}
            >
              <span style={{ fontSize: 20 }}>{m === 'wallet' ? '👛' : '💳'}</span>
              <div style={{ textAlign: 'left' }}>
                <div>{m === 'wallet' ? 'Wallet Fritok' : 'Flutterwave'}</div>
                {m === 'wallet' && (
                  <div style={{ fontSize: 11, color: D.text3 }}>
                    Solde : {fmt(wallet['XOF'] ?? 0)} FCFA
                  </div>
                )}
              </div>
              {payMethod === m && <span style={{ marginLeft: 'auto', color: D.orange }}>✓</span>}
            </button>
          ))}

          {error && <div style={{ fontSize: 12, color: D.red, marginBottom: 10 }}>{error}</div>}

          <button onClick={confirmRent} disabled={loading} style={primaryBtn(loading)}>
            {loading ? '…' : `Payer ${fmt((pbData.fraisXof ?? 100) + (pbData.cautionXof ?? 200))} FCFA`}
          </button>
          <button onClick={() => { setStep('scan'); setError(''); setPbData(null); }} style={ghostBtn}>
            Annuler
          </button>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  ReturnTab — Restituer un power bank
// ─────────────────────────────────────────────────────────────────────────────
function ReturnTab({ db, user, activeRentals, onSuccess }) {
  const [selected, setSelected]   = useState(null);
  const [stationId, setStationId] = useState('');
  const [loading,  setLoading]    = useState(false);
  const [error,    setError]      = useState('');
  const [done,     setDone]       = useState(false);
  const [refund,   setRefund]     = useState(0);

  const doReturn = async () => {
    if (!selected) return;
    if (!stationId.trim()) { setError('Indique la station de retour.'); return; }
    setLoading(true); setError('');

    try {
      const r = activeRentals.find(r => r.id === selected);

      // Update rental
      await updateDoc(doc(db, 'rentals', selected), {
        status    : 'restitue',
        endTime   : serverTimestamp(),
        returnStationId: stationId.trim(),
      });

      // Refund caution
      const caution = r.cautionXof ?? 200;
      await updateDoc(doc(db, 'users', user.uid), {
        'wallet.XOF': increment(caution),
      });

      // Free power bank
      if (r.powerBankId) {
        await updateDoc(doc(db, 'powerBanks', r.powerBankId), {
          status: 'disponible', currentUserId: null, stationId: stationId.trim(),
        });
      }

      setRefund(caution);
      setDone(true);
    } catch { setError('Erreur lors de la restitution.'); }
    setLoading(false);
  };

  if (activeRentals.length === 0) {
    return (
      <div style={{ padding: 24, textAlign: 'center', paddingTop: 80 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🔋</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: D.text1, marginBottom: 8 }}>Aucune location active</div>
        <div style={{ fontSize: 13, color: D.text2 }}>Scanne un QR code pour louer un power bank.</div>
      </div>
    );
  }

  if (done) {
    return (
      <div style={{ padding: 24, textAlign: 'center', paddingTop: 60 }}>
        <div style={{ width: 80, height: 80, borderRadius: '50%', background: D.greenLight, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36, margin: '0 auto 20px' }}>✓</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: D.text1, marginBottom: 8 }}>Power bank rendu !</div>
        <div style={{ fontSize: 14, color: D.text2, marginBottom: 24 }}>
          Ta caution de <strong>{fmt(refund)} FCFA</strong> a été remboursée sur ton wallet.
        </div>
        <button onClick={onSuccess} style={primaryBtn(false)}>Retour à l'accueil</button>
      </div>
    );
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ fontSize: 20, fontWeight: 800, color: D.text1, marginBottom: 20 }}>↩️ Rendre un power bank</div>

      <div style={{ fontSize: 13, color: D.text2, fontWeight: 600, marginBottom: 10 }}>Locations actives</div>

      {activeRentals.map(r => (
        <button
          key={r.id}
          onClick={() => setSelected(r.id)}
          style={{
            width: '100%', padding: 16, marginBottom: 10, textAlign: 'left',
            background: selected === r.id ? D.orangeDim : D.surface,
            border: `1.5px solid ${selected === r.id ? D.orange : D.border}`,
            borderRadius: 14, cursor: 'pointer',
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 700, color: D.text1 }}>{r.powerBankId}</div>
          <div style={{ fontSize: 12, color: D.text2, marginTop: 2 }}>
            Démarré {fmtDate(r.startTime)} · Caution : {fmt(r.cautionXof ?? 200)} FCFA
          </div>
        </button>
      ))}

      {selected && (
        <>
          <div style={{ fontSize: 13, color: D.text2, fontWeight: 600, margin: '16px 0 8px' }}>Station de retour</div>
          <input
            placeholder="ID de la station (ex: ST-01)"
            value={stationId}
            onChange={e => { setStationId(e.target.value); setError(''); }}
            style={inputStyle}
          />

          {error && <div style={{ fontSize: 12, color: D.red, margin: '8px 0' }}>{error}</div>}

          <div style={{ margin: '16px 0', padding: 14, background: D.greenLight, borderRadius: 12, fontSize: 13, color: D.green }}>
            💚 Ta caution de {fmt(activeRentals.find(r => r.id === selected)?.cautionXof ?? 200)} FCFA sera remboursée immédiatement.
          </div>

          <button onClick={doReturn} disabled={loading} style={primaryBtn(loading)}>
            {loading ? '…' : 'Confirmer la restitution'}
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
      ) : (
        history.map(r => <HistoryRow key={r.id} rental={r} full />)
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  PaySuccess screen
// ─────────────────────────────────────────────────────────────────────────────
function PaySuccess({ rental, onHome }) {
  const isFlw = rental?.paymentMethod === 'flutterwave';

  return (
    <div style={{ padding: 24, textAlign: 'center', paddingTop: 60 }}>
      <div style={{ width: 100, height: 100, borderRadius: '50%', background: D.greenLight, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 48, margin: '0 auto 24px' }}>✓</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: D.text1, marginBottom: 8 }}>Paiement réussi !</div>
      <div style={{ fontSize: 14, color: D.text2, marginBottom: 6 }}>Le commerçant va te remettre le power bank</div>
      {rental?.powerBankId && (
        <div style={{ fontSize: 14, color: D.orange, fontWeight: 700, letterSpacing: 0.8, marginBottom: 10 }}>
          {rental.powerBankId}
        </div>
      )}
      <div style={{ display: 'inline-block', padding: '4px 12px', borderRadius: 20, background: isFlw ? '#F5A62320' : D.orangeDim, border: `0.5px solid ${isFlw ? '#D4891F50' : D.orange + '50'}`, fontSize: 11, fontWeight: 600, color: isFlw ? '#D4891F' : D.orange, marginBottom: 28 }}>
        {isFlw ? 'Payé via Flutterwave' : 'Payé via Wallet Fritok'}
      </div>

      {/* Recap */}
      <div style={{ background: D.surface, borderRadius: 16, padding: 20, border: `1px solid ${D.border}`, textAlign: 'left', marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: D.text3, letterSpacing: 1.5, marginBottom: 14 }}>RÉCAPITULATIF</div>
        <RecapRow label="Location payée"      value={`${fmt(rental?.fraisXof ?? 100)} FCFA`} />
        <RecapRow label="Caution en attente"  value={`${fmt(rental?.cautionXof ?? 200)} FCFA`} valueColor={D.amber} />
      </div>

      <div style={{ background: D.amberLight, borderRadius: 12, padding: 14, border: `0.5px solid ${D.amber}50`, display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 24, textAlign: 'left' }}>
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
function QuickBtn({ icon, label, sub, primary, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', padding: 14, marginBottom: primary ? 0 : 0,
        background: primary ? D.orangeDim : D.surface,
        border: `0.8px solid ${primary ? D.orange + '60' : D.border}`,
        borderRadius: 16, cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
        boxShadow: primary ? `0 4px 12px ${D.orange}18` : 'none',
      }}
    >
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

function HistoryRow({ rental, full }) {
  const isReturn = rental.status === 'restitue';
  const amountLabel = isReturn
    ? `+${fmt(rental.cautionXof ?? 200)} FCFA`
    : `-${fmt(rental.fraisXof ?? 100)} FCFA`;
  const isFlw = rental.paymentMethod === 'flutterwave';

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
          {rental.powerBankId} · {fmtDate(rental.startTime)}
        </div>
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, color: isReturn ? D.green : D.text2, flexShrink: 0 }}>
        {amountLabel}
      </div>
    </div>
  );
}

function AmountChip({ label, amount, amber }) {
  return (
    <div style={{ background: amber ? D.amberLight : D.orangeDim, borderRadius: 10, padding: '10px 12px' }}>
      <div style={{ fontSize: 10, color: amber ? D.amber : D.text3, fontWeight: 600, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: amber ? D.amber : D.orange }}>{fmt(amount)} <span style={{ fontSize: 11, fontWeight: 500 }}>FCFA</span></div>
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

// ─────────────────────────────────────────────────────────────────────────────
//  BottomNav
// ─────────────────────────────────────────────────────────────────────────────
function BottomNav({ tab, onNav, hasActive, onSignOut }) {
  const items = [
    { key: 'home',    icon: '🏠', label: 'Accueil' },
    { key: 'map',     icon: '🗺️', label: 'Carte' },
    { key: 'rent',    icon: '⚡', label: 'Louer',  primary: true },
    { key: 'return',  icon: '↩️', label: 'Rendre',  badge: hasActive },
    { key: 'history', icon: '📋', label: 'Historique' },
  ];

  return (
    <div style={{
      position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
      width: '100%', maxWidth: 480,
      background: D.surface, borderTop: `0.5px solid ${D.border}`,
      display: 'flex', alignItems: 'center', paddingBottom: 'env(safe-area-inset-bottom)',
      zIndex: 50,
    }}>
      {items.map(item => (
        <button
          key={item.key}
          onClick={() => onNav(item.key)}
          style={{
            flex: 1, padding: '10px 0 8px',
            background: item.primary
              ? tab === item.key ? D.orange : D.orangeDim
              : 'none',
            border: 'none', cursor: 'pointer',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
            borderRadius: item.primary ? 12 : 0,
            margin: item.primary ? '4px 6px' : 0,
            position: 'relative',
          }}
        >
          {item.badge && (
            <div style={{ position: 'absolute', top: 8, right: '25%', width: 8, height: 8, borderRadius: '50%', background: D.amber, border: `2px solid ${D.surface}` }} />
          )}
          <span style={{ fontSize: 20 }}>{item.icon}</span>
          <span style={{
            fontSize: 10, fontWeight: tab === item.key ? 700 : 400,
            color: item.primary
              ? (tab === item.key ? '#fff' : D.orange)
              : (tab === item.key ? D.orange : D.text3),
          }}>
            {item.label}
          </span>
        </button>
      ))}
    </div>
  );
}

//nouveau
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
