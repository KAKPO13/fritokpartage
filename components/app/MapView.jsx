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

// ─── Couleurs marker par état ─────────────────────────────────────────────
const STATE_COLOR = {
  disponible  : '#1A9640',
  en_location : '#B45309',
  hors_service: '#E53E00',
};
const STATE_LABEL = {
  disponible  : 'Disponible',
  en_location : 'En location',
  hors_service: 'Hors service',
};

// ─────────────────────────────────────────────────────────────────────────────
//  MapView
//  Props :
//    powerBanks     : [{ id, lat, lng, qrCode, state, batteryLevel,
//                        currentPartnerId }]
//    onFetchPartner : async (partnerId) =>
//                       { name, address, emoji, type, stock, active, photos[] }
// ─────────────────────────────────────────────────────────────────────────────
export default function MapView({ powerBanks = [], onFetchPartner }) {
  const mapRef      = useRef(null);
  const leafletRef  = useRef(null);
  const markersRef  = useRef([]);
  const [selected,  setSelected]  = useState(null);
  const [partner,   setPartner]   = useState(null);
  const [loadingPtn,setLoadingPtn]= useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  // ── Init Leaflet ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return;

    (async () => {
      const L = (await import('leaflet')).default;
      await import('leaflet/dist/leaflet.css');
      leafletRef.current = L;

      if (mapRef.current && !mapRef.current._leaflet_id) {
        const map = L.map(mapRef.current, {
          center    : [5.345, -4.024],
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

    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    powerBanks.forEach((pb) => {
      const color = STATE_COLOR[pb.state] ?? D.text3;
      const emoji = pb.partnerEmoji || '⚡';

      const icon = L.divIcon({
        className : '',
        iconSize  : [40, 40],
        iconAnchor: [20, 40],
        html: `
          <div style="
            width:40px;height:40px;border-radius:50% 50% 50% 0;
            background:${color};border:3px solid #fff;
            box-shadow:0 3px 10px rgba(0,0,0,0.28);
            display:flex;align-items:center;justify-content:center;
            font-size:16px;transform:rotate(-45deg);
          ">
            <span style="transform:rotate(45deg)">${
              pb.state === 'hors_service' ? '🚫' : emoji
            }</span>
          </div>`,
      });

      const marker = L.marker([pb.lat, pb.lng], { icon }).addTo(map);
      marker.on('click', () => handleMarkerClick(pb));
      markersRef.current.push(marker);
    });

    if (powerBanks.length > 0) {
      const bounds = L.latLngBounds(powerBanks.map(pb => [pb.lat, pb.lng]));
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
    }
  }, [powerBanks]);

  // ── Clic marker ───────────────────────────────────────────────────────────
  const handleMarkerClick = useCallback(async (pb) => {
    setSelected(pb);
    setPartner(null);
    setSheetOpen(true);

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

  const closeSheet = () => {
    setSheetOpen(false);
    setSelected(null);
    setPartner(null);
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={mapRef} style={{ width: '100%', height: '100%' }} />

      {/* Légende */}
      <div style={{
        position  : 'absolute', top: 10, right: 10, zIndex: 500,
        background: '#fff', borderRadius: 12, padding: '8px 12px',
        boxShadow : '0 2px 10px rgba(0,0,0,0.12)', border: `1px solid ${D.border}`,
        fontSize  : 11,
      }}>
        {[
          ['disponible',   '⚡', 'Disponible'],
          ['en_location',  '🔋', 'En location'],
          ['hors_service', '🚫', 'Hors service'],
        ].map(([s, ic, label]) => (
          <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
            <span>{ic}</span>
            <span style={{ fontWeight: 600, color: STATE_COLOR[s] }}>{label}</span>
          </div>
        ))}
      </div>

      {/* Bottom sheet */}
      {sheetOpen && selected && (
        <PartnerSheet
          pb      = {selected}
          partner = {partner}
          loading = {loadingPtn}
          onClose = {closeSheet}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  PartnerSheet
// ─────────────────────────────────────────────────────────────────────────────
function PartnerSheet({ pb, partner, loading, onClose }) {
  const [photoIdx, setPhotoIdx] = useState(0);
  const hasPhotos = partner?.photos?.length > 0;
  const isOpen    = partner?.active !== false;

  return (
    <>
      {/* Overlay */}
      <div onClick={onClose} style={{
        position: 'absolute', inset: 0, zIndex: 600,
        background: 'rgba(0,0,0,0.38)',
      }} />

      {/* Sheet */}
      <div style={{
        position    : 'absolute', bottom: 0, left: 0, right: 0, zIndex: 700,
        background  : '#fff',
        borderRadius: '24px 24px 0 0',
        boxShadow   : '0 -4px 32px rgba(0,0,0,0.18)',
        maxHeight   : '82%',
        overflowY   : 'auto',
        paddingBottom: 36,
      }}>
        {/* Poignée */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 6px' }}>
          <div style={{ width: 40, height: 4, borderRadius: 99, background: D.border }} />
        </div>

        {/* ── Zone photos ── */}
        {loading ? (
          <Shimmer height={200} />
        ) : hasPhotos ? (
          <PhotoGallery
            photos   = {partner.photos}
            photoIdx = {photoIdx}
            setIdx   = {setPhotoIdx}
          />
        ) : (
          <NoPhoto />
        )}

        {/* ── Infos partenaire ── */}
        <div style={{ padding: '16px 20px 0' }}>

          {/* Ligne nom + badge ouvert/fermé */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 19, fontWeight: 800, color: D.text1, lineHeight: 1.2 }}>
                {loading
                  ? <SkeletonLine width="55%" />
                  : (partner?.name ?? 'Partenaire Fritok')
                }
              </div>
            </div>
            {!loading && partner && (
              <div style={{
                flexShrink  : 0, marginLeft: 10,
                padding     : '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700,
                background  : isOpen ? D.greenLight : '#FEE2E2',
                color       : isOpen ? D.green : D.red,
              }}>
                {isOpen ? '● Ouvert' : '● Fermé'}
              </div>
            )}
          </div>

          {/* Emoji + type + stock */}
          {!loading && partner && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              {partner.emoji && (
                <span style={{ fontSize: 26 }}>{partner.emoji}</span>
              )}
              <div>
                {partner.type && (
                  <div style={{
                    fontSize: 12, fontWeight: 700, color: D.text2,
                    textTransform: 'capitalize',
                  }}>
                    {partner.type}
                  </div>
                )}
                {partner.stock != null && (
                  <div style={{ fontSize: 11, color: D.text3, marginTop: 1 }}>
                    {partner.stock} power bank{partner.stock > 1 ? 's' : ''} en stock
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Adresse */}
          {(loading || partner?.address) && (
            <div style={{ fontSize: 12, color: D.text2, marginBottom: 14 }}>
              {loading
                ? <SkeletonLine width="45%" />
                : `📍 ${partner.address}`
              }
            </div>
          )}

          {/* Badge état power bank */}
          <div style={{ marginBottom: 14 }}>
            <div style={{
              display    : 'inline-flex', alignItems: 'center', gap: 6,
              padding    : '5px 14px', borderRadius: 99, fontSize: 12, fontWeight: 700,
              background : pb.state === 'disponible' ? D.greenLight
                         : pb.state === 'hors_service' ? '#FEE2E2'
                         : D.amberLight,
              color      : STATE_COLOR[pb.state] ?? D.text2,
            }}>
              <span>
                {pb.state === 'disponible' ? '⚡'
                 : pb.state === 'hors_service' ? '🚫' : '🔋'}
              </span>
              {STATE_LABEL[pb.state] ?? pb.state}
            </div>
          </div>

          {/* Fiche power bank */}
          <div style={{
            background  : D.bg, borderRadius: 14,
            border      : `1px solid ${D.border}`,
            padding     : '14px 16px', marginBottom: 14,
          }}>
            <div style={{
              fontSize: 10, color: D.text3, letterSpacing: 1.4,
              fontWeight: 700, marginBottom: 10,
            }}>POWER BANK</div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: D.text1, letterSpacing: 0.5 }}>
                {pb.qrCode || pb.id}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 20 }}>{batteryIcon(pb.batteryLevel)}</span>
                <span style={{ fontSize: 14, fontWeight: 800, color: batteryColor(pb.batteryLevel) }}>
                  {pb.batteryLevel != null ? `${pb.batteryLevel}%` : '–'}
                </span>
              </div>
            </div>

            {pb.batteryLevel != null && (
              <div style={{
                height: 5, background: '#F0E6DA',
                borderRadius: 99, marginTop: 10, overflow: 'hidden',
              }}>
                <div style={{
                  height: '100%', width: `${pb.batteryLevel}%`,
                  background: batteryColor(pb.batteryLevel),
                  borderRadius: 99, transition: 'width 0.5s ease',
                }} />
              </div>
            )}
          </div>

          {/* Tarifs */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <TarifChip label="Frais de location" value="100 FCFA" />
            <TarifChip label="Caution (remb.)"   value="200 FCFA" amber />
          </div>
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Sous-composants
// ─────────────────────────────────────────────────────────────────────────────
function PhotoGallery({ photos, photoIdx, setIdx }) {
  return (
    <div>
      {/* Grande photo */}
      <div style={{ position: 'relative', height: 210, background: '#111', overflow: 'hidden' }}>
        <img
          key       = {photoIdx}
          src       = {photos[photoIdx]}
          alt       = {`Photo ${photoIdx + 1}`}
          style     = {{ width: '100%', height: '100%', objectFit: 'cover' }}
          onError   = {(e) => { e.target.style.display = 'none'; }}
        />
        {/* Gradient */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: 64,
          background: 'linear-gradient(transparent, rgba(0,0,0,0.55))',
        }} />
        {/* Compteur */}
        <div style={{
          position  : 'absolute', bottom: 10, right: 12,
          background: 'rgba(0,0,0,0.55)', borderRadius: 99,
          padding   : '2px 10px', fontSize: 11, color: '#fff', fontWeight: 700,
        }}>
          {photoIdx + 1} / {photos.length}
        </div>
        {/* Flèches si > 1 photo */}
        {photos.length > 1 && (
          <>
            {photoIdx > 0 && (
              <button onClick={() => setIdx(i => i - 1)} style={arrowBtn('left')}>‹</button>
            )}
            {photoIdx < photos.length - 1 && (
              <button onClick={() => setIdx(i => i + 1)} style={arrowBtn('right')}>›</button>
            )}
          </>
        )}
      </div>

      {/* Thumbnails */}
      {photos.length > 1 && (
        <div style={{ display: 'flex', gap: 6, padding: '8px 16px 2px' }}>
          {photos.map((url, i) => (
            <button
              key     = {i}
              onClick = {() => setIdx(i)}
              style   = {{
                width        : 58, height: 58, flexShrink: 0,
                borderRadius : 10, overflow: 'hidden',
                padding      : 0, border: 'none', cursor: 'pointer',
                outline      : `2.5px solid ${i === photoIdx ? '#FF6B00' : 'transparent'}`,
                outlineOffset: 2,
                transition   : 'outline 0.15s',
              }}
            >
              <img
                src     = {url}
                alt     = {`Miniature ${i + 1}`}
                style   = {{ width: '100%', height: '100%', objectFit: 'cover' }}
                onError = {(e) => { e.target.parentElement.style.display = 'none'; }}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function NoPhoto() {
  return (
    <div style={{
      height        : 100,
      display       : 'flex', alignItems: 'center', justifyContent: 'center',
      flexDirection : 'column', gap: 6,
      color         : '#BF9060', fontSize: 12,
      background    : '#FFF8EE',
    }}>
      <span style={{ fontSize: 34 }}>🏪</span>
      Aucune photo disponible
    </div>
  );
}

function TarifChip({ label, value, amber }) {
  return (
    <div style={{
      background  : amber ? '#FEF3C7' : '#FFEDD5',
      borderRadius: 10, padding: '10px 14px',
    }}>
      <div style={{ fontSize: 10, color: amber ? '#B45309' : '#BF9060', fontWeight: 700, marginBottom: 3 }}>
        {label}
      </div>
      <div style={{ fontSize: 15, fontWeight: 800, color: amber ? '#B45309' : '#FF6B00' }}>
        {value}
      </div>
    </div>
  );
}

function Shimmer({ height = 200 }) {
  return (
    <div style={{
      height,
      background    : 'linear-gradient(90deg, #f0e6da 25%, #fff3e8 50%, #f0e6da 75%)',
      backgroundSize: '200% 100%',
      animation     : 'ftshimmer 1.4s infinite',
    }}>
      <style>{`@keyframes ftshimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
    </div>
  );
}

function SkeletonLine({ width = '100%' }) {
  return (
    <span style={{
      display       : 'inline-block', width, height: 15, borderRadius: 6,
      background    : 'linear-gradient(90deg, #f0e6da 25%, #fff3e8 50%, #f0e6da 75%)',
      backgroundSize: '200% 100%',
      animation     : 'ftshimmer 1.4s infinite',
    }} />
  );
}

const arrowBtn = (side) => ({
  position  : 'absolute', top: '50%', transform: 'translateY(-50%)',
  [side]    : 10,
  background: 'rgba(0,0,0,0.45)', color: '#fff',
  border    : 'none', borderRadius: '50%',
  width: 32, height: 32, cursor: 'pointer',
  fontSize: 20, fontWeight: 700,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  zIndex: 5,
});


