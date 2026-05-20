'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  collection, query, where, onSnapshot, orderBy,
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '../../lib/firebaseClient';
import styles from './delivery.module.css';


/* ── Statut → couleur badge ──────────────────────────────────────────────── */
const STATUT_CONFIG = {
  en_attente   : { label: 'En attente',    color: '#f7b731', bg: 'rgba(247,183,49,0.15)'  },
  en_route     : { label: 'En route',      color: '#00c48c', bg: 'rgba(0,196,140,0.15)'   },
  livre        : { label: 'Livré',         color: '#4cd137', bg: 'rgba(76,209,55,0.15)'   },
  annule       : { label: 'Annulé',        color: '#ff4520', bg: 'rgba(255,69,32,0.15)'   },
  en_traitement: { label: 'En traitement', color: '#0070f3', bg: 'rgba(0,112,243,0.15)'   },
};

const fmt = (n) => Number(n ?? 0).toLocaleString('fr-FR') + ' XOF';

/* ── Icônes SVG ──────────────────────────────────────────────────────────── */
function IconClose() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  );
}
function IconPackage() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/>
      <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>
      <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
      <line x1="12" y1="22.08" x2="12" y2="12"/>
    </svg>
  );
}
function IconPhone() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.67A2 2 0 012 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 9.94a16 16 0 006.29 6.29l1.3-1.3a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>
    </svg>
  );
}
function IconPin() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/>
      <circle cx="12" cy="10" r="3"/>
    </svg>
  );
}
function IconTruck() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="3" width="15" height="13"/>
      <polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/>
      <circle cx="5.5" cy="18.5" r="2.5"/>
      <circle cx="18.5" cy="18.5" r="2.5"/>
    </svg>
  );
}
function IconFilter() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
    </svg>
  );
}

/* ── Badge statut ────────────────────────────────────────────────────────── */
function StatutBadge({ statut }) {
  const cfg = STATUT_CONFIG[statut] ?? { label: statut, color: '#888', bg: 'rgba(136,136,136,0.1)' };
  return (
    <span className={styles.statutBadge} style={{ color: cfg.color, background: cfg.bg }}>
      {cfg.label}
    </span>
  );
}

/* ── Carte détail commande ───────────────────────────────────────────────── */
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

        {/* Frais en haut — visible en premier */}
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

        {/* Articles */}
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

        {/* Livraison */}
        <div className={styles.section}>
          <p className={styles.sectionLabel}>Livraison</p>
          <div className={styles.infoGrid}>
            <div className={styles.infoRow}>
              <IconPin/><span>{commande.villeDepart} → {commande.villeDestination}</span>
            </div>
            <div className={styles.infoRow}>
              <IconPin/><span>{commande.adresse ?? commande.adresseLivraison ?? '—'}</span>
            </div>
            {commande.typeLivraison && (
              <div className={styles.infoRow}>
                <IconTruck/>
                <span>{commande.typeLivraison === 'groupee' ? 'Livraison groupée' : 'Livraison solo'}</span>
              </div>
            )}
          </div>
        </div>

        {/* Client */}
        <div className={styles.section}>
          <p className={styles.sectionLabel}>Client</p>
          <div className={styles.infoGrid}>
            <div className={styles.infoRow}>
              <IconPhone/><span>{commande.telephoneClient ?? '—'}</span>
            </div>
            {commande.clientLat && (
              <div className={styles.infoRow}>
                <IconPin/>
                <span>{Number(commande.clientLat).toFixed(5)}, {Number(commande.clientLng).toFixed(5)}</span>
              </div>
            )}
          </div>
          {commande.telephoneClient && (
            <a href={`tel:${commande.telephoneClient}`} className={styles.callBtn}>
              <IconPhone/> Appeler le client
            </a>
          )}
        </div>

        {/* Livreur */}
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

        {/* Paiement */}
        <div className={styles.section}>
          <p className={styles.sectionLabel}>Paiement</p>
          <div className={styles.infoRow}>
            <span className={styles.payMode}>
              {commande.modePaiement === 'enLigne' ? 'En ligne' : 'À la livraison'}
            </span>
          </div>
        </div>

        {/* ID commande */}
        <div className={styles.cidRow}>
          <span className={styles.cidLabel}>ID</span>
          <span className={styles.cidValue}>{commande.id}</span>
        </div>

      </div>
    </div>
  );
}

/* ── Hook Google Maps loader ─────────────────────────────────────────────── */
function useGoogleMaps() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (window.google?.maps) { setReady(true); return; }
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!key) { console.warn('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY manquant'); return; }

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=marker`;
    script.async = true;
    script.defer = true;
    script.onload = () => setReady(true);
    document.head.appendChild(script);

    return () => { document.head.removeChild(script); };
  }, []);

  return ready;
}

/* ── Créer SVG marker selon statut ──────────────────────────────────────── */
function makeMarkerSvg(statut, frais) {
  const cfg = STATUT_CONFIG[statut] ?? { color: '#888' };
  const fraisLabel = frais ? `${Number(frais).toLocaleString('fr-FR')} XOF` : '';

  // Encode pour URL data
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="120" height="64" viewBox="0 0 120 64">
  <defs>
    <filter id="s" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="rgba(0,0,0,0.35)"/>
    </filter>
  </defs>
  <!-- Bulle -->
  <rect x="4" y="4" width="112" height="40" rx="12" fill="#111" filter="url(#s)"/>
  <rect x="4" y="4" width="112" height="40" rx="12" fill="${cfg.color}" fill-opacity="0.18" stroke="${cfg.color}" stroke-width="2"/>
  <!-- Frais -->
  <text x="60" y="20" font-family="sans-serif" font-size="11" font-weight="700" fill="${cfg.color}" text-anchor="middle">${fraisLabel}</text>
  <!-- Statut -->
  <text x="60" y="36" font-family="sans-serif" font-size="9" fill="rgba(255,255,255,0.7)" text-anchor="middle">${cfg.label}</text>
  <!-- Pointe -->
  <polygon points="52,44 60,56 68,44" fill="${cfg.color}" fill-opacity="0.9"/>
</svg>`.trim();

  return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
}

/* ══════════════════════════════════════════════════════════
   PAGE PRINCIPALE /delivery
══════════════════════════════════════════════════════════ */
export default function DeliveryPage() {
  const mapsReady = useGoogleMaps();
  const mapRef    = useRef(null);
  const mapObjRef = useRef(null);
  const markersRef= useRef([]);

  const [commandes,   setCommandes]   = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [selected,    setSelected]    = useState(null);
  const [filter,      setFilter]      = useState('en_attente');
  const [authUser,    setAuthUser]    = useState(null);

  /* Auth */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => setAuthUser(u?.emailVerified ? u : null));
    return unsub;
  }, []);

  /* Firestore — toutes les commandes (filtre côté client pour flexibilité) */
  useEffect(() => {
    const q = query(
      collection(db, 'commandes'),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(q,
      snap => {
        setCommandes(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      err => { console.error(err); setLoading(false); }
    );
    return () => unsub();
  }, []);

  /* Initialiser la carte */
  useEffect(() => {
    if (!mapsReady || !mapRef.current || mapObjRef.current) return;
    mapObjRef.current = new window.google.maps.Map(mapRef.current, {
      center: { lat: 5.3544, lng: -4.0083 }, // Abidjan
      zoom: 12,
      mapId: 'fritok_delivery',
      disableDefaultUI: false,
      styles: [
        { elementType: 'geometry',        stylers: [{ color: '#1a1a2e' }] },
        { elementType: 'labels.text.fill',stylers: [{ color: '#8a8a9a' }] },
        { elementType: 'labels.text.stroke',stylers:[{ color: '#1a1a2e' }] },
        { featureType: 'road',            elementType: 'geometry', stylers: [{ color: '#2d2d44' }] },
        { featureType: 'road.highway',    elementType: 'geometry', stylers: [{ color: '#3d3d5c' }] },
        { featureType: 'water',           elementType: 'geometry', stylers: [{ color: '#0d0d1a' }] },
        { featureType: 'poi',             stylers: [{ visibility: 'off' }] },
        { featureType: 'transit',         stylers: [{ visibility: 'off' }] },
      ],
    });
  }, [mapsReady]);

  /* Placer / rafraîchir les marqueurs */
  const filtered = commandes.filter(c =>
    filter === 'all' ? true : c.statut === filter
  );

  useEffect(() => {
    if (!mapObjRef.current || !window.google) return;

    // Supprimer anciens marqueurs
    markersRef.current.forEach(m => m.setMap(null));
    markersRef.current = [];

    filtered.forEach(cmd => {
      const lat = cmd.clientLat ?? cmd.extraData?.clientLat;
      const lng = cmd.clientLng ?? cmd.extraData?.clientLng;
      if (!lat || !lng) return;

      const marker = new window.google.maps.Marker({
        position: { lat: Number(lat), lng: Number(lng) },
        map: mapObjRef.current,
        icon: {
          url: makeMarkerSvg(cmd.statut, cmd.fraisLivraison),
          scaledSize: new window.google.maps.Size(120, 64),
          anchor: new window.google.maps.Point(60, 60),
        },
        title: cmd.adresse ?? cmd.villeDestination ?? '',
      });

      marker.addListener('click', () => setSelected(cmd));
      markersRef.current.push(marker);
    });

    // Recentrer sur les marqueurs si au moins un
    if (markersRef.current.length > 0) {
      const bounds = new window.google.maps.LatLngBounds();
      markersRef.current.forEach(m => bounds.extend(m.getPosition()));
      mapObjRef.current.fitBounds(bounds, 80);
    }
  }, [filtered.length, filter, mapsReady]);

  const enAttenteCount = commandes.filter(c => c.statut === 'en_attente').length;
  const totalFrais     = filtered.reduce((s, c) => s + Number(c.fraisLivraison ?? 0), 0);

  const FILTERS = [
    { key: 'en_attente',    label: 'En attente' },
    { key: 'en_route',      label: 'En route'   },
    { key: 'en_traitement', label: 'Traitement' },
    { key: 'all',           label: 'Toutes'     },
  ];

  return (
    <div className={styles.page}>

      {/* Nav */}
      <nav className={styles.nav}>
        <a href="/" className={styles.navLogo}>Fri<span>Tok</span></a>
        <span className={styles.navTitle}>Livraisons</span>
        <a href="/demo" className={styles.navLink}>Vidéos</a>
      </nav>

      {/* Barre frais totaux */}
      <div className={styles.fraisBar}>
        <div className={styles.fraisBarItem}>
          <span className={styles.fraisBarLabel}>Total frais ({filtered.length} cmd)</span>
          <span className={styles.fraisBarValue}>{fmt(totalFrais)}</span>
        </div>
        <div className={styles.fraisBarDivider}/>
        <div className={styles.filtersInline}>
          {FILTERS.map(f => (
            <button key={f.key}
              className={filter === f.key ? styles.filterChipActive : styles.filterChip}
              onClick={() => { setSelected(null); setFilter(f.key); }}>
              <IconFilter/>
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

        {/* Overlay loading carte */}
        {(!mapsReady || loading) && (
          <div className={styles.mapLoading}>
            <div className={styles.mapSpinner}/>
            <p>{!mapsReady ? 'Chargement de la carte…' : 'Chargement des commandes…'}</p>
          </div>
        )}

        {/* Panneau détail (slide depuis le bas) */}
        {selected && (
          <OrderDetail commande={selected} onClose={() => setSelected(null)}/>
        )}
      </div>

      {/* Bouton flottant — total commandes en attente */}
      <button
        className={styles.fab}
        onClick={() => { setFilter('en_attente'); setSelected(null); }}
      >
        <IconPackage/>
        <span className={styles.fabCount}>{enAttenteCount}</span>
        <span className={styles.fabLabel}>en attente</span>
      </button>

    </div>
  );
}
