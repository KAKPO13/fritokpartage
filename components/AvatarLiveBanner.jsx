'use client';

import Link from 'next/link';

// ─────────────────────────────────────────────
// AvatarLiveBanner — section marketing pour la home, qui pousse vers
// le flux vertical `MultiLiveFeedPage` (app/live-avatars/Multilivefeedpage).
//
// Composant autonome (styles inline + <style> scoping local pour les
// keyframes, comme demandé) — pas d'extraction de module partagé,
// mêmes conventions que GoLivebanner / CarrieresBanner / CommandeBanner.
//
// Palette Citrus Orange : bg #FFF8EE, orange #FF6B00, zest #FFB700.
// ─────────────────────────────────────────────

const AVATAR_LIVE_HREF = '/live-avatars';

const DEMO_LIVES = [
  { name: 'SùSù Textile', tag: 'Linge · Cotonou', viewers: '1.2k', seed: 'S' },
  { name: 'Couloir de Adjamé', tag: 'Mode · Abidja', viewers: '860', seed: 'C' },
  { name: 'Assigamè', tag: 'Épicerie · Lomé', viewers: '540', seed: 'F' },
];

export default function AvatarLiveBanner() {
  return (
    <section style={styles.section}>
      <style>{`
        @keyframes avlb-pulse {
          0%   { box-shadow: 0 0 0 0 rgba(255,69,58,0.55); }
          70%  { box-shadow: 0 0 0 8px rgba(255,69,58,0); }
          100% { box-shadow: 0 0 0 0 rgba(255,69,58,0); }
        }
        @keyframes avlb-float {
          0%, 100% { transform: translateY(0px); }
          50%      { transform: translateY(-10px); }
        }
        .avlb-card:hover {
          transform: translateY(-4px);
          border-color: #FF6B00;
        }
        .avlb-cta:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 24px rgba(255,107,0,0.35);
        }
        @media (max-width: 900px) {
          .avlb-grid { grid-template-columns: 1fr !important; }
          .avlb-preview { order: -1; }
        }
      `}</style>

      <div style={styles.grid} className="avlb-grid">
        {/* ── Colonne texte ─────────────────────── */}
        <div style={styles.copyCol}>
          <span style={styles.eyebrow}>🤖 Nouveau · Avatars IA</span>

          <h2 style={styles.title}>
            Des lives shopping qui tournent
            <br />
            même quand vous dormez
          </h2>

          <p style={styles.subtitle}>
            Un avatar IA présente vos produits en direct, répond aux questions
            et encaisse les commandes — pas besoin de caméra, ni d'être devant
            l'écran 24h/24.
          </p>

          <ul style={styles.pointList}>
            <li style={styles.point}>
              <span style={styles.pointDot} />
              Vos fiches produits transformées en live vidéo en quelques minutes
            </li>
            <li style={styles.point}>
              <span style={styles.pointDot} />
              Chat, likes et commandes en temps réel, comme un vrai live
            </li>
            <li style={styles.point}>
              <span style={styles.pointDot} />
              Visible dans le flux vertical à côté des lives classiques
            </li>
          </ul>

          <div style={styles.ctaRow}>
            <Link href={AVATAR_LIVE_HREF} style={styles.ctaPrimary} className="avlb-cta">
              Voir les lives avatar
              <ArrowIcon />
            </Link>
            <Link href="/live-avatars/creer" style={styles.ctaSecondary}>
              Créer mon avatar vendeur
            </Link>
          </div>
        </div>

        {/* ── Colonne preview (mock du feed vertical) ── */}
        <div style={styles.previewCol} className="avlb-preview">
          <div style={styles.phoneFrame}>
            <div style={styles.phoneNotch} />
            <div style={styles.phoneScreen}>
              {DEMO_LIVES.map((live, i) => (
                <div
                  key={live.name}
                  className="avlb-card"
                  style={{
                    ...styles.liveCard,
                    animation: `avlb-float 5s ease-in-out ${i * 0.6}s infinite`,
                  }}
                >
                  <div style={styles.liveThumb}>
                    <span style={styles.liveInitial}>{live.seed}</span>
                    <span style={styles.liveDotWrap}>
                      <span style={styles.liveDot} />
                    </span>
                  </div>
                  <div style={styles.liveInfo}>
                    <p style={styles.liveName}>{live.name}</p>
                    <p style={styles.liveTag}>{live.tag}</p>
                  </div>
                  <div style={styles.liveBadge}>
                    <EyeIcon />
                    {live.viewers}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ───────────── Icônes ───────────── */
function ArrowIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}
function EyeIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

/* ───────────── Styles ───────────── */
const styles = {
  section: {
    background: '#FFF8EE',
    padding: '72px 24px',
  },
  grid: {
    maxWidth: 1120,
    margin: '0 auto',
    display: 'grid',
    gridTemplateColumns: '1.05fr 0.95fr',
    gap: 56,
    alignItems: 'center',
  },
  copyCol: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  eyebrow: {
    display: 'inline-block',
    background: '#FFEFD9',
    color: '#B24E00',
    border: '1px solid #FFD39A',
    borderRadius: 999,
    padding: '6px 14px',
    fontSize: 13,
    fontWeight: 700,
    marginBottom: 18,
  },
  title: {
    fontSize: 34,
    lineHeight: 1.18,
    fontWeight: 800,
    color: '#2A1B0F',
    margin: '0 0 16px 0',
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 1.6,
    color: '#6B5A48',
    margin: '0 0 24px 0',
    maxWidth: 480,
  },
  pointList: {
    listStyle: 'none',
    padding: 0,
    margin: '0 0 32px 0',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  point: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 10,
    fontSize: 15,
    color: '#3A2C1D',
    lineHeight: 1.5,
  },
  pointDot: {
    marginTop: 7,
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: '#FF6B00',
    flexShrink: 0,
  },
  ctaRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 14,
  },
  ctaPrimary: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    background: '#FF6B00',
    color: '#FFF8EE',
    fontWeight: 700,
    fontSize: 15,
    padding: '14px 24px',
    borderRadius: 14,
    textDecoration: 'none',
    transition: 'transform 0.15s ease, box-shadow 0.15s ease',
  },
  ctaSecondary: {
    display: 'inline-flex',
    alignItems: 'center',
    fontWeight: 700,
    fontSize: 15,
    padding: '14px 22px',
    borderRadius: 14,
    color: '#B24E00',
    border: '1.5px solid #FFD39A',
    textDecoration: 'none',
    background: 'transparent',
  },
  previewCol: {
    display: 'flex',
    justifyContent: 'center',
  },
  phoneFrame: {
    width: 300,
    borderRadius: 36,
    background: '#1A120A',
    padding: '18px 12px',
    boxShadow: '0 24px 60px rgba(42,27,15,0.25)',
    position: 'relative',
  },
  phoneNotch: {
    width: 90,
    height: 18,
    background: '#1A120A',
    borderRadius: 12,
    margin: '0 auto 12px auto',
  },
  phoneScreen: {
    background: '#FFF3E2',
    borderRadius: 24,
    padding: 14,
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  liveCard: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    background: '#FFFFFF',
    border: '1.5px solid #FFE1B8',
    borderRadius: 16,
    padding: 10,
    transition: 'transform 0.15s ease, border-color 0.15s ease',
  },
  liveThumb: {
    position: 'relative',
    width: 44,
    height: 44,
    borderRadius: 12,
    background: 'linear-gradient(135deg, #FF6B00, #FFB700)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  liveInitial: {
    color: '#FFF8EE',
    fontWeight: 800,
    fontSize: 17,
  },
  liveDotWrap: {
    position: 'absolute',
    top: -3,
    right: -3,
    width: 12,
    height: 12,
    borderRadius: '50%',
    background: '#FF453A',
    border: '2px solid #FFFFFF',
    animation: 'avlb-pulse 1.8s ease-out infinite',
  },
  liveDot: {
    display: 'block',
    width: '100%',
    height: '100%',
  },
  liveInfo: {
    flex: 1,
    minWidth: 0,
  },
  liveName: {
    margin: 0,
    fontSize: 13.5,
    fontWeight: 700,
    color: '#2A1B0F',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  liveTag: {
    margin: '2px 0 0 0',
    fontSize: 11.5,
    color: '#9A8973',
  },
  liveBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    background: 'rgba(0,0,0,0.75)',
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: 700,
    padding: '5px 9px',
    borderRadius: 999,
    flexShrink: 0,
  },
};