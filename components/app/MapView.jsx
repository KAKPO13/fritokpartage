'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

// ─── Design tokens (miroir app.js) ────────────────────────────────────────
const D = {
  bg        : '#FFF8EE', surface   : '#FFFFFF', border    : '#FFDDB0',
  orange    : '#FF6B00', orangeDim : '#FFEDD5', zest      : '#FFB700',
  text1     : '#2D1500', text2     : '#8B5E3C', text3     : '#BF9060',
  green     : '#1A9640', greenLight: '#E6F7EC',
  amber     : '#B45309', amberLight: '#FEF3C7',
  red       : '#E53E00',
};

const batteryColor = (lvl) => lvl == null ? D.text3 : lvl >= 60 ? D.green : lvl >= 30 ? D.amber : D.red;
const batteryIcon  = (lvl) => lvl == null ? '🔋' : lvl >= 60 ? '🔋' : lvl >= 30 ? '🪫' : '🔴';
const fmt = (n) => new Intl.NumberFormat('fr-FR').format(Math.round(Number(n ?? 0)));

// ─── Couleurs marker par état ─────────────────────────────────────────────
const STATE_COLOR = {
  disponible  : D.green,
  en_location : D.amber,
  hors_service: D.red,
};
const STATE_LABEL = {
  disponible  : 'Disponible',
  en_location : 'En location',
  hors_service: 'Hors service',
};

// ─────────────────────────────────────────────────────────────────────────────
//  MapView
//  Props :
//    powerBanks  : [{ id, lat, lng, qrCode, state, batteryLevel,
//                     currentPartnerId, partnerName, partnerAddress,
//                     partnerPhotos }]
//    onFetchPartner : async (partnerId) => { name, address, photos[] }
// ─────────────────────────────────────────────────────────────────────────────
export default function MapView({ powerBanks = [], onFetchPartner }) {
  const mapRef       = useRef(null);
  const leafletRef   = useRef(null);
  const markersRef   = useRef([]);
  const [selected,   setSelected]   = useState(null);   // powerBank sélectionné
  const [partner,    setPartner]    = useState(null);   // données partenaire enrichies
  const [loadingPtn, setLoadingPtn] = useState(false);  // fetch en cours
  const [sheetOpen,  setSheetOpen]  = useState(false);

  // ── Init Leaflet ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let map;

    (async () => {
      const L = (await import('leaflet')).default;
      await import('leaflet/dist/leaflet.css');
      leafletRef.current = L;

      if (mapRef.current && !mapRef.current._leaflet_id) {
        map = L.map(mapRef.current, {
          center    : [5.345, -4.024],   // Abidjan par défaut
          zoom      : 13,
          zoomControl: true,
        });
        mapRef.current._mapInstance = map;

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap contributors',
          maxZoom    : 19,
        }).addTo(map);
      }
    })();

    return () => {
      if (mapRef.current?._mapInstance) {
        mapRef.current._mapInstance.remove();
        delete mapRef.current._mapInstance;
        delete mapRef.current._leaflet_id;
      }
    };
  }, []);

  // ── Markers ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current?._mapInstance;
    const L   = leafletRef.current;
    if (!map || !L) return;

    // Nettoyer anciens markers
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    powerBanks.forEach((pb) => {
      const color  = STATE_COLOR[pb.state] ?? D.text3;
      const icon   = L.divIcon({
        className : '',
        iconSize  : [36, 36],
        iconAnchor: [18, 36],
        html: `
          <div style="
            width:36px;height:36px;border-radius:50% 50% 50% 0;
            background:${color};border:3px solid #fff;
            box-shadow:0 2px 8px rgba(0,0,0,0.25);
            display:flex;align-items:center;justify-content:center;
            font-size:14px;transform:rotate(-45deg);
          ">
            <span style="transform:rotate(45deg)">${pb.state === 'disponible' ? '⚡' : pb.state === 'hors_service' ? '🚫' : '🔋'}</span>
          </div>`,
      });

      const marker = L.marker([pb.lat, pb.lng], { icon }).addTo(map);
      marker.on('click', () => handleMarkerClick(pb));
      markersRef.current.push(marker);
    });

    // Centrer sur les markers si présents
    if (powerBanks.length > 0) {
      const bounds = L.latLngBounds(powerBanks.map(pb => [pb.lat, pb.lng]));
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
    }
  }, [powerBanks]);

  // ── Clic sur marker ───────────────────────────────────────────────────────
  const handleMarkerClick = useCallback(async (pb) => {
    setSelected(pb);
    setPartner(null);
    setSheetOpen(true);

    // Si on a déjà des photos inline (passées depuis MapTab)
    if (pb.partnerPhotos?.length > 0) {
      setPartner({
        name   : pb.partnerName    ?? pb.currentPartnerId ?? 'Partenaire',
        address: pb.partnerAddress ?? '',
        photos : pb.partnerPhotos.slice(0, 3),
      });
      return;
    }

    // Sinon fetch via callback
    if (!pb.currentPartnerId || !onFetchPartner) return;
    setLoadingPtn(true);
    try {
      const data = await onFetchPartner(pb.currentPartnerId);
      setPartner(data);
    } catch (e) {
      console.error('fetchPartner:', e);
    }
    setLoadingPtn(false);
  }, [onFetchPartner]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {/* Leaflet mount point */}
      <div ref={mapRef} style={{ width: '100%', height: '100%' }} />

      {/* Légende */}
      <div style={{
        position: 'absolute', top: 10, right: 10, zIndex: 500,
        background: D.surface, borderRadius: 12, padding: '8px 12px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.12)', border: `1px solid ${D.border}`,
        fontSize: 11,
      }}>
        {[['disponible','⚡'],['en_location','🔋'],['hors_service','🚫']].map(([s, ic]) => (
          <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, color: STATE_COLOR[s] }}>
            <span>{ic}</span>
            <span style={{ fontWeight: 600, color: D.text2 }}>{STATE_LABEL[s]}</span>
          </div>
        ))}
      </div>

      {/* Bottom sheet partenaire */}
      {sheetOpen && selected && (
        <PartnerSheet
          pb         = {selected}
          partner    = {partner}
          loading    = {loadingPtn}
          onClose    = {() => { setSheetOpen(false); setSelected(null); setPartner(null); }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  PartnerSheet — bottom sheet avec photos partenaire
// ─────────────────────────────────────────────────────────────────────────────
function PartnerSheet({ pb, partner, loading, onClose }) {
  const [photoIdx, setPhotoIdx] = useState(0);
  const hasPhotos = partner?.photos?.length > 0;

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: 'absolute', inset: 0, zIndex: 600,
          background: 'rgba(0,0,0,0.35)',
        }}
      />

      {/* Sheet */}
      <div style={{
        position      : 'absolute', bottom: 0, left: 0, right: 0, zIndex: 700,
        background    : D.surface,
        borderRadius  : '24px 24px 0 0',
        boxShadow     : '0 -4px 32px rgba(0,0,0,0.18)',
        maxHeight     : '80%',
        overflowY     : 'auto',
        paddingBottom : 32,
      }}>
        {/* Poignée */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
          <div style={{ width: 40, height: 4, borderRadius: 99, background: D.border }} />
        </div>

        {/* ── Photos partenaire ── */}
        {loading ? (
          <PhotoSkeleton />
        ) : hasPhotos ? (
          <div style={{ position: 'relative', marginBottom: 0 }}>
            {/* Image principale */}
            <div style={{ position: 'relative', height: 200, overflow: 'hidden', background: '#111' }}>
              <img
                src       = {partner.photos[photoIdx]}
                alt       = {`Photo ${photoIdx + 1}`}
                style     = {{ width: '100%', height: '100%', objectFit: 'cover', transition: 'opacity 0.3s' }}
                onError   = {(e) => { e.target.style.display = 'none'; }}
              />
              {/* Gradient bas */}
              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 60, background: 'linear-gradient(transparent, rgba(0,0,0,0.5))' }} />
              {/* Compteur */}
              <div style={{ position: 'absolute', bottom: 10, right: 12, background: 'rgba(0,0,0,0.55)', borderRadius: 99, padding: '2px 10px', fontSize: 11, color: '#fff', fontWeight: 700 }}>
                {photoIdx + 1} / {partner.photos.length}
              </div>
            </div>

            {/* Thumbnails */}
            {partner.photos.length > 1 && (
              <div style={{ display: 'flex', gap: 6, padding: '8px 16px 0' }}>
                {partner.photos.map((url, i) => (
                  <button
                    key   = {i}
                    onClick = {() => setPhotoIdx(i)}
                    style   = {{
                      width        : 56, height: 56, flexShrink: 0,
                      borderRadius : 10, overflow: 'hidden', padding: 0, border: 'none',
                      cursor       : 'pointer',
                      outline      : `2.5px solid ${i === photoIdx ? D.orange : 'transparent'}`,
                      outlineOffset: 2,
                    }}
                  >
                    <img
                      src   = {url}
                      alt   = {`Miniature ${i + 1}`}
                      style = {{ width: '100%', height: '100%', objectFit: 'cover' }}
                      onError = {(e) => { e.target.parentElement.style.display = 'none'; }}
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : partner && !hasPhotos ? (
          <div style={{ height: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 6, color: D.text3, fontSize: 12 }}>
            <span style={{ fontSize: 32 }}>🏪</span>
            Aucune photo disponible
          </div>
        ) : null}

        {/* ── Infos partenaire ── */}
        <div style={{ padding: '14px 20px 0' }}>
          {/* Nom + adresse */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: D.text1, lineHeight: 1.2 }}>
              {loading
                ? <SkeletonLine width="60%" />
                : (partner?.name ?? (pb.currentPartnerId ? 'Partenaire Fritok' : 'Station Fritok'))
              }
            </div>
            {(loading || partner?.address) && (
              <div style={{ fontSize: 12, color: D.text2, marginTop: 4 }}>
                {loading ? <SkeletonLine width="40%" /> : `📍 ${partner.address}`}
              </div>
            )}
          </div>

          {/* Badge état power bank */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <div style={{
              display     : 'inline-flex', alignItems: 'center', gap: 6,
              padding     : '5px 12px',
              borderRadius: 99,
              background  : pb.state === 'disponible' ? D.greenLight : pb.state === 'hors_service' ? '#FEE2E2' : D.amberLight,
              fontSize    : 12, fontWeight: 700,
              color       : STATE_COLOR[pb.state] ?? D.text2,
            }}>
              <span>{pb.state === 'disponible' ? '⚡' : pb.state === 'hors_service' ? '🚫' : '🔋'}</span>
              {STATE_LABEL[pb.state] ?? pb.state}
            </div>
          </div>

          {/* Fiche power bank */}
          <div style={{
            background   : D.bg,
            borderRadius : 14,
            border       : `1px solid ${D.border}`,
            padding      : '14px 16px',
            marginBottom : 14,
          }}>
            <div style={{ fontSize: 11, color: D.text3, letterSpacing: 1.2, fontWeight: 700, marginBottom: 10 }}>POWER BANK</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: D.text1, letterSpacing: 0.5 }}>{pb.qrCode || pb.id}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 20 }}>{batteryIcon(pb.batteryLevel)}</span>
                <span style={{ fontSize: 14, fontWeight: 800, color: batteryColor(pb.batteryLevel) }}>
                  {pb.batteryLevel != null ? `${pb.batteryLevel}%` : '–'}
                </span>
              </div>
            </div>
            {pb.batteryLevel != null && (
              <div style={{ height: 5, background: '#F0E6DA', borderRadius: 99, marginTop: 10, overflow: 'hidden' }}>
                <div style={{
                  height    : '100%',
                  width     : `${pb.batteryLevel}%`,
                  background: batteryColor(pb.batteryLevel),
                  borderRadius: 99,
                  transition: 'width 0.5s ease',
                }} />
              </div>
            )}
          </div>

          {/* Tarifs rappel */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <TarifChip label="Frais"   value="100 FCFA" />
            <TarifChip label="Caution" value="200 FCFA" amber />
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Petits composants ────────────────────────────────────────────────────────
function TarifChip({ label, value, amber }) {
  return (
    <div style={{ background: amber ? D.amberLight : D.orangeDim, borderRadius: 10, padding: '10px 14px' }}>
      <div style={{ fontSize: 10, color: amber ? D.amber : D.text3, fontWeight: 700, marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 800, color: amber ? D.amber : D.orange }}>{value}</div>
    </div>
  );
}

function PhotoSkeleton() {
  return (
    <div style={{ height: 200, background: 'linear-gradient(90deg, #f0e6da 25%, #ffddb030 50%, #f0e6da 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.4s infinite', marginBottom: 0 }}>
      <style>{`@keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }`}</style>
    </div>
  );
}

function SkeletonLine({ width = '100%' }) {
  return (
    <span style={{ display: 'inline-block', width, height: 14, borderRadius: 6, background: 'linear-gradient(90deg, #f0e6da 25%, #ffddb030 50%, #f0e6da 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.4s infinite' }} />
  );
}

