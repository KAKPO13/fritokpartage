// components/app/RentalAlertBanner.jsx
// ─────────────────────────────────────────────────────────────────────────────
//  Bannière in-app affichée au-dessus du contenu quand une alerte est active
// ─────────────────────────────────────────────────────────────────────────────

export default function RentalAlertBanner({ alerts, onDismiss, onNav }) {
  if (!alerts?.length) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '8px 16px 0' }}>
      {alerts.map(alert => (
        <div
          key   = {alert.id}
          style = {{
            display      : 'flex',
            alignItems   : 'center',
            gap          : 10,
            padding      : '12px 14px',
            borderRadius : 14,
            background   : alert.type === 'limit' ? '#FEE2E2' : '#FEF3C7',
            border       : `1.5px solid ${alert.type === 'limit' ? '#E53E0055' : '#B4530955'}`,
            animation    : alert.type === 'limit' ? 'ftpulse 1.5s ease-in-out infinite' : 'none',
          }}
        >
          <span style={{ fontSize: 22, flexShrink: 0 }}>
            {alert.type === 'limit' ? '🚨' : '⏱️'}
          </span>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize  : 13, fontWeight: 700,
              color     : alert.type === 'limit' ? '#E53E00' : '#B45309',
              lineHeight: 1.3,
            }}>
              {alert.message}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            {/* Bouton Rendre */}
            <button
              onClick = {() => onNav('return')}
              style   = {{
                padding     : '5px 12px',
                borderRadius: 99,
                border      : 'none',
                background  : alert.type === 'limit' ? '#E53E00' : '#B45309',
                color       : '#fff',
                fontSize    : 11,
                fontWeight  : 700,
                cursor      : 'pointer',
                whiteSpace  : 'nowrap',
              }}
            >
              Rendre →
            </button>

            {/* Fermer */}
            <button
              onClick = {() => onDismiss(alert.id)}
              style   = {{
                background  : 'none',
                border      : 'none',
                cursor      : 'pointer',
                fontSize    : 16,
                color       : alert.type === 'limit' ? '#E53E00' : '#B45309',
                padding     : '2px 4px',
                lineHeight  : 1,
                opacity     : 0.6,
              }}
            >
              ✕
            </button>
          </div>
        </div>
      ))}

      <style>{`
        @keyframes ftpulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.75; }
        }
      `}</style>
    </div>
  );
}