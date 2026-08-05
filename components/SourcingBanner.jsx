'use client';

import Link from 'next/link';

// ─────────────────────────────────────────────
// SourcingBanner — section marketing pour la home, qui pousse vers le
// service de sourcing.
//
// V2 : met en avant le "Sourcing en direct" — l'agent peut inviter le
// client en visio pendant la recherche/vérification d'un produit, sur
// le même mécanisme de co-host que components/GoLive.jsx (accept-cohost,
// agoraUid, secureCall). Voir la note d'architecture en fin de fichier
// pour ce qu'il reste à construire côté backend si ce flux est retenu.
//
// Composant autonome (styles inline + <style> scoping local pour les
// keyframes) — pas d'extraction de module partagé, mêmes conventions
// que AvatarLiveBanner / GoLivebanner / CarrieresBanner / CommandeBanner.
//
// Palette Citrus Orange : bg #FFF8EE, orange #FF6B00, zest #FFB700.
// Le mockup visio reprend un fond sombre (comme GoLive.jsx) pour rester
// lisible en usage vidéo, avec les accents orange de la marque.
// ─────────────────────────────────────────────

const SOURCING_HREF = '/sourcing/ClientDashboard';
const AGENT_HREF = '/sourcing/AgentDashboard';
const DEVENIR_AGENT_HREF = '/sourcing/NouvelAgent';

export default function SourcingBanner() {
  return (
    <section style={styles.section}>
      <style>{`
        @keyframes srcb-pulse {
          0%   { box-shadow: 0 0 0 0 rgba(239,68,68,0.55); }
          70%  { box-shadow: 0 0 0 8px rgba(239,68,68,0); }
          100% { box-shadow: 0 0 0 0 rgba(239,68,68,0); }
        }
        @keyframes srcb-breathe {
          0%, 100% { transform: scale(1); }
          50%      { transform: scale(1.015); }
        }
        .srcb-cta:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 24px rgba(255,107,0,0.35);
        }
        .srcb-cta-outline:hover {
          background: rgba(255,107,0,0.06);
        }
        .srcb-buy-btn:hover {
          transform: scale(1.03);
        }
        @media (max-width: 900px) {
          .srcb-grid { grid-template-columns: 1fr !important; }
          .srcb-preview { order: -1; }
        }
      `}</style>

      <div style={styles.grid} className="srcb-grid">
        {/* ── Colonne texte ─────────────────────── */}
        <div style={styles.copyCol}>
          <span style={styles.eyebrow}>🔴 Nouveau · Sourcing en direct</span>

          <h2 style={styles.title}>
            Introuvable sur FriTok ?
            <br />
            Votre agent vous montre <span style={styles.titleAccent}>en visio</span>
          </h2>

          <p style={styles.subtitle}>
            Décrivez ce que vous cherchez, un agent le déniche — puis vous
            rejoint en direct pour vous montrer le produit sous toutes les
            coutures avant que vous ne validiez l'achat. Comme un live
            shopping, en tête-à-tête.
          </p>

          <ul style={styles.pointList}>
            <li style={styles.point}>
              <span style={styles.pointIcon}>📹</span>
              <div>
                <p style={styles.pointTitle}>Appel vidéo avec votre agent</p>
                <p style={styles.pointDesc}>Il vous rejoint en co-host dès qu'il a trouvé le produit — vous voyez, vous discutez, vous décidez.</p>
              </div>
            </li>
            <li style={styles.point}>
              <span style={styles.pointIcon}>🛒</span>
              <div>
                <p style={styles.pointTitle}>Achat validé pendant l'appel</p>
                <p style={styles.pointDesc}>Plus besoin de repasser par le chat — le bouton d'achat apparaît directement dans la visio.</p>
              </div>
            </li>
            <li style={styles.point}>
              <span style={styles.pointIcon}>🚚</span>
              <div>
                <p style={styles.pointTitle}>Suivi comme un colis classique</p>
                <p style={styles.pointDesc}>Une fois validé, la commande suit le même circuit que vos colis FriTok habituels.</p>
              </div>
            </li>
          </ul>

          <div style={styles.ctaRow}>
            <Link href={SOURCING_HREF} style={styles.ctaPrimary} className="srcb-cta">
              Faire une demande de sourcing
              <ArrowIcon />
            </Link>
            <Link href={DEVENIR_AGENT_HREF} style={styles.ctaOutline} className="srcb-cta-outline">
              Devenir agent sourcing
            </Link>
          </div>

          <Link href={AGENT_HREF} style={styles.agentLink}>
            Déjà agent ? Accéder à mon dashboard →
          </Link>
        </div>

        {/* ── Colonne preview : appel visio agent ↔ client ── */}
        <div style={styles.previewCol} className="srcb-preview">
          <div style={styles.phoneFrame}>
            <div style={styles.phoneNotch} />
            <div style={styles.phoneScreen}>

              {/* Bandeau "en direct" */}
              <div style={styles.liveRow}>
                <span style={styles.livePill}>
                  <span style={styles.livePillDot} />
                  Sourcing en direct
                </span>
                <span style={styles.liveTimer}>04:12</span>
              </div>

              {/* Flux principal : l'agent, produit en main */}
              <div style={styles.mainVideo}>
                <div style={styles.agentAvatar}>WC</div>
                <p style={styles.agentName}>Wei · Agent Guangzhou</p>
                <p style={styles.agentSub}>vous montre le produit</p>

                {/* Vignette co-host : le client */}
                <div style={styles.cohostThumb}>
                  <div style={styles.cohostAvatar}>Vous</div>
                </div>
              </div>

              {/* Carte produit flottante */}
              <div style={styles.productFloat}>
                <div style={styles.productImg}>🚗</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={styles.productName}>Accessoires voiture</p>
                  <p style={styles.productPrice}>5 000 XOF</p>
                </div>
                <button className="srcb-buy-btn" style={styles.buyBtn}>Acheter</button>
              </div>
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
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
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
  titleAccent: {
    color: '#FF6B00',
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 1.6,
    color: '#6B5A48',
    margin: '0 0 28px 0',
    maxWidth: 480,
  },
  pointList: {
    listStyle: 'none',
    padding: 0,
    margin: '0 0 32px 0',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    maxWidth: 480,
  },
  point: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 12,
  },
  pointIcon: {
    fontSize: 20,
    lineHeight: 1,
    marginTop: 2,
    flexShrink: 0,
  },
  pointTitle: {
    margin: 0,
    fontSize: 14.5,
    fontWeight: 700,
    color: '#2A1B0F',
  },
  pointDesc: {
    margin: '3px 0 0',
    fontSize: 13,
    color: '#8A7862',
    lineHeight: 1.5,
  },
  ctaRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 14,
    marginBottom: 16,
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
  ctaOutline: {
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
    transition: 'background 0.15s ease',
  },
  agentLink: {
    fontSize: 13,
    fontWeight: 600,
    color: '#9A8973',
    textDecoration: 'none',
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
    animation: 'srcb-breathe 4s ease-in-out infinite',
  },
  phoneNotch: {
    width: 90,
    height: 18,
    background: '#1A120A',
    borderRadius: 12,
    margin: '0 auto 12px auto',
  },
  phoneScreen: {
    background: '#0E0E12',
    borderRadius: 24,
    padding: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    minHeight: 400,
    position: 'relative',
  },
  liveRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  livePill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    background: 'rgba(239,68,68,0.85)',
    color: '#fff',
    fontSize: 11,
    fontWeight: 700,
    padding: '4px 10px',
    borderRadius: 999,
  },
  livePillDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: '#fff',
    animation: 'srcb-pulse 1.6s ease-out infinite',
  },
  liveTimer: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
    fontWeight: 600,
  },
  mainVideo: {
    flex: 1,
    background: 'linear-gradient(160deg, #2A1B0F, #1A120A)',
    borderRadius: 18,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    position: 'relative',
    padding: 20,
  },
  agentAvatar: {
    width: 64,
    height: 64,
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #FF6B00, #FFB700)',
    color: '#FFF8EE',
    fontWeight: 800,
    fontSize: 22,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  agentName: {
    color: '#fff',
    fontSize: 13.5,
    fontWeight: 700,
    margin: 0,
  },
  agentSub: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11.5,
    margin: '2px 0 0',
  },
  cohostThumb: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 56,
    height: 78,
    borderRadius: 10,
    overflow: 'hidden',
    background: '#2A1B0F',
    border: '2px solid rgba(255,183,0,0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cohostAvatar: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 10.5,
    fontWeight: 700,
  },
  productFloat: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 14,
    padding: 10,
  },
  productImg: {
    width: 40,
    height: 40,
    borderRadius: 10,
    background: 'rgba(255,107,0,0.15)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 18,
    flexShrink: 0,
  },
  productName: {
    margin: 0,
    fontSize: 12.5,
    fontWeight: 700,
    color: '#fff',
  },
  productPrice: {
    margin: '2px 0 0',
    fontSize: 11.5,
    color: '#FFB700',
    fontWeight: 700,
  },
  buyBtn: {
    background: '#FF6B00',
    color: '#fff',
    border: 'none',
    borderRadius: 10,
    padding: '8px 14px',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
    flexShrink: 0,
    transition: 'transform 0.15s ease',
  },
};

/* ─────────────────────────────────────────────────────────────────────────
   NOTE D'ARCHITECTURE — "Sourcing en direct" (co-host agent ↔ client)

   Ce banner ne fait QUE la promotion visuelle du concept — le bouton
   "Acheter" du mockup n'est pas fonctionnel, c'est une maquette. Pour que
   le flux existe réellement, en réutilisant le pattern déjà en place dans
   components/GoLive.jsx (co-host via secureCall + accept-cohost + agoraUid) :

   1. Nouvelle collection Firestore, ex. sourcing_live_sessions/{sessionId}
      — même structure que live_sessions (viewers, co_hosts, likes), mais
      démarrée par l'agent depuis SourcingAgentDashboard.jsx sur une
      sourcing_request précise (channelId lié à requestId).

   2. Nouvelles Netlify Functions (mêmes garanties que start-live/end-live/
      accept-cohost) :
        - start-sourcing-live.js   → l'agent démarre, génère le token Agora
        - invite-sourcing-client.js → équivalent d'accept-cohost, mais à
          l'initiative de l'AGENT qui invite le client (pas l'inverse comme
          dans un live public) — donc une notification est nécessaire côté
          client pour qu'il accepte de rejoindre.
        - confirm-sourcing-purchase.js → le bouton "Acheter" pendant l'appel
          doit rester serveur-only, comme pay-sourcing-request.js existant.

   3. Règles Firestore : même modèle que /live_sessions ci-dessus (lecture
      isAuth, écriture serveur uniquement, co_hosts avec create limité au
      propriétaire du uid), à ajouter pour sourcing_live_sessions.

   4. UI : une page /sourcing/live/[sessionId] réutilisant VideoLayout /
      CoHostThumbs de GoLive.jsx, mais à 2 participants (agent + client)
      plutôt qu'à N spectateurs — plus proche d'un appel vidéo que d'un
      live public.

   Dis-moi si tu veux que je construise cette chaîne (functions + règles +
   page d'appel) — c'est un chantier à part entière, distinct de ce banner.
───────────────────────────────────────────────────────────────────────── */