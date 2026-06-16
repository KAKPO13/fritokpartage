'use client';

import { useState, useEffect, useRef } from 'react';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebaseClient';

/* ══════════════════════════════════════════════════════════
   CONFIG STATUTS
══════════════════════════════════════════════════════════ */
const STATUT_CONFIG = {
  en_attente   : { label: 'En attente',    color: '#f7b731' },
  en_route     : { label: 'En route',      color: '#00c48c' },
  livre        : { label: 'Livré',         color: '#4cd137' },
  annule       : { label: 'Annulé',        color: '#ff4520' },
  en_traitement: { label: 'En traitement', color: '#0070f3' },
};

const fmt = (n) => Number(n ?? 0).toLocaleString('fr-FR') + ' XOF';

const maskPhone = (phone) => {
  if (!phone) return '—';
  const str = String(phone).replace(/\s/g, '');
  return 'xxxxxx' + str.slice(-2);
};

const maskEmail = (email) => {
  if (!email) return '—';
  const [local, domain] = email.split('@');
  return 'xx@' + (domain ?? '***');
};

/* ══════════════════════════════════════════════════════════
   ICÔNES SVG
══════════════════════════════════════════════════════════ */
function IconClose() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18"/>
      <line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  );
}

function IconPackage() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/>
      <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>
      <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
      <line x1="12" y1="22.08" x2="12" y2="12"/>
    </svg>
  );
}

function IconPhone() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.67A2 2 0 012 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 9.94a16 16 0 006.29 6.29l1.3-1.3a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>
    </svg>
  );
}

function IconPin() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/>
      <circle cx="12" cy="10" r="3"/>
    </svg>
  );
}

function IconTruck() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="3" width="15" height="13"/>
      <polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/>
      <circle cx="5.5" cy="18.5" r="2.5"/>
      <circle cx="18.5" cy="18.5" r="2.5"/>
    </svg>
  );
}

/* ══════════════════════════════════════════════════════════
   BADGE STATUT
══════════════════════════════════════════════════════════ */
function StatutBadge({ statut }) {
  const cfg = STATUT_CONFIG[statut] ?? { label: statut, color: '#888' };
  return (
    <span style={{
      display      : 'inline-flex',
      alignItems   : 'center',
      fontSize     : 12,
      fontWeight   : 600,
      borderRadius : 99,
      padding      : '3px 10px',
      color        : cfg.color,
      background   : cfg.color + '22',
      border       : `1px solid ${cfg.color}55`,
    }}>
      {cfg.label}
    </span>
  );
}

/* ══════════════════════════════════════════════════════════
   PANNEAU DÉTAIL COMMANDE
══════════════════════════════════════════════════════════ */
function OrderDetail({ commande, onClose }) {
  if (!commande) return null;
  const articles = commande.articles ?? [];

  const panelStyle = {
    position      : 'absolute',
    bottom        : 16,
    right         : 16,
    width         : 320,
    maxHeight     : 'calc(100% - 32px)',
    overflowY     : 'auto',
    background    : '#111',
    border        : '1px solid rgba(255,255,255,0.1)',
    borderRadius  : 16,
    zIndex        : 1000,
    color         : '#fff',
    boxShadow     : '0 8px 32px rgba(0,0,0,0.5)',
  };

  const headerStyle = {
    display        : 'flex',
    alignItems     : 'center',
    justifyContent : 'space-between',
    padding        : '14px 16px',
    borderBottom   : '1px solid rgba(255,255,255,0.08)',
  };

  const sectionStyle = {
    padding    : '12px 16px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
  };

  const sectionLabelStyle = {
    fontSize   : 11,
    fontWeight : 600,
    color      : 'rgba(255,255,255,0.4)',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    marginBottom : 8,
  };

  const infoRowStyle = {
    display    : 'flex',
    alignItems : 'center',
    gap        : 8,
    fontSize   : 13,
    color      : 'rgba(255,255,255,0.8)',
    marginBottom: 6,
  };

  const fraisTopStyle = {
    display        : 'flex',
    alignItems     : 'center',
    padding        : '12px 16px',
    borderBottom   : '1px solid rgba(255,255,255,0.08)',
    gap            : 12,
  };

  const fraisItemStyle = {
    flex      : 1,
    display   : 'flex',
    flexDirection: 'column',
    gap       : 2,
  };

  const fraisLabelStyle = {
    fontSize  : 11,
    color     : 'rgba(255,255,255,0.4)',
    fontWeight: 500,
  };

  const fraisValueStyle = {
    fontSize  : 14,
    fontWeight: 700,
    color     : '#fff',
  };

  const fraisTotalStyle = {
    fontSize  : 16,
    fontWeight: 800,
    color     : '#00c48c',
  };

  const closeBtnStyle = {
    background : 'none',
    border     : 'none',
    cursor     : 'pointer',
    color      : 'rgba(255,255,255,0.5)',
    display    : 'flex',
    padding    : 4,
    borderRadius: 8,
  };

  const callBtnStyle = {
    marginTop   : 8,
    width       : '100%',
    padding     : '8px 12px',
    background  : 'rgba(255,255,255,0.06)',
    border      : '1px solid rgba(255,255,255,0.12)',
    borderRadius: 8,
    color       : 'rgba(255,255,255,0.4)',
    fontSize    : 13,
    cursor      : 'not-allowed',
    display     : 'flex',
    alignItems  : 'center',
    gap         : 6,
    justifyContent: 'center',
  };

  const articleRowStyle = {
    display    : 'flex',
    alignItems : 'center',
    gap        : 10,
    marginBottom: 8,
  };

  const articleImgStyle = {
    width       : 36,
    height      : 36,
    borderRadius: 8,
    objectFit   : 'cover',
    background  : 'rgba(255,255,255,0.06)',
  };

  const cidRowStyle = {
    padding  : '10px 16px',
    display  : 'flex',
    gap      : 8,
    alignItems: 'center',
  };

  return (
    <div style={panelStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <IconPackage/>
          <span style={{ fontSize: 14, fontWeight: 600 }}>Commande</span>
          <StatutBadge statut={commande.statut}/>
        </div>
        <button style={closeBtnStyle} onClick={onClose} aria-label="Fermer">
          <IconClose/>
        </button>
      </div>

      {/* Frais */}
      <div style={fraisTopStyle}>
        <div style={fraisItemStyle}>
          <span style={fraisLabelStyle}>Frais livraison</span>
          <span style={fraisValueStyle}>{fmt(commande.fraisLivraison)}</span>
        </div>
        <div style={{ width: 1, height: 32, background: 'rgba(255,255,255,0.1)' }}/>
        <div style={fraisItemStyle}>
          <span style={fraisLabelStyle}>Total commande</span>
          <span style={fraisTotalStyle}>{fmt(commande.totalXof)}</span>
        </div>
      </div>

      {/* Articles */}
      {articles.length > 0 && (
        <div style={sectionStyle}>
          <p style={sectionLabelStyle}>Articles ({articles.length})</p>
          {articles.map((a, i) => (
            <div key={i} style={articleRowStyle}>
              {a.imageUrl && (
                <img
                  src={a.imageUrl}
                  alt={a.nom_frifri}
                  style={articleImgStyle}
                  onError={e => { e.currentTarget.style.display = 'none'; }}
                />
              )}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: '#fff' }}>{a.nom_frifri}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{fmt(a.prix_frifri)}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Livraison */}
      <div style={sectionStyle}>
        <p style={sectionLabelStyle}>Livraison</p>
        <div style={infoRowStyle}>
          <IconPin/>
          <span>{commande.villeDepart} → {commande.villeDestination}</span>
        </div>
        {(commande.adresse || commande.adresseLivraison) && (
          <div style={infoRowStyle}>
            <IconPin/>
            <span>{commande.adresse ?? commande.adresseLivraison}</span>
          </div>
        )}
        {commande.typeLivraison && (
          <div style={infoRowStyle}>
            <IconTruck/>
            <span>{commande.typeLivraison === 'groupee' ? 'Groupée (-20%)' : 'Solo'}</span>
          </div>
        )}
      </div>

      {/* Client */}
      <div style={sectionStyle}>
        <p style={sectionLabelStyle}>Client</p>
        {commande.telephoneClient && (
          <div style={infoRowStyle}>
            <IconPhone/>
            <span>{maskPhone(commande.telephoneClient)}</span>
          </div>
        )}
        {commande.clientLat && (
          <div style={infoRowStyle}>
            <IconPin/>
            <span>
              {Number(commande.clientLat).toFixed(5)},&nbsp;
              {Number(commande.clientLng).toFixed(5)}
            </span>
          </div>
        )}
        {commande.telephoneClient && (
          <button style={callBtnStyle} disabled>
            <IconPhone/> Appeler le client
          </button>
        )}
      </div>

      {/* Livreur */}
      {commande.livreur && (
        <div style={sectionStyle}>
          <p style={sectionLabelStyle}>Livreur</p>
          <div style={infoRowStyle}>
            <IconTruck/>
            <span>{maskEmail(commande.livreur.nom)}</span>
          </div>
          {commande.livreur.phone && (
            <div style={infoRowStyle}>
              <IconPhone/>
              <span>{maskPhone(commande.livreur.phone)}</span>
            </div>
          )}
          {commande.livreur.phone && (
            <button style={callBtnStyle} disabled>
              <IconPhone/> Appeler le livreur
            </button>
          )}
        </div>
      )}

      {/* Paiement */}
      <div style={sectionStyle}>
        <p style={sectionLabelStyle}>Paiement</p>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)' }}>
          {commande.modePaiement === 'enLigne' ? '💳 En ligne' : '💵 À la livraison'}
        </div>
      </div>

      {/* ID */}
      <div style={cidRowStyle}>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', fontWeight: 600 }}>ID</span>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace' }}>
          {commande.id}
        </span>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   HOOK LEAFLET — import dynamique (browser only)
══════════════════════════════════════════════════════════ */
function useLeaflet() {
  const [L, setL] = useState(null);

  useEffect(() => {
    if (!document.getElementById('leaflet-css')) {
      const link    = document.createElement('link');
      link.id       = 'leaflet-css';
      link.rel      = 'stylesheet';
      link.href     = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
      document.head.appendChild(link);
    }

    import('leaflet').then(mod => {
      const Leaflet = mod.default;
      delete Leaflet.Icon.Default.prototype._getIconUrl;
      Leaflet.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
        iconUrl      : 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
        shadowUrl    : 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
      });
      setL(Leaflet);
    });
  }, []);

  return L;
}

/* ══════════════════════════════════════════════════════════
   MARQUEUR SVG PERSONNALISÉ
══════════════════════════════════════════════════════════ */
function createMarkerIcon(L, statut, frais) {
  const cfg   = STATUT_CONFIG[statut] ?? { label: statut, color: '#888' };
  const label = frais
    ? `${Number(frais).toLocaleString('fr-FR')} XOF`
    : cfg.label;

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="130" height="60" viewBox="0 0 130 60">
  <defs>
    <filter id="sh">
      <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="rgba(0,0,0,0.5)"/>
    </filter>
  </defs>
  <rect x="3" y="3" width="124" height="40" rx="12"
    fill="#111111" stroke="${cfg.color}" stroke-width="2" filter="url(#sh)"/>
  <rect x="3" y="3" width="124" height="40" rx="12"
    fill="${cfg.color}" fill-opacity="0.15"/>
  <text x="65" y="19" font-family="Arial,sans-serif" font-size="11"
    font-weight="800" fill="${cfg.color}" text-anchor="middle">${label}</text>
  <text x="65" y="34" font-family="Arial,sans-serif" font-size="9"
    fill="rgba(255,255,255,0.65)" text-anchor="middle">${cfg.label}</text>
  <polygon points="57,43 65,55 73,43" fill="${cfg.color}" opacity="0.95"/>
</svg>`.trim();

  return L.divIcon({
    html: `<img
      src="data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}"
      style="width:130px;height:60px;display:block"
    />`,
    className : '',
    iconSize  : [130, 60],
    iconAnchor: [65, 58],
  });
}

/* ══════════════════════════════════════════════════════════
   COMPOSANT PRINCIPAL — DeliveryMap
   Usage : <DeliveryMap height={480} />
══════════════════════════════════════════════════════════ */
export default function DeliveryMap({ height = 480 }) {
  const L = useLeaflet();

  const mapRef     = useRef(null);
  const mapObjRef  = useRef(null);
  const markersRef = useRef([]);

  const [commandes, setCommandes] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [selected,  setSelected]  = useState(null);

  /* Écoute temps réel Firestore */
  useEffect(() => {
    const q = query(
      collection(db, 'commandes'),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(
      q,
      snap => {
        setCommandes(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      err => { console.error('Firestore DeliveryMap:', err); setLoading(false); }
    );
    return () => unsub();
  }, []);

  /* Init carte */
  useEffect(() => {
    if (!L || !mapRef.current || mapObjRef.current) return;

    const map = L.map(mapRef.current, {
      center     : [5.3544, -4.0083],
      zoom       : 11,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom    : 19,
    }).addTo(map);

    mapObjRef.current = map;
  }, [L]);

  /* Marqueurs */
  useEffect(() => {
    if (!mapObjRef.current || !L) return;

    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    const positions = [];

    commandes.forEach(cmd => {
      const lat = Number(cmd.clientLat ?? cmd.extraData?.clientLat ?? 0);
      const lng = Number(cmd.clientLng ?? cmd.extraData?.clientLng ?? 0);
      if (!lat || !lng) return;

      const marker = L.marker([lat, lng], {
        icon: createMarkerIcon(L, cmd.statut, cmd.fraisLivraison),
      });

      marker.on('click', () => setSelected(cmd));
      marker.addTo(mapObjRef.current);
      markersRef.current.push(marker);
      positions.push([lat, lng]);
    });

    if (positions.length === 1) {
      mapObjRef.current.setView(positions[0], 14);
    } else if (positions.length > 1) {
      mapObjRef.current.fitBounds(positions, { padding: [60, 60] });
    }
  }, [commandes.length, L]);

  /* Styles inline — pas de dépendance à un fichier CSS externe */
  const wrapStyle = {
    position    : 'relative',
    width       : '100%',
    height      : height,
    borderRadius: 16,
    overflow    : 'hidden',
    background  : '#0d0d0d',
  };

  const loadingStyle = {
    position       : 'absolute',
    inset          : 0,
    display        : 'flex',
    flexDirection  : 'column',
    alignItems     : 'center',
    justifyContent : 'center',
    background     : 'rgba(0,0,0,0.6)',
    backdropFilter : 'blur(4px)',
    zIndex         : 999,
    color          : '#fff',
    gap            : 12,
    fontSize       : 14,
  };

  const spinnerStyle = {
    width       : 32,
    height      : 32,
    border      : '3px solid rgba(255,255,255,0.15)',
    borderTop   : '3px solid #00c48c',
    borderRadius: '50%',
    animation   : 'spin 0.8s linear infinite',
  };

  return (
    <div style={wrapStyle}>
      {/* Keyframe spin injecté une seule fois */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Carte Leaflet */}
      <div ref={mapRef} style={{ width: '100%', height: '100%' }}/>

      {/* Overlay chargement */}
      {(!L || loading) && (
        <div style={loadingStyle}>
          <div style={spinnerStyle}/>
          <p style={{ margin: 0 }}>
            {!L ? 'Chargement de la carte…' : 'Chargement des commandes…'}
          </p>
        </div>
      )}

      {/* Panneau détail commande */}
      {selected && (
        <OrderDetail
          commande={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
