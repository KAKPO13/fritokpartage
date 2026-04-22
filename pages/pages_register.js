// pages/register.js
// ─────────────────────────────────────────────────────────────
// Converti depuis register.html (Netlify) → Next.js
// Route : /register?redirect=/shop?userId=XXX
// ─────────────────────────────────────────────────────────────
import Head from "next/head";
import { useRouter } from "next/router";
import { useState, useEffect, useRef } from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  getAuth, createUserWithEmailAndPassword,
  sendEmailVerification, onAuthStateChanged,
} from "firebase/auth";
import {
  getFirestore, doc, setDoc, serverTimestamp,
} from "firebase/firestore";
import {
  getStorage, ref, uploadBytes, getDownloadURL,
} from "firebase/storage";

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

const COUNTRY_CODES = [
  { code:"+225", flag:"🇨🇮", label:"CI" },
  { code:"+221", flag:"🇸🇳", label:"SN" },
  { code:"+229", flag:"🇧🇯", label:"BJ" },
  { code:"+228", flag:"🇹🇬", label:"TG" },
  { code:"+233", flag:"🇬🇭", label:"GH" },
  { code:"+234", flag:"🇳🇬", label:"NG" },
  { code:"+237", flag:"🇨🇲", label:"CM" },
  { code:"+241", flag:"🇬🇦", label:"GA" },
  { code:"+242", flag:"🇨🇬", label:"CG" },
  { code:"+243", flag:"🇨🇩", label:"CD" },
  { code:"+212", flag:"🇲🇦", label:"MA" },
  { code:"+216", flag:"🇹🇳", label:"TN" },
  { code:"+213", flag:"🇩🇿", label:"DZ" },
  { code:"+33",  flag:"🇫🇷", label:"FR" },
  { code:"+1",   flag:"🇺🇸", label:"US" },
];

const XOF_CODES = ["+225","+221","+229","+228","+241","+242","+243"];

function getCurrency(code) {
  if (XOF_CODES.includes(code)) return "XOF";
  if (code === "+233") return "GHS";
  if (code === "+234") return "NGN";
  return "XOF";
}

function pwStrength(pw) {
  let s = 0;
  if (pw.length >= 6) s++;
  if (pw.length >= 8) s++;
  if (/[A-Z]|[0-9]/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return s;
}

const validEmail = (v) => /^[\w\-.]+@([\w\-]+\.)+[\w\-]{2,}$/.test(v);

const STRENGTH_COLORS = ["","#EF4444","#F97316","#EAB308","#22C55E"];

export default function RegisterPage() {
  const router   = useRouter();
  const redirect = router.query.redirect || "/";
  const fileRef  = useRef(null);

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [avatarFile,   setAvatarFile]   = useState(null);
  const [avatarUrl,    setAvatarUrl]    = useState(null);
  const [username,     setUsername]     = useState("");
  const [email,        setEmail]        = useState("");
  const [phone,        setPhone]        = useState("");
  const [countryCode,  setCountryCode]  = useState("+225");
  const [password,     setPassword]     = useState("");
  const [showPw,       setShowPw]       = useState(false);
  const [cgu,          setCgu]          = useState(false);
  const [privacy,      setPrivacy]      = useState(false);
  const [loading,      setLoading]      = useState(false);
  const [alert,        setAlert]        = useState(null);
  const [errors,       setErrors]       = useState({});
  const strength = pwStrength(password);

  // ── Si déjà connecté → rediriger ──────────────────────────
  useEffect(() => {
    const auth  = getAuth(getFirebaseApp());
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user && user.emailVerified) router.replace(redirect);
      else setCheckingAuth(false);
    });
    return unsub;
  }, [redirect]);

  // ── Avatar preview ────────────────────────────────────────
  const handleAvatar = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    setAvatarUrl(URL.createObjectURL(file));
  };

  const validate = () => {
    const e = {};
    if (!username.trim())                           e.username = "Nom d'utilisateur requis.";
    if (!email.trim() || !validEmail(email.trim())) e.email    = "Adresse email invalide.";
    if (!phone.trim())                              e.phone    = "Numéro requis.";
    if (!password || password.length < 6)           e.password = "Minimum 6 caractères.";
    if (!cgu || !privacy)                           e.cgu      = "Vous devez accepter les CGU et la politique de confidentialité.";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleRegister = async () => {
    setAlert(null);
    if (!validate()) return;
    setLoading(true);

    try {
      const app     = getFirebaseApp();
      const auth    = getAuth(app);
      const db      = getFirestore(app);
      const storage = getStorage(app);

      // 1. Créer le compte Firebase Auth
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      const user  = cred.user;

      // 2. Envoyer l'email de vérification
      try { await sendEmailVerification(user); } catch {}

      // 3. Upload photo de profil (optionnel)
      let photoUrl = null;
      if (avatarFile) {
        try {
          const storageRef = ref(storage, `profile_pictures/${user.uid}.jpg`);
          const snap = await uploadBytes(storageRef, avatarFile);
          photoUrl   = await getDownloadURL(snap.ref);
        } catch {}
      }

      // 4. Créer le profil Firestore (même structure que l'app Flutter)
      await setDoc(doc(db, "users", user.uid), {
        userId    : user.uid,
        email     : email.trim(),
        username  : username.trim(),
        phone     : `${countryCode}${phone.trim()}`,
        role      : "Client",
        wallet    : { XOF: 0, GHS: 0, NGN: 0 },
        currency  : getCurrency(countryCode),
        photoUrl,
        fcmToken  : null,
        kyc_status: "pending",
        platform  : "web",
        createdAt : serverTimestamp(),
        updatedAt : serverTimestamp(),
      });

      // 5. Redirection vers vérification email
      router.replace(`/verify-email?redirect=${encodeURIComponent(redirect)}`);

    } catch (err) {
      const MAP = {
        "auth/email-already-in-use": "Cet email est déjà utilisé.",
        "auth/invalid-email"       : "Adresse email invalide.",
        "auth/weak-password"       : "Mot de passe trop faible (min. 6 caractères).",
        "auth/network-request-failed": "Erreur réseau. Vérifiez votre connexion.",
      };
      setAlert({ msg: MAP[err.code] || `Erreur : ${err.message}` });
    } finally {
      setLoading(false);
    }
  };

  if (checkingAuth) return <FullLoader />;

  return (
    <>
      <Head>
        <title>FriTok — Créer un compte</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <style>{CSS}</style>
      </Head>

      <div className="page">
        {/* Header */}
        <div className="header">
          <div className="header-icon"><UserPlusIcon /></div>
          <h1>Créer un compte</h1>
          <p>Rejoignez FriTok en quelques secondes</p>
        </div>

        <div className="body">
          {alert && <div className="alert show">{alert.msg}</div>}

          {/* Avatar */}
          <div className="avatar-wrap">
            <button className="avatar-btn" type="button" onClick={() => fileRef.current?.click()}>
              <div className={`avatar-circle${avatarUrl ? " has-img" : ""}`}>
                {avatarUrl
                  ? <img src={avatarUrl} alt="Avatar" />
                  : <UserIcon />
                }
              </div>
              <div className="avatar-badge"><CameraIcon /></div>
            </button>
            <input ref={fileRef} type="file" accept="image/*"
              style={{display:"none"}} onChange={handleAvatar} />
          </div>

          {/* Rôle badge */}
          <div className="role-badge">
            <BagIcon />
            <p>Compte <strong>Client</strong> — <span>Pour acheter sur FriTok depuis votre navigateur</span></p>
          </div>

          {/* Username */}
          <div className="field">
            <label className="label" htmlFor="username">Nom d'utilisateur</label>
            <div className="input-wrap">
              <UserIcon2 className="prefix" />
              <input id="username" type="text" placeholder="johndoe"
                autoComplete="username" value={username}
                onChange={e => setUsername(e.target.value)}
                className={errors.username ? "err-border" : ""}
              />
            </div>
            {errors.username && <span className="err show">{errors.username}</span>}
          </div>

          {/* Email */}
          <div className="field">
            <label className="label" htmlFor="email">Email</label>
            <div className="input-wrap">
              <MailIcon className="prefix" />
              <input id="email" type="email" placeholder="votre@email.com"
                autoComplete="email" value={email}
                onChange={e => setEmail(e.target.value)}
                className={errors.email ? "err-border" : ""}
              />
            </div>
            {errors.email && <span className="err show">{errors.email}</span>}
          </div>

          {/* Téléphone */}
          <div className="field">
            <label className="label" htmlFor="phone">Téléphone</label>
            <div className={`phone-row${errors.phone ? " phone-err" : ""}`}>
              <select className="country-select" value={countryCode}
                onChange={e => setCountryCode(e.target.value)}>
                {COUNTRY_CODES.map(c => (
                  <option key={c.code} value={c.code}>
                    {c.flag} {c.code}
                  </option>
                ))}
              </select>
              <input id="phone" type="tel" placeholder="07 00 00 00 00"
                value={phone} onChange={e => setPhone(e.target.value)} />
            </div>
            {errors.phone && <span className="err show">{errors.phone}</span>}
          </div>

          {/* Password */}
          <div className="field">
            <label className="label" htmlFor="password">Mot de passe</label>
            <div className="input-wrap">
              <LockIcon className="prefix" />
              <input id="password" type={showPw ? "text" : "password"}
                placeholder="••••••••" autoComplete="new-password"
                value={password} onChange={e => setPassword(e.target.value)}
                className={errors.password ? "err-border" : ""}
              />
              <button className="toggle-btn" type="button"
                onClick={() => setShowPw(p => !p)}>
                {showPw ? <EyeOnIcon /> : <EyeOffIcon />}
              </button>
            </div>
            {/* Barre de force */}
            <div className="strength-bar">
              {[1,2,3,4].map(i => (
                <span key={i} style={{
                  flex:1, height:3, borderRadius:2,
                  background: i <= strength ? STRENGTH_COLORS[strength] : "#E8E0D8",
                  transition:"background .3s",
                }} />
              ))}
            </div>
            {errors.password && <span className="err show">{errors.password}</span>}
          </div>

          {/* CGU */}
          <div className="check-row">
            <input type="checkbox" id="cgu" checked={cgu}
              onChange={e => setCgu(e.target.checked)} />
            <label htmlFor="cgu">
              J'accepte les <a href="https://fritok.net/CGU" target="_blank" rel="noreferrer">
              Conditions Générales d'Utilisation</a>
            </label>
          </div>
          <div className="check-row">
            <input type="checkbox" id="privacy" checked={privacy}
              onChange={e => setPrivacy(e.target.checked)} />
            <label htmlFor="privacy">
              J'accepte la <a href="https://fritok.net/politique" target="_blank" rel="noreferrer">
              politique de confidentialité</a>
            </label>
          </div>
          {errors.cgu && <span className="err show">{errors.cgu}</span>}

          <button className="btn-primary" onClick={handleRegister} disabled={loading}>
            {loading ? <span className="spinner" /> : "Créer mon compte"}
          </button>

          <div className="login-row">
            <span>Déjà un compte ?</span>
            <a href={`/login?redirect=${encodeURIComponent(redirect)}`}>Se connecter</a>
          </div>

          <div className="divider"><hr /><span>Vendeur ou Livreur ?</span><hr /></div>
          <AppCard />

          <div className="legal">
            <a href="https://fritok.net/CGU" target="_blank" rel="noreferrer">CGU</a>
            <span> · </span>
            <a href="https://fritok.net/politique" target="_blank" rel="noreferrer">Confidentialité</a>
          </div>
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// Sous-composants
// ─────────────────────────────────────────────────────────────
const FullLoader = () => (
  <>
    <style>{CSS}</style>
    <div className="full-loader"><span className="spinner-orange" /></div>
  </>
);

const AppCard = () => (
  <div className="app-card">
    <div className="app-icon">
      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"/>
      </svg>
    </div>
    <div className="app-card-text">
      <strong>Téléchargez l'app FriTok</strong>
      <p>Compte Vendeur &amp; Livreur uniquement disponibles sur l'app mobile</p>
    </div>
    <div className="app-card-links">
      <a className="store-btn" href="https://play.google.com/store/apps/details?id=com.fritok" target="_blank" rel="noreferrer">
        <svg viewBox="0 0 24 24" fill="currentColor" style={{width:14,height:14}}>
          <path d="M3.18 23.76a2.5 2.5 0 001.68-.5l.1-.08 9.44-9.44-2.7-2.7zM20.46 10.4l-2.77-1.58-3.04 3.04 3.04 3.04 2.8-1.6a1.78 1.78 0 000-2.9zM3 .28a1.76 1.76 0 00-.6 1.36v20.72c0 .54.22 1.02.6 1.37l.07.07 11.6-11.6v-.28L3.07.21z"/>
        </svg>
        Play Store
      </a>
      <a className="store-btn" href="https://apps.apple.com/app/fritok" target="_blank" rel="noreferrer">
        <svg viewBox="0 0 24 24" fill="currentColor" style={{width:14,height:14}}>
          <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98l-.09.06c-.22.14-2.19 1.28-2.17 3.8.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.37 2.78M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11"/>
        </svg>
        App Store
      </a>
    </div>
  </div>
);

// ── Icônes ───────────────────────────────────────────────────
const UserPlusIcon = () => (
  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"/>
  </svg>
);
const UserIcon = () => (
  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
  </svg>
);
const UserIcon2 = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
  </svg>
);
const CameraIcon = () => (
  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2" style={{width:16,height:16,color:"#fff"}}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/>
  </svg>
);
const BagIcon = () => (
  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" style={{width:20,height:20,color:"#FF6B1A",flexShrink:0}}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"/>
  </svg>
);
const MailIcon = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
  </svg>
);
const LockIcon = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
  </svg>
);
const EyeOffIcon = () => (
  <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/>
  </svg>
);
const EyeOnIcon = () => (
  <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
  </svg>
);

// ─────────────────────────────────────────────────────────────
// CSS — miroir fidèle de register.html
// ─────────────────────────────────────────────────────────────
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
  *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
  :root {
    --bg:#FFFBF5; --surface:#FFFFFF; --orange:#FF6B1A; --orange-dark:#E05510;
    --orange-soft:#FFF0E8; --text:#1A1A1A; --muted:#888880; --border:#E8E0D8; --radius:14px;
  }
  html,body { min-height:100%; font-family:'Plus Jakarta Sans',sans-serif;
    background:var(--bg); color:var(--text); }

  .full-loader { position:fixed; inset:0; display:flex;
    align-items:center; justify-content:center; background:var(--bg); }

  .page { display:flex; flex-direction:column; min-height:100vh; }

  .header { background:var(--orange); padding:env(safe-area-inset-top,0) 28px 28px;
    padding-top:calc(env(safe-area-inset-top,0px) + 40px);
    animation:slideDown .5s cubic-bezier(.22,1,.36,1) both; }
  @keyframes slideDown { from{transform:translateY(-100%);opacity:0} to{transform:translateY(0);opacity:1} }
  .header-icon { width:44px;height:44px;background:rgba(255,255,255,.2);border-radius:12px;
    display:flex;align-items:center;justify-content:center;margin-bottom:14px; }
  .header-icon svg { width:24px;height:24px;color:#fff; }
  .header h1 { color:#fff;font-size:clamp(24px,7vw,32px);font-weight:800;letter-spacing:-1px; }
  .header p  { color:rgba(255,255,255,.72);font-size:13px;margin-top:5px; }

  .body { flex:1;padding:32px 28px 48px;
    animation:fadeUp .5s .15s cubic-bezier(.22,1,.36,1) both; }
  @keyframes fadeUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }

  .alert { display:none;background:#FFF0E8;border:1.5px solid #FFD4B8;border-radius:12px;
    padding:12px 16px;margin-bottom:24px;font-size:13.5px;color:var(--orange-dark); }
  .alert.show { display:block; }

  /* Avatar */
  .avatar-wrap { display:flex;justify-content:center;margin-bottom:28px; }
  .avatar-btn  { position:relative;cursor:pointer;background:none;border:none;padding:0; }
  .avatar-circle { width:104px;height:104px;border-radius:50%;background:var(--border);
    display:flex;align-items:center;justify-content:center;overflow:hidden;
    border:2px solid var(--border); }
  .avatar-circle svg { width:44px;height:44px;color:var(--muted); }
  .avatar-circle.has-img svg { display:none; }
  .avatar-circle img { width:100%;height:100%;object-fit:cover;display:none; }
  .avatar-circle.has-img img { display:block; }
  .avatar-badge { position:absolute;bottom:0;right:0;width:32px;height:32px;border-radius:50%;
    background:var(--orange);display:flex;align-items:center;justify-content:center;
    box-shadow:0 2px 8px rgba(255,107,26,.4); }

  /* Role badge */
  .role-badge { display:flex;align-items:center;gap:10px;background:var(--orange-soft);
    border:1.5px solid #FFD4B8;border-radius:12px;padding:12px 16px;margin-bottom:24px; }
  .role-badge p { font-size:13px;color:var(--orange-dark);font-weight:600;line-height:1.3; }
  .role-badge p span { font-weight:400;opacity:.8; }

  /* Fields */
  .field { margin-bottom:20px; }
  .label { display:block;font-size:11px;font-weight:700;letter-spacing:.9px;
    color:var(--muted);margin-bottom:8px;text-transform:uppercase; }
  .input-wrap { position:relative; }
  .input-wrap svg.prefix { position:absolute;left:14px;top:50%;transform:translateY(-50%);
    width:20px;height:20px;color:var(--muted);pointer-events:none; }
  .input-wrap input { width:100%;height:52px;padding:0 44px;border:1.5px solid var(--border);
    border-radius:var(--radius);background:var(--surface);font-family:inherit;
    font-size:15px;color:var(--text);outline:none;transition:border-color .2s; }
  .input-wrap input:focus { border-color:var(--orange);box-shadow:0 0 0 3px rgba(255,107,26,.12); }
  .input-wrap input.err-border { border-color:var(--orange-dark); }
  .toggle-btn { position:absolute;right:12px;top:50%;transform:translateY(-50%);
    background:none;border:none;cursor:pointer;padding:4px;color:var(--muted);line-height:0; }
  .err { font-size:12px;color:var(--orange-dark);margin-top:5px;display:none; }
  .err.show { display:block; }

  /* Phone */
  .phone-row { display:flex;align-items:stretch;border:1.5px solid var(--border);
    border-radius:var(--radius);background:var(--surface);overflow:hidden;transition:border-color .2s; }
  .phone-row:focus-within { border-color:var(--orange);box-shadow:0 0 0 3px rgba(255,107,26,.12); }
  .phone-row.phone-err { border-color:var(--orange-dark); }
  .country-select { border:none;outline:none;background:transparent;font-family:inherit;
    font-size:14px;color:var(--text);padding:0 10px 0 12px;cursor:pointer;
    height:52px;border-right:1.5px solid var(--border); }
  .phone-row input { flex:1;border:none;outline:none;background:transparent;
    font-family:inherit;font-size:15px;color:var(--text);padding:0 14px;height:52px; }

  /* Strength */
  .strength-bar { display:flex;gap:4px;margin-top:6px; }

  /* Checkboxes */
  .check-row { display:flex;align-items:flex-start;gap:10px;margin-bottom:10px; }
  .check-row input[type=checkbox] { width:20px;height:20px;flex-shrink:0;margin-top:1px;
    accent-color:var(--orange);cursor:pointer; }
  .check-row label { font-size:13px;color:var(--muted);line-height:1.45;cursor:pointer; }
  .check-row a { color:var(--orange);font-weight:700;text-decoration:underline; }

  /* Buttons */
  .btn-primary { display:flex;align-items:center;justify-content:center;gap:8px;
    width:100%;height:54px;background:var(--orange);color:#fff;border:none;
    border-radius:var(--radius);font-family:inherit;font-size:16px;font-weight:700;
    letter-spacing:.3px;cursor:pointer;margin-top:32px;transition:background .2s,transform .1s; }
  .btn-primary:hover   { background:var(--orange-dark); }
  .btn-primary:active  { transform:scale(.98); }
  .btn-primary:disabled{ background:rgba(255,107,26,.45);cursor:not-allowed; }

  .spinner { width:22px;height:22px;border:2.5px solid rgba(255,255,255,.35);
    border-top-color:#fff;border-radius:50%;animation:spin .7s linear infinite; }
  .spinner-orange { width:28px;height:28px;border:3px solid rgba(255,107,26,.2);
    border-top-color:var(--orange);border-radius:50%;animation:spin .7s linear infinite; }
  @keyframes spin { to{transform:rotate(360deg)} }

  .login-row { display:flex;align-items:center;justify-content:center;gap:4px;margin-top:20px; }
  .login-row span { font-size:14px;color:var(--muted); }
  .login-row a { font-size:14px;font-weight:700;color:var(--orange);text-decoration:none; }
  .login-row a:hover { text-decoration:underline; }

  .divider { display:flex;align-items:center;gap:12px;margin:28px 0; }
  .divider hr { flex:1;border:none;border-top:1.5px solid var(--border); }
  .divider span { font-size:12px;color:var(--muted);white-space:nowrap; }

  .app-card { background:var(--surface);border:1.5px solid var(--border);
    border-radius:16px;padding:18px;display:flex;align-items:center;gap:14px; }
  .app-icon { width:48px;height:48px;border-radius:12px;background:var(--orange-soft);
    display:flex;align-items:center;justify-content:center;flex-shrink:0; }
  .app-icon svg { width:26px;height:26px;color:var(--orange); }
  .app-card-text { flex:1; }
  .app-card-text strong { font-size:14px;font-weight:700;display:block;margin-bottom:2px; }
  .app-card-text p { font-size:12px;color:var(--muted);line-height:1.4; }
  .app-card-links { display:flex;flex-direction:column;gap:6px;flex-shrink:0; }
  .store-btn { display:flex;align-items:center;justify-content:center;gap:5px;
    height:30px;padding:0 10px;border:1.5px solid var(--border);border-radius:8px;
    font-family:inherit;font-size:11px;font-weight:700;color:var(--text);
    background:var(--surface);cursor:pointer;text-decoration:none;white-space:nowrap;transition:border-color .15s; }
  .store-btn:hover { border-color:var(--orange);color:var(--orange); }

  .legal { display:flex;justify-content:center;gap:4px;margin-top:20px; }
  .legal a { font-size:12px;color:var(--muted);text-decoration:underline; }
  .legal span { font-size:12px;color:var(--muted); }
`;
