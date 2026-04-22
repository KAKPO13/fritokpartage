// pages/verify-email.js
// ─────────────────────────────────────────────────────────────
// Converti depuis verify_email.html (Netlify) → Next.js
// Route : /verify-email?redirect=/shop?userId=XXX
// ─────────────────────────────────────────────────────────────
import Head from "next/head";
import { useRouter } from "next/router";
import { useState, useEffect, useRef } from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  getAuth, onAuthStateChanged, signOut,
  sendEmailVerification, reload,
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

const COOLDOWN_SEC = 30;

export default function VerifyEmailPage() {
  const router   = useRouter();
  const redirect = router.query.redirect || "/";

  const [user,         setUser]         = useState(null);
  const [checking,     setChecking]     = useState(false);
  const [resending,    setResending]    = useState(false);
  const [cooldown,     setCooldown]     = useState(0);      // secondes restantes
  const [alert,        setAlert]        = useState(null);   // {msg, ok}
  const timerRef = useRef(null);

  // ── Observer d'état Firebase ──────────────────────────────
  useEffect(() => {
    const auth  = getAuth(getFirebaseApp());
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) { router.replace(`/login?redirect=${encodeURIComponent(redirect)}`); return; }
      setUser(u);
      if (u.emailVerified) router.replace(redirect);
    });
    return () => { unsub(); clearInterval(timerRef.current); };
  }, [redirect]);

  const showAlert = (msg, ok = false) => setAlert({ msg, ok });

  // ── Lancer le décompte de renvoi ─────────────────────────
  const startCooldown = () => {
    setCooldown(COOLDOWN_SEC);
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCooldown(prev => {
        if (prev <= 1) { clearInterval(timerRef.current); return 0; }
        return prev - 1;
      });
    }, 1000);
  };

  // ── Vérifier si l'email est confirmé ─────────────────────
  const handleCheck = async () => {
    if (!user) return;
    setAlert(null);
    setChecking(true);
    try {
      await reload(user);
      // reload() met à jour l'objet user en place
      const auth = getAuth(getFirebaseApp());
      const fresh = auth.currentUser;
      if (fresh?.emailVerified) {
        showAlert("✅ Email vérifié ! Redirection en cours…", true);
        setTimeout(() => router.replace(redirect), 1500);
      } else {
        showAlert("Email non encore vérifié. Cliquez sur le lien dans l'email puis réessayez.");
      }
    } catch {
      showAlert("Erreur lors de la vérification. Vérifiez votre connexion.");
    } finally {
      setChecking(false);
    }
  };

  // ── Renvoyer l'email ──────────────────────────────────────
  const handleResend = async () => {
    if (!user || cooldown > 0) return;
    setAlert(null);
    setResending(true);
    try {
      await sendEmailVerification(user);
      showAlert(`✅ Email renvoyé à ${user.email}. Vérifiez vos spams.`, true);
      startCooldown();
    } catch (err) {
      showAlert(
        err.code === "auth/too-many-requests"
          ? "Trop de tentatives. Réessayez dans quelques minutes."
          : "Erreur lors de l'envoi."
      );
    } finally {
      setResending(false);
    }
  };

  // ── Changer de compte ─────────────────────────────────────
  const handleSwitch = async () => {
    clearInterval(timerRef.current);
    const auth = getAuth(getFirebaseApp());
    try { await signOut(auth); } catch {}
    router.replace(`/login?redirect=${encodeURIComponent(redirect)}`);
  };

  const cooldownPct = cooldown > 0 ? (cooldown / COOLDOWN_SEC) * 100 : 0;

  return (
    <>
      <Head>
        <title>FriTok — Vérification email</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <style>{CSS}</style>
      </Head>

      <div className="page">
        {/* Header */}
        <div className="header">
          <div className="header-icon"><MailLetterIcon /></div>
          <h1>Vérifiez votre email</h1>
          <p>Dernière étape avant de commencer</p>
        </div>

        <div className="body">
          {/* Icône pulsante */}
          <div className="email-icon-wrap">
            <div className="pulse-ring" />
            <div className="email-icon-circle"><MailIcon /></div>
          </div>

          {alert && (
            <div className={`alert show${alert.ok ? " success" : ""}`}>{alert.msg}</div>
          )}

          {/* Carte info */}
          <div className="info-card">
            <p className="subtitle">Un email de vérification a été envoyé à :</p>
            <p className="email-addr">{user?.email ?? "—"}</p>
            <div className="hint-box">
              <InfoIcon />
              <p>Cliquez sur le lien dans l'email, puis revenez ici et appuyez sur le bouton ci-dessous.</p>
            </div>
          </div>

          {/* Bouton vérifier */}
          <button className="btn-primary" onClick={handleCheck} disabled={checking}>
            {checking ? <span className="spinner" /> : "J'ai vérifié mon email"}
          </button>

          {/* Barre de cooldown */}
          {cooldown > 0 && (
            <div className="cooldown-bar-wrap">
              <div className="cooldown-bar" style={{ width: `${cooldownPct}%` }} />
            </div>
          )}

          {/* Bouton renvoyer */}
          <button
            className="btn-outline"
            onClick={handleResend}
            disabled={resending || cooldown > 0}
          >
            {resending
              ? <span className="spinner-orange" />
              : <><SendIcon /><span>{cooldown > 0 ? `Renvoyer dans ${cooldown} s` : "Renvoyer l'email"}</span></>
            }
          </button>

          {/* Aide */}
          <div className="help">
            <p>Vous ne trouvez pas l'email ?</p>
            <p><em>Vérifiez vos spams ou courriers indésirables.</em></p>
            <button className="switch-account" onClick={handleSwitch}>
              Utiliser un autre compte
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Icônes SVG ───────────────────────────────────────────────
const MailLetterIcon = () => (
  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 19v-8.93a2 2 0 01.89-1.664l7-4.666a2 2 0 012.22 0l7 4.666A2 2 0 0121 10.07V19M3 19a2 2 0 002 2h14a2 2 0 002-2M3 19l6.75-4.5M21 19l-6.75-4.5M3 10l6.75 4.5M21 10l-6.75 4.5m0 0l-1.14.76a2 2 0 01-2.22 0l-1.14-.76"/>
  </svg>
);
const MailIcon = () => (
  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.7">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
  </svg>
);
const InfoIcon = () => (
  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"
    style={{width:18,height:18,color:"#2E7D32",flexShrink:0,marginTop:1}}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
  </svg>
);
const SendIcon = () => (
  <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/>
  </svg>
);

// ─────────────────────────────────────────────────────────────
// CSS — miroir fidèle de verify_email.html
// ─────────────────────────────────────────────────────────────
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
  *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
  :root {
    --bg:#FFFBF5; --surface:#FFFFFF; --orange:#FF6B1A; --orange-dark:#E05510;
    --orange-soft:#FFF0E8; --text:#1A1A1A; --muted:#888880; --border:#E8E0D8;
    --success-bg:#EDF7ED; --success:#2E7D32; --radius:14px;
  }
  html,body { min-height:100%; font-family:'Plus Jakarta Sans',sans-serif;
    background:var(--bg); color:var(--text); }

  .page { display:flex; flex-direction:column; min-height:100vh; }

  .header { background:var(--orange); padding:env(safe-area-inset-top,0) 28px 28px;
    padding-top:calc(env(safe-area-inset-top,0px) + 40px);
    animation:slideDown .5s cubic-bezier(.22,1,.36,1) both; }
  @keyframes slideDown { from{transform:translateY(-100%);opacity:0} to{transform:translateY(0);opacity:1} }
  .header-icon { width:44px;height:44px;background:rgba(255,255,255,.2);border-radius:12px;
    display:flex;align-items:center;justify-content:center;margin-bottom:14px; }
  .header-icon svg { width:24px;height:24px;color:#fff; }
  .header h1 { color:#fff;font-size:clamp(22px,7vw,30px);font-weight:800;letter-spacing:-.8px; }
  .header p  { color:rgba(255,255,255,.72);font-size:13px;margin-top:5px; }

  .body { flex:1;padding:40px 28px 48px;display:flex;flex-direction:column;align-items:center;
    animation:fadeUp .5s .15s cubic-bezier(.22,1,.36,1) both; }
  @keyframes fadeUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }

  /* Icône pulsante */
  .email-icon-wrap { position:relative;width:96px;height:96px;display:flex;
    align-items:center;justify-content:center;margin-bottom:28px; }
  .pulse-ring { position:absolute;inset:0;border-radius:50%;
    background:rgba(255,107,26,.12);animation:pulse 2s ease-out infinite; }
  @keyframes pulse { 0%{transform:scale(.8);opacity:.8} 70%{transform:scale(1.2);opacity:0} 100%{transform:scale(1.2);opacity:0} }
  .email-icon-circle { position:relative;z-index:1;width:80px;height:80px;border-radius:50%;
    background:var(--orange-soft);display:flex;align-items:center;justify-content:center; }
  .email-icon-circle svg { width:40px;height:40px;color:var(--orange); }

  /* Alert */
  .alert { display:none;background:#FFF0E8;border:1.5px solid #FFD4B8;border-radius:12px;
    padding:12px 16px;margin-bottom:20px;font-size:13.5px;color:var(--orange-dark);
    line-height:1.45;width:100%; }
  .alert.show { display:block; }
  .alert.success { background:var(--success-bg);border-color:rgba(46,125,50,.3);color:var(--success); }

  /* Info card */
  .info-card { width:100%;background:var(--surface);border:1.5px solid var(--border);
    border-radius:16px;padding:22px;margin-bottom:24px;text-align:center; }
  .subtitle { font-size:14px;color:var(--muted);line-height:1.5; }
  .email-addr { font-size:15px;font-weight:700;color:var(--orange);margin:10px 0 16px;word-break:break-all; }
  .hint-box { display:flex;align-items:flex-start;gap:10px;background:var(--success-bg);
    border-radius:10px;padding:12px 14px;text-align:left; }
  .hint-box p { font-size:13px;color:var(--success);line-height:1.45; }

  /* Buttons */
  .btn-primary { display:flex;align-items:center;justify-content:center;gap:8px;
    width:100%;height:54px;background:var(--orange);color:#fff;border:none;
    border-radius:var(--radius);font-family:inherit;font-size:16px;font-weight:700;
    letter-spacing:.3px;cursor:pointer;margin-bottom:14px;transition:background .2s,transform .1s; }
  .btn-primary:hover   { background:var(--orange-dark); }
  .btn-primary:active  { transform:scale(.98); }
  .btn-primary:disabled{ background:rgba(255,107,26,.45);cursor:not-allowed; }

  .btn-outline { display:flex;align-items:center;justify-content:center;gap:8px;
    width:100%;height:54px;background:transparent;color:var(--orange);
    border:1.5px solid var(--orange);border-radius:var(--radius);font-family:inherit;
    font-size:15px;font-weight:600;cursor:pointer;margin-bottom:32px;
    transition:border-color .2s,color .2s,background .2s; }
  .btn-outline:hover    { background:var(--orange-soft); }
  .btn-outline:disabled { border-color:var(--border);color:var(--muted);cursor:not-allowed;background:transparent; }

  .spinner { width:22px;height:22px;border:2.5px solid rgba(255,255,255,.35);
    border-top-color:#fff;border-radius:50%;animation:spin .7s linear infinite; }
  .spinner-orange { width:22px;height:22px;border:2.5px solid rgba(255,107,26,.25);
    border-top-color:var(--orange);border-radius:50%;animation:spin .7s linear infinite; }
  @keyframes spin { to{transform:rotate(360deg)} }

  /* Cooldown bar */
  .cooldown-bar-wrap { width:100%;height:3px;background:var(--border);border-radius:2px;
    margin-bottom:14px;overflow:hidden; }
  .cooldown-bar { height:100%;background:var(--orange);border-radius:2px;transition:width 1s linear; }

  /* Help */
  .help { text-align:center;width:100%; }
  .help p { font-size:13px;color:var(--muted);line-height:1.5; }
  .help p em { font-style:italic; }
  .switch-account { display:inline-block;margin-top:20px;font-size:13px;color:var(--muted);
    text-decoration:underline;cursor:pointer;background:none;border:none;font-family:inherit; }
  .switch-account:hover { color:var(--orange-dark); }
`;
