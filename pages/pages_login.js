// pages/login.js
// ─────────────────────────────────────────────────────────────
// Converti depuis login.html (Netlify) → Next.js
// Route : /login?redirect=/shop?userId=XXX
// Après connexion → redirige vers la page d'origine ou /
// ─────────────────────────────────────────────────────────────
import Head from "next/head";
import { useRouter } from "next/router";
import { useState, useEffect } from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  getAuth, signInWithEmailAndPassword,
  sendPasswordResetEmail, onAuthStateChanged,
} from "firebase/auth";

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

const ERROR_MAP = {
  "auth/user-not-found"      : "Aucun compte trouvé pour cet email.",
  "auth/wrong-password"      : "Mot de passe incorrect.",
  "auth/invalid-email"       : "Adresse email invalide.",
  "auth/user-disabled"       : "Ce compte a été désactivé.",
  "auth/too-many-requests"   : "Trop de tentatives. Réessayez plus tard.",
  "auth/invalid-credential"  : "Email ou mot de passe incorrect.",
};

const validEmail = (v) => /^[\w\-.]+@([\w\-]+\.)+[\w\-]{2,}$/.test(v);

export default function LoginPage() {
  const router = useRouter();
  const redirect = router.query.redirect || "/";

  const [email,      setEmail]      = useState("");
  const [password,   setPassword]   = useState("");
  const [showPw,     setShowPw]     = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [alert,      setAlert]      = useState(null); // {msg, ok}
  const [errors,     setErrors]     = useState({});

  // ── Si déjà connecté → rediriger ──────────────────────────
  useEffect(() => {
    const auth = getAuth(getFirebaseApp());
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user && user.emailVerified) {
        router.replace(redirect);
      } else {
        setCheckingAuth(false);
      }
    });
    return unsub;
  }, [redirect]);

  const showAlert = (msg, ok = false) => setAlert({ msg, ok });

  const validate = () => {
    const e = {};
    if (!email.trim() || !validEmail(email.trim())) e.email = "Adresse email invalide.";
    if (!password.trim())                           e.password = "Mot de passe requis.";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleLogin = async () => {
    setAlert(null);
    if (!validate()) return;
    setLoading(true);
    try {
      const auth = getAuth(getFirebaseApp());
      const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
      if (cred.user.emailVerified) {
        router.replace(redirect);
      } else {
        router.replace(`/verify-email?redirect=${encodeURIComponent(redirect)}`);
      }
    } catch (err) {
      showAlert(ERROR_MAP[err.code] || "Erreur de connexion.");
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = async (e) => {
    e.preventDefault();
    if (!email.trim() || !validEmail(email.trim())) {
      showAlert("Entrez votre email pour réinitialiser le mot de passe.");
      return;
    }
    try {
      const auth = getAuth(getFirebaseApp());
      await sendPasswordResetEmail(auth, email.trim());
      showAlert(`✅ Email envoyé à ${email.trim()}. Vérifiez vos spams.`, true);
    } catch {
      showAlert("Erreur lors de l'envoi.");
    }
  };

  const onKey = (e) => { if (e.key === "Enter") handleLogin(); };

  if (checkingAuth) return <FullLoader />;

  return (
    <>
      <Head>
        <title>FriTok — Se connecter</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
        <style>{CSS}</style>
      </Head>

      <div className="page">
        {/* Header */}
        <div className="header">
          <div className="header-icon"><FlameIcon /></div>
          <h1>FriTok</h1>
          <p>Bienvenue, connectez-vous pour continuer</p>
        </div>

        {/* Body */}
        <div className="body">
          {alert && (
            <div className={`alert show${alert.ok ? " success" : ""}`}>{alert.msg}</div>
          )}

          {/* Email */}
          <div className="field">
            <label className="label" htmlFor="email">Email</label>
            <div className="input-wrap">
              <MailIcon className="prefix" />
              <input
                id="email" type="email" placeholder="votre@email.com"
                autoComplete="email" value={email}
                onChange={e => setEmail(e.target.value)}
                onKeyDown={onKey}
                className={errors.email ? "err-border" : ""}
              />
            </div>
            {errors.email && <span className="err show">{errors.email}</span>}
          </div>

          {/* Password */}
          <div className="field">
            <label className="label" htmlFor="password">Mot de passe</label>
            <div className="input-wrap">
              <LockIcon className="prefix" />
              <input
                id="password" type={showPw ? "text" : "password"}
                placeholder="••••••••" autoComplete="current-password"
                value={password} onChange={e => setPassword(e.target.value)}
                onKeyDown={onKey}
                className={errors.password ? "err-border" : ""}
              />
              <button className="toggle-btn" type="button"
                onClick={() => setShowPw(p => !p)}>
                {showPw ? <EyeOnIcon /> : <EyeOffIcon />}
              </button>
            </div>
            {errors.password && <span className="err show">{errors.password}</span>}
          </div>

          <div className="forgot">
            <a href="#" onClick={handleForgot}>Mot de passe oublié ?</a>
          </div>

          <button className="btn-primary" onClick={handleLogin} disabled={loading}>
            {loading ? <span className="spinner" /> : "Se connecter"}
          </button>

          <div className="register-row">
            <span>Pas encore de compte ?</span>
            <a href={`/register?redirect=${encodeURIComponent(redirect)}`}>Créer un compte</a>
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
const AppCard = () => (
  <div className="app-card">
    <div className="app-icon"><PhoneIcon /></div>
    <div className="app-card-text">
      <strong>Téléchargez l'app FriTok</strong>
      <p>Accès complet pour Vendeurs &amp; Livreurs</p>
    </div>
    <div className="app-card-links">
      <a className="store-btn" href="https://play.google.com/store/apps/details?id=com.fritok" target="_blank" rel="noreferrer">
        <PlayIcon /> Google Play
      </a>
      <a className="store-btn" href="https://apps.apple.com/app/fritok" target="_blank" rel="noreferrer">
        <AppleIcon /> App Store
      </a>
    </div>
  </div>
);

const FullLoader = () => (
  <>
    <style>{CSS}</style>
    <div className="full-loader"><span className="spinner-orange" /></div>
  </>
);

// ── Icônes SVG ───────────────────────────────────────────────
const FlameIcon = () => (
  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z"/>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 16.121A3 3 0 1012.015 11L11 14H9c0 .768.293 1.536.879 2.121z"/>
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
const PhoneIcon = () => (
  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"/>
  </svg>
);
const PlayIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" style={{width:14,height:14}}>
    <path d="M3.18 23.76a2.5 2.5 0 001.68-.5l.1-.08 9.44-9.44-2.7-2.7zM20.46 10.4l-2.77-1.58-3.04 3.04 3.04 3.04 2.8-1.6a1.78 1.78 0 000-2.9zM3 .28a1.76 1.76 0 00-.6 1.36v20.72c0 .54.22 1.02.6 1.37l.07.07 11.6-11.6v-.28L3.07.21z"/>
  </svg>
);
const AppleIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" style={{width:14,height:14}}>
    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98l-.09.06c-.22.14-2.19 1.28-2.17 3.8.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.37 2.78M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11"/>
  </svg>
);

// ─────────────────────────────────────────────────────────────
// CSS — miroir fidèle de login.html
// ─────────────────────────────────────────────────────────────
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
  *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
  :root {
    --bg:#FFFBF5; --surface:#FFFFFF; --orange:#FF6B1A;
    --orange-dark:#E05510; --orange-soft:#FFF0E8;
    --text:#1A1A1A; --muted:#888880; --border:#E8E0D8; --radius:14px;
  }
  html,body { min-height:100%; font-family:'Plus Jakarta Sans',sans-serif;
    background:var(--bg); color:var(--text); }

  .full-loader { position:fixed; inset:0; display:flex;
    align-items:center; justify-content:center; background:var(--bg); }

  .page { display:flex; flex-direction:column; min-height:100vh; }

  /* Header */
  .header { background:var(--orange); padding:env(safe-area-inset-top,0) 28px 28px;
    padding-top:calc(env(safe-area-inset-top,0px) + 40px);
    animation:slideDown .5s cubic-bezier(.22,1,.36,1) both; }
  @keyframes slideDown { from{transform:translateY(-100%);opacity:0} to{transform:translateY(0);opacity:1} }
  .header-icon { width:48px;height:48px;background:rgba(255,255,255,.2);border-radius:14px;
    display:flex;align-items:center;justify-content:center;margin-bottom:16px; }
  .header-icon svg { width:28px;height:28px;color:#fff; }
  .header h1 { color:#fff;font-size:clamp(28px,8vw,36px);font-weight:800;
    letter-spacing:-1.2px;line-height:1; }
  .header p  { color:rgba(255,255,255,.72);font-size:14px;margin-top:6px; }

  /* Body */
  .body { flex:1;padding:36px 28px 40px;
    animation:fadeUp .5s .15s cubic-bezier(.22,1,.36,1) both; }
  @keyframes fadeUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }

  /* Alert */
  .alert { display:none;background:#FFF0E8;border:1.5px solid #FFD4B8;border-radius:12px;
    padding:12px 16px;margin-bottom:24px;font-size:13.5px;color:var(--orange-dark);line-height:1.45; }
  .alert.show { display:block; }
  .alert.success { background:#EDF7ED;border-color:rgba(46,125,50,.3);color:#2E7D32; }

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
  .input-wrap input:focus { border-color:var(--orange);
    box-shadow:0 0 0 3px rgba(255,107,26,.12); }
  .input-wrap input.err-border { border-color:var(--orange-dark); }
  .toggle-btn { position:absolute;right:12px;top:50%;transform:translateY(-50%);
    background:none;border:none;cursor:pointer;padding:4px;color:var(--muted);line-height:0; }
  .err { font-size:12px;color:var(--orange-dark);margin-top:5px;display:none; }
  .err.show { display:block; }

  /* Forgot */
  .forgot { text-align:right;margin-bottom:32px; }
  .forgot a { font-size:13px;color:var(--orange);font-weight:600;text-decoration:none; }
  .forgot a:hover { text-decoration:underline; }

  /* Buttons */
  .btn-primary { display:flex;align-items:center;justify-content:center;gap:8px;
    width:100%;height:54px;background:var(--orange);color:#fff;border:none;
    border-radius:var(--radius);font-family:inherit;font-size:16px;font-weight:700;
    letter-spacing:.3px;cursor:pointer;transition:background .2s,transform .1s; }
  .btn-primary:hover   { background:var(--orange-dark); }
  .btn-primary:active  { transform:scale(.98); }
  .btn-primary:disabled{ background:rgba(255,107,26,.45);cursor:not-allowed; }

  .spinner { width:22px;height:22px;border:2.5px solid rgba(255,255,255,.35);
    border-top-color:#fff;border-radius:50%;animation:spin .7s linear infinite; }
  .spinner-orange { width:28px;height:28px;border:3px solid rgba(255,107,26,.2);
    border-top-color:var(--orange);border-radius:50%;animation:spin .7s linear infinite; }
  @keyframes spin { to{transform:rotate(360deg)} }

  .register-row { display:flex;align-items:center;justify-content:center;gap:4px;margin-top:20px; }
  .register-row span { font-size:14px;color:var(--muted); }
  .register-row a { font-size:14px;font-weight:700;color:var(--orange);text-decoration:none; }
  .register-row a:hover { text-decoration:underline; }

  /* Divider */
  .divider { display:flex;align-items:center;gap:12px;margin:28px 0; }
  .divider hr { flex:1;border:none;border-top:1.5px solid var(--border); }
  .divider span { font-size:12px;color:var(--muted);white-space:nowrap; }

  /* App card */
  .app-card { background:var(--surface);border:1.5px solid var(--border);border-radius:16px;
    padding:18px;display:flex;align-items:center;gap:14px; }
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
    background:var(--surface);cursor:pointer;text-decoration:none;white-space:nowrap;
    transition:border-color .15s; }
  .store-btn:hover { border-color:var(--orange);color:var(--orange); }

  /* Legal */
  .legal { display:flex;justify-content:center;gap:4px;margin-top:20px; }
  .legal a { font-size:12px;color:var(--muted);text-decoration:underline; }
  .legal span { font-size:12px;color:var(--muted); }
`;
