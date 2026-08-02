'use client';

import Link from 'next/link';

// ─────────────────────────────────────────────
// SourcingBanner — section marketing pour la home, qui pousse vers le
// service de sourcing : le client publie ce qu'il cherche, un agent
// (voir components/sourcing/SourcingAgentDashboard.jsx) le trouve et
// livre — utile quand le produit n'est pas déjà dans le catalogue.
//
// Composant autonome (styles inline + <style> scoping local pour les
// keyframes) — pas d'extraction de module partagé, mêmes conventions
// que AvatarLiveBanner / GoLivebanner / CarrieresBanner / CommandeBanner.
//
// Palette Citrus Orange : bg #FFF8EE, orange #FF6B00, zest #FFB700.
// ─────────────────────────────────────────────

const SOURCING_HREF = '/sourcing/ClientDashboard';
const AGENT_HREF = '/vendeur/devenir-agent-sourcing';

const DEMO_ITEMS = [
  { titre: 'Robe wax sur-mesure', tag: "Mode · d'après photo", statut: 'trouve' },
  { titre: 'Groupe électrogène 3kVA', tag: 'Électro · en cours', statut: 'en_cours' },
  { titre: 'Pièce moto CG125', tag: 'Auto · Marché Adjamé', statut: 'introuvable' },
];

const STATUT_STYLE = {
  trouve:      { label: 'Trouvé',      couleur: '#34C759' },
  en_cours:    { label: 'En cours',    couleur: '#FFB700' },
  introuvable: { label: 'Introuvable', couleur: '#EF4444' },
};

export default function SourcingBanner() {
  return (
    <section style={styles.section}>
      <style>{`
        @keyframes srcb-pulse {
          0%   { box-shadow: 0 0 0 0 rgba(255,183,0,0.55); }
          70%  { box-shadow: 0 0 0 8px rgba(255,183,0,0); }
          100% { box-shadow: 0 0 0 0 rgba(255,183,0,0); }
        }
        @keyframes srcb-float {
          0%, 100% { transform: translateY(0px); }
          50%      { transform: translateY(-10px); }
        }
        .srcb-card:hover {
          transform: translateY(-4px);
          border-color: #FF6B00;
        }
        .srcb-cta:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 24px rgba(255,107,0,0.35);
        }
        @media (max-width: 900px) {
          .srcb-grid { grid-template-columns: 1fr !important; }
          .srcb-preview { order: -1; }
        }
      `}</style>

      <div style={styles.grid} className="srcb-grid">
        {/* ── Colonne texte ─────────────────────── */}
        <div style={styles.copyCol}>
          <span style={styles.eyebrow}>🔍 Nouveau · Sourcing</span>

          <h2 style={styles.title}>
            Introuvable sur FriTok ?
            <br />
            On vous le trouve quand même
          </h2>

          <p style={styles.subtitle}>
            Décrivez le produit que vous cherchez — même une photo suffit — et
            un agent sourcing s'occupe de le dénicher, de vous faire un devis
            et de vous le livrer.
          </p>

          <ul style={styles.pointList}>
            <li style={styles.point}>
              <span style={styles.pointDot} />
              Demande envoyée en 2 minutes, suivi en temps réel du statut
            </li>
            <li style={styles.point}>
              <span style={styles.pointDot} />
              Un agent vérifie chaque article et vous envoie un devis avant achat
            </li>
            <li style={styles.point}>
              <span style={styles.pointDot} />
              Paiement sécurisé, livraison suivie comme un colis classique
            </li>
          </ul>

          <div style={styles.ctaRow}>
            <Link href={SOURCING_HREF} style={styles.ctaPrimary} className="srcb-cta">
              Faire une demande de sourcing
              <ArrowIcon />
            </Link>
            <Link href={AGENT_HREF} style={styles.ctaSecondary}>
              Devenir agent sourcing
            </Link>
          </div>
        </div>

        {/* ── Colonne preview (mock du dashboard agent) ── */}
        <div style={styles.previewCol} className="srcb-preview">
          <div style={styles.phoneFrame}>
            <div style={styles.phoneNotch} />
            <div style={styles.phoneScreen}>
              {DEMO_ITEMS.map((item, i) => {
                const st = STATUT_STYLE[item.statut];
                return (
                  <div
                    key={item.titre}
                    className="srcb-card"
                    style={{
                      ...styles.itemCard,
                      animation: `srcb-float 5s ease-in-out ${i * 0.6}s infinite`,
                    }}
                  >
                    <div style={styles.itemThumb}>
                      <span style={styles.itemInitial}>{item.titre.charAt(0)}</span>
                      {item.statut === 'en_cours' && (
                        <span style={styles.itemDotWrap}>
                          <span style={styles.itemDot} />
                        </span>
                      )}
                    </div>
                    <div style={styles.itemInfo}>
                      <p style={styles.itemName}>{item.titre}</p>
                      <p style={styles.itemTag}>{item.tag}</p>
                    </div>
                    <div style={{ ...styles.itemBadge, color: st.couleur, border: `1px solid ${st.couleur}` }}>
                      {st.label}
                    </div>
                  </div>
                );
              })}
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
  itemCard: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    background: '#FFFFFF',
    border: '1.5px solid #FFE1B8',
    borderRadius: 16,
    padding: 10,
    transition: 'transform 0.15s ease, border-color 0.15s ease',
  },
  itemThumb: {
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
  itemInitial: {
    color: '#FFF8EE',
    fontWeight: 800,
    fontSize: 17,
  },
  itemDotWrap: {
    position: 'absolute',
    top: -3,
    right: -3,
    width: 12,
    height: 12,
    borderRadius: '50%',
    background: '#FFB700',
    border: '2px solid #FFFFFF',
    animation: 'srcb-pulse 1.8s ease-out infinite',
  },
  itemDot: {
    display: 'block',
    width: '100%',
    height: '100%',
  },
  itemInfo: {
    flex: 1,
    minWidth: 0,
  },
  itemName: {
    margin: 0,
    fontSize: 13.5,
    fontWeight: 700,
    color: '#2A1B0F',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  itemTag: {
    margin: '2px 0 0 0',
    fontSize: 11.5,
    color: '#9A8973',
  },
  itemBadge: {
    fontSize: 10.5,
    fontWeight: 700,
    padding: '4px 9px',
    borderRadius: 999,
    flexShrink: 0,
    whiteSpace: 'nowrap',
  },
};