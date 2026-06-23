'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';


// ─────────────────────────────────────────────
// 📡 LiveBanner — Section marketing "Vendez en direct"
// À insérer dans la home page entre LiveGrid et DeliveryMap
//
// Usage dans pages/index.jsx (ou app/page.jsx) :
//   import LiveBanner from '../components/LiveBanner';
//   <LiveBanner />
//
// Route cible : /live (GoLivePage)
// ─────────────────────────────────────────────

const LIVE_FEATURES = [
  { icon: '🎙️', title: 'Co-hosts en direct', desc: 'Invitez jusqu\'à 3 viewers sur scène.' },
  { icon: '🌐', title: 'Traduction auto', desc: 'Vendeurs 🇨🇳 → sous-titres 🇫🇷 en temps réel.' },
  { icon: '🛍️', title: 'Panier live', desc: 'Vos produits achetables pendant le stream.' },
  { icon: '📊', title: 'Engagement live', desc: 'Likes, cadeaux et spectateurs en un clic.' },
];

// Pulse animation keyframes via CSS-in-JS string injected once
const PULSE_CSS = `
@keyframes fritok-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%       { opacity: 0.6; transform: scale(1.25); }
}
@keyframes fritok-shimmer {
  0%   { background-position: -200% center; }
  100% { background-position: 200% center; }
}
`;

export default function LiveBanner() {
  const [liveCount, setLiveCount] = useState(47);

  // Inject keyframes once
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (document.getElementById('fritok-live-css')) return;
    const style = document.createElement('style');
    style.id = 'fritok-live-css';
    style.textContent = PULSE_CSS;
    document.head.appendChild(style);
  }, []);

  // Simulate fluctuating live count
  useEffect(() => {
    const t = setInterval(() => {
      setLiveCount(c => c + Math.floor(Math.random() * 5) - 2);
    }, 3500);
    return () => clearInterval(t);
  }, []);

  return (
    <section style={{
      background: 'linear-gradient(160deg, #0f0a1e 0%, #1a0a2e 50%, #0f0a1e 100%)',
      padding: '80px 24px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Background glow orbs */}
      <div aria-hidden style={{
        position: 'absolute', top: -80, left: '20%',
        width: 400, height: 400, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(239,68,68,0.12) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />
      <div aria-hidden style={{
        position: 'absolute', bottom: -60, right: '15%',
        width: 360, height: 360, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(168,85,247,0.1) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      <div style={{ maxWidth: 1080, margin: '0 auto', position: 'relative', zIndex: 1 }}>

        {/* ── Header ── */}
        <div style={{ textAlign: 'center', marginBottom: 56 }}>
          {/* Live badge */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: 'rgba(239,68,68,0.12)', borderRadius: 24,
            padding: '6px 16px', marginBottom: 20,
            border: '1px solid rgba(239,68,68,0.25)',
          }}>
            <span style={{
              width: 10, height: 10, borderRadius: '50%', background: '#EF4444',
              display: 'inline-block',
              animation: 'fritok-pulse 1.4s ease-in-out infinite',
            }} />
            <span style={{ color: '#FCA5A5', fontSize: 13, fontWeight: 700, letterSpacing: 0.5 }}>
              {liveCount} vendeurs en direct maintenant
            </span>
          </div>

          <h2 style={{
            fontSize: 'clamp(32px, 5vw, 54px)',
            fontWeight: 900,
            color: '#ffffff',
            margin: '0 0 16px',
            lineHeight: 1.1,
            letterSpacing: -1.5,
          }}>
            Vendez en{' '}
            <span style={{
              background: 'linear-gradient(90deg, #EF4444, #A855F7, #F97316)',
              backgroundSize: '200% auto',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              animation: 'fritok-shimmer 3s linear infinite',
            }}>
              direct
            </span>
            {' '}sur FriTok
          </h2>

          <p style={{
            color: 'rgba(255,255,255,0.6)', fontSize: 18,
            maxWidth: 520, margin: '0 auto',
            lineHeight: 1.65,
          }}>
            Lancez votre live en 10 secondes. Présentez vos produits, interagissez avec vos clients
            et boostez vos ventes — depuis n&apos;importe quel appareil.
          </p>
        </div>

        {/* ── Feature grid ── */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 16,
          marginBottom: 52,
        }}>
          {LIVE_FEATURES.map(f => (
            <div key={f.title} style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 16,
              padding: '20px 20px 18px',
              transition: 'background .2s, border-color .2s',
            }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.07)';
                e.currentTarget.style.borderColor = 'rgba(168,85,247,0.25)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
              }}
            >
              <div style={{ fontSize: 28, marginBottom: 10 }}>{f.icon}</div>
              <p style={{ color: '#fff', fontWeight: 700, fontSize: 15, margin: '0 0 5px' }}>{f.title}</p>
              <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13, margin: 0, lineHeight: 1.5 }}>{f.desc}</p>
            </div>
          ))}
        </div>

        {/* ── CTA ── */}
        <div style={{ textAlign: 'center', display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/golive" style={{
            display: 'inline-flex', alignItems: 'center', gap: 10,
            padding: '15px 36px', borderRadius: 50,
            background: 'linear-gradient(135deg, #EF4444, #DC2626)',
            color: '#fff', fontWeight: 800, fontSize: 17,
            textDecoration: 'none',
            boxShadow: '0 0 32px rgba(239,68,68,0.35)',
            transition: 'transform .15s, box-shadow .15s',
          }}
            onMouseEnter={e => {
              e.currentTarget.style.transform = 'scale(1.04)';
              e.currentTarget.style.boxShadow = '0 0 48px rgba(239,68,68,0.5)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.boxShadow = '0 0 32px rgba(239,68,68,0.35)';
            }}
          >
            <span style={{
              width: 10, height: 10, borderRadius: '50%', background: '#fff',
              display: 'inline-block',
              animation: 'fritok-pulse 1.4s ease-in-out infinite',
            }} />
            Démarrer mon live
          </Link>

          <Link href="/live/explore" style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '15px 32px', borderRadius: 50,
            background: 'rgba(255,255,255,0.07)',
            border: '1px solid rgba(255,255,255,0.15)',
            color: 'rgba(255,255,255,0.85)', fontWeight: 600, fontSize: 17,
            textDecoration: 'none',
            transition: 'background .15s',
          }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; }}
          >
            Regarder les lives →
          </Link>
        </div>

        {/* ── Social proof strip ── */}
        <div style={{
          marginTop: 48,
          display: 'flex', justifyContent: 'center', gap: 36, flexWrap: 'wrap',
        }}>
          {[
            { stat: '10s', label: 'Pour démarrer' },
            { stat: '3', label: 'Co-hosts max' },
            { stat: '7+', label: 'Langues traduites' },
            { stat: '0 FCFA', label: 'Pour commencer' },
          ].map(s => (
            <div key={s.stat} style={{ textAlign: 'center' }}>
              <p style={{ color: '#fff', fontWeight: 900, fontSize: 26, margin: 0, lineHeight: 1 }}>{s.stat}</p>
              <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12, margin: '4px 0 0' }}>{s.label}</p>
            </div>
          ))}
        </div>

      </div>
    </section>
  );
}
