'use client';

import { useState, useEffect, useRef } from 'react';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '../../lib/firebaseClient';
import styles from './delivery.module.css';
import 'leaflet/dist/leaflet.css'; // ✅ Import du CSS Leaflet

const STATUT_CONFIG = {
  en_attente   : { label: 'En attente',    color: '#f7b731' },
  en_route     : { label: 'En route',      color: '#00c48c' },
  livre        : { label: 'Livré',         color: '#4cd137' },
  annule       : { label: 'Annulé',        color: '#ff4520' },
  en_traitement: { label: 'En traitement', color: '#0070f3' },
};

const fmt = (n) => Number(n ?? 0).toLocaleString('fr-FR') + ' XOF';

export default function DeliveryPage() {
  const mapRef = useRef(null);

  useEffect(() => {
    // ✅ Import dynamique de Leaflet côté client
    import('leaflet').then(mod => {
      const L = mod.default;

      // Corriger le bug des icônes par défaut
      delete L.Icon.Default.prototype._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
        iconUrl: require('leaflet/dist/images/marker-icon.png'),
        shadowUrl: require('leaflet/dist/images/marker-shadow.png'),
      });

      // Initialiser la carte
      if (mapRef.current && !mapRef.current._leaflet_id) {
        const map = L.map(mapRef.current).setView([5.345317, -4.024429], 13); // Abidjan par défaut

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap contributors',
        }).addTo(map);

        // Exemple : ajouter un marker
        L.marker([5.345317, -4.024429]).addTo(map)
          .bindPopup('Point de livraison')
          .openPopup();
      }
    });
  }, []);

  return (
    <div className={styles.container}>
      <h1>Suivi des livraisons</h1>
      <div ref={mapRef} className={styles.map}></div>
    </div>
  );
}


/* ══════════════════════════════════════════════════════════
   BADGE STATUT
══════════════════════════════════════════════════════════ */
function StatutBadge({ statut }) {
  const cfg = STATUT_CONFIG[statut] ?? { label: statut, color: '#888' };
  return (
    <span
      className={styles.statutBadge}
      style={{ color: cfg.color, background: cfg.color + '22', border: `1px solid ${cfg.color}55` }}
    >
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

  return (
    <div className={styles.detailPanel}>
      <div className={styles.detailHeader}>
        <div className={styles.detailTitle}>
          <IconPackage/>
          <span>Commande</span>
          <StatutBadge statut={commande.statut}/>
        </div>
        <button className={styles.detailClose} onClick={onClose}><IconClose/></button>
      </div>

      <div className={styles.detailBody}>

        {/* ── Frais en haut ── */}
        <div className={styles.fraisTop}>
          <div className={styles.fraisTopItem}>
            <span className={styles.fraisTopLabel}>Frais livraison</span>
            <span className={styles.fraisTopValue}>{fmt(commande.fraisLivraison)}</span>
          </div>
          <div className={styles.fraisTopDivider}/>
          <div className={styles.fraisTopItem}>
            <span className={styles.fraisTopLabel}>Total commande</span>
            <span className={styles.fraisTopTotal}>{fmt(commande.totalXof)}</span>
          </div>
        </div>

        {/* ── Articles ── */}
        {articles.length > 0 && (
          <div className={styles.section}>
            <p className={styles.sectionLabel}>Articles ({articles.length})</p>
            <div className={styles.articlesList}>
              {articles.map((a, i) => (
                <div key={i} className={styles.articleRow}>
                  {a.imageUrl && (
                    <img src={a.imageUrl} alt={a.nom_frifri} className={styles.articleImg}
                      onError={e => { e.currentTarget.style.display = 'none'; }}/>
                  )}
                  <div className={styles.articleMeta}>
                    <span className={styles.articleName}>{a.nom_frifri}</span>
                    <span className={styles.articlePrice}>{fmt(a.prix_frifri)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Livraison ── */}
        <div className={styles.section}>
          <p className={styles.sectionLabel}>Livraison</p>
          <div className={styles.infoGrid}>
            <div className={styles.infoRow}>
              <IconPin/>
              <span>{commande.villeDepart} → {commande.villeDestination}</span>
            </div>
            {(commande.adresse || commande.adresseLivraison) && (
              <div className={styles.infoRow}>
                <IconPin/>
                <span>{commande.adresse ?? commande.adresseLivraison}</span>
              </div>
            )}
            {commande.typeLivraison && (
              <div className={styles.infoRow}>
                <IconTruck/>
                <span>{commande.typeLivraison === 'groupee' ? 'Groupée (-20%)' : 'Solo'}</span>
              </div>
            )}
          </div>
        </div>

        {/* ── Client ── */}
        <div className={styles.section}>
          <p className={styles.sectionLabel}>Client</p>
          <div className={styles.infoGrid}>
            {commande.telephoneClient && (
              <div className={styles.infoRow}>
                <IconPhone/><span>{commande.telephoneClient}</span>
              </div>
            )}
            {commande.clientLat && (
              <div className={styles.infoRow}>
                <IconPin/>
                <span>
                  {Number(commande.clientLat).toFixed(5)},&nbsp;
                  {Number(commande.clientLng).toFixed(5)}
                </span>
              </div>
            )}
          </div>
          {commande.telephoneClient && (
            <a href={`tel:${commande.telephoneClient}`} className={styles.callBtn}>
              <IconPhone/> Appeler le client
            </a>
          )}
        </div>

        {/* ── Livreur ── */}
        {commande.livreur && (
          <div className={styles.section}>
            <p className={styles.sectionLabel}>Livreur</p>
            <div className={styles.infoGrid}>
              <div className={styles.infoRow}>
                <IconTruck/><span>{commande.livreur.nom ?? '—'}</span>
              </div>
              {commande.livreur.phone && (
                <div className={styles.infoRow}>
                  <IconPhone/><span>{commande.livreur.phone}</span>
                </div>
              )}
            </div>
            {commande.livreur.phone && (
              <a href={`tel:${commande.livreur.phone}`} className={styles.callBtnSecondary}>
                <IconPhone/> Appeler le livreur
              </a>
            )}
          </div>
        )}

        {/* ── Paiement ── */}
        <div className={styles.section}>
          <p className={styles.sectionLabel}>Paiement</p>
          <div className={styles.infoRow}>
            <span className={styles.payMode}>
              {commande.modePaiement === 'enLigne' ? '💳 En ligne' : '💵 À la livraison'}
            </span>
          </div>
        </div>

        {/* ── ID ── */}
        <div className={styles.cidRow}>
          <span className={styles.cidLabel}>ID</span>
          <span className={styles.cidValue}>{commande.id}</span>
        </div>

      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   HOOK LEAFLET (import dynamique → pas d'erreur SSR)
══════════════════════════════════════════════════════════ */
function useLeaflet() {
  const [L, setL] = useState(null);

  useEffect(() => {
    // Leaflet ne fonctionne que côté browser
    import('leaflet').then(mod => {
      const Leaflet = mod.default;

      // Corriger le bug d'icône par défaut de Leaflet avec webpack
      delete Leaflet.Icon.Default.prototype._getIconUrl;
      Leaflet.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
        iconUrl:       'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
        shadowUrl:     'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
      });

      setL(Leaflet);
    });
  }, []);

  return L;
}

/* ══════════════════════════════════════════════════════════
   GÉNÈRE UN MARQUEUR SVG INLINE selon statut + frais
══════════════════════════════════════════════════════════ */
function createMarkerIcon(L, statut, frais) {
  const cfg   = STATUT_CONFIG[statut] ?? { label: statut, color: '#888' };
  const label = frais ? `${Number(frais).toLocaleString('fr-FR')} XOF` : cfg.label;

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
    html: `<img src="data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}"
      style="width:130px;height:60px;display:block"/>`,
    className: '',
    iconSize:   [130, 60],
    iconAnchor: [65, 58],
    popupAnchor:[0, -60],
  });
}

/* ══════════════════════════════════════════════════════════
   PAGE /delivery
══════════════════════════════════════════════════════════ */
export default function DeliveryPage() {
  const L = useLeaflet();

  const mapRef    = useRef(null);
  const mapObjRef = useRef(null);
  const markersRef= useRef([]);

  const [commandes, setCommandes] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [selected,  setSelected]  = useState(null);
  const [filter,    setFilter]    = useState('en_attente');

  /* Auth */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, () => {});
    return unsub;
  }, []);

  /* Firestore realtime */
  useEffect(() => {
    const q = query(collection(db, 'commandes'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q,
      snap => {
        setCommandes(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      err => { console.error(err); setLoading(false); }
    );
    return () => unsub();
  }, []);

  /* Init carte Leaflet */
  useEffect(() => {
    if (!L || !mapRef.current || mapObjRef.current) return;

    // Injecter le CSS Leaflet dynamiquement
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id   = 'leaflet-css';
      link.rel  = 'stylesheet';
      link.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
      document.head.appendChild(link);
    }

    const map = L.map(mapRef.current, {
      center: [5.3544, -4.0083], // Abidjan
      zoom: 12,
      zoomControl: true,
    });

    // Tuiles OpenStreetMap — 100% gratuit, aucune clé
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    // Tuiles sombres (Carto Dark) — aussi gratuit
    // L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    //   attribution: '© OpenStreetMap © CARTO',
    //   maxZoom: 19,
    // }).addTo(map);

    mapObjRef.current = map;
  }, [L]);

  /* Marqueurs */
  const filtered = commandes.filter(c =>
    filter === 'all' ? true : c.statut === filter
  );

  useEffect(() => {
    if (!mapObjRef.current || !L) return;

    // Supprimer anciens marqueurs
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    const positions = [];

    filtered.forEach(cmd => {
      const lat = cmd.clientLat ?? cmd.extraData?.clientLat;
      const lng = cmd.clientLng ?? cmd.extraData?.clientLng;
      if (!lat || !lng) return;

      const latNum = Number(lat);
      const lngNum = Number(lng);

      const marker = L.marker([latNum, lngNum], {
        icon: createMarkerIcon(L, cmd.statut, cmd.fraisLivraison),
      });

      marker.on('click', () => setSelected(cmd));
      marker.addTo(mapObjRef.current);
      markersRef.current.push(marker);
      positions.push([latNum, lngNum]);
    });

    // Recentrer sur les marqueurs visibles
    if (positions.length === 1) {
      mapObjRef.current.setView(positions[0], 14);
    } else if (positions.length > 1) {
      mapObjRef.current.fitBounds(positions, { padding: [60, 60] });
    }
  }, [filtered.length, filter, L]);

  const enAttenteCount = commandes.filter(c => c.statut === 'en_attente').length;
  const totalFrais     = filtered.reduce((s, c) => s + Number(c.fraisLivraison ?? 0), 0);

  const FILTERS = [
    { key: 'en_attente',    label: 'En attente'  },
    { key: 'en_route',      label: 'En route'    },
    { key: 'en_traitement', label: 'Traitement'  },
    { key: 'all',           label: 'Toutes'      },
  ];

  return (
    <div className={styles.page}>

      {/* Nav */}
      <nav className={styles.nav}>
        <a href="/" className={styles.navLogo}>Fri<span>Tok</span></a>
        <span className={styles.navTitle}>Livraisons</span>
        <a href="/demo" className={styles.navLink}>Vidéos</a>
      </nav>

      {/* Barre frais + filtres */}
      <div className={styles.fraisBar}>
        <div className={styles.fraisBarItem}>
          <span className={styles.fraisBarLabel}>
            Frais ({filtered.length} cmd)
          </span>
          <span className={styles.fraisBarValue}>{fmt(totalFrais)}</span>
        </div>
        <div className={styles.fraisBarDivider}/>
        <div className={styles.filtersInline}>
          {FILTERS.map(f => (
            <button
              key={f.key}
              className={filter === f.key ? styles.filterChipActive : styles.filterChip}
              onClick={() => { setSelected(null); setFilter(f.key); }}
            >
              {f.label}
              {f.key !== 'all' && (
                <span className={styles.filterCount}>
                  {commandes.filter(c => c.statut === f.key).length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Carte */}
      <div className={styles.mapWrap}>
        <div ref={mapRef} className={styles.map}/>

        {/* Loading overlay */}
        {(!L || loading) && (
          <div className={styles.mapLoading}>
            <div className={styles.mapSpinner}/>
            <p>{!L ? 'Chargement de la carte…' : 'Chargement des commandes…'}</p>
          </div>
        )}

        {/* Détail commande */}
        {selected && (
          <OrderDetail commande={selected} onClose={() => setSelected(null)}/>
        )}
      </div>

      {/* FAB — total en attente */}
      <button
        className={styles.fab}
        onClick={() => { setFilter('en_attente'); setSelected(null); }}
        title="Voir les commandes en attente"
      >
        <IconPackage/>
        <span className={styles.fabCount}>{enAttenteCount}</span>
        <span className={styles.fabLabel}>en attente</span>
      </button>

    </div>
  );
}
